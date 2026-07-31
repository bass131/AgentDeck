// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMultiPersist } from '../../../02_Source/renderer/src/hooks/useMultiPersist'
import { useAppStore } from '../../../02_Source/renderer/src/store/appStore'
import { makePanelInitialState } from '../../../02_Source/renderer/src/store/panelSession'
import type { PanelSessionHookResult } from '../../../02_Source/renderer/src/store/panelSession'
import type { PersistedMultiState, PersistedMultiSession } from '../../../02_Source/shared/ipcContract'
import { upsertSession, selectSession } from '../../../02_Source/main/multiStore'
import { makeMultiCmdMocks, makeCmdGate } from './helpers/multiCmdMock'

let _disk: PersistedMultiState | null = null

const mockMultiSessionLoad = vi.fn(async (): Promise<{ state: PersistedMultiState | null }> => ({ state: _disk }))

const {
  multiCmdUpsert: mockMultiCmdUpsert,
  multiCmdCreate: mockMultiCmdCreate,
  multiCmdDelete: mockMultiCmdDelete,
  multiCmdRename: mockMultiCmdRename,
  multiCmdSelect: mockMultiCmdSelect,
  run: runMultiCmd,
} = makeMultiCmdMocks(
  () => _disk,
  (s) => { _disk = s }
)

Object.defineProperty(window, 'api', {
  value: {
    multiSessionLoad: mockMultiSessionLoad,
    multiCmdUpsert: mockMultiCmdUpsert,
    multiCmdCreate: mockMultiCmdCreate,
    multiCmdDelete: mockMultiCmdDelete,
    multiCmdRename: mockMultiCmdRename,
    multiCmdSelect: mockMultiCmdSelect,
  },
  writable: true,
  configurable: true,
})

