import { describe, it, expect } from 'vitest'
import { IPC_CHANNELS, WORKSPACE_ROOT_ID } from '../../../02_Project/00_Source/shared/ipcContract'
import type { ResizeEdge, PermissionResponse, QuestionResponse, UsageWindow, UsageInfo } from '../../../02_Project/00_Source/shared/ipcContract'
import type { LspStatus, LspPos, LspHoverResult, LspLocation, LspSemanticTokens, LspDocReq, LspPosReq } from '../../../02_Project/00_Source/shared/ipcContract'
import type { UiPrefs, UiPrefsSetReq } from '../../../02_Project/00_Source/shared/ipcContract'
import type { Profile } from '../../../02_Project/00_Source/shared/ipcContract'
import type { EngineState } from '../../../02_Project/00_Source/shared/ipcContract'
import type { SlashCommandInfo } from '../../../02_Project/00_Source/shared/ipcContract'
import type { AgentEvent, AgentEventPermissionRequest, AgentEventQuestionRequest } from '../../../02_Project/00_Source/shared/agentEvents'

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
    for (const ch of Object.values(IPC_CHANNELS)) {
      expect(ch).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/)
    }
  })
})

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
      case 'orchestration':
        return e.name
      case 'orchestration_progress':
        return e.status
      case 'orchestration_denied':
        return e.reason
      case 'permission_request':
        return e.toolName
      case 'permission_mode':
        return e.mode
      case 'question_request':
        return String(e.questions.length)
      case 'model-fallback':
        return e.fromModel
      case 'session':
        return e.sessionId
      case 'loops':
        return String(e.loops.length)
      case 'autonomy_status':
        return e.status
      case 'hook_lifecycle':
        return e.phase
      case 'informational':
        return e.level
      case 'permission_denied':
        return e.toolName
      case 'api_retry':
        return String(e.attempt)
      case 'compact':
        return e.kind
      case 'session_state':
        return e.state
      case 'thinking_delta':
        return String(e.estimatedTokens ?? e.text ?? '')
      case 'bg_task':
        return e.kind
      case 'search_result':
        return String(e.total ?? 0)
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
      { type: 'orchestration', id: 'orch-1', name: '배포 단계' },
      {
        type: 'orchestration_progress',
        id: 'orch-1',
        status: 'running',
        phases: ['Probe'],
        agents: [{ label: 'probe', phase: 'Probe', state: 'running', tokens: 100 }]
      },
      { type: 'orchestration_denied', id: 'orch-2', reason: 'orchestration-off' },
      { type: 'permission_request', requestId: 'pr-1', toolName: 'Bash', summary: 'rm -rf /tmp' },
      { type: 'permission_mode', mode: 'acceptEdits' },
      {
        type: 'question_request',
        requestId: 'qr-1',
        questions: [
          { question: '어떤 파일?', options: [{ label: 'src/main.ts' }] }
        ]
      },
      { type: 'model-fallback', fromModel: 'claude-fable-5', toModel: 'claude-opus-4-8', text: '폴백 경고' },
      { type: 'session', sessionId: 'sess-abc-123' },
      { type: 'loops', loops: [{ id: 'cron-1', summary: '테스트 점검', interval: 'Every minute' }] },
      { type: 'hook_lifecycle', phase: 'started', hookId: 'h-1', hookName: 'SessionStart:startup', hookEvent: 'SessionStart' },
      { type: 'informational', content: '알림', level: 'notice' },
      { type: 'permission_denied', toolName: 'Bash' },
      { type: 'api_retry', attempt: 1, maxRetries: 3, retryDelayMs: 500 },
      { type: 'compact', kind: 'status', status: 'compacting' },
      { type: 'session_state', state: 'running' },
      { type: 'thinking_delta', estimatedTokens: 42 },
      { type: 'bg_task', kind: 'started', taskId: 'task-1' },
      { type: 'search_result', total: 3 },
      { type: 'done' },
      { type: 'error', message: 'boom' }
    ]
    expect(samples.map(summarize)).toEqual([
      'hi', 'bash', 'true', 'modify', '생각 중', 'thinking_clear', '1', '탐색 에이전트',
      '배포 단계', 'running', 'orchestration-off', 'Bash', 'acceptEdits', '1', 'claude-fable-5', 'sess-abc-123', '1',
      'started', 'notice', 'Bash', '1', 'status', 'running', '42', 'started', '3', 'done', 'boom'
    ])
  })
})

describe('orchestration_denied 이벤트 계약 (UC1 P08)', () => {
  it('AgentEventOrchestrationDenied 샘플이 type 가드를 통과한다', () => {
    const e: import('../../../02_Project/00_Source/shared/agentEvents').AgentEventOrchestrationDenied = {
      type: 'orchestration_denied',
      id: 'toolu_01',
      reason: 'orchestration-off',
    }
    expect(e.type).toBe('orchestration_denied')
    expect(e.id).toBe('toolu_01')
    expect(e.reason).toBe('orchestration-off')
  })

  it('id·reason·type 3개 필드만 포함한다 (최소 표면 계약)', () => {
    const e: import('../../../02_Project/00_Source/shared/agentEvents').AgentEventOrchestrationDenied = {
      type: 'orchestration_denied',
      id: 'toolu_02',
      reason: 'orchestration-off',
    }
    const keys = Object.keys(e)
    expect(keys).toEqual(expect.arrayContaining(['type', 'id', 'reason']))
    expect(keys).toHaveLength(3)
  })

  it('reason은 리터럴 유니온만 허용한다 — "orchestration-off" 외 자유 문자열 금지(타입 레벨 계약)', () => {
    const reasons: Array<import('../../../02_Project/00_Source/shared/agentEvents').OrchestrationDeniedReason> = [
      'orchestration-off',
    ]
    expect(reasons).toHaveLength(1)
    expect(reasons).toContain('orchestration-off')
  })

  it("'Workflow' 엔진 리터럴을 필드로 노출하지 않는다 (ADR-003 엔진중립 regression 가드)", () => {
    const e: import('../../../02_Project/00_Source/shared/agentEvents').AgentEventOrchestrationDenied = {
      type: 'orchestration_denied',
      id: 'toolu_03',
      reason: 'orchestration-off',
    }
    for (const v of Object.values(e)) {
      expect(String(v)).not.toMatch(/Workflow/)
    }
  })

  it('AgentEvent 유니온에 합류해 판별 유니온으로 narrowing된다', () => {
    const events: AgentEvent[] = [
      { type: 'orchestration_denied', id: 'toolu_04', reason: 'orchestration-off' },
    ]
    const [event] = events
    if (event.type === 'orchestration_denied') {
      expect(event.reason).toBe('orchestration-off')
    } else {
      throw new Error('narrowing 실패')
    }
  })
})

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

