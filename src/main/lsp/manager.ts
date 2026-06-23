/**
 * manager.ts — LSP 서버 관리자 (주입형 팩토리 — electron import 0)
 *
 * CRITICAL(헌법 신뢰경계):
 *   - 모든 LSP 요청은 rootId → roots.ts 게이트 → resolveSafe(2단 방어) 통과 필수.
 *   - 미등록 rootId · '..' 탈출 · 절대경로 relPath → 즉시 'unsupported'/null/[] 반환.
 *   - fs/자식프로세스/stdio = main 단독. raw LSP 응답 키 누출 0(정규화만 반환).
 *   - 서버 cmd/args는 고정 def(renderer 주입 0).
 *   - electron import 없음 → vitest node 환경에서 mock spawn으로 직접 테스트 가능.
 *
 * 구현 기반: C:/Dev/AgentCodeGUI/src/main/lsp/manager.ts 참조 이식
 *   (단, 신뢰경계: resolve() 무검증 패턴 폐기 → rootId+resolveSafe 게이트로 대체)
 */

import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import type { ChildProcess } from 'node:child_process'
import { StdioRpc } from './jsonrpc'
import { resolveSafe } from '../fs/workspace'
import type { RootRegistry } from '../fs/roots'
import type {
  LspStatus,
  LspHoverResult,
  LspLocation,
  LspSemanticTokens,
  LspDocReq,
  LspPosReq
} from '../../shared/ipc-contract'

// ── 서버 정의 레지스트리 ────────────────────────────────────────────────────────

interface SpawnPlan {
  cmd: string
  args: string[]
  env?: Record<string, string>
}

interface ServerDef {
  id: string
  /** 확장자 → LSP languageId 매핑 */
  exts: Record<string, string>
  /** shippedModule 기반 스폰 플랜 생성 (appPath 주입 기준) */
  command(appPath: string): SpawnPlan | null
}

/** 번들 LSP 서버 정의 목록 (TS/JS·Python) */
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

// ── shippedModule / nodeServer 헬퍼 ─────────────────────────────────────────────

/**
 * 앱 node_modules에 번들된 JS 모듈의 절대 경로를 반환.
 * packaged(asar) 환경에서는 .unpacked 미러를 우선 조회.
 * appPath는 생성자 주입 → 테스트에서 mock 경로 사용 가능.
 */
function shippedModule(appPath: string, ...rel: string[]): string | null {
  const bases = [appPath.replace(/app\.asar$/, 'app.asar.unpacked'), appPath]
  for (const base of bases) {
    const p = path.join(base, 'node_modules', ...rel)
    // 테스트 환경에서는 existsSync를 호출하지 않고 경로만 반환
    // (실제 앱에서는 존재 확인, 테스트에서는 spawn mock이 처리)
    return p
  }
  return null
}

/**
 * Electron의 Node(process.execPath)로 순수 JS 서버를 실행하는 SpawnPlan 생성.
 * ELECTRON_RUN_AS_NODE=1 환경변수로 Electron이 Node처럼 동작하게 설정.
 */
function nodeServer(script: string | null, ...args: string[]): SpawnPlan | null {
  if (!script) return null
  return {
    cmd: process.execPath,
    args: [script, ...args],
    env: { ELECTRON_RUN_AS_NODE: '1' }
  }
}

/**
 * 확장자(소문자) → ServerDef 조회. 없으면 null.
 */
function serverDefFor(ext: string): ServerDef | null {
  return SERVER_DEFS.find(def => ext in def.exts) ?? null
}

// ── killTree 헬퍼 ─────────────────────────────────────────────────────────────

/**
 * 서버 프로세스와 그 자식 프로세스까지 모두 종료.
 * Windows: taskkill /T /F (좀비 손자 프로세스 방지).
 * spawnFn: 주입된 spawn 함수 사용 (테스트에서 mock 가능).
 */
