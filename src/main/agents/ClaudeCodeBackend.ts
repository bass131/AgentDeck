/**
 * ClaudeCodeBackend.ts — Claude Agent SDK 어댑터 (Phase 21b ADR-016 · Phase 24c 권한 · Phase 24d 질문)
 *
 * AgentBackend 구현: @anthropic-ai/claude-agent-sdk query() 사용.
 * SDK가 yield하는 SDKMessage → mapClaudeStreamLine → AgentEvent push-queue.
 *
 * 핵심 책임: 엔진 고유 출력(SDK SDKMessage) → 공통 AgentEvent 정규화.
 * raw SDK 출력을 외부로 누수하지 않는다.
 *
 * 엔진 분기는 registry.ts에서만 수행한다.
 * 이 클래스를 직접 import하는 곳은 registry.ts 하나뿐이어야 한다.
 *
 * API 키: 환경변수(ANTHROPIC_API_KEY)에서 SDK가 자동 처리.
 *          코드·로그에 평문 노출 절대 금지.
 *
 * ── Phase 24d: AskUserQuestion 질문카드 흐름 ─────────────────────────────────────
 *
 * AskUserQuestion 분기 (canUseTool):
 *   mode에 무관하게 항상 사용자 입력 요청 (원본 engine.ts 동작 미러).
 *   handleAskQuestion: questions = parseQuestions(input) → 빈 배열이면 즉시 allow.
 *   비면 question_request를 push하고 respond()를 await.
 *   answers를 formatAnswers로 포매팅 → deny+message로 모델에 전달.
 *
 * _waiters 통합:
 *   permission(24c)과 question(24d)이 동일 Map<string, (r:RunResponse)=>void>에서 관리.
 *   respond()는 kind 구분 없이 requestId로 waiter를 깨운다.
 *   canUseTool 측에서 kind를 narrowing해 permission/question 경로를 처리.
 *
 * abort 보강:
 *   미해결 _waiters(permission + question 모두)를 전부 취소 resolve.
 *   permission → {kind:'permission', behavior:'deny'}
 *   question   → {kind:'question', answers:null}
 *
 * ── Phase 24c: 양방향 권한 흐름 + push-queue 리팩터 ──────────────────────────────
 *
 * 왜 push-queue로 바꿨나(데드락 회피):
 *   기존 events는 pull 제너레이터였다. 소비처(agent-runs.ts)가 `for await`로 당기고,
 *   내부 `for await (msg of queryIterable)`가 SDK를 당겼다. canUseTool이 사용자 응답을
 *   await하면 SDK query는 그 도구 메시지에서 멈추고 → 내부 `for await`도 suspend →
 *   permission_request를 yield할 길이 막힌다 = 데드락.
 *   해결: 펌프(생산자)와 events(소비자)를 push-queue(채널)로 분리한다. 펌프는 canUseTool
 *   콜백 안에서 직접 큐에 permission_request를 push할 수 있고, 소비처는 그 사이에도
 *   events에서 그 이벤트를 받아 UI에 띄울 수 있다. canUseTool은 respond()가 올 때까지
 *   await하지만, 큐는 막히지 않는다.
 *
 * push-queue 구조:
 *   _queue: AgentEvent[]            — 적재 버퍼
 *   _resolveNext: (()=>void)|null   — events가 빈 큐에서 대기 중일 때의 wake 콜백
 *   _closed: boolean                — 펌프 종료 플래그
 *   _waiters: Map<requestId, (d)=>void> — canUseTool이 await 중인 권한 응답 resolver
 *   _permCounter: number            — requestId 발급 카운터
 *
 * 펌프 시작 시점:
 *   첫 events 접근(_createEventStream의 첫 next) 시 시작한다. "consume 전 abort 시
 *   무이벤트"라는 기존 동작을 보존하기 위해, abort가 events 소비 전에 오면 펌프를
 *   돌리지 않고 곧장 close된 큐를 drain(=무이벤트 종료)한다.
 *
 * abort 보장(G3 좀비 hang 방지):
 *   abort() = abortController.abort() + interrupt() + 미해결 _waiters 전부 deny resolve
 *   후 clear + close(). 권한 카드가 떠 있는 채로 abort해도 canUseTool await가 풀린다.
 *
 * canUseTool 발화 전제(settings 핀):
 *   sdkOptions.settings.permissions.defaultMode + settingSources:['user','project','local']가
 *   있어야 사용자 전역설정이 canUseTool 전에 선승인하지 못한다. (원본 engine.ts L291~313 미러)
 *
 * 설계 (ADR-016, 결정 #1~#9):
 * - CLI spawn/taskkill 제거 → SDK query() 사용.
 * - lazy query injection (결정 #8): 생성자에서 queryFn 주입 가능.
 * - isAvailable: SDK 하드 의존성 → true (결정 #7).
 * - version: SDK 패키지 버전 문자열 (결정 #7).
 *
 * 엔진 출력 → AgentEvent 매핑 표:
 * ┌──────────────────────────────────────┬───────────────────────────────────┐
 * │ SDK SDKMessage / canUseTool           │ AgentEvent                        │
 * ├──────────────────────────────────────┼───────────────────────────────────┤
 * │ type:"assistant" content[text]       │ { type:"text", delta }            │
 * │ type:"assistant" content[tool_use]   │ { type:"tool_call", id,name,input}│
 * │ type:"user" content[tool_result]     │ { type:"tool_result", id,ok,output│
 * │ type:"result" is_error=false         │ { type:"done", usage?, contextWin │
 * │ type:"result" is_error=true          │ { type:"error", message }+{done}  │
 * │ canUseTool(부수효과 도구, 발화)        │ { type:"permission_request",      │
 * │                                      │    requestId,toolName,summary }   │
 * │ canUseTool(AskUserQuestion, 발화)     │ { type:"question_request",        │
 * │                                      │    requestId,questions }          │
 * │ type:"system" (init)                 │ [] (무시, session_id 내부 캡처)   │
 * │ type:"stream_event"                  │ content_block_delta text_delta →  │
 * │   content_block_delta text_delta     │   { type:"text", delta }          │
 * │   content_block_start → _curTextId=0 │ 기타 서브타입 → [] (무시)          │
 * │ 기타 SDKMessage 타입                  │ [] (forward-compatible)           │
 * └──────────────────────────────────────┴───────────────────────────────────┘
 */

import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, isAbsolute, relative, sep } from 'node:path'
import { mapClaudeStreamLine } from './claude-stream'
import { buildQueryOptions } from './run-args'
import { createSkillsStore } from '../settings/skills'
import { createMcpStore } from '../settings/mcp'
import { computeDiff } from '../fs/diff'
import type { AgentBackend, AgentRun, AgentRunInput, RunResponse } from './AgentBackend'
import type { AgentEvent, AgentQuestion } from '../../shared/agent-events'
import type { DiffLine } from '../../shared/diff-types'
import type { SlashCommandInfo } from '../../shared/ipc-contract'

/**
 * diff 계산 대상 파일 최대 크기 (바이트).
 * 이 크기를 초과하면 diff 생략(path/change만 emit) — LCS 성능 보호.
 * 512KB = 524288 바이트.
 */
const MAX_DIFF_BYTES = 524288

// ── model-fallback 헬퍼 (원본 engine.ts L806-823 이식) ────────────────────────

/**
 * 모델 ID → 표시 이름 변환.
 * 'claude-fable-5' → 'Fable 5', 'claude-opus-4-8' → 'Opus 4.8'.
 * 빈 문자열 또는 패턴 불일치 시 '다른 모델' 폴백(graceful degrade, 권고1).
 * 신뢰경계: 모델명 string만 처리, raw payload 미노출.
 * (원본 engine.ts L807-812 미러)
 */