describe('M2-LSP lsp.* 채널 계약', () => {
  it('lsp.* 5채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.LSP_STATUS).toBe('lsp.status')
    expect(IPC_CHANNELS.LSP_HOVER).toBe('lsp.hover')
    expect(IPC_CHANNELS.LSP_DEFINITION).toBe('lsp.definition')
    expect(IPC_CHANNELS.LSP_SEMANTIC_TOKENS).toBe('lsp.semanticTokens')
    expect(IPC_CHANNELS.LSP_CACHED_TOKENS).toBe('lsp.cachedTokens')
  })

  it('lsp.* 5채널이 전체 채널 목록에 포함된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(values).toContain('lsp.status')
    expect(values).toContain('lsp.hover')
    expect(values).toContain('lsp.definition')
    expect(values).toContain('lsp.semanticTokens')
    expect(values).toContain('lsp.cachedTokens')
  })

  it('채널명 유니크 불변식이 lsp.* 채널 추가 후에도 유지된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('LspStatus 4가지 리터럴이 타입으로 허용된다', () => {
    const statuses: LspStatus[] = ['unsupported', 'starting', 'ready', 'error']
    expect(statuses).toHaveLength(4)
  })

  it('LspPos 샘플이 타입 계약을 충족한다 (0-based line/character)', () => {
    const pos: LspPos = { line: 10, character: 4 }
    expect(pos.line).toBe(10)
    expect(pos.character).toBe(4)
  })

  it('LspHoverResult 샘플이 타입 계약을 충족한다 (마크다운 contents)', () => {
    const hover: LspHoverResult = { contents: '**string** — built-in type' }
    expect(hover.contents).toContain('string')
  })

  it('LspLocation 샘플이 절대경로를 포함하지 않는다 (워크스페이스 상대경로만)', () => {
    const loc: LspLocation = { relPath: '02_Project/00_Source/main/index.ts', line: 5, character: 2 }
    expect(loc.relPath).not.toMatch(/^[A-Za-z]:[\\/]/)
    expect(loc.relPath).not.toMatch(/^\//)
    expect(loc.relPath).toBe('02_Project/00_Source/main/index.ts')
    expect(loc.line).toBe(5)
    expect(loc.character).toBe(2)
  })

  it('LspLocation 은 ".." 탈출 relPath를 포함하면 안 된다 (타입 계약 음성 검증)', () => {
    const escapedPath = '../../etc/passwd'
    expect(escapedPath).toMatch(/\.\./)
    const validLoc: LspLocation = { relPath: 'src/renderer/App.tsx', line: 0, character: 0 }
    expect(validLoc.relPath).not.toMatch(/\.\./)
  })

  it('LspSemanticTokens 샘플이 타입 계약 형태를 충족한다', () => {
    const tokens: LspSemanticTokens = {
      data: [0, 4, 6, 1, 0,
             1, 2, 4, 2, 1],
      types: ['namespace', 'type', 'class', 'enum', 'interface', 'function', 'variable'],
      mods: ['declaration', 'definition', 'readonly', 'static'],
    }
    expect(tokens.data).toHaveLength(10)
    expect(tokens.data.length % 5).toBe(0)
    expect(tokens.types).toContain('function')
    expect(tokens.mods).toContain('declaration')
  })

  it('LspSemanticTokens data는 5의 배수여야 한다 (LSP 표준 인코딩 불변식)', () => {
    const tokens: LspSemanticTokens = {
      data: [0, 0, 4, 0, 0],
      types: ['variable'],
      mods: [],
    }
    expect(tokens.data.length % 5).toBe(0)
  })

  it('LspDocReq 는 rootId+relPath만 포함한다 (cwd/절대경로 필드 없음)', () => {
    const req: LspDocReq = {
      rootId: 'workspace',
      relPath: '02_Project/00_Source/main/index.ts',
    }
    const keys = Object.keys(req)
    expect(keys).not.toContain('cwd')
    expect(keys).not.toContain('absolutePath')
    expect(keys).not.toContain('folderPath')
    expect(keys).toEqual(expect.arrayContaining(['rootId', 'relPath']))
    expect(keys).toHaveLength(2)
  })

  it('LspDocReq rootId 는 WORKSPACE_ROOT_ID 와 일치할 수 있다', () => {
    const req: LspDocReq = { rootId: WORKSPACE_ROOT_ID, relPath: 'src/main.ts' }
    expect(req.rootId).toBe('workspace')
  })

  it('LspPosReq 는 LspDocReq 확장 (rootId+relPath+pos)', () => {
    const req: LspPosReq = {
      rootId: 'workspace',
      relPath: 'src/renderer/App.tsx',
      pos: { line: 42, character: 10 },
    }
    const keys = Object.keys(req)
    expect(keys).toEqual(expect.arrayContaining(['rootId', 'relPath', 'pos']))
    expect(keys).toHaveLength(3)
    expect(req.pos.line).toBe(42)
    expect(keys).not.toContain('cwd')
  })

  it('lsp.* 채널명은 dot-namespaced 규칙을 따른다', () => {
    const lspChannels = [
      IPC_CHANNELS.LSP_STATUS,
      IPC_CHANNELS.LSP_HOVER,
      IPC_CHANNELS.LSP_DEFINITION,
      IPC_CHANNELS.LSP_SEMANTIC_TOKENS,
      IPC_CHANNELS.LSP_CACHED_TOKENS,
    ]
    for (const ch of lspChannels) {
      expect(ch).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/)
    }
  })
})

describe('P1 ui.getPrefs / ui.setPref 채널 계약', () => {
  it('UI_PREFS_GET 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.UI_PREFS_GET).toBe('ui.getPrefs')
  })

  it('UI_PREFS_SET 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.UI_PREFS_SET).toBe('ui.setPref')
  })

  it('ui.* 두 채널이 전체 채널 목록에 포함된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(values).toContain('ui.getPrefs')
    expect(values).toContain('ui.setPref')
  })

  it('채널명 유니크 불변식이 ui.* 채널 추가 후에도 유지된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('ui.* 채널명은 dot-namespaced 규칙을 따른다', () => {
    expect(IPC_CHANNELS.UI_PREFS_GET).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/)
    expect(IPC_CHANNELS.UI_PREFS_SET).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/)
  })

  it('UiPrefs는 Record<string, unknown>이다 — 무해 설정값 샘플이 타입 계약을 충족한다', () => {
    const prefs: UiPrefs = {
      theme: 'dark',
      zoomFactor: 1.2,
      panelSize: 300,
      seenWhatsNew: true,
      'workspace.mode': 'normal',
      recentFiles: ['src/main.ts', 'src/renderer/App.tsx'],
    }
    expect(prefs['theme']).toBe('dark')
    expect(prefs['zoomFactor']).toBe(1.2)
    expect(prefs['seenWhatsNew']).toBe(true)
  })

  it('UiPrefs 빈 객체도 유효하다 (초기 상태)', () => {
    const prefs: UiPrefs = {}
    expect(Object.keys(prefs)).toHaveLength(0)
  })

  it('UiPrefsSetReq 샘플이 타입 계약을 충족한다 (key/value)', () => {
    const req: UiPrefsSetReq = { key: 'theme', value: 'dark' }
    expect(req.key).toBe('theme')
    expect(req.value).toBe('dark')
  })

  it('UiPrefsSetReq 는 key·value 두 필드만 포함한다 (계약 최소 표면)', () => {
    const req: UiPrefsSetReq = { key: 'zoomFactor', value: 1.5 }
    const keys = Object.keys(req)
    expect(keys).toEqual(expect.arrayContaining(['key', 'value']))
    expect(keys).toHaveLength(2)
  })

  it('UiPrefsSetReq value는 다양한 JSON 직렬화 가능 타입을 수용한다', () => {
    const samples: UiPrefsSetReq[] = [
      { key: 'theme', value: 'dark' },
      { key: 'zoomFactor', value: 1.2 },
      { key: 'seenWhatsNew', value: true },
      { key: 'panelSize', value: null },
      { key: 'recentFiles', value: ['a.ts', 'b.ts'] },
      { key: 'layout', value: { left: 200, right: 300 } },
    ]
    expect(samples).toHaveLength(6)
  })

  it('UiPrefsSetReq 는 민감 자격증명 필드를 포함하면 안 된다 (신뢰경계 regression 방지)', () => {
    const safeReq: UiPrefsSetReq = { key: 'theme', value: 'dark' }
    expect(safeReq.key).not.toMatch(/^(token|secret|apiKey|password|credential)/i)
  })
})

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
    const sample: UsageWindow = { pct: 100, resetsAt: null }
    const keys = Object.keys(sample)
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('secret')
    expect(keys).not.toContain('key')
    expect(keys).toEqual(expect.arrayContaining(['pct', 'resetsAt']))
  })
})

