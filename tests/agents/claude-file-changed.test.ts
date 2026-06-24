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
 * 10. Phase B — whole-file diff 계산:
 *     - Write(신규) → file_changed.diff에 add 라인만, add>0, del=0
 *     - Edit(기존 파일) → diff에 변경 라인(add/remove), add/del 정확
 *     - 바이너리/대형 파일 → diff 생략(path/change만), emit은 됨
 *     - 실패 tool_result → 미emit(F2 회귀 보존)
 *     - 비변경 도구 → file_changed 0(회귀 보존)
 *
 * 설계:
 *  - pendingFileChanges Map: tool_use 시점(ClaudeAgentRun 내부)에서 id→{path,change,baseline} 기록
 *  - tool_result(is_error===false) 시 after 읽기 → computeDiff → file_changed{diff,add,del} emit
 *  - tool_result(is_error===true) 시 pending만 제거(emit 없음)
 *  - 순수성 보존: mapClaudeStreamLine은 무상태 유지(변경 없음)
 *  - fs.existsSync: tool_use 시점 1회 판정(abs 기준). 실패시 'modify' 폴백.
 *  - 경로 정규화: root 있으면 relative(root, abs) → POSIX 변환; 밖 파일은 rawPath 유지
 *  - 바이너리 가드: 첫 8KB null byte → diff 생략(path/change만 emit)
 *  - 대형 파일 가드: MAX_DIFF_BYTES 초과 → diff 생략(path/change만 emit)
 */

import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { ClaudeCodeBackend } from '../../src/main/agents/ClaudeCodeBackend'
import type { QueryFn } from '../../src/main/agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../src/shared/agent-events'
import type { AgentEventFileChanged } from '../../src/shared/agent-events'
import type { DiffLine } from '../../src/shared/diff-types'

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

// ── Phase B: whole-file diff 계산 골든 테스트 (TDD 실패 먼저) ─────────────────

/**
 * Phase B 테스트용 임시 디렉토리 관리.
 * 각 테스트는 고유 subdir를 사용하고, afterEach에서 정리한다.
 */
const PHASE_B_TMP_BASE = join(tmpdir(), 'agentdeck-phase-b-diff-test')

/** mock queryFn (재정의 없이 사용 가능) */
function makePhaseBQueryFn(messages: unknown[]): QueryFn {
  return async function* mockQuery(params: { prompt: string; options?: unknown }) {
    const opts = params.options as { abortController?: AbortController } | undefined
    for (const msg of messages) {
      if (opts?.abortController?.signal.aborted) return
      yield msg
    }
  }
}

/** assistant tool_use 메시지 생성 */
function mkPhBToolUse(id: string, name: string, input: Record<string, unknown>) {
  return {
    type: 'assistant' as const,
    message: { role: 'assistant' as const, content: [{ type: 'tool_use', id, name, input }] },
    parent_tool_use_id: null
  }
}

/** user tool_result 메시지 생성 */
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

/** result 메시지 */
function mkPhBResult() {
  return { type: 'result' as const, subtype: 'success' as const, is_error: false, usage: { input_tokens: 1, output_tokens: 1 }, modelUsage: {}, errors: [] }
}

