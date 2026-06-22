import { describe, it, expect } from 'vitest'
import { IPC_CHANNELS } from '../../src/shared/ipc-contract'
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

  it('채널명은 dot-namespaced 규칙을 따른다', () => {
    for (const ch of Object.values(IPC_CHANNELS)) {
      expect(ch).toMatch(/^[a-z]+\.[a-z]+$/)
    }
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
      { type: 'done' },
      { type: 'error', message: 'boom' }
    ]
    expect(samples.map(summarize)).toEqual(['hi', 'bash', 'true', 'modify', 'done', 'boom'])
  })
})
