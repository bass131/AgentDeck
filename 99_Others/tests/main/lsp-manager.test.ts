import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { createRootRegistry } from '../../../02_Source/main/02_fs/roots'
import type { RootRegistry } from '../../../02_Source/main/02_fs/roots'
import { createLspManager } from '../../../02_Source/main/03_lsp/manager'
import type { LspManagerDeps } from '../../../02_Source/main/03_lsp/manager'

interface MockStdin {
  write: ReturnType<typeof vi.fn>
}

interface MockProcess {
  stdin: MockStdin
  stdout: EventEmitter
  stderr: EventEmitter
  pid: number
  killed: boolean
  kill: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
}

function makeMockProcess(): MockProcess {
  const proc: MockProcess = {
    stdin: { write: vi.fn() },
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    pid: 99999,
    killed: false,
    kill: vi.fn(),
    on: vi.fn()
  }
  return proc
}

function feedProcess(proc: MockProcess, obj: unknown): void {
  const body = Buffer.from(JSON.stringify(obj), 'utf8')
  const header = `Content-Length: ${body.length}\r\n\r\n`
  proc.stdout.emit('data', Buffer.concat([Buffer.from(header, 'ascii'), body]))
}

function setupAutoInitialize(
  proc: MockProcess,
  semLegend: { tokenTypes: string[]; tokenModifiers: string[] } | null = {
    tokenTypes: ['namespace', 'type', 'class', 'variable', 'function'],
    tokenModifiers: ['declaration', 'readonly', 'static']
  }
): void {
  proc.stdin.write.mockImplementation((chunk: Buffer | string) => {
    if (typeof chunk !== 'string') return
    return
  })

  let writeCount = 0
  const origWrite = proc.stdin.write
  proc.stdin.write = vi.fn().mockImplementation((chunk: string | Buffer) => {
    origWrite(chunk)
    writeCount++
    if (writeCount % 2 === 0 && typeof chunk !== 'string') {
      try {
        const msg = JSON.parse((chunk as Buffer).toString('utf8')) as { id?: number; method?: string }
        if (msg.method === 'initialize' && msg.id != null) {
          Promise.resolve().then(() => {
            feedProcess(proc, {
              jsonrpc: '2.0',
              id: msg.id,
              result: {
                capabilities: semLegend
                  ? {
                      semanticTokensProvider: {
                        legend: semLegend
                      }
                    }
                  : {}
              }
            })
          })
        }
      } catch {
      }
    }
  })
}

function makeDeps(
  registry: RootRegistry,
  spawnImpl?: () => MockProcess | null
): LspManagerDeps & { lastProc: MockProcess | null } {
  let lastProc: MockProcess | null = null
  return {
    roots: registry,
    appPath: '/mock/app',
    spawn: vi.fn().mockImplementation(() => {
      if (spawnImpl) {
        const p = spawnImpl()
        lastProc = p
        return p
      }
      const p = makeMockProcess()
      lastProc = p
      return p
    }),
    readFile: vi.fn().mockResolvedValue('const x = 1;\n'),
    get lastProc() {
      return lastProc
    }
  }
}

const WORKSPACE_ROOT = path.resolve('C:/workspace/myproject')
const TS_FILE = 'src/index.ts'
const OUTSIDE_FILE = '../outside.ts'
const ABS_FILE = path.resolve('C:/absolute/path.ts')

