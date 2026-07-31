import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getDefaultQueryFn } from './queryFn'
import { ClaudeAgentRun } from './claudeAgentRun'
import { createSkillsStore } from '../05_settings/skills'
import { createMcpStore } from '../05_settings/mcp'
import type { QueryFn } from './queryFn'
import type { AgentBackend, AgentRun, AgentRunInput } from './AgentBackend'
import type { SlashCommandInfo } from '../../shared/ipcContract'

export type { QueryFn } from './queryFn'

const SDK_VERSION = '0.3.186'

const NPM_REGISTRY_URL = 'https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk'

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

export interface ClaudeCodeBackendDeps {
  fetchImpl?: typeof fetch
  resolvePackageVersion?: () => string | null
}

export class ClaudeCodeBackend implements AgentBackend {
  readonly id = 'claude-code' as const

  private _queryFn: QueryFn | null
  private _skillOverridesProvider: () => Record<string, 'off'> | null
  private _mcpDeniedProvider: () => { serverName: string }[] | null
  private _fetchImpl: typeof fetch
  private _resolvePackageVersion: () => string | null
  private readonly _commandsCache = new Map<string, SlashCommandInfo[]>()

  constructor(
    queryFn?: QueryFn,
    skillOverridesProvider?: () => Record<string, 'off'> | null,
    mcpDeniedProvider?: () => { serverName: string }[] | null,
    deps?: ClaudeCodeBackendDeps
  ) {
    this._queryFn = queryFn ?? null
    this._skillOverridesProvider = skillOverridesProvider
      ?? (() => {
        try {
          return createSkillsStore().disabledSkillOverrides()
        } catch {
          return null
        }
      })
    this._mcpDeniedProvider = mcpDeniedProvider
      ?? (() => {
        try {
          return createMcpStore().deniedMcpServers()
        } catch {
          return null
        }
      })

    this._fetchImpl = deps?.fetchImpl ?? globalThis.fetch.bind(globalThis)

    this._resolvePackageVersion = deps?.resolvePackageVersion ?? readInstalledSdkVersion
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
      const { getVersionState } = await import('../engineVersions')
      const active = getVersionState().active
      if (typeof active === 'string' && active.length > 0) return active
    } catch {
    }
    try {
      const ver = this._resolvePackageVersion()
      if (typeof ver === 'string' && ver.length > 0) {
        return ver
      }
      return SDK_VERSION
    } catch {
      return SDK_VERSION
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
      onCommandsCaptured
    )
  }

  listSupportedCommands(workspaceRoot?: string | null): SlashCommandInfo[] {
    const key = workspaceRoot ?? ''
    return this._commandsCache.get(key) ?? []
  }
}
