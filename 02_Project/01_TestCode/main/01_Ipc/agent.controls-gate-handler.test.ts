import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { RunManager } from '@main/03_Agent/agentRuns'

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  ud: '',
  backendId: 'claude-code' as string,
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown): void => {
      h.handlers.set(ch, fn)
    },
  },
}))
vi.mock('@main/00_App/registry', () => ({ getBackend: (): unknown => ({ id: h.backendId }) }))
vi.mock('@main/02_Common/userData', () => ({ getUserDataDir: (): string => h.ud }))

import { registerAgentHandlers } from '@main/01_Ipc/handlers/agent'
import { setControlEnabled } from '@main/04_Claude/permission/controlsStore'
import { IPC_CHANNELS } from '@shared/ipcContract'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-run-gate-ipc-'))
const start = vi.fn(async () => 'run-1')

beforeEach(() => {
  h.ud = fs.mkdtempSync(path.join(root, 'ud-'))
  h.backendId = 'claude-code'
  h.handlers.clear()
  start.mockClear()
  registerAgentHandlers({ state: { win: null }, runManager: { start } as unknown as RunManager })
})

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const run = (): Promise<unknown> =>
  h.handlers.get(IPC_CHANNELS.AGENT_RUN)!({} as never, { messages: [{ role: 'user', content: 'hi' }] }) as Promise<unknown>

function tamper(): void {
  setControlEnabled(h.ud, 'readonly-allow', false)
  fs.writeFileSync(path.join(h.ud, 'controls.json'), JSON.stringify({ version: 1, disabled: [] }))
}

describe('agent.run 요청 단계의 컨트롤 검사 (M07 G5)', () => {
  it('봉인이 깨졌으면 Claude 실행을 시작하지 않고 패널 위치를 알리는 오류로 거절한다', async () => {
    tamper()
    await expect(run()).rejects.toThrow(/설정 › 컨트롤/)
    expect(start).not.toHaveBeenCalled()
  })

  it('봉인이 맞거나 첫 실행이면 그대로 시작한다', async () => {
    await expect(run()).resolves.toEqual({ runId: 'run-1' })
    setControlEnabled(h.ud, 'readonly-allow', false)
    await expect(run()).resolves.toEqual({ runId: 'run-1' })
    expect(start).toHaveBeenCalledTimes(2)
  })

  it('Codex 실행은 컨트롤 노드와 무관해 막지 않는다', async () => {
    tamper()
    h.backendId = 'codex'
    await expect(run()).resolves.toEqual({ runId: 'run-1' })
  })
})
