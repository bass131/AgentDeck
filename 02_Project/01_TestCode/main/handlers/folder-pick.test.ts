import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// M05 G11: 폴더 선택 대화상자 세 벌(workspace.open·reference.add·dialog.pickFolder)을 한 곳으로 모은다.
// 실물 핸들러 셋을 ipcMain.handle 가로채기로 등록해 지금 동작을 고정한다 —
// 대화상자 인자(부모 창 유무), 취소·빈 결과, `\`→`/`, E2E 환경변수 이름과 호출 시점 읽기,
// 요청 folderPath 우선(workspace·reference만), 실패 응답 모양, 사후 검증.
const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  showOpenDialog: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
}))

vi.mock('electron', async () => {
  const { vi: v } = await import('vitest')
  h.showOpenDialog = v.fn()
  return {
    ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown): void => { h.handlers.set(ch, fn) } },
    dialog: { showOpenDialog: (...a: unknown[]) => h.showOpenDialog(...a) },
    app: { getPath: () => os.tmpdir() },
  }
})

import { registerWorkspaceHandlers } from '@main/01_Ipc/handlers/workspace'
import { registerReferenceHandlers } from '@main/01_Ipc/handlers/reference'
import { registerFsHandlers } from '@main/01_Ipc/handlers/fs'
import { createRootRegistry } from '@main/07_Workspace/roots'
import { pickDirectory } from '@main/07_Workspace/pickFolder'
import { IPC_CHANNELS, WORKSPACE_ROOT_ID } from '../../../../02_Project/00_Source/shared/ipcContract'

const ENV_KEYS = ['AGENTDECK_E2E_WORKSPACE', 'AGENTDECK_E2E_REFERENCE', 'AGENTDECK_E2E_PICK_FOLDER'] as const
const FAKE_WIN = { id: 'win' } as never

let dir: string
let state: { win: unknown; currentWorkspaceRoot: string | null }
let roots: ReturnType<typeof createRootRegistry>
const saved: Record<string, string | undefined> = {}

function call(channel: string, req?: unknown): Promise<unknown> {
  const fn = h.handlers.get(channel)
  if (!fn) throw new Error(`${channel} 핸들러가 등록되지 않았다`)
  return Promise.resolve(fn({} as never, req))
}

const fwd = (p: string): string => p.replace(/\\/g, '/')

beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k] }
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g11-pick-'))
  h.handlers.clear()
  h.showOpenDialog.mockReset()
  state = { win: null, currentWorkspaceRoot: null }
  roots = createRootRegistry()
  const deps = { state: state as never, roots }
  registerWorkspaceHandlers(deps)
  registerReferenceHandlers(deps)
  registerFsHandlers(deps)
})

afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
  fs.rmSync(dir, { recursive: true, force: true })
})

const pickers = [
  { label: 'workspace.open', channel: IPC_CHANNELS.WORKSPACE_OPEN, env: 'AGENTDECK_E2E_WORKSPACE', fail: { rootPath: null, tree: null },
    pathOf: (r: unknown) => (r as { rootPath: string | null }).rootPath },
  { label: 'reference.add', channel: IPC_CHANNELS.REFERENCE_ADD, env: 'AGENTDECK_E2E_REFERENCE', fail: { reference: null },
    pathOf: (r: unknown) => (r as { reference: { rootPath: string } | null }).reference?.rootPath ?? null },
  { label: 'dialog.pickFolder', channel: IPC_CHANNELS.DIALOG_PICK_FOLDER, env: 'AGENTDECK_E2E_PICK_FOLDER', fail: { path: null },
    pathOf: (r: unknown) => (r as { path: string | null }).path },
] as const

