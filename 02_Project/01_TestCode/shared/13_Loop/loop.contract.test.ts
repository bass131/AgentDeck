// M09 G4 — 앱 안 루프 IPC 묶음(loop)의 계약. invoke 여덟(열기·시작·상태·사람 판정·카드 답·세션 취소·래치 풀기·닫기)과
// push 하나(상태). 상태 응답과 push는 같은 LoopStatus 한 장이다. 2차분 화면은 이 계약만 보고 만든다.
import { describe, expect, it } from 'vitest'
import { API_ROUTES } from '../../../../02_Project/00_Source/shared/01_Ipc/apiRoutes'
import {
  IPC_CHANNELS,
  LOOP_CHANNELS,
  type LoopCard,
  type LoopEventKind,
  type LoopStatus,
  type MainChatView,
  type PayloadOf,
  type ReqOf,
  type ResOf,
} from '../../../../02_Project/00_Source/shared/ipcContract'

const STATUS: LoopStatus = {
  cwd: 'C:/work/practice', root: 'C:/work/practice', phase: 'waiting-human', milestoneId: 'M1', node: 'spec-approval',
  nodeTitle: '스펙 승인', reason: null, base: 'main', ghRepo: 'github.com/o/r', failCount: 0, goals: [],
  approval: { node: 'spec-approval', title: '스펙 승인', spec: '# M1', sha256: 'a'.repeat(64) },
  milestonePr: null, cards: [], sessionActive: false, lastVerdict: null, latch: null, paused: false, mainBusy: false, mainWaiting: false,
}

