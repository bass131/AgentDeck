export const PICKER_MODELS = [
  'claude-opus-5',
  'claude-fable-5',
  'claude-sonnet-5',
  'claude-haiku-4-5'
] as const

export const KNOWN_MODELS = [
  ...PICKER_MODELS,
  'claude-opus-4-8'
] as const

export type KnownModel = (typeof KNOWN_MODELS)[number]

export type PickerModel = (typeof PICKER_MODELS)[number]

export const LEGACY_ALIASES: Readonly<Record<string, KnownModel>> = {
  opus: 'claude-opus-4-8',
  fable: 'claude-fable-5',
  sonnet: 'claude-sonnet-5',
  haiku: 'claude-haiku-4-5'
}

function stripWireSuffixes(value: string): string {
  return value.replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '')
}

export function normalizeModel(value: string | undefined): KnownModel | undefined {
  if (value === undefined) return undefined
  if ((KNOWN_MODELS as readonly string[]).includes(value)) return value as KnownModel

  const stripped = stripWireSuffixes(value)
  if ((KNOWN_MODELS as readonly string[]).includes(stripped)) return stripped as KnownModel

  return LEGACY_ALIASES[value]
}