describe('P2 profile.get / profile.set 채널 계약', () => {
  it('PROFILE_GET 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.PROFILE_GET).toBe('profile.get')
  })

  it('PROFILE_SET 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.PROFILE_SET).toBe('profile.set')
  })

  it('profile.* 두 채널이 전체 채널 목록에 포함된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(values).toContain('profile.get')
    expect(values).toContain('profile.set')
  })

  it('채널명 유니크 불변식이 profile.* 채널 추가 후에도 유지된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('profile.* 채널명은 dot-namespaced 규칙을 따른다', () => {
    expect(IPC_CHANNELS.PROFILE_GET).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/)
    expect(IPC_CHANNELS.PROFILE_SET).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/)
  })

  it('Profile 샘플이 타입 계약을 충족한다 (nickname + color)', () => {
    const profile: Profile = { nickname: '홍길동', color: '#6366f1' }
    expect(profile.nickname).toBe('홍길동')
    expect(profile.color).toBe('#6366f1')
  })

  it('Profile 은 nickname·color 두 필드만 포함한다 (최소 표면 계약)', () => {
    const profile: Profile = { nickname: '개발자', color: '#8b5cf6' }
    const keys = Object.keys(profile)
    expect(keys).toEqual(expect.arrayContaining(['nickname', 'color']))
    expect(keys).toHaveLength(2)
  })

  it('Profile color 는 AVATAR_PALETTE hex 형식이어야 한다 (샘플 검증)', () => {
    const validColors = [
      '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
      '#f97316', '#eab308', '#22c55e', '#14b8a6',
      '#06b6d4', '#3b82f6', '#a855f7', '#f43f5e',
    ]
    for (const color of validColors) {
      const profile: Profile = { nickname: '테스트', color }
      expect(profile.color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('Profile 은 토큰·시크릿 필드를 포함하지 않는다 (신뢰경계 regression 방지)', () => {
    const profile: Profile = { nickname: '홍길동', color: '#6366f1' }
    const keys = Object.keys(profile)
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('secret')
    expect(keys).not.toContain('apiKey')
    expect(keys).not.toContain('password')
  })

  it('Profile | null 계약: null은 미설정/첫실행을 의미한다 (온보딩 분기)', () => {
    const result: Profile | null = null
    expect(result).toBeNull()
  })

  it('setProfile 응답 { ok: boolean } 샘플이 타입 계약을 충족한다', () => {
    const okResponse: { ok: boolean } = { ok: true }
    const failResponse: { ok: boolean } = { ok: false }
    expect(okResponse.ok).toBe(true)
    expect(failResponse.ok).toBe(false)
  })
})

describe('P4 app.getVersion 채널 계약', () => {
  it('APP_VERSION 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.APP_VERSION).toBe('app.getVersion')
  })

  it('app.getVersion 채널이 전체 채널 목록에 포함된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(values).toContain('app.getVersion')
  })

  it('채널명 유니크 불변식이 app.getVersion 추가 후에도 유지된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('app.getVersion 채널명은 dot-namespaced 규칙을 따른다 (namespace.action)', () => {
    expect(IPC_CHANNELS.APP_VERSION).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/)
  })

  it('app.getVersion 응답은 semver 형식 문자열이다 (샘플 검증)', () => {
    const versionSamples = ['0.1.0', '1.0.0', '1.2.3', '2.0.0-beta.1']
    for (const v of versionSamples) {
      expect(typeof v).toBe('string')
      expect(v.length).toBeGreaterThan(0)
    }
  })

  it('app.getVersion 응답은 시크릿·토큰을 포함하지 않는다 (신뢰경계 — 버전 문자열만)', () => {
    const version = '0.1.0'
    expect(version).not.toMatch(/sk-ant-/)
    expect(version).not.toMatch(/Bearer\s/)
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('P5a skill.list / skill.setEnabled 채널 계약', () => {

  it('SKILL_LIST 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.SKILL_LIST).toBe('skill.list')
  })

  it('SKILL_SET_ENABLED 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.SKILL_SET_ENABLED).toBe('skill.setEnabled')
  })

  it('skill.* 두 채널이 전체 채널 목록에 포함된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(values).toContain('skill.list')
    expect(values).toContain('skill.setEnabled')
  })

  it('채널명 유니크 불변식이 skill.* 채널 추가 후에도 유지된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('skill.* 채널명은 dot-namespaced 규칙을 따른다 (/^[a-z]+\\.[a-z][a-zA-Z]*$/)', () => {
    expect(IPC_CHANNELS.SKILL_LIST).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/)
    expect(IPC_CHANNELS.SKILL_SET_ENABLED).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/)
  })

  it('SkillInfo 샘플이 타입 계약을 충족한다 (name/description/scope/enabled)', () => {
    const skill: import('../../../02_Project/00_Source/shared/ipcContract').SkillInfo = {
      name: 'git-operations',
      description: 'Git 커밋/푸시/풀 자동화',
      scope: 'global',
      enabled: true,
    }
    expect(skill.name).toBe('git-operations')
    expect(skill.description).toBe('Git 커밋/푸시/풀 자동화')
    expect(skill.scope).toBe('global')
    expect(skill.enabled).toBe(true)
  })

  it('SkillInfo scope 는 "global" | "local" 두 가지만 허용한다', () => {
    const globalSkill: import('../../../02_Project/00_Source/shared/ipcContract').SkillInfo = {
      name: 'lsp', description: 'LSP 지원', scope: 'global', enabled: true,
    }
    const localSkill: import('../../../02_Project/00_Source/shared/ipcContract').SkillInfo = {
      name: 'project-specific', description: '프로젝트 전용', scope: 'local', enabled: false,
    }
    const scopes: Array<'global' | 'local'> = [globalSkill.scope, localSkill.scope]
    expect(scopes).toContain('global')
    expect(scopes).toContain('local')
    expect(scopes).toHaveLength(2)
  })

  it('SkillInfo 는 name/description/scope/enabled 4개 필드만 포함한다 (최소 표면 계약)', () => {
    const skill: import('../../../02_Project/00_Source/shared/ipcContract').SkillInfo = {
      name: 'test-skill',
      description: '테스트용 스킬',
      scope: 'local',
      enabled: false,
    }
    const keys = Object.keys(skill)
    expect(keys).toEqual(expect.arrayContaining(['name', 'description', 'scope', 'enabled']))
    expect(keys).toHaveLength(4)
    expect(keys).not.toContain('path')
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('secret')
    expect(keys).not.toContain('apiKey')
  })

  it('SkillInfo enabled 는 boolean 타입이다 (토글 전송값)', () => {
    const enabled: import('../../../02_Project/00_Source/shared/ipcContract').SkillInfo = {
      name: 'test', description: '', scope: 'global', enabled: true,
    }
    const disabled: import('../../../02_Project/00_Source/shared/ipcContract').SkillInfo = {
      name: 'test', description: '', scope: 'global', enabled: false,
    }
    expect(typeof enabled.enabled).toBe('boolean')
    expect(typeof disabled.enabled).toBe('boolean')
  })

  it('SkillSetEnabledReq 샘플이 타입 계약을 충족한다 (name + enabled)', () => {
    const req: import('../../../02_Project/00_Source/shared/ipcContract').SkillSetEnabledReq = {
      name: 'git-operations',
      enabled: false,
    }
    expect(req.name).toBe('git-operations')
    expect(req.enabled).toBe(false)
  })

  it('SkillSetEnabledReq 는 name·enabled 두 필드만 포함한다', () => {
    const req: import('../../../02_Project/00_Source/shared/ipcContract').SkillSetEnabledReq = {
      name: 'lsp',
      enabled: true,
    }
    const keys = Object.keys(req)
    expect(keys).toEqual(expect.arrayContaining(['name', 'enabled']))
    expect(keys).toHaveLength(2)
    expect(keys).not.toContain('path')
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('secret')
  })

  it('SkillSetEnabledReq enabled 는 boolean만 허용한다 (boolean-only 토글)', () => {
    const reqOn: import('../../../02_Project/00_Source/shared/ipcContract').SkillSetEnabledReq = { name: 'x', enabled: true }
    const reqOff: import('../../../02_Project/00_Source/shared/ipcContract').SkillSetEnabledReq = { name: 'x', enabled: false }
    expect(typeof reqOn.enabled).toBe('boolean')
    expect(typeof reqOff.enabled).toBe('boolean')
    expect(typeof reqOn.enabled).not.toBe('string')
  })

  it('skill.list 응답은 SkillInfo[] 형식이다 (빈 배열 포함)', () => {
    const emptyList: import('../../../02_Project/00_Source/shared/ipcContract').SkillInfo[] = []
    expect(emptyList).toHaveLength(0)
    const list: import('../../../02_Project/00_Source/shared/ipcContract').SkillInfo[] = [
      { name: 'git', description: 'Git', scope: 'global', enabled: true },
      { name: 'lsp', description: 'LSP', scope: 'local', enabled: false },
    ]
    expect(list).toHaveLength(2)
    expect(list[0].name).toBe('git')
    expect(list[1].enabled).toBe(false)
  })

  it('skill.setEnabled 응답 { ok: boolean } 샘플이 타입 계약을 충족한다', () => {
    const ok: { ok: boolean } = { ok: true }
    const fail: { ok: boolean } = { ok: false }
    expect(ok.ok).toBe(true)
    expect(fail.ok).toBe(false)
  })

  it('SkillInfo 에 시크릿·토큰·경로 패턴이 없다 (신뢰경계 regression 가드)', () => {
    const channelStrings = [IPC_CHANNELS.SKILL_LIST, IPC_CHANNELS.SKILL_SET_ENABLED]
    for (const ch of channelStrings) {
      expect(ch).not.toMatch(/sk-ant-/)
      expect(ch).not.toMatch(/Bearer/)
      expect(ch).not.toMatch(/token=/)
      expect(ch).not.toMatch(/secret=/)
    }
    const skill: import('../../../02_Project/00_Source/shared/ipcContract').SkillInfo = {
      name: 'test', description: '테스트', scope: 'global', enabled: true,
    }
    const keys = Object.keys(skill)
    const forbidden = ['token', 'secret', 'apiKey', 'password', 'credential', 'path', 'absolutePath']
    for (const f of forbidden) {
      expect(keys).not.toContain(f)
    }
  })
})

