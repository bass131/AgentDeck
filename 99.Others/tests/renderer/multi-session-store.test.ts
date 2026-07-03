/**
 * multi-session-store.test.ts — 멀티세션 슬라이스 + 액션 TDD 단위 테스트.
 *
 * TDD 원칙: 먼저 작성 → RED → 구현 후 GREEN.
 *
 * 검증 범위:
 *   - loadMultiSessions: multiSessionLoad IPC 경유 → multiSessions/activeMultiSessionId 갱신
 *   - loadMultiSessions: 빈 sessions 시 새 세션 1개 자동 생성
 *   - newMultiSession: RMW 시 기존 세션 보존(3개 중 1개 추가 → 3+1=4), 새 id가 active
 *   - selectMultiSession(id): activeMultiSessionId 갱신 + RMW 디스크 저장
 *   - deleteMultiSession(id): RMW 제거, 활성 삭제 시 대체 active
 *   - deleteMultiSession: 남은 세션 없으면 새 세션 생성 후 active
 *   - renameMultiSession(id, title): title cap(200자) trim, RMW 갱신
 *   - 신뢰경계: window.api.multiSessionLoad/Save 만 호출(fs/Node 직접 0)
 *   - 단일챗 conversations 슬라이스 무영향
 *   - selectMultiSessions / selectActiveMultiSessionId 셀렉터
 *
 * 아키텍처 준수:
 *   - window.api mock → store 액션 → 상태 갱신(단방향)
 *   - IPC 채널명은 shared에서 import (하드코딩 0)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import type { PersistedMultiState, PersistedMultiSession } from '../../../02.Source/shared/ipc-contract'
import { makeMultiCmdMocks } from './helpers/multiCmdMock'

// ── window.api mock ────────────────────────────────────────────────────────────
// RMW1-P04(ADR-031): loadMultiSessions(빈 부트스트랩)/newMultiSession/selectMultiSession/
// deleteMultiSession/renameMultiSession은 이제 multiCmd*(명령 5종) 경유 — main이
// read→병합→write를 원자 블록으로 실행한다. mock은 main의 실제 순수 병합 함수
// (main/multiStore.ts)를 재사용하는 helpers/multiCmdMock.ts로 위임(getDisk/setDisk를 이
// 파일의 `_diskState`에 연결 — multiSessionLoad와 같은 단일 진실원 공유). "save 인자"를
// 직접 검사하던 옛 단언들은 병합 후 `_diskState`(최종 디스크 상태)를 검사하는 형태로 치환.

/** 인메모리 디스크 역할 */
let _diskState: PersistedMultiState | null = null

function makeSavedState(sessions: PersistedMultiSession[], activeSessionId: string): PersistedMultiState {
  return { version: 2, activeSessionId, sessions }
}

const mockMultiSessionLoad = vi.fn(async (): Promise<{ state: PersistedMultiState | null }> => {
  return { state: _diskState }
})

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

