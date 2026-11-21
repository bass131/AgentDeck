import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  diffRoots: [] as string[],
}))

// fs.diff는 git 저장소가 있어야 줄을 내므로, 실물 핸들러가 diff 계산에 넘기는 루트를 기록한다
vi.mock('@main/08_Git/fsDiff', () => ({
  resolveFsDiffLines: async (root: string): Promise<unknown[]> => { h.diffRoots.push(root); return [{ root }] },
}))

vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown): void => { h.handlers.set(ch, fn) } },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  app: { getPath: () => os.tmpdir() },
}))

import { registerWorkspaceHandlers } from '@main/01_Ipc/handlers/workspace'
import { registerFsHandlers } from '@main/01_Ipc/handlers/fs'
import { createRootRegistry } from '@main/07_Workspace/roots'
import { IPC_CHANNELS } from '@shared/ipcContract'

function call(channel: string, req?: unknown): Promise<unknown> {
  const fn = h.handlers.get(channel)
  if (!fn) throw new Error(`${channel} 핸들러가 등록되지 않았다`)
  return Promise.resolve(fn({} as never, req))
}

const fwd = (p: string): string => p.replace(/\\/g, '/')

let dirA: string
let dirB: string
let roots: ReturnType<typeof createRootRegistry>

function makeDir(prefix: string, file: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  fs.writeFileSync(path.join(d, file), 'hello')
  return d
}

beforeEach(() => {
  h.handlers.clear()
  dirA = makeDir('g11-root-a-', 'a.txt')
  dirB = makeDir('g11-root-b-', 'b.txt')
  roots = createRootRegistry()
  const deps = { state: { win: null } as never, roots }
  registerWorkspaceHandlers(deps)
  registerFsHandlers(deps)
})

afterEach(() => {
  fs.rmSync(dirA, { recursive: true, force: true })
  fs.rmSync(dirB, { recursive: true, force: true })
})

async function readers(): Promise<{ tree: unknown; files: unknown; entries: unknown; read: unknown; diffRoot: string | null }> {
  const tree = ((await call(IPC_CHANNELS.WORKSPACE_TREE)) as { tree: unknown }).tree
  const files = ((await call(IPC_CHANNELS.LIST_FILES)) as { files: unknown }).files
  const entries = ((await call(IPC_CHANNELS.FS_LIST_DIR, { relDir: '' })) as { entries: unknown }).entries
  const read = await call(IPC_CHANNELS.FS_READ, { path: 'a.txt' })
  h.diffRoots.length = 0
  await call(IPC_CHANNELS.FS_DIFF, { filePath: 'a.txt' })
  const diffRoot = h.diffRoots.length ? fwd(h.diffRoots[0]) : null
  return { tree, files, entries, read, diffRoot }
}

// 응답 안에 보이는 파일 이름 집합(트리는 name·path에 같은 이름이 두 번 나온다)
const names = (v: unknown): string[] => [...new Set(JSON.stringify(v).match(/[ab]\.txt/g) ?? [])]

describe('워크스페이스 루트 — 여는 경로와 읽는 경로 (M05 G11 동작 고정)', () => {
  it('열기 전에는 네 채널이 모두 빈 응답이다', async () => {
    const r = await readers()
    expect(r.tree).toBeNull()
    expect(r.files).toEqual([])
    expect(r.entries).toEqual([])
    expect(r.read).toEqual({ kind: 'not-found' })
    expect(r.diffRoot).toBeNull()
  })

  it('workspace.open 뒤에는 네 채널이 연 루트를 읽는다', async () => {
    const opened = (await call(IPC_CHANNELS.WORKSPACE_OPEN, { folderPath: dirA })) as { rootPath: string }
    expect(opened.rootPath).toBe(fwd(dirA))
    const r = await readers()
    expect(names(r.tree)).toContain('a.txt')
    expect(names(r.files)).toContain('a.txt')
    expect(names(r.entries)).toContain('a.txt')
    expect(r.read).toMatchObject({ kind: 'text' })
    expect(r.diffRoot).toBe(fwd(dirA))
  })

  it('다른 폴더를 다시 열면 네 채널이 함께 새 루트로 옮겨 간다', async () => {
    await call(IPC_CHANNELS.WORKSPACE_OPEN, { folderPath: dirA })
    await call(IPC_CHANNELS.WORKSPACE_OPEN, { folderPath: dirB })
    const r = await readers()
    for (const v of [r.tree, r.files, r.entries]) {
      expect(names(v)).toEqual(['b.txt'])
    }
    expect(r.read).toEqual({ kind: 'not-found' })
    expect(r.diffRoot).toBe(fwd(dirB))
  })

  it('열기가 실패하면 이전 루트가 그대로다', async () => {
    await call(IPC_CHANNELS.WORKSPACE_OPEN, { folderPath: dirA })
    expect(await call(IPC_CHANNELS.WORKSPACE_OPEN, { folderPath: path.join(dirA, 'nope') })).toEqual({ rootPath: null, tree: null })
    expect(await call(IPC_CHANNELS.WORKSPACE_OPEN, { folderPath: 'relative/dir' })).toEqual({ rootPath: null, tree: null })
    const r = await readers()
    expect(names(r.files)).toEqual(['a.txt'])
  })
})

describe('워크스페이스 루트 — 원천은 roots 하나다 (M05 G11 4단계)', () => {
  it('roots에 작업 공간을 넣기만 해도 네 채널이 그 루트를 읽는다(따로 쥔 사본이 없다)', async () => {
    roots.setWorkspace(fwd(dirA))
    const r = await readers()
    expect(names(r.tree)).toEqual(['a.txt'])
    expect(names(r.files)).toEqual(['a.txt'])
    expect(names(r.entries)).toEqual(['a.txt'])
    expect(r.read).toMatchObject({ kind: 'text', content: 'hello' })
    expect(r.diffRoot).toBe(fwd(dirA))
  })

  const MAIN_DIR = path.resolve(__dirname, '../../../00_Source/main')
  function mainSources(dir = MAIN_DIR, acc: { rel: string; src: string }[] = []): { rel: string; src: string }[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) mainSources(full, acc)
      else if (e.name.endsWith('.ts')) acc.push({ rel: fwd(path.relative(MAIN_DIR, full)), src: fs.readFileSync(full, 'utf8') })
    }
    return acc
  }

  it('main 소스에 두 번째 원천(currentWorkspaceRoot)이 없다', () => {
    const hits = mainSources().filter((f) => f.src.includes('currentWorkspaceRoot')).map((f) => f.rel)
    expect(hits).toEqual([])
  })

  it('루트를 읽는 핸들러와 settings 배선은 접근자 getWorkspaceRootPath 하나를 거친다', () => {
    const files = mainSources()
    const accessorDefs = files.filter((f) => /export function getWorkspaceRootPath\(/.test(f.src)).map((f) => f.rel)
    expect(accessorDefs).toEqual(['07_Workspace/roots.ts'])
    for (const rel of ['01_Ipc/handlers/workspace.ts', '01_Ipc/handlers/fs.ts']) {
      const src = files.find((f) => f.rel === rel)!.src
      expect(src).toMatch(/getWorkspaceRootPath\(roots\)/)
    }
    const wiring = files.filter((f) => /getCurrentWorkspaceRoot:\s*\(\)\s*=>\s*getWorkspaceRootPath\(roots\)/.test(f.src))
    expect(wiring).toHaveLength(1)
  })
})
