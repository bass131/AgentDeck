/**
 * model-fallback-reducer.test.ts — Phase 32 TDD: model-fallback reducer 단위 테스트
 *
 * 검증 항목:
 *  R1. retractMessageId='X' → thread에서 msg 'X' 제거 + notice push(text).
 *  R2. retractMessageId=null → 제거 없이 notice만 push.
 *  R3. retractMessageId='X', openMsgId==='X' → openMsgId=null 정리.
 *  R4. retractMessageId='X', openMsgId!=='X' → openMsgId 유지.
 *  R5. notice id 접두사가 'fb'이고 seq+1을 사용한다.
 *  R6. notice text는 이벤트의 text 필드와 일치한다.
 */

import { describe, it, expect } from 'vitest'
import {
  applyAgentEvent,
  makeInitialState,
} from '../../src/renderer/src/store/reducer'
import type { AppState } from '../../src/renderer/src/store/reducer'
import type { ThreadItem } from '../../src/renderer/src/store/threadTypes'
import type { AgentEventPayload } from '../../src/shared/ipc-contract'

const runId = 'run-fallback'

function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

function noticeItems(state: AppState): Extract<ThreadItem, { kind: 'notice' }>[] {
  return state.thread.filter(
    (item): item is Extract<ThreadItem, { kind: 'notice' }> => item.kind === 'notice'
  )
}

