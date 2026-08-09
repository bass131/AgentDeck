import {
  readFileSync as nodeReadFileSync,
  writeFileSync as nodeWriteFileSync,
  mkdirSync as nodeMkdirSync,
} from 'node:fs'
import { join } from 'node:path'
import { homedir as nodeHomedir } from 'node:os'
import { app } from 'electron'
import type { McpServerInfo } from '../../shared/ipcContract'

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

function readDisabled(
  overlayPath: string,
  readFileFn: (p: string) => string
): Set<string> {
  try {
    const raw = readFileFn(overlayPath)
    const j: unknown = JSON.parse(raw)
    const list = (j as Record<string, unknown>)?.disabled
    if (!Array.isArray(list)) return new Set()
    return new Set(list.filter((s): s is string => typeof s === 'string'))
  } catch {
    return new Set()
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
    deps?.getUserData ?? (() => app.getPath('userData'))

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

  function getOverlayPath(): string {
    return join(getUserDataFn(), 'mcp-disabled.json')
  }

  function listMcpServers(workspaceRoot: string | null): McpServerInfo[] {
    const overlayPath = getOverlayPath()
    const disabled = readDisabled(overlayPath, readFileFn)
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
    if (typeof name !== 'string' || name.trim().length === 0) {
      return false
    }

    const overlayPath = getOverlayPath()
    const set = readDisabled(overlayPath, readFileFn)

    if (enabled) {
      set.delete(name)
    } else {
      set.add(name)
    }

    try {
      const userDataDir = getUserDataFn()
      mkdirSyncFn(userDataDir)
      writeFileFn(overlayPath, JSON.stringify({ disabled: [...set].sort() }, null, 2))
      return true
    } catch {
      return false
    }
  }

  function deniedMcpServers(): { serverName: string }[] | null {
    const overlayPath = getOverlayPath()
    const set = readDisabled(overlayPath, readFileFn)

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
