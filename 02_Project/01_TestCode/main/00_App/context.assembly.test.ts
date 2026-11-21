import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 조립 로직을 시험 안에 복제하지 않으려고, 팩토리를 importOriginal로 감싼 spy로 두어 실제 인스턴스를 만들고 수만 센다.
const h = vi.hoisted(() => ({
  userData: '',
  conversationStores: [] as { close: () => void }[],
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  handleCalls: 0,
  powerEvents: [] as string[],
}))

vi.mock('electron', () => ({
  app: { getPath: () => h.userData, getAppPath: () => h.userData, getVersion: () => '0.0.0', isPackaged: false, setAppUserModelId: (): void => {} },
  ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown): void => { h.handleCalls++; h.handlers.set(ch, fn) } },
  dialog: {},
  powerMonitor: { on: (ev: string): void => { h.powerEvents.push(ev) } },
}))

vi.mock('@main/06_Sessions/store', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@main/06_Sessions/store')>()
  const { vi: v } = await import('vitest')
  return {
    ...orig,
    createConversationStore: v.fn((dir: string) => {
      const s = orig.createConversationStore(dir)
      v.spyOn(s, 'close')
      h.conversationStores.push(s)
      return s
    }),
  }
})

vi.mock('@main/11_Settings/skills', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@main/11_Settings/skills')>()
  const { vi: v } = await import('vitest')
  return {
    ...orig,
    createSkillsStore: v.fn((...a: Parameters<typeof orig.createSkillsStore>) => {
      const s = orig.createSkillsStore(...a)
      v.spyOn(s, 'disabledSkillOverrides')
      return s
    }),
  }
})

vi.mock('@main/11_Settings/mcp', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@main/11_Settings/mcp')>()
  const { vi: v } = await import('vitest')
  return {
    ...orig,
    createMcpStore: v.fn((...a: Parameters<typeof orig.createMcpStore>) => {
      const s = orig.createMcpStore(...a)
      v.spyOn(s, 'deniedMcpServers')
      return s
    }),
  }
})

// registry의 ClaudeCodeBackend는 queryFn을 주입받지 않으므로 기본 경로(getDefaultQueryFn)를 가짜 질의로 바꾼다
const q = vi.hoisted(() => ({ options: [] as Record<string, unknown>[] }))
vi.mock('@main/04_Claude/queryFn', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@main/04_Claude/queryFn')>()
  return {
    ...orig,
    getDefaultQueryFn: async () => async function* fakeQuery(params: { options?: unknown }) {
      q.options.push((params.options ?? {}) as Record<string, unknown>)
      yield {
        type: 'result', subtype: 'success', is_error: false, duration_ms: 1, duration_api_ms: 1, num_turns: 1,
        result: '', stop_reason: 'end_turn', total_cost_usd: 0,
        usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        modelUsage: {}, permission_denials: [], errors: [], uuid: 'uuid-g11', session_id: 'g11-session',
      }
    },
  }
})

import { createConversationStore } from '@main/06_Sessions/store'
import { createSkillsStore } from '@main/11_Settings/skills'
import { createMcpStore } from '@main/11_Settings/mcp'
import {
  initConversationStore,
  closeConversationStore,
  getStore,
  initStores,
  getSkillsStore,
  getMcpStore,
  ipcState,
  runManager,
} from '@main/00_App/context'
import { getBackend } from '@main/00_App/registry'
import { getLspManager } from '@main/09_Lsp/manager'
import { startApp, attachWindow, stopApp } from '@main/00_App/bootstrap'
import { IPC_CHANNELS } from '@shared/ipcContract'

const MAIN_DIR = path.resolve(__dirname, '../../../00_Source/main')
const fwd = (p: string): string => p.replace(/\\/g, '/')
function mainSources(dir = MAIN_DIR, acc: { rel: string; src: string }[] = []): { rel: string; src: string }[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) mainSources(full, acc)
    else if (e.name.endsWith('.ts')) acc.push({ rel: fwd(path.relative(MAIN_DIR, full)), src: fs.readFileSync(full, 'utf8') })
  }
  return acc
}
const callersOf = (re: RegExp): string[] => mainSources().filter((f) => re.test(f.src)).map((f) => f.rel)

beforeEach(() => {
  h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'g11-assembly-'))
})

afterEach(() => {
  fs.rmSync(h.userData, { recursive: true, force: true })
})

