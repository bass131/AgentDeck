import type { SlashCommandInfo } from '../../shared/ipcContract'

const SCOPE_ORDER: Record<SlashCommandInfo['scope'], number> = {
  builtin: 0,
  project: 1,
  user: 2,
}

function compareCommands(a: SlashCommandInfo, b: SlashCommandInfo): number {
  const scopeDiff = SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope]
  if (scopeDiff !== 0) return scopeDiff
  return a.name.localeCompare(b.name)
}

export function mergeSlashCommands(
  store: SlashCommandInfo[],
  captured: SlashCommandInfo[]
): SlashCommandInfo[] {
  const storeNames = new Set(store.map(c => c.name))

  const additions: SlashCommandInfo[] = captured
    .filter(c => !storeNames.has(c.name))
    .map(c => {
      const safe: SlashCommandInfo = {
        name: c.name,
        description: c.description,
        scope: c.scope,
      }
      if (c.argHint !== undefined) safe.argHint = c.argHint
      return safe
    })

  const merged = [...store, ...additions]
  merged.sort(compareCommands)
  return merged
}
