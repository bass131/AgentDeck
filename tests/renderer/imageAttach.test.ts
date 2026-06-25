// @vitest-environment jsdom
/**
 * imageAttach.test.ts — filesToAttachedImages 헬퍼 단위 테스트 (TDD-first).
 *
 * window.api(pathForFile/saveImageData) mock + FileReader mock.
 * 검증 경로:
 *   (1) 이미지 File → {path, dataUrl} 변환 (pathForFile 직득)
 *   (2) blob/클립보드 → saveImageData IPC 폴백
 *   (3) 비이미지 파일 skip
 *   (4) dataUrl 읽기 실패 skip
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
    conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
    agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
    agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
    onAgentEvent: vi.fn().mockReturnValue(vi.fn()),
  },
  writable: true,
  configurable: true,
})

// ── FileReader 전역 교체 ──────────────────────────────────────────────────────
// @ts-expect-error: jsdom FileReader 교체
global.FileReader = MockFileReader

// ── 테스트 헬퍼 ──────────────────────────────────────────────────────────────
function makeFile(name: string, type: string): File {
  return {
    name,
    type,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
  } as unknown as File
}

// ── 테스트 ───────────────────────────────────────────────────────────────────

describe('filesToAttachedImages — (1) pathForFile 직득 경로', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('이미지 File에 pathForFile가 유효 경로 반환 → {path, dataUrl} 반환', async () => {
    mockPathForFile.mockReturnValue('/home/user/photo.png')
    mockSaveImageData.mockResolvedValue({ path: '' })

    const { filesToAttachedImages } = await import('../../src/renderer/src/lib/imageAttach')

    const file = makeFile('photo.png', 'image/png')
    const result = await filesToAttachedImages([file])

    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('/home/user/photo.png')
    expect(result[0].dataUrl).toBe('data:image/png;base64,MOCK')
    // saveImageData는 호출 안 됨
    expect(mockSaveImageData).not.toHaveBeenCalled()
  })

  it('pathForFile 경로가 올바른 이미지 경로면 saveImageData 스킵', async () => {
    mockPathForFile.mockReturnValue('/tmp/img.jpg')

    const { filesToAttachedImages } = await import('../../src/renderer/src/lib/imageAttach')

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

    const { filesToAttachedImages } = await import('../../src/renderer/src/lib/imageAttach')

    const file = makeFile('clipboard-paste', 'image/png')
    const result = await filesToAttachedImages([file])

    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('/app/tmp/paste-abc.png')
    expect(result[0].dataUrl).toBe('data:image/png;base64,MOCK')
    expect(mockSaveImageData).toHaveBeenCalledOnce()
    // saveImageData에 bytes와 ext 전달 확인
    const req = mockSaveImageData.mock.calls[0][0] as { bytes: ArrayBuffer; ext: string }
    expect(req.ext).toBe('png')
  })

  it('pathForFile가 비이미지 경로 반환(확장자 없음) → saveImageData 폴백', async () => {
    mockPathForFile.mockReturnValue('/tmp/blob-no-ext')
    mockSaveImageData.mockResolvedValue({ path: '/app/tmp/fallback.png' })

    const { filesToAttachedImages } = await import('../../src/renderer/src/lib/imageAttach')

    const file = makeFile('blob', 'image/png')
    const result = await filesToAttachedImages([file])

    expect(result[0].path).toBe('/app/tmp/fallback.png')
    expect(mockSaveImageData).toHaveBeenCalledOnce()
  })

  it('saveImageData도 실패하면 해당 파일 skip', async () => {
    mockPathForFile.mockReturnValue('')
    mockSaveImageData.mockRejectedValue(new Error('IPC 오류'))

    const { filesToAttachedImages } = await import('../../src/renderer/src/lib/imageAttach')

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
    const { filesToAttachedImages } = await import('../../src/renderer/src/lib/imageAttach')

    const file = makeFile('readme.txt', 'text/plain')
    const result = await filesToAttachedImages([file])

    expect(result).toHaveLength(0)
    expect(mockPathForFile).not.toHaveBeenCalled()
  })

  it('이미지+비이미지 혼합 → 이미지만 처리', async () => {
    mockPathForFile.mockReturnValue('/tmp/photo.png')

    const { filesToAttachedImages } = await import('../../src/renderer/src/lib/imageAttach')

    const imgFile = makeFile('photo.png', 'image/png')
    const txtFile = makeFile('doc.txt', 'text/plain')
    const result = await filesToAttachedImages([imgFile, txtFile])

    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('/tmp/photo.png')
  })
})

describe('filesToAttachedImages — (4) dataUrl 빈값 skip', () => {
  it('FileReader가 빈 dataUrl 반환 시 skip', async () => {
    // MockFileReader를 빈 결과로 오버라이드
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

    // 모듈 캐시를 우회하기 위해 vi.resetModules 이후 재임포트
    vi.resetModules()
    const { filesToAttachedImages } = await import('../../src/renderer/src/lib/imageAttach')

    const file = makeFile('photo.png', 'image/png')
    const result = await filesToAttachedImages([file])

    expect(result).toHaveLength(0)

    // 원래 mock 복구
    // @ts-expect-error: jsdom FileReader 복구
    global.FileReader = MockFileReader
  })
})
