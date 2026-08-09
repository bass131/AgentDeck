import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { ClaudeCodeBackend } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'
import type { AgentEventFileChanged } from '../../../02_Project/00_Source/shared/agentEvents'
import type { DiffLine } from '../../../02_Project/00_Source/shared/diffTypes'

function mkResultSuccess() {
  return {
    type: 'result' as const,
    subtype: 'success' as const,
    is_error: false,
    usage: { input_tokens: 10, output_tokens: 5 },
    modelUsage: {},
    errors: []
  }
}

function mkAssistantToolUse(id: string, name: string, input: Record<string, unknown>) {
  return {
    type: 'assistant' as const,
    message: {
      role: 'assistant' as const,
      content: [{ type: 'tool_use', id, name, input }]
    },
    parent_tool_use_id: null
  }
}

function mkToolResult(toolUseId: string, isError = false) {
  return {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          is_error: isError,
          content: isError ? [{ type: 'text', text: 'Error occurred' }] : [{ type: 'text', text: 'ok' }]
        }
      ]
    },
    parent_tool_use_id: null
  }
}

function makeMockQueryFn(messages: unknown[]): QueryFn {
  return async function* mockQuery(params: { prompt: string; options?: unknown }) {
    const opts = params.options as { abortController?: AbortController } | undefined
    for (const msg of messages) {
      if (opts?.abortController?.signal.aborted) return
      yield msg
    }
  }
}