const mockApi = {
  multiSessionLoad: mockMultiSessionLoad,
  multiCmdUpsert: mockMultiCmdUpsert,
  multiCmdCreate: mockMultiCmdCreate,
  multiCmdDelete: mockMultiCmdDelete,
  multiCmdRename: mockMultiCmdRename,
  multiCmdSelect: mockMultiCmdSelect,
  // 단일챗 IPC stub (단일챗 슬라이스 무영향 검증용)
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-new' }),
  conversationDelete: vi.fn().mockResolvedValue({ ok: true }),
  conversationRename: vi.fn().mockResolvedValue({ ok: true }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  listFiles: vi.fn().mockResolvedValue({ files: [] }),
  pathForFile: vi.fn().mockReturnValue(''),
  saveImageData: vi.fn().mockResolvedValue({ path: '' }),
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
  referenceList: vi.fn().mockResolvedValue({ references: [] }),
  referenceTree: vi.fn().mockResolvedValue({ tree: null }),
  referenceAdd: vi.fn().mockResolvedValue({ reference: null }),
  fsRead: vi.fn().mockResolvedValue({ kind: 'not-found' }),
}

Object.defineProperty(globalThis, 'window', {
  value: { api: mockApi },
  writable: true,
  configurable: true,
})

// ── store 리셋 헬퍼 ────────────────────────────────────────────────────────────

function resetStore(): void {
  useAppStore.setState({
    multiSessions: [],
    activeMultiSessionId: '',
    // 단일챗 슬라이스는 그대로
    conversations: [],
    conversationId: null,
    messages: [],
    thread: [],
    isRunning: false,
    errorMessage: undefined,
    attachedImages: [],
    queue: [],
  } as Parameters<typeof useAppStore.setState>[0])
}

// ── 샘플 세션 ─────────────────────────────────────────────────────────────────

function makeSampleSession(id: string, title?: string): PersistedMultiSession {
  return { id, title, count: 2, panels: [] }
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('multi-session-store — loadMultiSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _diskState = null
    resetStore()
  })

  it('loadMultiSessions → multiSessionLoad IPC를 경유한다', async () => {
    _diskState = makeSavedState(
      [makeSampleSession('s1', '첫 작업')],
      's1',
    )
    await useAppStore.getState().loadMultiSessions()
    expect(mockMultiSessionLoad).toHaveBeenCalledOnce()
  })

  it('loadMultiSessions → multiSessions 상태에 sessions 채워짐', async () => {
    _diskState = makeSavedState(
      [
        makeSampleSession('s1', '첫 작업'),
        makeSampleSession('s2', '두 번째 작업'),
      ],
      's1',
    )
    await useAppStore.getState().loadMultiSessions()
    const { multiSessions } = useAppStore.getState()
    expect(multiSessions).toHaveLength(2)
    expect(multiSessions[0].id).toBe('s1')
    expect(multiSessions[0].title).toBe('첫 작업')
    expect(multiSessions[1].id).toBe('s2')
  })

  it('loadMultiSessions → activeMultiSessionId가 state.activeSessionId로 설정됨', async () => {
    _diskState = makeSavedState(
      [makeSampleSession('s1', '작업A'), makeSampleSession('s2', '작업B')],
      's2',
    )
    await useAppStore.getState().loadMultiSessions()
    expect(useAppStore.getState().activeMultiSessionId).toBe('s2')
  })

  it('디스크 state=null (최초 실행) → 새 세션 1개 자동 생성 + create 명령 호출', async () => {
    _diskState = null
    await useAppStore.getState().loadMultiSessions()
    const { multiSessions, activeMultiSessionId } = useAppStore.getState()
    expect(multiSessions).toHaveLength(1)
    expect(activeMultiSessionId).toBeTruthy()
    expect(multiSessions[0].id).toBe(activeMultiSessionId)
    // 자동 생성은 multiCmdCreate 명령 1발(ADR-031) — main이 id 발급 + 원자 기록.
    expect(mockMultiCmdCreate).toHaveBeenCalledOnce()
  })

  it('sessions 빈 배열 → 새 세션 1개 자동 생성', async () => {
    _diskState = makeSavedState([], '')
    await useAppStore.getState().loadMultiSessions()
    const { multiSessions } = useAppStore.getState()
    expect(multiSessions).toHaveLength(1)
  })

  it('title 없는 세션 → title은 빈 문자열("")로 매핑', async () => {
    _diskState = makeSavedState(
      [{ id: 'sx', count: 2, panels: [] }], // title 필드 없음
      'sx',
    )
    await useAppStore.getState().loadMultiSessions()
    const { multiSessions } = useAppStore.getState()
    expect(multiSessions[0].title).toBe('')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('multi-session-store — newMultiSession (RMW 기존 세션 보존)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _diskState = null
    resetStore()
  })

  it('newMultiSession → multiSessions 길이가 1 증가한다', async () => {
    _diskState = makeSavedState(
      [makeSampleSession('s1', '기존'), makeSampleSession('s2', '기존2')],
      's1',
    )
    await useAppStore.getState().loadMultiSessions()
    await useAppStore.getState().newMultiSession()
    expect(useAppStore.getState().multiSessions).toHaveLength(3)
  })

  it('newMultiSession → activeMultiSessionId가 새 세션 id로 설정된다', async () => {
    _diskState = makeSavedState([makeSampleSession('s1', '기존')], 's1')
    await useAppStore.getState().loadMultiSessions()
    await useAppStore.getState().newMultiSession()
    const { multiSessions, activeMultiSessionId } = useAppStore.getState()
    const newSession = multiSessions.find((s) => s.id === activeMultiSessionId)
    expect(newSession).toBeDefined()
  })

  it('newMultiSession 후 디스크에 기존 세션 + 새 세션이 포함된다 (3+1=4 보존)', async () => {
    _diskState = makeSavedState(
      [
        makeSampleSession('s1', 'A'),
        makeSampleSession('s2', 'B'),
        makeSampleSession('s3', 'C'),
      ],
      's1',
    )
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks() // loadMultiSessions의 create 호출(있었다면) 초기화
    await useAppStore.getState().newMultiSession()
    // create 명령 호출 확인 — createSession(main/multiStore.ts)은 append이므로 기존
    // 3개 + 새 1개 = 4개가 최종 디스크(_diskState)에 그대로 반영된다.
    expect(mockMultiCmdCreate).toHaveBeenCalledOnce()
    expect(_diskState?.sessions).toHaveLength(4)
    // 기존 id들이 보존됨
    const savedIds = _diskState?.sessions.map((s) => s.id) ?? []
    expect(savedIds).toContain('s1')
    expect(savedIds).toContain('s2')
    expect(savedIds).toContain('s3')
  })

  it('newMultiSession → count=2, panels=[]인 새 세션 추가', async () => {
    _diskState = makeSavedState([makeSampleSession('s1', '기존')], 's1')
    await useAppStore.getState().loadMultiSessions()
    await useAppStore.getState().newMultiSession()
    const { multiSessions, activeMultiSessionId } = useAppStore.getState()
    const newSess = multiSessions.find((s) => s.id === activeMultiSessionId)!
    expect(newSess.count).toBe(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('multi-session-store — selectMultiSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _diskState = null
    resetStore()
  })

  it('selectMultiSession(id) → activeMultiSessionId가 id로 변경된다', async () => {
    _diskState = makeSavedState(
      [makeSampleSession('s1', 'A'), makeSampleSession('s2', 'B')],
      's1',
    )
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()
    await useAppStore.getState().selectMultiSession('s2')
    expect(useAppStore.getState().activeMultiSessionId).toBe('s2')
  })

  it('selectMultiSession(id) → multiCmdSelect 명령 호출', async () => {
    _diskState = makeSavedState(
      [makeSampleSession('s1', 'A'), makeSampleSession('s2', 'B')],
      's1',
    )
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()
    await useAppStore.getState().selectMultiSession('s2')
    expect(mockMultiCmdSelect).toHaveBeenCalledOnce()
    expect(mockMultiCmdSelect).toHaveBeenCalledWith('s2')
    expect(_diskState?.activeSessionId).toBe('s2')
  })

  it('selectMultiSession 명령: 세션 목록은 변경되지 않는다', async () => {
    _diskState = makeSavedState(
      [makeSampleSession('s1', 'A'), makeSampleSession('s2', 'B')],
      's1',
    )
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()
    await useAppStore.getState().selectMultiSession('s2')
    // selectSession(main/multiStore.ts)은 activeSessionId 필드만 바꾼다 — sessions 배열은
    // 완전히 무손상 보존된다(ADR-031).
    expect(_diskState?.sessions).toHaveLength(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('multi-session-store — deleteMultiSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _diskState = null
    resetStore()
  })

  it('deleteMultiSession(id) → multiSessions에서 해당 세션 제거', async () => {
    _diskState = makeSavedState(
      [makeSampleSession('s1', 'A'), makeSampleSession('s2', 'B')],
      's1',
    )
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()
    await useAppStore.getState().deleteMultiSession('s2')
    const { multiSessions } = useAppStore.getState()
    expect(multiSessions).toHaveLength(1)
    expect(multiSessions[0].id).toBe('s1')
  })

  it('비활성 세션 삭제 → activeMultiSessionId 미변경', async () => {
    _diskState = makeSavedState(
      [makeSampleSession('s1', 'A'), makeSampleSession('s2', 'B')],
      's1',
    )
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()
    await useAppStore.getState().deleteMultiSession('s2')
    expect(useAppStore.getState().activeMultiSessionId).toBe('s1')
  })

  it('활성 세션 삭제 → 남은 첫 세션이 active가 된다', async () => {
    _diskState = makeSavedState(
      [makeSampleSession('s1', 'A'), makeSampleSession('s2', 'B'), makeSampleSession('s3', 'C')],
      's1',
    )
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()
    await useAppStore.getState().deleteMultiSession('s1')
    const { activeMultiSessionId, multiSessions } = useAppStore.getState()
    expect(multiSessions.map((s) => s.id)).not.toContain('s1')
    expect(['s2', 's3']).toContain(activeMultiSessionId)
  })

  it('활성 세션 삭제 후 남은 세션 없으면 새 세션 생성 + 그것이 active', async () => {
    _diskState = makeSavedState([makeSampleSession('s1', 'A')], 's1')
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()
    await useAppStore.getState().deleteMultiSession('s1')
    const { multiSessions, activeMultiSessionId } = useAppStore.getState()
    expect(multiSessions).toHaveLength(1)
    expect(activeMultiSessionId).toBe(multiSessions[0].id)
    expect(multiSessions[0].id).not.toBe('s1')
  })

  it('deleteMultiSession → multiCmdDelete 명령 호출 (세션 수 정합)', async () => {
    _diskState = makeSavedState(
      [makeSampleSession('s1', 'A'), makeSampleSession('s2', 'B')],
      's1',
    )
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()
    await useAppStore.getState().deleteMultiSession('s2')
    expect(mockMultiCmdDelete).toHaveBeenCalledOnce()
    expect(mockMultiCmdDelete).toHaveBeenCalledWith('s2')
    expect(_diskState?.sessions.map((s) => s.id)).not.toContain('s2')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('multi-session-store — renameMultiSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _diskState = null
    resetStore()
  })

  it('renameMultiSession(id, title) → 해당 세션 title이 갱신된다', async () => {
    _diskState = makeSavedState(
      [makeSampleSession('s1', '기존 제목')],
      's1',
    )
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()
    await useAppStore.getState().renameMultiSession('s1', '새 제목')
    const { multiSessions } = useAppStore.getState()
    expect(multiSessions.find((s) => s.id === 's1')?.title).toBe('새 제목')
  })

  it('renameMultiSession → 다른 세션 title 무영향', async () => {
    _diskState = makeSavedState(
      [makeSampleSession('s1', '기존1'), makeSampleSession('s2', '기존2')],
      's1',
    )
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()
    await useAppStore.getState().renameMultiSession('s1', '바꿈')
    const { multiSessions } = useAppStore.getState()
    expect(multiSessions.find((s) => s.id === 's2')?.title).toBe('기존2')
  })

  it('title 200자 초과 시 200자로 cap된다', async () => {
    _diskState = makeSavedState([makeSampleSession('s1', '기존')], 's1')
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()
    const longTitle = 'a'.repeat(250)
    await useAppStore.getState().renameMultiSession('s1', longTitle)
    const { multiSessions } = useAppStore.getState()
    expect(multiSessions.find((s) => s.id === 's1')?.title).toHaveLength(200)
  })

  it('title trim — 앞뒤 공백 제거', async () => {
    _diskState = makeSavedState([makeSampleSession('s1', '기존')], 's1')
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()
    await useAppStore.getState().renameMultiSession('s1', '  새 이름  ')
    const { multiSessions } = useAppStore.getState()
    expect(multiSessions.find((s) => s.id === 's1')?.title).toBe('새 이름')
  })

  it('renameMultiSession → multiCmdRename 명령 호출', async () => {
    _diskState = makeSavedState([makeSampleSession('s1', '기존')], 's1')
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()
    await useAppStore.getState().renameMultiSession('s1', '갱신')
    expect(mockMultiCmdRename).toHaveBeenCalledOnce()
    expect(mockMultiCmdRename).toHaveBeenCalledWith('s1', '갱신')
    const savedSession = _diskState?.sessions.find((s) => s.id === 's1')
    expect(savedSession?.title).toBe('갱신')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('multi-session-store — 단일챗 슬라이스 무영향', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _diskState = null
    resetStore()
  })

  it('loadMultiSessions 후 conversations 슬라이스는 변경 없음', async () => {
    const CONVS = [
      {
        id: 'cv1',
        title: '단일챗1',
        messages: [],
        backendId: 'claude-code' as const,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:01:00Z',
      },
    ]
    useAppStore.setState({ conversations: CONVS } as Parameters<typeof useAppStore.setState>[0])
    _diskState = makeSavedState([makeSampleSession('s1', 'A')], 's1')
    await useAppStore.getState().loadMultiSessions()
    // 단일챗 conversations는 그대로
    expect(useAppStore.getState().conversations).toEqual(CONVS)
  })

  it('newMultiSession 이 conversations/conversationId를 변경하지 않는다', async () => {
    useAppStore.setState({
      conversations: [],
      conversationId: 'cv-existing',
    } as Parameters<typeof useAppStore.setState>[0])
    _diskState = makeSavedState([makeSampleSession('s1', 'A')], 's1')
    await useAppStore.getState().loadMultiSessions()
    await useAppStore.getState().newMultiSession()
    expect(useAppStore.getState().conversationId).toBe('cv-existing')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('multi-session-store — 셀렉터', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _diskState = null
    resetStore()
  })

  it('selectMultiSessions 셀렉터가 multiSessions 배열을 반환한다', async () => {
    const { selectMultiSessions } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      multiSessions: [{ id: 's1', title: '세션1', count: 2 }],
    } as Parameters<typeof useAppStore.setState>[0])
    expect(selectMultiSessions(useAppStore.getState())).toHaveLength(1)
    expect(selectMultiSessions(useAppStore.getState())[0].id).toBe('s1')
  })

  it('selectActiveMultiSessionId 셀렉터가 activeMultiSessionId를 반환한다', async () => {
    const { selectActiveMultiSessionId } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      activeMultiSessionId: 'active-s',
    } as Parameters<typeof useAppStore.setState>[0])
    expect(selectActiveMultiSessionId(useAppStore.getState())).toBe('active-s')
  })
})