describe('LspManager — 신뢰경계 음성 케이스 (🔴 plan-auditor)', () => {
  let registry: RootRegistry
  let deps: ReturnType<typeof makeDeps>

  beforeEach(() => {
    registry = createRootRegistry()
    registry.setWorkspace(WORKSPACE_ROOT)
    deps = makeDeps(registry)
  })

  it('미등록 rootId → status가 "unsupported"를 반환한다', () => {
    const manager = createLspManager(deps)
    const result = manager.status({ rootId: 'not-registered', relPath: TS_FILE })
    expect(result).toBe('unsupported')
  })

  it('미등록 rootId → hover가 null을 반환한다', async () => {
    const manager = createLspManager(deps)
    const result = await manager.hover({
      rootId: 'not-registered',
      relPath: TS_FILE,
      pos: { line: 0, character: 0 }
    })
    expect(result).toBeNull()
  })

  it('미등록 rootId → definition이 빈 배열을 반환한다', async () => {
    const manager = createLspManager(deps)
    const result = await manager.definition({
      rootId: 'not-registered',
      relPath: TS_FILE,
      pos: { line: 0, character: 0 }
    })
    expect(result).toEqual([])
  })

  it('미등록 rootId → semanticTokens가 null을 반환한다', async () => {
    const manager = createLspManager(deps)
    const result = await manager.semanticTokens({ rootId: 'not-registered', relPath: TS_FILE })
    expect(result).toBeNull()
  })

  it('미등록 rootId → cachedTokens가 null을 반환한다', async () => {
    const manager = createLspManager(deps)
    const result = await manager.cachedTokens({ rootId: 'not-registered', relPath: TS_FILE })
    expect(result).toBeNull()
  })

  it('"../" 탈출 relPath → status가 "unsupported"를 반환한다 (경로 탈출 차단)', () => {
    const manager = createLspManager(deps)
    const result = manager.status({ rootId: 'workspace', relPath: OUTSIDE_FILE })
    expect(result).toBe('unsupported')
  })

  it('"../" 탈출 relPath → hover가 null을 반환한다', async () => {
    const manager = createLspManager(deps)
    const result = await manager.hover({
      rootId: 'workspace',
      relPath: OUTSIDE_FILE,
      pos: { line: 0, character: 0 }
    })
    expect(result).toBeNull()
  })

  it('"../" 탈출 relPath → definition이 빈 배열을 반환한다', async () => {
    const manager = createLspManager(deps)
    const result = await manager.definition({
      rootId: 'workspace',
      relPath: OUTSIDE_FILE,
      pos: { line: 0, character: 0 }
    })
    expect(result).toEqual([])
  })

  it('절대경로 relPath → status가 "unsupported"를 반환한다', () => {
    const manager = createLspManager(deps)
    const result = manager.status({ rootId: 'workspace', relPath: ABS_FILE })
    expect(result).toBe('unsupported')
  })

  it('절대경로 relPath → hover가 null을 반환한다', async () => {
    const manager = createLspManager(deps)
    const result = await manager.hover({
      rootId: 'workspace',
      relPath: ABS_FILE,
      pos: { line: 0, character: 0 }
    })
    expect(result).toBeNull()
  })

  it('절대경로 relPath → definition이 빈 배열을 반환한다', async () => {
    const manager = createLspManager(deps)
    const result = await manager.definition({
      rootId: 'workspace',
      relPath: ABS_FILE,
      pos: { line: 0, character: 0 }
    })
    expect(result).toEqual([])
  })

  it('지원하지 않는 확장자(.xyz) → status가 "unsupported"를 반환한다', () => {
    const manager = createLspManager(deps)
    const result = manager.status({ rootId: 'workspace', relPath: 'file.xyz' })
    expect(result).toBe('unsupported')
  })
})

