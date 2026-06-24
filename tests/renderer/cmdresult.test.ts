/**
 * cmdresult.test.ts — M6 cmdresult 슬래시 진행카드 TDD 테스트.
 *
 * TDD: 이 파일이 먼저 FAIL → 구현 후 PASS.
 *
 * 검증 범위:
 *   (1) commandOf/CMD_CARDS: "/compact x"→"compact", "/review"→null, 일반→null
 *   (2) reducer begin→running: begin-command → cmdresult {running:true} push + pendingCommand
 *   (3) reducer done in-place: done → cardId 카드 갱신 (새 카드 0)
 *   (4) reducer error failed + 이중처리0: error → failed + done 무동작
 *   (5) panelReducer begin(멀티): 패널에서도 begin 카드 push
 *   (6) 인터리브 무회귀: begin 카드 push가 기존 인터리브 포인터 무파손
 *   (7) 미영속(B4): snapshotForPersist가 cmdresult 제외
 */
import { describe, it, expect } from 'vitest'
import { commandOf, CMD_CARDS } from '../../src/renderer/src/lib/cmdCards'
import { applyAgentEvent, makeInitialState } from '../../src/renderer/src/store/reducer'
import type { AppState } from '../../src/renderer/src/store/reducer'
import type { ThreadItem } from '../../src/renderer/src/store/threadTypes'
import type { AgentEventPayload } from '../../src/shared/ipc-contract'
import {
  makePanelInitialState,
  snapshotForPersist,
  panelReducerFn,
} from '../../src/renderer/src/store/panelSession'
import type { PanelSessionState } from '../../src/renderer/src/store/panelSession'

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId: 'run-cmd', event }
}

function cmdresultItems(state: AppState) {
  return state.thread.filter((item): item is Extract<ThreadItem, { kind: 'cmdresult' }> =>
    item.kind === 'cmdresult'
  )
}