function modelDisplay(id: unknown): string {
  const s = typeof id === 'string' ? id : ''
  const m = /claude-(fable|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?\b/i.exec(s)
  if (!m) return s || '다른 모델'
  return m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + ' ' + m[2] + (m[3] ? '.' + m[3] : '')
}

/**
 * stop_details.category 코드 → 한국어 라벨.
 * 모르는 값은 코드 그대로(open string — 새 분류가 스키마보다 먼저 생길 수 있음).
 * (원본 engine.ts L814-816 미러)
 */
const REFUSAL_CATEGORY_LABEL: Record<string, string> = {
  cyber: '사이버 보안',
  bio: '생물학',
}

/**
 * 폴백 경고 배너 텍스트 생성.
 * from/to/category → 한국어 문구.
 * category 없으면(빈 문자열/null/undefined) 분류 괄호 생략.
 * (원본 engine.ts L818-823 미러)
 *
 * 신뢰경계: from/to/category string만 사용, raw payload 객체 미전달.
 */
function fallbackNotice(from: unknown, to: unknown, category: unknown): string {
  const f = modelDisplay(from)
  const t = modelDisplay(to)
  const c = typeof category === 'string' && category
    ? ` (감지 분류: ${REFUSAL_CATEGORY_LABEL[category] ?? category})`
    : ''
  return `${f}의 안전 정책이 이 요청에 대한 응답을 거부해 ${t} 모델로 자동 전환했어요${c}. 이후 대화도 ${t} 모델로 진행됩니다.`
}

// ── SDK 버전 상수 ─────────────────────────────────────────────────────────────

/**
 * SDK 패키지 버전 폴백 상수.
 * version()이 런타임 package.json 읽기에 실패했을 때 반환한다.
 * 삭제 금지 — graceful fallback 보존.
 */
const SDK_VERSION = '0.3.186'

/**
 * npm registry URL — ClaudeCodeBackend 내부에만 격리(ADR-003).
 * 인터페이스/타 도메인/renderer에 절대 노출하지 않는다.
 */
const NPM_REGISTRY_URL = 'https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk'

/**
 * 오케스트레이션 모드 시스템 가이드 (Phase 37 #4a).
 *
 * orchestration=true일 때 systemPrompt.append에 합성된다.
 * 모델에게 복잡/병렬화 가능한 작업에서 Workflow 도구로 서브에이전트를 오케스트레이션할
 * 수 있음을 안내한다. 각 Workflow 호출은 사용자 승인이 필요하다.
 *
 * CRITICAL(ADR-003): 이 상수는 ClaudeCodeBackend 내부에만. 인터페이스·IPC·renderer에 누출 금지.
 * 테스트가 이 export를 import해 append 포함 여부를 단정한다.
 */
export const ORCHESTRATION_SYSTEM_GUIDE =
  'You can orchestrate multiple sub-agents using the Workflow tool for complex or parallelizable tasks ' +
  '(such as large-scale audits, migrations, or comprehensive reviews). ' +
  'Each Workflow invocation requires explicit user approval before execution. ' +
  'Use sub-agent orchestration when tasks benefit from parallel execution or specialized delegation.'

/**
 * 설치된 SDK의 실 버전을 package.json에서 읽는다(폴백 없음 — 성공=버전, 실패=null).
 *
 * ⚠️ exports 제약 회피: `@anthropic-ai/claude-agent-sdk`의 package.json `exports`에는
 * './package.json' 서브패스가 없어 `require('@anthropic-ai/claude-agent-sdk/package.json')`은
 * `ERR_PACKAGE_PATH_NOT_EXPORTED`로 throw한다(라이브 검증으로 발견). 그래서 **메인 엔트리만
 * resolve**(exports에 노출됨)한 뒤, 그 디렉토리에서 위로 올라가며 package.json을 직접 fs로
 * 읽어 name이 일치하는 패키지 루트를 찾는다. fs 직접 읽기는 exports 제약을 받지 않는다.
 *
 * 신뢰경계: 버전 문자열만 반환 — 시크릿 0.
 */
export function readInstalledSdkVersion(): string | null {
  try {
    const require = createRequire(import.meta.url)
    // 메인 엔트리는 exports에 노출 → resolve 가능. 거기서 패키지 루트로 거슬러 올라간다.
    let dir = dirname(require.resolve('@anthropic-ai/claude-agent-sdk'))
    for (let i = 0; i < 8; i++) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
        if (pkg?.name === '@anthropic-ai/claude-agent-sdk') {
          const ver: unknown = pkg.version
          return typeof ver === 'string' && ver.length > 0 ? ver : null
        }
      } catch {
        /* 이 디렉토리에 package.json 없음/불일치 → 상위로 */
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return null
  } catch {
    return null
  }
}

// ── 권한 도구 분류 (원본 engine.ts L108~112 미러) ──────────────────────────────

/**
 * 읽기 전용 도구 — 부수효과 없음 → 항상 자동 허용.
 * Task/Agent/Todo* 계열도 모델의 작업 분해/계획 도구라 안전.
 */
const READONLY_TOOLS = new Set([
  'Read', 'Grep', 'Glob', 'NotebookRead', 'WebFetch', 'WebSearch', 'TodoWrite', 'Task', 'Agent',
  'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TaskStop', 'TaskOutput'
])

/**
 * 부수효과 도구 — 파일/셸 변경. acceptEdits 모드에서도 Bash/Mutating은 발화 대상.
 */
const MUTATING_TOOLS = new Set([
  'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'BashOutput', 'KillBash'
])

/**
 * 오케스트레이션 도구군 — disallowedTools(OFF)와 canUseTool 게이트(ON)의 단일 출처.
 *
 * orchestration=false → disallowedTools에 포함(모델이 도구를 볼 수 없음).
 * orchestration=true  → canUseTool 게이트에서 항상 사용자 승인 요청.
 *
 * 향후 'Task' 등 오케스트레이션 도구가 추가될 때 이 배열만 수정하면 된다.
 * (ADR-003: 어댑터 내부 전용 — export 금지)
 */
const ORCHESTRATION_TOOLS = ['Workflow'] as const

// ── 권한/질문 응답 타입 ───────────────────────────────────────────────────────

/**
 * SDK canUseTool 반환 타입(우리가 사용하는 부분만).
 * raw SDK 타입을 직접 import하지 않고 구조만 맞춘다(누수 방지).
 */
type PermissionResult =
  | { behavior: 'allow'; updatedInput: Record<string, unknown>; updatedPermissions?: unknown[] }
  | { behavior: 'deny'; message: string }

// ── parseQuestions / formatAnswers 헬퍼 (원본 engine.ts L880~913 미러) ──────────

/**
 * AskUserQuestion 도구 입력 → AgentQuestion[] 정규화.
 * input.questions 배열을 순회하며 각 항목을 AgentQuestion으로 변환.
 * options가 없거나 빈 항목은 건너뜀(label 없는 옵션 제외).
 * 형식 안 맞으면 빈 배열 반환.
 *
 * (원본 engine.ts parseQuestions L880~901 미러)
 */
function parseQuestions(input: Record<string, unknown>): AgentQuestion[] {
  const raw = Array.isArray(input['questions']) ? input['questions'] : []
  const out: AgentQuestion[] = []
  for (const q of raw) {
    if (!q || typeof q !== 'object') continue
    const o = q as Record<string, unknown>
    const options = (Array.isArray(o['options']) ? o['options'] : [])
      .map((opt) => {
        const r = (opt ?? {}) as Record<string, unknown>
        const desc = r['description'] !== undefined ? String(r['description']) : undefined
        return { label: String(r['label'] ?? ''), ...(desc ? { description: desc } : {}) }
      })
      .filter((opt) => opt.label.length > 0)
    if (!options.length) continue
    const header = o['header'] !== undefined ? String(o['header']) : undefined
    out.push({
      question: String(o['question'] ?? ''),
      ...(header !== undefined ? { header } : {}),
      multiSelect: !!o['multiSelect'],
      options
    })
  }
  return out
}

/**
 * 사용자 답안 배열 → 모델이 읽을 tool-result 메시지 문자열.
 * answers=null이면 건너뜀 안내(기본값으로 진행).
 * answers가 있으면 질문별 선택 항목을 나열.
 *
 * (원본 engine.ts formatAnswers L905~913 미러)
 */
function formatAnswers(questions: AgentQuestion[], answers: string[][] | null): string {
  if (!answers) {
    return '사용자가 질문에 답하지 않고 건너뛰었습니다. 합리적인 기본값으로 계속 진행하세요.'
  }
  const lines = questions.map((q, i) => {
    const picked = (answers[i] ?? []).filter(Boolean)
    const label = q.header || q.question || `질문 ${i + 1}`
    return `- ${label}: ${picked.length ? picked.join(', ') : '(선택 없음)'}`
  })
  return `사용자가 질문에 다음과 같이 답했습니다:\n${lines.join('\n')}\n\n이 선택을 반영해 계속 진행하세요. (같은 내용을 다시 묻지 마세요.)`
}

// ── QueryFn 타입 ──────────────────────────────────────────────────────────────

/**
 * query() 함수 시그니처.
 * 실 SDK와 mock 모두 이 타입을 만족한다.
 * options는 unknown으로 열어두어 실 SDK Options 타입과 mock 양쪽 호환.
 */
export type QueryFn = (params: {
  prompt: string
  options?: unknown
}) => AsyncIterable<unknown> & { interrupt?: () => Promise<void> }

// ── 기본 queryFn (lazy dynamic import) ───────────────────────────────────────

/**
 * 기본 queryFn: @anthropic-ai/claude-agent-sdk를 lazy하게 import하여 query를 반환.
 * 모듈 top-level import가 아닌 lazy import → mock 테스트 시 실 SDK를 평가하지 않음.
 * (결정 #8)
 */
async function getDefaultQueryFn(): Promise<QueryFn> {
  // 활성 설치 버전 우선(인-앱 업데이트, ADR-018). 실패/미설정 → 번들 SDK 폴백.
  // ADR-003: engine-versions를 단방향 import만 — 역방향(engine-versions→ClaudeCodeBackend) 금지.
  // CRITICAL: throw 전파 금지 — 모든 실패는 번들 폴백으로 흡수.
  try {
    const { loadActiveQuery } = await import('../engine-versions')
    const active = await loadActiveQuery()
    if (active) return active as unknown as QueryFn
  } catch {
    /* engine-versions 로드 실패 또는 loadActiveQuery 실패 → 번들 폴백 */
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk = await import('@anthropic-ai/claude-agent-sdk') as any
  return sdk.query as QueryFn
}

// ── permissionSummary 헬퍼 (원본 engine.ts L915~920 미러) ──────────────────────

/**
 * 여러 줄/긴 문자열을 1줄·max자 cap으로 정규화 (claude-stream의 oneLine과 동일 규약).
 */
function oneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

/**
 * 도구 + 입력 → 사용자에게 보여줄 권한 요약 1줄.
 * raw input을 그대로 노출하지 않고 도구별로 핵심 1줄만 추출(누수 최소화).
 */
function permissionSummary(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'Bash') return `명령 실행: ${oneLine(String(input['command'] ?? ''), 80)}`
  if (toolName === 'Write') return `파일 생성: ${String(input['file_path'] ?? '')}`
  if (toolName === 'Edit' || toolName === 'MultiEdit') return `파일 편집: ${String(input['file_path'] ?? '')}`
  return `${toolName} 실행`
}

// ── 런 간 고유 태그 생성기 (모듈레벨) ──────────────────────────────────────────
//
// 원본 engine.ts L144~153 미러:
//   let blockCounter = 0
//   const LAUNCH_TAG = Math.random().toString(36).slice(2, 8)
//   const nextBlockId = () => `m${LAUNCH_TAG}-${++blockCounter}`
//
// 우리는 각 AgentRun 인스턴스마다 고유 런 태그가 필요하다.
// 이유: 각 run은 새 ClaudeAgentRun 인스턴스라 인스턴스 카운터를 쓰면
//       run2의 messageId가 run1이 thread에 남긴 id와 충돌할 수 있다.
// 해결: 모듈레벨 _runTagSeq가 런마다 1씩 증가 → per-run 고유 태그.
//       인스턴스 내 _blockSeq는 런 내 단조 증가 → (runTag, blockSeq) 쌍 고유.
// 결과: run1: 'ar1-1', 'ar1-2', ...  run2: 'ar2-1', 'ar2-2', ... (충돌 0)
let _runTagSeq = 0

// ── ClaudeAgentRun ─────────────────────────────────────────────────────────────

/**
 * SDK query 실행 핸들 (push-queue 기반).
 * AgentRun 인터페이스 구현.
 *
 * events: 펌프가 push한 AgentEvent를 순서대로 yield하는 async generator.
 * respond(): canUseTool waiter를 깨워 권한 흐름 재개.
 * abort(): abortController.abort() + interrupt() + 미해결 waiter deny + close.
 */
class ClaudeAgentRun implements AgentRun {
  readonly events: AsyncIterable<AgentEvent>

  // ── abort/interrupt 상태 ─────────────────────────────────────────────────
  private _aborted = false
  private _abortController = new AbortController()
  private _queryHandle: { interrupt?: () => Promise<void> } | null = null

  // ── push-queue 상태 ──────────────────────────────────────────────────────
  /** 적재 버퍼: 펌프가 push, events가 drain */
  private _queue: AgentEvent[] = []
  /** events가 빈 큐에서 대기 중일 때 깨우는 콜백(없으면 대기 중 아님) */
  private _resolveNext: (() => void) | null = null
  /** 펌프 종료 플래그(close 후 큐 비면 events return) */
  private _closed = false
  /** 펌프 시작 여부(첫 events 접근 시 1회 시작) */
  private _pumpStarted = false

  // ── waiter 상태 (permission + question 통합) ────────────────────────────
  /**
   * requestId → respond() resolver.
   * permission(24c)과 question(24d) 모두 동일 맵에서 관리.
   * RunResponse를 직접 받아 canUseTool 측이 kind로 narrowing.
   */
  private _waiters = new Map<string, (response: RunResponse) => void>()
  /** requestId 발급 카운터 (perm-N / ask-N 공유) */
  private _permCounter = 0

  // ── model-fallback dedup 카운터 (Phase 32) ────────────────────────────────
  /**
   * dialog 경로(onUserDialog)에서 이미 emit한 폴백 배너 수.
   * 같은 폴백에 대해 system 경로(model_refusal_fallback)도 fire되면
   * 이 카운터가 > 0이면 감소만 하고 emit 생략(dedup).
   * 원본 engine.ts L272 pendingFallbackNotices 미러.
   * run당 인스턴스 필드(this 공유: onUserDialog 화살표·_runPump 루프).
   */
  private _pendingFallbackNotices = 0

  // ── file-change pending-map (F2 fix) ─────────────────────────────────────
  /**
   * tool_use id → {path, change} の pending 기록.
   *
   * 설계(원본 engine.ts L643~667 pending, L708~711 emit 미러):
   *  - assistant content의 tool_use(Write/Edit/MultiEdit/NotebookEdit) 시점에 기록.
   *  - user content의 tool_result에서:
   *      ok=true(성공) → file_changed push + pending 제거
   *      ok=false(실패) → pending 제거만(emit 없음 — 유령 마커 0)
   *  - run 종료/abort 시 pending clear(누수 0).
   *
   * 순수성 보존: mapClaudeStreamLine은 무상태 유지.
   * 이 맵은 ClaudeAgentRun(stateful run) 내부에만 존재한다.
   * ADR-003: 엔진 고유 처리 → ClaudeCodeBackend 내부에만 격리.
   */
  private _pendingFileChanges = new Map<string, { path: string; change: 'add' | 'modify'; baseline: string; absPath: string }>()

  // ── Task* stateful 누적 (F1 fix) ─────────────────────────────────────────
  /**
   * 할 일 패널 TaskCreate/TaskUpdate/TaskList 누적 맵.
   *
   * 설계(원본 engine.ts L176~180, L603~628 미러):
   *  - TaskCreate: input.subject || input.description → ++_taskSeq로 id 발급 → taskMap.set.
   *  - TaskUpdate: input.taskId로 조회, status==='deleted'면 삭제, 아니면 status/subject 갱신.
   *  - TaskList: 변경 없이 현재 taskMap re-emit.
   *  - 매 변경 끝에 todos 이벤트 push.
   *
   * TASK_TOOLS(TaskCreate/TaskUpdate/TaskList)에 해당하는 tool_call은 events에 push하지 않음
   * (도구 로그 제외 — 원본 engine.ts TASK_TOOLS Set 미러).
   * 해당 id의 tool_result도 suppress(고아 결과 방지).
   *
   * 순수성 보존: mapClaudeStreamLine은 무상태 유지.
   * 누적 상태는 ClaudeAgentRun(stateful run) 내부에만 존재.
   * ADR-003: 엔진 고유 처리 → ClaudeCodeBackend 내부에만 격리.
   * shared 변경 불필요: AgentEventTodos/TodoItem은 기존 타입 그대로 사용.
   */
  private _taskMap = new Map<string, { id: string; label: string; status: 'planned' | 'running' | 'done' }>()
  /** 순서 기반 id 발급 카운터 (원본 engine.ts taskSeq 미러) */
  private _taskSeq = 0
  /**
   * Task* tool_use id 집합 — 해당 id의 tool_result도 suppress(고아 결과 방지).
   * tool_call 가로채기 시 등록, run 종료/abort 시 clear.
   */
  private _taskToolIds = new Set<string>()

  // ── messageId 블록 경계 추적 (Phase A-1) ─────────────────────────────────────
  //
  // 원본 engine.ts L153 nextBlockId + L424 curTextId ??= nextBlockId() + L486 curTextId=null 미러.
  //
  // 설계:
  //  - _launchTag: 이 런 인스턴스에 고유한 태그 (모듈레벨 _runTagSeq로 생성).
  //    런 간 충돌 0 보장. "ar1-", "ar2-" 형식.
  //  - _blockSeq: 런 내 단조 증가 카운터. 블록마다 1씩 증가.
  //  - _curTextId: 현재 열린 텍스트 블록 id. null이면 다음 text에서 새 id 발급.
  //    tool_call(실 도구) 또는 SDK 메시지 경계에서 null로 리셋.
  //    Task*(suppress 도구)·subagent 이벤트에서는 리셋 안 함(텍스트 연속 유지).
  //
  // 순수성 보존: mapClaudeStreamLine에는 이 상태가 없다.
  // ADR-003: ClaudeCodeBackend(Claude 어댑터) 내부에만 격리.
  /**
   * 이 런 인스턴스의 고유 런 태그. 모듈레벨 _runTagSeq에서 생성.
   * 런 간 messageId 충돌을 방지한다.
   */
  private readonly _launchTag: string = 'r' + (++_runTagSeq)
  /** 런 내 텍스트 블록 카운터. _nextBlockId()가 호출될 때마다 1 증가. */
  private _blockSeq = 0
  /**
   * 현재 열린 텍스트 블록 id. null이면 다음 text 이벤트에서 _nextBlockId()로 새 id 발급.
   * 초기값 null — 첫 text 이벤트에서 새 id 발급.
   * 리셋 조건: 실 tool_call 이벤트(Task* 제외), SDK assistant 메시지 경계, content_block_start.
   */
  private _curTextId: string | null = null

  /**
   * 현재 run에서 stream_event 텍스트 델타가 수신됐는가.
   * true이면 이후 오는 full 텍스트 블록을 suppress(중복 버블 방지).
   * false이면 full 텍스트를 정상 emit(Phase A 폴백).
   *
   * 초기화(B2 CRITICAL): 필드 기본값 false + run 루프 진입 전 명시 리셋 + finally 리셋.
   * 셋 다 — 인스턴스 재사용/abort 재run 시 stale true가 첫 full 텍스트 오suppress 방지.
   *
   * (원본 engine.ts L488 streamedThisMsg 미러)
   */
  private _streamedThisMsg = false

  private readonly _req: AgentRunInput
  private readonly _queryFn: QueryFn | null
  private readonly _skillOverridesProvider: () => Record<string, 'off'> | null
  private readonly _mcpDeniedProvider: () => { serverName: string }[] | null
  /**
   * 캡처된 슬래시 커맨드를 백엔드 캐시에 기록하는 콜백 (ADR-019).
   * ClaudeCodeBackend.start()가 wsKey별로 주입한다.
   * null이면 캡처 비활성(테스트 격리 또는 캐시 미제공 상황).
   */
  private readonly _onCommandsCaptured: ((cmds: SlashCommandInfo[]) => void) | null

  constructor(
    req: AgentRunInput,
    queryFn: QueryFn | null,
    skillOverridesProvider: () => Record<string, 'off'> | null,
    mcpDeniedProvider: () => { serverName: string }[] | null,
    onCommandsCaptured: ((cmds: SlashCommandInfo[]) => void) | null = null
  ) {
    this._req = req
    this._queryFn = queryFn
    this._skillOverridesProvider = skillOverridesProvider
    this._mcpDeniedProvider = mcpDeniedProvider
    this._onCommandsCaptured = onCommandsCaptured
    this.events = this._createEventStream()
  }

  // ── messageId 생성기 (Phase A-1) ─────────────────────────────────────────────

  /**
   * 새 텍스트 블록 id를 발급한다.
   *
   * 형식: 'a' + launchTag + '-' + blockSeq
   *   예) run1: 'ar1-1', 'ar1-2', ...  run2: 'ar2-1', 'ar2-2', ...
   *
   * 특성:
   *  (a) 런 내 결정적 — 같은 run에서 같은 블록은 항상 같은 id.
   *  (b) 런 간 고유 — _launchTag가 런마다 다르므로 충돌 0.
   *  (c) 순수성 보존 — mapClaudeStreamLine에 state 없음.
   *
   * 원본 engine.ts:153 `nextBlockId = () => \`m\${LAUNCH_TAG}-\${++blockCounter}\`` 미러.
   * 원본은 호출부(engine.ts:424 `curTextId = \`a\${nextBlockId()}\``)에서 'a' prefix를
   * 다시 래핑하는데, 우리는 그 'a' prefix를 이 생성기에 흡수해 1단계로 합쳤다
   * (그래서 결과는 'ar1-1' — 'a' + 'r1' + '-1'). 원본의 'm' prefix가 아님.
   * 원본은 모듈레벨 blockCounter가 앱 전체 런에 걸쳐 누적됨.
   * 우리는 per-run launchTag로 런 간 충돌을 회피하므로 blockSeq는 런 내 리셋 가능.
   */
  private _nextBlockId(): string {
    return 'a' + this._launchTag + '-' + (++this._blockSeq)
  }

  // ── 공개 API ────────────────────────────────────────────────────────────

  abort(): void {
    // 멱등: 이미 abort됐으면 무시
    if (this._aborted) return
    this._aborted = true

    // AbortController 신호 (SDK 스트림/도구 중단)
    this._abortController.abort()

    // SDK query.interrupt() best-effort (결정 #6)
    if (this._queryHandle?.interrupt) {
      try {
        void this._queryHandle.interrupt()
      } catch {
        // best-effort: 실패해도 좀비 없음 (SDK가 AbortController로 정리)
      }
    }

    // G3: 미해결 waiter를 전부 취소 resolve → canUseTool await가 매달리지 않음.
    // permission → deny, question → answers:null (원본 engine.ts cancel() 미러).
    // 각 waiter가 어떤 kind인지 맵에 별도 저장하지 않으므로,
    // requestId prefix로 구분: 'ask-'이면 question, 그 외(perm-)이면 permission.
    for (const [requestId, resolve] of this._waiters) {
      if (requestId.startsWith('ask-')) {
        resolve({ kind: 'question', answers: null })
      } else {
        resolve({ kind: 'permission', behavior: 'deny' })
      }
    }
    this._waiters.clear()

    // model-fallback 카운터 리셋 (abort 시 클린업)
    this._pendingFallbackNotices = 0

    // pending file-change 정리 (누수 0 — abort 중 미해결 pending 제거)
    this._pendingFileChanges.clear()

    // Task* 상태 정리 (누수 0 — abort 중 미해결 taskMap/id set 제거)
    this._taskMap.clear()
    this._taskToolIds.clear()

    // 큐 close → events가 남은 이벤트 drain 후 종료 (hang 없음)
    this._close()
  }

  respond(requestId: string, response: RunResponse): void {
    const resolve = this._waiters.get(requestId)
    // 미존재 requestId(이미 응답/abort/오타) → no-op. 멱등.
    if (!resolve) return
    this._waiters.delete(requestId)
    // RunResponse를 그대로 전달. canUseTool 측에서 kind로 narrowing.
    resolve(response)
  }

  // ── push-queue 내부 ───────────────────────────────────────────────────────

  /** 이벤트 적재 + 대기 중인 events를 깨운다. */
  private _push(event: AgentEvent): void {
    this._queue.push(event)
    this._wake()
  }

  /** 펌프 종료 표시 + 대기 중인 events를 깨운다(빈 큐면 return하도록). */
  private _close(): void {
    if (this._closed) return
    this._closed = true
    this._wake()
  }

  /** events가 빈 큐에서 대기 중이면 깨운다. */
  private _wake(): void {
    if (this._resolveNext) {
      const r = this._resolveNext
      this._resolveNext = null
      r()
    }
  }

  /**
   * events 스트림: 큐를 순서대로 yield → close되고 큐 비면 return → 아니면 push까지 await.
   *
   * 소비처(for await)·이벤트 순서·done/error 종료는 기존과 동일하다(외부 계약 불변).
   */
  private async *_createEventStream(): AsyncGenerator<AgentEvent> {
    // "consume 전 abort 시 무이벤트" 보존: 첫 next 시점에 펌프 시작.
    // 이미 abort됐으면 펌프를 돌리지 않고 곧장 종료.
    if (!this._pumpStarted) {
      this._pumpStarted = true
      if (!this._aborted) {
        // 펌프는 백그라운드로 돌린다(await하지 않음). 펌프가 push/close로 큐를 채운다.
        void this._runPump()
      } else {
        this._close()
      }
    }

    for (;;) {
      // 큐에 쌓인 이벤트를 전부 drain
      while (this._queue.length > 0) {
        yield this._queue.shift()!
      }
      // 큐가 비었고 close됐으면 종료
      if (this._closed) return
      // 아니면 다음 push/close까지 대기
      await new Promise<void>((resolve) => {
        this._resolveNext = resolve
      })
    }
  }

  // ── 펌프(생산자) ──────────────────────────────────────────────────────────

  /**
   * SDK query를 돌려 SDKMessage를 AgentEvent로 정규화해 큐에 push한다.
   * canUseTool은 부수효과 도구에 대해 permission_request를 push하고 respond를 await한다.
   *
   * 항상 finally에서 close()하여 events가 종료되게 한다.
   */
  private async _runPump(): Promise<void> {
    try {
      // 마지막 user 메시지를 프롬프트로 사용
      const lastUserMsg = this._req.messages
        .filter(m => m.role === 'user')
        .at(-1)

      if (!lastUserMsg) {
        this._push({ type: 'error', message: 'No user message found in AgentRunInput.messages' })
        this._push({ type: 'done' })
        return
      }

      const prompt = lastUserMsg.content

      if (this._aborted) return

      // queryFn 해석: 주입된 경우 사용, 아니면 lazy import
      let resolvedQueryFn: QueryFn
      try {
        if (this._queryFn !== null) {
          resolvedQueryFn = this._queryFn
        } else {
          resolvedQueryFn = await getDefaultQueryFn()
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this._push({ type: 'error', message: `Failed to load Agent SDK: ${msg}` })
        this._push({ type: 'done' })
        return
      }

      if (this._aborted) return

      // SDK 옵션 빌드 (run-args의 allowlist 검증)
      const optionsPatch = buildQueryOptions({
        model: this._req.model,
        effort: this._req.effort,
        mode: this._req.mode
      })

      // permissionMode 결정: buildQueryOptions 결과 사용, 없으면 'default'.
      // settings 핀(SDK가 보는 모드)에 쓰인다.
      const permissionMode = optionsPatch.permissionMode ?? 'default'

      // skillOverrides: run 시작 시 1회 계산.
      // disabled skill → SDK에게 'off'로 전달해 모델이 해당 스킬을 보지 못하게 한다.
      // null이면 미포함(빈 객체 spread 금지). (원본 engine.ts L251,291~294 미러)
      // ADR-003: Claude SDK 고유 개념 → ClaudeCodeBackend 내부에만. 외부 계약 미노출.
      const skillOverrides = this._skillOverridesProvider()

      // mcpDenied: run 시작 시 1회 계산.
      // disabled MCP 서버 목록 → SDK에게 deniedMcpServers로 전달.
      // null이면 미포함(빈 배열 spread 금지). (원본 engine.ts L254,291~295 미러)
      // ADR-003: Claude SDK 고유 개념 → ClaudeCodeBackend 내부에만. 외부 계약 미노출.
      // best-effort: SDK 내부 동작은 managed 컨텍스트 의존 가능 — 차단 단정 금지.
      const mcpDenied = this._mcpDeniedProvider()

      // canUseTool early-allow 판정은 picker mode id(매핑 전 값)로 한다.
      // auto/bypass가 acceptEdits/bypassPermissions로 매핑되면 구분이 사라지기 때문.
      // (원본 engine.ts는 makeCanUseTool(runId, req.mode, cwd)로 picker id를 직접 넘김)
      const canUseTool = this._makeCanUseTool(this._req.mode)

      // ── orchestration 판정 (Phase 37 #4a, ADR-003) ──────────────────────────
      // picker id(AgentRunInput.orchestration)로 판정. 엔진 고유 매핑은 여기서만.
      const orchestration = this._req.orchestration === true

      // ── systemPrompt append 합성 (Phase 37 #4a + Phase 30 M2) ───────────────
      // userAppend: 사용자가 전달한 커스텀 프롬프트(trim 후 빈 문자열이면 undefined).
      // orchestration=true → [userAppend, ORCHESTRATION_SYSTEM_GUIDE].filter(Boolean) join.
      // orchestration=false → userAppend만(기존 M2 동작 회귀 0 — O6 단정).
      // CRITICAL(ADR-003): ORCHESTRATION_SYSTEM_GUIDE·'Workflow' 등 SDK 고유 용어는 이 블록에만.
      // CRITICAL(신뢰경계): systemPrompt 내용을 로그에 출력하지 않는다.
      const userAppend = this._req.systemPrompt?.trim() || undefined
      const appendStr = orchestration
        ? ([userAppend, ORCHESTRATION_SYSTEM_GUIDE].filter(Boolean) as string[]).join('\n\n')
        : userAppend

      // ── disallowedTools 계산 (Phase 37 #4a, ADR-003) ────────────────────────
      // orchestration=false/미전달 → Workflow 도구를 차단(모델이 도구 자체를 못 봄).
      // orchestration=true → disallowedTools 미포함(Workflow 허용).
      // CRITICAL(ADR-003): 'Workflow' 문자열·disallowedTools는 이 어댑터 내부에만.
      const disallowedTools = orchestration ? undefined : [...ORCHESTRATION_TOOLS]

      // SDK query 옵션
      const sdkOptions: Record<string, unknown> = {
        ...optionsPatch,
        cwd: this._req.workspaceRoot ?? process.cwd(),
        abortController: this._abortController,
        // Phase 33 M5: includePartialMessages:true → stream_event 델타 수신 활성화.
        // 롤백 안전선: false로 복귀(1줄) → 즉시 Phase A(reducer·매퍼 무관, stream_event 미발화).
        includePartialMessages: true,
        // ── systemPrompt (Phase 30 M2 + Phase 37 #4a — 원본 engine.ts L308-312 정밀 미러) ──
        // 패널/채팅별 커스텀 프롬프트를 매 run마다 append.
        // orchestration=true이면 ORCHESTRATION_SYSTEM_GUIDE도 같이 append.
        // 미전달/빈/공백만이면 append 없이 preset만 — 회귀 0.
        // CRITICAL(ADR-003): SDK 고유 형상(preset/append)은 이 클래스 내부에만.
        // CRITICAL(신뢰경계): systemPrompt 내용을 로그에 출력하지 않는다.
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          ...(appendStr ? { append: appendStr } : {})
        },
        // ── disallowedTools (Phase 37 #4a, ADR-003) ─────────────────────────────
        // orchestration=false/미전달 → ['Workflow'] (모델이 도구를 볼 수 없음).
        // orchestration=true → 키 미포함 (Workflow 허용).
        ...(disallowedTools ? { disallowedTools } : {}),
        // ── settings 핀 (canUseTool 발화 전제 + skillOverrides + deniedMcpServers) ──
        // 사용자 전역 ~/.claude/settings.json의 permissions.defaultMode가 canUseTool
        // 전에 도구를 선승인하지 못하도록, composer가 고른 모드를 inline settings로 핀한다.
        // settingSources를 명시해 user/project/local 설정을 같이 로드하되, inline settings가
        // 우선한다. (원본 engine.ts L291~313 미러)
        // skillOverrides: null이면 key 자체 미포함 (원본 engine.ts L291~294 미러).
        // deniedMcpServers: null이면 key 자체 미포함 (원본 engine.ts L291~295 미러).
        settings: {
          permissions: { defaultMode: permissionMode },
          ...(skillOverrides ? { skillOverrides } : {}),
          ...(mcpDenied ? { deniedMcpServers: mcpDenied } : {})
        },
        settingSources: ['user', 'project', 'local'],
        canUseTool,
        // ── refusal-fallback 폴백 다이얼로그 자동 수락 (Phase 32, 원본 engine.ts L329-354 미러) ──
        // SDK가 Fable 5 안전정책 거부 시 이 dialog를 발화한다.
        // 선언하지 않으면 turn이 그냥 죽음. 선언+auto-accept → 폴백 모델로 재시도.
        // CRITICAL: 화살표 함수 필수(권고2) — this._curTextId / this._pendingFallbackNotices /
        //   this._push 접근. function 키워드 → this가 undefined.
        // 신뢰경계: payload.originalModel/fallbackModel/apiRefusalCategory string만 추출.
        //   raw payload 객체를 events/logs에 흘리지 않는다.
        supportedDialogKinds: ['refusal_fallback_prompt'],
        onUserDialog: async (dlg: { dialogKind: string; payload?: Record<string, unknown> }) => {
          // 미지원 dialogKind → 'cancelled'(SDK 계약: 기본동작 적용). 원본 L333 미러.
          if (dlg.dialogKind !== 'refusal_fallback_prompt') {
            return { behavior: 'cancelled' as const }
          }
          const p = dlg.payload ?? {}
          // dedup 카운터 증가: system 경로가 나중에 같은 폴백을 emit하면 카운터 감소만 함.
          this._pendingFallbackNotices++
          // thinking 열림 상태면 clear emit (원본 L336-339 미러)
          // (현재 ClaudeAgentRun은 thinking_clear를 _curTextId 리셋과 별도로 관리하지 않으므로
          //  _curTextId가 null이 아닐 때 thinking_clear를 전송하는 guard는 원본과 동일하게 처리)
          // 원본: if (thinkingOpen) { emit thinking_clear; thinkingOpen=false }
          // 우리: thinking 상태 추적 인스턴스 필드가 없으므로 thinking_clear는 best-effort 생략.
          // (thinking 이벤트는 reducer에서 별도 처리, clear는 done/text가 자동 정리함)
          this._push({
            type: 'model-fallback',
            fromModel: typeof p['originalModel'] === 'string' ? p['originalModel'] : '',
            toModel: typeof p['fallbackModel'] === 'string' ? p['fallbackModel'] : '',
            text: fallbackNotice(p['originalModel'], p['fallbackModel'], p['apiRefusalCategory']),
            // 거부 직전 스트리밍 중이던 버블 id (재시도 답변이 새 버블로 시작되도록).
            // null이면 이미 열린 버블 없음(텍스트 출력 전 거부). 원본 L348 미러.
            retractMessageId: this._curTextId,
          })
          // _curTextId 리셋: 재시도 답변은 새 블록으로 시작. 원본 L350-352 미러.
          this._curTextId = null
          return { behavior: 'completed' as const, result: 'retry_fallback' }
        }
      }

      // API 키: 환경변수(process.env)에서 SDK가 자동 처리.
      // 코드에 평문 노출 절대 금지.

      // query 호출
      let queryIterable: AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
      try {
        queryIterable = resolvedQueryFn({ prompt, options: sdkOptions })
        this._queryHandle = queryIterable
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this._push({ type: 'error', message: `Failed to start agent query: ${msg}` })
        this._push({ type: 'done' })
        return
      }

      // ── ADR-019: supportedCommands fire-and-forget 캡처 ────────────────────
      // query 핸들 확보 직후, 스트림 소비 시작 전에 캡처를 시작한다.
      // .then()으로 비동기 처리 → 스트림을 블록하지 않음(await 금지).
      // 모든 실패(메서드 없음/throw) → 무시(캐시 미갱신, run 정상 계속).
      // 신뢰경계: name·description(cap+개행 제거)·argHint만 캡처. 시크릿/경로 0.
      if (this._onCommandsCaptured) {
        const onCaptured = this._onCommandsCaptured
        const rawIterable = queryIterable as unknown as Record<string, unknown>
        if (typeof rawIterable['supportedCommands'] === 'function') {
          // fire-and-forget: void로 버림 → await 없음 → 스트림 지연 0
          void (rawIterable['supportedCommands'] as () => Promise<unknown>)()
            .then((result: unknown) => {
              if (!Array.isArray(result)) return
              const cmds: SlashCommandInfo[] = []
              for (const item of result) {
                if (!item || typeof item !== 'object') continue
                const raw = item as Record<string, unknown>
                const name = typeof raw['name'] === 'string' ? raw['name'].trim() : ''
                if (!name) continue
                // description: null/undefined → '' (graceful), 길이 cap + 개행 제거
                const rawDesc = raw['description'] != null ? String(raw['description']) : ''
                const description = ClaudeAgentRun._sanitizeDescription(rawDesc)
                // argumentHint: 빈 문자열 → undefined (팔레트에 미표시)
                const rawHint = raw['argumentHint']
                const argHint = typeof rawHint === 'string' && rawHint.trim().length > 0
                  ? rawHint.trim()
                  : undefined
                const cmd: SlashCommandInfo = { name, description, scope: 'builtin' }
                if (argHint !== undefined) cmd.argHint = argHint
                cmds.push(cmd)
              }
              onCaptured(cmds)
            })
            .catch(() => {
              // supportedCommands throw → 무시(캐시 미갱신). run은 정상 계속.
            })
        }
      }

      // Phase 33 M5 — B2 초기화(CRITICAL): run 루프 진입 전 명시 리셋.
      // 인스턴스 필드 기본값 false + 여기서 명시 + finally 리셋(3중).
      // 이유: abort 후 재run 또는 edge-case에서 stale true가 첫 full suppress 오발 방지.
      this._streamedThisMsg = false

      // SDK SDKMessage 스트림 소비 → AgentEvent 정규화 → push
      try {
        for await (const msg of queryIterable) {
          if (this._aborted || this._abortController.signal.aborted) {
            return
          }

          // ── system/model_refusal_fallback 전처리 (Phase 32, mapClaudeStreamLine 호출 전) ──
          // claude-stream.ts L421-425의 `case 'system'`이 system msg를 []로 삼킨다.
          // model_refusal_fallback은 다이얼로그 없이 SDK가 직접 발화하는 경우에만 오는 signal.
          // 따라서 mapClaudeStreamLine 호출 전에 raw msg를 검사해 가로챈다.
          // claude-stream.ts는 순수 유지(무변경). 원본 engine.ts L398-412 미러.
          // 신뢰경계: original_model/fallback_model/api_refusal_category string만 추출.
          if (
            msg !== null &&
            typeof msg === 'object' &&
            (msg as Record<string, unknown>)['type'] === 'system' &&
            (msg as Record<string, unknown>)['subtype'] === 'model_refusal_fallback'
          ) {
            const raw = msg as Record<string, unknown>
            if (this._pendingFallbackNotices > 0) {
              // dialog 경로가 이미 emit했음 → 카운터 감소만(dedup). 원본 L399-401 미러.
              this._pendingFallbackNotices--
            } else {
              // dialog 없이 CLI가 자동 전환한 경우 → 여기서 emit. 원본 L402-410 미러.
              // system 경로: retractMessageId=null (turn 끝 stream id가 재시도 답변 것일 수 있어 retract 금지).
              this._push({
                type: 'model-fallback',
                fromModel: typeof raw['original_model'] === 'string' ? raw['original_model'] : '',
                toModel: typeof raw['fallback_model'] === 'string' ? raw['fallback_model'] : '',
                text: fallbackNotice(raw['original_model'], raw['fallback_model'], raw['api_refusal_category']),
                retractMessageId: null,
              })
            }
            continue
          }

          // ── Phase 33 M5 — content_block_start 전처리(B1·CRITICAL) ───────────
          // stream_event이고 event.type==='content_block_start'이면 _curTextId=null.
          // 새 콘텐츠 블록 = 새 버블: 한 assistant 턴 내 text→tool→text 멀티블록에서
          // 둘째 text가 첫 버블에 병합되는 회귀 차단.
          // mapClaudeStreamLine 호출과 무관한 펌프 stateful 전처리.
          // (원본 engine.ts: content_block_start 처리로 블록 경계 관리 미러)
          const isStreamEventMsg = (
            msg !== null &&
            typeof msg === 'object' &&
            (msg as Record<string, unknown>)['type'] === 'stream_event'
          )
          if (isStreamEventMsg) {
            const rawMsg = msg as Record<string, unknown>
            const ev = rawMsg['event']
            if (
              ev !== null &&
              typeof ev === 'object' &&
              (ev as Record<string, unknown>)['type'] === 'content_block_start'
            ) {
              // 새 콘텐츠 블록 시작 → _curTextId 리셋(새 버블)
              this._curTextId = null
            }
          }

          // 엔진 출력 → AgentEvent (raw 누수 없음, mapClaudeStreamLine 경유만)
          for (const event of mapClaudeStreamLine(msg)) {
            // ── Task* 누적 처리 (F1 fix) ──────────────────────────────────────
            // TaskCreate/TaskUpdate/TaskList tool_call → taskMap 갱신 + todos push.
            // 해당 tool_call 자체는 events에 push하지 않음(도구 로그 제외).
            // 해당 id의 tool_result도 suppress(고아 결과 방지).
            // 분기 주의: Task/Agent(서브에이전트 스폰)와 TaskCreate 등은 이름이 다름.
            // mapClaudeStreamLine이 내보낸 tool_call만 가로채므로 subagent 분기로 새지 않음.
            // 순수성 보존: mapClaudeStreamLine 무상태 유지. 누적·emit은 여기서만.
            //
            // Phase A-1 주의: Task* 가로채기 후 continue — _curTextId 리셋 안 함(정상).
            // 이유: suppress된 도구는 thread 도구가 아님(원본 엔진 동작 미러).
            //       텍스트 블록 연속성 유지가 옳다.
            if (event.type === 'tool_call' && ClaudeAgentRun._TASK_TOOLS.has(event.name)) {
              this._handleTaskToolCall(event.id, event.name, event.input)
              // task* tool_call은 push하지 않음 — 도구 로그 제외
              continue
            }
            if (event.type === 'tool_result' && this._taskToolIds.has(event.id)) {
              // task* tool_result suppress — 고아 결과 방지
              continue
            }

            // ── file-change pending-map 처리 (F2 fix) ─────────────────────────
            // tool_call(Write/Edit/MultiEdit/NotebookEdit) → pending 기록
            // tool_result(성공) → file_changed emit + pending 제거
            // tool_result(실패) → pending 제거만(emit 없음 — 유령 마커 0)
            // 순수성 보존: mapClaudeStreamLine 무상태 유지. 누적·emit은 여기서만.
            if (event.type === 'tool_call') {
              this._recordFilePending(event.id, event.name, event.input)
            } else if (event.type === 'tool_result') {
              this._resolveFilePending(event.id, event.ok)
            }

            // ── Phase 33 M5 + Phase A-1: messageId 블록 경계 부여 + 델타/full 분기 ──
            //
            // isStreamEventMsg: 이 msg가 stream_event인지(mapClaudeStreamLine 호출 전 판정).
            // text 이벤트 분기:
            //   isStreamEventMsg(델타): _curTextId ??= _nextBlockId(), _streamedThisMsg=true, push.
            //   else(full 텍스트 블록): _streamedThisMsg이면 continue(suppress), 아니면 태깅+push.
            // thinking 이벤트: !isStreamEventMsg && _streamedThisMsg → continue(suppress).
            //   이유: full thinking이 스트리밍 후 늦게 표시되는 글리치 방지(원본 L459 미러).
            // tool_call 이벤트: _curTextId=null(인터리브 경계, Phase A-1 무변경).
            //
            // 원본 engine.ts L419-426(stream_event text delta) + L463-471(full text) 미러.
            if (event.type === 'text') {
              if (isStreamEventMsg) {
                // 델타(stream_event): 블록 id 발급 + _streamedThisMsg=true + push
                if (this._curTextId === null) {
                  this._curTextId = this._nextBlockId()
                }
                event.messageId = this._curTextId
                this._streamedThisMsg = true
              } else {
                // full 텍스트 블록: 이미 스트리밍됐으면 suppress
                if (this._streamedThisMsg) {
                  // 델타가 이미 버블 빌드 → full suppress(중복 방지)
                  continue
                }
                // Phase A 폴백: 델타 미도착 → full을 정상 emit
                if (this._curTextId === null) {
                  this._curTextId = this._nextBlockId()
                }
                event.messageId = this._curTextId
              }
            } else if (event.type === 'thinking') {
              // thinking 이벤트: 스트리밍된 메시지의 full thinking → suppress
              // (원본 engine.ts L459 `if (!streamedThisMsg)` 미러)
              if (!isStreamEventMsg && this._streamedThisMsg) {
                // full thinking + 이미 스트리밍됨 → suppress(늦은 thinking 표시 방지)
                continue
              }
            } else if (event.type === 'tool_call') {
              // 실 도구(Task* 제외) → 다음 text 블록은 새 블록(인터리브 경계)
              this._curTextId = null
            }

            this._push(event)
          }

          // ── Phase 33 M5 — SDK 메시지 경계 리셋(S3 정밀화·CRITICAL) ──────────
          // assistant(full) msg에서만 리셋. stream_event/user/result/system 무리셋.
          //
          // 이유: 델타(stream_event)와 다른 비-assistant msg 사이에서 _curTextId를
          //       리셋하면 델타 분절(같은 버블이 조각남). 블록 경계는 content_block_start(B1)과
          //       tool_call이 담당. 이 분기는 assistant full msg의 턴 경계만 담당.
          //
          // Phase A 호환(false 모드): stream_event 미발화 → 각 assistant msg가 자족 블록
          //   → assistant 경계 리셋 = 현행 매-msg 리셋과 동일 효과(회귀 0).
          //
          // 원본 engine.ts L486-488: curTextId=null; streamedThisMsg=false (assistant 처리 후).
          if (
            msg !== null &&
            typeof msg === 'object' &&
            (msg as Record<string, unknown>)['type'] === 'assistant'
          ) {
            this._curTextId = null
            this._streamedThisMsg = false
          }
        }
      } catch (err) {
        // abort로 인한 중단은 정상 종료로 처리
        if (this._aborted || this._abortController.signal.aborted) {
          return
        }
        const msg = err instanceof Error ? err.message : String(err)
        this._push({ type: 'error', message: `Agent execution error: ${msg}` })
        this._push({ type: 'done' })
      }
    } finally {
      // model-fallback 카운터 리셋 (run 종료 시 클린업)
      this._pendingFallbackNotices = 0
      // Phase 33 M5 — B2 초기화(CRITICAL): finally 리셋(3중 초기화 중 3번째).
      // abort/에러 종료 후에도 stale true가 남지 않도록.
      this._streamedThisMsg = false
      // pending 정리 (run 종료 시 누수 0)
      this._pendingFileChanges.clear()
      // Task* 상태 정리 (run 종료 시 누수 0)
      this._taskMap.clear()
      this._taskToolIds.clear()
      // 항상 close → events 종료 보장 (정상/에러/abort 무관)
      this._close()
    }
  }

  // ── Task* stateful 누적 헬퍼 (F1 fix) ────────────────────────────────────

  // ── ADR-019: description sanitize 헬퍼 ─────────────────────────────────────

  /**
   * description 문자열을 신뢰경계 규격으로 정규화한다.
   *
   * 1. 개행 문자(\n, \r) → 공백으로 치환(oneLine과 동일 처리).
   * 2. 200자 cap: 초과 시 199자 + '…'(줄임표) 로 자른다.
   *
   * 신뢰경계(ADR-019): description은 SDK 제공값(로컬 사용자 파일 유래).
   * 길이 제한·개행 제거로 출력 경계를 통제한다.
   */
  private static _sanitizeDescription(s: string): string {
    // 개행 제거: \r\n, \r, \n → 공백
    const oneLine = s.replace(/\r\n|\r|\n/g, ' ').trim()
    const MAX = 200
    if (oneLine.length <= MAX) return oneLine
    // 200자 초과 → 199자 + '…'
    return oneLine.slice(0, MAX - 1) + '…'
  }

  /**
   * TASK_TOOLS: TaskCreate/TaskUpdate/TaskList.
   * 이 도구들은 할 일 패널로 라우팅되며 도구 로그에서 제외된다.
   * (원본 engine.ts L117 `TASK_TOOLS` 미러. TodoWrite는 claude-stream에서 처리.)
   *
   * 분기 주의:
   *  - 'Task' / 'Agent'(서브에이전트 스폰)은 이 Set에 없음 → subagent 이벤트(claude-stream 경로).
   *  - 'TaskCreate' / 'TaskUpdate' / 'TaskList'는 이 Set에 있음 → taskMap 누적.
   */
  private static readonly _TASK_TOOLS = new Set(['TaskCreate', 'TaskUpdate', 'TaskList'])

  /**
   * Task* tool_call 가로채기 — taskMap 갱신 + todos push.
   *
   * TaskCreate: input.subject || input.description → ++_taskSeq id 발급 → taskMap.set.
   *   subject 빈 문자열이면 추가 안 함(원본 L609 `if (subject)` 미러).
   * TaskUpdate: input.taskId(방어적: taskId/task_id/id 모두 시도) → taskMap 조회.
   *   status='deleted' → taskMap.delete.
   *   그 외 → status 갱신 + input.subject 있으면 label 갱신.
   * TaskList: 변경 없이 현재 taskMap re-emit.
   * 매 변경 끝에 todos 이벤트 push.
   * id를 _taskToolIds에 등록 → 이후 tool_result suppress.
   *
   * status 매핑: todoStatus 헬퍼(claude-stream 동일 로직, 여기서 인라인).
   *   completed/done → 'done'
   *   in_progress/running → 'running'
   *   그 외(pending 등) → 'planned'
   *
   * (원본 engine.ts L603~628 미러)
   */
  private _handleTaskToolCall(id: string, name: string, input: unknown): void {
    // id 등록 → 이후 이 id의 tool_result를 suppress
    this._taskToolIds.add(id)

    const inp = (typeof input === 'object' && input !== null && !Array.isArray(input))
      ? input as Record<string, unknown>
      : {}

    if (name === 'TaskCreate') {
      // subject 우선, 없으면 description 폴백 (원본 L609 미러)
      const subject = String(inp['subject'] ?? inp['description'] ?? '').trim()
      if (subject) {
        const tid = String(++this._taskSeq)
        this._taskMap.set(tid, { id: tid, label: subject, status: 'planned' })
      }
    } else if (name === 'TaskUpdate') {
      // taskId 방어적 읽기: taskId / task_id / id 순 시도 (원본 L615 미러)
      const tid = String(inp['taskId'] ?? inp['task_id'] ?? inp['id'] ?? '').trim()
      const status = String(inp['status'] ?? '').trim()
      const task = this._taskMap.get(tid)
      if (task) {
        if (status === 'deleted') {
          this._taskMap.delete(tid)
        } else {
          if (status) task.status = this._mapTaskStatus(status)
          if (inp['subject']) task.label = String(inp['subject'])
        }
      }
    }
    // TaskList: 변경 없이 현재 taskMap re-emit

    // 매 Task* 이벤트 끝에 todos 이벤트 push
    const todos = [...this._taskMap.values()].map(t => ({ ...t }))
    this._push({ type: 'todos', todos })
  }

  /**
   * Task* status 문자열 → TodoItem status 매핑.
   * (claude-stream.ts todoStatus 함수와 동일 로직 — 별도 export 없이 인라인)
   */
  private _mapTaskStatus(s: string): 'done' | 'running' | 'planned' {
    if (s === 'completed' || s === 'done') return 'done'
    if (s === 'in_progress' || s === 'running') return 'running'
    return 'planned'
  }

  // ── file-change pending-map 헬퍼 (F2 fix) ─────────────────────────────────

  /**
   * FILE_CHANGE_TOOLS: Write/Edit/MultiEdit/NotebookEdit.
   * Bash·Read 등 비변경 도구는 이 Set에 포함하지 않는다.
   */
  private static readonly _FILE_CHANGE_TOOLS = new Set([
    'Write', 'Edit', 'MultiEdit', 'NotebookEdit'
  ])

  /**
   * tool_use 시점: 파일변경 도구이면 pending-map에 {path, change, baseline, absPath} 기록.
   *
   * path 추출 우선순위 (방어적):
   *   file_path → path → notebook_path 순으로 읽기.
   *   NotebookEdit은 notebook_path 키를 사용한다.
   *
   * change 판정:
   *   Write이고 tool_use 시점에 파일 부재(existsSync=false, abs 기준) → 'add'
   *   그 외(Edit/MultiEdit/NotebookEdit, 또는 Write인데 파일 존재) → 'modify'
   *   existsSync 실패(예외) → 'modify' 폴백(안전).
   *
   * baseline 읽기 (Phase B):
   *   abs 경로에서 readFileSync(abs, 'utf8')로 현재 내용을 읽어 저장.
   *   파일 부재(신규 Write) → baseline = '' (전체 add diff 계산 가능).
   *   읽기 실패(예외) → baseline = '' (graceful, diff 계산 시 전부 add 취급).
   *
   * 경로 정규화 (F2 후속):
   *   root = this._req.workspaceRoot
   *   abs  = isAbsolute(rawPath) ? rawPath : join(root ?? process.cwd(), rawPath)
   *   existsSync는 abs 기준(판정 정확성 보장).
   *   emit 경로 결정:
   *     - root 없음 → rawPath 그대로(폴백).
   *     - root 있음 → rel = relative(root, abs).
   *       rel이 '..' 시작(워크스페이스 밖) → rawPath 그대로(밖 파일은 정규화 안 함).
   *       아니면 → rel을 POSIX 구분자(/)로 변환해 사용.
   *   pending에 저장하는 path = 이 정규화된 경로.
   *   FileExplorer의 node.path(워크스페이스 상대 POSIX)와 정확히 매칭 → dot이 뜬다.
   *
   * ADR-003: fs 읽기는 main(어댑터) 내부 — 신뢰경계 내. 시크릿 0.
   */
  private _recordFilePending(id: string, name: string, input: unknown): void {
    if (!ClaudeAgentRun._FILE_CHANGE_TOOLS.has(name)) return

    const inp = (typeof input === 'object' && input !== null && !Array.isArray(input))
      ? input as Record<string, unknown>
      : {}

    // path 추출: file_path → path → notebook_path
    const rawPath =
      typeof inp['file_path'] === 'string' ? inp['file_path'] :
      typeof inp['path'] === 'string' ? inp['path'] :
      typeof inp['notebook_path'] === 'string' ? inp['notebook_path'] :
      ''

    // 경로 불명 → pending 기록 건너뜀(emit도 없음 — 안전 우선)
    if (!rawPath) return

    // ── 절대경로 계산 ───────────────────────────────────────────────────────
    // existsSync 판정 및 상대경로 계산 모두 abs 기준으로 수행.
    // 상대경로인 경우 root(또는 cwd)를 기준으로 join.
    const root = this._req.workspaceRoot
    const abs = isAbsolute(rawPath)
      ? rawPath
      : join(root ?? process.cwd(), rawPath)

    let change: 'add' | 'modify' = 'modify'

    // ── baseline 읽기 (Phase B) ─────────────────────────────────────────────
    // tool_call 시점의 현재 디스크 내용을 baseline으로 저장한다.
    // 파일 미존재(신규 Write) → '' (전체 add diff 계산 가능).
    // 읽기 예외 → '' (graceful, diff는 전부 add 취급).
    let baseline = ''
    try {
      if (existsSync(abs)) {
        if (name === 'Write') {
          // Write: 파일 존재이면 'modify', 미존재이면 'add' (아래에서 다시 판정)
          change = 'modify'
        }
        baseline = readFileSync(abs, 'utf8')
      } else {
        if (name === 'Write') change = 'add'
        // 파일 미존재 → baseline = '' (기본값 유지)
      }
    } catch {
      // existsSync/readFileSync 실패 → 'modify' 폴백, baseline = '' (기본값 유지)
    }
    // Edit / MultiEdit / NotebookEdit → 항상 'modify' (기본값 유지, existsSync 분기 불필요)

    // ── emit 경로 정규화 (워크스페이스 상대 POSIX) ──────────────────────────
    // root 없음 → rawPath 그대로(폴백).
    // root 있음 → relative(root, abs) 계산.
    //   '..' 시작 = 워크스페이스 밖 → rawPath 그대로(밖 파일은 정규화 안 함).
    //   그 외 → POSIX 구분자(/)로 변환.
    let emitPath: string
    if (!root) {
      emitPath = rawPath
    } else {
      const rel = relative(root, abs)
      if (rel.startsWith('..')) {
        // 워크스페이스 밖 파일 → rawPath 그대로 유지(의도된 동작)
        emitPath = rawPath
      } else {
        // 워크스페이스 내 파일 → OS 구분자를 POSIX(/)로 변환
        // Windows(sep='\\')에서도 항상 '/'로 통일.
        // POSIX(sep='/')에서는 split/join이 no-op.
        emitPath = rel.split(sep).join('/')
      }
    }

    this._pendingFileChanges.set(id, { path: emitPath, change, baseline, absPath: abs })
  }

  /**
   * tool_result 시점: pending에 있는 id이면:
   *   ok=true(성공) → after 읽기 → computeDiff → file_changed{path,change,diff?,add?,del?} push + pending 제거
   *   ok=false(실패) → pending 제거만(emit 없음 — 유령 마커 0)
   *
   * Phase B — diff 계산:
   *   after = readFileSync(absPath, 'utf8') — 엔진이 파일을 쓴 후의 내용.
   *   after 읽기 실패(파일 미존재/예외) → diff 생략(path/change만 emit — graceful).
   *   바이너리 가드: after 버퍼 첫 8KB에 null byte → diff 생략.
   *   대형 파일 가드: after 버퍼 크기 > MAX_DIFF_BYTES → diff 생략.
   *   위 가드 통과 시: computeDiff(baseline, after) → DiffLine[] + add/del 집계.
   *   add = kind==='add' 라인 수, del = kind==='remove' 라인 수.
   *
   * 원본 engine.ts L708~711: "Emit the deferred file change only now that the
   * edit/write has actually succeeded." 미러.
   *
   * ADR-003: diff 계산은 ClaudeCodeBackend 내부. file_changed는 공통 AgentEvent.
   * 신뢰경계: fs 읽기는 main(어댑터) 내부. diff 라인=사용자 파일 내용(무해).
   */
  private _resolveFilePending(id: string, ok: boolean): void {
    const pending = this._pendingFileChanges.get(id)
    if (!pending) return
    this._pendingFileChanges.delete(id)

    if (!ok) {
      // 실패 → emit 없음(유령 마커 방지)
      return
    }

    // ── after 읽기 + diff 계산 (Phase B) ──────────────────────────────────
    let diffLines: DiffLine[] | undefined
    let addCount: number | undefined
    let delCount: number | undefined

    try {
      // after 파일을 바이너리(Buffer)로 먼저 읽어 가드 검사
      const afterBuf = readFileSync(pending.absPath)

      // 대형 파일 가드: MAX_DIFF_BYTES 초과 → diff 생략
      if (afterBuf.length <= MAX_DIFF_BYTES) {
        // 바이너리 가드: 첫 8KB에 null byte → diff 생략
        const sample = afterBuf.slice(0, 8192)
        let isBinary = false
        for (let i = 0; i < sample.length; i++) {
          if (sample[i] === 0) {
            isBinary = true
            break
          }
        }

        if (!isBinary) {
          // 텍스트 파일: computeDiff로 whole-file diff 계산
          const afterContent = afterBuf.toString('utf-8')
          diffLines = computeDiff(pending.baseline, afterContent)
          // add/del 집계
          addCount = diffLines.filter(l => l.kind === 'add').length
          delCount = diffLines.filter(l => l.kind === 'remove').length
        }
        // isBinary → diffLines/addCount/delCount 미설정(undefined 유지) = 가드 생략
      }
      // after 크기 > MAX_DIFF_BYTES → diffLines/addCount/delCount 미설정 = 가드 생략
    } catch {
      // readFileSync 실패(파일 미존재·권한 등) → diff 생략(graceful)
      // diffLines/addCount/delCount 미설정 유지
    }

    // file_changed emit: diff 있으면 포함, 없으면 path/change만.
    // toolId = 이 변경을 일으킨 도구 tool_use id(= renderer ToolCard id) → 카드별 diff 연결
    // (path는 워크스페이스 상대 POSIX라 절대경로 도구 입력과 키 불일치 — toolId로 정확 매칭).
    this._push({
      type: 'file_changed',
      path: pending.path,
      change: pending.change,
      toolId: id,
      ...(diffLines !== undefined ? { diff: diffLines, add: addCount, del: delCount } : {})
    })
  }

  // ── canUseTool (권한 게이트) ────────────────────────────────────────────────

  /**
   * SDK canUseTool 콜백 생성. picker mode id를 클로저로 캡처.
   *
   * mode는 buildQueryOptions 매핑 *전*의 picker id다(예: 'normal'|'plan'|'acceptEdits'
   * |'auto'|'bypass'). auto/bypass가 SDK permissionMode로 매핑되면 acceptEdits/
   * bypassPermissions와 구분이 사라지므로, 판정은 매핑 전 id로 한다.
   *
   * 판정 순서(원본 engine.ts makeCanUseTool L761~802 미러 + Phase 37 #4a Workflow 게이트):
   *  1. AskUserQuestion → handleAskQuestion (질문카드 흐름, mode 무관).
   *  1a. [Phase 37] Workflow 특별 처리:
   *      orchestration=false → 즉시 deny(permission_request 없음, G4).
   *      orchestration=true → auto/bypass 조기허용 우회하고 항상 _requestPermission(G1/G2).
   *  2. mode auto/bypass → allow(Workflow 제외 — 위에서 처리됨).
   *  3. READONLY_TOOLS → allow.
   *  4. acceptEdits && toolName!=='Bash' && !MUTATING → allow.
   *  5. 그 외(부수효과) → _requestPermission(permission_request push + respond await).
   *     deny→{behavior:'deny'}, allow_always→allow+세션규칙, allow→allow.
   *  6. options.signal abort → 해당 waiter deny/null resolve(SDK 독립 abort 미러).
   */
  private _makeCanUseTool(mode: string | undefined) {
    // orchestration 판정: _req.orchestration으로 직접 접근.
    const orchestration = this._req.orchestration === true

    return async (
      toolName: string,
      input: Record<string, unknown>,
      options?: { signal?: AbortSignal; toolUseID?: string }
    ): Promise<PermissionResult> => {
      // 1. AskUserQuestion → 질문카드 흐름 (mode 무관 — 원본 engine.ts L768 미러).
      if (toolName === 'AskUserQuestion') {
        return this._handleAskQuestion(input, options?.signal)
      }

      // 1a. [Phase 37 #4a] 오케스트레이션 도구 게이트 (ADR-003: Claude 고유 도구명은 어댑터 내부에만).
      // ORCHESTRATION_TOOLS가 단일 출처 — disallowedTools(OFF)와 이 게이트(ON)가 항상 동기화.
      if ((ORCHESTRATION_TOOLS as readonly string[]).includes(toolName)) {
        if (!orchestration) {
          // orchestration OFF → 즉시 deny(permission_request 발화 없음, G4).
          // disallowedTools에도 'Workflow'가 들어가 있어 실제로는 이 경로에 도달하지 않지만,
          // 방어적으로 canUseTool 직접 호출 시에도 hang 없이 즉시 deny를 반환한다.
          return { behavior: 'deny', message: '오케스트레이션 모드가 꺼져 있습니다.' }
        }
        // orchestration ON → 항상 사용자 승인 게이트(대규모=비용).
        // auto/bypass 조기허용을 우회하여 _requestPermission으로 직행한다(G2).
        return this._requestPermission(toolName, input, options)
      }

      // 2. auto / bypass — 전체 허용 모드(picker id 기준).
      if (mode === 'auto' || mode === 'bypass') {
        return { behavior: 'allow', updatedInput: input }
      }

      // 3. 읽기 전용 도구는 항상 허용.
      if (READONLY_TOOLS.has(toolName)) {
        return { behavior: 'allow', updatedInput: input }
      }

      // 4. acceptEdits: 파일 편집은 SDK가 이미 자동승인(여기 도달 X). 여기 도달한
      //    non-bash·non-mutating 도구는 허용. Bash/Mutating은 발화(아래).
      if (mode === 'acceptEdits' && toolName !== 'Bash' && !MUTATING_TOOLS.has(toolName)) {
        return { behavior: 'allow', updatedInput: input }
      }

      // 5. 그 외(부수효과) → 사용자에게 권한 요청.
      return this._requestPermission(toolName, input, options)
    }
  }

  /**
   * 사용자에게 권한 요청(permission_request push + respond await).
   *
   * step5(원본 engine.ts L784~802 미러)를 private 메서드로 추출.
   * _makeCanUseTool의 일반 부수효과 분기와 Workflow ON 분기 양쪽에서 호출한다(중복 제거).
   *
   * 흐름:
   *  - requestId 발급 → _waiters.set → onAbort 등록 → permission_request push → respond await.
   *  - RunResponse narrowing: permission만 도달 (question은 _handleAskQuestion).
   *  - deny → {behavior:'deny', message:'사용자가 거부했습니다.'}.
   *  - allow_always → allow + 세션규칙(destination:'session').
   *  - allow → {behavior:'allow', updatedInput}.
   *
   * @param toolName 도구 이름
   * @param input 도구 입력
   * @param options canUseTool options (signal, toolUseID)
   */
  private async _requestPermission(
    toolName: string,
    input: Record<string, unknown>,
    options?: { signal?: AbortSignal; toolUseID?: string }
  ): Promise<PermissionResult> {
    const requestId = `perm-${++this._permCounter}`
    const summary = permissionSummary(toolName, input)

    const response = await new Promise<RunResponse>((resolve) => {
      this._waiters.set(requestId, resolve)
      // SDK가 독립적으로 이 도구를 abort하면 매달리지 않도록 deny resolve.
      // (원본 engine.ts L784~787 미러)
      const onAbort = (): void => {
        if (this._waiters.delete(requestId)) {
          resolve({ kind: 'permission', behavior: 'deny' })
        }
      }
      options?.signal?.addEventListener('abort', onAbort, { once: true })
      // permission_request를 큐에 push → events로 흘러 UI가 카드를 띄운다.
      this._push({ type: 'permission_request', requestId, toolName, summary })
    })

    // RunResponse narrowing: permission만 여기 도달 (question은 _handleAskQuestion)
    const behavior = response.kind === 'permission' ? response.behavior : 'deny'

    if (behavior === 'deny') {
      return { behavior: 'deny', message: '사용자가 거부했습니다.' }
    }
    if (behavior === 'allow_always') {
      // 세션 범위 allow 규칙 추가 → SDK가 이 세션 동안 같은 도구를 다시 묻지 않음.
      // destination 'session' = 인메모리(설정 파일 미수정).
      return {
        behavior: 'allow',
        updatedInput: input,
        updatedPermissions: [
          { type: 'addRules', rules: [{ toolName }], behavior: 'allow', destination: 'session' }
        ]
      }
    }
    // allow (한 번)
    return { behavior: 'allow', updatedInput: input }
  }

  /**
   * AskUserQuestion 도구 처리 — 질문카드 흐름.
   *
   * questions = parseQuestions(input): 정규화. 빈 배열이면 즉시 allow.
   * question_request를 push → events로 흘러 UI가 QuestionModal을 띄운다.
   * respond(kind:'question', answers)가 올 때까지 await.
   * formatAnswers로 답변을 포매팅해 deny+message로 모델에 전달.
   * (원본 engine.ts handleAskQuestion L742~759 미러)
   *
   * signal abort 시 null answers로 resolve → formatAnswers(null) = 건너뜀 안내.
   */
  private async _handleAskQuestion(
    input: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<PermissionResult> {
    const questions = parseQuestions(input)
    // 빈 questions → 도구 입력이 비정형 → 즉시 allow (원본 L748 미러)
    if (!questions.length) return { behavior: 'allow', updatedInput: input }

    const requestId = `ask-${++this._permCounter}`

    const answers = await new Promise<string[][] | null>((resolve) => {
      this._waiters.set(requestId, (r: RunResponse) => {
        // question 응답: answers 추출. permission 응답이 잘못 오면 null로 취급.
        resolve(r.kind === 'question' ? r.answers : null)
      })
      const onAbort = (): void => {
        if (this._waiters.delete(requestId)) resolve(null)
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      // question_request를 큐에 push → UI가 QuestionModal을 띄운다.
      this._push({ type: 'question_request', requestId, questions })
    })

    // canUseTool은 allow/deny만 반환 가능. deny + message로 사용자 답을 모델에 전달.
    return { behavior: 'deny', message: formatAnswers(questions, answers) }
  }
}

// ── ClaudeCodeBackendDeps (주입 가능 의존성) ─────────────────────────────────

/**
 * ClaudeCodeBackend 생성자 4번째 파라미터 — 주입 가능 의존성.
 *
 * 테스트 격리 전용:
 *  - fetchImpl: latestVersion() 내부 fetch 대체. 기본=globalThis.fetch.
 *  - resolvePackageVersion: version() 내부 package.json 읽기 대체.
 *    정상 → 버전 문자열 반환, 실패 → throw(SDK_VERSION 폴백으로 처리).
 *
 * 신뢰경계(ADR-008): fetch는 이 어댑터(main 프로세스) 내부에서만 호출.
 * 테스트가 mock을 주입해 실 네트워크 의존을 0으로 만든다.
 */
export interface ClaudeCodeBackendDeps {
  fetchImpl?: typeof fetch
  resolvePackageVersion?: () => string | null
}

// ── ClaudeCodeBackend ─────────────────────────────────────────────────────────

/**
 * Claude Agent SDK 어댑터.
 * AgentBackend 인터페이스 구현.
 *
 * 주입형 queryFn으로 테스트 격리 지원 (결정 #8).
 * 기본값은 lazy dynamic import → mock 테스트가 실 SDK를 평가하지 않음.
 *
 * 4번째 파라미터 deps(ClaudeCodeBackendDeps)로 fetch·package.json 읽기를 주입 가능하게 해
 * latestVersion()/version() 단위 테스트가 실 네트워크/파일시스템 의존 0으로 동작한다.
 */
export class ClaudeCodeBackend implements AgentBackend {
  readonly id = 'claude-code' as const

  private _queryFn: QueryFn | null
  private _skillOverridesProvider: () => Record<string, 'off'> | null
  private _mcpDeniedProvider: () => { serverName: string }[] | null
  private _fetchImpl: typeof fetch
  private _resolvePackageVersion: () => string | null
  /**
   * workspaceRoot → SlashCommandInfo[] インスタンスキャッシュ (ADR-019).
   * キー = req.workspaceRoot ?? '' (빈 문자열 = 전역).
   * run 종료 후 fire-and-forget이 완료될 때 기록됨.
   * 동기 조회만(listSupportedCommands). IO 없음.
   */
  private readonly _commandsCache = new Map<string, SlashCommandInfo[]>()

  /**
   * @param queryFn 선택적 query 함수 주입 (테스트용).
   *   미전달 시 null → start() 시점에 lazy dynamic import.
   * @param skillOverridesProvider 선택적 skillOverrides 소스 주입 (테스트용).
   *   미전달 시 기본값 = () => createSkillsStore().disabledSkillOverrides()
   *   (실 userData/skills-disabled.json 읽음, run 시작 시 1회 평가).
   *   ADR-003: Claude SDK 고유 개념 → 이 클래스 내부에만. AgentBackend 인터페이스 미노출.
   * @param mcpDeniedProvider 선택적 deniedMcpServers 소스 주입 (테스트용).
   *   미전달 시 기본값 = () => createMcpStore().deniedMcpServers()
   *   (실 userData/mcp-disabled.json 읽음, run 시작 시 1회 평가).
   *   ADR-003: Claude SDK 고유 개념 → 이 클래스 내부에만. AgentBackend 인터페이스 미노출.
   *   best-effort: SDK 인라인 발효는 managed 컨텍스트 의존 가능 — 차단 단정 금지.
   * @param deps 선택적 의존성 주입 (테스트용).
   *   - fetchImpl: latestVersion() fetch 대체 (기본=globalThis.fetch).
   *   - resolvePackageVersion: version() package.json 읽기 대체.
   */
  constructor(
    queryFn?: QueryFn,
    skillOverridesProvider?: () => Record<string, 'off'> | null,
    mcpDeniedProvider?: () => { serverName: string }[] | null,
    deps?: ClaudeCodeBackendDeps
  ) {
    this._queryFn = queryFn ?? null
    this._skillOverridesProvider = skillOverridesProvider
      ?? (() => {
        try {
          // 실 userData(app.getPath)에서 skills-disabled.json 읽기.
          // 테스트 환경(electron 미초기화)에서는 graceful null 반환.
          return createSkillsStore().disabledSkillOverrides()
        } catch {
          return null
        }
      })
    this._mcpDeniedProvider = mcpDeniedProvider
      ?? (() => {
        try {
          // 실 userData(app.getPath)에서 mcp-disabled.json 읽기.
          // 테스트 환경(electron 미초기화)에서는 graceful null 반환.
          return createMcpStore().deniedMcpServers()
        } catch {
          return null
        }
      })

    // fetch 주입: 테스트 시 mock 주입 → 실 네트워크 의존 0.
    // 기본값은 globalThis.fetch(Node 18+/Electron 제공).
    this._fetchImpl = deps?.fetchImpl ?? globalThis.fetch.bind(globalThis)

    // package.json 버전 읽기 주입: 테스트 시 mock 주입 → 파일시스템 의존 0.
    // 기본값 = readInstalledSdkVersion(메인 엔트리 resolve → 상위 package.json 탐색).
    //   ⚠️ require('@anthropic-ai/claude-agent-sdk/package.json')은 exports 제약으로
    //   throw하므로 쓰지 않는다(라이브 검증으로 발견 — readInstalledSdkVersion 주석 참조).
    this._resolvePackageVersion = deps?.resolvePackageVersion ?? readInstalledSdkVersion
  }

  /**
   * SDK 가용성 확인.
   * SDK는 하드 의존성(npm install 필수)이므로 dynamic import가 성공하면 true.
   * (결정 #7)
   */
  async isAvailable(): Promise<boolean> {
    try {
      await getDefaultQueryFn()
      return true
    } catch {
      return false
    }
  }

  /**
   * SDK 패키지 버전 반환 (런타임 package.json 읽기).
   *
   * 하드코딩 제거: _resolvePackageVersion()으로 런타임에 읽어 드리프트 차단.
   * 읽기 실패(미설치·경로 오류 등) 시 SDK_VERSION 상수로 graceful fallback.
   * SDK_VERSION 상수는 폴백 보존을 위해 삭제하지 않는다.
   * (결정 #7, version() 드리프트 차단)
   */
  async version(): Promise<string | null> {
    // 활성 설치 버전 우선(ADR-018) — getVersionState는 fs/config 읽기 포함.
    // 테스트(electron 미초기화)에서 throw 가능 → try/catch로 graceful 폴백.
    // ADR-003: engine-versions 단방향 import만.
    try {
      const { getVersionState } = await import('../engine-versions')
      const active = getVersionState().active
      if (typeof active === 'string' && active.length > 0) return active
    } catch {
      /* engine-versions 미가용 또는 getVersionState 실패 → 번들 버전 경로로 폴백 */
    }
    // 번들 버전 경로: _resolvePackageVersion(실 package.json) → SDK_VERSION 폴백 상수.
    try {
      const ver = this._resolvePackageVersion()
      if (typeof ver === 'string' && ver.length > 0) {
        return ver
      }
      // null 반환(읽기 성공했지만 빈/비정상) → 폴백
      return SDK_VERSION
    } catch {
      // 읽기 실패 → 폴백 상수
      return SDK_VERSION
    }
  }

  /**
   * npm registry에서 @anthropic-ai/claude-agent-sdk의 최신 가용 버전을 조회.
   *
   * ADR-003: registry URL·패키지명은 이 메서드 내부에만 격리. 인터페이스는 generic.
   * 신뢰경계(ADR-008): 버전 문자열만 반환 — 토큰/키/시크릿 절대 미포함.
   *
   * 구현 세부:
   *  - 8s AbortController 타임아웃.
   *  - 모든 오류(네트워크 throw / non-OK / JSON 파싱 실패 / 타임아웃) → null(graceful).
   *  - fetchImpl 주입 가능 → 단위 테스트 실 네트워크 의존 0.
   */
  async latestVersion(): Promise<string | null> {
    // 8초 타임아웃 AbortController
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)

    try {
      let response: Response
      try {
        // NPM_REGISTRY_URL은 이 파일 최상단 상수로 격리(ADR-003).
        response = await this._fetchImpl(NPM_REGISTRY_URL, {
          signal: controller.signal
        })
      } catch {
        // 네트워크 throw / abort(타임아웃) → null
        return null
      }

      if (!response.ok) {
        // non-OK HTTP (404, 5xx 등) → null
        return null
      }

      let json: unknown
      try {
        json = await response.json()
      } catch {
        // JSON 파싱 실패 → null
        return null
      }

      // dist-tags.latest 추출 (구조 검증)
      const distTags = (json as Record<string, unknown>)?.['dist-tags']
      const latest = (distTags as Record<string, unknown>)?.['latest']
      if (typeof latest !== 'string' || latest.length === 0) {
        // 필드 부재 또는 비문자열 → null
        return null
      }

      return latest
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * 에이전트 실행 시작.
   * AgentRun을 즉시 반환 (비동기 스트리밍은 events 소비 시 시작).
   *
   * ADR-019: 캐시 setter 콜백(onCommandsCaptured)을 ClaudeAgentRun에 주입한다.
   * run 내부에서 supportedCommands가 캡처되면 wsKey별 _commandsCache에 기록.
   */
  start(req: AgentRunInput): AgentRun {
    const wsKey = req.workspaceRoot ?? ''
    const onCommandsCaptured = (cmds: SlashCommandInfo[]): void => {
      this._commandsCache.set(wsKey, cmds)
    }
    return new ClaudeAgentRun(
      req,
      this._queryFn,
      this._skillOverridesProvider,
      this._mcpDeniedProvider,
      onCommandsCaptured
    )
  }

  /**
   * 엔진이 실제 지원하는 슬래시 커맨드 목록(캡처된 캐시) 반환 (ADR-019).
   *
   * 동기 — _commandsCache 조회만(IO 없음).
   * 캡처 전·미지원이면 빈 배열(graceful).
   * workspaceRoot null/undefined → 빈 문자열 키(전역 캐시) 조회.
   *
   * CRITICAL(신뢰경계): 반환값은 캡처 시 이미 sanitize된 SlashCommandInfo[].
   * name·description(cap+개행 제거)·argHint·scope(='builtin')만. 시크릿/경로 0.
   */
  listSupportedCommands(workspaceRoot?: string | null): SlashCommandInfo[] {
    const key = workspaceRoot ?? ''
    return this._commandsCache.get(key) ?? []
  }
}
