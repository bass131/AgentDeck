// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMultiPersist } from '../../../02_Source/renderer/src/hooks/useMultiPersist'
import { makePanelInitialState } from '../../../02_Source/renderer/src/store/panelSession'
import type { PanelSessionHookResult } from '../../../02_Source/renderer/src/store/panelSession'
import type { PersistedMultiState } from '../../../02_Source/shared/ipcContract'
import { makeMultiCmdMocks } from './helpers/multiCmdMock'

let _disk: PersistedMultiState | null = null

const mockMultiSessionLoad = vi.fn()
const { multiCmdUpsert: mockMultiCmdUpsert } = makeMultiCmdMocks(
  () => _disk,
  (s) => { _disk = s }
)

Object.defineProperty(window, 'api', {
  value: { multiSessionLoad: mockMultiSessionLoad, multiCmdUpsert: mockMultiCmdUpsert },
  writable: true,
  configurable: true,
})

beforeEach(() => {
  vi.clearAllMocks()
  _disk = null
  mockMultiSessionLoad.mockImplementation(async () => ({ state: _disk }))
})

function makeMockSessions(): PanelSessionHookResult[] {
  return Array.from({ length: 6 }, () => ({
    state: makePanelInitialState(),
    send: vi.fn(),
    abort: vi.fn(),
    restore: vi.fn(),
    dismissLoopsStopped: vi.fn(),
    respondPermission: vi.fn(),
    setReplMode: vi.fn(),
    dismissGoalStale: vi.fn(),
  }))
}

async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve()
  }
}

describe('BF3 Phase 05 — 신규 세션 마운트 복원이 타 세션의 언마운트-플러시 저장과 경합해도 스냅샷을 상속하지 않는다', () => {
  it('New(디스크 이력 0)의 복원 read가 pending인 동안 Old의 flush 저장이 먼저 랜딩해도, New는 Old의 스냅샷을 상속하지 않는다', async () => {
    const SID_OLD = 'sess-old-established'
    const SID_NEW = 'sess-new-never-saved'

    _disk = {
      version: 2,
      activeSessionId: SID_OLD,
      sessions: [{ id: SID_OLD, title: 'Old', count: 6, panels: [] }],
    }

    let resolveNewLoad!: (v: { state: PersistedMultiState | null }) => void
    const newLoadDeferred = new Promise<{ state: PersistedMultiState | null }>((resolve) => {
      resolveNewLoad = resolve
    })
    mockMultiSessionLoad.mockReturnValueOnce(newLoadDeferred)

    const newSessions = makeMockSessions()
    const { result: newResult } = renderHook(() => useMultiPersist(newSessions, SID_NEW))

    expect(mockMultiSessionLoad).toHaveBeenCalledTimes(1)

    const oldSessions = makeMockSessions()
    oldSessions[0] = {
      ...oldSessions[0],
      state: {
        ...oldSessions[0].state,
        thread: [{ kind: 'msg', id: 'old-1', role: 'user', text: 'OLD 전용 메시지' }],
      },
    }
    const oldHook = renderHook(() => useMultiPersist(oldSessions, SID_OLD))

    await act(async () => {
      await flushMicrotasks()
    })

    act(() => {
      oldHook.unmount()
    })

    await act(async () => {
      await flushMicrotasks()
    })

    expect(mockMultiCmdUpsert).toHaveBeenCalled()
    expect(_disk?.activeSessionId).toBe(SID_OLD)
    expect(
      _disk?.sessions.find((s) => s.id === SID_OLD)?.panels[0]?.snapshot?.messages[0]?.text
    ).toBe('OLD 전용 메시지')

    await act(async () => {
      resolveNewLoad({ state: _disk })
      await flushMicrotasks()
    })

    newSessions.forEach((s) => {
      expect(s.restore).not.toHaveBeenCalled()
    })
    expect(newResult.current.count).toBe(4)
  })
})
