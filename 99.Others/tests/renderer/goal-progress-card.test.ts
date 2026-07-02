/**
 * goal-progress-card.test.ts — LR2-03 /goal 진행 카드 reducer 계약 (TDD RED→GREEN).
 *
 * 실측 근거(goal-event-probe, LIVE_SDK, 2026-07-03): /goal은 SDK **stop hook 자기지속**으로
 * 자율 반복(크론 아님 — loops 이벤트 0). 단발 모드에서도 goal 턴마다 assistant messageId가
 * 증가(ar1-1→ar1-2→ar1-3)하고 최종 done 1회. → 카드는 renderer가 이미 받는 신호만 소비:
 *   - begin: commandOf('goal') → cmdresult 카드(user 버블 대신) + sub=목표 텍스트(detail).
 *   - 진행: 새 assistant msg 생성마다 턴 카운트 title 갱신 ("… · N턴").
 *   - done: running=false + 완료 title(턴수 포함) + sub(목표 텍스트) 유지.
 * 새 IPC/shared 이벤트 확장 0 (야간 정지 버킷 회피 — renderer-only).
 *
 * CRITICAL: reducer 순수성 — nowTime()/window.api 0, 받은 time만.
 */
import { describe, it, expect } from 'vitest'
import {
  applyAgentEvent,
  applyBeginCommand,
  makeInitialState,
} from '../../../02.Source/renderer/src/store/reducer'
import type { AppState } from '../../../02.Source/renderer/src/store/reducer'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'
import { commandOf, CMD_CARDS } from '../../../02.Source/renderer/src/lib/cmdCards'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

type CmdCard = Extract<ThreadItem, { kind: 'cmdresult' }>

function cardOf(state: AppState): CmdCard {
  const card = state.thread.find((i): i is CmdCard => i.kind === 'cmdresult')
  expect(card).toBeTruthy()
  return card as CmdCard
}

function text(state: AppState, delta: string, messageId: string): AppState {
  const payload: AgentEventPayload = {
    runId: 'r1',
    event: { type: 'text', delta, messageId },
  }
  return applyAgentEvent(state, payload, '1:00')
}

