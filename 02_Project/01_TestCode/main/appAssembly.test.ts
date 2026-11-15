import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// M05 G11 4단계: 조립 지점을 `00_App` 하나로 모은다.
// 실물 모듈을 import해 소유자·인스턴스 수를 고정한다 — 조립 로직을 테스트 안에 복제하지 않는다.
// 팩토리는 importOriginal로 감싼 spy라 실제 인스턴스를 만들고, 몇 번 만들어졌는지만 센다.
const h = vi.hoisted(() => ({
  userData: '',
  conversationStores: [] as { close: () => void }[],
}))

vi.mock('electron', () => ({
  app: { getPath: () => h.userData, getAppPath: () => h.userData },
  ipcMain: { handle: (): void => {} },
  dialog: {},
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

// registry의 ClaudeCodeBackend는 queryFn을 주입받지 않으므로 기본 경로(getDefaultQueryFn)를 가짜 질의로 바꾼다.
// 가짜 질의는 받은 SDK 옵션을 실행마다 모은다.
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
} from '@main/00_App/context'
import { getBackend } from '@main/00_App/registry'

const MAIN_DIR = path.resolve(__dirname, '../../00_Source/main')
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
