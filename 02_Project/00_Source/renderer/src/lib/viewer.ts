export type OpenedViewer = 'code' | 'markdown' | 'image'

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

export function viewerForPath(path: string): OpenedViewer {
  const lastDot = path.lastIndexOf('.')
  if (lastDot === -1) return 'code'

  const ext = path.slice(lastDot + 1).toLowerCase()

  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  return 'code'
}
