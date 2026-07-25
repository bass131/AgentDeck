/**
 * viewer.ts — 파일 경로 → 뷰어 종류 판별 유틸.
 *
 * 순수 함수: 부수효과 0. fs/Node/IPC 호출 0.
 * 이미지 확장자 목록은 src/main/02_fs/read.ts 화이트리스트와 동일하게 유지.
 */

/** 코드/마크다운/이미지 뷰어 종류 */
export type OpenedViewer = 'code' | 'markdown' | 'image'

/**
 * 이미지 확장자 집합.
 * src/main/02_fs/read.ts의 MIME 화이트리스트와 일치.
 */
export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'bmp',
  'ico',
])

/**
 * 파일 경로 → 뷰어 종류.
 * 확장자 소문자 기준 판별.
 * - 이미지 확장자 → 'image'
 * - md/markdown → 'markdown'
 * - 그 외 → 'code'
 */
export function viewerForPath(path: string): OpenedViewer {
  // 마지막 점 이후 문자열이 확장자
  const lastDot = path.lastIndexOf('.')
  if (lastDot === -1) return 'code'

  const ext = path.slice(lastDot + 1).toLowerCase()

  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  return 'code'
}
