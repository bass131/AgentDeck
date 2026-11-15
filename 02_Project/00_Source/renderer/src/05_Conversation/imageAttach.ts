import type { AttachedImage } from '@renderer/00_App/appStore'
import { isImagePath, extOf } from './images'
import { ipc } from '@renderer/01_Ipc'

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
      path = ipc.workspace.pathForFile(file)
    } catch {
      path = ''
    }

    if (!path || !isImagePath(path)) {
      try {
        const buf = await file.arrayBuffer()
        const res = await ipc.workspace.saveImage({ bytes: buf, ext: extOf(file) })
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
