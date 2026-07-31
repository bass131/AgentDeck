import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import { CodexBackend } from '../../../02_Source/main/01_agents/CodexBackend'
import { EchoBackend } from '../../../02_Source/main/01_agents/EchoBackend'
import type { QueryFn } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'
import type { SlashCommandInfo } from '../../../02_Source/shared/ipcContract'

function makeMockQueryFnWithSupportedCommands(
  commands: Array<{ name: string; description: string; argumentHint?: string }>
): QueryFn {
  const queryFn: QueryFn = function(params: { prompt: string; options?: unknown }) {
    const opts = params.options as { abortController?: AbortController } | undefined

    const iterable = (async function* gen() {
      if (opts?.abortController?.signal.aborted) return
      yield {
        type: 'result' as const,
        subtype: 'success' as const,
        is_error: false,
        duration_ms: 10,
        duration_api_ms: 8,
        num_turns: 1,
        result: 'Done',
        stop_reason: 'end_turn',
        total_cost_usd: 0,
        usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        modelUsage: {},
        permission_denials: [],
        errors: [],
        uuid: 'uuid-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
        session_id: 'test-session',
      }
    })()

    ;(iterable as unknown as Record<string, unknown>)['supportedCommands'] = async () => commands

    return iterable as AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
  }

  return queryFn
}

function makeSimpleQueryFn(): QueryFn {
  return async function* (_params) {
    yield {
      type: 'result' as const,
      subtype: 'success' as const,
      is_error: false,
      duration_ms: 10,
      duration_api_ms: 8,
      num_turns: 1,
      result: 'Done',
      stop_reason: 'end_turn',
      total_cost_usd: 0,
      usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      modelUsage: {},
      permission_denials: [],
      errors: [],
      uuid: 'uuid-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
      session_id: 'test-session',
    }
  }
}

function makeThrowingCommandsQueryFn(): QueryFn {
  return function(_params: { prompt: string; options?: unknown }) {
    const iterable = (async function* gen() {
      yield {
        type: 'result' as const,
        subtype: 'success' as const,
        is_error: false,
        duration_ms: 10,
        duration_api_ms: 8,
        num_turns: 1,
        result: 'Done',
        stop_reason: 'end_turn',
        total_cost_usd: 0,
        usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        modelUsage: {},
        permission_denials: [],
        errors: [],
        uuid: 'uuid-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
        session_id: 'test-session',
      }
    })()

    ;(iterable as unknown as Record<string, unknown>)['supportedCommands'] = async () => {
      throw new Error('supportedCommands failed')
    }

    return iterable as AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
  }
}

async function drainRun(backend: ClaudeCodeBackend, ws?: string): Promise<AgentEvent[]> {
  const run = backend.start({
    messages: [{ role: 'user', content: 'test' }],
    workspaceRoot: ws
  })
  const events: AgentEvent[] = []
  for await (const ev of run.events) {
    events.push(ev)
  }
  return events
}

async function waitCapture(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 20))
}

describe('ADR-019 A: 캡처 전 listSupportedCommands → []', () => {
  it('run 시작 전에는 빈 배열을 반환한다', () => {
    const backend = new ClaudeCodeBackend(makeSimpleQueryFn())
    const result = backend.listSupportedCommands('/some/workspace')
    expect(result).toEqual([])
  })

  it('workspaceRoot 미전달시에도 빈 배열 반환 (graceful)', () => {
    const backend = new ClaudeCodeBackend(makeSimpleQueryFn())
    expect(backend.listSupportedCommands()).toEqual([])
    expect(backend.listSupportedCommands(null)).toEqual([])
    expect(backend.listSupportedCommands(undefined)).toEqual([])
  })
})

