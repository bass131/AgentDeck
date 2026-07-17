/**
 * lm1-set-model-contract.test.ts — LM1 P01 라이브 모델 전환 IPC 계약 (TDD RED)
 *
 * 대상(R only — 구현은 shared-ipc Worker 몫):
 *   02.Source/shared/ipc/agent.ts — `AGENT_SET_MODEL = 'agent.setModel'` 채널 additive +
 *     `SetModelRequest { runId: string; model: string }` / `SetModelResponse { accepted: boolean }`.
 *     SetMode(:236-253) 미러 — additive 별개 채널(SetMode 계약 오염 금지).
 *   02.Source/preload/index.ts — `agentSetModel(req): Promise<SetModelResponse>` 노출
 *     (agentSetMode :185 미러 — invoke형 래퍼만, 로직 0).
 *
 * 계약 핀(영호 확정 2026-07-17 ExitPlanMode — 임의 변경 금지):
 *   - 채널명 리터럴 = 'agent.setModel' (invoke).
 *   - AGENT_CHANNELS에 additive → IPC_CHANNELS 합성(spread)에도 포함(버전 bump 아님, P13 선례).
 *   - preload는 이 채널로 req를 **그대로** invoke — 검증/매핑은 main·어댑터(CORE-01).
 *     KNOWN_MODELS('opus'|'sonnet'|'haiku'|'fable') 화이트리스트는 어댑터/핸들러 계층이
 *     강제하며 preload는 브릿지만(이 파일은 브릿지 계약만 단정).
 *
 * 현재(RED) 이유: AGENT_CHANNELS에 AGENT_SET_MODEL 부재(undefined) + preload api에
 *   agentSetModel 부재. 타입 다리(Record 캐스트)로 typecheck는 green 유지 — 런타임 단정만
 *   FAIL(gap1-p13-set-mode-contract 선례).
 *
 * SetModelRequest/SetModelResponse 타입 자체는 컴파일타임 산물이라 런타임 단정 불가 —
 * 형상 계약(runId·model 필수 string / accepted boolean)은 main 핸들러 테스트와 이 파일의
 * invoke payload 단정(타입 부착된 req/res 캐스트)이 겸한다(미러 원본 방식 그대로).
 *
 * electron 모킹 패턴 = gap1-p13-set-mode-contract.test.ts 미러.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { AGENT_CHANNELS } from '../../../02.Source/shared/ipc/agent'
import { IPC_CHANNELS } from '../../../02.Source/shared/ipc-contract'

// ── 계약 핀 상수 (승인 계획 확정 어휘 — 리터럴로 박제) ────────────────────────────
const PINNED_CHANNEL = 'agent.setModel'

// ── 타입 다리 (구현 전 additive 표면 — 구현 후 동일 값으로 그대로 호환) ────────────
const agentChannels = AGENT_CHANNELS as Record<string, string | undefined>
const ipcChannels = IPC_CHANNELS as Record<string, string | undefined>

// ── electron mock (gap1-p13-set-mode-contract.test.ts 패턴 정밀 미러) ─────────────
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

describe('LM1 P01 — AGENT_SET_MODEL 채널 계약 (RED)', () => {
  it("AGENT_CHANNELS.AGENT_SET_MODEL === 'agent.setModel'", () => {
    // RED: 현행 AGENT_CHANNELS에 AGENT_SET_MODEL 키가 없다(undefined).
    expect(agentChannels['AGENT_SET_MODEL']).toBe(PINNED_CHANNEL)
  })

  it('IPC_CHANNELS 합성에도 포함된다 (spread 합성 — preload/main이 여기서 import)', () => {
    // RED: additive라 구현 시 ipc-contract가 스프레드로 자동 흡수 — 현행은 부재(undefined).
    expect(ipcChannels['AGENT_SET_MODEL']).toBe(PINNED_CHANNEL)
  })

  it("채널 값 'agent.setModel'은 AGENT_CHANNELS 안에서 유일하다 (additive·비충돌)", () => {
    // string[] 확장 캐스트 — 구현 전엔 리터럴 union에 'agent.setModel'이 없어 값 부재.
    const hits = (Object.values(AGENT_CHANNELS) as string[]).filter((v) => v === PINNED_CHANNEL)
    // RED: 현행 0건(부재). 구현 후 정확히 1건 — 기존 채널(agent.setMode 포함)과 값 충돌 금지.
    expect(hits).toHaveLength(1)
  })

  it("기존 AGENT_SET_MODE('agent.setMode')와 별개 채널이다 (SetMode 계약 오염 0)", () => {
    // 대조 핀: 모델 채널은 모드 채널과 나란히 추가되는 별개다. 두 채널값이 서로 달라야 한다.
    expect(agentChannels['AGENT_SET_MODE']).toBe('agent.setMode')
    // RED: AGENT_SET_MODEL 부재 → 아래는 undefined !== 'agent.setMode'로 현재도 통과(대조군).
    expect(agentChannels['AGENT_SET_MODEL']).not.toBe('agent.setMode')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. preload 노출 계약 — agentSetModel (agentSetMode 미러)
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P01 — preload agentSetModel 노출 (RED)', () => {
  it('window.api.agentSetModel이 함수로 노출된다', () => {
    const api = h.exposed.api as Record<string, unknown>
    // RED: 현행 preload api에 agentSetModel이 없다(undefined).
    expect(typeof api['agentSetModel']).toBe('function')
  })

  it("agentSetModel(req) → ipcRenderer.invoke('agent.setModel', req) 1회 — req 원문 그대로(가공 0)", async () => {
    const api = h.exposed.api as {
      agentSetModel?: (req: { runId: string; model: string }) => Promise<{ accepted: boolean }>
    }
    // 타입 부착 req — SetModelRequest 형상(runId·model 필수 string) 계약을 payload로 고정.
    const req = { runId: 'run-lm1-live', model: 'haiku' }
    // RED: agentSetModel 부재 → optional chaining으로 호출 자체가 일어나지 않는다.
    await api.agentSetModel?.(req)

    expect(h.invoke).toHaveBeenCalledTimes(1)
    // 채널은 핀 리터럴로 단정(상수 오타·리네임까지 잡는 wire-value 고정).
    expect(h.invoke).toHaveBeenCalledWith(PINNED_CHANNEL, req)
  })

  it('agentSetModel은 invoke 응답(SetModelResponse)을 그대로 반환한다 (브릿지만 — 로직 0)', async () => {
    const api = h.exposed.api as {
      agentSetModel?: (req: { runId: string; model: string }) => Promise<{ accepted: boolean }>
    }
    // 타입 부착 res — SetModelResponse 형상(accepted boolean) 계약을 반환값으로 고정.
    const res = await api.agentSetModel?.({ runId: 'run-lm1-live', model: 'opus' })
    // RED: 현행 undefined — 구현 후 mock invoke의 { accepted: true } 그대로.
    expect(res).toEqual({ accepted: true })
  })
})