beforeEach(() => {
  vi.clearAllMocks()
  _disk = null
  mockMultiSessionLoad.mockImplementation(async () => ({ state: _disk }))
  useAppStore.setState({
    activeMultiSessionId: '',
    multiSessions: [],
  } as Parameters<typeof useAppStore.setState>[0])
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

function diskSession(id: string): PersistedMultiSession | undefined {
  return _disk?.sessions.find((s) => s.id === id)
}

function diskFirstMsgText(id: string): string | undefined {
  return diskSession(id)?.panels[0]?.snapshot?.messages[0]?.text
}

function diskTitle(id: string): string | undefined {
  return diskSession(id)?.title
}

describe('RMW1-P01 (a) — autosave × 언마운트 flush: A·B 두 멀티세션 훅의 저장 경합', () => {
  it(
    'A의 autosave(디바운스) upsert가 main에서 아직 처리되지 않은 동안 B의 언마운트 flush upsert가 먼저 랜딩해도, 최종 디스크에 A·B 변경이 모두 생존한다',
    async () => {
      const SID_A = 'sess-rmw-a'
      const SID_B = 'sess-rmw-b'

      _disk = {
        version: 2,
        activeSessionId: SID_A,
        sessions: [
          { id: SID_A, title: 'A', count: 4, panels: [] },
          { id: SID_B, title: 'B', count: 4, panels: [] },
        ],
      }
      const pendingSnapshot: PersistedMultiState = JSON.parse(JSON.stringify(_disk))

      const aSessions = makeMockSessions()
      aSessions[0] = {
        ...aSessions[0],
        state: { ...aSessions[0].state, thread: [{ kind: 'msg', id: 'a-1', role: 'user', text: 'A 신규 메시지' }] },
      }
      renderHook(() => useMultiPersist(aSessions, SID_A))

      await act(async () => {
        await flushMicrotasks()
      })

      const aGate = makeCmdGate()
      mockMultiCmdUpsert.mockImplementationOnce((session) =>
        aGate.promise.then(() => runMultiCmd((current) => upsertSession(current, session)))
      )

      await act(async () => {
        await new Promise((r) => setTimeout(r, 600))
      })

      expect(mockMultiCmdUpsert).toHaveBeenCalledTimes(1)
      expect(_disk).toEqual(pendingSnapshot)

      const bSessions = makeMockSessions()
      bSessions[0] = {
        ...bSessions[0],
        state: { ...bSessions[0].state, thread: [{ kind: 'msg', id: 'b-1', role: 'user', text: 'B 신규 메시지' }] },
      }
      const bHook = renderHook(() => useMultiPersist(bSessions, SID_B))
      await act(async () => {
        await flushMicrotasks()
      })

      act(() => {
        bHook.unmount()
      })
      await act(async () => {
        await flushMicrotasks()
      })

      expect(diskFirstMsgText(SID_B)).toBe('B 신규 메시지')

      await act(async () => {
        aGate.open()
        await flushMicrotasks()
      })

      expect(diskFirstMsgText(SID_A)).toBe('A 신규 메시지')
      expect(diskFirstMsgText(SID_B)).toBe('B 신규 메시지')
    }
  )
})

describe('RMW1-P01 (b) — autosave × CRUD(newMultiSession): 새 세션 생성과 autosave 저장 경합', () => {
  it(
    'A의 autosave upsert가 main에서 아직 처리되지 않은 동안 newMultiSession()의 create 명령이 먼저 랜딩해도, 새 세션과 A의 autosave 갱신 모두 디스크에 생존한다',
    async () => {
      const SID_A = 'sess-rmw-crud-a'

      _disk = {
        version: 2,
        activeSessionId: SID_A,
        sessions: [{ id: SID_A, title: 'A', count: 4, panels: [] }],
      }
      const pendingSnapshot: PersistedMultiState = JSON.parse(JSON.stringify(_disk))

      const aSessions = makeMockSessions()
      aSessions[0] = {
        ...aSessions[0],
        state: { ...aSessions[0].state, thread: [{ kind: 'msg', id: 'a-1', role: 'user', text: 'A autosave 메시지' }] },
      }
      renderHook(() => useMultiPersist(aSessions, SID_A))
      await act(async () => {
        await flushMicrotasks()
      })

      const aGate = makeCmdGate()
      mockMultiCmdUpsert.mockImplementationOnce((session) =>
        aGate.promise.then(() => runMultiCmd((current) => upsertSession(current, session)))
      )

      await act(async () => {
        await new Promise((r) => setTimeout(r, 600))
      })
      expect(mockMultiCmdUpsert).toHaveBeenCalledTimes(1)
      expect(_disk).toEqual(pendingSnapshot)

      await useAppStore.getState().newMultiSession()
      const newSessionId = useAppStore.getState().activeMultiSessionId
      expect(newSessionId).not.toBe(SID_A)
      expect(diskSession(newSessionId)).toBeDefined()

      await act(async () => {
        aGate.open()
        await flushMicrotasks()
      })

      expect(diskFirstMsgText(SID_A)).toBe('A autosave 메시지')
      expect(diskSession(newSessionId)).toBeDefined()
    }
  )
})

describe('RMW1-P01 (c) — CRUD 연쇄: selectMultiSession 직후 renameMultiSession 인터리브', () => {
  it(
    'select 명령이 main에서 아직 처리되지 않은 동안 rename 명령이 먼저 랜딩해도, rename 결과와 활성 세션 변경 모두 디스크에 생존한다',
    async () => {
      const S1 = 'sess-rmw-c1'
      const S2 = 'sess-rmw-c2'

      _disk = {
        version: 2,
        activeSessionId: S1,
        sessions: [
          { id: S1, title: '원래 제목', count: 2, panels: [] },
          { id: S2, title: 'S2', count: 2, panels: [] },
        ],
      }

      const selectGate = makeCmdGate()
      mockMultiCmdSelect.mockImplementationOnce((id) =>
        selectGate.promise.then(() => runMultiCmd((current) => selectSession(current, id)))
      )

      const selectPromise = useAppStore.getState().selectMultiSession(S2)

      expect(useAppStore.getState().activeMultiSessionId).toBe(S2)
      expect(mockMultiCmdSelect).toHaveBeenCalledTimes(1)
      expect(_disk?.activeSessionId).toBe(S1)

      await useAppStore.getState().renameMultiSession(S1, '새 제목')
      expect(diskTitle(S1)).toBe('새 제목')

      await act(async () => {
        selectGate.open()
        await selectPromise
      })

      expect(_disk?.activeSessionId).toBe(S2)
      expect(diskTitle(S1)).toBe('새 제목')
    }
  )
})
