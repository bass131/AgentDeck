export const MAX_SYSTEM_PROMPT_LEN = 16000

export function normalizeSystemPrompt(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  if (trimmed.length > MAX_SYSTEM_PROMPT_LEN) {
    return trimmed.slice(0, MAX_SYSTEM_PROMPT_LEN)
  }
  return trimmed
}
