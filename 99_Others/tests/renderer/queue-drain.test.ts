/**
 * queue-drain.test.ts — store 큐 액션 단위 테스트 (TDD-first).
 *
 * 검증 범위:
 *   - enqueueMessage: 적재·순서
 *   - dequeueMessage: FIFO 반환 + 제거
 *   - removeQueued: id 기반 제거
 *   - clearConversation 시 queue 리셋
 *   - picker 캡처 보존
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'

// window.api 최소 stub (store 로딩에 필요)
const mockApi = {
  conversationLoad: async () => ({ conversations: [] }),
  conversationSave: async () => ({ id: 'cv-1' }),
  agentRun: async () => ({ runId: 'r1' }),
  agentAbort: async () => ({ accepted: true }),
  onAgentEvent: () => () => {},
  listFiles: async () => ({ files: [] }),
  pathForFile: () => '',
  saveImageData: async () => ({ path: '' }),
  workspaceOpen: async () => ({ rootPath: null, tree: null }),
  referenceList: async () => ({ references: [] }),
  referenceTree: async () => ({ tree: null }),
  referenceAdd: async () => ({ reference: null }),
  fsRead: async () => ({ kind: 'not-found' }),
}
Object.defineProperty(globalThis, 'window', {
  value: { api: mockApi },
  writable: true,
  configurable: true,
})

function resetQueue() {
  useAppStore.setState({ queue: [] } as Parameters<typeof useAppStore.setState>[0])
}

describe('store queue — enqueueMessage', () => {
  beforeEach(() => resetQueue())

  it('단일 항목 적재', () => {
    const { enqueueMessage } = useAppStore.getState()
    enqueueMessage({ id: 'a', text: 'hello', images: [] })
    expect(useAppStore.getState().queue).toHaveLength(1)
    expect(useAppStore.getState().queue[0].id).toBe('a')
  })

  it('순서 유지 (FIFO 적재)', () => {
    const { enqueueMessage } = useAppStore.getState()
    enqueueMessage({ id: '1', text: 'first', images: [] })
    enqueueMessage({ id: '2', text: 'second', images: [] })
    enqueueMessage({ id: '3', text: 'third', images: [] })
    const ids = useAppStore.getState().queue.map((q) => q.id)
    expect(ids).toEqual(['1', '2', '3'])
  })

  it('picker 캡처 보존', () => {
    const { enqueueMessage } = useAppStore.getState()
    const picker = { model: 'opus', effort: 'high', mode: 'auto' }
    enqueueMessage({ id: 'p1', text: '테스트', images: [], picker })
    const q = useAppStore.getState().queue[0]
    expect(q.picker).toEqual(picker)
  })

  it('이미지 목록 보존', () => {
    const { enqueueMessage } = useAppStore.getState()
    const images = [
      { path: '/tmp/a.png', dataUrl: 'data:image/png;base64,A' },
      { path: '/tmp/b.png', dataUrl: 'data:image/png;base64,B' },
    ]
    enqueueMessage({ id: 'i1', text: '이미지', images })
    expect(useAppStore.getState().queue[0].images).toEqual(images)
  })
})

describe('store queue — dequeueMessage', () => {
  beforeEach(() => resetQueue())

  it('FIFO: 첫 항목 반환', () => {
    const { enqueueMessage } = useAppStore.getState()
    enqueueMessage({ id: '1', text: 'first', images: [] })
    enqueueMessage({ id: '2', text: 'second', images: [] })
    const item = useAppStore.getState().dequeueMessage()
    expect(item?.id).toBe('1')
  })

  it('반환 후 큐에서 제거됨', () => {
    const { enqueueMessage } = useAppStore.getState()
    enqueueMessage({ id: '1', text: 'A', images: [] })
    enqueueMessage({ id: '2', text: 'B', images: [] })
    useAppStore.getState().dequeueMessage()
    expect(useAppStore.getState().queue).toHaveLength(1)
    expect(useAppStore.getState().queue[0].id).toBe('2')
  })

  it('빈 큐에서 dequeue → undefined 반환', () => {
    const item = useAppStore.getState().dequeueMessage()
    expect(item).toBeUndefined()
  })

  it('단일 항목 dequeue 후 큐 비워짐', () => {
    const { enqueueMessage } = useAppStore.getState()
    enqueueMessage({ id: 'x', text: 'only', images: [] })
    useAppStore.getState().dequeueMessage()
    expect(useAppStore.getState().queue).toHaveLength(0)
  })
})

describe('store queue — removeQueued', () => {
  beforeEach(() => resetQueue())

  it('id로 특정 항목 제거', () => {
    const { enqueueMessage } = useAppStore.getState()
    enqueueMessage({ id: 'a', text: 'A', images: [] })
    enqueueMessage({ id: 'b', text: 'B', images: [] })
    enqueueMessage({ id: 'c', text: 'C', images: [] })
    useAppStore.getState().removeQueued('b')
    const ids = useAppStore.getState().queue.map((q) => q.id)
    expect(ids).toEqual(['a', 'c'])
  })

  it('존재하지 않는 id → 큐 변화 없음', () => {
    const { enqueueMessage } = useAppStore.getState()
    enqueueMessage({ id: 'x', text: 'X', images: [] })
    useAppStore.getState().removeQueued('nonexistent')
    expect(useAppStore.getState().queue).toHaveLength(1)
  })
})

describe('store queue — clearConversation 시 queue 리셋', () => {
  beforeEach(() => resetQueue())

  it('clearConversation 호출 후 queue === []', () => {
    const { enqueueMessage, clearConversation } = useAppStore.getState()
    enqueueMessage({ id: 'q1', text: '남은 메시지', images: [] })
    expect(useAppStore.getState().queue).toHaveLength(1)
    clearConversation()
    expect(useAppStore.getState().queue).toHaveLength(0)
  })
})

describe('store queue — abortRun 시 큐 폐기 (원본 App.tsx:534 미러)', () => {
  beforeEach(() => resetQueue())

  it('abortRun 호출 시 예약 큐를 함께 버린다 (중단 직후 드레인 자동전송 방지)', async () => {
    useAppStore.setState({
      queue: [{ id: 'q1', text: '예약된 B', images: [] }],
      currentRunId: 'r1',
    } as Parameters<typeof useAppStore.setState>[0])
    expect(useAppStore.getState().queue).toHaveLength(1)
    await useAppStore.getState().abortRun()
    expect(useAppStore.getState().queue).toHaveLength(0)
  })

  it('실행 중이 아닐 때(currentRunId 없음) abortRun → 큐 유지', async () => {
    useAppStore.setState({
      queue: [{ id: 'q1', text: '남김', images: [] }],
      currentRunId: null,
    } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().abortRun()
    // currentRunId 없으면 early return → 큐 변화 없음
    expect(useAppStore.getState().queue).toHaveLength(1)
  })
})

describe('store queue — selectQueue 셀렉터', () => {
  beforeEach(() => resetQueue())

  it('selectQueue는 queue 배열을 반환', async () => {
    const { selectQueue } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.getState().enqueueMessage({ id: 's1', text: 'sel', images: [] })
    const q = selectQueue(useAppStore.getState())
    expect(q).toHaveLength(1)
    expect(q[0].id).toBe('s1')
  })
})
