// M07 G5 — 컨트롤 패널의 IPC 핸들러. ipcMain.handle을 가로채 등록된 핸들러를 직접 부른다.
// 상태는 노드 목록·controls.json 봉인 상태에 엔진 봉인 상태를 함께 싣는다(패널의 바뀜 경고 두 갈래).
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  ud: '',
  engine: { package: '@anthropic-ai/claude-agent-sdk', bundled: '0.3.325', active: '0.3.326' as string | null, installed: ['0.3.326'], seal: 'mismatch' },
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown): void => {
      h.handlers.set(ch, fn)
    },
  },
}))
vi.mock('@main/02_Common/userData', () => ({ getUserDataDir: (): string => h.ud }))
vi.mock('@main/10_Engine/engineVersions', () => ({ getVersionState: () => ({ ...h.engine }) }))

import { registerControlsHandlers } from '@main/01_Ipc/handlers/controls'
import { IPC_CHANNELS } from '../../../../02_Project/00_Source/shared/ipcContract'
import type { ControlsState } from '../../../../02_Project/00_Source/shared/ipcContract'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-controls-ipc-'))

beforeEach(() => {
  h.ud = fs.mkdtempSync(path.join(root, 'ud-'))
  h.handlers.clear()
  registerControlsHandlers()
})

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

function call<T>(ch: string, req?: unknown): T {
  const fn = h.handlers.get(ch)
  if (!fn) throw new Error(`${ch} 핸들러가 등록되지 않았다`)
  return fn({} as never, req) as T
}

describe('컨트롤 IPC (M07 G5)', () => {
  it('IPC 등록부가 컨트롤 핸들러 셋을 등록한다', async () => {
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
      getMultiStorePath: stub,
    })
    for (const ch of [IPC_CHANNELS.CONTROLS_STATE, IPC_CHANNELS.CONTROLS_SET_ENABLED, IPC_CHANNELS.CONTROLS_CONFIRM]) {
      expect(h.handlers.has(ch)).toBe(true)
    }
  })

  it('채널 이름은 설정 도메인이다', () => {
    expect(IPC_CHANNELS.CONTROLS_STATE).toBe('settings.controlsState')
    expect(IPC_CHANNELS.CONTROLS_SET_ENABLED).toBe('settings.setControlEnabled')
    expect(IPC_CHANNELS.CONTROLS_CONFIRM).toBe('settings.confirmControls')
  })

  it('상태는 노드 목록, controls.json 봉인 상태, 엔진 봉인 상태를 함께 준다', () => {
    const s = call<ControlsState>(IPC_CHANNELS.CONTROLS_STATE)
    expect(s.status).toBe('none')
    expect(s.nodes.map((n) => n.id)).toContain('mode-auto-bypass-allow')
    expect(s.engine).toEqual({ seal: 'mismatch', active: '0.3.326' })
  })

  it('토글은 풀린 노드만 받고 잘못된 요청은 거절한다', () => {
    expect(call(IPC_CHANNELS.CONTROLS_SET_ENABLED, { id: 'readonly-allow', enabled: false })).toEqual({ ok: true })
    expect(call<ControlsState>(IPC_CHANNELS.CONTROLS_STATE).nodes.find((n) => n.id === 'readonly-allow')?.enabled).toBe(false)
    expect(call<{ ok: boolean }>(IPC_CHANNELS.CONTROLS_SET_ENABLED, { id: 'no-suggestion-card', enabled: false }).ok).toBe(false)
    expect(call<{ ok: boolean }>(IPC_CHANNELS.CONTROLS_SET_ENABLED, { id: 'readonly-allow', enabled: 'no' }).ok).toBe(false)
    expect(call<{ ok: boolean }>(IPC_CHANNELS.CONTROLS_SET_ENABLED, null).ok).toBe(false)
  })

  it('봉인이 깨진 동안 토글은 거절하고 오류 문장을 준다', () => {
    call(IPC_CHANNELS.CONTROLS_SET_ENABLED, { id: 'readonly-allow', enabled: false })
    fs.rmSync(path.join(h.ud, 'controls-seal.json'))
    const r = call<{ ok: boolean; error?: string }>(IPC_CHANNELS.CONTROLS_SET_ENABLED, { id: 'accept-edits-allow', enabled: false })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('확인')
  })

  it('확인은 앱 밖에서 바뀐 내용을 다시 봉인한다', () => {
    call(IPC_CHANNELS.CONTROLS_SET_ENABLED, { id: 'readonly-allow', enabled: false })
    fs.writeFileSync(path.join(h.ud, 'controls.json'), JSON.stringify({ version: 1, disabled: [] }))
    expect(call<ControlsState>(IPC_CHANNELS.CONTROLS_STATE).status).toBe('mismatch')
    expect(call(IPC_CHANNELS.CONTROLS_CONFIRM)).toEqual({ ok: true })
    expect(call<ControlsState>(IPC_CHANNELS.CONTROLS_STATE).status).toBe('ok')
  })
})