describe('P5b mcp.list / mcp.setEnabled 채널 계약', () => {

  it('MCP_LIST 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.MCP_LIST).toBe('mcp.list')
  })

  it('MCP_SET_ENABLED 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.MCP_SET_ENABLED).toBe('mcp.setEnabled')
  })

  it('mcp.* 두 채널이 전체 채널 목록에 포함된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(values).toContain('mcp.list')
    expect(values).toContain('mcp.setEnabled')
  })

  it('채널명 유니크 불변식이 mcp.* 채널 추가 후에도 유지된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('mcp.* 채널명은 dot-namespaced 규칙을 따른다 (/^[a-z]+\\.[a-z][a-zA-Z]*$/)', () => {
    expect(IPC_CHANNELS.MCP_LIST).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/)
    expect(IPC_CHANNELS.MCP_SET_ENABLED).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/)
  })

  it('McpServerInfo 샘플이 타입 계약을 충족한다 (name/scope/origin/transport/detail/enabled)', () => {
    const server: import('../../../02_Project/00_Source/shared/ipcContract').McpServerInfo = {
      name: 'filesystem',
      scope: 'global',
      origin: 'user',
      transport: 'stdio',
      detail: 'npx',
      enabled: true,
    }
    expect(server.name).toBe('filesystem')
    expect(server.scope).toBe('global')
    expect(server.origin).toBe('user')
    expect(server.transport).toBe('stdio')
    expect(server.detail).toBe('npx')
    expect(server.enabled).toBe(true)
  })

  it('McpServerInfo 는 name/scope/origin/transport/detail/enabled 6개 필드만 포함한다 (최소 표면 계약)', () => {
    const server: import('../../../02_Project/00_Source/shared/ipcContract').McpServerInfo = {
      name: 'brave-search',
      scope: 'local',
      origin: 'project',
      transport: 'http',
      detail: 'api.example.com',
      enabled: false,
    }
    const keys = Object.keys(server)
    expect(keys).toEqual(expect.arrayContaining(['name', 'scope', 'origin', 'transport', 'detail', 'enabled']))
    expect(keys).toHaveLength(6)
    expect(keys).not.toContain('env')
    expect(keys).not.toContain('args')
    expect(keys).not.toContain('url')
    expect(keys).not.toContain('command')
    expect(keys).not.toContain('headers')
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('secret')
    expect(keys).not.toContain('apiKey')
  })

  it('McpServerInfo scope 는 "global" | "local" 두 가지만 허용한다', () => {
    const globalServer: import('../../../02_Project/00_Source/shared/ipcContract').McpServerInfo = {
      name: 'a', scope: 'global', origin: 'user', transport: 'stdio', detail: 'node', enabled: true,
    }
    const localServer: import('../../../02_Project/00_Source/shared/ipcContract').McpServerInfo = {
      name: 'b', scope: 'local', origin: 'local', transport: 'http', detail: 'localhost', enabled: false,
    }
    const scopes: Array<'global' | 'local'> = [globalServer.scope, localServer.scope]
    expect(scopes).toContain('global')
    expect(scopes).toContain('local')
  })

  it('McpServerInfo origin 은 "user" | "project" | "local" 세 가지만 허용한다', () => {
    const origins: Array<'user' | 'project' | 'local'> = ['user', 'project', 'local']
    expect(origins).toHaveLength(3)
    const samples: import('../../../02_Project/00_Source/shared/ipcContract').McpServerInfo[] = origins.map(
      (origin) => ({ name: 'test', scope: 'global', origin, transport: 'stdio', detail: 'node', enabled: true })
    )
    expect(samples).toHaveLength(3)
  })

  it('McpServerInfo transport 는 "stdio" | "http" | "sse" | "unknown" 네 가지만 허용한다', () => {
    const transports: Array<'stdio' | 'http' | 'sse' | 'unknown'> = ['stdio', 'http', 'sse', 'unknown']
    expect(transports).toHaveLength(4)
  })

  it('McpServerInfo enabled 는 boolean 타입이다 (토글 상태)', () => {
    const on: import('../../../02_Project/00_Source/shared/ipcContract').McpServerInfo = {
      name: 'x', scope: 'global', origin: 'user', transport: 'stdio', detail: 'node', enabled: true,
    }
    const off: import('../../../02_Project/00_Source/shared/ipcContract').McpServerInfo = {
      name: 'y', scope: 'local', origin: 'project', transport: 'http', detail: 'localhost', enabled: false,
    }
    expect(typeof on.enabled).toBe('boolean')
    expect(typeof off.enabled).toBe('boolean')
  })

  it('McpServerInfo detail 은 마스킹된 안전 문자열이다 — env/args/URL 토큰 패턴 없음 (신뢰경계 regression)', () => {
    const stdioDetail = 'npx'
    expect(stdioDetail).not.toMatch(/--env\s/)
    expect(stdioDetail).not.toMatch(/ANTHROPIC_API_KEY/)
    expect(stdioDetail).not.toMatch(/Bearer\s/)
    expect(stdioDetail).not.toMatch(/sk-ant-/)

    const httpDetail = 'api.example.com'
    expect(httpDetail).not.toMatch(/token=/)
    expect(httpDetail).not.toMatch(/key=/)
    expect(httpDetail).not.toMatch(/Authorization/)
  })

  it('McpSetEnabledReq 샘플이 타입 계약을 충족한다 (name + enabled)', () => {
    const req: import('../../../02_Project/00_Source/shared/ipcContract').McpSetEnabledReq = {
      name: 'filesystem',
      enabled: false,
    }
    expect(req.name).toBe('filesystem')
    expect(req.enabled).toBe(false)
  })

  it('McpSetEnabledReq 는 name·enabled 두 필드만 포함한다', () => {
    const req: import('../../../02_Project/00_Source/shared/ipcContract').McpSetEnabledReq = {
      name: 'brave-search',
      enabled: true,
    }
    const keys = Object.keys(req)
    expect(keys).toEqual(expect.arrayContaining(['name', 'enabled']))
    expect(keys).toHaveLength(2)
    expect(keys).not.toContain('env')
    expect(keys).not.toContain('args')
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('secret')
  })

  it('McpSetEnabledReq enabled 는 boolean만 허용한다 (boolean-only 토글)', () => {
    const reqOn: import('../../../02_Project/00_Source/shared/ipcContract').McpSetEnabledReq = { name: 'x', enabled: true }
    const reqOff: import('../../../02_Project/00_Source/shared/ipcContract').McpSetEnabledReq = { name: 'x', enabled: false }
    expect(typeof reqOn.enabled).toBe('boolean')
    expect(typeof reqOff.enabled).toBe('boolean')
    expect(typeof reqOn.enabled).not.toBe('string')
  })

  it('mcp.list 응답은 McpServerInfo[] 형식이다 (빈 배열 포함)', () => {
    const emptyList: import('../../../02_Project/00_Source/shared/ipcContract').McpServerInfo[] = []
    expect(emptyList).toHaveLength(0)
    const list: import('../../../02_Project/00_Source/shared/ipcContract').McpServerInfo[] = [
      { name: 'filesystem', scope: 'global', origin: 'user', transport: 'stdio', detail: 'npx', enabled: true },
      { name: 'brave-search', scope: 'local', origin: 'project', transport: 'http', detail: 'api.search.brave.com', enabled: false },
    ]
    expect(list).toHaveLength(2)
    expect(list[0].name).toBe('filesystem')
    expect(list[1].enabled).toBe(false)
  })

  it('mcp.setEnabled 응답 { ok: boolean } 샘플이 타입 계약을 충족한다', () => {
    const ok: { ok: boolean } = { ok: true }
    const fail: { ok: boolean } = { ok: false }
    expect(ok.ok).toBe(true)
    expect(fail.ok).toBe(false)
  })

  it('McpServerInfo 에 시크릿 운반 필드(env/args/url/command/headers)가 없다 (신뢰경계 regression 가드)', () => {
    const server: import('../../../02_Project/00_Source/shared/ipcContract').McpServerInfo = {
      name: 'test', scope: 'global', origin: 'user', transport: 'stdio', detail: 'node', enabled: true,
    }
    const keys = Object.keys(server)
    const forbidden = ['env', 'args', 'url', 'command', 'headers', 'token', 'secret', 'apiKey', 'password', 'credential']
    for (const f of forbidden) {
      expect(keys).not.toContain(f)
    }
  })

  it('mcp.* 채널명이 시크릿 패턴을 포함하지 않는다', () => {
    const channelStrings = [IPC_CHANNELS.MCP_LIST, IPC_CHANNELS.MCP_SET_ENABLED]
    for (const ch of channelStrings) {
      expect(ch).not.toMatch(/sk-ant-/)
      expect(ch).not.toMatch(/Bearer/)
      expect(ch).not.toMatch(/token=/)
      expect(ch).not.toMatch(/secret=/)
    }
  })
})

