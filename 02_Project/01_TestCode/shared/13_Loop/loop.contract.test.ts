// M09 G4 — 앱 안 루프 IPC 묶음(loop)의 계약. invoke 여덟(열기·시작·상태·사람 판정·카드 답·세션 취소·래치 풀기·닫기)과
// push 하나(상태). 상태 응답과 push는 같은 LoopStatus 한 장이다. 2차분 화면은 이 계약만 보고 만든다.
import { describe, expect, it } from 'vitest'
import { API_ROUTES } from '../../../../02_Project/00_Source/shared/01_Ipc/apiRoutes'
import {
  IPC_CHANNELS,
  LOOP_CHANNELS,
  type LoopCard,
  type LoopStatus,
  type PayloadOf,
  type ReqOf,
  type ResOf,
} from '../../../../02_Project/00_Source/shared/ipcContract'

const STATUS: LoopStatus = {
  cwd: 'C:/work/practice', root: 'C:/work/practice', phase: 'waiting-human', milestoneId: 'M1', node: 'spec-approval',
  nodeTitle: '스펙 승인', reason: null, base: 'main', ghRepo: 'github.com/o/r', failCount: 0, goals: [],
  approval: { node: 'spec-approval', title: '스펙 승인', spec: '# M1', sha256: 'a'.repeat(64) },
  milestonePr: null, cards: [], sessionActive: false, lastVerdict: null, latch: null,
}

describe('loop IPC 묶음 (M09 G4)', () => {
  it('채널 이름 — invoke 여덟과 push 하나', () => {
    expect(Object.values(LOOP_CHANNELS).sort()).toEqual([
      'loop.answerCard', 'loop.cancelSession', 'loop.close', 'loop.decide', 'loop.open', 'loop.releaseLatch', 'loop.start', 'loop.state', 'loop.status',
    ])
    for (const v of Object.values(LOOP_CHANNELS)) expect(Object.values(IPC_CHANNELS)).toContain(v)
    // push는 상태 한 장 하나뿐이다 — 카드·승인·래치도 그 안에 실린다
    expect(LOOP_CHANNELS.LOOP_STATE).toBe('loop.state')
  })

  it('라우트 — loop 묶음에 요청 하나를 받는 invoke 여덟과 상태 구독 하나', () => {
    expect(API_ROUTES.loop).toEqual({
      open: { kind: 'call', channel: 'loop.open' },
      start: { kind: 'call', channel: 'loop.start' },
      status: { kind: 'call', channel: 'loop.status' },
      decide: { kind: 'call', channel: 'loop.decide' },
      answerCard: { kind: 'call', channel: 'loop.answerCard' },
      cancelSession: { kind: 'call', channel: 'loop.cancelSession' },
      releaseLatch: { kind: 'call', channel: 'loop.releaseLatch' },
      close: { kind: 'call', channel: 'loop.close' },
      onState: { kind: 'push', channel: 'loop.state' },
    })
  })

  it('요청·응답·push 모양이 계약 표에 있다', () => {
    const open: ReqOf<'loop.open'> = { cwd: 'C:/work/practice' }
    // G4 검수 중요 I5 — 화면은 CI 정책(필수 검사 이름)을 보내지 못한다
    // @ts-expect-error requiredChecks는 계약에 없다
    const withChecks: ReqOf<'loop.open'> = { cwd: 'C:/work/practice', requiredChecks: ['hard-gates'] }
    void withChecks
    const start: ReqOf<'loop.start'> = { cwd: open.cwd, milestoneId: 'M1' }
    const decide: ReqOf<'loop.decide'> = { cwd: open.cwd, verdict: 'pass', evidence: '봤다', specSha256: 'a'.repeat(64), expectNode: 'spec-approval' }
    const answer: ReqOf<'loop.answerCard'> = { cwd: open.cwd, requestId: 'q1', response: { kind: 'question', answers: [['예']] } }
    const allow: ReqOf<'loop.answerCard'> = { cwd: open.cwd, requestId: 'p1', response: { kind: 'permission', behavior: 'allow' } }
    const release: ReqOf<'loop.releaseLatch'> = { cwd: open.cwd, token: 'b'.repeat(64) }
    const s: ResOf<'loop.status'> = STATUS
    const d: ResOf<'loop.decide'> = { ok: false, reason: '스펙이 바뀌었다', status: STATUS }
    const r: ResOf<'loop.releaseLatch'> = { ok: true, status: STATUS }
    const pushed: PayloadOf<'loop.state'> = STATUS
    const card: LoopCard = { kind: 'question', requestId: 'q1', node: 'brainstorm', goal: null, text: '무엇을 만들까?', questions: [] }
    expect([start.milestoneId, decide.verdict, answer.requestId, allow.response.kind, release.token, s.phase, d.ok, r.ok, pushed.node, card.kind])
      .toEqual(['M1', 'pass', 'q1', 'permission', 'b'.repeat(64), 'waiting-human', false, true, 'spec-approval', 'question'])
    // @ts-expect-error 「항상 허용」은 루프 카드에 없다
    const always: ReqOf<'loop.answerCard'> = { cwd: open.cwd, requestId: 'p1', response: { kind: 'permission', behavior: 'allow_always' } }
    void always
  })
})
