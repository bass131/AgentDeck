// 화면은 상태를 넣지 못한다 — 판정할 노드도 main의 구동자가 저장본에서 고른다.
import type { AgentEvent } from '../agentEvents'
import type { AgentQuestion } from '../03_Agent/events/interaction'
import type { FileTreeNode } from '../07_Workspace/workspace'
import type { TasteCut, TasteDialogScope, TasteDraft, TastePrNote } from '../14_Taste/taste'

export const LOOP_CHANNELS = {
  LOOP_OPEN: 'loop.open',
  LOOP_START: 'loop.start',
  LOOP_STATUS: 'loop.status',
  LOOP_DECIDE: 'loop.decide',
  LOOP_ANSWER_CARD: 'loop.answerCard',
  LOOP_CANCEL_SESSION: 'loop.cancelSession',
  LOOP_RELEASE_LATCH: 'loop.releaseLatch',
  LOOP_CLOSE: 'loop.close',
  LOOP_STATE: 'loop.state',
  LOOP_MAIN_READ: 'loop.mainRead',
  LOOP_MAIN_SEND: 'loop.mainSend',
  LOOP_MAIN_NEW: 'loop.mainNew',
  LOOP_MAIN_STATE: 'loop.mainState',
  LOOP_SESSION_EVENT: 'loop.sessionEvent',
  // 판정 칸이 없다 — 사람 판정 decide를 대신하지 않는다
  LOOP_LOWER_FLAG: 'loop.lowerFlag',
  LOOP_SESSION_LOG: 'loop.sessionLog',
  LOOP_MAIN_ARCHIVES: 'loop.mainArchives',
  LOOP_GRAPH: 'loop.graph',
  LOOP_ALERTS: 'loop.alerts',
  LOOP_ALERTS_STATE: 'loop.alertsState',
  LOOP_ALERT_OPEN: 'loop.alertOpen',
  // 열린 루프의 작업 폴더를 읽는다(채팅 모드의 폴더와 따로)
  LOOP_LIST_DIR: 'loop.listDir',
  LOOP_TASTE_OPEN: 'loop.tasteOpen',
} as const

// ok: 그 작업 폴더의 실행기가 열려 있고 경로가 작업 저장소 뿌리 아래다. 아니면 목록 없이 거짓이다(빈 폴더와 다르다)
export interface LoopListDirRequest { cwd: string; relDir: string }
export interface LoopListDirResponse { ok: boolean; entries: FileTreeNode[] }

// now(halted·latched·blocked)는 Windows 알림 한 번과 앱 안 표시, later(마일스톤 병합 대기)는 앱 안 표시만.
// key는 작업 폴더·phase·노드에서 만든다(사유 글은 넣지 않는다). 그 상태를 벗어나면 목록에서 빠진다.
export interface LoopAlert { key: string; cwd: string; phase: LoopPhase; node: string | null; level: 'now' | 'later'; text: string }
export interface LoopAlertList { alerts: LoopAlert[] }
export interface LoopAlertOpen { cwd: string }

// closed       열린 실행기가 없다(열기 전·닫은 뒤)
// open-failed  열지 못했다(reason). 설정 차이로 못 열었으면 latch가 있다 — 사람이 확인하고 풀면 그 차이를 새 기준선으로 연다
// not-started  열렸고 실행 상태가 없다 — start로 시작한다
// running      노드를 돌고 있다(sessionActive면 작업·검수 세션이 떠 있다)
// waiting-human 사람을 기다린다 — approval(스펙 승인)이나 milestonePr(마일스톤 PR 병합)
// waiting-ci   CI를 기다린다(구동자가 간격을 두고 다시 본다)
// halted       멈췄다(FAIL 셋·취소·실행기가 만든 판정 거부 등, reason) — 사람의 이어 가기(decide pass)로 같은 노드를 다시 돈다
// latched      위조 래치(상태 파일 위조·실행기 git 설정 변경, latch) — 사람이 확인하고 푼다(releaseLatch)
// blocked      진행할 수 없다(스키마·템플릿 해시·기준 브랜치 불일치·자동 모드 허용 노드 꺼짐 등, reason)
// done         마일스톤이 끝났다
export type LoopPhase =
  | 'closed' | 'open-failed' | 'not-started' | 'running' | 'waiting-human' | 'waiting-ci' | 'halted' | 'latched' | 'blocked' | 'done'

