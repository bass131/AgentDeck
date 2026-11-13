import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const IMAGE_EXTS: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
}

export function safeImageExt(ext: string): string {
  const normalized = ('.' + String(ext || 'png').replace(/^\.+/, '').toLowerCase()).replace(
    /[^.a-z0-9]/g,
    ''
  )
  return normalized in IMAGE_EXTS ? normalized : '.png'
}

export async function saveImageBytes(
  dir: string,
  bytes: ArrayBuffer | Buffer,
  ext: string
): Promise<string> {
  await mkdir(dir, { recursive: true })
  const safeExt = safeImageExt(ext)
  const filename = `paste-${randomUUID()}${safeExt}`
  const abs = join(dir, filename)
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes as ArrayBuffer)
  await writeFile(abs, buf)
  return abs
}