describe('ADR-019 B: run 후 supportedCommands 캡처 → SlashCommandInfo[] 매핑', () => {
  it('config·context 2개 커맨드가 올바르게 매핑된다', async () => {
    const queryFn = makeMockQueryFnWithSupportedCommands([
      { name: 'config', description: 'Configure settings', argumentHint: '' },
      { name: 'context', description: 'Add context files', argumentHint: '[x]' },
    ])

    const backend = new ClaudeCodeBackend(queryFn)
    await drainRun(backend, '/ws/proj')
    await waitCapture()

    const cmds = backend.listSupportedCommands('/ws/proj')
    expect(cmds).toHaveLength(2)

    const config = cmds.find((c) => c.name === 'config')
    expect(config).toBeDefined()
    expect(config!.description).toBe('Configure settings')
    expect(config!.scope).toBe('builtin')
    expect(config!.argHint).toBeUndefined()

    const context = cmds.find((c) => c.name === 'context')
    expect(context).toBeDefined()
    expect(context!.argHint).toBe('[x]')
    expect(context!.scope).toBe('builtin')
  })

  it('빈 supportedCommands 배열 → listSupportedCommands []', async () => {
    const queryFn = makeMockQueryFnWithSupportedCommands([])
    const backend = new ClaudeCodeBackend(queryFn)
    await drainRun(backend, '/ws/empty')
    await waitCapture()

    const cmds = backend.listSupportedCommands('/ws/empty')
    expect(cmds).toEqual([])
  })

  it('scope는 항상 builtin이다', async () => {
    const queryFn = makeMockQueryFnWithSupportedCommands([
      { name: 'compact', description: 'Compact conversation', argumentHint: undefined },
      { name: 'help', description: 'Show help' },
    ])

    const backend = new ClaudeCodeBackend(queryFn)
    await drainRun(backend, '/ws/scope')
    await waitCapture()

    const cmds = backend.listSupportedCommands('/ws/scope')
    expect(cmds.every((c) => c.scope === 'builtin')).toBe(true)
  })
})

describe('ADR-019 C: supportedCommands 없음/throw → graceful (run 정상, [] 반환)', () => {
  it('supportedCommands 메서드가 없으면 run이 정상 완료되고 []를 반환한다', async () => {
    const backend = new ClaudeCodeBackend(makeSimpleQueryFn())
    const events = await drainRun(backend, '/ws/no-cmds')
    await waitCapture()

    expect(events.some((e) => e.type === 'error')).toBe(false)
    expect(events.at(-1)?.type).toBe('done')

    expect(backend.listSupportedCommands('/ws/no-cmds')).toEqual([])
  })

  it('supportedCommands가 throw해도 run이 정상 완료되고 []를 반환한다', async () => {
    const backend = new ClaudeCodeBackend(makeThrowingCommandsQueryFn())
    const events = await drainRun(backend, '/ws/throw-cmds')
    await waitCapture()

    expect(events.at(-1)?.type).toBe('done')

    expect(backend.listSupportedCommands('/ws/throw-cmds')).toEqual([])
  })
})

describe('ADR-019 D: description 길이 cap(200자)·개행 제거', () => {
  it('200자 초과 description은 200자 이내로 잘린다', async () => {
    const longDesc = 'A'.repeat(300)
    const queryFn = makeMockQueryFnWithSupportedCommands([
      { name: 'long', description: longDesc },
    ])

    const backend = new ClaudeCodeBackend(queryFn)
    await drainRun(backend, '/ws/cap')
    await waitCapture()

    const cmds = backend.listSupportedCommands('/ws/cap')
    expect(cmds).toHaveLength(1)
    expect(cmds[0].description.length).toBeLessThanOrEqual(200)
  })

  it('개행 문자가 제거된다', async () => {
    const queryFn = makeMockQueryFnWithSupportedCommands([
      { name: 'multiline', description: 'First line\nSecond line\r\nThird line' },
    ])

    const backend = new ClaudeCodeBackend(queryFn)
    await drainRun(backend, '/ws/newline')
    await waitCapture()

    const cmds = backend.listSupportedCommands('/ws/newline')
    expect(cmds).toHaveLength(1)
    expect(cmds[0].description).not.toContain('\n')
    expect(cmds[0].description).not.toContain('\r')
  })

  it('200자 이내 description은 그대로 유지된다', async () => {
    const desc = 'Short description'
    const queryFn = makeMockQueryFnWithSupportedCommands([
      { name: 'short', description: desc },
    ])

    const backend = new ClaudeCodeBackend(queryFn)
    await drainRun(backend, '/ws/short')
    await waitCapture()

    const cmds = backend.listSupportedCommands('/ws/short')
    expect(cmds[0].description).toBe(desc)
  })
})

