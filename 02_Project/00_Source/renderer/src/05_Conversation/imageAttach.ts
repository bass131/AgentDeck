import type { AttachedImage } from '../store/appStore'
import { isImagePath, extOf } from './images'

export type { AttachedImage }

export async function filesToAttachedImages(files: File[]): Promise<AttachedImage[]> {
  const result: AttachedImage[] = []

  for (const file of files) {
    const isImage = file.type.startsWith('image/') || isImagePath(file.name)
    if (!isImage) continue

    const dataUrl: string = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve('')
      reader.readAsDataURL(file)
    })
    if (!dataUrl) continue

    let path = ''
    try {
      path = window.api.pathForFile(file)
    } catch {
      path = ''
    }

    if (!path || !isImagePath(path)) {
      try {
        const buf = await file.arrayBuffer()
        const res = await window.api.saveImageData({ bytes: buf, ext: extOf(file) })
        path = res.path
      } catch {
        continue
      }
    }

    if (path) {
      result.push({ path, dataUrl })
    }
  }

  return result
}