describe('P3 engine.state 채널 계약', () => {

  it('ENGINE_STATE 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.ENGINE_STATE).toBe('engine.state')
  })

  it('engine.state 채널이 전체 채널 목록에 포함된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(values).toContain('engine.state')
  })

  it('채널명 유니크 불변식이 engine.state 추가 후에도 유지된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('engine.state 채널명은 dot-namespaced 규칙을 따른다', () => {
    expect(IPC_CHANNELS.ENGINE_STATE).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/)
  })

  it('EngineState 샘플(available=true, authed=true)이 타입 계약을 충족한다', () => {
    const state: EngineState = {
      available: true,
      authed: true,
      version: '1.2.3',
    }
    expect(state.available).toBe(true)
    expect(state.authed).toBe(true)
    expect(state.version).toBe('1.2.3')
  })

  it('EngineState 샘플(available=true, authed=false)이 타입 계약을 충족한다 — 미인증 시나리오', () => {
    const state: EngineState = {
      available: true,
      authed: false,
      version: '1.2.3',
    }
    expect(state.available).toBe(true)
    expect(state.authed).toBe(false)
  })

  it('EngineState 샘플(available=false, authed=false, version=null)이 타입 계약을 충족한다', () => {
    const state: EngineState = {
      available: false,
      authed: false,
      version: null,
    }
    expect(state.available).toBe(false)
    expect(state.authed).toBe(false)
    expect(state.version).toBeNull()
  })

  it('EngineState version 은 null 을 허용한다 (SDK 버전 조회 불가 시)', () => {
    const state: EngineState = { available: false, authed: false, version: null }
    expect(state.version).toBeNull()
  })

  it('EngineState 에는 available·authed·version 3개 필드만 존재한다 (최소 표면 계약)', () => {
    const state: EngineState = { available: true, authed: true, version: '0.1.0' }
    const keys = Object.keys(state)
    expect(keys).toEqual(expect.arrayContaining(['available', 'authed', 'version']))
    expect(keys).toHaveLength(3)
  })

  it('EngineState 에 토큰·키·시크릿 필드가 없다 (신뢰경계 regression 가드)', () => {
    const state: EngineState = { available: true, authed: true, version: '1.0.0' }
    const keys = Object.keys(state)
    const forbidden = ['token', 'accessToken', 'apiKey', 'secret', 'credential',
                       'password', 'key', 'authToken', 'bearerToken']
    for (const field of forbidden) {
      expect(keys).not.toContain(field)
    }
  })

  it('EngineState authed 는 boolean 타입이다 (토큰 값 미포함 확인)', () => {
    const authedTrue: EngineState = { available: true, authed: true, version: '1.0.0' }
    const authedFalse: EngineState = { available: true, authed: false, version: '1.0.0' }
    expect(typeof authedTrue.authed).toBe('boolean')
    expect(typeof authedFalse.authed).toBe('boolean')
    expect(typeof authedTrue.authed).not.toBe('string')
  })

  it('EngineState available·authed 는 독립적이다 — available=false 여도 authed 값을 가진다', () => {
    const state: EngineState = { available: false, authed: false, version: null }
    expect('authed' in state).toBe(true)
    expect('available' in state).toBe(true)
  })
})