describe('ADR-019 E: 워크스페이스별 캐시 분리', () => {
  it('ws=/a 캡처가 ws=/b 조회에 섞이지 않는다', async () => {
    const queryFn = makeMockQueryFnWithSupportedCommands([
      { name: 'compact', description: 'Compact' },
    ])

    const backend = new ClaudeCodeBackend(queryFn)

    await drainRun(backend, '/workspace/a')
    await waitCapture()

    expect(backend.listSupportedCommands('/workspace/a')).toHaveLength(1)

    expect(backend.listSupportedCommands('/workspace/b')).toEqual([])
  })

  it('서로 다른 ws에서 run하면 각자 독립 캐시를 갖는다', async () => {
    const cmdA = [{ name: 'alpha', description: 'Alpha command' }]
    const cmdB = [{ name: 'beta', description: 'Beta command' }, { name: 'gamma', description: 'Gamma' }]

    const backend = new ClaudeCodeBackend(makeMockQueryFnWithSupportedCommands(cmdA))
    const backend2 = new ClaudeCodeBackend(makeMockQueryFnWithSupportedCommands(cmdB))

    await drainRun(backend, '/ws/alpha')
    await drainRun(backend2, '/ws/beta')
    await waitCapture()

    expect(backend.listSupportedCommands('/ws/alpha')).toHaveLength(1)
    expect(backend.listSupportedCommands('/ws/alpha')[0].name).toBe('alpha')

    expect(backend2.listSupportedCommands('/ws/beta')).toHaveLength(2)
  })

  it('workspaceRoot=null/undefined는 빈 문자열 키로 통합 관리된다', async () => {
    const queryFn = makeMockQueryFnWithSupportedCommands([
      { name: 'init', description: 'Initialize' },
    ])

    const backend = new ClaudeCodeBackend(queryFn)

    await drainRun(backend, undefined)
    await waitCapture()

    expect(backend.listSupportedCommands(null)).toHaveLength(1)
    expect(backend.listSupportedCommands(undefined)).toHaveLength(1)
    expect(backend.listSupportedCommands()).toHaveLength(1)
  })
})

describe('ADR-019 F: Codex/Echo listSupportedCommands → []', () => {
  it('CodexBackend.listSupportedCommands()가 []를 반환한다', () => {
    const backend = new CodexBackend()
    expect(backend.listSupportedCommands()).toEqual([])
    expect(backend.listSupportedCommands('/any/ws')).toEqual([])
  })

  it('EchoBackend.listSupportedCommands()가 []를 반환한다', () => {
    const backend = new EchoBackend()
    expect(backend.listSupportedCommands()).toEqual([])
    expect(backend.listSupportedCommands('/any/ws')).toEqual([])
  })
})

