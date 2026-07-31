// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

class MockFileReader {
  result: string | ArrayBuffer | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null

  readAsDataURL(_file: Blob): void {
    Promise.resolve().then(() => {
      this.result = 'data:image/png;base64,MOCK'
      this.onload?.()
    })
  }
}

const mockPathForFile = vi.fn()
const mockSaveImageData = vi.fn()

Object.defineProperty(window, 'api', {
  value: {
    pathForFile: mockPathForFile,
    saveImageData: mockSaveImageData,
    conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
    agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
    agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
    onAgentEvent: vi.fn().mockReturnValue(vi.fn()),
  },
  writable: true,
  configurable: true,
})

// @ts-expect-error: jsdom FileReader 교체
global.FileReader = MockFileReader

function makeFile(name: string, type: string): File {
  return {
    name,
    type,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
  } as unknown as File
}

describe('filesToAttachedImages — (1) pathForFile 직득 경로', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('이미지 File에 pathForFile가 유효 경로 반환 → {path, dataUrl} 반환', async () => {
    mockPathForFile.mockReturnValue('/home/user/photo.png')
    mockSaveImageData.mockResolvedValue({ path: '' })

    const { filesToAttachedImages } = await import('../../../02_Source/renderer/src/lib/imageAttach')

    const file = makeFile('photo.png', 'image/png')
    const result = await filesToAttachedImages([file])

    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('/home/user/photo.png')
    expect(result[0].dataUrl).toBe('data:image/png;base64,MOCK')
    expect(mockSaveImageData).not.toHaveBeenCalled()
  })

  it('pathForFile 경로가 올바른 이미지 경로면 saveImageData 스킵', async () => {
    mockPathForFile.mockReturnValue('/tmp/img.jpg')

    const { filesToAttachedImages } = await import('../../../02_Source/renderer/src/lib/imageAttach')

    const file = makeFile('img.jpg', 'image/jpeg')
    const result = await filesToAttachedImages([file])

    expect(result[0].path).toBe('/tmp/img.jpg')
    expect(mockSaveImageData).not.toHaveBeenCalled()
  })
})

describe('filesToAttachedImages — (2) saveImageData IPC 폴백', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pathForFile 빈 문자열 → saveImageData 폴백 → path 반환', async () => {
    mockPathForFile.mockReturnValue('')
    mockSaveImageData.mockResolvedValue({ path: '/app/tmp/paste-abc.png' })

    const { filesToAttachedImages } = await import('../../../02_Source/renderer/src/lib/imageAttach')

    const file = makeFile('clipboard-paste', 'image/png')
    const result = await filesToAttachedImages([file])

    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('/app/tmp/paste-abc.png')
    expect(result[0].dataUrl).toBe('data:image/png;base64,MOCK')
    expect(mockSaveImageData).toHaveBeenCalledOnce()
    const req = mockSaveImageData.mock.calls[0][0] as { bytes: ArrayBuffer; ext: string }
    expect(req.ext).toBe('png')
  })

  it('pathForFile가 비이미지 경로 반환(확장자 없음) → saveImageData 폴백', async () => {
    mockPathForFile.mockReturnValue('/tmp/blob-no-ext')
    mockSaveImageData.mockResolvedValue({ path: '/app/tmp/fallback.png' })

    const { filesToAttachedImages } = await import('../../../02_Source/renderer/src/lib/imageAttach')

    const file = makeFile('blob', 'image/png')
    const result = await filesToAttachedImages([file])

    expect(result[0].path).toBe('/app/tmp/fallback.png')
    expect(mockSaveImageData).toHaveBeenCalledOnce()
  })

  it('saveImageData도 실패하면 해당 파일 skip', async () => {
    mockPathForFile.mockReturnValue('')
    mockSaveImageData.mockRejectedValue(new Error('IPC 오류'))

    const { filesToAttachedImages } = await import('../../../02_Source/renderer/src/lib/imageAttach')

    const file = makeFile('clipboard-paste', 'image/png')
    const result = await filesToAttachedImages([file])

    expect(result).toHaveLength(0)
  })
})

describe('filesToAttachedImages — (3) 비이미지 파일 skip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('text/plain 파일은 skip됨', async () => {
    const { filesToAttachedImages } = await import('../../../02_Source/renderer/src/lib/imageAttach')

    const file = makeFile('readme.txt', 'text/plain')
    const result = await filesToAttachedImages([file])

    expect(result).toHaveLength(0)
    expect(mockPathForFile).not.toHaveBeenCalled()
  })

  it('이미지+비이미지 혼합 → 이미지만 처리', async () => {
    mockPathForFile.mockReturnValue('/tmp/photo.png')

    const { filesToAttachedImages } = await import('../../../02_Source/renderer/src/lib/imageAttach')

    const imgFile = makeFile('photo.png', 'image/png')
    const txtFile = makeFile('doc.txt', 'text/plain')
    const result = await filesToAttachedImages([imgFile, txtFile])

    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('/tmp/photo.png')
  })
})

describe('filesToAttachedImages — (4) dataUrl 빈값 skip', () => {
  it('FileReader가 빈 dataUrl 반환 시 skip', async () => {
    class EmptyFileReader {
      result: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsDataURL(_file: Blob): void {
        Promise.resolve().then(() => {
          this.result = ''
          this.onload?.()
        })
      }
    }
    // @ts-expect-error: jsdom FileReader 교체
    global.FileReader = EmptyFileReader

    mockPathForFile.mockReturnValue('/tmp/photo.png')

    vi.resetModules()
    const { filesToAttachedImages } = await import('../../../02_Source/renderer/src/lib/imageAttach')

    const file = makeFile('photo.png', 'image/png')
    const result = await filesToAttachedImages([file])

    expect(result).toHaveLength(0)

    // @ts-expect-error: jsdom FileReader 복구
    global.FileReader = MockFileReader
  })
})
