import { IMAGE_EXTENSIONS } from './viewer'

export interface FileType {
  label: string
  color: string
}

const EXT: Record<string, FileType> = {
  ts: { label: 'TS', color: 'oklch(0.52 0.13 255)' },
  tsx: { label: 'TSX', color: 'oklch(0.60 0.12 215)' },
  js: { label: 'JS', color: 'oklch(0.63 0.14 85)' },
  jsx: { label: 'JSX', color: 'oklch(0.60 0.12 215)' },
  mjs: { label: 'JS', color: 'oklch(0.63 0.14 85)' },
  cjs: { label: 'JS', color: 'oklch(0.63 0.14 85)' },
  json: { label: '{}', color: 'oklch(0.63 0.13 80)' },
  css: { label: 'CSS', color: 'oklch(0.48 0.16 265)' },
  scss: { label: 'SCSS', color: 'oklch(0.60 0.15 350)' },
  less: { label: 'LESS', color: 'oklch(0.48 0.14 265)' },
  html: { label: '<>', color: 'oklch(0.58 0.16 40)' },
  py: { label: 'PY', color: 'oklch(0.50 0.12 245)' },
  rs: { label: 'RS', color: 'oklch(0.55 0.10 40)' },
  go: { label: 'GO', color: 'oklch(0.60 0.12 215)' },
  java: { label: 'JAVA', color: 'oklch(0.55 0.14 40)' },
  c: { label: 'C', color: 'oklch(0.55 0.10 245)' },
  h: { label: 'H', color: 'oklch(0.55 0.10 245)' },
  cpp: { label: 'C++', color: 'oklch(0.52 0.13 255)' },
  cs: { label: 'C#', color: 'oklch(0.52 0.14 300)' },
  md: { label: 'MD', color: 'oklch(0.46 0.08 255)' },
  markdown: { label: 'MD', color: 'oklch(0.46 0.08 255)' },
  sh: { label: 'SH', color: 'oklch(0.56 0.14 158)' },
  bash: { label: 'SH', color: 'oklch(0.56 0.14 158)' },
  yml: { label: 'YML', color: 'oklch(0.58 0.10 200)' },
  yaml: { label: 'YML', color: 'oklch(0.58 0.10 200)' },
  toml: { label: 'TOML', color: 'oklch(0.58 0.10 200)' },
  xml: { label: 'XML', color: 'oklch(0.55 0.10 140)' },
  sql: { label: 'SQL', color: 'oklch(0.58 0.11 220)' },
  txt: { label: 'TXT', color: 'oklch(0.56 0.02 80)' },
}

const IMG: FileType = { label: 'IMG', color: 'oklch(0.55 0.12 200)' }

const NAMED: Record<string, FileType> = {
  dockerfile: { label: 'DKR', color: 'oklch(0.55 0.13 240)' },
  makefile: { label: 'MK', color: 'oklch(0.55 0.10 60)' },
  '.gitignore': { label: 'GIT', color: 'oklch(0.58 0.16 40)' },
  '.gitattributes': { label: 'GIT', color: 'oklch(0.58 0.16 40)' },
  license: { label: 'LIC', color: 'oklch(0.56 0.03 80)' },
}

const GENERIC: FileType = { label: '', color: 'var(--text-4)' }

function hashHue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return ((h % 360) + 360) % 360
}

export function fileTypeFor(path: string): FileType {
  const base = (path.split(/[\\/]/).pop() ?? path).toLowerCase()

  if (NAMED[base]) return NAMED[base]

  const lastDot = base.lastIndexOf('.')
  if (lastDot <= 0) return GENERIC

  const ext = base.slice(lastDot + 1)
  if (IMAGE_EXTENSIONS.has(ext)) return IMG
  if (EXT[ext]) return EXT[ext]

  return { label: ext.slice(0, 4).toUpperCase(), color: `oklch(0.55 0.13 ${hashHue(ext)})` }
}
