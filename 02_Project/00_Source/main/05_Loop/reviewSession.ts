// 모델 게이트(독립 검수)의 실물 포트. 검수마다 구현 문맥이 없는 새 세션을 연다.
//   - 입력: 실행기가 준 goal 문서와 diff(작업 트리 대 마일스톤 브랜치, 실행기가 임시 인덱스에서 만든 것), 있으면 Taste 체크리스트뿐이다.
//     마일스톤 id·goal 제목·작업 세션의 대화는 싣지 않는다. 세션은 작업 저장소를 읽어 확인할 수 있다.
//   - 실행 입력: 앱 「자동」 모드, 자격 없는 환경, 루프 잠금의 읽기 전용 꼴(loopLock readOnly — 저장소 쓰기·git 쓰기 하위 명령·
//     내려받기·패키지 설치 거부, 원격 쓰기·자격 꺼내기·MCP 거부는 작업 노드와 같다), 사용자 MCP 서버 없음(sdkOptions strictMcpConfig).
//     잠금은 claude-code 백엔드에서만 붙으므로 다른 백엔드는 열지 않는다(stop — 설정 문제라 FAIL로 세지 않는다).
//   - 판정: 마지막 메시지의 마지막 비지 않은 줄이 정확히 `VERDICT: pass` 또는 `VERDICT: fail`일 때만 센다. 그 밖은 fail이다.
//     오류·done 없이 닫힘·시간 초과·열기 실패는 fail, 취소(실행기 닫기·화면의 취소)는 stop이다.
//   - 카드(권한·질문)는 거부·무응답이다 — 사람이 없는 세션이다.
// pass를 검수한 트리에 묶는 일(검수 뒤 트리 대조, 커밋·push 전 대조)은 실행기(loopRunner)가 한다.
import type { AgentBackend } from '@main/03_Agent/AgentBackend'
import type { AgentEvent } from '@shared/agentEvents'
import type { LoopSessionTag } from '@shared/13_Loop/loop'
import type { ReviewPort, ReviewRequest } from './ports'
import type { TasteConflict } from './runState'
import { DOCS, goalDocPath } from './survivalDocs'
import { isTasteLine, judgeTaste, renderChecklist, tasteFailReasons, tasteHead } from './tasteVerdict'
import { DEFAULT_SESSION_TIMEOUT_MS, denyCards, nextSessionKey, oneLine, runNodeSession, taggedEvents } from './workSession'

const DEFAULT_REVIEW_TIMEOUT_MS = 30 * 60_000
// 검증 줄은 400자에서 잘리고 실행기가 pass 근거 끝에 검수 트리(17자)를 붙인다
const EVIDENCE_MAX = 380

export interface ReviewSessionOptions {
  backend: AgentBackend
  cwd: string
  // 자격 없는 자식 환경(childEnv.ts)
  env: NodeJS.ProcessEnv
  appLoopDir: string
  timeoutMs?: number
  model?: string
  effort?: string
  signal?: AbortSignal
  // 세션 꼬리표(kind review)와 함께 흘린다
  onEvent?: (e: AgentEvent, tag: LoopSessionTag) => void
  // 한도 사건의 시각을 거르는 벽시계(ms). 기본은 Date.now
  now?: () => number
}

// 정확히 일치만 받는다(대소문자·띄어쓰기 구분). 줄 앞뒤 공백만 무시한다.
const PASS_LINE = 'VERDICT: pass'
const FAIL_LINE = 'VERDICT: fail'
const lastLineOf = (text: string): string => text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '').at(-1) ?? ''

// 마지막 비지 않은 줄만 본다. 꼴이 정확하지 않으면 fail이다(모호한 통과를 통과로 읽지 않는다).
export function parseVerdict(text: string): 'pass' | 'fail' {
  return lastLineOf(text) === PASS_LINE ? 'pass' : 'fail'
}