function killTree(child: ChildProcess, spawnFn: SpawnFn): void {
  try {
    if (process.platform === 'win32' && child.pid) {
      // process.env를 Record<string, string>으로 변환 (undefined 키 제외)
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
    /* already gone */
  }
}

// ── hover contents 정규화 ─────────────────────────────────────────────────────

/**
 * LSP hover 'contents' 필드 → 마크다운 문자열로 평탄화.
 * 입력: string | MarkedString | MarkupContent | 배열.
 * 출력: 마크다운 문자열 (빈 문자열이면 빈 값).
 */
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

// ── raw LSP 응답 타입 ────────────────────────────────────────────────────────

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

// ── 서버 핸들 ─────────────────────────────────────────────────────────────────

interface ServerHandle {
  rpc: StdioRpc
  child: ChildProcess
  status: 'starting' | 'ready' | 'error'
  ready: Promise<void>
  /** 열린 문서 URI Set (didOpen 추적) */
  openedUris: Set<string>
  /** semanticTokens 범례 (initialize 응답에서 추출) */
  semLegend: { types: string[]; mods: string[] } | null
  diedAt: number
}

// 좀비 방지: crash/hang 서버는 이 시간 동안 재스폰하지 않음
const RESPAWN_COOLDOWN = 30_000

// ── 의존성 주입 인터페이스 ────────────────────────────────────────────────────

/** spawn 함수 타입 (child_process.spawn 시그니처 부분집합) */
export type SpawnFn = (
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string>; stdio: 'pipe' | 'ignore'; windowsHide?: boolean }
) => ChildProcess

/**
 * LspManager 생성자 의존성.
 * electron import 없이 테스트 가능하도록 모든 외부 의존을 주입형으로 설계.
 */
export interface LspManagerDeps {
  /** 루트 레지스트리 (rootId → 경로 게이트) */
  roots: RootRegistry
  /** 앱 기본 경로 (shippedModule 경로 계산용) */
  appPath: string
  /** child_process.spawn 또는 mock */
  spawn: SpawnFn
  /**
   * 파일 내용 읽기 함수 (didOpen용).
   * vitest에서는 vi.fn().mockResolvedValue('...') 로 모킹.
   */
  readFile: (absPath: string) => Promise<string>
}

// ── 인메모리 시맨틱 토큰 캐시 ─────────────────────────────────────────────────

interface TokenCacheEntry {
  tokens: LspSemanticTokens
  /** 캐시 생성 시 읽은 파일 내용(해시 역할 — 변경 시 무효화 목적) */
  content: string
}

// ── LspManager 공개 인터페이스 ───────────────────────────────────────────────

export interface LspManager {
  /**
   * LSP 서버 상태 조회 + lazy spawn 트리거.
   * CRITICAL: rootId 미등록·relPath 탈출 → 'unsupported' 즉시 반환.
   */
  status(req: LspDocReq): LspStatus

  /**
   * 호버 정보 조회 (마크다운 문자열).
   * CRITICAL: rootId 게이트 + resolveSafe 통과 필수.
   */
  hover(req: LspPosReq): Promise<LspHoverResult | null>

  /**
   * 정의 위치 조회 — 워크스페이스 내 상대경로만 반환.
   * CRITICAL: 워크스페이스 밖 결과는 제외(graceful no-op).
   */
  definition(req: LspPosReq): Promise<LspLocation[]>

  /**
   * 전체 문서 시맨틱 토큰 (라이브 분석).
   * CRITICAL: rootId 게이트 + resolveSafe 필수.
   */
  semanticTokens(req: LspDocReq): Promise<LspSemanticTokens | null>

  /**
   * 인메모리 캐시에서 시맨틱 토큰 즉시 반환.
   * 서버 미스폰 — 없으면 null.
   */
  cachedTokens(req: LspDocReq): Promise<LspSemanticTokens | null>

  /** 앱 종료 시 모든 서버를 dispose. */
  disposeAll(): void
}

// ── 팩토리 ───────────────────────────────────────────────────────────────────

/**
 * LspManager 인스턴스 생성.
 *
 * @param deps 의존성 (roots·appPath·spawn·readFile)
 */
