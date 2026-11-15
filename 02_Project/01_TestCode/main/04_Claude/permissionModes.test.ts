import { describe, it, expect, vi } from 'vitest'
import type { RunManager } from '@main/03_Agent/agentRuns'
import type { AgentRun } from '@main/03_Agent/AgentBackend'

// M05 G11: 권한 모드 매핑 표 네 벌(시작 runArgs, 실행 중 claudeAgentRun, 역매핑 claudeStream, 화이트리스트 agent.ts)을
// main 안 한 모듈로 모은다. 값은 하나도 바꾸지 않는다(의미 변경은 M06). 여기서는 실물 진입점 넷을 직접 불러
// 지금 값을 전부 고정한다 — 로직을 테스트 안에 복제하지 않는다.
// 끝 사례: 세 표는 일반 객체 조회라 'constructor' 같은 키가 프로토타입 함수를 돌려준다. 화이트리스트는 배열 includes라 걸러진다.
// 이 끝 사례도 지금 동작 그대로 고정한다(Map·hasOwn으로 바꾸면 달라진다).
const h = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>() }))

vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown): void => { h.handlers.set(ch, fn) } },
}))

vi.mock('@main/00_App/registry', () => ({
  getBackend: (): unknown => ({}),
}))

import { buildQueryOptions } from '@main/04_Claude/runArgs'
import { mapClaudeStreamLine } from '@main/04_Claude/stream/claudeStream'
import { ClaudeCodeBackend } from '@main/04_Claude/ClaudeCodeBackend'
import type { QueryFn } from '@main/04_Claude/ClaudeCodeBackend'
import { registerAgentHandlers } from '@main/01_Ipc/handlers/agent'
import { IPC_CHANNELS } from '../../../../02_Project/00_Source/shared/ipcContract'
import {
  PERMISSION_MODE_TABLE,
  START_MODE_TO_SDK,
  LIVE_MODE_TO_SDK,
  SDK_MODE_TO_PICKER,
  LIVE_MODE_WHITELIST,
} from '@main/04_Claude/permissionModes'
import fs from 'node:fs'
import path from 'node:path'

// 옮기기 전 네 벌의 값을 글자 그대로 적은 것 — 유도 결과는 이것과 키 순서까지 같아야 한다
const BEFORE = {
  start: { normal: 'default', plan: 'plan', acceptEdits: 'acceptEdits', auto: 'acceptEdits', bypass: 'bypassPermissions' },
  live: { normal: 'default', plan: 'plan', acceptEdits: 'acceptEdits', auto: 'auto' },
  reverse: { default: 'normal', plan: 'plan', acceptEdits: 'acceptEdits', auto: 'auto', bypassPermissions: 'bypass' },
  whitelist: ['normal', 'plan', 'acceptEdits', 'auto'],
}