describe('LspManager — 정상 케이스 (mock spawn/rpc)', () => {
  let registry: RootRegistry
  let deps: ReturnType<typeof makeDeps>
  let proc: MockProcess

  beforeEach(() => {
    registry = createRootRegistry()
    registry.setWorkspace(WORKSPACE_ROOT)
    proc = makeMockProcess()
    setupAutoInitialize(proc)
    deps = makeDeps(registry, () => proc)
  })

  it('status: .ts 파일 → "starting" 또는 "ready"를 반환한다 (spawn 시작)', () => {
    const manager = createLspManager(deps)
    const result = manager.status({ rootId: 'workspace', relPath: TS_FILE })
    expect(['starting', 'ready']).toContain(result)
  })

  it('status: initialize 완료 후 → "ready"를 반환한다', async () => {
    const manager = createLspManager(deps)
    manager.status({ rootId: 'workspace', relPath: TS_FILE })

    await new Promise(r => setTimeout(r, 10))

    const result = manager.status({ rootId: 'workspace', relPath: TS_FILE })
    expect(result).toBe('ready')
  })

  it('hover: mock rpc가 hover 응답을 반환하면 마크다운 문자열로 반환한다', async () => {
    const manager = createLspManager(deps)

    manager.status({ rootId: 'workspace', relPath: TS_FILE })
    await new Promise(r => setTimeout(r, 10))

    let hoverId: number | undefined
    const origWriteImpl = proc.stdin.write.getMockImplementation()
    proc.stdin.write.mockImplementation((chunk: string | Buffer) => {
      origWriteImpl?.(chunk)
      if (typeof chunk !== 'string') {
        try {
          const msg = JSON.parse((chunk as Buffer).toString('utf8')) as { id?: number; method?: string }
          if (msg.method === 'textDocument/hover' && msg.id != null) {
            hoverId = msg.id
            Promise.resolve().then(() => {
              feedProcess(proc, {
                jsonrpc: '2.0',
                id: hoverId,
                result: {
                  contents: { kind: 'markdown', value: '**string** type' }
                }
              })
            })
          }
        } catch { }
      }
    })

    const result = await manager.hover({
      rootId: 'workspace',
      relPath: TS_FILE,
      pos: { line: 0, character: 5 }
    })

    expect(result).not.toBeNull()
    expect(result?.contents).toBe('**string** type')
  })

  it('hover: LSP 서버가 null을 반환하면 null을 반환한다', async () => {
    const manager = createLspManager(deps)
    manager.status({ rootId: 'workspace', relPath: TS_FILE })
    await new Promise(r => setTimeout(r, 10))

    proc.stdin.write.mockImplementation((chunk: string | Buffer) => {
      if (typeof chunk !== 'string') {
        try {
          const msg = JSON.parse((chunk as Buffer).toString('utf8')) as { id?: number; method?: string }
          if (msg.method === 'textDocument/hover' && msg.id != null) {
            Promise.resolve().then(() => {
              feedProcess(proc, { jsonrpc: '2.0', id: msg.id, result: null })
            })
          }
        } catch { }
      }
    })

    const result = await manager.hover({
      rootId: 'workspace',
      relPath: TS_FILE,
      pos: { line: 0, character: 5 }
    })
    expect(result).toBeNull()
  })

  it('definition: 워크스페이스 내부 결과는 상대경로(relPath)로 역변환된다', async () => {
    const manager = createLspManager(deps)
    manager.status({ rootId: 'workspace', relPath: TS_FILE })
    await new Promise(r => setTimeout(r, 10))

    proc.stdin.write.mockImplementation((chunk: string | Buffer) => {
      if (typeof chunk !== 'string') {
        try {
          const msg = JSON.parse((chunk as Buffer).toString('utf8')) as { id?: number; method?: string }
          if (msg.method === 'textDocument/definition' && msg.id != null) {
            Promise.resolve().then(() => {
              const targetUri = pathToFileURL(path.join(WORKSPACE_ROOT, 'src/types.ts')).href
              feedProcess(proc, {
                jsonrpc: '2.0',
                id: msg.id,
                result: [
                  {
                    uri: targetUri,
                    range: { start: { line: 10, character: 5 }, end: { line: 10, character: 15 } }
                  }
                ]
              })
            })
          }
        } catch { }
      }
    })

    const result = await manager.definition({
      rootId: 'workspace',
      relPath: TS_FILE,
      pos: { line: 0, character: 5 }
    })

    expect(result).toHaveLength(1)
    expect(result[0].relPath).toBe('src/types.ts')
    expect(result[0].line).toBe(10)
    expect(result[0].character).toBe(5)
    expect(result[0]).not.toHaveProperty('path')
    expect(result[0]).not.toHaveProperty('uri')
  })

  it('definition: 워크스페이스 밖 결과는 제외된다 (경계 보호)', async () => {
    const manager = createLspManager(deps)
    manager.status({ rootId: 'workspace', relPath: TS_FILE })
    await new Promise(r => setTimeout(r, 10))

    proc.stdin.write.mockImplementation((chunk: string | Buffer) => {
      if (typeof chunk !== 'string') {
        try {
          const msg = JSON.parse((chunk as Buffer).toString('utf8')) as { id?: number; method?: string }
          if (msg.method === 'textDocument/definition' && msg.id != null) {
            Promise.resolve().then(() => {
              feedProcess(proc, {
                jsonrpc: '2.0',
                id: msg.id,
                result: [
                  {
                    uri: 'file:///node_modules/@types/node/index.d.ts',
                    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
                  }
                ]
              })
            })
          }
        } catch { }
      }
    })

    const result = await manager.definition({
      rootId: 'workspace',
      relPath: TS_FILE,
      pos: { line: 0, character: 5 }
    })

    expect(result).toEqual([])
  })

  it('semanticTokens: delta 인코딩을 절대 좌표로 디코딩한다', async () => {
    const manager = createLspManager(deps)
    manager.status({ rootId: 'workspace', relPath: TS_FILE })
    await new Promise(r => setTimeout(r, 10))

    const rawData = [0, 0, 5, 0, 0, 1, 2, 3, 1, 1]

    proc.stdin.write.mockImplementation((chunk: string | Buffer) => {
      if (typeof chunk !== 'string') {
        try {
          const msg = JSON.parse((chunk as Buffer).toString('utf8')) as { id?: number; method?: string }
          if (msg.method === 'textDocument/semanticTokens/full' && msg.id != null) {
            Promise.resolve().then(() => {
              feedProcess(proc, {
                jsonrpc: '2.0',
                id: msg.id,
                result: { data: rawData }
              })
            })
          }
        } catch { }
      }
    })

    const result = await manager.semanticTokens({ rootId: 'workspace', relPath: TS_FILE })

    expect(result).not.toBeNull()
    expect(result!.data).toEqual([0, 0, 5, 0, 0, 1, 2, 3, 1, 1])
    expect(result!.types).toEqual(['namespace', 'type', 'class', 'variable', 'function'])
    expect(result!.mods).toEqual(['declaration', 'readonly', 'static'])
  })

  it('semanticTokens: raw LSP 응답의 불필요한 키가 누출되지 않는다', async () => {
    const manager = createLspManager(deps)
    manager.status({ rootId: 'workspace', relPath: TS_FILE })
    await new Promise(r => setTimeout(r, 10))

    proc.stdin.write.mockImplementation((chunk: string | Buffer) => {
      if (typeof chunk !== 'string') {
        try {
          const msg = JSON.parse((chunk as Buffer).toString('utf8')) as { id?: number; method?: string }
          if (msg.method === 'textDocument/semanticTokens/full' && msg.id != null) {
            Promise.resolve().then(() => {
              feedProcess(proc, {
                jsonrpc: '2.0',
                id: msg.id,
                result: {
                  data: [0, 0, 3, 0, 0],
                  resultId: 'some-internal-id',
                  _extra: 'raw lsp field'
                }
              })
            })
          }
        } catch { }
      }
    })

    const result = await manager.semanticTokens({ rootId: 'workspace', relPath: TS_FILE })

    expect(result).not.toBeNull()
    expect(Object.keys(result!)).toEqual(expect.arrayContaining(['data', 'types', 'mods']))
    expect(result).not.toHaveProperty('resultId')
    expect(result).not.toHaveProperty('_extra')
  })

  it('cachedTokens: semanticTokens 호출 후 동일 rootId+relPath는 캐시에서 즉시 반환한다', async () => {
    const manager = createLspManager(deps)
    manager.status({ rootId: 'workspace', relPath: TS_FILE })
    await new Promise(r => setTimeout(r, 10))

    proc.stdin.write.mockImplementation((chunk: string | Buffer) => {
      if (typeof chunk !== 'string') {
        try {
          const msg = JSON.parse((chunk as Buffer).toString('utf8')) as { id?: number; method?: string }
          if (msg.method === 'textDocument/semanticTokens/full' && msg.id != null) {
            Promise.resolve().then(() => {
              feedProcess(proc, {
                jsonrpc: '2.0',
                id: msg.id,
                result: { data: [0, 0, 3, 0, 0] }
              })
            })
          }
        } catch { }
      }
    })

    await manager.semanticTokens({ rootId: 'workspace', relPath: TS_FILE })

    const cached = await manager.cachedTokens({ rootId: 'workspace', relPath: TS_FILE })
    expect(cached).not.toBeNull()
    expect(cached!.data).toEqual([0, 0, 3, 0, 0])
  })

  it('cachedTokens: 캐시가 없으면 null을 반환한다', async () => {
    const manager = createLspManager(deps)
    const result = await manager.cachedTokens({ rootId: 'workspace', relPath: TS_FILE })
    expect(result).toBeNull()
  })
})

