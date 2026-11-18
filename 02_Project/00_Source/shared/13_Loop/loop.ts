// M09 G4 — 앱 안 마일스톤 루프의 IPC 계약. main의 구동자(main/05_Loop/loopDriver.ts)가 저장소마다 실행기 하나를 돌리고,
// 화면은 이 묶음으로 열기·시작·사람 판정·카드 답·세션 취소·래치 풀기·닫기를 부르고 상태 push 하나를 듣는다.
// 상태(LoopStatus)는 status 응답과 loop.state push가 같은 한 장이다. 화면은 상태를 넣지 못한다 — 판정할 노드도 구동자가 저장본에서 고른다.
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

interface LoopCardBase { requestId: string; node: string; goal: string | null; text: string }
// 메인 노드(브레인스토밍) 세션의 카드. text는 그 세션의 최근 글이다. 세션이 끝나면 카드는 상태에서 빠진다.
export type LoopCard =
  | (LoopCardBase & { kind: 'question'; questions: AgentQuestion[] })
  | (LoopCardBase & { kind: 'permission'; toolName: string; summary: string })

// 스펙 승인 카드 — spec 본문과 그 sha256. 판정(decide)은 이 sha256을 함께 보내야 받는다(파일이 바뀌었으면 거부)
export interface LoopApproval { node: string; title: string; spec: string | null; sha256: string | null }

// 위조 래치 — reason(사유), file(래치 파일), changed(바뀐 설정 키·파일), state(지금 상태 파일 요약), token(풀기 요청에 싣는다).
// 풀기는 사람이 본 이 내용에 묶인다 — 그 사이 무엇이 바뀌면 token이 달라져 거부된다.
export interface LoopLatch { reason: string; file: string | null; changed: string[]; state: string | null; token: string }

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
}

// requiredChecks: CI 판정에 쓸 검사 이름. 기본은 ['hard-gates']
export interface LoopOpenRequest { cwd: string; requiredChecks?: string[] }
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
