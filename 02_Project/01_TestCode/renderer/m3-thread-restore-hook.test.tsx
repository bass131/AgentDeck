// @vitest-environment jsdom
/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const mockOnAgentEvent = vi.fn(() => vi.fn())
const mockAgentRun = vi.fn()
const mockAgentAbort = vi.fn()

vi.stubGlobal('window', {
  api: {
    onAgentEvent: mockOnAgentEvent,
    agentRun: mockAgentRun,
    agentAbort: mockAgentAbort,
  },
})

import {
  usePanelSlot,
  makePanelInitialState,
  __resetPanelSessionManagerForTests,
} from '@renderer/03_Agent/state/panelSession'
import type { PanelThreadSnapshot } from '../../../02_Project/00_Source/shared/ipcContract'

// 패널 매니저 상태는 모듈 수준이다 — 같은 슬롯 키를 쓰는 테스트끼리 오염되지 않게 매번 비운다
beforeEach(() => {
  __resetPanelSessionManagerForTests()
})

describe('HOOK-1: usePanelSlot이 restore() 메서드를 반환한다', () => {
  it('반환 객체에 restore 함수가 존재한다', () => {
    const { result } = renderHook(() => usePanelSlot('sess-hook', 0))
    expect(typeof result.current.restore).toBe('function')
  })

  it('state, send, abort, restore 모두 반환된다', () => {
    const { result } = renderHook(() => usePanelSlot('sess-hook', 0))
    expect(result.current.state).toBeDefined()
    expect(typeof result.current.send).toBe('function')
    expect(typeof result.current.abort).toBe('function')
    expect(typeof result.current.restore).toBe('function')
  })
})

describe('HOOK-2: restore(snapshot) 호출 후 state.thread에 msg 복원', () => {
  it('restore() 후 thread에 2개 msg가 있다', async () => {
    const { result } = renderHook(() => usePanelSlot('sess-hook', 0))

    const snapshot: PanelThreadSnapshot = {
      messages: [
        { id: 'p1', role: 'user', text: '복원 msg 1' },
        { id: 'p2', role: 'assistant', text: '복원 응답 1' },
      ],
      seq: 4,
    }

    await act(async () => {
      result.current.restore(snapshot)
    })

    const msgs = result.current.state.thread.filter(
      (t) => t.kind === 'msg'
    ) as Array<{ kind: 'msg'; role: string; text: string }>

    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('user')
    expect(msgs[0].text).toBe('복원 msg 1')
    expect(msgs[1].role).toBe('assistant')
    expect(msgs[1].text).toBe('복원 응답 1')
  })
})

describe('HOOK-3: restore() 후 currentRunId가 null', () => {
  it('restore 후 currentRunId === null (휘발 필드 미복원)', async () => {
    const { result } = renderHook(() => usePanelSlot('sess-hook', 0))

    const snapshot: PanelThreadSnapshot = {
      messages: [{ id: 'p1', role: 'user', text: 'hi' }],
      seq: 2,
    }

    await act(async () => {
      result.current.restore(snapshot)
    })

    expect(result.current.state.currentRunId).toBeNull()
    expect(result.current.state.isRunning).toBe(false)
  })
})

describe('HOOK-4: restore(undefined/empty) → 빈 thread 유지', () => {
  it('빈 messages snapshot → thread 빈 배열 유지', async () => {
    const { result } = renderHook(() => usePanelSlot('sess-hook', 0))

    await act(async () => {
      result.current.restore({
        messages: [{ id: 'p1', role: 'user', text: 'first' }],
        seq: 1,
      })
    })
    expect(result.current.state.thread).toHaveLength(1)

    await act(async () => {
      result.current.restore({ messages: [], seq: 0 })
    })
    expect(result.current.state.thread).toHaveLength(0)
  })
})

describe('HOOK-5: RESTORE 액션이 makePanelInitialState(snapshot)과 동등한 결과 반환', () => {
  it('restore(snapshot) 후 state가 makePanelInitialState(snapshot)과 thread 구조 일치', async () => {
    const snapshot: PanelThreadSnapshot = {
      messages: [
        { id: 'orig-1', role: 'user', text: '질문' },
        { id: 'orig-2', role: 'assistant', text: '응답' },
      ],
      seq: 6,
    }

    const reference = makePanelInitialState(snapshot)
    const refMsgs = reference.thread.filter((t) => t.kind === 'msg') as Array<{
      kind: 'msg'
      role: string
      text: string
    }>

    const { result } = renderHook(() => usePanelSlot('sess-hook', 0))
    await act(async () => {
      result.current.restore(snapshot)
    })

    const hookMsgs = result.current.state.thread.filter((t) => t.kind === 'msg') as Array<{
      kind: 'msg'
      role: string
      text: string
    }>

    expect(hookMsgs).toHaveLength(refMsgs.length)
    hookMsgs.forEach((m, i) => {
      expect(m.role).toBe(refMsgs[i].role)
      expect(m.text).toBe(refMsgs[i].text)
    })
  })
})
