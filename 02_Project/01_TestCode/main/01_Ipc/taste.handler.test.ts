import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  ud: '',
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown): void => {
      h.handlers.set(ch, fn)
    },
  },
}))
vi.mock('@main/02_Common/userData', () => ({ getUserDataDir: (): string => h.ud }))

import { registerTasteHandlers } from '@main/01_Ipc/handlers/taste'
import { writeProjectCharter } from '@main/13_Taste/tasteStore'
import { API_ROUTES } from '@shared/01_Ipc/apiRoutes'
import { IPC_CHANNELS, TASTE_CHANNELS, type ReqOf, type ResOf } from '@shared/ipcContract'
import type { TasteDocsRead, TasteReadRequest } from '@shared/14_Taste/taste'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-taste-ipc-'))
let ws = ''

beforeEach(() => {
  h.ud = fs.mkdtempSync(path.join(root, 'ud-'))
  ws = fs.mkdtempSync(path.join(root, 'ws-'))
  h.handlers.clear()
  registerTasteHandlers()
})

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

async function call(req: unknown): Promise<TasteDocsRead> {
  const fn = h.handlers.get(IPC_CHANNELS.TASTE_READ)
  if (!fn) throw new Error('taste.read 핸들러가 등록되지 않았다')
  return (await fn({} as never, req)) as TasteDocsRead
}

describe('Taste 읽기 IPC', () => {
  it('채널은 taste.read 하나이고 라우트·계약 표에 요청·응답 타입이 있다', () => {
    expect(TASTE_CHANNELS).toEqual({ TASTE_READ: 'taste.read' })
    expect(IPC_CHANNELS.TASTE_READ).toBe('taste.read')
    expect(API_ROUTES.taste.read).toEqual({ kind: 'call', channel: 'taste.read' })
    const req: ReqOf<'taste.read'> = { cwd: 'C:\\work' } satisfies TasteReadRequest
    const res: ResOf<'taste.read'> = {
      global: { absent: true, path: 'g' },
      charter: { absent: false, path: 'c', raw: '', doc: { goal: [], nonGoals: null }, problems: [] },
      project: { absent: true, path: 'p' },
    } satisfies TasteDocsRead
    expect(req.cwd).toBe('C:\\work')
    expect(res.charter.absent).toBe(false)
  })

  it('IPC 등록부가 Taste 읽기 핸들러를 등록한다', async () => {
    h.handlers.clear()
    const { registerIpc } = await import('@main/01_Ipc/index')
    const stub = (): null => null
    registerIpc({
      state: { win: null },
      roots: {} as never,
      runManager: {} as never,
      getStore: stub,
      getCurrentWorkspaceRoot: stub,
      getSkillsStore: stub,
      getMcpStore: stub,
      getCommandsStore: stub,
      getPrefsStore: stub,
      getProfileStore: stub,
    })
    expect(h.handlers.has(IPC_CHANNELS.TASTE_READ)).toBe(true)
  })

  it('세 문서의 구조·원문·검사 문제·없음 여부를 한 번에 돌려준다', async () => {
    fs.mkdirSync(path.join(h.ud, 'taste'))
    fs.writeFileSync(path.join(h.ud, 'taste', 'global-taste.md'), '# 전역 Taste\n\n## T1 a\n')
    await writeProjectCharter(ws, { goal: ['목표 한 줄'], nonGoals: null })
    const r = await call({ cwd: ws })
    expect(r.global.absent).toBe(false)
    if (!r.global.absent) {
      expect(r.global.raw).toBe('# 전역 Taste\n\n## T1 a\n')
      expect(r.global.doc.items.map((i) => i.id)).toEqual(['T1'])
      expect(r.global.problems.map((p) => p.kind)).toEqual(['empty-item'])
    }
    expect(r.charter).toMatchObject({ absent: false, doc: { goal: ['목표 한 줄'], nonGoals: null }, problems: [] })
    expect(r.project).toEqual({ absent: true, path: path.join(ws, 'docs', 'agentdeck', 'Taste.md') })
  })

  it('cwd가 git 저장소의 하위 폴더면 저장소 뿌리(실행기와 같은 실제 경로)의 문서를 읽는다', async () => {
    execFileSync('git', ['init', '--quiet', ws], { windowsHide: true })
    const sub = path.join(ws, 'packages', 'app')
    fs.mkdirSync(sub, { recursive: true })
    await writeProjectCharter(ws, { goal: ['뿌리의 헌장'], nonGoals: null })
    const r = await call({ cwd: sub })
    expect(r.charter).toMatchObject({ absent: false, path: path.join(fs.realpathSync.native(ws), 'docs', 'agentdeck', '헌장.md'), doc: { goal: ['뿌리의 헌장'] } })
  })

  it('cwd가 절대 경로가 아니면 거절한다', async () => {
    for (const bad of [undefined, null, {}, { cwd: '' }, { cwd: 'relative/dir' }, { cwd: 3 }]) {
      await expect(call(bad)).rejects.toThrow('taste.read')
    }
  })
})
