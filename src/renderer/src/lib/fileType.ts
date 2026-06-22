/**
 * fileType.ts — 파일 경로 → 시각 배지(monogram label + 색). 순수, 부수효과 0.
 *
 * 책임은 *배지 색/라벨만*. 언어 판별/뷰어 라우팅은 lib/viewer.ts(단일 진실원) 담당 —
 * 여기서 lang 매핑을 신설하지 않는다. 이미지 확장자는 viewer.ts IMAGE_EXTENSIONS 재사용.
 *
 * 색은 oklch 고정값(파일타입 식별색 — 테마 토큰이 아니라 타입별 고정 hue) 또는 var().
 * label='' = 제네릭(호출측이 IconFile 렌더).
 */
import { IMAGE_EXTENSIONS } from './viewer'

export interface FileType {
  /** 1~4자 monogram. '' = 제네릭(아이콘) */
  label: string
  /** 배지 색 (oklch 고정 hue 또는 var()) */
  color: string
}

/** 확장자 → 배지 (소문자 ext 키) */
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

/** 이미지(IMAGE_EXTENSIONS) 공통 배지 */
const IMG: FileType = { label: 'IMG', color: 'oklch(0.55 0.12 200)' }

/** 특수 파일명(확장자 없는/관례 파일) — 소문자 basename 키 */
const NAMED: Record<string, FileType> = {
  dockerfile: { label: 'DKR', color: 'oklch(0.55 0.13 240)' },
  makefile: { label: 'MK', color: 'oklch(0.55 0.10 60)' },
  '.gitignore': { label: 'GIT', color: 'oklch(0.58 0.16 40)' },
  '.gitattributes': { label: 'GIT', color: 'oklch(0.58 0.16 40)' },
  license: { label: 'LIC', color: 'oklch(0.56 0.03 80)' },
}

/** 제네릭(확장자 없음/미지 dotfile) — 호출측이 IconFile 렌더 */
const GENERIC: FileType = { label: '', color: 'var(--text-4)' }

/** 미지 확장자용 결정적 hue 해시 (0~359) */
function hashHue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return ((h % 360) + 360) % 360
}

/** 파일 경로 → 배지. 디렉토리는 호출측이 폴더 아이콘 사용(여기선 파일 전용). */
export function fileTypeFor(path: string): FileType {
  const base = (path.split(/[\\/]/).pop() ?? path).toLowerCase()

  if (NAMED[base]) return NAMED[base]

  const lastDot = base.lastIndexOf('.')
  // 점 없음 또는 선두 점뿐(.env 등 dotfile) → 제네릭
  if (lastDot <= 0) return GENERIC

  const ext = base.slice(lastDot + 1)
  if (IMAGE_EXTENSIONS.has(ext)) return IMG
  if (EXT[ext]) return EXT[ext]

  // 미지 확장자 → 첫 4자 대문자 monogram + 해시 hue
  return { label: ext.slice(0, 4).toUpperCase(), color: `oklch(0.55 0.13 ${hashHue(ext)})` }
}