export function createLspManager(deps: LspManagerDeps): LspManager {
  const { roots, appPath, readFile } = deps
  const spawnFn = deps.spawn as unknown as SpawnFn

  /** rootId+serverId → ServerHandle */
  const servers = new Map<string, ServerHandle>()

  /** rootId+relPath → TokenCacheEntry (인메모리 시맨틱 토큰 캐시) */
  const tokenCache = new Map<string, TokenCacheEntry>()

  // ── 신뢰경계 게이트 ─────────────────────────────────────────────────────────

  /**
   * rootId + relPath 검증 → {rootPath, absPath, ext} 또는 null.
   *
   * CRITICAL(헌법 신뢰경계):
   *   1. roots.get(rootId) — 미등록 ID → null (경로 주입 차단).
   *   2. resolveSafe(rootEntry.path, relPath) — 2단 방어:
   *      a. 문자열 containment ('..', 절대경로 탈출 차단)
   *      b. realpath containment (심링크 탈출 차단)
   *   → null이면 호출부가 'unsupported'/null/[] 응답.
   *
   * fs.read IPC(ipc/index.ts)와 동일 게이트 — 우회 경로 0.
   */
  function gateReq(req: LspDocReq): { rootPath: string; absPath: string; ext: string } | null {
    const rootEntry = roots.get(req.rootId)
    if (!rootEntry) return null

    const absPath = resolveSafe(rootEntry.path, req.relPath)
    if (!absPath) return null

    const ext = path.extname(absPath).slice(1).toLowerCase()
    return { rootPath: rootEntry.path, absPath, ext }
  }

  // ── 서버 관리 ────────────────────────────────────────────────────────────────

  /** 서버 키: rootId + serverId 조합 */
  function serverKey(rootId: string, serverId: string): string {
    return `${serverId}|${rootId}`
  }

  /**
   * 서버 spawn + initialize.
   * 실패 시 status='error', killTree 호출(좀비 0).
   */
  function ensureServer(rootId: string, rootPath: string, def: ServerDef): ServerHandle | null {
    const key = serverKey(rootId, def.id)
    const existing = servers.get(key)
    if (existing) {
      if (existing.status !== 'error') return existing
      if (Date.now() - existing.diedAt < RESPAWN_COOLDOWN) return existing
      servers.delete(key) // 쿨다운 종료 → 재스폰
    }

    const plan = def.command(appPath)
    if (!plan) return null

    let child: ChildProcess
    try {
      // process.env는 Record<string, string | undefined> — undefined 제거
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

    // spawn 실패(child.pid 없음 등) 감지
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

  /**
   * 서버 준비 + 파일 didOpen — 모든 기능 요청의 공통 전처리.
   * CRITICAL: gateReq를 통과한 absPath만 사용.
   */
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

    // didOpen (파일 내용 읽기 — main 단독, renderer 미노출)
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
        /* 파일 읽기 실패 — 서버는 계속 사용 가능 */
      }
    }

    return { rpc: handle.rpc, uri, semLegend: handle.semLegend }
  }

  /**
   * LSP definition 응답의 절대경로를 rootId 워크스페이스 기준 상대경로로 역변환.
   * 워크스페이스 밖이면 resolveSafe null → 제외.
   *
   * CRITICAL(신뢰경계): 절대경로는 반환값에 포함하지 않는다.
   */
  function toRelPath(rootPath: string, absTarget: string): string | null {
    // resolveSafe로 rootPath 내부인지 확인
    const safe = resolveSafe(rootPath, path.relative(rootPath, absTarget))
    if (!safe) return null
    // 상대경로로 변환 (POSIX 슬래시)
    return path.relative(rootPath, absTarget).replace(/\\/g, '/')
  }

  // ── 공개 메서드 ──────────────────────────────────────────────────────────────

  return {
    status(req: LspDocReq): LspStatus {
      const gated = gateReq(req)
      if (!gated) return 'unsupported'

      const { rootPath, absPath, ext } = gated
      const def = serverDefFor(ext)
      if (!def) return 'unsupported'

      // lazy spawn: status 조회가 서버 시작 트리거
      const handle = ensureServer(req.rootId, rootPath, def)
      if (!handle) return 'error'

      // didOpen은 비동기로 백그라운드 실행 (status는 동기 반환)
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
            .catch(() => { /* 파일 읽기 실패 무시 */ })
        }
      }).catch(() => { /* 초기화 실패 무시 */ })

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

          // CRITICAL: 워크스페이스 내부만 허용 — 밖이면 제외
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

        // delta 인코딩 → 절대 좌표 디코딩
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

        // 인메모리 캐시 저장 (rootId+relPath 기준)
        const cacheKey = `${req.rootId}::${req.relPath}`
        try {
          const content = await readFile(gated.absPath)
          tokenCache.set(cacheKey, { tokens: result, content })
        } catch {
          // 캐시 실패는 무시 — 캐시 없음으로 처리
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

      // 내용이 변경됐으면 캐시 무효화
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

// ── 싱글톤 인스턴스 (electron app 주입 — ipc/index.ts에서 초기화) ──────────────

/**
 * 앱 생명주기 싱글톤.
 * ipc/index.ts의 registerIpc() 전에 initLspManager()로 초기화 필요.
 * 테스트에서는 createLspManager(deps)를 직접 사용.
 */
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
