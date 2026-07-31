import { sanitizeDescription } from './descriptionUtils'
import type { SlashCommandInfo } from '../../shared/ipcContract'

export type QueryFn = (params: {
  prompt: string
  options?: unknown
}) => AsyncIterable<unknown> & { interrupt?: () => Promise<void> }

export type PersistentQueryFn = (params: {
  prompt: AsyncIterable<unknown>
  options?: unknown
}) => AsyncIterable<unknown> & { interrupt?: () => Promise<void> }

export async function getDefaultQueryFn(): Promise<QueryFn> {
  try {
    const { loadActiveQuery } = await import('../engineVersions')
    const active = await loadActiveQuery()
    if (active) return active as unknown as QueryFn
  } catch {
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk = await import('@anthropic-ai/claude-agent-sdk') as any
  return sdk.query as QueryFn
}

export function captureSupportedCommands(
  queryIterable: AsyncIterable<unknown> & { interrupt?: () => Promise<void> },
  onCaptured: ((cmds: SlashCommandInfo[]) => void) | null
): void {
  if (!onCaptured) return
  const rawIterable = queryIterable as unknown as Record<string, unknown>
  if (typeof rawIterable['supportedCommands'] !== 'function') return
  void (rawIterable['supportedCommands'] as () => Promise<unknown>)()
    .then((result: unknown) => {
      if (!Array.isArray(result)) return
      const cmds: SlashCommandInfo[] = []
      for (const item of result) {
        if (!item || typeof item !== 'object') continue
        const raw = item as Record<string, unknown>
        const name = typeof raw['name'] === 'string' ? raw['name'].trim() : ''
        if (!name) continue
        const rawDesc = raw['description'] != null ? String(raw['description']) : ''
        const description = sanitizeDescription(rawDesc)
        const rawHint = raw['argumentHint']
        const argHint = typeof rawHint === 'string' && rawHint.trim().length > 0
          ? rawHint.trim()
          : undefined
        const cmd: SlashCommandInfo = { name, description, scope: 'builtin' }
        if (argHint !== undefined) cmd.argHint = argHint
        cmds.push(cmd)
      }
      onCaptured(cmds)
    })
    .catch(() => {
    })
}
