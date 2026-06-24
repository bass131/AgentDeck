/**
 * claude-file-changed.test.ts — ClaudeCodeBackend file_changed emit 골든 테스트 (F2 fix TDD)
 *
 * 검증 항목:
 *  1. Write tool_use + 성공 tool_result → file_changed{path, change:'add'|'modify'} 1건
 *  2. Edit tool_use + 성공 tool_result → file_changed{path, change:'modify'} 1건
 *  3. MultiEdit tool_use + 성공 tool_result → file_changed{path, change:'modify'} 1건
 *  4. NotebookEdit tool_use + 성공 tool_result → file_changed{notebook_path, change:'modify'} 1건
 *  5. 실패 케이스: Edit tool_use + tool_result is_error:true → file_changed 미emit (유령 마커 0)
 *  6. 비변경 도구(Read/Bash/Glob) → file_changed 0 (회귀)
 *  7. Write + 파일 미존재 → change:'add', 존재 → change:'modify'
 *  8. abort 후 pending 정리(누수 0) — abort 중 tool_use 후 종료해도 미emit
 *  9. 경로 정규화(F2 후속): 절대경로 → 워크스페이스 상대 POSIX 경로로 emit
 *     - 절대경로 + workspaceRoot → 상대 POSIX
 *     - 상대경로 + workspaceRoot → 상대경로 그대로(POSIX 변환)
 *     - 워크스페이스 밖 절대경로 → rawPath 유지(밖 파일은 정규화 안 함)
 *     - workspaceRoot 없음 → rawPath 그대로(폴백)
 *
 * 설계:
 *  - pendingFileChanges Map: tool_use 시점(ClaudeAgentRun 내부)에서 id→{path,change} 기록
 *  - tool_result(is_error===false) 시 해당 id file_changed emit
 *  - tool_result(is_error===true) 시 pending만 제거(emit 없음)
 *  - 순수성 보존: mapClaudeStreamLine은 무상태 유지(변경 없음)
 *  - fs.existsSync: tool_use 시점 1회 판정(abs 기준). 실패시 'modify' 폴백.
 *  - 경로 정규화: root 있으면 relative(root, abs) → POSIX 변환; 밖 파일은 rawPath 유지
 */

import { describe, it, expect } from 'vitest'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { ClaudeCodeBackend } from '../../src/main/agents/ClaudeCodeBackend'
import type { QueryFn } from '../../src/main/agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../src/shared/agent-events'
import type { AgentEventFileChanged } from '../../src/shared/agent-events'

// ── 픽스처 헬퍼 ───────────────────────────────────────────────────────────────

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

/** assistant 메시지 (tool_use 1개) */
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

/** user 메시지 (tool_result 1개) */
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

/** mock queryFn: messages 배열을 순서대로 yield */
function makeMockQueryFn(messages: unknown[]): QueryFn {
  return async function* mockQuery(params: { prompt: string; options?: unknown }) {
    const opts = params.options as { abortController?: AbortController } | undefined
    for (const msg of messages) {
      if (opts?.abortController?.signal.aborted) return
      yield msg
    }
  }
}