describe('ClaudeCodeBackend file_changed emit (F2 fix)', () => {
  describe('1. Write tool_use + 성공 tool_result → file_changed 1건', () => {
    it('Write 성공 → file_changed {path:a.txt, change:add|modify} 1건 emit', async () => {
      const toolId = 'toolu_write_001'
      const messages = [
        mkAssistantToolUse(toolId, 'Write', { file_path: 'a.txt', content: 'hello' }),
        mkToolResult(toolId, false),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'write file' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fileChangedEvents = events.filter((e): e is AgentEventFileChanged => e.type === 'file_changed')
      expect(fileChangedEvents).toHaveLength(1)
      expect(fileChangedEvents[0].path).toBe('a.txt')
      expect(['add', 'modify']).toContain(fileChangedEvents[0].change)
    })

    it('Write 성공 → file_changed 이벤트는 마지막(done) 전에 emit된다', async () => {
      const toolId = 'toolu_write_002'
      const messages = [
        mkAssistantToolUse(toolId, 'Write', { file_path: 'b.txt', content: 'world' }),
        mkToolResult(toolId, false),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'write' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fcIdx = events.findIndex(e => e.type === 'file_changed')
      const doneIdx = events.findIndex(e => e.type === 'done')
      expect(fcIdx).toBeGreaterThanOrEqual(0)
      expect(doneIdx).toBeGreaterThan(fcIdx)
    })
  })

  describe('2. Edit tool_use + 성공 tool_result → file_changed{modify}', () => {
    it('Edit 성공 → file_changed{path:b.ts, change:modify} 1건', async () => {
      const toolId = 'toolu_edit_001'
      const messages = [
        mkAssistantToolUse(toolId, 'Edit', { file_path: 'b.ts', old_string: 'old', new_string: 'new' }),
        mkToolResult(toolId, false),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'edit file' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fileChangedEvents = events.filter((e): e is AgentEventFileChanged => e.type === 'file_changed')
      expect(fileChangedEvents).toHaveLength(1)
      expect(fileChangedEvents[0].path).toBe('b.ts')
      expect(fileChangedEvents[0].change).toBe('modify')
    })
  })

  describe('3. MultiEdit tool_use + 성공 tool_result → file_changed{modify}', () => {
    it('MultiEdit 성공 → file_changed{path:c.ts, change:modify} 1건', async () => {
      const toolId = 'toolu_multiedit_001'
      const messages = [
        mkAssistantToolUse(toolId, 'MultiEdit', {
          file_path: 'c.ts',
          edits: [{ old_string: 'a', new_string: 'b' }]
        }),
        mkToolResult(toolId, false),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'multiedit' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fileChangedEvents = events.filter((e): e is AgentEventFileChanged => e.type === 'file_changed')
      expect(fileChangedEvents).toHaveLength(1)
      expect(fileChangedEvents[0].path).toBe('c.ts')
      expect(fileChangedEvents[0].change).toBe('modify')
    })
  })

  describe('4. NotebookEdit tool_use + 성공 tool_result → file_changed{modify}', () => {
    it('NotebookEdit 성공 → file_changed{path:notebook.ipynb, change:modify} 1건', async () => {
      const toolId = 'toolu_nbkedit_001'
      const messages = [
        mkAssistantToolUse(toolId, 'NotebookEdit', {
          notebook_path: 'notebook.ipynb',
          cell_type: 'code',
          source: 'print("hello")'
        }),
        mkToolResult(toolId, false),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'notebook edit' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fileChangedEvents = events.filter((e): e is AgentEventFileChanged => e.type === 'file_changed')
      expect(fileChangedEvents).toHaveLength(1)
      expect(fileChangedEvents[0].path).toBe('notebook.ipynb')
      expect(fileChangedEvents[0].change).toBe('modify')
    })
  })

  describe('5. 실패 케이스: tool_result is_error:true → file_changed 미emit', () => {
    it('Edit + is_error:true → file_changed 0건 (유령 마커 없음)', async () => {
      const toolId = 'toolu_edit_fail_001'
      const messages = [
        mkAssistantToolUse(toolId, 'Edit', { file_path: 'fail.ts', old_string: 'x', new_string: 'y' }),
        mkToolResult(toolId, true),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'edit fail' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fileChangedEvents = events.filter(e => e.type === 'file_changed')
      expect(fileChangedEvents).toHaveLength(0)
    })

    it('Write + is_error:true → file_changed 0건 (유령 마커 없음)', async () => {
      const toolId = 'toolu_write_fail_001'
      const messages = [
        mkAssistantToolUse(toolId, 'Write', { file_path: 'fail_write.ts', content: 'bad' }),
        mkToolResult(toolId, true),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'write fail' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fileChangedEvents = events.filter(e => e.type === 'file_changed')
      expect(fileChangedEvents).toHaveLength(0)
    })
  })

  describe('6. 비변경 도구(Read/Bash/Glob) → file_changed 0 (회귀)', () => {
    it('Read tool_use + 성공 tool_result → file_changed 0건', async () => {
      const toolId = 'toolu_read_001'
      const messages = [
        mkAssistantToolUse(toolId, 'Read', { file_path: 'src/main.ts' }),
        mkToolResult(toolId, false),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'read' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      expect(events.filter(e => e.type === 'file_changed')).toHaveLength(0)
    })

    it('Bash tool_use + 성공 tool_result → file_changed 0건', async () => {
      const toolId = 'toolu_bash_001'
      const messages = [
        mkAssistantToolUse(toolId, 'Bash', { command: 'ls -la' }),
        mkToolResult(toolId, false),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'bash' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      expect(events.filter(e => e.type === 'file_changed')).toHaveLength(0)
    })

    it('Glob tool_use + 성공 tool_result → file_changed 0건', async () => {
      const toolId = 'toolu_glob_001'
      const messages = [
        mkAssistantToolUse(toolId, 'Glob', { pattern: '**/*.ts' }),
        mkToolResult(toolId, false),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'glob' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      expect(events.filter(e => e.type === 'file_changed')).toHaveLength(0)
    })
  })

  describe('7. 여러 도구 혼합 → 변경 도구만 file_changed', () => {
    it('Read+Write+Edit 순서 → Write·Edit file_changed만 2건', async () => {
      const readId = 'toolu_read_x'
      const writeId = 'toolu_write_x'
      const editId = 'toolu_edit_x'

      const messages = [
        mkAssistantToolUse(readId, 'Read', { file_path: 'src/a.ts' }),
        mkToolResult(readId, false),
        mkAssistantToolUse(writeId, 'Write', { file_path: 'out/b.ts', content: 'new content' }),
        mkToolResult(writeId, false),
        mkAssistantToolUse(editId, 'Edit', { file_path: 'src/c.ts', old_string: 'old', new_string: 'new' }),
        mkToolResult(editId, false),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'mixed ops' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fcEvents = events.filter((e): e is AgentEventFileChanged => e.type === 'file_changed')
      expect(fcEvents).toHaveLength(2)
      const paths = fcEvents.map(e => e.path)
      expect(paths).toContain('out/b.ts')
      expect(paths).toContain('src/c.ts')
      expect(paths).not.toContain('src/a.ts')
    })

    it('Edit 성공 + Write 실패 → Edit만 file_changed', async () => {
      const editId = 'toolu_edit_ok'
      const writeId = 'toolu_write_fail'

      const messages = [
        mkAssistantToolUse(editId, 'Edit', { file_path: 'ok.ts', old_string: 'a', new_string: 'b' }),
        mkToolResult(editId, false),
        mkAssistantToolUse(writeId, 'Write', { file_path: 'fail.ts', content: 'bad' }),
        mkToolResult(writeId, true),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'edit ok write fail' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fcEvents = events.filter((e): e is AgentEventFileChanged => e.type === 'file_changed')
      expect(fcEvents).toHaveLength(1)
      expect(fcEvents[0].path).toBe('ok.ts')
    })
  })

  describe('8. path 추출 방어 — file_path / path / notebook_path 순 폴백', () => {
    it('input.path 키를 가진 도구(fallback) → path 추출 성공', async () => {
      const toolId = 'toolu_fallback_001'
      const messages = [
        mkAssistantToolUse(toolId, 'Write', { path: 'fallback.ts', content: 'data' }),
        mkToolResult(toolId, false),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'fallback test' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fcEvents = events.filter((e): e is AgentEventFileChanged => e.type === 'file_changed')
      expect(fcEvents).toHaveLength(1)
      expect(fcEvents[0].path).toBe('fallback.ts')
    })

    it('path 키 없음 → file_changed 미emit (방어: 경로 불명은 skip)', async () => {
      const toolId = 'toolu_nopath_001'
      const messages = [
        mkAssistantToolUse(toolId, 'Write', { content: 'data_only_no_path' }),
        mkToolResult(toolId, false),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'no path' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fcEvents = events.filter(e => e.type === 'file_changed')
      expect(fcEvents).toHaveLength(0)
    })
  })

  describe('9. 경로 정규화 — 절대경로를 워크스페이스 상대 POSIX로 emit', () => {
    function absPath(...segments: string[]): string {
      return join(tmpdir(), ...segments)
    }

    it('절대경로 + workspaceRoot → 상대 POSIX 경로로 emit', async () => {
      const root = absPath('ws-test-001')
      const absFilePath = join(root, 'GENERATED.md')
      const toolId = 'toolu_abs_001'

      const messages = [
        mkAssistantToolUse(toolId, 'Write', { file_path: absFilePath, content: 'hello' }),
        mkToolResult(toolId, false),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({
        messages: [{ role: 'user', content: 'write abs' }],
        workspaceRoot: root
      })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fcEvents = events.filter((e): e is AgentEventFileChanged => e.type === 'file_changed')
      expect(fcEvents).toHaveLength(1)
      expect(fcEvents[0].path).toBe('GENERATED.md')
      expect(fcEvents[0].path).not.toContain(sep === '\\' ? '\\' : '\0')
      expect(fcEvents[0].path.startsWith('/')).toBe(false)
    })

    it('절대경로 중첩 디렉토리 + workspaceRoot → 상대 POSIX 경로 (구분자 /)', async () => {
      const root = absPath('ws-test-002')
      const absFilePath = join(root, 'src', 'index.ts')
      const toolId = 'toolu_abs_nested_001'

      const messages = [
        mkAssistantToolUse(toolId, 'Edit', {
          file_path: absFilePath,
          old_string: 'a',
          new_string: 'b'
        }),
        mkToolResult(toolId, false),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({
        messages: [{ role: 'user', content: 'edit nested abs' }],
        workspaceRoot: root
      })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fcEvents = events.filter((e): e is AgentEventFileChanged => e.type === 'file_changed')
      expect(fcEvents).toHaveLength(1)
      expect(fcEvents[0].path).toBe('src/index.ts')
    })

    it('상대경로 + workspaceRoot → 상대경로 그대로 (POSIX)', async () => {
      const root = absPath('ws-test-003')
      const toolId = 'toolu_rel_001'

      const messages = [
        mkAssistantToolUse(toolId, 'Write', { file_path: 'src/a.ts', content: 'code' }),
        mkToolResult(toolId, false),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({
        messages: [{ role: 'user', content: 'write relative' }],
        workspaceRoot: root
      })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fcEvents = events.filter((e): e is AgentEventFileChanged => e.type === 'file_changed')
      expect(fcEvents).toHaveLength(1)
      expect(fcEvents[0].path).toBe('src/a.ts')
    })

    it('워크스페이스 밖 절대경로 → file_changed 무방출 (S5 컨테인먼트로 거동 변경, P15 R1)', async () => {
      const root = absPath('ws-test-004')
      const outsidePath = join(tmpdir(), 'outside', 'x.txt')
      const toolId = 'toolu_outside_001'

      const messages = [
        mkAssistantToolUse(toolId, 'Write', { file_path: outsidePath, content: 'data' }),
        mkToolResult(toolId, false),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({
        messages: [{ role: 'user', content: 'write outside' }],
        workspaceRoot: root
      })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fcEvents = events.filter((e): e is AgentEventFileChanged => e.type === 'file_changed')
      expect(fcEvents).toEqual([])
    })

    it('workspaceRoot 없음 → rawPath 그대로 (폴백)', async () => {
      const toolId = 'toolu_noroot_001'

      const messages = [
        mkAssistantToolUse(toolId, 'Write', { file_path: 'out/result.ts', content: 'x' }),
        mkToolResult(toolId, false),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({
        messages: [{ role: 'user', content: 'no root' }]
      })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fcEvents = events.filter((e): e is AgentEventFileChanged => e.type === 'file_changed')
      expect(fcEvents).toHaveLength(1)
      expect(fcEvents[0].path).toBe('out/result.ts')
    })
  })

  describe('10. 기존 이벤트 순서 회귀 — file_changed가 흐름을 깨지 않음 (F2 회귀)', () => {
    it('Write 포함 전체 시나리오에서 text/tool_call/tool_result/file_changed/done 순서 정상', async () => {
      const toolId = 'toolu_write_full'
      const messages = [
        {
          type: 'assistant' as const,
          message: {
            role: 'assistant' as const,
            content: [
              { type: 'text', text: 'Writing file now.' },
              { type: 'tool_use', id: toolId, name: 'Write', input: { file_path: 'new.ts', content: 'content' } }
            ]
          },
          parent_tool_use_id: null
        },
        mkToolResult(toolId, false),
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'full flow' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const types = events.map(e => e.type)
      const textIdx = types.indexOf('text')
      const toolCallIdx = types.indexOf('tool_call')
      const fileChangedIdx = types.indexOf('file_changed')
      const toolResultIdx = types.indexOf('tool_result')
      const doneIdx = types.indexOf('done')

      expect(textIdx).toBeGreaterThanOrEqual(0)
      expect(toolCallIdx).toBeGreaterThan(textIdx)
      expect(fileChangedIdx).toBeGreaterThan(toolCallIdx)
      expect(toolResultIdx).toBeGreaterThan(toolCallIdx)
      expect(doneIdx).toBeGreaterThan(fileChangedIdx)
      expect(doneIdx).toBeGreaterThan(toolResultIdx)
    })
  })
})

const PHASE_B_TMP_BASE = join(tmpdir(), 'agentdeck-phase-b-diff-test')

function makePhaseBQueryFn(messages: unknown[]): QueryFn {
  return async function* mockQuery(params: { prompt: string; options?: unknown }) {
    const opts = params.options as { abortController?: AbortController } | undefined
    for (const msg of messages) {
      if (opts?.abortController?.signal.aborted) return
      yield msg
    }
  }
}

function mkPhBToolUse(id: string, name: string, input: Record<string, unknown>) {
  return {
    type: 'assistant' as const,
    message: { role: 'assistant' as const, content: [{ type: 'tool_use', id, name, input }] },
    parent_tool_use_id: null
  }
}

function mkPhBToolResult(toolUseId: string, isError = false) {
  return {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseId,
        is_error: isError,
        content: [{ type: 'text', text: isError ? 'Error' : 'ok' }]
      }]
    },
    parent_tool_use_id: null
  }
}

function mkPhBResult() {
  return { type: 'result' as const, subtype: 'success' as const, is_error: false, usage: { input_tokens: 1, output_tokens: 1 }, modelUsage: {}, errors: [] }
}

describe('Phase B — whole-file diff 계산 (file_changed.diff/add/del)', () => {
  afterEach(() => {
    try { rmSync(PHASE_B_TMP_BASE, { recursive: true, force: true }) } catch { }
  })

  describe('B1. Write(신규 파일) → diff에 add 라인만, add>0, del=0', () => {
    it('Write로 새 파일 생성 시 file_changed에 diff(add 라인), add>0, del=0 포함', async () => {
      const newFileContent = 'const a = 1\nconst b = 2\n'
      mkdirSync(PHASE_B_TMP_BASE, { recursive: true })

      const toolId2 = 'toolu_phb_write_new2'
      const afterFilePath2 = join(PHASE_B_TMP_BASE, 'new-file-2.ts')

      const messagesWithFileCreation: unknown[] = [
        mkPhBToolUse(toolId2, 'Write', { file_path: afterFilePath2, content: newFileContent }),
        mkPhBToolResult(toolId2, false),
        mkPhBResult()
      ]

      const queryFnWithWrite: QueryFn = async function* (params) {
        const opts = params.options as { abortController?: AbortController } | undefined
        for (const msg of messagesWithFileCreation) {
          if (opts?.abortController?.signal.aborted) return
          const m = msg as { type: string }
          if (m.type === 'user') {
            mkdirSync(PHASE_B_TMP_BASE, { recursive: true })
            writeFileSync(afterFilePath2, newFileContent, 'utf8')
          }
          yield msg
        }
      }

      const backend = new ClaudeCodeBackend(queryFnWithWrite)
      const run = backend.start({
        messages: [{ role: 'user', content: 'write new file' }],
        workspaceRoot: PHASE_B_TMP_BASE
      })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fcEvents = events.filter((e): e is AgentEventFileChanged => e.type === 'file_changed')
      expect(fcEvents).toHaveLength(1)
      const fc = fcEvents[0]

      expect(fc.diff).toBeDefined()
      expect(Array.isArray(fc.diff)).toBe(true)

      const diffLines = fc.diff as DiffLine[]
      expect(diffLines.length).toBeGreaterThan(0)
      const removeLines = diffLines.filter(l => l.kind === 'remove')
      expect(removeLines).toHaveLength(0)
      const addLines = diffLines.filter(l => l.kind === 'add')
      expect(addLines.length).toBeGreaterThan(0)

      expect(fc.add).toBeGreaterThan(0)
      expect(fc.del).toBe(0)
    })
  })

  describe('B2. Edit(기존 파일) → diff에 변경 라인, add/del 정확', () => {
    it('Edit 성공 시 file_changed.diff에 변경 라인(add/remove), add/del 정확', async () => {
      const existingFilePath = join(PHASE_B_TMP_BASE, 'existing.ts')
      const baselineContent = 'const x = 1\nconst y = 2\nconst z = 3\n'
      const afterContent = 'const x = 1\nconst y = 999\nconst z = 3\n'

      mkdirSync(PHASE_B_TMP_BASE, { recursive: true })
      writeFileSync(existingFilePath, baselineContent, 'utf8')

      const toolId = 'toolu_phb_edit_001'
      const messages: unknown[] = [
        mkPhBToolUse(toolId, 'Edit', {
          file_path: existingFilePath,
          old_string: 'const y = 2',
          new_string: 'const y = 999'
        }),
        mkPhBToolResult(toolId, false),
        mkPhBResult()
      ]

      const queryFnWithEdit: QueryFn = async function* (params) {
        const opts = params.options as { abortController?: AbortController } | undefined
        for (const msg of messages) {
          if (opts?.abortController?.signal.aborted) return
          const m = msg as { type: string }
          if (m.type === 'user') {
            writeFileSync(existingFilePath, afterContent, 'utf8')
          }
          yield msg
        }
      }

      const backend = new ClaudeCodeBackend(queryFnWithEdit)
      const run = backend.start({
        messages: [{ role: 'user', content: 'edit existing' }],
        workspaceRoot: PHASE_B_TMP_BASE
      })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fcEvents = events.filter((e): e is AgentEventFileChanged => e.type === 'file_changed')
      expect(fcEvents).toHaveLength(1)
      const fc = fcEvents[0]

      expect(fc.diff).toBeDefined()
      const diffLines = fc.diff as DiffLine[]
      expect(diffLines.length).toBeGreaterThan(0)

      const removedLines = diffLines.filter(l => l.kind === 'remove')
      const addedLines = diffLines.filter(l => l.kind === 'add')
      expect(removedLines.length).toBeGreaterThan(0)
      expect(addedLines.length).toBeGreaterThan(0)

      expect(fc.add).toBe(1)
      expect(fc.del).toBe(1)

      expect(removedLines.some(l => l.content.includes('y = 2'))).toBe(true)
      expect(addedLines.some(l => l.content.includes('y = 999'))).toBe(true)
    })
  })

  describe('B3. 바이너리/대형 파일 가드 → diff 생략, path/change만 emit', () => {
    it('바이너리 파일(null byte 포함) → diff 생략, file_changed는 정상 emit', async () => {
      const binFilePath = join(PHASE_B_TMP_BASE, 'image.bin')
      mkdirSync(PHASE_B_TMP_BASE, { recursive: true })

      const toolId = 'toolu_phb_binary_001'
      const messages: unknown[] = [
        mkPhBToolUse(toolId, 'Write', { file_path: binFilePath, content: '' }),
        mkPhBToolResult(toolId, false),
        mkPhBResult()
      ]

      const queryFnWithBinary: QueryFn = async function* (params) {
        const opts = params.options as { abortController?: AbortController } | undefined
        for (const msg of messages) {
          if (opts?.abortController?.signal.aborted) return
          const m = msg as { type: string }
          if (m.type === 'user') {
            const buf = Buffer.alloc(100)
            buf[50] = 0
            writeFileSync(binFilePath, buf)
          }
          yield msg
        }
      }

      const backend = new ClaudeCodeBackend(queryFnWithBinary)
      const run = backend.start({
        messages: [{ role: 'user', content: 'write binary' }],
        workspaceRoot: PHASE_B_TMP_BASE
      })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fcEvents = events.filter((e): e is AgentEventFileChanged => e.type === 'file_changed')
      expect(fcEvents).toHaveLength(1)
      const fc = fcEvents[0]
      expect(fc.path).toBe('image.bin')

      expect(fc.diff).toBeUndefined()
      expect(fc.add).toBeUndefined()
      expect(fc.del).toBeUndefined()
    })

    it('대형 파일(MAX_DIFF_BYTES 초과) → diff 생략, file_changed는 정상 emit', async () => {
      const largeFilePath = join(PHASE_B_TMP_BASE, 'large.ts')
      mkdirSync(PHASE_B_TMP_BASE, { recursive: true })

      const toolId = 'toolu_phb_large_001'
      const messages: unknown[] = [
        mkPhBToolUse(toolId, 'Write', { file_path: largeFilePath, content: '' }),
        mkPhBToolResult(toolId, false),
        mkPhBResult()
      ]

      const queryFnWithLarge: QueryFn = async function* (params) {
        const opts = params.options as { abortController?: AbortController } | undefined
        for (const msg of messages) {
          if (opts?.abortController?.signal.aborted) return
          const m = msg as { type: string }
          if (m.type === 'user') {
            const line = 'x'.repeat(79) + '\n'
            const totalLines = Math.ceil(600000 / line.length) + 1
            const content = line.repeat(totalLines)
            writeFileSync(largeFilePath, content, 'utf8')
          }
          yield msg
        }
      }

      const backend = new ClaudeCodeBackend(queryFnWithLarge)
      const run = backend.start({
        messages: [{ role: 'user', content: 'write large' }],
        workspaceRoot: PHASE_B_TMP_BASE
      })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fcEvents = events.filter((e): e is AgentEventFileChanged => e.type === 'file_changed')
      expect(fcEvents).toHaveLength(1)
      const fc = fcEvents[0]
      expect(fc.path).toBe('large.ts')

      expect(fc.diff).toBeUndefined()
      expect(fc.add).toBeUndefined()
      expect(fc.del).toBeUndefined()
    })
  })

  describe('B4. 실패 tool_result → 미emit (F2 회귀 보존)', () => {
    it('Edit + is_error:true → file_changed 미emit (Phase B에서도 동일)', async () => {
      const existingFilePath = join(PHASE_B_TMP_BASE, 'edit-fail.ts')
      mkdirSync(PHASE_B_TMP_BASE, { recursive: true })
      writeFileSync(existingFilePath, 'original content\n', 'utf8')

      const toolId = 'toolu_phb_fail_001'
      const messages: unknown[] = [
        mkPhBToolUse(toolId, 'Edit', {
          file_path: existingFilePath,
          old_string: 'original',
          new_string: 'modified'
        }),
        mkPhBToolResult(toolId, true),
        mkPhBResult()
      ]

      const backend = new ClaudeCodeBackend(makePhaseBQueryFn(messages))
      const run = backend.start({
        messages: [{ role: 'user', content: 'edit fail' }],
        workspaceRoot: PHASE_B_TMP_BASE
      })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fcEvents = events.filter(e => e.type === 'file_changed')
      expect(fcEvents).toHaveLength(0)
    })
  })

  describe('B5. 비변경 도구(Read/Bash) → file_changed 0 (Phase B 회귀)', () => {
    it('Read + 성공 → file_changed 0 (Phase B에서도 동일)', async () => {
      const toolId = 'toolu_phb_read_001'
      const messages: unknown[] = [
        mkPhBToolUse(toolId, 'Read', { file_path: 'src/main.ts' }),
        mkPhBToolResult(toolId, false),
        mkPhBResult()
      ]

      const backend = new ClaudeCodeBackend(makePhaseBQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'read' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      expect(events.filter(e => e.type === 'file_changed')).toHaveLength(0)
    })
  })

  describe('B6. after 파일 읽기 실패 → diff 생략(graceful), file_changed는 emit', () => {
    it('tool_result 성공이지만 after 파일이 없음 → diff 미포함, path/change만 emit', async () => {
      const missingFilePath = join(PHASE_B_TMP_BASE, 'missing-after.ts')
      mkdirSync(PHASE_B_TMP_BASE, { recursive: true })

      const toolId = 'toolu_phb_missing_001'
      const messages: unknown[] = [
        mkPhBToolUse(toolId, 'Write', { file_path: missingFilePath, content: 'hello' }),
        mkPhBToolResult(toolId, false),
        mkPhBResult()
      ]

      const backend = new ClaudeCodeBackend(makePhaseBQueryFn(messages))
      const run = backend.start({
        messages: [{ role: 'user', content: 'missing after' }],
        workspaceRoot: PHASE_B_TMP_BASE
      })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      const fcEvents = events.filter((e): e is AgentEventFileChanged => e.type === 'file_changed')
      expect(fcEvents).toHaveLength(1)
      const fc = fcEvents[0]
      expect(fc.path).toBe('missing-after.ts')
      expect(fc.diff).toBeUndefined()
    })
  })
})
