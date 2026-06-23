/**
 * images.ts — 이미지 첨부 헬퍼 (22c: isImagePath / imageName / extOf 추가).
 *
 * 순수 함수: 부수효과 0. fs/Node/IPC 호출 0.
 * 원본 AgentCodeGUI lib/images.ts 이식 (imageSrc는 data URL 기반으로 대체).
 */

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'] as const

/** does this path/name look like an image we can show? */
export function isImagePath(p: string): boolean {
  const m = /\.([a-z0-9]+)$/i.exec(p)
  return !!m && IMAGE_EXTS.includes(m[1].toLowerCase() as (typeof IMAGE_EXTS)[number])
}

/** the just-the-filename tail of a path (handles both slash styles) */
export function imageName(p: string): string {
  return p.split(/[\\/]/).pop() || p
}

/**
 * 렌더 가능한 src 반환.
 * 이미 data URL(data:image/...)인 경우 그대로, 로컬 경로이면 경로 그대로.
 * ImageViewer는 컴포저 첨부 이미지(data URL)만 다루므로 src as-is를 반환해도 무방.
 */
export function imageSrc(p: string): string {
  // data URL은 그대로 렌더
  if (p.startsWith('data:')) return p
  // 로컬 경로는 그대로 반환 (main이 커스텀 프로토콜로 서빙할 경우 대비)
  return p
}

/**
 * File의 확장자 문자열 반환 (소문자).
 * 우선순위: file.name 확장자 → file.type MIME → 'png' 폴백.
 * svg+xml → 'svg', jpeg → 'jpg' 정규화.
 */
export function extOf(file: File): string {
  const fromName = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]
  if (fromName) return fromName.toLowerCase()
  const fromType = /image\/([a-z0-9.+\-]+)/i.exec(file.type)?.[1]
  if (fromType) {
    const t = fromType.toLowerCase()
    if (t === 'svg+xml') return 'svg'
    if (t === 'jpeg') return 'jpg'
    return t
  }
  return 'png'
}