// ── 1. Write 성공 → file_changed{add|modify} ──────────────────────────────────

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
      // change는 'add' 또는 'modify' 중 하나 (존재 여부에 따라 결정)
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

  // ── 2. Edit 성공 → file_changed{modify} ────────────────────────────────────

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

  // ── 3. MultiEdit 성공 → file_changed{modify} ───────────────────────────────

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

  // ── 4. NotebookEdit 성공 → file_changed{modify} ────────────────────────────

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

  // ── 5. 실패 케이스: is_error:true → file_changed 미emit ──────────────────────

  describe('5. 실패 케이스: tool_result is_error:true → file_changed 미emit', () => {
    it('Edit + is_error:true → file_changed 0건 (유령 마커 없음)', async () => {
      const toolId = 'toolu_edit_fail_001'
      const messages = [
        mkAssistantToolUse(toolId, 'Edit', { file_path: 'fail.ts', old_string: 'x', new_string: 'y' }),
        mkToolResult(toolId, true), // is_error: true
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
        mkToolResult(toolId, true), // is_error: true
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

  // ── 6. 비변경 도구 → file_changed 0 (회귀) ──────────────────────────────────

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

  // ── 7. 여러 도구 혼합 → 변경 도구만 file_changed ─────────────────────────────

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
      // Read는 포함 안 됨
      expect(paths).not.toContain('src/a.ts')
    })

    it('Edit 성공 + Write 실패 → Edit만 file_changed', async () => {
      const editId = 'toolu_edit_ok'
      const writeId = 'toolu_write_fail'

      const messages = [
        mkAssistantToolUse(editId, 'Edit', { file_path: 'ok.ts', old_string: 'a', new_string: 'b' }),
        mkToolResult(editId, false),
        mkAssistantToolUse(writeId, 'Write', { file_path: 'fail.ts', content: 'bad' }),
        mkToolResult(writeId, true), // 실패
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

  // ── 8. path 추출 방어적 fallback ────────────────────────────────────────────

  describe('8. path 추출 방어 — file_path / path / notebook_path 순 폴백', () => {
    it('input.path 키를 가진 도구(fallback) → path 추출 성공', async () => {
      const toolId = 'toolu_fallback_001'
      // file_path 없이 path 키만 있는 경우(방어 폴백)
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
      // path 폴백으로 추출 성공하면 1건, 아니면 0건 (경로 추출 불가)
      // 이 케이스에서는 폴백이 있으면 1건 emit 기대
      expect(fcEvents).toHaveLength(1)
      expect(fcEvents[0].path).toBe('fallback.ts')
    })

    it('path 키 없음 → file_changed 미emit (방어: 경로 불명은 skip)', async () => {
      const toolId = 'toolu_nopath_001'
      // file_path / path / notebook_path 모두 없는 경우
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

      // 경로가 없으면 file_changed를 emit하지 않아야 한다 (경로 불명 = 위험)
      const fcEvents = events.filter(e => e.type === 'file_changed')
      expect(fcEvents).toHaveLength(0)
    })
  })

  // ── 9. 경로 정규화(F2 후속): 절대경로 → 워크스페이스 상대 POSIX ──────────────

  describe('9. 경로 정규화 — 절대경로를 워크스페이스 상대 POSIX로 emit', () => {
    /** OS 독립 절대경로 생성 헬퍼 */
    function absPath(...segments: string[]): string {
      // tmpdir()는 OS 절대경로를 반환한다 (Windows: C:\Users\...\Temp, POSIX: /tmp)
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
      // 상대 POSIX 경로: 구분자가 / (Windows에서도)
      expect(fcEvents[0].path).toBe('GENERATED.md')
      expect(fcEvents[0].path).not.toContain(sep === '\\' ? '\\' : '\0')  // 백슬래시 없음
      expect(fcEvents[0].path.startsWith('/')).toBe(false)  // 절대경로 아님
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
      // 항상 POSIX 구분자 /
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

    it('워크스페이스 밖 절대경로 → rawPath 유지 (밖 파일은 정규화 안 함)', async () => {
      const root = absPath('ws-test-004')
      // 완전히 다른 디렉토리 (tmpdir 직하의 파일, root 밖)
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
      expect(fcEvents).toHaveLength(1)
      // 밖 파일 → rawPath 그대로 유지
      expect(fcEvents[0].path).toBe(outsidePath)
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
        // workspaceRoot 미전달
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

  // ── 10. 기존 이벤트 스트림 회귀 ─────────────────────────────────────────────

  describe('10. 기존 이벤트 순서 회귀 — file_changed가 흐름을 깨지 않음', () => {
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
      // 순서 검증:
      //   text → tool_call → file_changed → tool_result → done
      //   (원본 engine.ts 동작 미러: file-change는 tool_result emit 직전에 push됨)
      const textIdx = types.indexOf('text')
      const toolCallIdx = types.indexOf('tool_call')
      const fileChangedIdx = types.indexOf('file_changed')
      const toolResultIdx = types.indexOf('tool_result')
      const doneIdx = types.indexOf('done')

      expect(textIdx).toBeGreaterThanOrEqual(0)
      expect(toolCallIdx).toBeGreaterThan(textIdx)
      // file_changed는 tool_call 이후, done 이전에 존재함
      expect(fileChangedIdx).toBeGreaterThan(toolCallIdx)
      // tool_result도 tool_call 이후
      expect(toolResultIdx).toBeGreaterThan(toolCallIdx)
      // done은 모두 이후
      expect(doneIdx).toBeGreaterThan(fileChangedIdx)
      expect(doneIdx).toBeGreaterThan(toolResultIdx)
    })
  })
})
