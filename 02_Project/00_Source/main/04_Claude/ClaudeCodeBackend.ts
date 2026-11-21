import { getDefaultQueryFn } from './queryFn'
import { ClaudeAgentRun } from './run/claudeAgentRun'
import { readInstalledSdkVersion, SDK_VERSION_FALLBACK } from '@main/10_Engine/sdkVersion'
import type { QueryFn } from './queryFn'
import type { AgentBackend, AgentRun, AgentRunInput } from '@main/03_Agent/AgentBackend'
import type { SlashCommandInfo } from '../../shared/ipcContract'
import type { ControlsForRun } from './permission/controlsStore'

export type { QueryFn } from './queryFn'

const NPM_REGISTRY_URL = 'https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk'

interface ClaudeCodeBackendDeps {
  fetchImpl?: typeof fetch
  resolvePackageVersion?: () => string | null
  // 실행을 열 때의 컨트롤 검사. 앱 조립 지점(registry)이 닫힌 실패 검사를 넣는다
  controlsAtRunStart?: () => ControlsForRun
  // 엔진 경로 잠금의 userData 경로. 앱 조립 지점이 넣는다 — 던지면 실행을 열지 않는다
  engineLockDir?: () => string
}

export class ClaudeCodeBackend implements AgentBackend {
  readonly id = 'claude-code' as const

  private _queryFn: QueryFn | null
  private _skillOverridesProvider: () => Record<string, 'off'> | null
  private _mcpDeniedProvider: () => { serverName: string }[] | null
  private _fetchImpl: typeof fetch
  private _resolvePackageVersion: () => string | null
  private readonly _controlsAtRunStart: (() => ControlsForRun) | undefined
  private readonly _engineLockDir: (() => string) | undefined
  private readonly _commandsCache = new Map<string, SlashCommandInfo[]>()

  // 이 클래스는 store를 만들지 않는다. provider를 넘기지 않으면 비활성 목록이 없다(null).
  constructor(
    queryFn?: QueryFn,
    skillOverridesProvider?: () => Record<string, 'off'> | null,
    mcpDeniedProvider?: () => { serverName: string }[] | null,
    deps?: ClaudeCodeBackendDeps
  ) {
    this._queryFn = queryFn ?? null
    this._skillOverridesProvider = skillOverridesProvider ?? (() => null)
    this._mcpDeniedProvider = mcpDeniedProvider ?? (() => null)

    this._fetchImpl = deps?.fetchImpl ?? globalThis.fetch.bind(globalThis)

    this._resolvePackageVersion = deps?.resolvePackageVersion ?? readInstalledSdkVersion
    this._controlsAtRunStart = deps?.controlsAtRunStart
    this._engineLockDir = deps?.engineLockDir
  }

  async isAvailable(): Promise<boolean> {
    try {
      await getDefaultQueryFn()
      return true
    } catch {
      return false
    }
  }

  async version(): Promise<string | null> {
    try {
      const { getVersionState, activeInUse } = await import('@main/10_Engine/engineVersions')
      // 봉인이 맞지 않거나, major가 다르거나, 불러오기에 실패하면 번들 엔진이 돈다 — 보이는 버전도 번들 쪽이다
      const active = activeInUse(getVersionState())
      if (active) return active
    } catch {
    }
    try {
      const ver = this._resolvePackageVersion()
      if (typeof ver === 'string' && ver.length > 0) {
        return ver
      }
      return SDK_VERSION_FALLBACK
    } catch {
      return SDK_VERSION_FALLBACK
    }
  }

  async latestVersion(): Promise<string | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)

    try {
      let response: Response
      try {
        response = await this._fetchImpl(NPM_REGISTRY_URL, {
          signal: controller.signal
        })
      } catch {
        return null
      }

      if (!response.ok) {
        return null
      }

      let json: unknown
      try {
        json = await response.json()
      } catch {
        return null
      }

      const distTags = (json as Record<string, unknown>)?.['dist-tags']
      const latest = (distTags as Record<string, unknown>)?.['latest']
      if (typeof latest !== 'string' || latest.length === 0) {
        return null
      }

      return latest
    } finally {
      clearTimeout(timer)
    }
  }

  start(req: AgentRunInput): AgentRun {
    const wsKey = req.workspaceRoot ?? ''
    const onCommandsCaptured = (cmds: SlashCommandInfo[]): void => {
      this._commandsCache.set(wsKey, cmds)
    }
    return new ClaudeAgentRun(
      req,
      this._queryFn,
      this._skillOverridesProvider,
      this._mcpDeniedProvider,
      onCommandsCaptured,
      this._controlsAtRunStart,
      this._engineLockDir,
    )
  }

  listSupportedCommands(workspaceRoot?: string | null): SlashCommandInfo[] {
    const key = workspaceRoot ?? ''
    return this._commandsCache.get(key) ?? []
  }
}
