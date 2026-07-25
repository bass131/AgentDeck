// @vitest-environment jsdom
/**
 * image-attach.test.ts — store attachImagesFromFiles + remove/clear 단위 테스트 (TDD-first, 22c).
 *
 * window.api(pathForFile/saveImageData) mock + FileReader mock.
 * 두 경로 검증:
 *   1) 디스크 파일 (pathForFile → 유효 경로 직득)
 *   2) 클립보드 (pathForFile → '' → saveImageData 폴백)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── FileReader mock (jsdom FileReader는 readAsDataURL 비동기 미동작) ───────────
class MockFileReader {
  result: string | ArrayBuffer | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null

  readAsDataURL(_file: Blob): void {
    // 비동기로 onload 호출 (microtask)
    Promise.resolve().then(() => {
      this.result = 'data:image/png;base64,MOCK'
      this.onload?.()
    })
  }
}

// ── window.api mock ───────────────────────────────────────────────────────────
const mockPathForFile = vi.fn()
const mockSaveImageData = vi.fn()

Object.defineProperty(window, 'api', {
  value: {
    pathForFile: mockPathForFile,
    saveImageData: mockSaveImageData,
    // 다른 API는 stub
    conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
    conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
    agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
    agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
    onAgentEvent: vi.fn().mockReturnValue(vi.fn()),
    listFiles: vi.fn().mockResolvedValue({ files: [] }),
  },
  writable: true,
  configurable: true,
})

// ── FileReader 전역 교체 ──────────────────────────────────────────────────────
// @ts-expect-error: jsdom FileReader 교체
global.FileReader = MockFileReader

// ── 테스트 헬퍼 ──────────────────────────────────────────────────────────────
function makeFile(name: string, type: string): File {
  return { name, type, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) } as unknown as File
}

// ── 테스트 ───────────────────────────────────────────────────────────────────

describe('store.attachImagesFromFiles — 디스크 경로 직득', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pathForFile가 유효 경로 반환 시 attachedImages에 추가됨', async () => {
    mockPathForFile.mockReturnValue('/tmp/photo.png')
    mockSaveImageData.mockResolvedValue({ path: '' })

    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({ attachedImages: [] } as Parameters<typeof useAppStore.setState>[0])

    const file = makeFile('photo.png', 'image/png')

    await useAppStore.getState().attachImagesFromFiles([file])

    const { attachedImages } = useAppStore.getState()
    expect(attachedImages.length).toBe(1)
    expect(attachedImages[0].path).toBe('/tmp/photo.png')
    expect(attachedImages[0].dataUrl).toBe('data:image/png;base64,MOCK')
    // saveImageData는 호출 안 됨
    expect(mockSaveImageData).not.toHaveBeenCalled()
  })

  it('이미지가 아닌 파일(txt)은 skip됨', async () => {
    mockPathForFile.mockReturnValue('/tmp/readme.txt')

    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({ attachedImages: [] } as Parameters<typeof useAppStore.setState>[0])

    const file = makeFile('readme.txt', 'text/plain')
    await useAppStore.getState().attachImagesFromFiles([file])

    const { attachedImages } = useAppStore.getState()
    expect(attachedImages.length).toBe(0)
  })
})

describe('store.attachImagesFromFiles — 클립보드 saveImageData 폴백', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pathForFile가 빈 문자열 → saveImageData 폴백 → attachedImages에 추가됨', async () => {
    mockPathForFile.mockReturnValue('')
    mockSaveImageData.mockResolvedValue({ path: '/app/attachments/paste-uuid.png' })

    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({ attachedImages: [] } as Parameters<typeof useAppStore.setState>[0])

    const file = makeFile('clipboard-paste', 'image/png')
    await useAppStore.getState().attachImagesFromFiles([file])

    const { attachedImages } = useAppStore.getState()
    expect(attachedImages.length).toBe(1)
    expect(attachedImages[0].path).toBe('/app/attachments/paste-uuid.png')
    expect(attachedImages[0].dataUrl).toBe('data:image/png;base64,MOCK')
    expect(mockSaveImageData).toHaveBeenCalledOnce()
    const req = mockSaveImageData.mock.calls[0][0] as { bytes: ArrayBuffer; ext: string }
    expect(req.ext).toBe('png')
  })

  it('pathForFile가 비이미지 경로 반환 시(isImagePath 실패) → saveImageData 폴백', async () => {
    mockPathForFile.mockReturnValue('/tmp/unknown')
    mockSaveImageData.mockResolvedValue({ path: '/app/attachments/paste-uuid.png' })

    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({ attachedImages: [] } as Parameters<typeof useAppStore.setState>[0])

    const file = makeFile('pasted-image', 'image/png')
    await useAppStore.getState().attachImagesFromFiles([file])

    expect(mockSaveImageData).toHaveBeenCalledOnce()
  })

  it('saveImageData도 실패하면 해당 파일 skip', async () => {
    mockPathForFile.mockReturnValue('')
    mockSaveImageData.mockRejectedValue(new Error('IPC error'))

    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({ attachedImages: [] } as Parameters<typeof useAppStore.setState>[0])

    const file = makeFile('clipboard-paste', 'image/png')
    await useAppStore.getState().attachImagesFromFiles([file])

    expect(useAppStore.getState().attachedImages.length).toBe(0)
  })
})

describe('store.removeAttachedImage / clearAttachedImages', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      attachedImages: [
        { path: '/a.png', dataUrl: 'data:image/png;base64,A' },
        { path: '/b.jpg', dataUrl: 'data:image/jpeg;base64,B' },
        { path: '/c.gif', dataUrl: 'data:image/gif;base64,C' },
      ],
    } as Parameters<typeof useAppStore.setState>[0])
  })

  it('removeAttachedImage(0) → 첫 번째 항목 제거', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.getState().removeAttachedImage(0)
    const { attachedImages } = useAppStore.getState()
    expect(attachedImages.length).toBe(2)
    expect(attachedImages[0].path).toBe('/b.jpg')
  })

  it('removeAttachedImage(1) → 두 번째 항목 제거', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.getState().removeAttachedImage(1)
    const { attachedImages } = useAppStore.getState()
    expect(attachedImages.length).toBe(2)
    expect(attachedImages[1].path).toBe('/c.gif')
  })

  it('clearAttachedImages → 빈 배열', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.getState().clearAttachedImages()
    expect(useAppStore.getState().attachedImages).toEqual([])
  })
})

describe('store.selectAttachedImages 셀렉터', () => {
  it('selectAttachedImages → attachedImages 반환', async () => {
    const { useAppStore, selectAttachedImages } = await import('../../../02.Source/renderer/src/store/appStore')
    const images = [{ path: '/x.png', dataUrl: 'data:image/png;base64,X' }]
    useAppStore.setState({ attachedImages: images } as Parameters<typeof useAppStore.setState>[0])
    expect(selectAttachedImages(useAppStore.getState())).toEqual(images)
  })
})

describe('store.clearConversation → attachedImages 포함 리셋', () => {
  it('clearConversation 후 attachedImages === []', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      attachedImages: [{ path: '/x.png', dataUrl: 'data:image/png;base64,X' }],
    } as Parameters<typeof useAppStore.setState>[0])
    useAppStore.getState().clearConversation()
    expect(useAppStore.getState().attachedImages).toEqual([])
  })
})
