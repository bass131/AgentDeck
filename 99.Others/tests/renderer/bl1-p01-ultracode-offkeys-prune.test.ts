// @vitest-environment jsdom
/**
 * bl1-p01-ultracode-offkeys-prune.test.ts — BL1 P01 RED 테스트 (TDD 1단계).
 *
 * 배경(LR4-DONE.md 잔여 5번): ultracodeToggle.ts의 offKeys(Set<string>)는 스코프(대화/패널)를
 * 사용자가 끌 때만 키를 기록하고, 다시 켜면 자기 가지치기한다(파일 상단 주석 — "OFF만 명시
 * 기록, ON 복귀 시 엔트리를 지운다"). 그러나 "스코프 자체가 삭제"되는 경우는 아무도 지우지
 * 않는다 — 대화/패널을 삭제해도 offKeys에 그 스코프의 키가 그대로 남는다(현재 저심각 —
 * in-memory·앱 재시작 시 소멸하지만, 세션이 길어질수록 무제한 누적).
 *
 * 검증 범위:
 *   A. 단일챗 대화 삭제(conversationDelete ok:true) → 그 대화의 OFF 키가 offKeys에서 제거되어
 *      같은 키를 재조회하면 기본값 ON으로 돌아온다.
 *   B. 멀티세션 삭제(multiCmdDelete ok:true) → 그 세션의 **복수 슬롯** OFF 키가 prefix
 *      (`multi:{id}:`) 전수 제거된다(Codex P2 — 단일 키가 아니라 세션당 여러 슬롯 키).
 *      다른 세션(prefix 불일치)의 OFF 키는 영향받지 않는다.
 *   C. 단일챗 삭제 실패(ok:false) → offKeys 무변경(성공 경로에만 결선 — Codex P2).
 *   D. 멀티세션 삭제 실패(ok:false, 미지 id) → offKeys 무변경.
 *
 * 관측 방법: offKeys 내부 Set을 직접 들여다보지 않고, useUltracodeToggle(key)를 다시
 * renderHook해 반환되는 [on] 값으로 "행동"을 단언한다(lr4-p06-ultracode-toggle-persist.test.tsx의
 * DOM 배지 관측과 동일 취지 — 구현 형상이 아니라 계약을 검증).
 *
 * 결정론: window.api 전면 모킹(시간/랜덤/네트워크 의존 0).
 *
 * CRITICAL: 앱 소스(02.Source/**) 미수정 — 테스트 전용. RED 확인 후 구현.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import { useUltracodeToggle, __resetUltracodeToggleForTests } from '../../../02.Source/renderer/src/store/ultracodeToggle'
import type {
  ConversationRecord,
  PersistedMultiState,
  PersistedMultiSession,
} from '../../../02.Source/shared/ipc-contract'
import { makeMultiCmdMocks } from './helpers/multiCmdMock'

// ── 단일챗 샘플 ──────────────────────────────────────────────────────────────
const SAMPLE_CONVS: ConversationRecord[] = [
  {
    id: 'conv-1',
    title: '대화1',
    messages: [],
    backendId: 'claude-code',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:01:00Z',
  },
]

// ── 멀티세션 인메모리 "디스크" (multi-session-store.test.ts 관례 재사용) ────────
let _diskState: PersistedMultiState | null = null
function makeSavedState(sessions: PersistedMultiSession[], activeSessionId: string): PersistedMultiState {
  return { version: 2, activeSessionId, sessions }
}
function makeSampleSession(id: string, title?: string): PersistedMultiSession {
  return { id, title, count: 2, panels: [] }
}

const {
  multiCmdUpsert: mockMultiCmdUpsert,
  multiCmdCreate: mockMultiCmdCreate,
  multiCmdDelete: mockMultiCmdDelete,
  multiCmdRename: mockMultiCmdRename,
  multiCmdSelect: mockMultiCmdSelect,
} = makeMultiCmdMocks(
  () => _diskState,
  (s) => { _diskState = s }
)

// conversationDelete 응답을 테스트별로 바꿔치기(ok:true/false)하기 위한 간접 레이어.
let conversationDeleteImpl = vi.fn(async (_req: { id: string }): Promise<{ ok: boolean }> => ({ ok: true }))

const mockApi = {
  conversationLoad: vi.fn().mockResolvedValue({ conversations: SAMPLE_CONVS }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-new' }),
  conversationDelete: (req: { id: string }) => conversationDeleteImpl(req),
  conversationRename: vi.fn().mockResolvedValue({ ok: true }),
  multiSessionLoad: vi.fn(async () => ({ state: _diskState })),
  multiCmdUpsert: mockMultiCmdUpsert,
  multiCmdCreate: mockMultiCmdCreate,
  multiCmdDelete: mockMultiCmdDelete,
  multiCmdRename: mockMultiCmdRename,
  multiCmdSelect: mockMultiCmdSelect,
  agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  setUiPref: vi.fn().mockResolvedValue({ ok: true }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

function resetStore(): void {
  useAppStore.setState({
    conversations: [],
    conversationId: null,
    messages: [],
    thread: [],
    isRunning: false,
    errorMessage: undefined,
    attachedImages: [],
    queue: [],
    multiSessions: [],
    activeMultiSessionId: '',
  } as Parameters<typeof useAppStore.setState>[0])
}

beforeEach(() => {
  vi.clearAllMocks()
  _diskState = null
  conversationDeleteImpl = vi.fn(async () => ({ ok: true }))
  resetStore()
  __resetUltracodeToggleForTests()
})

// ─────────────────────────────────────────────────────────────────────────────────
describe('bl1-p01-A: 단일챗 대화 삭제(성공) → offKeys prune', () => {
  it('OFF 상태의 대화를 삭제(ok:true)하면 그 키가 offKeys에서 제거되어 기본 ON으로 복귀한다', async () => {
    useAppStore.setState({ conversations: [...SAMPLE_CONVS] } as Parameters<typeof useAppStore.setState>[0])

    const { result } = renderHook(() => useUltracodeToggle('conv-1'))
    expect(result.current[0]).toBe(true) // 기준: 기본 ON
    act(() => { result.current[1](false) })
    expect(result.current[0]).toBe(false) // 사용자가 끔

    await act(async () => {
      await useAppStore.getState().deleteConversation('conv-1')
    })

    // 핵심 단언: 삭제 후 같은 키를 재조회하면 offKeys에 남아있지 않아 기본 ON이어야 한다.
    //   현재 구현(prune 미구현)은 'conv-1'이 offKeys에 잔존 → OFF 고착 → RED.
    const { result: after } = renderHook(() => useUltracodeToggle('conv-1'))
    expect(after.current[0]).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────
describe('bl1-p01-B: 멀티세션 삭제(성공) → 복수 슬롯 offKeys 전수 prune', () => {
  it('세션의 슬롯 0/1을 각각 OFF한 뒤 세션 삭제 → 두 슬롯 키 모두 offKeys에서 제거된다', async () => {
    _diskState = makeSavedState(
      [makeSampleSession('s1', 'A'), makeSampleSession('s2', 'B')],
      's1'
    )
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()

    const key0 = 'multi:s1:slot:0'
    const key1 = 'multi:s1:slot:1'
    const { result: r0 } = renderHook(() => useUltracodeToggle(key0))
    const { result: r1 } = renderHook(() => useUltracodeToggle(key1))
    act(() => { r0.current[1](false) })
    act(() => { r1.current[1](false) })
    expect(r0.current[0]).toBe(false)
    expect(r1.current[0]).toBe(false)

    await act(async () => {
      await useAppStore.getState().deleteMultiSession('s1')
    })

    // 핵심 단언: 두 슬롯 모두 prefix(multi:s1:) 전수 prune → 재조회 시 기본 ON.
    //   현재 구현(prune 미구현)은 두 키 모두 offKeys에 잔존 → RED.
    const { result: after0 } = renderHook(() => useUltracodeToggle(key0))
    const { result: after1 } = renderHook(() => useUltracodeToggle(key1))
    expect(after0.current[0]).toBe(true)
    expect(after1.current[0]).toBe(true)
  })

  it('세션 s1 삭제는 세션 s2의 OFF 키에 영향을 주지 않는다(prefix 정확 매칭)', async () => {
    _diskState = makeSavedState(
      [makeSampleSession('s1', 'A'), makeSampleSession('s2', 'B')],
      's1'
    )
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()

    const keyS1 = 'multi:s1:slot:0'
    const keyS2 = 'multi:s2:slot:0'
    const { result: rS1 } = renderHook(() => useUltracodeToggle(keyS1))
    const { result: rS2 } = renderHook(() => useUltracodeToggle(keyS2))
    act(() => { rS1.current[1](false) })
    act(() => { rS2.current[1](false) })

    await act(async () => {
      await useAppStore.getState().deleteMultiSession('s1')
    })

    const { result: afterS2 } = renderHook(() => useUltracodeToggle(keyS2))
    expect(afterS2.current[0]).toBe(false) // s2는 삭제 대상이 아니므로 OFF 유지(회귀 0)
  })

  it('세션 s1 삭제는 세션 s10의 OFF 키에 영향을 주지 않는다(접두 문자열 겹침 방지 — s1 vs s10)', async () => {
    // reviewer 🟡 후속: pruneMultiSessionScope의 prefix가 `multi:s1:`(끝에 콜론)이라
    // `multi:s10:slot:0`은 'multi:s1'로 시작하지 않으므로(다음 문자가 '0' ≠ ':') startsWith가
    // false여야 한다 — s1 vs s2보다 실질적인 위험 케이스(문자열 접두 겹침).
    _diskState = makeSavedState(
      [makeSampleSession('s1', 'A'), makeSampleSession('s10', 'B')],
      's1'
    )
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()

    const keyS1 = 'multi:s1:slot:0'
    const keyS10 = 'multi:s10:slot:0'
    const { result: rS1 } = renderHook(() => useUltracodeToggle(keyS1))
    const { result: rS10 } = renderHook(() => useUltracodeToggle(keyS10))
    act(() => { rS1.current[1](false) })
    act(() => { rS10.current[1](false) })
    expect(rS1.current[0]).toBe(false)
    expect(rS10.current[0]).toBe(false)

    await act(async () => {
      await useAppStore.getState().deleteMultiSession('s1')
    })

    const { result: afterS10 } = renderHook(() => useUltracodeToggle(keyS10))
    expect(afterS10.current[0]).toBe(false) // s10은 삭제 대상이 아니므로 OFF 유지(접두 오매칭 0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────
describe('bl1-p01-C: 단일챗 삭제 실패(ok:false) → offKeys 무변경', () => {
  it('conversationDelete가 ok:false를 반환하면 OFF 키가 offKeys에 그대로 남는다', async () => {
    useAppStore.setState({ conversations: [...SAMPLE_CONVS] } as Parameters<typeof useAppStore.setState>[0])
    conversationDeleteImpl = vi.fn(async () => ({ ok: false }))

    const { result } = renderHook(() => useUltracodeToggle('conv-1'))
    act(() => { result.current[1](false) })
    expect(result.current[0]).toBe(false)

    await act(async () => {
      await useAppStore.getState().deleteConversation('conv-1')
    })

    const { result: after } = renderHook(() => useUltracodeToggle('conv-1'))
    expect(after.current[0]).toBe(false) // 실패 → 무변경(여전히 OFF)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────
describe('bl1-p01-D: 멀티세션 삭제 실패(ok:false) → offKeys 무변경', () => {
  it('존재하지 않는 세션 id 삭제 시도(ok:false)는 다른 세션의 OFF 키에 영향을 주지 않는다', async () => {
    _diskState = makeSavedState([makeSampleSession('s1', 'A')], 's1')
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()

    const key = 'multi:s1:slot:0'
    const { result } = renderHook(() => useUltracodeToggle(key))
    act(() => { result.current[1](false) })
    expect(result.current[0]).toBe(false)

    // deleteSession(main/multiStore.ts) 병합함수는 미지 id → { ok: false, state } no-op.
    await act(async () => {
      await useAppStore.getState().deleteMultiSession('nonexistent-session')
    })

    const { result: after } = renderHook(() => useUltracodeToggle(key))
    expect(after.current[0]).toBe(false) // 실패 → 무변경(여전히 OFF)
  })
})
