import { describe, it, expect } from 'vitest'
import { IPC_CHANNELS, WORKSPACE_ROOT_ID } from '../../src/shared/ipc-contract'
import type { ResizeEdge } from '../../src/shared/ipc-contract'
import type { AgentEvent } from '../../src/shared/agent-events'

// Phase 02 계약 정합 골든 (reviewer 축7 권고).
// electron 의존(preload)을 import하지 않고 순수 계약만 검증 → node 환경 OK.

describe('ipc-contract', () => {
  it('채널명이 모두 유니크하다 (중복 라우팅 방지)', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('MVP 필수 채널이 모두 존재한다', () => {
    const expected = [
      'workspace.open',
      'workspace.tree',
      'agent.run',
      'agent.abort',
      'agent.event',
      'fs.diff',
      'conversation.load',
      'conversation.save'
    ]
    const values = Object.values(IPC_CHANNELS)
    for (const ch of expected) expect(values).toContain(ch)
  })

  it('채널명은 dot-namespaced 규칙을 따른다 (namespace.action, action은 camelCase 허용)', () => {
    // namespace = 소문자. action = camelCase 허용(다중어: maximizeToggle/dragStart/setBounds 등).
    for (const ch of Object.values(IPC_CHANNELS)) {
      expect(ch).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/)
    }
  })
})

// ── F1-b window-control 계약 골든 ───────────────────────────────────────────

describe('window-control 채널 계약', () => {
  it('윈도우 컨트롤 10채널 + WINDOW_STATE 이벤트가 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.WINDOW_MINIMIZE).toBe('window.minimize')
    expect(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE).toBe('window.maximizeToggle')
    expect(IPC_CHANNELS.WINDOW_CLOSE).toBe('window.close')
    expect(IPC_CHANNELS.WINDOW_IS_MAXIMIZED).toBe('window.isMaximized')
    expect(IPC_CHANNELS.WINDOW_GET_BOUNDS).toBe('window.getBounds')
    expect(IPC_CHANNELS.WINDOW_SET_BOUNDS).toBe('window.setBounds')
    expect(IPC_CHANNELS.WINDOW_DRAG_START).toBe('window.dragStart')
    expect(IPC_CHANNELS.WINDOW_DRAG_END).toBe('window.dragEnd')
    expect(IPC_CHANNELS.WINDOW_RESIZE_START).toBe('window.resizeStart')
    expect(IPC_CHANNELS.WINDOW_RESIZE_END).toBe('window.resizeEnd')
    expect(IPC_CHANNELS.WINDOW_STATE).toBe('window.state')
  })

  it('채널명 유니크 불변식이 window 채널 추가 후에도 유지된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('ResizeEdge 8방향이 타입으로 정의된다 (런타임 샘플 검증)', () => {
    const edges: ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
    expect(edges).toHaveLength(8)
  })
})

// ── M2-03 reference-folder 계약 골든 ────────────────────────────────────────

describe('reference-folder 채널 계약', () => {
  it('REFERENCE_ADD 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.REFERENCE_ADD).toBe('reference.add')
  })

  it('REFERENCE_LIST 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.REFERENCE_LIST).toBe('reference.list')
  })

  it('REFERENCE_TREE 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.REFERENCE_TREE).toBe('reference.tree')
  })

  it('WORKSPACE_ROOT_ID 는 "workspace" 고정 상수다', () => {
    expect(WORKSPACE_ROOT_ID).toBe('workspace')
  })

  it('reference 채널명 3개가 전체 채널 목록에 포함된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(values).toContain('reference.add')
    expect(values).toContain('reference.list')
    expect(values).toContain('reference.tree')
  })

  it('채널명 유니크 불변식이 reference 채널 추가 후에도 유지된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('AgentEvent 망라', () => {
  // 컴파일 타임 exhaustiveness — 새 variant 추가 시 default에서 타입 에러로 누락 감지.
  function summarize(e: AgentEvent): string {
    switch (e.type) {
      case 'text':
        return e.delta
      case 'tool_call':
        return e.name
      case 'tool_result':
        return String(e.ok)
      case 'file_changed':
        return e.change
      case 'thinking':
        return e.text
      case 'thinking_clear':
        return 'thinking_clear'
      case 'todos':
        return String(e.todos.length)
      case 'done':
        return 'done'
      case 'error':
        return e.message
      default: {
        const _exhaustive: never = e
        return _exhaustive
      }
    }
  }

  it('각 variant를 런타임에서 처리한다', () => {
    const samples: AgentEvent[] = [
      { type: 'text', delta: 'hi' },
      { type: 'tool_call', id: '1', name: 'bash', input: {} },
      { type: 'tool_result', id: '1', ok: true, output: null },
      { type: 'file_changed', path: 'a.ts', change: 'modify' },
      { type: 'thinking', text: '생각 중' },
      { type: 'thinking_clear' },
      { type: 'todos', todos: [{ id: '1', label: 'a', status: 'running' }] },
      { type: 'done' },
      { type: 'error', message: 'boom' }
    ]
    expect(samples.map(summarize)).toEqual([
      'hi', 'bash', 'true', 'modify', '생각 중', 'thinking_clear', '1', 'done', 'boom'
    ])
  })
})
