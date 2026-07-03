/**
 * sdkOptions.ts — Claude SDK query 옵션 조립 (RF1-followup P03: ClaudeCodeBackend에서 분리)
 *
 * 단일책임(SRP): AgentRunInput + run-level 의존(canUseTool/skillOverrides/mcpDenied/onUserDialog)을
 *   받아 SDK query() options 객체를 만든다. 단발(_runPump)·지속세션(_runPersistentPump) 펌프가
 *   *완전히 동일한* 옵션 블록을 각자 인라인으로 만들던 것을 한 함수로 합쳐(DRY) 드리프트를 막는다.
 *
 * 격리 원칙(ADR-003·CRITICAL): SDK 고유 형상(preset/append, settings/settingSources,
 *   supportedDialogKinds, refusal_fallback_prompt)은 이 파일 내부에만. 외부 계약/renderer엔
 *   누출 금지. (UC1-P02, ADR-032 ④: disallowedTools/'Workflow' 차단 계산은 이 파일에서
 *   제거됐다 — Workflow 상시 노출 + canUseTool 턴별 게이트[permissionCoordinator.ts]로 이동.)
 * 신뢰경계(CRITICAL): systemPrompt 내용을 로그에 출력하지 않는다. API 키는 SDK가 env에서 자동 처리.
 *
 * (원본 engine.ts L291~354 미러)
 */

import { existsSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { buildQueryOptions } from './run-args'
import { fallbackNotice } from './modelFallback'
import type { CanUseToolFn } from './permissionCoordinator'
import type { AgentRunInput } from './AgentBackend'
import type { AgentEvent } from '../../shared/agent-events'

// ── cwd 신뢰경계 검증 ──────────────────────────────────────────────────────────

/**
 * req.workspaceRoot(renderer가 IPC로 넘긴, untrusted 경로 문자열)를 SDK cwd로 쓰기 전 검증한다
 * (LR1 Phase03 갈래B-2, trust-boundary). renderer는 폴더가 삭제·이동돼도 옛 경로를 그대로
 * 들고 있을 수 있어, main이 재검증 없이 SDK에 넘기면 resume이 엉뚱한 cwd-slug에서 세션을
 * 못 찾거나 오작동한다.
 *
 * 절대경로 + 실존 디렉토리일 때만 그대로 사용. 그 외(미전달/상대경로/존재하지 않는 경로/파일)는
 * process.cwd()로 폴백 — 유효 케이스·undefined 케이스는 현행과 동일(회귀 0).
 */
export function resolveSafeCwd(workspaceRoot?: string): string {
  if (!workspaceRoot || !isAbsolute(workspaceRoot)) return process.cwd()
  try {
    if (!existsSync(workspaceRoot)) return process.cwd()
    if (!statSync(workspaceRoot).isDirectory()) return process.cwd()
    return workspaceRoot
  } catch {
    return process.cwd()
  }
}

// ── 오케스트레이션 시스템 가이드 ───────────────────────────────────────────────

/**
 * 오케스트레이션 모드 시스템 가이드 (UltraCode — Workflow + Task 서브에이전트 "둘 다").
 *
 * UC1-P02(ADR-032 ④): orchestration 값과 무관하게 systemPrompt.append에 **상시** 합성된다.
 * 이유: held-open 세션(REPL)은 systemPrompt를 세션 생성 시 한 번만 고정한다 — 이후 턴에서
 * 토글/키워드로 orchestration이 켜져도 이미 고정된 append는 바꿀 수 없다. 그래서 이 가이드는
 * "지금 켜져 있다"가 아니라 "이 도구들은 이런 조건의 턴에서만 쓸 수 있다"는 조건부 사용법으로
 * 서술한다 — 실제 허용/거부는 canUseTool 게이트(permissionCoordinator.makeCanUseTool, 턴별
 * 라이브 판정)가 맡는다. 모델에게 복잡/병렬 작업을 두 가지 도구로 오케스트레이션할 수 있음을
 * 안내한다:
 *  - Task 서브에이전트: 격리 컨텍스트·실시간 관측·결과가 tool_result로 메인 복귀(합성/검증에 적합).
 *    orchestration 상태와 무관하게 항상 사용 가능(READONLY_TOOLS, permissionCoordinator.ts).
 *  - Workflow: 결정적 다중에이전트 구조(팬아웃/파이프라인/대량 반복). 백그라운드 실행 후 결과 복귀.
 *    사용자가 UltraCode를 켰거나(지속 토글) 이 메시지에서 명시 요청("UltraCode"/"/workflows" 언급)
 *    한 턴에서만 실제로 진행된다(사용자 승인 필요) — 그 외 턴에 호출을 시도해도 즉시 거부된다(G4).
 *
 * CRITICAL(ADR-003): 이 상수는 어댑터 내부에만. 인터페이스·IPC·renderer에 누출 금지.
 * 테스트가 이 export를 import해 append 포함 여부를 단정한다.
 * (ClaudeCodeBackend가 이 export를 re-export해 기존 import 경로를 보존한다.)
 */
export const ORCHESTRATION_SYSTEM_GUIDE =
  'For complex, broad, or parallelizable work (large audits, multi-file migrations, comprehensive ' +
  'reviews, or research), you can act as an orchestrator and pick the right tool for the job:\n' +
  '- Use the Task tool to delegate independent or parallelizable parts to subagents — launch several ' +
  'in a single step so they run in parallel when their work is independent. Each subagent runs in its ' +
  'own isolated context, is observable while it works, and returns its findings to you, so you can ' +
  'synthesize the results and continue (for example, a separate subagent to verify or cross-check the others).\n' +
  '- Use the Workflow tool for larger, structured multi-agent orchestration (deterministic fan-out, ' +
  'pipelines, or loops over many items). A Workflow runs in the background and its result returns to you ' +
  'when it completes; each Workflow invocation requires explicit user approval before it runs.\n' +
  'Workflow orchestration only works on turns where the user has UltraCode turned on (a persistent ' +
  'toggle) or has explicitly asked for it in this message (mentioning "UltraCode" or "/workflows") — on ' +
  'any other turn, calling Workflow will be rejected even if you try, so do not attempt it unless one of ' +
  'those conditions holds for the current turn.\n' +
  'Break the work into a clear plan with TodoWrite and keep it updated so progress stays visible. ' +
  'Prefer parallel delegation for breadth and independent verification over doing everything yourself in one context.'

// ── 대화 연속성 안내 (resume disclaimer 억제) ───────────────────────────────────

/**
 * MEMORY_CONTINUITY_GUIDE (LR1 §8 · ADR-029 연장 — ADR-013 순수충실서 의도적 이탈, resume 세션 한정):
 * resume으로 이전 맥락이 복원된 대화에서 모델이 "과거 대화 기억 못 한다"는 거짓 disclaimer를 뱉지 않도록 하는 안내.
 * resumeSessionId가 있을 때만 systemPrompt.append에 합성한다. (컨텍스트 없는 내용 confabulation 방지 문구 포함)
 *
 * CRITICAL(ADR-003): 이 상수는 어댑터 내부에만. 인터페이스·IPC·renderer에 누출 금지.
 * orchestration 여부와 독립 — 비orchestration + resume 조합에도 반드시 합성돼야 한다.
 */
export const MEMORY_CONTINUITY_GUIDE = [
  '[대화 연속성]',
  '이 대화는 세션 재개(resume)로 이어지고 있습니다. 당신의 컨텍스트에 보이는 이전 메시지들은',
  '이 사용자와 실제로 나눈 대화이며, 앱이 재시작·날짜 변경을 넘어 자동으로 복원한 것입니다.',
  '그것을 당신의 기억으로 취급해 자연스럽게 이어가세요. 사용자가 "이전 대화 기억해?"처럼 물어도,',
  '컨텍스트에 이전 메시지가 있는 한 "과거 대화를 기억하지 못한다"고 답하지 마세요 — 실제로 기억하고',
  '있으니 그 내용에 근거해 답하면 됩니다. 단, 컨텍스트에 실제로 없는 내용은 지어내지 말고 모른다고 하세요.',
].join('\n')

// ── refusal-fallback 다이얼로그 핸들러 ─────────────────────────────────────────

/**
 * onUserDialog 콜백이 반환하는 SDK 다이얼로그 응답.
 */
type DialogResult =
  | { behavior: 'cancelled' }
  | { behavior: 'completed'; result: string }

/**
 * onUserDialog 콜백 시그니처.
 */
export type OnUserDialogFn = (
  dlg: { dialogKind: string; payload?: Record<string, unknown> }
) => Promise<DialogResult>

/**
 * makeRefusalFallbackHandler가 의존하는 normalizer 최소 형상(구조적 타입).
 * RunEventNormalizer를 직접 import하지 않아 결합을 느슨하게 유지한다.
 */
interface RefusalNormalizer {
  incrementPendingFallback(): void
  resetCurTextId(): void
  readonly curTextId: string | null
}

/**
 * refusal_fallback_prompt 자동 수락 onUserDialog 핸들러 생성 (Phase 32, 원본 engine.ts L329-354 미러).
 *
 * SDK가 Fable 5 안전정책 거부 시 이 dialog를 발화한다. 선언하지 않으면 turn이 그냥 죽음.
 * 선언 + auto-accept('retry_fallback') → 폴백 모델로 재시도.
 *
 * 동작:
 *  - dialogKind !== 'refusal_fallback_prompt' → 'cancelled'(SDK 기본동작 적용). 원본 L333 미러.
 *  - refusal_fallback_prompt → pendingFallback 카운터 증가(system 경로 dedup) + model-fallback push
 *    (retractMessageId = 현재 텍스트 블록 id) + curTextId 리셋 + 'completed'/retry_fallback.
 *
 * 신뢰경계: payload.originalModel/fallbackModel/apiRefusalCategory string만 추출.
 *   raw payload 객체를 events/logs에 흘리지 않는다.
 *
 * @param normalizer pendingFallback 카운터 + curTextId 접근(RunEventNormalizer 호환).
 * @param push model-fallback 이벤트를 events 큐로 내보내는 콜백.
 */
export function makeRefusalFallbackHandler(
  normalizer: RefusalNormalizer,
  push: (event: AgentEvent) => void
): OnUserDialogFn {
  return async (dlg) => {
    // 미지원 dialogKind → 'cancelled'(SDK 계약: 기본동작 적용). 원본 L333 미러.
    if (dlg.dialogKind !== 'refusal_fallback_prompt') {
      return { behavior: 'cancelled' as const }
    }
    const p = dlg.payload ?? {}
    // dedup 카운터 증가: system 경로가 나중에 같은 폴백을 emit하면 카운터 감소만 함.
    normalizer.incrementPendingFallback()
    push({
      type: 'model-fallback',
      fromModel: typeof p['originalModel'] === 'string' ? p['originalModel'] : '',
      toModel: typeof p['fallbackModel'] === 'string' ? p['fallbackModel'] : '',
      text: fallbackNotice(p['originalModel'], p['fallbackModel'], p['apiRefusalCategory']),
      // 거부 직전 스트리밍 중이던 버블 id (재시도 답변이 새 버블로 시작되도록).
      // null이면 이미 열린 버블 없음(텍스트 출력 전 거부). 원본 L348 미러.
      retractMessageId: normalizer.curTextId,
    })
    normalizer.resetCurTextId()
    return { behavior: 'completed' as const, result: 'retry_fallback' }
  }
}

// ── SDK 옵션 조립 ──────────────────────────────────────────────────────────────

/**
 * Claude SDK query() options 객체를 조립한다.
 *
 * 단발·지속세션 펌프가 공용으로 호출한다(prompt만 호출부에서 따로 전달). 결과는 분해 전
 * 인라인 sdkOptions와 키·값이 1:1 동일 — 거동 불변.
 *
 * @param req 실행 요청(model/effort/mode/workspaceRoot/systemPrompt/orchestration/resumeSessionId).
 * @param abortController SDK 스트림/도구 중단 신호.
 * @param canUseTool 권한 게이트 콜백(PermissionCoordinator.makeCanUseTool 산출).
 * @param skillOverrides disabled skill 'off' 맵 또는 null(미포함).
 * @param mcpDenied deniedMcpServers 목록 또는 null(미포함).
 * @param onUserDialog refusal-fallback 핸들러(makeRefusalFallbackHandler 산출).
 */
export function buildClaudeSdkOptions(params: {
  req: AgentRunInput
  abortController: AbortController
  canUseTool: CanUseToolFn
  skillOverrides: Record<string, 'off'> | null
  mcpDenied: { serverName: string }[] | null
  onUserDialog: OnUserDialogFn
}): Record<string, unknown> {
  const { req, abortController, canUseTool, skillOverrides, mcpDenied, onUserDialog } = params

  // SDK 옵션 빌드 (run-args의 allowlist 검증)
  const optionsPatch = buildQueryOptions({
    model: req.model,
    effort: req.effort,
    mode: req.mode
  })

  // permissionMode 결정: buildQueryOptions 결과 사용, 없으면 'default'.
  const permissionMode = optionsPatch.permissionMode ?? 'default'

  // systemPrompt append 합성 (UC1-P02 ADR-032 ④ + Phase 37 #4a + Phase 30 M2 + LR1 §8):
  // userAppend: 사용자가 전달한 커스텀 프롬프트(trim 후 빈 문자열이면 undefined).
  // ORCHESTRATION_SYSTEM_GUIDE는 orchestration 값과 무관하게 **상시** 합성한다 — held-open
  //   세션은 systemPrompt를 세션 생성 시 한 번만 고정하므로, 이후 턴에서 토글/키워드로
  //   orchestration이 켜져도 append를 바꿀 수 없다. 그래서 가이드 자체는 항상 넣고 사용
  //   조건을 문구로 서술하며, 실제 허용/거부는 canUseTool 게이트(permissionCoordinator.
  //   makeCanUseTool)가 턴마다 라이브로 판정한다.
  // resumeSessionId 있음 → MEMORY_CONTINUITY_GUIDE 합성(orchestration과 독립 — resume disclaimer 억제).
  // 셋 다 filter(Boolean)로 합성(순서: userAppend → orchestration guide → memory-continuity).
  const userAppend = req.systemPrompt?.trim() || undefined
  const appendStr = ([
    userAppend,
    ORCHESTRATION_SYSTEM_GUIDE,
    req.resumeSessionId ? MEMORY_CONTINUITY_GUIDE : undefined,
  ].filter(Boolean) as string[]).join('\n\n') || undefined

  return {
    ...optionsPatch,
    // cwd (LR1 Phase03 갈래B-2, trust-boundary): workspaceRoot는 renderer가 넘긴 untrusted 경로 —
    // 실존 절대경로 디렉토리일 때만 사용, 아니면 process.cwd() 폴백(resolveSafeCwd).
    cwd: resolveSafeCwd(req.workspaceRoot),
    abortController,
    // Phase 33 M5: includePartialMessages:true → stream_event 델타 수신 활성화.
    includePartialMessages: true,
    // systemPrompt (Phase 30 M2 + Phase 37 #4a + UC1-P02 — 원본 engine.ts L308-312 정밀 미러):
    // ORCHESTRATION_SYSTEM_GUIDE가 상시 합성되므로(위 참고) appendStr은 사실상 항상 존재하나,
    // 방어적으로 조건부 spread를 유지한다(회귀 0 — 가이드가 비게 될 리 없어 실질적 변화 없음).
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      ...(appendStr ? { append: appendStr } : {})
    },
    // disallowedTools 계산 없음(UC1-P02, ADR-032 ④): Workflow는 항상 모델에 노출된다.
    // 턴별 허용/거부는 canUseTool 게이트(permissionCoordinator.makeCanUseTool)가 라이브로 판정.
    // resume (Phase 1 맥락 복구, REPL_TRANSITION): resumeSessionId 있으면 세션 resume.
    ...(req.resumeSessionId ? { resume: req.resumeSessionId } : {}),
    // settings 핀 (canUseTool 발화 전제 + skillOverrides + deniedMcpServers):
    // 사용자 전역 settings.json의 permissions.defaultMode가 canUseTool 전에 선승인하지
    // 못하도록 composer가 고른 모드를 inline settings로 핀한다. (원본 engine.ts L291~313 미러)
    settings: {
      permissions: { defaultMode: permissionMode },
      ...(skillOverrides ? { skillOverrides } : {}),
      ...(mcpDenied ? { deniedMcpServers: mcpDenied } : {})
    },
    settingSources: ['user', 'project', 'local'],
    canUseTool,
    // refusal-fallback 폴백 다이얼로그 자동 수락 (Phase 32, 원본 engine.ts L329-354 미러).
    supportedDialogKinds: ['refusal_fallback_prompt'],
    onUserDialog,
  }
}