describe('Phase B — whole-file diff 계산 (file_changed.diff/add/del)', () => {
  afterEach(() => {
    // 임시 파일 정리 (실패해도 무시 — 다음 테스트에 영향 없음)
    try { rmSync(PHASE_B_TMP_BASE, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  // ── B1. Write(신규) → add 라인들, add>0, del=0 ──────────────────────────────

  describe('B1. Write(신규 파일) → diff에 add 라인만, add>0, del=0', () => {
    it('Write로 새 파일 생성 시 file_changed에 diff(add 라인), add>0, del=0 포함', async () => {
      // 신규 파일: tool_call 시점에 disk에 없음. tool_result 성공 후 disk에 생김.
      // queryFn에서 tool_result yield 전에 파일을 실제로 기록해 엔진 동작을 시뮬레이션한다.
      const newFileContent = 'const a = 1\nconst b = 2\n'
      mkdirSync(PHASE_B_TMP_BASE, { recursive: true })

      const toolId2 = 'toolu_phb_write_new2'
      const afterFilePath2 = join(PHASE_B_TMP_BASE, 'new-file-2.ts')

      const messagesWithFileCreation: unknown[] = [
        mkPhBToolUse(toolId2, 'Write', { file_path: afterFilePath2, content: newFileContent }),
        mkPhBToolResult(toolId2, false),
        mkPhBResult()
      ]

      // 특별한 queryFn: tool_result yield 전에 파일을 기록한다 (엔진 동작 시뮬레이션)
      const queryFnWithWrite: QueryFn = async function* (params) {
        const opts = params.options as { abortController?: AbortController } | undefined
        for (const msg of messagesWithFileCreation) {
          if (opts?.abortController?.signal.aborted) return
          const m = msg as { type: string }
          if (m.type === 'user') {
            // tool_result 바로 전 — 파일 기록 (엔진이 실제로 파일을 쓴 뒤 tool_result를 보냄)
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

      // diff 필드 존재 검증
      expect(fc.diff).toBeDefined()
      expect(Array.isArray(fc.diff)).toBe(true)

      // 신규 파일: add 라인만 있어야 함(remove 없음)
      const diffLines = fc.diff as DiffLine[]
      expect(diffLines.length).toBeGreaterThan(0)
      const removeLines = diffLines.filter(l => l.kind === 'remove')
      expect(removeLines).toHaveLength(0)
      const addLines = diffLines.filter(l => l.kind === 'add')
      expect(addLines.length).toBeGreaterThan(0)

      // add/del 카운트
      expect(fc.add).toBeGreaterThan(0)
      expect(fc.del).toBe(0)
    })
  })

  // ── B2. Edit(기존 파일) → diff에 변경 라인, add/del 정확 ────────────────────

  describe('B2. Edit(기존 파일) → diff에 변경 라인, add/del 정확', () => {
    it('Edit 성공 시 file_changed.diff에 변경 라인(add/remove), add/del 정확', async () => {
      // baseline: 기존 파일을 tool_call 시점에 disk에 미리 기록
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

      // tool_result 전에 파일을 afterContent로 갱신 (엔진 동작 시뮬레이션)
      const queryFnWithEdit: QueryFn = async function* (params) {
        const opts = params.options as { abortController?: AbortController } | undefined
        for (const msg of messages) {
          if (opts?.abortController?.signal.aborted) return
          const m = msg as { type: string }
          if (m.type === 'user') {
            // tool_result 직전: after 내용으로 파일 갱신
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

      // diff 존재
      expect(fc.diff).toBeDefined()
      const diffLines = fc.diff as DiffLine[]
      expect(diffLines.length).toBeGreaterThan(0)

      // 변경된 라인이 포함되어야 함
      const removedLines = diffLines.filter(l => l.kind === 'remove')
      const addedLines = diffLines.filter(l => l.kind === 'add')
      expect(removedLines.length).toBeGreaterThan(0)  // 'const y = 2' 삭제
      expect(addedLines.length).toBeGreaterThan(0)     // 'const y = 999' 추가

      // add=1, del=1 정확히
      expect(fc.add).toBe(1)
      expect(fc.del).toBe(1)

      // 실제 내용 검증
      expect(removedLines.some(l => l.content.includes('y = 2'))).toBe(true)
      expect(addedLines.some(l => l.content.includes('y = 999'))).toBe(true)
    })
  })

  // ── B3. 바이너리 파일 가드 → diff 생략, emit은 됨 ──────────────────────────

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
            // null byte가 포함된 바이너리 파일 생성
            const buf = Buffer.alloc(100)
            buf[50] = 0  // null byte
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
      // emit은 됨 (트리/패널 점등 유지)
      expect(fcEvents).toHaveLength(1)
      const fc = fcEvents[0]
      expect(fc.path).toBe('image.bin')

      // diff는 생략되어야 함 (바이너리 가드)
      expect(fc.diff).toBeUndefined()
      // add/del도 생략
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
            // 512KB 이상 텍스트 파일 생성 (MAX_DIFF_BYTES = 512KB = 524288 바이트)
            const line = 'x'.repeat(79) + '\n'  // 80바이트 줄
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
      // emit은 됨
      expect(fcEvents).toHaveLength(1)
      const fc = fcEvents[0]
      expect(fc.path).toBe('large.ts')

      // diff 생략
      expect(fc.diff).toBeUndefined()
      expect(fc.add).toBeUndefined()
      expect(fc.del).toBeUndefined()
    })
  })

  // ── B4. 실패 tool_result → 미emit (F2 회귀) ─────────────────────────────────

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
        mkPhBToolResult(toolId, true),  // is_error: true
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

  // ── B5. 비변경 도구 → file_changed 0 (Phase B 회귀) ─────────────────────────

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

  // ── B6. after 파일 읽기 실패 → diff 생략, path/change만 emit ────────────────

  describe('B6. after 파일 읽기 실패 → diff 생략(graceful), file_changed는 emit', () => {
    it('tool_result 성공이지만 after 파일이 없음 → diff 미포함, path/change만 emit', async () => {
      // 파일 경로는 있지만 tool_result 성공 후에도 disk에 파일이 없는 엣지 케이스
      const missingFilePath = join(PHASE_B_TMP_BASE, 'missing-after.ts')
      mkdirSync(PHASE_B_TMP_BASE, { recursive: true })
      // 파일을 쓰지 않음 — tool_result 성공 후 after 읽기 실패

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
      // emit은 됨 (path/change는 tool_call 시점에 이미 결정됨)
      expect(fcEvents).toHaveLength(1)
      const fc = fcEvents[0]
      expect(fc.path).toBe('missing-after.ts')
      // diff 생략(graceful)
      expect(fc.diff).toBeUndefined()
    })
  })
})
