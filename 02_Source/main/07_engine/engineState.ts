import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import type { EngineState, BackendId } from '../../shared/ipcContract'

export const ENGINE_STATE_BACKEND_ID: BackendId = 'claude-code'

async function defaultIsAvailable(): Promise<boolean> {
  try {
    await import('@anthropic-ai/claude-agent-sdk')
    return true
  } catch {
    return false
  }
}

const ENGINE_STATE_SDK_VERSION_FALLBACK = '0.3.186'

export function readInstalledSdkVersion(): string | null {
  try {
    const require = createRequire(import.meta.url)
    let dir = dirname(require.resolve('@anthropic-ai/claude-agent-sdk'))
    for (let i = 0; i < 8; i++) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
        if (pkg?.name === '@anthropic-ai/claude-agent-sdk') {
          const ver: unknown = pkg.version
          return typeof ver === 'string' && ver.length > 0 ? ver : null
        }
      } catch {
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return null
  } catch {
    return null
  }
}

async function defaultGetVersion(): Promise<string | null> {
  return readInstalledSdkVersion() ?? ENGINE_STATE_SDK_VERSION_FALLBACK
}

function defaultReadCredentials(): string | null {
  try {
    return readFileSync(join(homedir(), '.claude', '.credentials.json'), 'utf8')
  } catch {
    return null
  }
}

export interface EngineStateDeps {
  isAvailable?: () => Promise<boolean>
  getVersion?: () => Promise<string | null>
  readCredentials?: () => string | null
  env?: Record<string, string | undefined>
}

export async function getEngineState(deps?: EngineStateDeps): Promise<EngineState> {
  const isAvailableFn = deps?.isAvailable ?? defaultIsAvailable
  const getVersionFn = deps?.getVersion ?? defaultGetVersion
  const readCredsFn = deps?.readCredentials ?? defaultReadCredentials
  const env = deps?.env ?? (process.env as Record<string, string | undefined>)

  let available = false
  try {
    available = await isAvailableFn()
  } catch {
    available = false
  }

  let credTokenPresent = false
  try {
    const raw = readCredsFn()
    if (raw) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const creds: any = JSON.parse(raw)
      const tokenStr: unknown = creds?.claudeAiOauth?.accessToken
      credTokenPresent = typeof tokenStr === 'string' && tokenStr.length > 0
    }
  } catch {
    credTokenPresent = false
  }

  const apiKeyVal: string | undefined = env['ANTHROPIC_API_KEY']
  const envKeyPresent = typeof apiKeyVal === 'string' && apiKeyVal.length > 0

  const authed: boolean = credTokenPresent || envKeyPresent

  let version: string | null = null
  try {
    version = await getVersionFn()
    if (typeof version !== 'string') version = null
  } catch {
    version = null
  }

  return { available, authed, version }
}
