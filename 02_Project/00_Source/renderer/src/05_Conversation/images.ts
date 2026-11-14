const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'] as const

export function isImagePath(p: string): boolean {
  const m = /\.([a-z0-9]+)$/i.exec(p)
  return !!m && IMAGE_EXTS.includes(m[1].toLowerCase() as (typeof IMAGE_EXTS)[number])
}

export function imageName(p: string): string {
  return p.split(/[\\/]/).pop() || p
}

export function imageSrc(p: string): string {
  if (p.startsWith('data:')) return p
  return p
}

export function extOf(file: File): string {
  const fromName = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]
  if (fromName) return fromName.toLowerCase()
  const fromType = /image\/([a-z0-9.+-]+)/i.exec(file.type)?.[1]
  if (fromType) {
    const t = fromType.toLowerCase()
    if (t === 'svg+xml') return 'svg'
    if (t === 'jpeg') return 'jpg'
    return t
  }
  return 'png'
}
