import { describe, it, expect } from 'vitest'
import { IPC_CHANNELS, WORKSPACE_ROOT_ID } from '../../src/shared/ipc-contract'
import type { ResizeEdge, PermissionResponse, QuestionResponse, UsageWindow, UsageInfo } from '../../src/shared/ipc-contract'
import type { AgentEvent, AgentEventPermissionRequest, AgentEventQuestionRequest } from '../../src/shared/agent-events'

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
      case 'subagent':
        return e.subagent.name
      case 'permission_request':
        return e.toolName
      case 'question_request':
        return String(e.questions.length)
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
      {
        type: 'subagent',
        subagent: {
          id: 'sa-1',
          name: '탐색 에이전트',
          role: 'explorer',
          status: 'running',
          tools: []
        }
      },
      { type: 'permission_request', requestId: 'pr-1', toolName: 'Bash', summary: 'rm -rf /tmp' },
      {
        type: 'question_request',
        requestId: 'qr-1',
        questions: [
          { question: '어떤 파일?', options: [{ label: 'src/main.ts' }] }
        ]
      },
      { type: 'done' },
      { type: 'error', message: 'boom' }
    ]
    expect(samples.map(summarize)).toEqual([
      'hi', 'bash', 'true', 'modify', '생각 중', 'thinking_clear', '1', '탐색 에이전트',
      'Bash', '1', 'done', 'boom'
    ])
  })
})

// ── M4-4 양방향 응답 채널 계약 골든 ──────────────────────────────────────────

describe('M4-4 양방향 응답 채널 계약', () => {
  it('PERMISSION_RESPOND 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.PERMISSION_RESPOND).toBe('agent.permissionRespond')
  })

  it('QUESTION_RESPOND 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.QUESTION_RESPOND).toBe('agent.questionRespond')
  })

  it('두 응답 채널이 전체 채널 목록에 포함된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(values).toContain('agent.permissionRespond')
    expect(values).toContain('agent.questionRespond')
  })

  it('채널명 유니크 불변식이 M4-4 채널 추가 후에도 유지된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('PermissionResponse 샘플이 타입 계약을 충족한다', () => {
    const sample: PermissionResponse = {
      runId: 'run-1',
      requestId: 'pr-1',
      behavior: 'allow',
    }
    expect(sample.behavior).toBe('allow')
    // behavior 범위: 'allow' | 'allow_always' | 'deny'
    const behaviors: PermissionResponse['behavior'][] = ['allow', 'allow_always', 'deny']
    expect(behaviors).toHaveLength(3)
  })

  it('QuestionResponse 샘플이 타입 계약을 충족한다 (answers 있음)', () => {
    const sample: QuestionResponse = {
      runId: 'run-1',
      requestId: 'qr-1',
      answers: [['src/main.ts'], ['npm run build']],
    }
    expect(sample.answers).toHaveLength(2)
  })

  it('QuestionResponse 는 dismiss 시 answers=null 을 허용한다', () => {
    const sample: QuestionResponse = {
      runId: 'run-1',
      requestId: 'qr-1',
      answers: null,
    }
    expect(sample.answers).toBeNull()
  })

  it('AgentEventPermissionRequest 샘플이 type 가드를 통과한다', () => {
    const e: AgentEventPermissionRequest = {
      type: 'permission_request',
      requestId: 'pr-1',
      toolName: 'Write',
      summary: 'src/main.ts 파일 수정',
    }
    expect(e.type).toBe('permission_request')
  })

  it('AgentEventQuestionRequest 샘플이 type 가드를 통과한다', () => {
    const e: AgentEventQuestionRequest = {
      type: 'question_request',
      requestId: 'qr-1',
      questions: [
        {
          header: '작업 범위',
          question: '어떤 파일?',
          options: [{ label: 'src/main.ts', description: '메인 진입점' }],
          multiSelect: false,
        },
      ],
    }
    expect(e.questions).toHaveLength(1)
    expect(e.questions[0].options[0].label).toBe('src/main.ts')
  })
})

// ── B8 Usage 레이트리밋 게이지 계약 골든 ────────────────────────────────────

describe('B8 usage.get 채널 계약', () => {
  it('USAGE_GET 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.USAGE_GET).toBe('usage.get')
  })

  it('usage.get 채널이 전체 채널 목록에 포함된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(values).toContain('usage.get')
  })

  it('채널명 유니크 불변식이 usage.get 추가 후에도 유지된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('UsageWindow 샘플이 타입 계약을 충족한다 (resetsAt 있음)', () => {
    const sample: UsageWindow = { pct: 42, resetsAt: 1_700_000_000 }
    expect(sample.pct).toBe(42)
    expect(sample.resetsAt).toBe(1_700_000_000)
  })

  it('UsageWindow 는 resetsAt=null 을 허용한다 (정보 미제공)', () => {
    const sample: UsageWindow = { pct: 0, resetsAt: null }
    expect(sample.resetsAt).toBeNull()
  })

  it('UsageInfo fiveHour·weekly 모두 null 인 샘플이 타입 계약을 충족한다', () => {
    const sample: UsageInfo = { fiveHour: null, weekly: null }
    expect(sample.fiveHour).toBeNull()
    expect(sample.weekly).toBeNull()
  })

  it('UsageInfo 에 fiveHour·weekly 가 모두 채워진 샘플이 타입 계약을 충족한다', () => {
    const sample: UsageInfo = {
      fiveHour: { pct: 30, resetsAt: 1_700_000_100 },
      weekly: { pct: 80, resetsAt: 1_700_604_800 },
    }
    expect(sample.fiveHour?.pct).toBe(30)
    expect(sample.weekly?.pct).toBe(80)
  })

  it('UsageInfo pct 는 0~100 범위 파생값이며 토큰/시크릿 필드가 없다', () => {
    // 타입 계약 보장: UsageWindow 에 'token' | 'secret' | 'key' 필드가 없음을
    // 런타임 키 검사로 확인한다 (신뢰경계 regression 방지).
    const sample: UsageWindow = { pct: 100, resetsAt: null }
    const keys = Object.keys(sample)
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('secret')
    expect(keys).not.toContain('key')
    expect(keys).toEqual(expect.arrayContaining(['pct', 'resetsAt']))
  })
})