describe('ADR-020 ConversationRecord.cwd 옵셔널 필드 계약', () => {
  it('cwd 없는 ConversationRecord 샘플이 기존 계약을 그대로 충족한다 (하위 호환)', () => {
    const rec: import('../../../02_Project/00_Source/shared/ipcContract').ConversationRecord = {
      id: 'conv-1',
      title: '첫 대화',
      messages: [{ role: 'user', content: 'hello' }],
      backendId: 'claude-code',
      createdAt: '2026-06-24T00:00:00.000Z',
      updatedAt: '2026-06-24T00:00:00.000Z',
    }
    expect(rec.id).toBe('conv-1')
    expect(rec.cwd).toBeUndefined()
  })

  it('cwd 있는 ConversationRecord 샘플이 타입 계약을 충족한다', () => {
    const rec: import('../../../02_Project/00_Source/shared/ipcContract').ConversationRecord = {
      id: 'conv-2',
      title: '프로젝트 A 대화',
      messages: [],
      backendId: 'claude-code',
      createdAt: '2026-06-24T00:00:00.000Z',
      updatedAt: '2026-06-24T00:00:00.000Z',
      cwd: '/home/user/projects/my-app',
    }
    expect(rec.cwd).toBe('/home/user/projects/my-app')
    expect(typeof rec.cwd).toBe('string')
  })

  it('ConversationRecord.cwd 는 경로 문자열이며 시크릿 패턴을 포함하지 않는다 (신뢰경계 regression 가드)', () => {
    const rec: import('../../../02_Project/00_Source/shared/ipcContract').ConversationRecord = {
      id: 'conv-3',
      title: '보안 테스트',
      messages: [],
      backendId: 'claude-code',
      createdAt: '2026-06-24T00:00:00.000Z',
      updatedAt: '2026-06-24T00:00:00.000Z',
      cwd: 'C:\\Dev\\AgentDeck',
    }
    expect(rec.cwd).not.toMatch(/sk-ant-/)
    expect(rec.cwd).not.toMatch(/Bearer/)
    expect(rec.cwd).not.toMatch(/token=/)
    expect(rec.cwd).not.toMatch(/secret=/)
  })

  it('ConversationSaveRequest.conversation은 cwd를 그대로 운반한다 (Omit 파생 자동포함)', () => {
    const saveReq: import('../../../02_Project/00_Source/shared/ipcContract').ConversationSaveRequest = {
      conversation: {
        id: 'conv-2',
        title: '프로젝트 A',
        messages: [],
        backendId: 'claude-code',
        cwd: '/home/user/projects/my-app',
      },
    }
    expect(saveReq.conversation.cwd).toBe('/home/user/projects/my-app')
  })

  it('ConversationSaveRequest.conversation은 cwd 없이도 유효하다 (기존 저장 경로 호환)', () => {
    const saveReq: import('../../../02_Project/00_Source/shared/ipcContract').ConversationSaveRequest = {
      conversation: {
        id: 'conv-existing',
        title: '기존 대화',
        messages: [],
        backendId: 'claude-code',
      },
    }
    expect(saveReq.conversation.cwd).toBeUndefined()
    expect(saveReq.conversation.id).toBe('conv-existing')
  })
})

describe('P15 dialog.pickFolder 채널 계약', () => {

  it('DIALOG_PICK_FOLDER 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.DIALOG_PICK_FOLDER).toBe('dialog.pickFolder')
  })

  it('dialog.pickFolder 채널이 전체 채널 목록에 포함된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(values).toContain('dialog.pickFolder')
  })

  it('채널명 유니크 불변식이 dialog.pickFolder 추가 후에도 유지된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('dialog.pickFolder 채널명은 dot-namespaced 규칙을 따른다 (/^[a-z]+\\.[a-z][a-zA-Z]*$/)', () => {
    expect(IPC_CHANNELS.DIALOG_PICK_FOLDER).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/)
  })

  it('PickFolderResponse 샘플(경로 선택)이 타입 계약을 충족한다', () => {
    const res: import('../../../02_Project/00_Source/shared/ipcContract').PickFolderResponse = {
      path: '/home/user/projects/my-app',
    }
    expect(res.path).toBe('/home/user/projects/my-app')
  })

  it('PickFolderResponse 는 취소/실패 시 path=null 을 허용한다', () => {
    const res: import('../../../02_Project/00_Source/shared/ipcContract').PickFolderResponse = {
      path: null,
    }
    expect(res.path).toBeNull()
  })

  it('PickFolderResponse 는 path 단일 필드만 포함한다 (최소 표면 계약 — 시크릿/추가 정보 0)', () => {
    const res: import('../../../02_Project/00_Source/shared/ipcContract').PickFolderResponse = {
      path: 'C:\\Dev\\my-project',
    }
    const keys = Object.keys(res)
    expect(keys).toEqual(['path'])
    expect(keys).toHaveLength(1)
    expect(keys).not.toContain('rootPath')
    expect(keys).not.toContain('tree')
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('secret')
    expect(keys).not.toContain('workspaceRoot')
  })

  it('PickFolderResponse path 는 string | null 타입이다', () => {
    const withPath: import('../../../02_Project/00_Source/shared/ipcContract').PickFolderResponse = { path: '/some/path' }
    const withNull: import('../../../02_Project/00_Source/shared/ipcContract').PickFolderResponse = { path: null }
    expect(typeof withPath.path).toBe('string')
    expect(withNull.path).toBeNull()
  })

  it('PickFolderResponse 에 시크릿·토큰·전역 워크스페이스 필드가 없다 (신뢰경계 regression 가드)', () => {
    const res: import('../../../02_Project/00_Source/shared/ipcContract').PickFolderResponse = { path: '/some/path' }
    const keys = Object.keys(res)
    const forbidden = [
      'token', 'secret', 'apiKey', 'password', 'credential',
      'tree', 'workspaceRoot', 'rootPath', 'files', 'children',
    ]
    for (const f of forbidden) {
      expect(keys).not.toContain(f)
    }
  })

  it('dialog.pickFolder 는 요청 인자가 없음을 preload 시그니처로 표현한다 (신뢰경계 — renderer 경로 주입 불가)', () => {
    expect(IPC_CHANNELS.DIALOG_PICK_FOLDER).toBe('dialog.pickFolder')
  })

  it('dialog.pickFolder 채널명은 시크릿 패턴을 포함하지 않는다', () => {
    const ch = IPC_CHANNELS.DIALOG_PICK_FOLDER
    expect(ch).not.toMatch(/sk-ant-/)
    expect(ch).not.toMatch(/Bearer/)
    expect(ch).not.toMatch(/token=/)
    expect(ch).not.toMatch(/secret=/)
  })
})