describe('ADR-019 G: 기존 회귀 없음 + fire-and-forget 비블록 확인', () => {
  it('supportedCommands가 늦게 resolve해도 스트림을 블록하지 않는다', async () => {
    const slowCmds = new Promise<Array<{ name: string; description: string }>>((r) =>
      setTimeout(() => r([{ name: 'slow', description: 'Slow command' }]), 100)
    )

    const slowQueryFn: QueryFn = function(_params) {
      const iterable = (async function* gen() {
        yield {
          type: 'result' as const,
          subtype: 'success' as const,
          is_error: false,
          duration_ms: 10,
          duration_api_ms: 8,
          num_turns: 1,
          result: 'Done',
          stop_reason: 'end_turn',
          total_cost_usd: 0,
          usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          modelUsage: {},
          permission_denials: [],
          errors: [],
          uuid: 'uuid-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
          session_id: 'test-session',
        }
      })()

      ;(iterable as unknown as Record<string, unknown>)['supportedCommands'] = () => slowCmds

      return iterable as AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
    }

    const backend = new ClaudeCodeBackend(slowQueryFn)

    const start = Date.now()
    const events = await drainRun(backend, '/ws/slow')
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(90)
    expect(events.at(-1)?.type).toBe('done')

    await new Promise<void>((r) => setTimeout(r, 150))
    const cmds = backend.listSupportedCommands('/ws/slow')
    expect(cmds).toHaveLength(1)
    expect(cmds[0].name).toBe('slow')
  })

  it('기존 text→tool_call→tool_result→done 스트림이 정상 동작한다 (회귀 없음)', async () => {
    const toolId = 'toolu_001'
    const queryFn: QueryFn = async function* (_params) {
      yield {
        type: 'assistant' as const,
        message: {
          id: 'msg_001',
          type: 'message' as const,
          role: 'assistant' as const,
          content: [
            { type: 'text', text: 'Hello from regression test' },
            { type: 'tool_use', id: toolId, name: 'Read', input: { file_path: 'test.ts' } }
          ],
          model: 'claude-haiku-4-5-20251001',
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 }
        },
        parent_tool_use_id: null,
        uuid: 'uuid-asst-0000' as `${string}-${string}-${string}-${string}-${string}`,
        session_id: 'test',
      }
      yield {
        type: 'user' as const,
        message: {
          role: 'user' as const,
          content: [{ type: 'tool_result', tool_use_id: toolId, is_error: false, content: 'file content' }]
        },
        parent_tool_use_id: null,
        uuid: 'uuid-user-0000' as `${string}-${string}-${string}-${string}-${string}`,
        session_id: 'test',
      }
      yield {
        type: 'result' as const,
        subtype: 'success' as const,
        is_error: false,
        duration_ms: 10,
        duration_api_ms: 8,
        num_turns: 1,
        result: 'Done',
        stop_reason: 'end_turn',
        total_cost_usd: 0,
        usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        modelUsage: {},
        permission_denials: [],
        errors: [],
        uuid: 'uuid-rslt-0000' as `${string}-${string}-${string}-${string}-${string}`,
        session_id: 'test',
      }
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const events = await drainRun(backend, '/ws/regression')

    expect(events.some((e) => e.type === 'text')).toBe(true)
    expect(events.some((e) => e.type === 'tool_call')).toBe(true)
    expect(events.some((e) => e.type === 'tool_result')).toBe(true)
    expect(events.at(-1)?.type).toBe('done')
    expect(events.some((e) => e.type === 'error')).toBe(false)
  })
})

describe('ADR-019 H: AgentBackend 인터페이스 완전성 — listSupportedCommands 필수', () => {
  it('AgentBackend 인터페이스에 listSupportedCommands가 존재한다 (소스 확인)', async () => {
    const fs = await import('node:fs')
    const src = fs.readFileSync(
      '02_Source/main/01_agents/AgentBackend.ts',
      'utf8'
    )
    expect(src).toContain('listSupportedCommands')
  })

  it('ClaudeCodeBackend가 listSupportedCommands를 구현한다', () => {
    const backend = new ClaudeCodeBackend(makeSimpleQueryFn())
    expect(typeof backend.listSupportedCommands).toBe('function')
  })

  it('CodexBackend가 listSupportedCommands를 구현한다', () => {
    const backend = new CodexBackend()
    expect(typeof backend.listSupportedCommands).toBe('function')
  })

  it('EchoBackend가 listSupportedCommands를 구현한다', () => {
    const backend = new EchoBackend()
    expect(typeof backend.listSupportedCommands).toBe('function')
  })
})