// begin-command 액션 적용 헬퍼 (reducer가 begin-command 액션을 지원하면 사용)
function applyBeginCommand(
  state: AppState,
  name: string,
  cardId: string,
  time: string
): AppState {
  // reducer의 begin-command 액션
  return (applyAgentEvent as (s: AppState, a: unknown) => AppState)(state, {
    type: 'begin-command',
    name,
    cardId,
    time,
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('commandOf / CMD_CARDS', () => {
  it('"/compact x" → "compact"', () => {
    expect(commandOf('/compact 이전 대화 요약해줘')).toBe('compact')
  })

  it('"/compact" 단독 → "compact"', () => {
    expect(commandOf('/compact')).toBe('compact')
  })

  it('"/review" → null (CMD_CARDS에 없으면 null)', () => {
    // compact만 최소 지원 — review는 CMD_CARDS 미포함이면 null
    expect(commandOf('/review')).toBeNull()
  })

  it('일반 텍스트 → null', () => {
    expect(commandOf('안녕하세요')).toBeNull()
  })

  it('빈 문자열 → null', () => {
    expect(commandOf('')).toBeNull()
  })

  it('CMD_CARDS["compact"] 존재: title·running 필드 있음', () => {
    expect(CMD_CARDS['compact']).toBeDefined()
    expect(CMD_CARDS['compact'].title).toBeDefined()
    expect(CMD_CARDS['compact'].running).toBeDefined()
    // title = 완료 제목
    expect(CMD_CARDS['compact'].title).toBe('대화를 요약했어요')
    // running = 진행 중 제목
    expect(CMD_CARDS['compact'].running).toBe('대화를 요약하는 중…')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('reducer begin-command → cmdresult running 카드 push', () => {
  it('begin-command → thread에 cmdresult {running:true} 추가', () => {
    const s0 = makeInitialState()
    const s1 = applyBeginCommand(s0, 'compact', 'cmd1', '오전 10:00')
    const cards = cmdresultItems(s1)
    expect(cards).toHaveLength(1)
    expect(cards[0].running).toBe(true)
    expect(cards[0].title).toBe('대화를 요약하는 중…')
    expect(cards[0].id).toBe('cmd1')
    expect(cards[0].name).toBe('compact')
    expect(cards[0].time).toBe('오전 10:00')
  })

  it('begin-command → pendingCommand 기록 (name, cardId, beforeMsgs)', () => {
    const s0 = makeInitialState()
    // user msg 3개 있는 상태
    const withMsgs: AppState = {
      ...s0,
      thread: [
        { kind: 'msg', id: 'u1', role: 'user', text: '첫 번째' },
        { kind: 'msg', id: 'a1', role: 'assistant', text: '답변1' },
        { kind: 'msg', id: 'u2', role: 'user', text: '두 번째' },
      ],
    }
    const s1 = applyBeginCommand(withMsgs, 'compact', 'cmd1', '오전 10:00')
    expect((s1 as AppState & { pendingCommand?: { name: string; cardId: string; beforeMsgs: number } }).pendingCommand).toBeDefined()
    const pc = (s1 as AppState & { pendingCommand: { name: string; cardId: string; beforeMsgs: number } }).pendingCommand
    expect(pc.name).toBe('compact')
    expect(pc.cardId).toBe('cmd1')
    expect(pc.beforeMsgs).toBe(3) // msg kind 3개
  })

  it('begin-command → openMsgId=null, openGroupId=null (인터리브 포인터 정합)', () => {
    const s0 = makeInitialState()
    // 텍스트 버블이 열려 있는 상태
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: 'hi', messageId: 'msg-a' }))
    expect(s1.openMsgId).toBe('msg-a')
    const s2 = applyBeginCommand(s1, 'compact', 'cmd1', '오전 10:00')
    expect(s2.openMsgId).toBeNull()
    expect(s2.openGroupId).toBeNull()
  })

  it('begin-command → seq 불변 (펌프 카운터 무변화)', () => {
    const s0 = makeInitialState()
    const seqBefore = s0.seq
    const s1 = applyBeginCommand(s0, 'compact', 'cmd1', '오전 10:00')
    // seq는 begin-command에서 변경되지 않아야 함
    expect(s1.seq).toBe(seqBefore)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('reducer done in-place', () => {
  it('done → cardId 카드 running=false, title=완료 제목, sub 설정 (새 카드 0)', () => {
    const s0 = makeInitialState()
    // 기존 msg 2개
    const withMsgs: AppState = {
      ...s0,
      thread: [
        { kind: 'msg', id: 'u1', role: 'user', text: '안녕' },
        { kind: 'msg', id: 'a1', role: 'assistant', text: '반가워' },
      ],
    }
    const s1 = applyBeginCommand(withMsgs, 'compact', 'cmd1', '오전 10:00')
    const s2 = applyAgentEvent(s1, payload({ type: 'done' }))

    const cards = cmdresultItems(s2)
    expect(cards).toHaveLength(1) // 새 카드 추가 0
    expect(cards[0].running).toBe(false)
    expect(cards[0].title).toBe('대화를 요약했어요')
    // sub: "이전 N개 메시지를 핵심 요약으로 압축했습니다."
    expect(cards[0].sub).toContain('이전')
    expect(cards[0].sub).toContain('메시지를 핵심 요약으로 압축했습니다')
    expect(cards[0].failed).toBeFalsy()
  })

  it('done → pendingCommand 클리어', () => {
    const s0 = makeInitialState()
    const s1 = applyBeginCommand(s0, 'compact', 'cmd1', '오전 10:00')
    const s2 = applyAgentEvent(s1, payload({ type: 'done' }))
    expect((s2 as AppState & { pendingCommand?: unknown }).pendingCommand).toBeFalsy()
  })

  it('done → cardId 카드 time 변경 없음 (begin time 유지, 순수성)', () => {
    const s0 = makeInitialState()
    const s1 = applyBeginCommand(s0, 'compact', 'cmd1', '오전 10:00')
    const s2 = applyAgentEvent(s1, payload({ type: 'done' }))
    const card = cmdresultItems(s2)[0]
    // begin 시 설정한 time이 그대로 유지 (done 이벤트에서 nowTime() 호출 0)
    expect(card.time).toBe('오전 10:00')
  })

  it('done 시 thread 총 항목 수 불변 (in-place 갱신 확인)', () => {
    const s0 = makeInitialState()
    const withMsgs: AppState = {
      ...s0,
      thread: [
        { kind: 'msg', id: 'u1', role: 'user', text: 'msg1' },
      ],
    }
    const s1 = applyBeginCommand(withMsgs, 'compact', 'cmd1', '오전 10:00')
    const threadLenAfterBegin = s1.thread.length
    const s2 = applyAgentEvent(s1, payload({ type: 'done' }))
    // done 후 thread 길이 동일 (새 카드 push 0)
    expect(s2.thread.length).toBe(threadLenAfterBegin)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('reducer error failed + 이중처리0', () => {
  it('error → 카드 running=false, failed=true, title=실패 제목', () => {
    const s0 = makeInitialState()
    const s1 = applyBeginCommand(s0, 'compact', 'cmd1', '오전 10:00')
    const s2 = applyAgentEvent(s1, payload({ type: 'error', message: '네트워크 오류' }))
    const cards = cmdresultItems(s2)
    expect(cards).toHaveLength(1)
    expect(cards[0].running).toBe(false)
    expect(cards[0].failed).toBe(true)
    expect(cards[0].title).toBe('명령을 완료하지 못했어요')
  })

  it('error → sub에 에러 메시지 포함', () => {
    const s0 = makeInitialState()
    const s1 = applyBeginCommand(s0, 'compact', 'cmd1', '오전 10:00')
    const s2 = applyAgentEvent(s1, payload({ type: 'error', message: '네트워크 오류' }))
    const cards = cmdresultItems(s2)
    expect(cards[0].sub).toBe('네트워크 오류')
  })

  it('error → pendingCommand 클리어', () => {
    const s0 = makeInitialState()
    const s1 = applyBeginCommand(s0, 'compact', 'cmd1', '오전 10:00')
    const s2 = applyAgentEvent(s1, payload({ type: 'error', message: '오류' }))
    expect((s2 as AppState & { pendingCommand?: unknown }).pendingCommand).toBeFalsy()
  })

  it('이중처리0: error 후 done 이벤트 → 카드 추가 갱신 없음 (pendingCommand 없으므로)', () => {
    const s0 = makeInitialState()
    const s1 = applyBeginCommand(s0, 'compact', 'cmd1', '오전 10:00')
    const s2 = applyAgentEvent(s1, payload({ type: 'error', message: '오류' }))
    // error로 pendingCommand 클리어 후 done 이벤트 → 카드 상태 무변경
    const s3 = applyAgentEvent(s2, payload({ type: 'done' }))
    const cards = cmdresultItems(s3)
    // failed 상태 그대로 (done이 덮어쓰지 않음)
    expect(cards[0].failed).toBe(true)
    expect(cards[0].running).toBe(false)
    expect(cards[0].title).toBe('명령을 완료하지 못했어요')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('인터리브 무회귀', () => {
  it('begin-command 후 text 이벤트 → 새 assistant msg 버블 시작 (openMsgId null에서 새 버블)', () => {
    const s0 = makeInitialState()
    const s1 = applyBeginCommand(s0, 'compact', 'cmd1', '오전 10:00')
    expect(s1.openMsgId).toBeNull()
    expect(s1.openGroupId).toBeNull()
    // 다음 text 이벤트 → 새 msg 버블
    const s2 = applyAgentEvent(s1, payload({ type: 'text', delta: '요약 완료', messageId: 'msg-post' }))
    const msgs = s2.thread.filter((i) => i.kind === 'msg') as Extract<ThreadItem, { kind: 'msg' }>[]
    const assistants = msgs.filter((m) => m.role === 'assistant')
    expect(assistants).toHaveLength(1)
    expect(assistants[0].text).toBe('요약 완료')
  })

  it('기존 text→tool_call→text 인터리브가 begin-command 영향 없음', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: '이전', messageId: 'msg-a' }))
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_call', id: 'tc-1', name: 'bash', input: {} }))
    const s3 = applyAgentEvent(s2, payload({ type: 'text', delta: '이후', messageId: 'msg-b' }))
    // 기존 인터리브 순서: msg-a, toolgroup, msg-b
    expect(s3.thread).toHaveLength(3)
    expect(s3.thread[0].kind).toBe('msg')
    expect(s3.thread[1].kind).toBe('toolgroup')
    expect(s3.thread[2].kind).toBe('msg')

    // begin-command 추가해도 기존 thread 그대로
    const s4 = applyBeginCommand(s3, 'compact', 'cmd1', '오전 10:00')
    // 기존 3개 + cmdresult 1개
    expect(s4.thread).toHaveLength(4)
    expect(s4.thread[0].kind).toBe('msg')
    expect(s4.thread[1].kind).toBe('toolgroup')
    expect(s4.thread[2].kind).toBe('msg')
    expect(s4.thread[3].kind).toBe('cmdresult')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('panelReducer begin (멀티)', () => {
  it('ADD_COMMAND_CARD 액션 → thread에 cmdresult 카드 push + pendingCommand 설정', () => {
    const s0 = makePanelInitialState()
    const s1 = panelReducerFn(s0, { type: 'ADD_COMMAND_CARD', name: 'compact', cardId: 'pcmd1', time: '오전 10:00' })
    const cards = s1.thread.filter((i) => i.kind === 'cmdresult')
    expect(cards).toHaveLength(1)
    expect((cards[0] as Extract<ThreadItem, { kind: 'cmdresult' }>).running).toBe(true)
    expect((cards[0] as Extract<ThreadItem, { kind: 'cmdresult' }>).title).toBe('대화를 요약하는 중…')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('미영속 (B4)', () => {
  it('snapshotForPersist → cmdresult 제외 (msg-only)', () => {
    const s0 = makePanelInitialState()
    // thread에 msg + cmdresult 모두 있는 상태 시뮬레이션
    const stateWithCmdresult: PanelSessionState = {
      ...s0,
      thread: [
        { kind: 'msg', id: 'u1', role: 'user', text: '안녕' },
        { kind: 'cmdresult' as 'cmdresult', id: 'cmd1', name: 'compact', title: '대화를 요약하는 중…', running: true, sub: null, time: '오전 10:00' } as unknown as Extract<ThreadItem, { kind: 'cmdresult' }>,
      ] as ThreadItem[],
    }
    const snapshot = snapshotForPersist(stateWithCmdresult)
    // snapshot.messages: msg kind만 포함, cmdresult 제외
    expect(snapshot.messages).toHaveLength(1)
    expect(snapshot.messages[0].role).toBe('user')
  })

  it('snapshotForPersist → running cmdresult 제외 (영구 스피너 차단)', () => {
    const s0 = makePanelInitialState()
    const stateRunning: PanelSessionState = {
      ...s0,
      thread: [
        { kind: 'cmdresult' as 'cmdresult', id: 'cmd1', name: 'compact', title: '대화를 요약하는 중…', running: true, sub: null } as unknown as Extract<ThreadItem, { kind: 'cmdresult' }>,
      ] as ThreadItem[],
    }
    const snapshot = snapshotForPersist(stateRunning)
    // running cmdresult는 영속 0
    expect(snapshot.messages).toHaveLength(0)
  })
})
