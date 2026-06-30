// @vitest-environment jsdom
/**
 * m3-thread-restore-hook.test.tsx — RESTORE 액션 배선 및 훅 테스트
 *
 * TDD 원칙: 실패(RED) → 구현 → 통과(GREEN).
 * jsdom 환경 필요 (React 훅 + renderHook 사용).
 *
 * 검증 범위:
 *   (HOOK-1) usePanelSession()이 restore() 메서드를 반환한다.
 *   (HOOK-2) restore(snapshot) 호출 후 state.thread에 msg가 복원된다.
 *   (HOOK-3) restore() 후 currentRunId가 null.
 *   (HOOK-4) restore(undefined/empty) → 빈 thread 유지.
 *   (HOOK-5) panelReducer RESTORE 케이스: makePanelInitialState(snapshot)과 동등.
 *
 * CRITICAL: shared reducer.ts 무변경 검증은 git diff로 별도 확인.
 */
/// <reference types="vitest/globals" />

import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// window.api mock — jsdom 환경에서 IPC 없음
const mockOnAgentEvent = vi.fn(() => vi.fn()) // returns unsubscribe fn
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
  usePanelSession,
  makePanelInitialState,
} from '../../../02.Source/renderer/src/store/panelSession'
import type { PanelThreadSnapshot } from '../../../02.Source/shared/ipc-contract'

describe('HOOK-1: usePanelSession이 restore() 메서드를 반환한다', () => {
  it('반환 객체에 restore 함수가 존재한다', () => {
    const { result } = renderHook(() => usePanelSession())
    // restore()가 없으면 이 테스트가 실패한다 (RED → GREEN 배선 목표)
    expect(typeof result.current.restore).toBe('function')
  })

  it('state, send, abort, restore 모두 반환된다', () => {
    const { result } = renderHook(() => usePanelSession())
    expect(result.current.state).toBeDefined()
    expect(typeof result.current.send).toBe('function')
    expect(typeof result.current.abort).toBe('function')
    expect(typeof result.current.restore).toBe('function')
  })
})

describe('HOOK-2: restore(snapshot) 호출 후 state.thread에 msg 복원', () => {
  it('restore() 후 thread에 2개 msg가 있다', async () => {
    const { result } = renderHook(() => usePanelSession())

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
    const { result } = renderHook(() => usePanelSession())

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
    const { result } = renderHook(() => usePanelSession())

    // 먼저 메시지 있는 상태로 restore
    await act(async () => {
      result.current.restore({
        messages: [{ id: 'p1', role: 'user', text: 'first' }],
        seq: 1,
      })
    })
    expect(result.current.state.thread).toHaveLength(1)

    // 빈 snapshot으로 재restore → 빈 상태
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

    // 참조 상태 (직접 팩토리 호출)
    const reference = makePanelInitialState(snapshot)
    const refMsgs = reference.thread.filter((t) => t.kind === 'msg') as Array<{
      kind: 'msg'
      role: string
      text: string
    }>

    // 훅 restore() 경로
    const { result } = renderHook(() => usePanelSession())
    await act(async () => {
      result.current.restore(snapshot)
    })

    const hookMsgs = result.current.state.thread.filter((t) => t.kind === 'msg') as Array<{
      kind: 'msg'
      role: string
      text: string
    }>

    // 개수 동일
    expect(hookMsgs).toHaveLength(refMsgs.length)
    // role/text 동일
    hookMsgs.forEach((m, i) => {
      expect(m.role).toBe(refMsgs[i].role)
      expect(m.text).toBe(refMsgs[i].text)
    })
  })
})
