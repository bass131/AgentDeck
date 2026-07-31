import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { AGENT_CHANNELS } from '../../../02_Source/shared/ipc/agent'
import { IPC_CHANNELS } from '../../../02_Source/shared/ipcContract'

const PINNED_CHANNEL = 'agent.setMode'

const agentChannels = AGENT_CHANNELS as Record<string, string | undefined>
const ipcChannels = IPC_CHANNELS as Record<string, string | undefined>

const h = vi.hoisted(() => {
  const exposed: { api?: Record<string, unknown> } = {}
  const invoke = vi.fn(async () => ({ accepted: true }))
  return { exposed, invoke }
})

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, value: unknown): void => {
      h.exposed[key as 'api'] = value as Record<string, unknown>
    },
  },
  ipcRenderer: {
    invoke: h.invoke,
    on: vi.fn(),
    removeListener: vi.fn(),
  },
  webUtils: {
    getPathForFile: vi.fn(() => ''),
  },
  webFrame: {
    getZoomFactor: (): number => 1,
    setZoomFactor: vi.fn(),
  },
}))

beforeAll(async () => {
  await import('../../../02_Source/preload/index')
})

beforeEach(() => {
  h.invoke.mockClear()
})

describe('GAP1 P13 — AGENT_SET_MODE 채널 계약 (RED)', () => {
  it("AGENT_CHANNELS.AGENT_SET_MODE === 'agent.setMode'", () => {
    expect(agentChannels['AGENT_SET_MODE']).toBe(PINNED_CHANNEL)
  })

  it("IPC_CHANNELS 합성에도 포함된다 (spread 합성 — preload/main이 여기서 import)", () => {
    expect(ipcChannels['AGENT_SET_MODE']).toBe(PINNED_CHANNEL)
  })

  it("채널 값 'agent.setMode'는 AGENT_CHANNELS 안에서 유일하다 (additive·비충돌)", () => {
    const hits = (Object.values(AGENT_CHANNELS) as string[]).filter((v) => v === PINNED_CHANNEL)
    expect(hits).toHaveLength(1)
  })
})

describe('GAP1 P13 — preload agentSetMode 노출 (RED)', () => {
  it('window.api.agentSetMode가 함수로 노출된다', () => {
    const api = h.exposed.api as Record<string, unknown>
    expect(typeof api['agentSetMode']).toBe('function')
  })

  it("agentSetMode(req) → ipcRenderer.invoke('agent.setMode', req) 1회 — req 원문 그대로(가공 0)", async () => {
    const api = h.exposed.api as {
      agentSetMode?: (req: { runId: string; mode: string }) => Promise<{ accepted: boolean }>
    }
    const req = { runId: 'run-p13-live', mode: 'plan' }
    await api.agentSetMode?.(req)

    expect(h.invoke).toHaveBeenCalledTimes(1)
    expect(h.invoke).toHaveBeenCalledWith(PINNED_CHANNEL, req)
  })

  it('agentSetMode는 invoke 응답(SetModeResponse)을 그대로 반환한다 (브릿지만 — 로직 0)', async () => {
    const api = h.exposed.api as {
      agentSetMode?: (req: { runId: string; mode: string }) => Promise<{ accepted: boolean }>
    }
    const res = await api.agentSetMode?.({ runId: 'run-p13-live', mode: 'acceptEdits' })
    expect(res).toEqual({ accepted: true })
  })
})