// restored: 앱이 꺼질 때 답을 받지 못해 다시 묻는 카드. 그 질문을 낸 턴은 이미 끝났으므로 답은 메인 대화의 사용자 턴으로 간다.
// inChat: LoopStatus.cards에도 실리지만(현황판이 보인다) 답하는 곳은 메인 대화 화면 한 곳뿐이다.
interface LoopCardBase { requestId: string; node: string; goal: string | null; text: string; restored?: boolean; inChat?: boolean }
// node는 브레인스토밍 노드, 브레인스토밍 밖의 턴이면 'main'이다. 세션이 끝나면 카드는 상태에서 빠진다.
// taste: 메인이 제안하고 앱이 검사를 통과시킨 문서 초안. 세션과 무관하게 남고(재기동 뒤에도), 사람의 확정·반려로만 빠진다.
//   preview는 확정하면 쓸 원문, confirming은 확정 쓰기가 도는 중, refused는 지난 확정이 쓰지 않은 이유다.
export type LoopCard =
  | (LoopCardBase & { kind: 'question'; questions: AgentQuestion[] })
  | (LoopCardBase & { kind: 'permission'; toolName: string; summary: string })
  | (LoopCardBase & { kind: 'taste'; draft: TasteDraft; preview: string; confirming?: boolean; refused?: string; cut?: TasteCut })

// 판정(decide)은 이 sha256을 함께 보내야 받는다(파일이 바뀌었으면 거부)
export interface LoopApproval { node: string; title: string; spec: string | null; sha256: string | null }

// 풀기는 사람이 본 이 내용에 묶인다 — 그 사이 무엇이 바뀌면 token이 달라져 거부된다.
// restore: 상태 위조 래치를 풀면 되돌릴 사본(실행기가 마지막으로 쓴 상태 본문). 사본이 없으면 null이고 그 래치는 풀지 않는다.
export interface LoopLatch { reason: string; file: string | null; changed: string[]; state: string | null; restore: string | null; token: string }

export interface LoopGoalView { id: string; title: string; status: 'pending' | 'active' | 'done'; grade: 'strong' | 'weak' | null; pr: number | null }

export interface LoopStatus {
  // 화면이 연 경로(키)와 작업 저장소 뿌리
  cwd: string
  root: string | null
  phase: LoopPhase
  milestoneId: string | null
  // `G1/implement` 꼴
  node: string | null
  nodeTitle: string | null
  reason: string | null
  // 사람을 부르지 않는 안내 한 줄 — 강조·알림 없이 보인다
  notice?: string
  base: string | null
  ghRepo: string | null
  failCount: number
  goals: LoopGoalView[]
  approval: LoopApproval | null
  // 화면의 병합 버튼은 사람의 길이다 — 헌법 10조
  milestonePr: number | null
  cards: LoopCard[]
  sessionActive: boolean
  lastVerdict: { node: string; verdict: 'pass' | 'fail' | 'stop'; evidence: string } | null
  latch: LoopLatch | null
  // 지금 노드가 끝나면 다음 노드로 가지 않는다. 실행 상태·검증 기록과 무관하다
  paused: boolean
  mainBusy: boolean
  // 브레인스토밍 중 턴이 끝나고 사람의 다음 말을 기다린다(FAIL이 아니다)
  mainWaiting: boolean
  // 참이면 sessionActive의 세션은 작업 세션이 아니라 브레인스토밍 중인 메인 대화다
  mainNode: boolean
  recentLines: LoopVerificationLine[]
  sessions: LoopSessionRow[]
}

export interface LoopVerificationLine { marker: 'PASS' | 'FAIL' | 'USER-INPUT'; at: string; node: string; goal: string | null; sentence: string }
export interface LoopSessionRow { key: string; kind: 'work' | 'review'; node: string | null; goal: string | null; live: boolean }

// 실행기가 모델 없이 만든 한 줄. 메인은 경계(goal-merged, halt, milestone-pr)에서만 짧은 턴으로 말한다.
// flag-raised·flag-lowered는 메인 도구의 일시 정지 깃발, resumed는 사람이 멈춘 실행을 이어 간 판정이다.
export type LoopEventKind =
  | 'node-start' | 'node-end' | 'fail' | 'halt' | 'error' | 'goal-merged' | 'milestone-pr'
  | 'spec-approved' | 'spec-rejected' | 'flag-raised' | 'flag-lowered' | 'resumed' | 'backlog' | 'latched' | 'done'
