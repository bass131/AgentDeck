// M09 G4 — 앱 안 마일스톤 루프의 IPC 계약. main의 구동자(main/05_Loop/loopDriver.ts)가 저장소마다 실행기 하나를 돌리고,
// 화면은 이 묶음으로 열기·시작·사람 판정·카드 답·세션 취소·래치 풀기·닫기를 부르고 상태 push 하나를 듣는다.
// 상태(LoopStatus)는 status 응답과 loop.state push가 같은 한 장이다. 화면은 상태를 넣지 못한다 — 판정할 노드도 구동자가 저장본에서 고른다.
// M10 G2 — 메인 대화(작업 폴더마다 하나, main이 소유): 읽기·사용자 턴·새 메인 대화 invoke 셋과 메인 대화 push, 세션 사건 push.
//   카드 답은 loop.answerCard 하나다(메인 대화의 질문 카드도 LoopStatus.cards와 MainChatView.cards에 같은 id로 실린다).
import type { AgentEvent } from '../agentEvents'
import type { AgentQuestion } from '../03_Agent/events/interaction'

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
} as const

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

// restored: 앱이 꺼질 때 답을 받지 못해 다시 묻는 카드(M10 G2). 그 질문을 낸 턴은 이미 끝났으므로 답은 메인 대화의 사용자 턴으로 간다.
interface LoopCardBase { requestId: string; node: string; goal: string | null; text: string; restored?: boolean }
// 메인 노드(브레인스토밍) 세션의 카드. text는 그 세션의 최근 글이다. 세션이 끝나면 카드는 상태에서 빠진다.
// M10 G2 — 메인 대화의 카드다(node는 브레인스토밍 노드, 브레인스토밍 밖의 턴이면 'main').
export type LoopCard =
  | (LoopCardBase & { kind: 'question'; questions: AgentQuestion[] })
  | (LoopCardBase & { kind: 'permission'; toolName: string; summary: string })

// 스펙 승인 카드 — spec 본문과 그 sha256. 판정(decide)은 이 sha256을 함께 보내야 받는다(파일이 바뀌었으면 거부)
export interface LoopApproval { node: string; title: string; spec: string | null; sha256: string | null }

// 위조 래치 — reason(사유), file(래치 파일), changed(바뀐 설정 키·파일), state(지금 상태 파일 요약), token(풀기 요청에 싣는다).
// 풀기는 사람이 본 이 내용에 묶인다 — 그 사이 무엇이 바뀌면 token이 달라져 거부된다.
// changed: 바뀐 설정 키(값·출처 파일 포함 — G4 검수 B1)와 바뀐 파일 경로. restore: 상태 위조 래치를 풀면 되돌릴 사본(실행기가
// 마지막으로 쓴 상태 본문 — G4 검수 I1). 사본이 없으면 null이고 그 래치는 풀지 않는다.
export interface LoopLatch { reason: string; file: string | null; changed: string[]; state: string | null; restore: string | null; token: string }

export interface LoopGoalView { id: string; title: string; status: 'pending' | 'active' | 'done'; grade: 'strong' | 'weak' | null; pr: number | null }

export interface LoopStatus {
  // 화면이 연 경로(키)와 작업 저장소 뿌리
  cwd: string
  root: string | null
  phase: LoopPhase
  milestoneId: string | null
  // 지금 노드(`G1/implement` 꼴)와 제목
  node: string | null
  nodeTitle: string | null
  reason: string | null
  base: string | null
  ghRepo: string | null
  failCount: number
  goals: LoopGoalView[]
  approval: LoopApproval | null
  // 마일스톤 병합 게이트에서 기다리는 PR 번호(화면의 병합 버튼은 사람의 길이다 — 헌법 10조)
  milestonePr: number | null
  cards: LoopCard[]
  sessionActive: boolean
  lastVerdict: { node: string; verdict: 'pass' | 'fail' | 'stop'; evidence: string } | null
  latch: LoopLatch | null
  // M10 G2 — 구동자의 일시 정지 깃발(메인의 「멈춤」). 지금 노드가 끝나면 다음 노드로 가지 않는다. 실행 상태·검증 기록과 무관하다
  paused: boolean
  // M10 G2 — 메인 대화가 턴을 돌고 있다 / 브레인스토밍 중 턴이 끝나고 사람의 다음 말을 기다린다(FAIL이 아니다)
  mainBusy: boolean
  mainWaiting: boolean
}