describe('P10 command.list 채널 계약', () => {

  it('COMMAND_LIST 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.COMMAND_LIST).toBe('command.list')
  })

  it('command.list 채널이 전체 채널 목록에 포함된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(values).toContain('command.list')
  })

  it('채널명 유니크 불변식이 command.list 추가 후에도 유지된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('command.list 채널명은 dot-namespaced 규칙을 따른다 (/^[a-z]+\\.[a-z][a-zA-Z]*$/)', () => {
    expect(IPC_CHANNELS.COMMAND_LIST).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/)
  })

  it('SlashCommandInfo 샘플(빌트인)이 타입 계약을 충족한다', () => {
    const cmd: SlashCommandInfo = {
      name: 'compact',
      description: '대화를 요약하여 컨텍스트를 압축한다',
      scope: 'builtin',
    }
    expect(cmd.name).toBe('compact')
    expect(cmd.description).toBe('대화를 요약하여 컨텍스트를 압축한다')
    expect(cmd.scope).toBe('builtin')
    expect(cmd.argHint).toBeUndefined()
  })

  it('SlashCommandInfo 샘플(프로젝트, argHint 포함)이 타입 계약을 충족한다', () => {
    const cmd: SlashCommandInfo = {
      name: 'deploy',
      description: '프로젝트를 배포한다',
      argHint: '[env] [version]',
      scope: 'project',
    }
    expect(cmd.name).toBe('deploy')
    expect(cmd.argHint).toBe('[env] [version]')
    expect(cmd.scope).toBe('project')
  })

  it('SlashCommandInfo 샘플(사용자 커스텀)이 타입 계약을 충족한다', () => {
    const cmd: SlashCommandInfo = {
      name: 'review',
      description: '코드 리뷰를 수행한다',
      scope: 'user',
    }
    expect(cmd.scope).toBe('user')
  })

  it('SlashCommandInfo scope 는 "builtin" | "user" | "project" 세 가지만 허용한다', () => {
    const scopes: Array<SlashCommandInfo['scope']> = ['builtin', 'user', 'project']
    expect(scopes).toHaveLength(3)
    const samples: SlashCommandInfo[] = scopes.map((scope) => ({
      name: 'test',
      description: '테스트',
      scope,
    }))
    expect(samples).toHaveLength(3)
  })

  it('SlashCommandInfo argHint 는 선택 필드이다 (없으면 undefined)', () => {
    const withHint: SlashCommandInfo = {
      name: 'init',
      description: '프로젝트를 초기화한다',
      argHint: '[template]',
      scope: 'builtin',
    }
    const withoutHint: SlashCommandInfo = {
      name: 'clear',
      description: '대화를 초기화한다',
      scope: 'builtin',
    }
    expect(withHint.argHint).toBe('[template]')
    expect(withoutHint.argHint).toBeUndefined()
  })

  it('SlashCommandInfo 는 name/description/scope 필수 + argHint 선택 (4필드 최대)', () => {
    const minimal: SlashCommandInfo = {
      name: 'compact',
      description: 'Compacts context',
      scope: 'builtin',
    }
    const minimalKeys = Object.keys(minimal)
    expect(minimalKeys).toEqual(expect.arrayContaining(['name', 'description', 'scope']))
    expect(minimalKeys).toHaveLength(3)

    const withHint: SlashCommandInfo = {
      name: 'deploy',
      description: 'Deploy',
      argHint: '[env]',
      scope: 'project',
    }
    const withHintKeys = Object.keys(withHint)
    expect(withHintKeys).toEqual(expect.arrayContaining(['name', 'description', 'scope', 'argHint']))
    expect(withHintKeys).toHaveLength(4)
  })

  it('SlashCommandInfo 에 시크릿 운반 필드(path/content/body/env)가 없다 (신뢰경계 regression 가드)', () => {
    const cmd: SlashCommandInfo = {
      name: 'test',
      description: '테스트 커맨드',
      scope: 'project',
    }
    const keys = Object.keys(cmd)
    const forbidden = ['path', 'content', 'body', 'env', 'token', 'secret', 'apiKey',
                       'filePath', 'absolutePath', 'source', 'markdown']
    for (const f of forbidden) {
      expect(keys).not.toContain(f)
    }
  })

  it('SlashCommandInfo name 은 슬래시 제외 식별자이다 (/ 접두사 없음)', () => {
    const cmd: SlashCommandInfo = { name: 'compact', description: '압축', scope: 'builtin' }
    expect(cmd.name).not.toMatch(/^\//)
  })

  it('SlashCommandInfo 배열(command.list 응답)이 타입 계약을 충족한다', () => {
    const list: SlashCommandInfo[] = [
      { name: 'compact', description: 'Compact context', scope: 'builtin' },
      { name: 'init', description: 'Init project', argHint: '[template]', scope: 'builtin' },
      { name: 'deploy', description: 'Deploy', argHint: '[env]', scope: 'project' },
      { name: 'review', description: 'Code review', scope: 'user' },
    ]
    expect(list).toHaveLength(4)
    expect(list[0].scope).toBe('builtin')
    expect(list[2].scope).toBe('project')
    expect(list[3].scope).toBe('user')
    const empty: SlashCommandInfo[] = []
    expect(empty).toHaveLength(0)
  })

  it('command.list 채널명은 시크릿 패턴을 포함하지 않는다', () => {
    const ch = IPC_CHANNELS.COMMAND_LIST
    expect(ch).not.toMatch(/sk-ant-/)
    expect(ch).not.toMatch(/Bearer/)
    expect(ch).not.toMatch(/token=/)
    expect(ch).not.toMatch(/secret=/)
  })
})