describe('ConversationStore — 소유자는 00_App 하나다 (M05 G11 4단계)', () => {
  it('만든 인스턴스를 00_App이 쥐고, 대화 핸들러가 읽는 getStore가 그 인스턴스를 돌려준다', () => {
    const before = vi.mocked(createConversationStore).mock.calls.length
    const dir = path.join(h.userData, 'chats')
    initConversationStore(dir)
    expect(vi.mocked(createConversationStore).mock.calls.length - before).toBe(1)
    expect(vi.mocked(createConversationStore).mock.calls.at(-1)).toEqual([dir])
    expect(getStore()).toBe(h.conversationStores.at(-1))
  })

  it('종료 정리는 쥔 인스턴스를 한 번 닫는다', () => {
    initConversationStore(path.join(h.userData, 'chats'))
    const s = h.conversationStores.at(-1)!
    closeConversationStore()
    expect(s.close).toHaveBeenCalledTimes(1)
  })

  it('생성이 throw하면 이전 상태를 바꾸지 않고 그대로 던진다(호출부가 잡아 기록한다)', () => {
    initConversationStore(path.join(h.userData, 'chats'))
    const kept = getStore()
    const blocker = path.join(h.userData, 'file')
    fs.writeFileSync(blocker, 'x')
    expect(() => initConversationStore(path.join(blocker, 'chats'))).toThrow()
    expect(getStore()).toBe(kept)
  })

  it('main 소스에서 ConversationStore를 만들고 쥐는 곳은 00_App/context.ts 하나다', () => {
    expect(callersOf(/\bcreateConversationStore\(/).filter((r) => r !== '06_Sessions/store.ts')).toEqual(['00_App/context.ts'])
    expect(callersOf(/\bsetStore\b/)).toEqual([])
    expect(callersOf(/let _store\b/)).toEqual(['00_App/context.ts'])
    // 진입점은 저장소를 알지 못한다 — 종료 정리도 00_App에 맡긴다
    expect(mainSources().find((f) => f.rel === 'index.ts')!.src).not.toMatch(/\bConversationStore\b|\bcreateConversationStore\b|_store\b/)
  })
})

describe('skills·MCP store — 같은 앱 수명에서 실행 두 번이 조립 지점의 인스턴스 하나를 쓴다 (M05 G11 4단계)', () => {
  let savedE2E: string | undefined
  beforeEach(() => {
    savedE2E = process.env.AGENTDECK_E2E
    delete process.env.AGENTDECK_E2E
    q.options.length = 0
    // 실행 옵션까지 실제 store 값이 닿는지 보려고 비활성 오버레이 파일을 둔다
    fs.writeFileSync(path.join(h.userData, 'skills-disabled.json'), JSON.stringify({ disabled: ['g11-skill'] }))
    fs.writeFileSync(path.join(h.userData, 'mcp-disabled.json'), JSON.stringify({ disabled: ['g11-mcp'] }))
  })
  afterEach(() => {
    if (savedE2E === undefined) delete process.env.AGENTDECK_E2E
    else process.env.AGENTDECK_E2E = savedE2E
  })

  async function runOnce(): Promise<void> {
    const run = getBackend('claude-code').start({ messages: [{ role: 'user', content: 'g11' }] })
    for await (const _ of run.events) { /* 끝까지 소비 */ }
  }

  it('store는 initStores에서 한 번씩만 만들어지고, 두 실행이 그 인스턴스를 읽는다', async () => {
    const skillsBefore = vi.mocked(createSkillsStore).mock.calls.length
    const mcpBefore = vi.mocked(createMcpStore).mock.calls.length
    initStores()
    const skills = getSkillsStore()!
    const mcp = getMcpStore()!
    expect(skills).toBe(vi.mocked(createSkillsStore).mock.results.at(-1)!.value)
    expect(mcp).toBe(vi.mocked(createMcpStore).mock.results.at(-1)!.value)

    await runOnce()
    await runOnce()

    expect(vi.mocked(createSkillsStore).mock.calls.length - skillsBefore).toBe(1)
    expect(vi.mocked(createMcpStore).mock.calls.length - mcpBefore).toBe(1)
    expect(skills.disabledSkillOverrides).toHaveBeenCalledTimes(2)
    expect(mcp.deniedMcpServers).toHaveBeenCalledTimes(2)
    expect(getSkillsStore()).toBe(skills)
    expect(getMcpStore()).toBe(mcp)

    expect(q.options).toHaveLength(2)
    for (const o of q.options) {
      expect((o.settings as Record<string, unknown>).skillOverrides).toEqual({ 'g11-skill': 'off' })
      expect((o.settings as Record<string, unknown>).deniedMcpServers).toEqual([{ serverName: 'g11-mcp' }])
    }
  })

  it('main 소스에서 skills·MCP store를 만드는 곳은 00_App/context.ts 하나다(04_Claude는 만들지 않는다)', () => {
    const defs = ['11_Settings/skills.ts', '11_Settings/mcp.ts']
    expect(callersOf(/\bcreateSkillsStore\(|\bcreateMcpStore\(/).filter((r) => !defs.includes(r))).toEqual(['00_App/context.ts'])
    expect(callersOf(/from '@main\/11_Settings\/(skills|mcp)'/).filter((r) => r.startsWith('04_Claude/'))).toEqual([])
  })
})

describe('기동·종료 배선 — 00_App/bootstrap 한 곳 (M05 G11 4단계)', () => {
  const calls = (fn: unknown): number => vi.mocked(fn as () => unknown).mock.calls.length
  // attachWindow는 모듈 수준 1회 가드라, 사례를 혼자 돌려도(-t) 조립된 상태에서 시작하게 한다
  const assembled = (): void => {
    if (!h.handlers.has(IPC_CHANNELS.WORKSPACE_OPEN)) attachWindow({ id: 0 } as never)
  }

  it('startApp은 대화 저장소만, 첫 attachWindow가 store·핸들러를 한 번 조립하고, 다음 창은 win만 바꾼다', () => {
    const conv0 = calls(createConversationStore)
    const skills0 = calls(createSkillsStore)
    h.handlers.clear()

    startApp()
    expect(calls(createConversationStore) - conv0).toBe(1)
    expect(vi.mocked(createConversationStore).mock.calls.at(-1)).toEqual([path.join(h.userData, 'chats')])
    expect(Object.keys(ipcState)).toEqual(['win'])
    expect(calls(createSkillsStore) - skills0).toBe(0)
    expect(h.handlers.size).toBe(0)

    const win1 = { id: 1 } as never
    attachWindow(win1)
    expect(ipcState.win).toBe(win1)
    expect(calls(createSkillsStore) - skills0).toBe(1)
    for (const ch of [IPC_CHANNELS.WORKSPACE_OPEN, IPC_CHANNELS.AGENT_RUN, IPC_CHANNELS.CONVERSATION_LOAD, IPC_CHANNELS.SKILL_LIST, IPC_CHANNELS.LSP_STATUS, IPC_CHANNELS.LOOP_OPEN, IPC_CHANNELS.LOOP_CLOSE]) {
      expect(h.handlers.has(ch)).toBe(true)
    }
    // 잠에서 깨면 한도 멈춤의 벽시계를 다시 본다
    expect(h.powerEvents).toEqual(['resume'])

    const win2 = { id: 2 } as never
    const handleCalls = h.handleCalls
    attachWindow(win2)
    expect(ipcState.win).toBe(win2)
    expect(h.handleCalls).toBe(handleCalls)
    expect(calls(createSkillsStore) - skills0).toBe(1)
    expect(calls(createConversationStore) - conv0).toBe(1)
  })

  it('settings 배선의 현재 루트는 roots를 읽는다(workspace.open 뒤 root 없는 skill 목록)', async () => {
    assembled()
    const open = h.handlers.get(IPC_CHANNELS.WORKSPACE_OPEN)!
    const skills = getSkillsStore()!
    const listSkills = vi.spyOn(skills, 'listSkills').mockReturnValue([])
    await open({}, { folderPath: h.userData })
    await h.handlers.get(IPC_CHANNELS.SKILL_LIST)!({}, {})
    expect(listSkills).toHaveBeenCalledWith(fwd(h.userData))
  })

  // 이 파일의 가짜 질의는 supportedModels()를 내지 않으므로 최소 목록으로 뜬다
  it('agent.listModels가 배선되고, 목록을 못 받으면 최소 목록(builtin)을 준다', async () => {
    assembled()
    const list = h.handlers.get(IPC_CHANNELS.AGENT_LIST_MODELS)!
    const res = (await list({})) as { source: string; models: unknown[] }
    expect(res.source).toBe('builtin')
    expect(res.models.length).toBe(4)
    expect(fs.existsSync(path.join(h.userData, 'model-list.json'))).toBe(false)
  })

  it('stopApp은 실행을 모두 닫고 LSP 서버를 끝내고 쥔 대화 저장소를 닫는다', () => {
    assembled()
    startApp()
    const s = h.conversationStores.at(-1)!
    const closeAll = vi.spyOn(runManager, 'closeAll')
    const disposeAll = vi.spyOn(getLspManager(), 'disposeAll')
    // 루프 구동자 닫기는 앱 종료를 막지 않으려고 기다리지 않는다
    expect(stopApp()).toBeUndefined()
    expect(closeAll).toHaveBeenCalledTimes(1)
    expect(disposeAll).toHaveBeenCalledTimes(1)
    expect(s.close).toHaveBeenCalledTimes(1)
  })

  it('loop.status는 조립된 구동자를 읽는다 — 열린 실행기가 없으면 closed', async () => {
    assembled()
    const status = h.handlers.get(IPC_CHANNELS.LOOP_STATUS)!
    const s = (await status({}, { cwd: h.userData })) as { phase: string; cwd: string }
    expect(s.phase).toBe('closed')
    expect(callersOf(/\bcreateLoopDriver\(/).filter((r) => r !== '05_Loop/loopDriver.ts')).toEqual(['00_App/bootstrap.ts'])
    const boot = mainSources().find((f) => f.rel === '00_App/bootstrap.ts')!.src
    expect(boot).toMatch(/closeAll\(\)/)
    expect(boot).toMatch(/void _loopDriver\.reopenLast\(\)/)
    expect(boot).toMatch(/join\(getUserDataDir\(\), 'loop'\)/)
    expect(boot).toMatch(/onMainState: \(v\) => pushMainState\(ipcState, v\)/)
    expect(boot).toMatch(/onSessionEvent: \(p\) => pushSessionEvent\(ipcState, p\)/)
    const mainRead = h.handlers.get(IPC_CHANNELS.LOOP_MAIN_READ)
    expect((await mainRead?.({}, { cwd: h.userData }) as { items: unknown[]; root: string | null }).items).toEqual([])
    expect(boot).toMatch(/void notifier\.observe\(s\)/)
    expect(callersOf(/\bcreateLoopNotifier\(/).filter((r) => r !== '05_Loop/loopNotifier.ts')).toEqual(['00_App/bootstrap.ts'])
    expect(boot).toMatch(/applyDevAppUserModelId\(app\)/)
    const alerts = h.handlers.get(IPC_CHANNELS.LOOP_ALERTS)
    expect(await alerts?.({}, undefined)).toEqual({ alerts: [] })
    const graph = h.handlers.get(IPC_CHANNELS.LOOP_GRAPH)
    expect(await graph?.({}, { cwd: h.userData })).toMatchObject({ ok: true, graph: { templateId: 'program-dev' } })
  })

  it('조립 팩토리(store·roots·runManager·LSP·백엔드)를 부르는 곳은 00_App 안뿐이다', () => {
    const FACTORY = /\b(create(Conversation|Prefs|Profile|Skills|Mcp|Commands)Store|createRootRegistry|createRunManager|initLspManager)\(|new (ClaudeCodeBackend|CodexBackend)\b/
    const outside = mainSources()
      .filter((f) => !f.rel.startsWith('00_App/'))
      // 정의 줄과 문자열 리터럴 안(오류 안내 문구)은 호출이 아니다
      .filter((f) => f.src.split('\n').some((line) => FACTORY.test(line.replace(/'[^']*'/g, "''")) && !/^\s*export function/.test(line)))
      .map((f) => f.rel)
    expect(outside).toEqual([])
  })

  it('01_Ipc는 받은 deps로 등록만 한다 — 00_App의 상태를 import하지 않고 1회 가드·store 초기화를 쥐지 않는다', () => {
    const ipc = mainSources().filter((f) => f.rel.startsWith('01_Ipc/'))
    expect(ipc.filter((f) => /00_App\/(context|bootstrap)'/.test(f.src)).map((f) => f.rel)).toEqual([])
    const index = ipc.find((f) => f.rel === '01_Ipc/index.ts')!.src
    expect(index).not.toMatch(/_registered|initStores|initLsp|ipcState/)
  })

  it('진입점 index.ts는 창 생성과 수명주기만 쥔다 — 01_Ipc를 직접 부르지 않고 조립은 00_App/bootstrap에 맡긴다', () => {
    const src = mainSources().find((f) => f.rel === 'index.ts')!.src
    const from = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1])
    expect(from.filter((s) => !['electron', 'path', './00_App/bootstrap', './00_App/context', './12_Window/zoom'].includes(s))).toEqual([])
    expect(src).toMatch(/\bstartApp\(\)/)
    expect(src).toMatch(/\battachWindow\(/)
    expect(src).toMatch(/\bstopApp\(\)/)
    // 창 생성은 수명주기(activate)와 같이 다니는 Electron 표면이라 진입점에 남는다
    expect(callersOf(/new BrowserWindow\(/)).toEqual(['index.ts'])
  })
})