describe('ADR-019 J: 지속세션(persistent) 펌프도 supportedCommands 캡처', () => {
  async function drainPersistent(backend: ClaudeCodeBackend, ws: string, sessionKey: string): Promise<void> {
    const run = backend.start({
      messages: [{ role: 'user', content: 'hi' }],
      workspaceRoot: ws,
      persistent: true,
      sessionKey,
    })
    for await (const _ of run.events) { void _ }
  }

  it('persistent run에서도 /loop·config가 캡처되어 listSupportedCommands에 나온다', async () => {
    const queryFn = makeMockQueryFnWithSupportedCommands([
      { name: 'loop', description: 'Loop a prompt until done' },
      { name: 'config', description: 'Configure settings' },
    ])
    const backend = new ClaudeCodeBackend(queryFn)
    await drainPersistent(backend, '/ws/repl', 'conv-repl-1')
    await waitCapture()

    const cmds = backend.listSupportedCommands('/ws/repl')
    expect(cmds.some((c) => c.name === 'loop')).toBe(true)
    expect(cmds.some((c) => c.name === 'config')).toBe(true)
  })

  it('persistent 캡처도 scope=builtin·신뢰경계(name/description/argHint만)', async () => {
    const queryFn = makeMockQueryFnWithSupportedCommands([
      { name: 'loop', description: 'Loop', argumentHint: '[prompt]' },
    ])
    const backend = new ClaudeCodeBackend(queryFn)
    await drainPersistent(backend, '/ws/repl2', 'conv-repl-2')
    await waitCapture()

    const cmds = backend.listSupportedCommands('/ws/repl2')
    const loop = cmds.find((c) => c.name === 'loop')
    expect(loop?.scope).toBe('builtin')
    expect(loop?.argHint).toBe('[prompt]')
  })
})

describe('ADR-019 I: SlashCommandInfo 타입 정합 (신뢰경계 자체 검증)', () => {
  it('반환된 SlashCommandInfo에 name/description/scope 필드만 존재한다 (path·secret 0)', async () => {
    const queryFn = makeMockQueryFnWithSupportedCommands([
      { name: 'review', description: 'Review changes', argumentHint: '[scope]' },
    ])

    const backend = new ClaudeCodeBackend(queryFn)
    await drainRun(backend, '/ws/fields')
    await waitCapture()

    const cmds = backend.listSupportedCommands('/ws/fields')
    expect(cmds).toHaveLength(1)

    const cmd: SlashCommandInfo = cmds[0]

    expect(typeof cmd.name).toBe('string')
    expect(typeof cmd.description).toBe('string')
    expect(cmd.scope).toBe('builtin')
    expect(cmd.argHint).toBe('[scope]')

    expect((cmd as unknown as Record<string, unknown>)['path']).toBeUndefined()
    expect((cmd as unknown as Record<string, unknown>)['content']).toBeUndefined()
    expect((cmd as unknown as Record<string, unknown>)['body']).toBeUndefined()
    expect((cmd as unknown as Record<string, unknown>)['secret']).toBeUndefined()
    expect((cmd as unknown as Record<string, unknown>)['env']).toBeUndefined()
  })

  it('description이 null/undefined인 경우 빈 문자열로 대체된다', async () => {
    const queryFn = makeMockQueryFnWithSupportedCommands([
      { name: 'nodesc', description: undefined as unknown as string },
    ])

    const backend = new ClaudeCodeBackend(queryFn)
    await drainRun(backend, '/ws/nodesc')
    await waitCapture()

    const cmds = backend.listSupportedCommands('/ws/nodesc')
    for (const cmd of cmds) {
      expect(typeof cmd.description).toBe('string')
    }
  })
})