function beginGoal(detail = '리팩토링 마무리하기'): AppState {
  return applyBeginCommand(makeInitialState(), {
    type: 'begin-command',
    name: 'goal',
    cardId: 'cmd-1',
    time: '1:00',
    detail,
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// 카드 등록: commandOf가 /goal을 카드 커맨드로 인식
// ══════════════════════════════════════════════════════════════════════════════

describe('LR2-03 /goal 카드 등록', () => {
  it("commandOf('/goal …') === 'goal' (CMD_CARDS 등록)", () => {
    expect(commandOf('/goal 리팩토링 마무리하기')).toBe('goal')
    expect(CMD_CARDS['goal']).toBeTruthy()
  })

  it('회귀: /goals·/go 등 다른 단어 오인 없음 + compact 기존 인식 유지', () => {
    expect(commandOf('/goals 어쩌구')).toBeNull()
    expect(commandOf('/compact')).toBe('compact')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// begin: 목표 텍스트(detail)가 카드 sub로
// ══════════════════════════════════════════════════════════════════════════════

describe('LR2-03 begin-command(goal) — 목표 텍스트 카드', () => {
  it('cmdresult 카드 push: running + title=진행형 + sub=목표 텍스트', () => {
    const st = beginGoal('리팩토링 마무리하기')
    const card = cardOf(st)
    expect(card.name).toBe('goal')
    expect(card.running).toBe(true)
    expect(card.title).toBe(CMD_CARDS['goal'].running)
    expect(card.sub).toBe('리팩토링 마무리하기')
  })

  it('detail 미전달(맨몸 /goal) → sub는 cfg 기본값(null) — 기존 계약 유지', () => {
    const st = applyBeginCommand(makeInitialState(), {
      type: 'begin-command',
      name: 'goal',
      cardId: 'cmd-1',
      time: '1:00',
    })
    expect(cardOf(st).sub).toBeNull()
  })

  it('회귀: compact 카드는 detail 없이 기존 거동 그대로', () => {
    const st = applyBeginCommand(makeInitialState(), {
      type: 'begin-command',
      name: 'compact',
      cardId: 'cmd-1',
      time: '1:00',
    })
    const card = cardOf(st)
    expect(card.title).toBe(CMD_CARDS['compact'].running)
    expect(card.sub).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 진행: 새 assistant msg(=goal 턴 경계, probe 실측)마다 카드 턴 카운트 갱신
// ══════════════════════════════════════════════════════════════════════════════

describe('LR2-03 goal 턴 카운트 — 새 assistant msg마다 title 갱신', () => {
  it('턴1(ar1-1) → title "… · 1턴"', () => {
    const st = text(beginGoal(), 'ONE', 'ar1-1')
    expect(cardOf(st).title).toContain('1턴')
  })

  it('같은 msg에 delta 누적 → 턴 수 불변(1턴 유지)', () => {
    let st = text(beginGoal(), 'ON', 'ar1-1')
    st = text(st, 'E', 'ar1-1')
    expect(cardOf(st).title).toContain('1턴')
    expect(cardOf(st).title).not.toContain('2턴')
  })

  it('턴2·턴3(ar1-2, ar1-3) → 2턴 → 3턴 증가 + pendingCommand.turns 추적', () => {
    let st = text(beginGoal(), 'ONE', 'ar1-1')
    st = text(st, 'TWO', 'ar1-2')
    expect(cardOf(st).title).toContain('2턴')
    st = text(st, 'THREE', 'ar1-3')
    expect(cardOf(st).title).toContain('3턴')
    expect(st.pendingCommand?.turns).toBe(3)
  })

  it('sub(목표 텍스트)는 턴 갱신에도 불변', () => {
    let st = text(beginGoal('목표A'), 'ONE', 'ar1-1')
    st = text(st, 'TWO', 'ar1-2')
    expect(cardOf(st).sub).toBe('목표A')
  })

  it('회귀: compact 카드 진행 중 text 이벤트 → 턴 표기 미부착(title 불변)', () => {
    let st = applyBeginCommand(makeInitialState(), {
      type: 'begin-command',
      name: 'compact',
      cardId: 'cmd-1',
      time: '1:00',
    })
    st = text(st, '요약…', 'ar1-1')
    expect(cardOf(st).title).toBe(CMD_CARDS['compact'].running)
    expect(cardOf(st).title).not.toContain('턴')
  })

  it('회귀: pendingCommand 없는 일반 대화의 text → 기존 거동(카드 없음, msg 누적)', () => {
    const st = text(makeInitialState(), '안녕', 'ar1-1')
    expect(st.thread.some((i) => i.kind === 'cmdresult')).toBe(false)
    expect(st.thread.some((i) => i.kind === 'msg' && i.text === '안녕')).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// done: 완료 title(턴수) + sub(목표 텍스트) 유지
// ══════════════════════════════════════════════════════════════════════════════

describe('LR2-03 goal done — 완료 카드', () => {
  it('done → running=false + title에 완료문구·최종 턴수 + sub 유지', () => {
    let st = text(beginGoal('목표A'), 'ONE', 'ar1-1')
    st = text(st, 'TWO', 'ar1-2')
    const payload: AgentEventPayload = { runId: 'r1', event: { type: 'done' } }
    st = applyAgentEvent(st, payload, '1:05')
    const card = cardOf(st)
    expect(card.running).toBe(false)
    expect(card.title).toContain(CMD_CARDS['goal'].title)
    expect(card.title).toContain('2턴')
    expect(card.sub).toBe('목표A')
    expect(st.pendingCommand).toBeFalsy()
  })

  it('회귀: compact done → 기존 동적 sub("압축") 거동 불변', () => {
    let st = applyBeginCommand(makeInitialState(), {
      type: 'begin-command',
      name: 'compact',
      cardId: 'cmd-1',
      time: '1:00',
    })
    const payload: AgentEventPayload = { runId: 'r1', event: { type: 'done' } }
    st = applyAgentEvent(st, payload, '1:05')
    const card = cardOf(st)
    expect(card.running).toBe(false)
    expect(card.title).toBe(CMD_CARDS['compact'].title)
    expect(card.sub ?? '').toContain('압축')
  })

  it('error → 기존 failed 카드 거동(goal도 동일 백스톱)', () => {
    let st = text(beginGoal(), 'ONE', 'ar1-1')
    const payload: AgentEventPayload = { runId: 'r1', event: { type: 'error', message: '엔진 오류' } }
    st = applyAgentEvent(st, payload, '1:05')
    const card = cardOf(st)
    expect(card.running).toBe(false)
    expect(card.failed).toBe(true)
  })
})
