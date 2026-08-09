import { KNOWN_MODELS } from '../../../shared/knownModels'
import { MODELS } from './pickerOptions'

const FAMILIES: readonly string[] = [
  ...new Set(
    KNOWN_MODELS.map((id) => id.split('-')[1]).filter((f): f is string => Boolean(f))
  )
]

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
  const family = m[1].toLowerCase()
  return MODELS.find((opt) => opt.id.split('-')[1] === family)?.color
}

export function isBareModelAlias(id: string | undefined): boolean {
  if (!id) return false
  return FAMILIES.some((family) => family === id.toLowerCase())
}