describe('loop IPC 묶음 (M09 G4)', () => {
  it('채널 이름 — invoke 열둘과 push 셋(M10 G2: 메인 대화 읽기·보내기·새로 열기, 메인 대화 push, 세션 사건 push. M10 G3: 깃발 내리기)', () => {
    expect(Object.values(LOOP_CHANNELS).sort()).toEqual([
      'loop.answerCard', 'loop.cancelSession', 'loop.close', 'loop.decide', 'loop.lowerFlag', 'loop.mainNew', 'loop.mainRead', 'loop.mainSend', 'loop.mainState',
      'loop.open', 'loop.releaseLatch', 'loop.sessionEvent', 'loop.start', 'loop.state', 'loop.status',
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
      mainRead: { kind: 'call', channel: 'loop.mainRead' },
      mainSend: { kind: 'call', channel: 'loop.mainSend' },
      mainNew: { kind: 'call', channel: 'loop.mainNew' },
      onMainState: { kind: 'push', channel: 'loop.mainState' },
      onSessionEvent: { kind: 'push', channel: 'loop.sessionEvent' },
      lowerFlag: { kind: 'call', channel: 'loop.lowerFlag' },
    })
  })

  // M10 G3 — 사람이 일시 정지 깃발을 내리는 길(판정 칸 없음)과 대상을 고른 취소(메인 턴 / 작업 세션)
  it('깃발 내리기는 cwd만, 취소는 cwd와 대상만 싣는다', () => {
    const lower: ReqOf<'loop.lowerFlag'> = { cwd: 'C:/work/practice' }
    const res: ResOf<'loop.lowerFlag'> = {
      ok: true,
      view: { cwd: lower.cwd, root: lower.cwd, sessionId: null, items: [], cards: [], busy: false, waitingUser: false, brainstorming: false, paused: false, queued: 0 },
    }
    const main: ReqOf<'loop.cancelSession'> = { cwd: lower.cwd, target: 'main' }
    const worker: ReqOf<'loop.cancelSession'> = { cwd: lower.cwd, target: 'worker' }
    expect([res.ok, main.target, worker.target]).toEqual([true, 'main', 'worker'])
    // @ts-expect-error 깃발 내리기는 판정을 싣지 못한다
    const forged: ReqOf<'loop.lowerFlag'> = { cwd: lower.cwd, verdict: 'pass' }
    void forged
    // @ts-expect-error 취소는 대상을 골라야 한다
    const bare: ReqOf<'loop.cancelSession'> = { cwd: lower.cwd }
    void bare
    // @ts-expect-error 대상은 메인 턴(main)과 작업 세션(worker)뿐이다
    const review: ReqOf<'loop.cancelSession'> = { cwd: lower.cwd, target: 'review' }
    void review
  })

  it('메인 대화 모양 (M10 G2) — 읽기·보내기·새로 열기는 cwd(보내기는 글)만 받고, 응답과 push는 같은 MainChatView다', () => {
    const view: MainChatView = {
      cwd: 'C:/work/practice', root: 'C:/work/practice', sessionId: 's1', cards: [], busy: false, waitingUser: true, brainstorming: true,
      paused: false, queued: 0,
      items: [
        { id: 'i1', at: '2026-11-19T00:00:00Z', kind: 'user', text: '범위는 덧셈', state: 'sent' },
        { id: 'i2', at: '2026-11-19T00:00:01Z', kind: 'assistant', text: '적었어', turn: 'user' },
        { id: 'i3', at: '2026-11-19T00:00:02Z', kind: 'event', event: { kind: 'goal-merged', node: 'merge', goal: 'G1', text: 'G1 병합' } },
        { id: 'i4', at: '2026-11-19T00:00:03Z', kind: 'notice', text: '새 메인 대화' },
      ],
    }
    const read: ReqOf<'loop.mainRead'> = { cwd: view.cwd }
    const send: ReqOf<'loop.mainSend'> = { cwd: view.cwd, text: '안녕' }
    const fresh: ReqOf<'loop.mainNew'> = { cwd: view.cwd }
    const res: ResOf<'loop.mainSend'> = { ok: true, view }
    const pushedView: PayloadOf<'loop.mainState'> = view
    const ev: PayloadOf<'loop.sessionEvent'> = {
      cwd: view.cwd, session: { key: 'main', kind: 'main', node: null, goal: null, sessionId: 's1' }, event: { type: 'text', delta: '안' },
    }
    expect([read.cwd, send.text, fresh.cwd, res.ok, pushedView.items.length, ev.session.kind]).toEqual([view.cwd, '안녕', view.cwd, true, 4, 'main'])
    // @ts-expect-error 메인 대화 보내기는 실행 상태·판정을 싣지 못한다
    const forged: ReqOf<'loop.mainSend'> = { cwd: view.cwd, text: 'x', verdict: 'pass' }
    void forged
  })

  // G2 독립 검수 — 메인의 일시 정지 깃발 사건(flag-raised·flag-lowered)은 사람이 멈춘 실행을 이어 간 사건(resumed)과 이름이 다르다.
  // 표가 종류 전부를 키로 가져야 컴파일된다 — 종류가 늘거나 줄면 이 표도 바뀐다
  it('실행기 사건의 종류 (M10 G2)', () => {
    const KINDS: Record<LoopEventKind, true> = {
      'node-start': true, 'node-end': true, fail: true, halt: true, error: true, 'goal-merged': true, 'milestone-pr': true,
      'spec-approved': true, 'spec-rejected': true, 'flag-raised': true, 'flag-lowered': true, resumed: true, backlog: true,
      latched: true, done: true,
    }
    expect(Object.keys(KINDS)).not.toContain('paused')
    // @ts-expect-error 「paused」는 사건 종류가 아니다(깃발은 flag-raised)
    const old: LoopEventKind = 'paused'
    void old
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
    // M10 G3 — 메인 대화의 카드는 상태에도 실리되 inChat 표시가 붙는다(답하는 곳은 메인 대화 화면 한 곳)
    const chatCard: LoopCard = { ...card, requestId: 'q2', inChat: true, restored: true }
    expect([chatCard.inChat, card.inChat]).toEqual([true, undefined])
    // @ts-expect-error inChat은 참·거짓이다
    const badChat: LoopCard = { ...card, inChat: 'yes' }
    void badChat
    expect([start.milestoneId, decide.verdict, answer.requestId, allow.response.kind, release.token, s.phase, d.ok, r.ok, pushed.node, card.kind])
      .toEqual(['M1', 'pass', 'q1', 'permission', 'b'.repeat(64), 'waiting-human', false, true, 'spec-approval', 'question'])
    // @ts-expect-error 「항상 허용」은 루프 카드에 없다
    const always: ReqOf<'loop.answerCard'> = { cwd: open.cwd, requestId: 'p1', response: { kind: 'permission', behavior: 'allow_always' } }
    void always
  })
})