function msgItems(state: AppState): Extract<ThreadItem, { kind: 'msg' }>[] {
  return state.thread.filter(
    (item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg'
  )
}

describe('applyAgentEvent: model-fallback', () => {
  it('R1. retractMessageId 있으면 thread에서 해당 msg 제거 + notice push', () => {
    // 초기 상태: thread에 msg 'X' 있음
    const base = makeInitialState()
    const withMsg: AppState = {
      ...base,
      thread: [
        { kind: 'msg', id: 'X', role: 'assistant', text: '거부된 부분 답변' },
      ],
      seq: 0,
    }

    const s1 = applyAgentEvent(
      withMsg,
      payload({
        type: 'model-fallback',
        fromModel: 'Fable 5',
        toModel: 'Opus 4.8',
        text: '폴백 경고 텍스트',
        retractMessageId: 'X',
      } as AgentEventPayload['event'])
    )

    // msg 'X' 제거됨
    const msgs = msgItems(s1)
    expect(msgs.find(m => m.id === 'X')).toBeUndefined()

    // notice 1개 push됨
    const notices = noticeItems(s1)
    expect(notices).toHaveLength(1)
    expect(notices[0].text).toBe('폴백 경고 텍스트')
    expect(notices[0].id).toMatch(/^fb/)
  })

  it('R2. retractMessageId=null → 제거 없이 notice만 push', () => {
    const base = makeInitialState()
    const withMsg: AppState = {
      ...base,
      thread: [
        { kind: 'msg', id: 'Y', role: 'assistant', text: '다른 메시지' },
      ],
      seq: 0,
    }

    const s1 = applyAgentEvent(
      withMsg,
      payload({
        type: 'model-fallback',
        fromModel: 'Fable 5',
        toModel: 'Opus 4.8',
        text: '시스템 폴백 알림',
        retractMessageId: null,
      } as AgentEventPayload['event'])
    )

    // msg 'Y' 보존됨
    const msgs = msgItems(s1)
    expect(msgs.find(m => m.id === 'Y')).toBeDefined()

    // notice 1개 push됨
    const notices = noticeItems(s1)
    expect(notices).toHaveLength(1)
    expect(notices[0].text).toBe('시스템 폴백 알림')
  })

  it('R2b. retractMessageId 필드 자체 없으면(undefined) 제거 없이 notice만 push', () => {
    const base = makeInitialState()
    const withMsg: AppState = {
      ...base,
      thread: [
        { kind: 'msg', id: 'Z', role: 'assistant', text: '보존되어야 할 메시지' },
      ],
      seq: 0,
    }

    const s1 = applyAgentEvent(
      withMsg,
      payload({
        type: 'model-fallback',
        fromModel: 'Fable 5',
        toModel: 'Opus 4.8',
        text: 'undefined retract 알림',
        // retractMessageId 미전달
      } as AgentEventPayload['event'])
    )

    // msg 'Z' 보존됨
    expect(msgItems(s1).find(m => m.id === 'Z')).toBeDefined()
    // notice push됨
    expect(noticeItems(s1)).toHaveLength(1)
  })

  it('R3. retractMessageId===openMsgId이면 openMsgId=null 정리', () => {
    const base = makeInitialState()
    const withOpenMsg: AppState = {
      ...base,
      thread: [
        { kind: 'msg', id: 'X', role: 'assistant', text: '스트리밍 중인 답변' },
      ],
      openMsgId: 'X',
      seq: 0,
    }

    const s1 = applyAgentEvent(
      withOpenMsg,
      payload({
        type: 'model-fallback',
        fromModel: 'Fable 5',
        toModel: 'Opus 4.8',
        text: '폴백',
        retractMessageId: 'X',
      } as AgentEventPayload['event'])
    )

    expect(s1.openMsgId).toBeNull()
  })

  it('R4. retractMessageId!==openMsgId이면 openMsgId 유지', () => {
    const base = makeInitialState()
    const withOpenMsg: AppState = {
      ...base,
      thread: [
        { kind: 'msg', id: 'A', role: 'assistant', text: '열린 메시지' },
        { kind: 'msg', id: 'X', role: 'assistant', text: '제거 대상' },
      ],
      openMsgId: 'A',
      seq: 0,
    }

    const s1 = applyAgentEvent(
      withOpenMsg,
      payload({
        type: 'model-fallback',
        fromModel: 'Fable 5',
        toModel: 'Opus 4.8',
        text: '폴백',
        retractMessageId: 'X',
      } as AgentEventPayload['event'])
    )

    expect(s1.openMsgId).toBe('A')
  })

  it('R5. notice id는 fb+(seq+1) 형식', () => {
    const base = makeInitialState()
    const withSeq: AppState = { ...base, seq: 5 }

    const s1 = applyAgentEvent(
      withSeq,
      payload({
        type: 'model-fallback',
        fromModel: 'A',
        toModel: 'B',
        text: '알림',
        retractMessageId: null,
      } as AgentEventPayload['event'])
    )

    const notices = noticeItems(s1)
    expect(notices[0].id).toBe('fb6')
    expect(s1.seq).toBe(6)
  })

  it('R6. notice text는 이벤트 text와 동일', () => {
    const base = makeInitialState()
    const s1 = applyAgentEvent(
      base,
      payload({
        type: 'model-fallback',
        fromModel: 'Fable 5',
        toModel: 'Opus 4.8',
        text: 'Fable 5의 안전 정책이 이 요청에 대한 응답을 거부해 Opus 4.8 모델로 자동 전환했어요.',
        retractMessageId: null,
      } as AgentEventPayload['event'])
    )

    const notices = noticeItems(s1)
    expect(notices[0].text).toBe(
      'Fable 5의 안전 정책이 이 요청에 대한 응답을 거부해 Opus 4.8 모델로 자동 전환했어요.'
    )
  })

  it('R7. toolgroup 아이템은 retract 대상에서 제외된다(kind===msg 정확 매칭)', () => {
    const base = makeInitialState()
    const withToolgroup: AppState = {
      ...base,
      thread: [
        { kind: 'toolgroup', id: 'X', tools: [] }, // id='X'이지만 msg가 아님
        { kind: 'msg', id: 'keep', role: 'assistant', text: '유지될 메시지' },
      ],
      seq: 0,
    }

    const s1 = applyAgentEvent(
      withToolgroup,
      payload({
        type: 'model-fallback',
        fromModel: 'Fable 5',
        toModel: 'Opus 4.8',
        text: '폴백',
        retractMessageId: 'X', // toolgroup id와 일치하지만 kind=msg 아님
      } as AgentEventPayload['event'])
    )

    // toolgroup은 제거되지 않아야 함
    expect(s1.thread.find(i => i.kind === 'toolgroup' && i.id === 'X')).toBeDefined()
    // msg 'keep'도 유지
    expect(msgItems(s1).find(m => m.id === 'keep')).toBeDefined()
  })
})