describe.each(pickers)('폴더 선택 — $label (M05 G11 동작 고정)', ({ channel, env, fail, pathOf }) => {
  it('창이 없으면 대화상자를 인자 하나로, 있으면 (창, 옵션)으로 부른다 — 창은 호출 때 읽는다', async () => {
    h.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    await call(channel, {})
    expect(h.showOpenDialog.mock.calls[0]).toEqual([{ properties: ['openDirectory'] }])
    state.win = FAKE_WIN
    await call(channel, {})
    expect(h.showOpenDialog.mock.calls[1]).toEqual([FAKE_WIN, { properties: ['openDirectory'] }])
  })

  it('취소나 빈 결과면 실패 모양을 돌려준다', async () => {
    h.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [dir] })
    expect(await call(channel, {})).toEqual(fail)
    h.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [] })
    expect(await call(channel, {})).toEqual(fail)
  })

  it('고른 경로의 `\\`를 `/`로 바꾼다', async () => {
    h.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [dir.replace(/\//g, '\\')] })
    expect(pathOf(await call(channel, {}))).toBe(fwd(dir))
  })

  it('자기 E2E 환경변수가 있으면 대화상자 없이 그 값을 쓴다 — 호출 때 읽는다', async () => {
    process.env[env] = dir
    expect(pathOf(await call(channel, {}))).toBe(fwd(dir))
    expect(h.showOpenDialog).not.toHaveBeenCalled()
  })

  it('빈 문자열 환경변수는 없는 것으로 본다(truthy 검사)', async () => {
    process.env[env] = ''
    h.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    await call(channel, {})
    expect(h.showOpenDialog).toHaveBeenCalledTimes(1)
  })

  it('다른 핸들러의 E2E 환경변수는 보지 않는다', async () => {
    for (const k of ENV_KEYS) if (k !== env) process.env[k] = dir
    h.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    expect(await call(channel, {})).toEqual(fail)
    expect(h.showOpenDialog).toHaveBeenCalledTimes(1)
  })

  it('사후 검증 — 없는 폴더면 실패 모양', async () => {
    h.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [path.join(dir, 'missing')] })
    expect(await call(channel, {})).toEqual(fail)
  })
})

describe.each(pickers.slice(0, 2))('요청 folderPath 우선 — $label', ({ channel, env, fail, pathOf }) => {
  it('절대 경로 folderPath가 환경변수·대화상자보다 먼저다', async () => {
    process.env[env] = path.join(dir, 'other')
    expect(pathOf(await call(channel, { folderPath: dir }))).toBe(fwd(dir))
    expect(h.showOpenDialog).not.toHaveBeenCalled()
  })

  it('상대 경로 folderPath는 대화상자 없이 실패 모양', async () => {
    expect(await call(channel, { folderPath: 'rel/dir' })).toEqual(fail)
    expect(h.showOpenDialog).not.toHaveBeenCalled()
  })
})

describe('dialog.pickFolder는 요청을 보지 않는다', () => {
  it('folderPath를 줘도 대화상자를 연다', async () => {
    h.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    expect(await call(IPC_CHANNELS.DIALOG_PICK_FOLDER, { folderPath: dir })).toEqual({ path: null })
    expect(h.showOpenDialog).toHaveBeenCalledTimes(1)
  })
})

describe('pickDirectory() — 한 곳으로 모은 대화상자 (M05 G11)', () => {
  it('사후 검증을 하지 않는다 — 없는 경로도 그대로 돌려준다(검증은 핸들러 몫)', async () => {
    h.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['C:\\nope\\x'] })
    expect(await pickDirectory(null, 'AGENTDECK_E2E_PICK_FOLDER')).toBe('C:/nope/x')
  })

  it('환경변수 값도 검증 없이 `/`로만 바꾼다', async () => {
    process.env.AGENTDECK_E2E_REFERENCE = 'rel\\path'
    expect(await pickDirectory(null, 'AGENTDECK_E2E_REFERENCE')).toBe('rel/path')
    expect(h.showOpenDialog).not.toHaveBeenCalled()
  })

  it('취소면 null', async () => {
    h.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    expect(await pickDirectory(FAKE_WIN, 'AGENTDECK_E2E_WORKSPACE')).toBeNull()
    expect(h.showOpenDialog.mock.calls[0]).toEqual([FAKE_WIN, { properties: ['openDirectory'] }])
  })
})

describe('workspace.open — 성공하면 현재 루트를 기록한다', () => {
  // 루트 원천은 roots로 본다 — currentWorkspaceRoot는 G11 7단계(원천 하나)에서 없어질 수 있다
  it('roots의 작업 공간 루트에 `/` 경로가 들어간다', async () => {
    h.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [dir] })
    await call(IPC_CHANNELS.WORKSPACE_OPEN, {})
    expect(roots.get(WORKSPACE_ROOT_ID)?.path).toBe(fwd(dir))
  })
})
