import { readInstalledSdkVersion, SDK_VERSION_FALLBACK } from './sdkVersion'
import { readClaudeCredentials } from './credentials'
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

async function defaultGetVersion(): Promise<string | null> {
  return readInstalledSdkVersion() ?? SDK_VERSION_FALLBACK
}

interface EngineStateDeps {
  isAvailable?: () => Promise<boolean>
  getVersion?: () => Promise<string | null>
  readCredentials?: () => string | null
  env?: Record<string, string | undefined>
}

export async function getEngineState(deps?: EngineStateDeps): Promise<EngineState> {
  const isAvailableFn = deps?.isAvailable ?? defaultIsAvailable
  const getVersionFn = deps?.getVersion ?? defaultGetVersion
  const readCredsFn = deps?.readCredentials ?? readClaudeCredentials
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
