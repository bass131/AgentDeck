import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import type { ChildProcess } from 'node:child_process'
import { StdioRpc } from './jsonrpc'
import { resolveSafe } from '../02_fs/workspace'
import type { RootRegistry } from '../02_fs/roots'
import type {
  LspStatus,
  LspHoverResult,
  LspLocation,
  LspSemanticTokens,
  LspDocReq,
  LspPosReq
} from '../../shared/ipcContract'

interface SpawnPlan {
  cmd: string
  args: string[]
  env?: Record<string, string>
}

interface ServerDef {
  id: string
  exts: Record<string, string>
  command(appPath: string): SpawnPlan | null
}

const SERVER_DEFS: ServerDef[] = [
  {
    id: 'ts',
    exts: {
      ts: 'typescript',
      tsx: 'typescriptreact',
      js: 'javascript',
      jsx: 'javascriptreact',
      mjs: 'javascript',
      cjs: 'javascript'
    },
    command(appPath) {
      const script = shippedModule(appPath, 'typescript-language-server', 'lib', 'cli.mjs')
      return nodeServer(script, '--stdio')
    }
  },
  {
    id: 'py',
    exts: { py: 'python', pyw: 'python', pyi: 'python' },
    command(appPath) {
      const script = shippedModule(appPath, 'pyright', 'langserver.index.js')
      return nodeServer(script, '--stdio')
    }
  }
]

function shippedModule(appPath: string, ...rel: string[]): string | null {
  const bases = [appPath.replace(/app\.asar$/, 'app.asar.unpacked'), appPath]
  for (const base of bases) {
    const p = path.join(base, 'node_modules', ...rel)
    return p
  }
  return null
}

function nodeServer(script: string | null, ...args: string[]): SpawnPlan | null {
  if (!script) return null
  return {
    cmd: process.execPath,
    args: [script, ...args],
    env: { ELECTRON_RUN_AS_NODE: '1' }
  }
}

function serverDefFor(ext: string): ServerDef | null {
  return SERVER_DEFS.find(def => ext in def.exts) ?? null
}

function killTree(child: ChildProcess, spawnFn: SpawnFn): void {
  try {
    if (process.platform === 'win32' && child.pid) {
      const safeEnv: Record<string, string> = {}
      for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined) safeEnv[k] = v
      }
      spawnFn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        env: safeEnv
      })
    } else {
      child.kill()
    }
  } catch {
  }
}

function hoverMarkdown(contents: unknown): string {
  const one = (c: unknown): string => {
    if (typeof c === 'string') return c
    if (c && typeof c === 'object') {
      const o = c as { language?: string; value?: string; kind?: string }
      if (typeof o.value !== 'string') return ''
      if (o.language) return '```' + o.language + '\n' + o.value + '\n```'
      return o.value
    }
    return ''
  }
  const parts = Array.isArray(contents) ? contents.map(one) : [one(contents)]
  return parts.filter(Boolean).join('\n\n').trim()
}

interface RawRange {
  start?: { line?: number; character?: number }
}
interface RawLocation {
  uri?: string
  targetUri?: string
  range?: RawRange
  targetSelectionRange?: RawRange
  targetRange?: RawRange
}

interface ServerHandle {
  rpc: StdioRpc
  child: ChildProcess
  status: 'starting' | 'ready' | 'error'
  ready: Promise<void>
  openedUris: Set<string>
  semLegend: { types: string[]; mods: string[] } | null
  diedAt: number
}

const RESPAWN_COOLDOWN = 30_000

export type SpawnFn = (
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string>; stdio: 'pipe' | 'ignore'; windowsHide?: boolean }
) => ChildProcess

export interface LspManagerDeps {
  roots: RootRegistry
  appPath: string
  spawn: SpawnFn
  readFile: (absPath: string) => Promise<string>
}

interface TokenCacheEntry {
  tokens: LspSemanticTokens
  content: string
}

export interface LspManager {
  status(req: LspDocReq): LspStatus

  hover(req: LspPosReq): Promise<LspHoverResult | null>

  definition(req: LspPosReq): Promise<LspLocation[]>

  semanticTokens(req: LspDocReq): Promise<LspSemanticTokens | null>

  cachedTokens(req: LspDocReq): Promise<LspSemanticTokens | null>

  disposeAll(): void
}

