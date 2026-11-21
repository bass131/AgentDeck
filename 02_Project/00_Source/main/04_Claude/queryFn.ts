import { join } from 'node:path'
import { sanitizeDescription } from './stream/descriptionUtils'
import type { SlashCommandInfo } from '../../shared/ipcContract'

export type QueryFn = (params: {
  prompt: string
  options?: unknown
}) => AsyncIterable<unknown> & { interrupt?: () => Promise<void> }

export type PersistentQueryFn = (params: {
  prompt: AsyncIterable<unknown>
  options?: unknown
}) => AsyncIterable<unknown> & { interrupt?: () => Promise<void> }

// 설치본에서 번들 SDK의 실행 파일은 asar 밖(app.asar.unpacked)에 있어야 띄울 수 있다
export function bundledClaudeExecutable(env: {
  isPackaged: boolean
  resourcesPath: string
  platform: string
  arch: string
}): string | null {
  if (!env.isPackaged) return null
  const exe = env.platform === 'win32' ? 'claude.exe' : 'claude'
  return join(env.resourcesPath, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', `claude-agent-sdk-${env.platform}-${env.arch}`, exe)
}

export function withClaudeExecutable(query: QueryFn, executable: string | null): QueryFn {
  if (executable === null) return query
  return (params) => {
    const options = (params.options ?? {}) as Record<string, unknown>
    if (options.pathToClaudeCodeExecutable !== undefined) return query(params)
    return query({ ...params, options: { ...options, pathToClaudeCodeExecutable: executable } })
  }
}

export async function getDefaultQueryFn(): Promise<QueryFn> {
  try {
    const { loadActiveQuery } = await import('@main/10_Engine/engineVersions')
    const active = await loadActiveQuery()
    if (active) return active as unknown as QueryFn
  } catch {
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk = await import('@anthropic-ai/claude-agent-sdk') as any
  const electron = (await import('electron')) as { app?: { isPackaged?: boolean } }
  const executable = bundledClaudeExecutable({
    isPackaged: electron.app?.isPackaged === true,
    resourcesPath: process.resourcesPath,
    platform: process.platform,
    arch: process.arch,
  })
  return withClaudeExecutable(sdk.query as QueryFn, executable)
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
