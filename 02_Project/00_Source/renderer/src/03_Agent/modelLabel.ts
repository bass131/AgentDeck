// 패밀리별 색 표 — 모델 ID 표가 아니라 패밀리 이름 표다 (M06 G4). 선택기 점·서브에이전트 배지가 같이 쓴다.
// 여기 없는 새 패밀리는 라벨이 원문 그대로, 색은 중립이다. 선택기 라벨은 SDK displayName을 쓰므로 영향이 없다.
export const MODEL_FAMILY_COLORS: Readonly<Record<string, string>> = {
  opus: 'var(--violet)',
  sonnet: 'var(--blue)',
  haiku: 'var(--teal)',
  fable: 'var(--gold)',
}

const FAMILIES: readonly string[] = Object.keys(MODEL_FAMILY_COLORS)

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildModelIdPattern(): RegExp {
  const familyIds = FAMILIES.map(escapeRegExp).join('|')
  return new RegExp(`claude-(${familyIds})-(\\d+)(?:-(\\d{1,2}))?`, 'i')
}

export function modelLabel(id: string | undefined): string | undefined {
  if (!id) return undefined
  const m = buildModelIdPattern().exec(id)
  if (!m) return id
  const family = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()
  return family + ' ' + m[2] + (m[3] ? '.' + m[3] : '')
}

export function modelFamilyColor(id: string | undefined): string | undefined {
  if (!id) return undefined
  const m = buildModelIdPattern().exec(id)
  if (!m) return undefined
  return MODEL_FAMILY_COLORS[m[1].toLowerCase()]
}

export function isBareModelAlias(id: string | undefined): boolean {
  if (!id) return false
  return FAMILIES.some((family) => family === id.toLowerCase())
}