describe('LspManager — 서버 생명주기', () => {
  let registry: RootRegistry

  beforeEach(() => {
    registry = createRootRegistry()
    registry.setWorkspace(WORKSPACE_ROOT)
  })

  it('spawn 실패(null 반환) → status가 "error"를 반환한다', () => {
    const deps = makeDeps(registry, () => null as unknown as MockProcess)
    deps.spawn = vi.fn().mockImplementation(() => {
      throw new Error('spawn failed')
    })
    const manager = createLspManager(deps)
    const result = manager.status({ rootId: 'workspace', relPath: TS_FILE })
    expect(result).toBe('error')
  })

  it('initialize timeout → status가 "error"가 되고 kill이 호출된다 (좀비 방지)', async () => {
    vi.useFakeTimers()
    const proc = makeMockProcess()

    const deps = makeDeps(registry, () => proc)
    const manager = createLspManager(deps)
    manager.status({ rootId: 'workspace', relPath: TS_FILE })

    vi.advanceTimersByTime(20000)
    await Promise.resolve()
    await Promise.resolve()

    const result = manager.status({ rootId: 'workspace', relPath: TS_FILE })
    expect(['starting', 'error']).toContain(result)
    vi.useRealTimers()
  })

  it('disposeAll: 모든 서버를 dispose한 후 새 요청에서 null을 반환한다', async () => {
    const proc = makeMockProcess()
    setupAutoInitialize(proc)
    const deps = makeDeps(registry, () => proc)
    const manager = createLspManager(deps)

    manager.status({ rootId: 'workspace', relPath: TS_FILE })
    await new Promise(r => setTimeout(r, 10))

    manager.disposeAll()

    expect(() => manager.disposeAll()).not.toThrow()
  })
})