export function createLspManager(deps: LspManagerDeps): LspManager {
  const { roots, appPath, readFile } = deps
  const spawnFn = deps.spawn as unknown as SpawnFn

  const servers = new Map<string, ServerHandle>()

  const tokenCache = new Map<string, TokenCacheEntry>()

  function gateReq(req: LspDocReq): { rootPath: string; absPath: string; ext: string } | null {
    const rootEntry = roots.get(req.rootId)
    if (!rootEntry) return null

    const absPath = resolveSafe(rootEntry.path, req.relPath)
    if (!absPath) return null

    const ext = path.extname(absPath).slice(1).toLowerCase()
    return { rootPath: rootEntry.path, absPath, ext }
  }

  function serverKey(rootId: string, serverId: string): string {
    return `${serverId}|${rootId}`
  }

  function ensureServer(rootId: string, rootPath: string, def: ServerDef): ServerHandle | null {
    const key = serverKey(rootId, def.id)
    const existing = servers.get(key)
    if (existing) {
      if (existing.status !== 'error') return existing
      if (Date.now() - existing.diedAt < RESPAWN_COOLDOWN) return existing
      servers.delete(key)
    }

    const plan = def.command(appPath)
    if (!plan) return null

    let child: ChildProcess
    try {
      const baseEnv: Record<string, string> = {}
      for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined) baseEnv[k] = v
      }
      child = spawnFn(plan.cmd, plan.args, {
        cwd: rootPath,
        env: { ...baseEnv, ...(plan.env ?? {}) },
        stdio: 'pipe',
        windowsHide: true
      }) as unknown as ChildProcess
    } catch {
      return null
    }

    if (!child || (!child.pid && !child.stdout)) {
      return null
    }

    const rpc = new StdioRpc(child)
    rpc.onRequest = (method, params) => {
      if (method === 'workspace/configuration') {
        const items = (params as { items?: unknown[] } | undefined)?.items
        return Array.isArray(items) ? items.map(() => null) : []
      }
      if (method === 'workspace/applyEdit') return { applied: false }
      return null
    }

    const handle: ServerHandle = {
      rpc,
      child,
      status: 'starting',
      ready: Promise.resolve(),
      openedUris: new Set(),
      semLegend: null,
      diedAt: 0
    }

    const rootUri = pathToFileURL(rootPath).href

    handle.ready = rpc
      .request<{
        capabilities?: {
          semanticTokensProvider?: {
            legend?: { tokenTypes?: string[]; tokenModifiers?: string[] }
          }
        }
      }>(
        'initialize',
        {
          processId: process.pid,
          rootUri,
          workspaceFolders: [{ uri: rootUri, name: path.basename(rootPath) }],
          capabilities: {
            textDocument: {
              hover: { contentFormat: ['markdown', 'plaintext'] },
              definition: {},
              synchronization: { dynamicRegistration: false },
              semanticTokens: {
                requests: { full: true },
                tokenTypes: [
                  'namespace', 'type', 'class', 'enum', 'interface', 'struct',
                  'typeParameter', 'parameter', 'variable', 'property', 'enumMember',
                  'event', 'function', 'method', 'macro', 'keyword', 'modifier',
                  'comment', 'string', 'number', 'regexp', 'operator', 'decorator'
                ],
                tokenModifiers: [
                  'declaration', 'definition', 'readonly', 'static', 'deprecated',
                  'abstract', 'async', 'modification', 'documentation', 'defaultLibrary'
                ],
                formats: ['relative']
              }
            },
            workspace: { workspaceFolders: true }
          }
        },
        15000
      )
      .then((res) => {
        const legend = res?.capabilities?.semanticTokensProvider?.legend
        const types = legend?.tokenTypes
        handle.semLegend =
          Array.isArray(types) && types.length
            ? { types, mods: Array.isArray(legend?.tokenModifiers) ? legend.tokenModifiers : [] }
            : null
        rpc.notify('initialized', {})
        handle.status = 'ready'
      })

    handle.ready.catch(() => {
      handle.status = 'error'
      handle.diedAt = Date.now()
      killTree(child, spawnFn as unknown as SpawnFn)
      rpc.dispose('초기화 실패')
    })

    child.on('error', () => {
      handle.status = 'error'
      handle.diedAt = Date.now()
      rpc.dispose('LSP 서버 실행 오류')
    })

    child.on('exit', () => {
      handle.status = 'error'
      handle.diedAt = Date.now()
      handle.openedUris.clear()
      rpc.dispose('LSP 서버가 종료됨')
    })

    servers.set(key, handle)
    return handle
  }

  async function prep(
    req: LspDocReq
  ): Promise<{ rpc: StdioRpc; uri: string; semLegend: { types: string[]; mods: string[] } | null } | null> {
    const gated = gateReq(req)
    if (!gated) return null

    const { rootPath, absPath, ext } = gated
    const def = serverDefFor(ext)
    if (!def) return null

    const handle = ensureServer(req.rootId, rootPath, def)
    if (!handle) return null

    try {
      await handle.ready
    } catch {
      return null
    }

    const uri = pathToFileURL(absPath).href
    if (!handle.openedUris.has(uri)) {
      try {
        const text = await readFile(absPath)
        const langId = def.exts[ext] ?? Object.values(def.exts)[0]
        handle.rpc.notify('textDocument/didOpen', {
          textDocument: { uri, languageId: langId, version: 1, text }
        })
        handle.openedUris.add(uri)
      } catch {
      }
    }

    return { rpc: handle.rpc, uri, semLegend: handle.semLegend }
  }

  function toRelPath(rootPath: string, absTarget: string): string | null {
    const safe = resolveSafe(rootPath, path.relative(rootPath, absTarget))
    if (!safe) return null
    return path.relative(rootPath, absTarget).replace(/\\/g, '/')
  }

  return {
    status(req: LspDocReq): LspStatus {
      const gated = gateReq(req)
      if (!gated) return 'unsupported'

      const { rootPath, absPath, ext } = gated
      const def = serverDefFor(ext)
      if (!def) return 'unsupported'

      const handle = ensureServer(req.rootId, rootPath, def)
      if (!handle) return 'error'

      void handle.ready.then(() => {
        const uri = pathToFileURL(absPath).href
        if (!handle.openedUris.has(uri)) {
          readFile(absPath)
            .then(text => {
              const langId = def.exts[ext] ?? Object.values(def.exts)[0]
              handle.rpc.notify('textDocument/didOpen', {
                textDocument: { uri, languageId: langId, version: 1, text }
              })
              handle.openedUris.add(uri)
            })
            .catch(() => { })
        }
      }).catch(() => { })

      return handle.status
    },

    async hover(req: LspPosReq): Promise<LspHoverResult | null> {
      const ctx = await prep(req)
      if (!ctx) return null

      try {
        const r = await ctx.rpc.request<{ contents?: unknown } | null>(
          'textDocument/hover',
          {
            textDocument: { uri: ctx.uri },
            position: req.pos
          }
        )
        const contents = hoverMarkdown(r?.contents)
        return contents ? { contents } : null
      } catch {
        return null
      }
    },

    async definition(req: LspPosReq): Promise<LspLocation[]> {
      const gated = gateReq(req)
      if (!gated) return []

      const ctx = await prep(req)
      if (!ctx) return []

      try {
        const r = await ctx.rpc.request<RawLocation | RawLocation[] | null>(
          'textDocument/definition',
          {
            textDocument: { uri: ctx.uri },
            position: req.pos
          }
        )
        const list = Array.isArray(r) ? r : r ? [r] : []
        const out: LspLocation[] = []

        for (const loc of list) {
          const uri = loc.uri ?? loc.targetUri
          const range = loc.range ?? loc.targetSelectionRange ?? loc.targetRange
          const start = range?.start
          if (!uri || !uri.startsWith('file:') || typeof start?.line !== 'number') continue

          let absTarget: string
          try {
            absTarget = fileURLToPath(uri)
          } catch {
            continue
          }

          const relPath = toRelPath(gated.rootPath, absTarget)
          if (!relPath) continue

          out.push({
            relPath,
            line: start.line,
            character: start.character ?? 0
          })
        }

        return out
      } catch {
        return []
      }
    },

    async semanticTokens(req: LspDocReq): Promise<LspSemanticTokens | null> {
      const gated = gateReq(req)
      if (!gated) return null

      const ctx = await prep(req)
      if (!ctx || !ctx.semLegend) return null

      try {
        const r = await ctx.rpc.request<{ data?: number[] } | null>(
          'textDocument/semanticTokens/full',
          { textDocument: { uri: ctx.uri } },
          30000
        )

        const raw = r?.data
        if (!Array.isArray(raw)) return null

        const data: number[] = []
        let line = 0
        let char = 0
        for (let i = 0; i + 4 < raw.length; i += 5) {
          const dLine = raw[i]
          line += dLine
          char = dLine === 0 ? char + raw[i + 1] : raw[i + 1]
          data.push(line, char, raw[i + 2], raw[i + 3], raw[i + 4])
        }

        const result: LspSemanticTokens = {
          data,
          types: ctx.semLegend.types,
          mods: ctx.semLegend.mods
        }

        const cacheKey = `${req.rootId}::${req.relPath}`
        try {
          const content = await readFile(gated.absPath)
          tokenCache.set(cacheKey, { tokens: result, content })
        } catch {
        }

        return result
      } catch {
        return null
      }
    },

    async cachedTokens(req: LspDocReq): Promise<LspSemanticTokens | null> {
      const gated = gateReq(req)
      if (!gated) return null

      const cacheKey = `${req.rootId}::${req.relPath}`
      const entry = tokenCache.get(cacheKey)
      if (!entry) return null

      try {
        const currentContent = await readFile(gated.absPath)
        if (currentContent !== entry.content) {
          tokenCache.delete(cacheKey)
          return null
        }
      } catch {
        return null
      }

      return entry.tokens
    },

    disposeAll(): void {
      for (const handle of servers.values()) {
        handle.rpc.dispose('앱 종료')
        killTree(handle.child, spawnFn as unknown as SpawnFn)
      }
      servers.clear()
      tokenCache.clear()
    }
  }
}

let _instance: LspManager | null = null

export function initLspManager(deps: LspManagerDeps): void {
  _instance = createLspManager(deps)
}

export function getLspManager(): LspManager {
  if (!_instance) {
    throw new Error('LspManager 미초기화 — initLspManager(deps)를 먼저 호출하세요')
  }
  return _instance
}