describe('한 모듈의 표 — 유도 결과가 옮기기 전 네 벌과 같다 (M05 G11)', () => {
  it('표는 picker id 다섯 행이고 auto만 두 칸이 다르다', () => {
    expect(Object.keys(PERMISSION_MODE_TABLE)).toEqual(['normal', 'plan', 'acceptEdits', 'auto', 'bypass'])
    const differ = Object.entries(PERMISSION_MODE_TABLE).filter(([, r]) => r.live !== undefined && r.live !== r.start)
    expect(differ.map(([k]) => k)).toEqual(['auto'])
  })

  it('bypass 행만 실행 중 칸이 없다 — 시작에서만 bypassPermissions로 쓰이고 실행 중 전환은 거부된다', () => {
    const noLive = Object.entries(PERMISSION_MODE_TABLE).filter(([, r]) => r.live === undefined)
    expect(noLive).toEqual([['bypass', { start: 'bypassPermissions' }]])
  })

  it('시작 칸', () => {
    expect(START_MODE_TO_SDK).toEqual(BEFORE.start)
    expect(Object.keys(START_MODE_TO_SDK)).toEqual(Object.keys(BEFORE.start))
  })

  it('실행 중 칸', () => {
    expect(LIVE_MODE_TO_SDK).toEqual(BEFORE.live)
    expect(Object.keys(LIVE_MODE_TO_SDK)).toEqual(Object.keys(BEFORE.live))
  })

  it('역매핑(live ?? start 뒤집기)', () => {
    expect(SDK_MODE_TO_PICKER).toEqual(BEFORE.reverse)
    expect(Object.keys(SDK_MODE_TO_PICKER)).toEqual(Object.keys(BEFORE.reverse))
  })

  it('화이트리스트(live 칸이 있는 행)는 배열이다', () => {
    expect(Array.isArray(LIVE_MODE_WHITELIST)).toBe(true)
    expect([...LIVE_MODE_WHITELIST]).toEqual(BEFORE.whitelist)
  })

  it('화이트리스트와 실행 중 칸은 같은 id 집합이다(핸들러가 받은 id는 실행에서 반드시 전환된다)', () => {
    expect([...LIVE_MODE_WHITELIST].sort()).toEqual(Object.keys(LIVE_MODE_TO_SDK).sort())
  })

  it('역매핑은 실행 중 칸이 있으면 그 값을, 없으면 시작 칸을 뒤집는다 — 뒤집은 결과가 겹치지 않는다', () => {
    const sources = Object.values(PERMISSION_MODE_TABLE).map((r) => r.live ?? r.start)
    expect(new Set(sources).size).toBe(sources.length)
  })

  it('세 표는 일반 객체다(프로토타입 키 조회가 옮기기 전과 같다)', () => {
    for (const t of [START_MODE_TO_SDK, LIVE_MODE_TO_SDK, SDK_MODE_TO_PICKER]) {
      expect(Object.getPrototypeOf(t)).toBe(Object.prototype)
    }
  })
})

const MAIN_DIR = path.resolve(__dirname, '../../../00_Source/main')
describe('표를 정의하는 곳은 permissionModes.ts 하나다 (M05 G11)', () => {
  it.each(['04_Claude/runArgs.ts', '04_Claude/run/claudeAgentRun.ts', '04_Claude/stream/claudeStream.ts', '01_Ipc/handlers/agent.ts'])(
    '%s에는 표 정의가 없다',
    (rel) => {
      const src = fs.readFileSync(path.join(MAIN_DIR, rel), 'utf8')
      expect(src).not.toMatch(/const (MODE_TO_PERMISSION|LIVE_MODE_PICKER_TO_SDK|SDK_MODE_TO_PICKER|LIVE_MODE_WHITELIST)\b/)
      expect(src).toMatch(/from '(\.\.?\/)+permissionModes'|from '@main\/04_Claude\/permissionModes'/)
    },
  )
})

describe('시작 시 매핑 — buildQueryOptions (runArgs)', () => {
  it.each([
    ['normal', 'default'],
    ['plan', 'plan'],
    ['acceptEdits', 'acceptEdits'],
    ['auto', 'acceptEdits'],
    ['bypass', 'bypassPermissions'],
  ])('%s → %s', (mode, sdk) => {
    expect(buildQueryOptions({ mode }).permissionMode).toBe(sdk)
  })

  it.each(['default', 'bypassPermissions', 'dontAsk', ''])('표에 없는 %j는 permissionMode를 넣지 않는다', (mode) => {
    expect('permissionMode' in buildQueryOptions({ mode })).toBe(false)
  })

  it("끝 사례: 'constructor'는 일반 객체 조회라 프로토타입 함수가 들어간다(지금 동작)", () => {
    expect(typeof buildQueryOptions({ mode: 'constructor' }).permissionMode).toBe('function')
  })
})

function mkDone(): unknown {
  return {
    type: 'result', subtype: 'success', is_error: false, duration_ms: 1, duration_api_ms: 1, num_turns: 1,
    result: 't', stop_reason: 'end_turn', total_cost_usd: 0,
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {}, permission_denials: [], errors: [], uuid: 'u-1', session_id: 's-1',
  }
}

function setModeQuery(calls: unknown[]): QueryFn {
  return (p) => {
    const gen = (async function* () {
      const it = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      if ((await it.next()).done) return
      yield mkDone()
      await it.next()
    })()
    return Object.assign(gen, { setPermissionMode: (m: unknown): void => { calls.push(m) } })
  }
}