// ── M10 G2 메인 대화 ──
// 실행기 사건 — 실행기가 모델 없이 만든 한 줄. 메인은 경계(goal-merged, halt, milestone-pr)에서만 짧은 턴으로 말한다.
// error는 구동자의 예외, flag-raised·flag-lowered는 메인 도구의 일시 정지 깃발, resumed는 사람이 멈춘 실행을 이어 간 판정이다(G2 독립 검수).
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
// 메인 대화의 한 턴이 무엇으로 시작됐나 — 사용자 글, 브레인스토밍 시작, 스펙 반려, 실행기 사건(경계), 다시 물은 카드의 답
export type MainTurnKind = 'user' | 'start' | 'rejected' | 'event' | 'card-answer'
// 대화 기록 한 줄. user의 state: queued(줄 서 있음) → sent(세션에 넘김). 재기동 때 queued는 다시 줄을 선다.
export type MainChatItem =
  | { id: string; at: string; kind: 'user'; text: string; state: 'queued' | 'sent' }
  | { id: string; at: string; kind: 'assistant'; text: string; turn: MainTurnKind }
  | { id: string; at: string; kind: 'event'; event: LoopEventItem }
  | { id: string; at: string; kind: 'notice'; text: string }
export interface MainChatView {
  cwd: string
  // 열린 실행기가 있으면 작업 저장소 뿌리. 없으면 null(기록만 읽힌다 — 턴은 열린 뒤에 돈다)
  root: string | null
  sessionId: string | null
  items: MainChatItem[]
  cards: LoopCard[]
  busy: boolean
  waitingUser: boolean
  brainstorming: boolean
  paused: boolean
  // 줄 서 있는 턴 수(돌고 있는 턴 제외)
  queued: number
}
export interface LoopMainSendRequest { cwd: string; text: string }
export interface LoopMainResponse { ok: boolean; reason?: string; view: MainChatView }
// 세션 사건 배선 — 루프 세션 하나(메인 대화·작업 노드·검수)의 AgentEvent를 세션 꼬리표와 함께 내보낸다(G4 노드 세션 탭이 같은 길을 쓴다).
// key는 앱이 정한 세션 이름(메인 대화는 'main'), sessionId는 SDK가 알린 세션 id(아직 모르면 null)다.
export interface LoopSessionTag { key: string; kind: 'main' | 'work' | 'review'; node: string | null; goal: string | null; sessionId: string | null }
export interface LoopSessionEventPayload { cwd: string; session: LoopSessionTag; event: AgentEvent }

// CI 판정에 쓸 필수 검사 이름은 main이 고정한다(['hard-gates'] — G4 검수 I5). 화면은 보내지 못한다.
export interface LoopOpenRequest { cwd: string }
export interface LoopStartRequest { cwd: string; milestoneId: string }
export interface LoopCwdRequest { cwd: string }
// 사람 판정 — 스펙 승인(specSha256 필수)·반려, 또는 멈춘 실행의 이어 가기(pass). 노드는 구동자가 저장본에서 고른다.
// expectNode: 화면이 본 노드. 주면 지금 노드와 다를 때 거부한다
export interface LoopDecideRequest { cwd: string; verdict: 'pass' | 'fail'; evidence: string; specSha256?: string; expectNode?: string }
export interface LoopDecideResponse { ok: boolean; reason?: string; status: LoopStatus }
export type LoopCardResponse = { kind: 'permission'; behavior: 'allow' | 'deny' } | { kind: 'question'; answers: string[][] | null }
export interface LoopAnswerCardRequest { cwd: string; requestId: string; response: LoopCardResponse }
export interface LoopOkResponse { ok: boolean }
export interface LoopReleaseLatchRequest { cwd: string; token: string }
export interface LoopReleaseLatchResponse { ok: boolean; reason?: string; status: LoopStatus }