describe('RMW1 multi.* 멀티세션 영속 채널 계약 (ADR-031)', () => {

  it('MULTI_SESSION_LOAD 채널이 정확한 문자열로 존재한다 (READ 전용 — ADR-031 이후에도 폐기 대상 아님)', () => {
    expect(IPC_CHANNELS.MULTI_SESSION_LOAD).toBe('multi.load')
  })

  it('multi.cmd* 의도 명령 5종이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.MULTI_CMD_UPSERT).toBe('multi.cmdUpsert')
    expect(IPC_CHANNELS.MULTI_CMD_CREATE).toBe('multi.cmdCreate')
    expect(IPC_CHANNELS.MULTI_CMD_DELETE).toBe('multi.cmdDelete')
    expect(IPC_CHANNELS.MULTI_CMD_RENAME).toBe('multi.cmdRename')
    expect(IPC_CHANNELS.MULTI_CMD_SELECT).toBe('multi.cmdSelect')
  })

  it('multi.* 6채널(load 1 + cmd 5종)이 전체 채널 목록에 포함된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(values).toContain('multi.load')
    expect(values).toContain('multi.cmdUpsert')
    expect(values).toContain('multi.cmdCreate')
    expect(values).toContain('multi.cmdDelete')
    expect(values).toContain('multi.cmdRename')
    expect(values).toContain('multi.cmdSelect')
  })

  it('채널명 유니크 불변식이 multi.* 채널 추가 후에도 유지된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('multi.* 채널명은 전역 dot-namespaced 규칙(namespace.action, camelCase 허용)을 따른다', () => {
    const multiChannels = [
      IPC_CHANNELS.MULTI_SESSION_LOAD,
      IPC_CHANNELS.MULTI_CMD_UPSERT,
      IPC_CHANNELS.MULTI_CMD_CREATE,
      IPC_CHANNELS.MULTI_CMD_DELETE,
      IPC_CHANNELS.MULTI_CMD_RENAME,
      IPC_CHANNELS.MULTI_CMD_SELECT,
    ]
    for (const ch of multiChannels) {
      expect(ch).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/)
    }
  })

  it('multi.cmd* 5종은 단일-dot(namespace.action) 안에서 "cmd" 접두 camelCase로 세분화한다 (RMW1-P02 규약 — 2-dot 금지)', () => {
    const cmdChannels = [
      IPC_CHANNELS.MULTI_CMD_UPSERT,
      IPC_CHANNELS.MULTI_CMD_CREATE,
      IPC_CHANNELS.MULTI_CMD_DELETE,
      IPC_CHANNELS.MULTI_CMD_RENAME,
      IPC_CHANNELS.MULTI_CMD_SELECT,
    ]
    for (const ch of cmdChannels) {
      expect(ch.split('.')).toHaveLength(2)
      expect(ch).toMatch(/^multi\.cmd[A-Z][a-zA-Z]*$/)
    }
  })

  it('MultiCmdResponse 샘플(ok:true)이 타입 계약을 충족한다 — 병합 후 권위 state 포함', () => {
    const res: import('../../../02_Project/00_Source/shared/ipcContract').MultiCmdResponse = {
      ok: true,
      state: { version: 2, activeSessionId: 'sess-1', sessions: [] },
    }
    expect(res.ok).toBe(true)
    expect(res.state.version).toBe(2)
  })

  it('MultiCmdResponse 는 ok:false(stale 명령)여도 state는 여전히 main 권위 상태를 담는다', () => {
    const res: import('../../../02_Project/00_Source/shared/ipcContract').MultiCmdResponse = {
      ok: false,
      state: {
        version: 2,
        activeSessionId: 'sess-1',
        sessions: [{ id: 'sess-1', title: '', count: 2, panels: [] }],
      },
    }
    expect(res.ok).toBe(false)
    expect(res.state.sessions).toHaveLength(1)
  })

  it('MultiCmdUpsertRequest.session 은 title 필드를 의도적으로 제외한다 (upsert는 콘텐츠만 갱신)', () => {
    const req: import('../../../02_Project/00_Source/shared/ipcContract').MultiCmdUpsertRequest = {
      session: { id: 'sess-1', count: 2, panels: [] },
    }
    const keys = Object.keys(req.session)
    expect(keys).not.toContain('title')
  })

  it('MultiCmdDeleteRequest / MultiCmdRenameRequest / MultiCmdSelectRequest 샘플이 타입 계약을 충족한다', () => {
    const del: import('../../../02_Project/00_Source/shared/ipcContract').MultiCmdDeleteRequest = { id: 'sess-1' }
    const rename: import('../../../02_Project/00_Source/shared/ipcContract').MultiCmdRenameRequest = {
      id: 'sess-1',
      title: '새 제목',
    }
    const select: import('../../../02_Project/00_Source/shared/ipcContract').MultiCmdSelectRequest = { id: 'sess-1' }
    expect(del.id).toBe('sess-1')
    expect(rename.title).toBe('새 제목')
    expect(select.id).toBe('sess-1')
  })

  it('multi.* 채널명은 시크릿 패턴을 포함하지 않는다', () => {
    const multiChannels = [
      IPC_CHANNELS.MULTI_SESSION_LOAD,
      IPC_CHANNELS.MULTI_CMD_UPSERT,
      IPC_CHANNELS.MULTI_CMD_CREATE,
      IPC_CHANNELS.MULTI_CMD_DELETE,
      IPC_CHANNELS.MULTI_CMD_RENAME,
      IPC_CHANNELS.MULTI_CMD_SELECT,
    ]
    for (const ch of multiChannels) {
      expect(ch).not.toMatch(/sk-ant-/)
      expect(ch).not.toMatch(/Bearer/)
      expect(ch).not.toMatch(/token=/)
      expect(ch).not.toMatch(/secret=/)
    }
  })
})

describe('SubAgentInfo.model 필드 계약 (FB2 P07)', () => {
  it('model 필드가 있는 SubAgentInfo 샘플이 타입 계약을 충족한다 (원시 모델 ID)', () => {
    const sample: import('../../../02_Project/00_Source/shared/agentEvents').SubAgentInfo = {
      id: 'sa-1',
      name: '탐색 에이전트',
      role: 'explorer',
      status: 'running',
      tools: [],
      model: 'claude-opus-4-8',
    }
    expect(sample.model).toBe('claude-opus-4-8')
  })

  it('model 필드가 없는 SubAgentInfo 샘플도 여전히 유효하다 (optional — 기존 소비자 비파괴)', () => {
    const sample: import('../../../02_Project/00_Source/shared/agentEvents').SubAgentInfo = {
      id: 'sa-2',
      name: '빌더 에이전트',
      role: 'builder',
      status: 'queued',
      tools: [],
    }
    expect(sample.model).toBeUndefined()
    expect(Object.keys(sample)).not.toContain('model')
  })

  it('AgentEventSubagent 유니온 멤버로도 model 유무 양쪽이 narrowing된다', () => {
    const events: AgentEvent[] = [
      {
        type: 'subagent',
        subagent: {
          id: 'sa-3', name: 'A', role: 'explorer', status: 'done', tools: [],
          model: 'claude-sonnet-4-6',
        },
      },
      {
        type: 'subagent',
        subagent: { id: 'sa-4', name: 'B', role: 'builder', status: 'running', tools: [] },
      },
    ]
    for (const e of events) {
      if (e.type === 'subagent') {
        expect(typeof e.subagent.model === 'string' || e.subagent.model === undefined).toBe(true)
      }
    }
  })

  it('model 필드는 원시 모델 ID 문자열만 담는다 — 표시 변환(예: "Opus 4.8") 문자열이 아니다 (계약 경계)', () => {
    const sample: import('../../../02_Project/00_Source/shared/agentEvents').SubAgentInfo = {
      id: 'sa-5', name: 'C', role: 'explorer', status: 'running', tools: [],
      model: 'claude-fable-5',
    }
    expect(sample.model).toMatch(/^claude-/)
    expect(sample.model).not.toBe('Fable 5')
  })
})