describe('실행 중 매핑 — ClaudeAgentRun.setPermissionMode', () => {
  it("normal→default · plan→plan · acceptEdits→acceptEdits · auto→auto, bypass와 SDK 이름은 거부, 'constructor'는 함수가 간다", async () => {
    const calls: unknown[] = []
    const run = new ClaudeCodeBackend(setModeQuery(calls)).start({
      messages: [{ role: 'user', content: 'x' }],
      persistent: true,
      mode: 'normal',
    }) as AgentRun & { setPermissionMode: (m: string) => void }
    for await (const e of run.events) {
      if (e.type === 'done') {
        for (const m of ['normal', 'plan', 'acceptEdits', 'auto', 'bypass', 'default', 'bypassPermissions', '', 'constructor']) {
          run.setPermissionMode(m)
        }
        run.abort()
      }
    }
    expect(calls.slice(0, 4)).toEqual(['default', 'plan', 'acceptEdits', 'auto'])
    expect(calls).toHaveLength(5)
    expect(typeof calls[4]).toBe('function')
  })
})

describe('역매핑 — status.permissionMode → permission_mode (claudeStream)', () => {
  const modeOf = (permissionMode: unknown): unknown[] =>
    mapClaudeStreamLine({ type: 'system', subtype: 'status', status: null, permissionMode })
      .filter((e) => e.type === 'permission_mode')
      .map((e) => (e as { mode: unknown }).mode)

  it.each([
    ['default', 'normal'],
    ['plan', 'plan'],
    ['acceptEdits', 'acceptEdits'],
    ['auto', 'auto'],
    ['bypassPermissions', 'bypass'],
  ])('%s → %s', (sdk, picker) => {
    expect(modeOf(sdk)).toEqual([picker])
  })

  it.each(['normal', 'bypass', 'dontAsk', '', 42, undefined])('표에 없는 %j는 방출하지 않는다', (v) => {
    expect(modeOf(v)).toEqual([])
  })

  it("끝 사례: 'constructor'는 프로토타입 함수가 picker id로 방출된다(지금 동작)", () => {
    const out = modeOf('constructor')
    expect(out).toHaveLength(1)
    expect(typeof out[0]).toBe('function')
  })
})

describe('화이트리스트 — 실물 AGENT_SET_MODE 핸들러 (agent.ts)', () => {
  function setMode(mode: unknown): { ok: boolean; calls: Array<[string, string]> } {
    const calls: Array<[string, string]> = []
    h.handlers.clear()
    registerAgentHandlers({
      state: { win: null },
      runManager: { setMode: (runId: string, m: string) => { calls.push([runId, m]); return true } } as unknown as RunManager,
    })
    const fn = h.handlers.get(IPC_CHANNELS.AGENT_SET_MODE)
    if (!fn) throw new Error('AGENT_SET_MODE 핸들러가 등록되지 않았다')
    const res = fn({} as never, { runId: 'r1', mode }) as { ok: boolean }
    return { ok: res.ok, calls }
  }

  it('runId 검증이 모드 검증보다 먼저다 — runId가 없으면 허용 모드여도 ok:false', () => {
    h.handlers.clear()
    const calls: unknown[] = []
    registerAgentHandlers({
      state: { win: null },
      runManager: { setMode: (...a: unknown[]) => { calls.push(a); return true } } as unknown as RunManager,
    })
    const fn = h.handlers.get(IPC_CHANNELS.AGENT_SET_MODE)!
    expect(fn({} as never, { runId: '  ', mode: 'plan' })).toEqual({ ok: false })
    expect(calls).toEqual([])
  })

  it.each(['normal', 'plan', 'acceptEdits', 'auto'])('%s는 runManager.setMode에 그대로 간다', (mode) => {
    expect(setMode(mode)).toEqual({ ok: true, calls: [['r1', mode]] })
  })

  it.each(['bypass', 'default', 'bypassPermissions', 'constructor', 'toString', '', 42, undefined, null])(
    '%j는 ok:false이고 setMode를 부르지 않는다',
    (mode) => {
      expect(setMode(mode)).toEqual({ ok: false, calls: [] })
    },
  )
})