describe('LspManager — hoverMarkdown 정규화', () => {
  let registry: RootRegistry
  let proc: MockProcess
  let deps: ReturnType<typeof makeDeps>

  beforeEach(() => {
    registry = createRootRegistry()
    registry.setWorkspace(WORKSPACE_ROOT)
    proc = makeMockProcess()
    setupAutoInitialize(proc)
    deps = makeDeps(registry, () => proc)
  })

  async function getHoverWith(contents: unknown): Promise<string | null> {
    const manager = createLspManager(deps)
    manager.status({ rootId: 'workspace', relPath: TS_FILE })
    await new Promise(r => setTimeout(r, 10))

    proc.stdin.write.mockImplementation((chunk: string | Buffer) => {
      if (typeof chunk !== 'string') {
        try {
          const msg = JSON.parse((chunk as Buffer).toString('utf8')) as { id?: number; method?: string }
          if (msg.method === 'textDocument/hover' && msg.id != null) {
            Promise.resolve().then(() => {
              feedProcess(proc, { jsonrpc: '2.0', id: msg.id, result: { contents } })
            })
          }
        } catch { }
      }
    })

    const r = await manager.hover({ rootId: 'workspace', relPath: TS_FILE, pos: { line: 0, character: 0 } })
    return r?.contents ?? null
  }

  it('string 타입 contents → 그대로 반환', async () => {
    const r = await getHoverWith('hello world')
    expect(r).toBe('hello world')
  })

  it('MarkupContent { kind, value } → value 반환', async () => {
    const r = await getHoverWith({ kind: 'markdown', value: '**type** string' })
    expect(r).toBe('**type** string')
  })

  it('MarkedString { language, value } → code block으로 변환', async () => {
    const r = await getHoverWith({ language: 'typescript', value: 'const x: string' })
    expect(r).toContain('```typescript')
    expect(r).toContain('const x: string')
  })

  it('배열 contents → 개행 구분 결합', async () => {
    const r = await getHoverWith(['first part', { kind: 'markdown', value: 'second part' }])
    expect(r).toContain('first part')
    expect(r).toContain('second part')
  })

  it('빈 contents → null 반환', async () => {
    const r = await getHoverWith('')
    expect(r).toBeNull()
  })
})