export interface LoopEventItem {
  kind: LoopEventKind
  node: string | null
  goal: string | null
  text: string
  verdict?: 'pass' | 'fail' | 'stop'
}
export type MainTurnKind = 'user' | 'start' | 'rejected' | 'event' | 'card-answer'
// user의 state: queued(줄 서 있음) → sent(세션에 넘김). 재기동 때 queued는 다시 줄을 선다.
// proxy: 사람이 아니라 위임받은 대리인이 보낸 글
export type MainChatItem =
  | { id: string; at: string; kind: 'user'; text: string; state: 'queued' | 'sent'; proxy?: boolean }
  | { id: string; at: string; kind: 'assistant'; text: string; turn: MainTurnKind }
  | { id: string; at: string; kind: 'event'; event: LoopEventItem }
  | { id: string; at: string; kind: 'notice'; text: string }
export interface MainChatView {
  cwd: string
  // 열린 실행기가 없으면 null — 기록만 읽히고 턴은 열린 뒤에 돈다
  root: string | null
  // 새 메인 대화가 장을 바꿀 때마다 바뀐다(세션 id는 null에서 null로 남을 수 있다). 닫힌 폴더의 보기는 ''
  chapter: string
  sessionId: string | null
  items: MainChatItem[]
  cards: LoopCard[]
  busy: boolean
  waitingUser: boolean
  brainstorming: boolean
  paused: boolean
  // 돌고 있는 턴 제외
  queued: number
  // 프로젝트 문서 확정이 마지막으로 연 PR(열려 있을 수 있다)
  tastePr?: TastePrNote
}
export interface LoopMainSendRequest { cwd: string; text: string; proxy?: boolean }
// 「문답 열기」 — 여는 턴의 글은 main이 지금 문서 원문과 꼴 규칙으로 만든다(화면은 범위만 보낸다)
export interface LoopTasteOpenRequest { cwd: string; scope: TasteDialogScope }
export interface LoopMainResponse { ok: boolean; reason?: string; view: MainChatView }
// key는 앱이 정한 세션 이름(메인 대화는 'main'), sessionId는 SDK가 알린 세션 id(아직 모르면 null)다.
export interface LoopSessionTag { key: string; kind: 'main' | 'work' | 'review'; node: string | null; goal: string | null; sessionId: string | null }
// 스냅숏의 next보다 작은 seq는 스냅숏에 이미 있다. 스냅숏은 조각을 이어 붙여 두므로 events.length는 next보다 작을 수 있다
export interface LoopSessionEventPayload { cwd: string; session: LoopSessionTag; event: AgentEvent; seq: number }
export interface LoopSessionRecord { session: LoopSessionTag; events: AgentEvent[]; next: number; truncated: boolean; live: boolean }
export interface LoopSessionLog { cwd: string; sessions: LoopSessionRecord[] }
export interface MainChatArchive { id: string; at: string; items: MainChatItem[] }
export interface MainChatArchives { cwd: string; archives: MainChatArchive[] }

// CI 판정에 쓸 필수 검사 이름은 main이 고정한다. 화면은 보내지 못한다.
export interface LoopOpenRequest { cwd: string }
export interface LoopStartRequest { cwd: string; milestoneId: string }
export interface LoopCwdRequest { cwd: string }
export type LoopCancelTarget = 'main' | 'worker'
export interface LoopCancelRequest { cwd: string; target: LoopCancelTarget }
// expectNode: 화면이 본 노드. 주면 지금 노드와 다를 때 거부한다
export interface LoopDecideRequest { cwd: string; verdict: 'pass' | 'fail'; evidence: string; specSha256?: string; expectNode?: string }
export interface LoopDecideResponse { ok: boolean; reason?: string; status: LoopStatus }
export type LoopCardResponse =
  | { kind: 'permission'; behavior: 'allow' | 'deny' }
  | { kind: 'question'; answers: string[][] | null }
  | { kind: 'taste'; decision: 'confirm' }
  | { kind: 'taste'; decision: 'reject'; reason: string }
export interface LoopAnswerCardRequest { cwd: string; requestId: string; response: LoopCardResponse }
export interface LoopOkResponse { ok: boolean }
export interface LoopReleaseLatchRequest { cwd: string; token: string }
export interface LoopReleaseLatchResponse { ok: boolean; reason?: string; status: LoopStatus }
