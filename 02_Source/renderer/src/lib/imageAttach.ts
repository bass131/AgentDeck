/**
 * imageAttach.ts — 패널 이미지 첨부 헬퍼 (멀티패널용).
 *
 * filesToAttachedImages: File[] → AttachedImage[] 변환.
 * appStore.attachImagesFromFiles(L916-955)의 File→{path,dataUrl} 로직을 추출.
 *
 * CRITICAL: renderer untrusted — fs/Node 직접 호출 0.
 * 경로 취득: pathForFile 직득 → 실패/비이미지 경로이면 saveImageData IPC 폴백.
 *
 * 단방향 흐름: MultiWorkspace(UI) → filesToAttachedImages → AttachedImage[] → state.
 */
import type { AttachedImage } from '../store/appStore'
import { isImagePath, extOf } from './images'

export type { AttachedImage }

/**
 * File 배열을 AttachedImage 배열로 변환.
 *
 * - 이미지가 아닌 File은 skip.
 * - dataUrl 읽기 실패(FileReader onerror, 빈 결과)는 skip.
 * - pathForFile 직득 성공 + isImagePath 통과 → path 직사용.
 * - pathForFile 실패 / 비이미지 경로 → saveImageData IPC 폴백.
 * - saveImageData 실패도 skip.
 *
 * CRITICAL: window.api 경유만 — fs/Node 호출 0.
 */
export async function filesToAttachedImages(files: File[]): Promise<AttachedImage[]> {
  const result: AttachedImage[] = []

  for (const file of files) {
    // 이미지가 아닌 파일 skip
    const isImage = file.type.startsWith('image/') || isImagePath(file.name)
    if (!isImage) continue

    // dataUrl 생성 (FileReader, Promise 래핑)
    const dataUrl: string = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve('')
      reader.readAsDataURL(file)
    })
    // 빈 dataUrl은 skip (읽기 실패)
    if (!dataUrl) continue

    // 경로 취득: pathForFile 직득 → 실패/비이미지이면 saveImageData 폴백
    let path = ''
    try {
      path = window.api.pathForFile(file)
    } catch {
      path = ''
    }

    if (!path || !isImagePath(path)) {
      // 클립보드 붙여넣기 / 드래그 등 — saveImageData IPC 경유
      try {
        const buf = await file.arrayBuffer()
        const res = await window.api.saveImageData({ bytes: buf, ext: extOf(file) })
        path = res.path
      } catch {
        // unreadable blob — skip
        continue
      }
    }

    if (path) {
      result.push({ path, dataUrl })
    }
  }

  return result
}
