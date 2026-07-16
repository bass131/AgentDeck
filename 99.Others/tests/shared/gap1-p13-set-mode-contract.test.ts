/**
 * gap1-p13-set-mode-contract.test.ts — GAP1 P13 라이브 권한 모드 전환 IPC 계약 (TDD RED)
 *
 * 대상(R only — 구현은 shared-ipc Worker 몫):
 *   02.Source/shared/ipc/agent.ts — `AGENT_SET_MODE = 'agent.setMode'` 채널 additive +
 *     `SetModeRequest { runId: string; mode: string }` / `SetModeResponse { accepted: boolean }`.
 *   02.Source/preload/index.ts — `agentSetMode(req): Promise<SetModeResponse>` 노출
 *     (agentTaskStop 미러 — invoke형 래퍼만, 로직 0).
 *
 * 계약 핀(coordinator 확정 2026-07-14 — 임의 변경 금지):
 *   - 채널명 리터럴 = 'agent.setMode' (invoke).
 *   - AGENT_CHANNELS에 additive → IPC_CHANNELS 합성(spread)에도 포함.
 *   - preload는 이 채널로 req를 **그대로** invoke — 검증/매핑은 main 단독(CORE-01).
 *     화이트리스트('normal'|'plan'|'acceptEdits'|'auto')는 main 핸들러 계층이 강제하며
 *     preload는 브릿지만(이 파일은 브릿지 계약만 단정).
 *
 * 현재(RED) 이유: AGENT_CHANNELS에 AGENT_SET_MODE 부재(undefined) + preload api에
 *   agentSetMode 부재. 타입 다리(Record 캐스트)로 typecheck는 green 유지 — 런타임 단정만
 *   FAIL(gap1-p09 RunWithStopTask 선례).
 *
 * SetModeRequest/SetModeResponse 타입 자체는 컴파일타임 산물이라 런타임 단정 불가 —
 * 형상 계약은 main 핸들러 테스트(gap1-p13-set-mode-handler)와 이 파일의 invoke payload
 * 단정이 겸한다.
 *
 * electron 모킹 패턴 = zoom-setter-contract.test.ts 미러.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { AGENT_CHANNELS } from '../../../02.Source/shared/ipc/agent'
import { IPC_CHANNELS } from '../../../02.Source/shared/ipc-contract'

// ── 계약 핀 상수 (coordinator 확정 어휘 — 리터럴로 박제) ─────────────────────────
const PINNED_CHANNEL = 'agent.setMode'

// ── 타입 다리 (구현 전 additive 표면 — 구현 후 동일 값으로 그대로 호환) ────────────
const agentChannels = AGENT_CHANNELS as Record<string, string | undefined>
const ipcChannels = IPC_CHANNELS as Record<string, string | undefined>

// ── electron mock (zoom-setter-contract.test.ts 패턴 정밀 미러) ──────────────────
// vi.mock 팩토리는 호이스트되므로 공유 상태는 vi.hoisted로.
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
  // 모듈 최상단 contextBridge.exposeInMainWorld('api', api) 실행 — 1회만 임포트.
  await import('../../../02.Source/preload/index')
})

beforeEach(() => {
  h.invoke.mockClear()
})

// ═══════════════════════════════════════════════════════════════════════════════
// 1. 채널 상수 계약 (shared 단일 정의, CORE-04)
// ═══════════════════════════════════════════════════════════════════════════════

describe('GAP1 P13 — AGENT_SET_MODE 채널 계약 (RED)', () => {
  it("AGENT_CHANNELS.AGENT_SET_MODE === 'agent.setMode'", () => {
    // RED: 현행 AGENT_CHANNELS에 AGENT_SET_MODE 키가 없다(undefined).
    expect(agentChannels['AGENT_SET_MODE']).toBe(PINNED_CHANNEL)
  })

  it("IPC_CHANNELS 합성에도 포함된다 (spread 합성 — preload/main이 여기서 import)", () => {
    expect(ipcChannels['AGENT_SET_MODE']).toBe(PINNED_CHANNEL)
  })

  it("채널 값 'agent.setMode'는 AGENT_CHANNELS 안에서 유일하다 (additive·비충돌)", () => {
    // string[] 확장 캐스트 — 구현 전엔 리터럴 union에 'agent.setMode'가 없어 TS2367(무겹침 비교).
    const hits = (Object.values(AGENT_CHANNELS) as string[]).filter((v) => v === PINNED_CHANNEL)
    // RED: 현행 0건(부재). 구현 후 정확히 1건 — 기존 채널과 값 충돌 금지.
    expect(hits).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. preload 노출 계약 — agentSetMode (agentTaskStop 미러)
// ═══════════════════════════════════════════════════════════════════════════════

describe('GAP1 P13 — preload agentSetMode 노출 (RED)', () => {
  it('window.api.agentSetMode가 함수로 노출된다', () => {
    const api = h.exposed.api as Record<string, unknown>
    // RED: 현행 preload api에 agentSetMode가 없다(undefined).
    expect(typeof api['agentSetMode']).toBe('function')
  })

  it("agentSetMode(req) → ipcRenderer.invoke('agent.setMode', req) 1회 — req 원문 그대로(가공 0)", async () => {
    const api = h.exposed.api as {
      agentSetMode?: (req: { runId: string; mode: string }) => Promise<{ accepted: boolean }>
    }
    const req = { runId: 'run-p13-live', mode: 'plan' }
    // RED: agentSetMode 부재 → optional chaining으로 호출 자체가 일어나지 않는다.
    await api.agentSetMode?.(req)

    expect(h.invoke).toHaveBeenCalledTimes(1)
    // 채널은 핀 리터럴로 단정(상수 오타·리네임까지 잡는 wire-value 고정).
    expect(h.invoke).toHaveBeenCalledWith(PINNED_CHANNEL, req)
  })

  it('agentSetMode는 invoke 응답(SetModeResponse)을 그대로 반환한다 (브릿지만 — 로직 0)', async () => {
    const api = h.exposed.api as {
      agentSetMode?: (req: { runId: string; mode: string }) => Promise<{ accepted: boolean }>
    }
    const res = await api.agentSetMode?.({ runId: 'run-p13-live', mode: 'acceptEdits' })
    // RED: 현행 undefined — 구현 후 mock invoke의 { accepted: true } 그대로.
    expect(res).toEqual({ accepted: true })
  })
})
