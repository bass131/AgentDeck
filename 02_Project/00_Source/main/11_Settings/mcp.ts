import {
  readFileSync as nodeReadFileSync,
  writeFileSync as nodeWriteFileSync,
  mkdirSync as nodeMkdirSync,
} from 'node:fs'
import { join } from 'node:path'
import { homedir as nodeHomedir } from 'node:os'
import { getUserDataDir } from '@main/02_Common/userData'
import type { McpServerInfo } from '../../shared/ipcContract'
import { createDisabledOverlay } from './disabledOverlay'

const ORIGIN_RANK: Record<'user' | 'project' | 'local', number> = {
  user: 0,
  project: 1,
  local: 2,
}

export interface McpDeps {
  homedir?: () => string
  getUserData?: () => string
  readFile?: (filePath: string) => string
  writeFile?: (filePath: string, content: string) => void
  mkdirSync?: (dir: string) => void
}

export interface McpStore {
  listMcpServers(workspaceRoot: string | null): McpServerInfo[]

  setMcpEnabled(name: string, enabled: boolean): boolean

  deniedMcpServers(): { serverName: string }[] | null
}

function readJson(
  filePath: string,
  readFileFn: (p: string) => string
): Record<string, unknown> | null {
  try {
    const raw = readFileFn(filePath)
    const j: unknown = JSON.parse(raw)
    if (!j || typeof j !== 'object' || Array.isArray(j)) return null
    return j as Record<string, unknown>
  } catch {
    return null
  }
}

function describe(
  config: unknown
): { transport: McpServerInfo['transport']; detail: string } {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { transport: 'unknown', detail: '' }
  }

  const c = config as Record<string, unknown>

  if (typeof c.command === 'string') {
    const cmd = c.command
    const base = cmd.replace(/\\/g, '/').split('/').pop() ?? cmd
    return { transport: 'stdio', detail: base || cmd }
  }

  if (typeof c.url === 'string') {
    const transport: McpServerInfo['transport'] =
      c.type === 'sse' ? 'sse' : 'http'
    try {
      const parsed = new URL(c.url)
      const detail = parsed.host
      return { transport, detail }
    } catch {
      return { transport, detail: '' }
    }
  }

  return { transport: 'unknown', detail: '' }
}

function collect(
  servers: unknown,
  origin: McpServerInfo['origin'],
  disabled: Set<string>,
  out: McpServerInfo[]
): void {
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return

  for (const [name, cfg] of Object.entries(servers as Record<string, unknown>)) {
    const { transport, detail } = describe(cfg)
    out.push({
      name,
      scope: origin === 'user' ? 'global' : 'local',
      origin,
      transport,
      detail,
      enabled: !disabled.has(name),
    })
  }
}

export function createMcpStore(deps?: McpDeps): McpStore {

  const homedirFn: () => string = deps?.homedir ?? (() => nodeHomedir())

  const getUserDataFn: () => string =
    deps?.getUserData ?? (() => getUserDataDir())

  const readFileFn =
    deps?.readFile ?? ((filePath: string) => nodeReadFileSync(filePath, 'utf8'))

  const writeFileFn =
    deps?.writeFile ??
    ((filePath: string, content: string) => nodeWriteFileSync(filePath, content, 'utf8'))

  const mkdirSyncFn =
    deps?.mkdirSync ?? ((dir: string) => nodeMkdirSync(dir, { recursive: true }))

  function getClaudeJsonPath(): string {
    return join(homedirFn(), '.claude.json')
  }

  const overlay = createDisabledOverlay('mcp-disabled.json', {
    getUserData: getUserDataFn,
    readFile: readFileFn,
    writeFile: writeFileFn,
    mkdirSync: mkdirSyncFn,
  })

  function listMcpServers(workspaceRoot: string | null): McpServerInfo[] {
    const disabled = overlay.readDisabled()
    const out: McpServerInfo[] = []

    const claudeJson = readJson(getClaudeJsonPath(), readFileFn)
    if (claudeJson) {
      collect(claudeJson.mcpServers, 'user', disabled, out)

      if (workspaceRoot && workspaceRoot.trim()) {
        const projects = claudeJson.projects
        if (projects && typeof projects === 'object' && !Array.isArray(projects)) {
          const projectsMap = projects as Record<string, unknown>
          const entry = findProjectEntry(projectsMap, workspaceRoot)
          if (entry) {
            collect(entry.mcpServers, 'local', disabled, out)
          }
        }
      }
    }

    if (workspaceRoot && workspaceRoot.trim()) {
      const mcpJsonPath = join(workspaceRoot, '.mcp.json')
      const mcpJson = readJson(mcpJsonPath, readFileFn)
      if (mcpJson) {
        const servers = mcpJson.mcpServers ?? mcpJson
        collect(servers, 'project', disabled, out)
      }
    }

    return out.sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        ORIGIN_RANK[a.origin] - ORIGIN_RANK[b.origin]
    )
  }

  function setMcpEnabled(name: string, enabled: boolean): boolean {
    return overlay.setEnabled(name, enabled)
  }

  function deniedMcpServers(): { serverName: string }[] | null {
    const set = overlay.readDisabled()

    if (set.size === 0) return null

    return [...set].map(serverName => ({ serverName }))
  }

  return { listMcpServers, setMcpEnabled, deniedMcpServers }
}

function findProjectEntry(
  projects: Record<string, unknown>,
  workspaceRoot: string
): { mcpServers?: unknown } | null {
  if (!workspaceRoot) return null

  const norm = (s: string): string =>
    s.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase()

  const targetNorm = norm(workspaceRoot)

  for (const [key, val] of Object.entries(projects)) {
    if (norm(key) === targetNorm) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return val as { mcpServers?: unknown }
      }
    }
  }

  return null
}