// 울타리는 안에 싣는 글의 가장 긴 backtick 줄보다 길게 한다(안의 ``` 줄이 울타리를 닫지 못하게)
function fence(...bodies: string[]): string {
  let longest = 0
  for (const b of bodies) for (const m of b.matchAll(/`+/g)) longest = Math.max(longest, m[0].length)
  return '`'.repeat(Math.max(3, longest + 1))
}

const INSTRUCTION = [
  '너는 독립 검수자다. 이 변경을 만든 대화는 보지 못했고, 아래 goal 문서와 diff만 받는다.',
  'goal 문서의 「만들 것」「건드릴 곳」「하지 않을 것」「관찰 가능한 완료조건」에 비추어 diff를 검수한다.',
  '저장소의 파일은 읽어서 확인해도 된다. 파일을 고치거나, 커밋·브랜치·설치·내려받기를 하지 않는다(잠금이 막는다).',
  '시험·타입체크·린트·빌드는 이 검수 앞의 검사 게이트(checks)가 이미 돌려 통과했다. 검수 세션은 시험이나 명령을 다시 돌리지 않는다 — 읽고 판단만 한다.',
  '완료조건을 채우지 못했거나, 범위 밖 변경이 있거나, 시험 없이 동작을 바꿨거나, 명백한 결함이 있으면 불통과다.',
].join('\n')

const FORMAT = [
  '## 답의 형식',
  '',
  '근거를 몇 줄로 쓰고, 맨 마지막 줄에는 아래 둘 중 하나만 그대로 쓴다. 그 줄 뒤에는 아무것도 쓰지 않는다.',
  '',
  'VERDICT: pass',
  'VERDICT: fail',
  '',
  '마지막 줄이 이 꼴이 아니면 불통과로 센다.',
].join('\n')

const TASTE_RULES = [
  '## Taste 체크리스트 (실행기가 마일스톤 시작점 커밋의 docs/agentdeck/Taste.md와 앱의 전역 Taste에서 읽었다)',
  '',
  'P-로 시작하는 항목은 프로젝트 Taste, G-로 시작하는 항목은 전역 Taste다. 두 층이 서로 다른 판정을 요구하면 프로젝트 Taste를 따른다.',
  '이 체크리스트만이 Taste 판정의 판이다. diff가 docs/agentdeck/를 바꿨거나 다른 곳에 실린 Taste 글이 이것과 달라도 이 체크리스트로 판정한다.',
  '금지 칸에 적힌 것이 결과물에 있으면 그 항목은 fail이다. 레퍼런스 칸은 링크·경로일 뿐이다 — 이미지를 열어 대조하지 않는다.',
].join('\n')

const TASTE_FORMAT = [
  '## 답의 형식',
  '',
  '근거를 몇 줄로 쓴다. 이어서 체크리스트의 항목마다 아래 꼴의 줄을 정확히 하나씩 쓴다. 줄 앞에 목록 기호·굵게·인용 같은 다른 글자를 붙이지 않는다.',
  '',
  'TASTE <ID>: pass — <근거 한 줄>',
  'TASTE <ID>: fail — <근거 한 줄>',
  'TASTE <ID>: n/a — <이 diff와 관계없는 까닭 한 줄>',
  '',
  '프로젝트 항목을 따르느라 전역 항목이 fail이 됐으면(프로젝트 항목은 pass, 전역 항목은 fail) 그 짝마다 아래 줄을 더한다.',
  '',
  'TASTE-CONFLICT <P-ID> <G-ID>: <한 줄>',
  '',
  '빠진 항목, 같은 ID의 두 줄, 체크리스트에 없는 ID, 꼴이 틀린 TASTE 줄이 있으면 불통과로 센다.',
  '위 충돌 줄로 프로젝트 쪽을 따른 전역 항목 말고 TASTE fail이 하나라도 있으면 VERDICT: pass라도 불통과다.',
  '',
  '맨 마지막 줄에는 아래 둘 중 하나만 그대로 쓴다. 그 줄 뒤에는 아무것도 쓰지 않는다.',
  '',
  'VERDICT: pass',
  'VERDICT: fail',
  '',
  '마지막 줄이 이 꼴이 아니면 불통과로 센다.',
].join('\n')

export function buildReviewPrompt(req: ReviewRequest): string {
  const goalPath = req.goal ? goalDocPath(req.goal.id) : `${DOCS.goalsDir}/(없음)`
  const goalDoc = req.goalDoc ?? '(goal 문서 없음)'
  const checklist = req.taste?.length ? `${renderChecklist(req.taste)}\n` : null
  // 울타리를 모두 같은 길이로 — 어느 쪽 안의 backtick 줄도 닫지 못한다
  const f = checklist === null ? fence(goalDoc, req.diff) : fence(goalDoc, req.diff, checklist)
  const diff = req.diff.endsWith('\n') ? req.diff : `${req.diff}\n`
  const doc = goalDoc.endsWith('\n') ? goalDoc : `${goalDoc}\n`
  return [
    INSTRUCTION,
    `## goal 문서 (${goalPath})\n\n${f}markdown\n${doc}${f}`,
    `## diff (작업 트리 대 ${req.base}의 goal 시작점 ${req.baseSha.slice(0, 12)}, 실행기가 만들었다)\n\n${f}diff\n${diff}${f}`,
    ...(checklist === null ? [FORMAT] : [`${TASTE_RULES}\n\n${f}markdown\n${checklist}${f}`, TASTE_FORMAT]),
  ].join('\n\n')
}

const DOCS_NOTE = 'diff가 docs/agentdeck/를 바꿨다(Taste의 판은 마일스톤 시작점 커밋의 원문이다)'
const OVERRULED = 'VERDICT는 pass였지만 Taste 판정으로 불통과'
const MODEL_FAILED = '검수 세션이 VERDICT: fail을 냈다'
// 머리가 길어도 이유(fail 근거·본문)는 이만큼 받는다
const REASON_MIN = 100

function fitEvidence(musts: string[], rest: string[], max: number): string {
  let out = musts.join(' — ')
  for (const part of rest) {
    const room = max - out.length - 3
    if (room < 12) break
    out += ` — ${part.length > room ? `${part.slice(0, room - 1)}…` : part}`
  }
  return out
}

function judged(text: string, req: ReviewRequest): { verdict: 'pass' | 'fail'; evidence: string; tasteConflicts?: TasteConflict[] } {
  const last = lastLineOf(text)
  const lastOk = last === PASS_LINE || last === FAIL_LINE
  const before = lastOk ? text.slice(0, text.lastIndexOf(last)) : text
  const said = lastOk ? '검수 세션' : '검수 세션의 마지막 줄이 VERDICT 꼴이 아니라 불통과로 셌다'
  const note = req.tasteDocsChanged ? [DOCS_NOTE] : []
  const items = req.taste ?? []
  if (items.length === 0) return { verdict: parseVerdict(text), evidence: [...note, `${said} — ${oneLine(before) || '근거 없음'}`].join(' — ') }
  const j = judgeTaste(items, text)
  const modelPass = parseVerdict(text) === 'pass'
  const verdictNote = modelPass ? (j.pass ? [] : [OVERRULED]) : [lastOk ? MODEL_FAILED : said]
  const others = [...verdictNote, ...note]
  const head = tasteHead(j, EVIDENCE_MAX - others.reduce((n, s) => n + s.length + 3, 0) - REASON_MIN - 3)
  const body = oneLine(before.split(/\r?\n/).filter((l) => !isTasteLine(l.trim())).join('\n')) || '근거 없음'
  return {
    verdict: modelPass && j.pass ? 'pass' : 'fail',
    evidence: fitEvidence([head, ...others], [...tasteFailReasons(j), `검수 세션 — ${body}`], EVIDENCE_MAX),
    tasteConflicts: j.conflicts,
  }
}

export function createReviewSessionPort(opts: ReviewSessionOptions): ReviewPort {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_REVIEW_TIMEOUT_MS
  let current: (() => boolean) | null = null
  return {
    async review(req) {
      if (opts.backend.id !== 'claude-code') {
        return { verdict: 'stop', evidence: `검수 세션은 루프 잠금을 붙일 수 있는 claude-code 백엔드로만 연다 — ${opts.backend.id}` }
      }
      if (opts.signal?.aborted) return { verdict: 'stop', evidence: '취소됐다 — 검수 세션을 열지 않았다' }
      const session = runNodeSession({
        backend: opts.backend,
        input: {
          messages: [{ role: 'user', content: buildReviewPrompt(req) }],
          workspaceRoot: opts.cwd,
          mode: 'auto',
          ...(opts.model !== undefined ? { model: opts.model } : {}),
          ...(opts.effort !== undefined ? { effort: opts.effort } : {}),
          env: opts.env,
          loopLock: { repoRoot: opts.cwd, appLoopDir: opts.appLoopDir, readOnly: true },
        },
        timeoutMs: timeoutMs > 0 ? timeoutMs : DEFAULT_SESSION_TIMEOUT_MS,
        signal: opts.signal,
        onCard: denyCards,
        cardContext: { node: req.node.id, goal: req.goal?.id ?? null },
        onEvent: taggedEvents(opts.onEvent, { key: nextSessionKey(), kind: 'review', node: req.node.id, goal: req.goal?.id ?? null }),
        ...(opts.now ? { now: opts.now } : {}),
      })
      current = session.cancel
      try {
        const end = await session.done
        const limit = end.limit ? { limit: end.limit } : {}
        switch (end.kind) {
          // end.text는 마지막 최상위 메시지의 글이다(runNodeSession — 최상위 도구 호출 뒤 글이 없으면 빈 글)
          case 'done': return { ...judged(end.text, req), ...limit }
          case 'error': return { verdict: 'fail', evidence: oneLine(`검수 세션 오류 — ${end.error}`), ...limit }
          case 'cancelled': return { verdict: 'stop', evidence: '검수 세션이 취소됐다 — 사람이 이어 가기로 다시 돌린다', ...limit }
          case 'limited': return { verdict: 'stop', evidence: '검수 세션이 사용량 한도 사건을 받아 멈췄다', ...limit }
          case 'timeout': return { verdict: 'fail', evidence: `검수 세션 시간 초과(${Math.round(end.timeoutMs / 1000)}초)`, ...limit }
          case 'start-failed': return { verdict: 'fail', evidence: oneLine(`검수 세션을 열지 못했다 — ${end.error}`) }
        }
      } finally {
        if (current === session.cancel) current = null
      }
    },
    cancel: () => (current ? current() : false),
  }
}
