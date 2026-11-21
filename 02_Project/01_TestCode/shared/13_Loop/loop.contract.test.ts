import { describe, expect, it } from 'vitest'
import { API_ROUTES } from '@shared/01_Ipc/apiRoutes'
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
} from '@shared/ipcContract'

const STATUS: LoopStatus = {
  cwd: 'C:/work/practice', root: 'C:/work/practice', phase: 'waiting-human', milestoneId: 'M1', node: 'spec-approval',
  nodeTitle: '스펙 승인', reason: null, base: 'main', ghRepo: 'github.com/o/r', failCount: 0, goals: [],
  approval: { node: 'spec-approval', title: '스펙 승인', spec: '# M1', sha256: 'a'.repeat(64) },
  milestonePr: null, cards: [], sessionActive: false, lastVerdict: null, latch: null, paused: false, mainBusy: false, mainWaiting: false,
  mainNode: false, recentLines: [], sessions: [],
}

describe('loop IPC 묶음 (M09 G4)', () => {
  it('채널 이름 — invoke 열일곱과 push 다섯(M10 G2: 메인 대화 읽기·보내기·새로 열기, 메인 대화 push, 세션 사건 push. M10 G3: 깃발 내리기. M10 G4: 세션 기록 읽기·지난 메인 대화 읽기. M10 G5: 그래프 읽기·알림 읽기, 알림 push·알림 열기 push. M11 G4: 작업 폴더 목록)', () => {
    expect(Object.values(LOOP_CHANNELS).sort()).toEqual([
      'loop.alertOpen', 'loop.alerts', 'loop.alertsState',
      'loop.answerCard', 'loop.cancelSession', 'loop.close', 'loop.decide', 'loop.graph', 'loop.listDir', 'loop.lowerFlag', 'loop.mainArchives', 'loop.mainNew', 'loop.mainRead', 'loop.mainSend', 'loop.mainState',
      'loop.open', 'loop.releaseLatch', 'loop.sessionEvent', 'loop.sessionLog', 'loop.start', 'loop.state', 'loop.status',
    ])
    for (const v of Object.values(LOOP_CHANNELS)) expect(Object.values(IPC_CHANNELS)).toContain(v)
    expect(LOOP_CHANNELS.LOOP_STATE).toBe('loop.state')
  })

  it('라우트 — loop 묶음에 invoke 열일곱(요청 없는 알림 읽기 하나 포함)과 push 구독 다섯', () => {
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
      sessionLog: { kind: 'call', channel: 'loop.sessionLog' },
      mainArchives: { kind: 'call', channel: 'loop.mainArchives' },
      graph: { kind: 'call', channel: 'loop.graph' },
      alerts: { kind: 'call0', channel: 'loop.alerts' },
      onAlerts: { kind: 'push', channel: 'loop.alertsState' },
      onAlertOpen: { kind: 'push', channel: 'loop.alertOpen' },
      listDir: { kind: 'call', channel: 'loop.listDir' },
    })
  })

  it('[M11-G4 M10-16] 작업 폴더 목록은 요청 하나를 받는 invoke이고, 요청은 cwd와 상대 경로만 싣는다', () => {
    expect(LOOP_CHANNELS.LOOP_LIST_DIR).toBe(IPC_CHANNELS.LOOP_LIST_DIR)
    expect(API_ROUTES.loop.listDir).toEqual({ kind: 'call', channel: LOOP_CHANNELS.LOOP_LIST_DIR })
    // @ts-expect-error 상대 경로 없이는 물을 수 없다
    const bare: ReqOf<'loop.listDir'> = { cwd: 'C:/work/practice' }
    // @ts-expect-error 화면은 읽을 뿌리를 정하지 못한다(main이 열린 실행기의 뿌리를 쓴다)
    const rooted: ReqOf<'loop.listDir'> = { cwd: 'C:/work/practice', relDir: '', root: 'C:/' }
    // @ts-expect-error 응답은 ok를 싣는다(막힘과 빈 폴더를 가른다)
    const noOk: ResOf<'loop.listDir'> = { entries: [] }
    void bare
    void rooted
    void noOk
  })

  it('그래프 읽기와 알림 (M10 G5) — 그래프는 cwd만 받고, 알림 목록은 읽기 응답과 push가 같은 꼴이다', () => {
    const req: ReqOf<'loop.graph'> = { cwd: 'C:/work/practice' }
    const res: ResOf<'loop.graph'> = {
      ok: true,
      graph: {
        templateId: 'program-dev', title: '프로그램 개발', failLimit: 3, goalLoop: null,
        nodes: [{ id: 'a', title: 'A', kind: 'work', scope: 'milestone', role: 'worker', rule: null, commands: [], next: null, onFail: null, when: null, position: { x: 0, y: 0 } }],
        edges: [],
      },
    }
    const refused: ResOf<'loop.graph'> = { ok: false, reason: '템플릿을 읽지 못했다' }
    const list: ResOf<'loop.alerts'> = { alerts: [{ key: 'k', cwd: req.cwd, phase: 'halted', node: 'G1/checks', level: 'now', text: '멈췄다' }] }
    const pushed: PayloadOf<'loop.alertsState'> = list
    const open: PayloadOf<'loop.alertOpen'> = { cwd: req.cwd }
    expect([res.ok, refused.ok, pushed.alerts[0].level, open.cwd]).toEqual([true, false, 'now', req.cwd])
    // @ts-expect-error 그래프 읽기는 편집 값을 싣지 못한다
    const forged: ReqOf<'loop.graph'> = { cwd: req.cwd, nodes: [] }
    void forged
    // @ts-expect-error 알림 수준은 now·later뿐이다
    const bad: ResOf<'loop.alerts'> = { alerts: [{ ...list.alerts[0], level: 'soon' }] }
    void bad
  })

  it('세션 기록·지난 메인 대화·상태의 새 칸 (M10 G4)', () => {
    const req: ReqOf<'loop.sessionLog'> = { cwd: 'C:/work/practice' }
    const tag = { key: 'ab12.3', kind: 'work' as const, node: 'implement', goal: 'G1', sessionId: 's9' }
    const log: ResOf<'loop.sessionLog'> = {
      cwd: req.cwd,
      sessions: [{ session: tag, events: [{ type: 'text', delta: '안' }], next: 1, truncated: false, live: true }],
    }
    const push: PayloadOf<'loop.sessionEvent'> = { cwd: req.cwd, session: tag, event: { type: 'text', delta: '녕' }, seq: 1 }
    const archives: ResOf<'loop.mainArchives'> = {
      cwd: req.cwd,
      archives: [{ id: 'k-2026-11-19T00-00-00-000Z', at: '2026-11-19T00:00:00.000Z', items: [{ id: 'i1', at: '2026-11-19T00:00:00Z', kind: 'notice', text: '보관' }] }],
    }
    const s: LoopStatus = {
      ...STATUS, mainNode: true,
      recentLines: [{ marker: 'FAIL', at: '2026-11-19T00:00:00Z', node: 'checks', goal: 'G1', sentence: 'npm test 실패' }],
      sessions: [{ key: tag.key, kind: 'work', node: 'implement', goal: 'G1', live: true }],
    }
    expect([log.sessions[0].next, push.seq, archives.archives.length, s.mainNode, s.recentLines[0].marker, s.sessions[0].live]).toEqual([1, 1, 1, true, 'FAIL', true])
    // @ts-expect-error 세션 기록 읽기는 판정을 싣지 못한다
    const forged: ReqOf<'loop.sessionLog'> = { cwd: req.cwd, verdict: 'pass' }
    void forged
    // @ts-expect-error 노드 세션 줄에 메인 대화(kind main)는 들지 않는다
    const mainRow: LoopStatus['sessions'][number] = { key: 'main', kind: 'main', node: null, goal: null, live: true }
    void mainRow
  })

  it('깃발 내리기는 cwd만, 취소는 cwd와 대상만 싣는다', () => {
    const lower: ReqOf<'loop.lowerFlag'> = { cwd: 'C:/work/practice' }
    const res: ResOf<'loop.lowerFlag'> = {
      ok: true,
      view: { cwd: lower.cwd, root: lower.cwd, chapter: 'c1', sessionId: null, items: [], cards: [], busy: false, waitingUser: false, brainstorming: false, paused: false, queued: 0 },
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
      cwd: 'C:/work/practice', root: 'C:/work/practice', chapter: 'c1', sessionId: 's1', cards: [], busy: false, waitingUser: true, brainstorming: true,
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
      cwd: view.cwd, session: { key: 'main', kind: 'main', node: null, goal: null, sessionId: 's1' }, event: { type: 'text', delta: '안' }, seq: 0,
    }
    expect([read.cwd, send.text, fresh.cwd, res.ok, pushedView.items.length, ev.session.kind]).toEqual([view.cwd, '안녕', view.cwd, true, 4, 'main'])
    // @ts-expect-error 메인 대화 보내기는 실행 상태·판정을 싣지 못한다
    const forged: ReqOf<'loop.mainSend'> = { cwd: view.cwd, text: 'x', verdict: 'pass' }
    void forged
  })

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
    // @ts-expect-error 화면은 CI 정책(필수 검사 이름)을 보내지 못한다
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
