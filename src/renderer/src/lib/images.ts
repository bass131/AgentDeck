/**
 * images.ts — 이미지 첨부 헬퍼 (imageSrc / imageName).
 *
 * 순수 함수: 부수효과 0. fs/Node/IPC 호출 0.
 * ImageViewer, Composer 이미지 트레이에서 공유.
 */

/** the just-the-filename tail of a path (handles both slash styles) */
export function imageName(p: string): string {
  return p.split(/[\\/]/).pop() || p
}

/**
 * 렌더 가능한 src 반환.
 * 이미 data URL(data:image/...)인 경우 그대로, 로컬 경로이면 data URL 불가 → 경로 그대로.
 * ImageViewer는 컴포저 첨부 이미지(data URL)만 다루므로 src as-is를 반환해도 무방.
 */
export function imageSrc(p: string): string {
  // data URL은 그대로 렌더
  if (p.startsWith('data:')) return p
  // 로컬 경로는 그대로 반환 (main이 커스텀 프로토콜로 서빙할 경우 대비)
  return p
}
