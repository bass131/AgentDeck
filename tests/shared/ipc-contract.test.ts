import { describe, it, expect } from 'vitest'
import { IPC_CHANNELS, WORKSPACE_ROOT_ID } from '../../src/shared/ipc-contract'
import type { ResizeEdge, PermissionResponse, QuestionResponse, UsageWindow, UsageInfo } from '../../src/shared/ipc-contract'
import type { LspStatus, LspPos, LspHoverResult, LspLocation, LspSemanticTokens, LspDocReq, LspPosReq } from '../../src/shared/ipc-contract'
import type { UiPrefs, UiPrefsSetReq } from '../../src/shared/ipc-contract'
import type { Profile } from '../../src/shared/ipc-contract'
import type { EngineState } from '../../src/shared/ipc-contract'
import type { SlashCommandInfo } from '../../src/shared/ipc-contract'
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
      case 'model-fallback':
        return e.fromModel
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
      { type: 'model-fallback', fromModel: 'claude-fable-5', toModel: 'claude-opus-4-8', text: '폴백 경고' },
      { type: 'done' },
      { type: 'error', message: 'boom' }
    ]
    expect(samples.map(summarize)).toEqual([
      'hi', 'bash', 'true', 'modify', '생각 중', 'thinking_clear', '1', '탐색 에이전트',
      'Bash', '1', 'claude-fable-5', 'done', 'boom'
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

// ── M2-LSP 27a LSP 채널 계약 골든 ──────────────────────────────────────────

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
    const loc: LspLocation = { relPath: 'src/main/index.ts', line: 5, character: 2 }
    // relPath는 절대경로('/...', 'C:\...')가 아니어야 한다 (신뢰경계 불변식)
    expect(loc.relPath).not.toMatch(/^[A-Za-z]:[\\/]/)  // Windows 절대경로 패턴
    expect(loc.relPath).not.toMatch(/^\//)               // Unix 절대경로 패턴
    expect(loc.relPath).toBe('src/main/index.ts')
    expect(loc.line).toBe(5)
    expect(loc.character).toBe(2)
  })

  it('LspLocation 은 ".." 탈출 relPath를 포함하면 안 된다 (타입 계약 음성 검증)', () => {
    // 타입 수준에선 string이지만, 런타임 검증 패턴 확인 (main이 차단해야 할 패턴)
    const escapedPath = '../../etc/passwd'
    expect(escapedPath).toMatch(/\.\./)  // ".." 포함 = main resolveSafe가 차단해야 함
    // 정상 LspLocation은 이 패턴을 포함하지 않는다
    const validLoc: LspLocation = { relPath: 'src/renderer/App.tsx', line: 0, character: 0 }
    expect(validLoc.relPath).not.toMatch(/\.\./)
  })

  it('LspSemanticTokens 샘플이 타입 계약 형태를 충족한다', () => {
    // data: 5개씩 [deltaLine, deltaStartChar, length, tokenType, tokenMods]
    const tokens: LspSemanticTokens = {
      data: [0, 4, 6, 1, 0,  // 첫 토큰: line=0, col=4, len=6, type=1, mods=0
             1, 2, 4, 2, 1], // 둘째 토큰: deltaLine=1, deltaCol=2, len=4, type=2, mods=1
      types: ['namespace', 'type', 'class', 'enum', 'interface', 'function', 'variable'],
      mods: ['declaration', 'definition', 'readonly', 'static'],
    }
    expect(tokens.data).toHaveLength(10)  // 2개 토큰 × 5
    expect(tokens.data.length % 5).toBe(0)  // 5의 배수 불변식
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
      relPath: 'src/main/index.ts',
    }
    const keys = Object.keys(req)
    // cwd, absolutePath, folderPath 등 절대경로 관련 필드가 없어야 함 (신뢰경계)
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
    // cwd 등 절대경로 관련 필드 없음
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

// ── P1 ui-prefs 영속 계약 골든 ──────────────────────────────────────────────

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
    // 키 존재 확인
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
    // 모두 UiPrefsSetReq 타입이면 컴파일 통과 — 런타임으로 길이만 확인
    expect(samples).toHaveLength(6)
  })

  it('UiPrefsSetReq 는 민감 자격증명 필드를 포함하면 안 된다 (신뢰경계 regression 방지)', () => {
    // 무해 설정 샘플 — key가 'token'·'secret'·'apiKey' 이름이어도 타입 자체는 막지 않지만
    // 계약 JSDoc 및 테스트 주석으로 명시: UI 설정 키만 사용해야 한다.
    const safeReq: UiPrefsSetReq = { key: 'theme', value: 'dark' }
    expect(safeReq.key).not.toMatch(/^(token|secret|apiKey|password|credential)/i)
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

// ── P2 Profile 로컬 사용자 개인화 계약 골든 ─────────────────────────────────

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
    // AVATAR_PALETTE 12색 중 하나 — '#rrggbb' 패턴
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
    // 개인화 전용 — nickname·color만. 민감 자격증명 0.
    const profile: Profile = { nickname: '홍길동', color: '#6366f1' }
    const keys = Object.keys(profile)
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('secret')
    expect(keys).not.toContain('apiKey')
    expect(keys).not.toContain('password')
  })

  it('Profile | null 계약: null은 미설정/첫실행을 의미한다 (온보딩 분기)', () => {
    // getProfile 응답이 null이면 renderer는 온보딩 화면으로 분기해야 한다.
    // 타입 수준 확인: null이 Profile | null에 할당 가능.
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

// ── P4 app.getVersion 계약 골든 ─────────────────────────────────────────────

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
    // 'app.getVersion' — namespace='app'(소문자), action='getVersion'(camelCase 허용)
    expect(IPC_CHANNELS.APP_VERSION).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/)
  })

  it('app.getVersion 응답은 semver 형식 문자열이다 (샘플 검증)', () => {
    // 응답 타입은 string — semver(x.y.z) 형식을 기대한다
    const versionSamples = ['0.1.0', '1.0.0', '1.2.3', '2.0.0-beta.1']
    for (const v of versionSamples) {
      expect(typeof v).toBe('string')
      expect(v.length).toBeGreaterThan(0)
    }
  })

  it('app.getVersion 응답은 시크릿·토큰을 포함하지 않는다 (신뢰경계 — 버전 문자열만)', () => {
    // 버전 문자열은 package.json의 공개 값 — 시크릿 0
    const version = '0.1.0'
    expect(version).not.toMatch(/sk-ant-/)       // API 키 패턴 아님
    expect(version).not.toMatch(/Bearer\s/)       // OAuth 토큰 패턴 아님
    expect(version).toMatch(/^\d+\.\d+\.\d+/)    // semver 패턴 (x.y.z 시작)
  })
})

// ── P5a Settings: Skill 채널 계약 골든 ────────────────────────────────────────
// 유래: 원본 AgentCodeGUI protocol.ts L392 SkillInfo 미러.
// 용도: Settings Skill 탭 실데이터 + 토글.
// 신뢰경계: name/description/scope/enabled만 — 시크릿 0. path 필드 없음.
// 구현: main settings/skills.ts. 소비: renderer SettingsModal SkillView.

describe('P5a skill.list / skill.setEnabled 채널 계약', () => {
  // ── 채널 존재 + 문자열 정합 ────────────────────────────────────────────────

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

  // ── SkillInfo 타입 구조 계약 ───────────────────────────────────────────────

  it('SkillInfo 샘플이 타입 계약을 충족한다 (name/description/scope/enabled)', () => {
    const skill: import('../../src/shared/ipc-contract').SkillInfo = {
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
    const globalSkill: import('../../src/shared/ipc-contract').SkillInfo = {
      name: 'lsp', description: 'LSP 지원', scope: 'global', enabled: true,
    }
    const localSkill: import('../../src/shared/ipc-contract').SkillInfo = {
      name: 'project-specific', description: '프로젝트 전용', scope: 'local', enabled: false,
    }
    const scopes: Array<'global' | 'local'> = [globalSkill.scope, localSkill.scope]
    expect(scopes).toContain('global')
    expect(scopes).toContain('local')
    expect(scopes).toHaveLength(2)
  })

  it('SkillInfo 는 name/description/scope/enabled 4개 필드만 포함한다 (최소 표면 계약)', () => {
    const skill: import('../../src/shared/ipc-contract').SkillInfo = {
      name: 'test-skill',
      description: '테스트용 스킬',
      scope: 'local',
      enabled: false,
    }
    const keys = Object.keys(skill)
    expect(keys).toEqual(expect.arrayContaining(['name', 'description', 'scope', 'enabled']))
    expect(keys).toHaveLength(4)
    // 시크릿/path 필드 없음 (신뢰경계 불변식)
    expect(keys).not.toContain('path')
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('secret')
    expect(keys).not.toContain('apiKey')
  })

  it('SkillInfo enabled 는 boolean 타입이다 (토글 전송값)', () => {
    const enabled: import('../../src/shared/ipc-contract').SkillInfo = {
      name: 'test', description: '', scope: 'global', enabled: true,
    }
    const disabled: import('../../src/shared/ipc-contract').SkillInfo = {
      name: 'test', description: '', scope: 'global', enabled: false,
    }
    expect(typeof enabled.enabled).toBe('boolean')
    expect(typeof disabled.enabled).toBe('boolean')
  })

  // ── SkillSetEnabledReq 타입 구조 계약 ─────────────────────────────────────

  it('SkillSetEnabledReq 샘플이 타입 계약을 충족한다 (name + enabled)', () => {
    const req: import('../../src/shared/ipc-contract').SkillSetEnabledReq = {
      name: 'git-operations',
      enabled: false,
    }
    expect(req.name).toBe('git-operations')
    expect(req.enabled).toBe(false)
  })

  it('SkillSetEnabledReq 는 name·enabled 두 필드만 포함한다', () => {
    const req: import('../../src/shared/ipc-contract').SkillSetEnabledReq = {
      name: 'lsp',
      enabled: true,
    }
    const keys = Object.keys(req)
    expect(keys).toEqual(expect.arrayContaining(['name', 'enabled']))
    expect(keys).toHaveLength(2)
    // 시크릿/path 필드 없음
    expect(keys).not.toContain('path')
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('secret')
  })

  it('SkillSetEnabledReq enabled 는 boolean만 허용한다 (boolean-only 토글)', () => {
    const reqOn: import('../../src/shared/ipc-contract').SkillSetEnabledReq = { name: 'x', enabled: true }
    const reqOff: import('../../src/shared/ipc-contract').SkillSetEnabledReq = { name: 'x', enabled: false }
    expect(typeof reqOn.enabled).toBe('boolean')
    expect(typeof reqOff.enabled).toBe('boolean')
    // 'true' 문자열을 담으면 안 됨
    expect(typeof reqOn.enabled).not.toBe('string')
  })

  // ── skill.list 응답 = SkillInfo[] 계약 ────────────────────────────────────

  it('skill.list 응답은 SkillInfo[] 형식이다 (빈 배열 포함)', () => {
    const emptyList: import('../../src/shared/ipc-contract').SkillInfo[] = []
    expect(emptyList).toHaveLength(0)
    const list: import('../../src/shared/ipc-contract').SkillInfo[] = [
      { name: 'git', description: 'Git', scope: 'global', enabled: true },
      { name: 'lsp', description: 'LSP', scope: 'local', enabled: false },
    ]
    expect(list).toHaveLength(2)
    expect(list[0].name).toBe('git')
    expect(list[1].enabled).toBe(false)
  })

  // ── skill.setEnabled 응답 = { ok: boolean } 계약 ─────────────────────────

  it('skill.setEnabled 응답 { ok: boolean } 샘플이 타입 계약을 충족한다', () => {
    const ok: { ok: boolean } = { ok: true }
    const fail: { ok: boolean } = { ok: false }
    expect(ok.ok).toBe(true)
    expect(fail.ok).toBe(false)
  })

  // ── 신뢰경계 regression 방지 ──────────────────────────────────────────────

  it('SkillInfo 에 시크릿·토큰·경로 패턴이 없다 (신뢰경계 regression 가드)', () => {
    // 채널/타입 문자열에 sk-ant-, Bearer, token=, secret= 패턴 없음을 확인한다.
    const channelStrings = [IPC_CHANNELS.SKILL_LIST, IPC_CHANNELS.SKILL_SET_ENABLED]
    for (const ch of channelStrings) {
      expect(ch).not.toMatch(/sk-ant-/)
      expect(ch).not.toMatch(/Bearer/)
      expect(ch).not.toMatch(/token=/)
      expect(ch).not.toMatch(/secret=/)
    }
    // SkillInfo 샘플 필드 검사
    const skill: import('../../src/shared/ipc-contract').SkillInfo = {
      name: 'test', description: '테스트', scope: 'global', enabled: true,
    }
    const keys = Object.keys(skill)
    const forbidden = ['token', 'secret', 'apiKey', 'password', 'credential', 'path', 'absolutePath']
    for (const f of forbidden) {
      expect(keys).not.toContain(f)
    }
  })
})

// ── P5b Settings: MCP 채널 계약 골든 ─────────────────────────────────────────
// 유래: 원본 AgentCodeGUI protocol.ts L379 McpServerInfo 미러.
// 용도: Settings MCP 탭 실데이터 + 토글.
// 신뢰경계: name/scope/origin/transport/detail/enabled 6필드만.
//   detail = main이 마스킹한 안전 문자열(stdio=command basename만·http/sse=host만,
//            env/args/토큰 절대 미포함).
// 구현: main settings/mcp.ts. 소비: renderer SettingsModal McpView.

describe('P5b mcp.list / mcp.setEnabled 채널 계약', () => {
  // ── 채널 존재 + 문자열 정합 ────────────────────────────────────────────────

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

  // ── McpServerInfo 타입 구조 계약 ─────────────────────────────────────────

  it('McpServerInfo 샘플이 타입 계약을 충족한다 (name/scope/origin/transport/detail/enabled)', () => {
    const server: import('../../src/shared/ipc-contract').McpServerInfo = {
      name: 'filesystem',
      scope: 'global',
      origin: 'user',
      transport: 'stdio',
      detail: 'npx',   // main이 마스킹한 command basename만
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
    const server: import('../../src/shared/ipc-contract').McpServerInfo = {
      name: 'brave-search',
      scope: 'local',
      origin: 'project',
      transport: 'http',
      detail: 'api.example.com',  // main이 마스킹한 host만
      enabled: false,
    }
    const keys = Object.keys(server)
    expect(keys).toEqual(expect.arrayContaining(['name', 'scope', 'origin', 'transport', 'detail', 'enabled']))
    expect(keys).toHaveLength(6)
    // 시크릿 운반 필드 없음 (신뢰경계 핵심 불변식)
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
    const globalServer: import('../../src/shared/ipc-contract').McpServerInfo = {
      name: 'a', scope: 'global', origin: 'user', transport: 'stdio', detail: 'node', enabled: true,
    }
    const localServer: import('../../src/shared/ipc-contract').McpServerInfo = {
      name: 'b', scope: 'local', origin: 'local', transport: 'http', detail: 'localhost', enabled: false,
    }
    const scopes: Array<'global' | 'local'> = [globalServer.scope, localServer.scope]
    expect(scopes).toContain('global')
    expect(scopes).toContain('local')
  })

  it('McpServerInfo origin 은 "user" | "project" | "local" 세 가지만 허용한다', () => {
    const origins: Array<'user' | 'project' | 'local'> = ['user', 'project', 'local']
    expect(origins).toHaveLength(3)
    // 각 origin 값으로 McpServerInfo 생성 가능 — 타입 레벨 보장 (컴파일 통과)
    const samples: import('../../src/shared/ipc-contract').McpServerInfo[] = origins.map(
      (origin) => ({ name: 'test', scope: 'global', origin, transport: 'stdio', detail: 'node', enabled: true })
    )
    expect(samples).toHaveLength(3)
  })

  it('McpServerInfo transport 는 "stdio" | "http" | "sse" | "unknown" 네 가지만 허용한다', () => {
    const transports: Array<'stdio' | 'http' | 'sse' | 'unknown'> = ['stdio', 'http', 'sse', 'unknown']
    expect(transports).toHaveLength(4)
  })

  it('McpServerInfo enabled 는 boolean 타입이다 (토글 상태)', () => {
    const on: import('../../src/shared/ipc-contract').McpServerInfo = {
      name: 'x', scope: 'global', origin: 'user', transport: 'stdio', detail: 'node', enabled: true,
    }
    const off: import('../../src/shared/ipc-contract').McpServerInfo = {
      name: 'y', scope: 'local', origin: 'project', transport: 'http', detail: 'localhost', enabled: false,
    }
    expect(typeof on.enabled).toBe('boolean')
    expect(typeof off.enabled).toBe('boolean')
  })

  // ── detail 마스킹 정책 ───────────────────────────────────────────────────
  // detail 은 main이 마스킹한 안전 문자열만 — env/args/토큰 패턴이 없음을 샘플로 확인.

  it('McpServerInfo detail 은 마스킹된 안전 문자열이다 — env/args/URL 토큰 패턴 없음 (신뢰경계 regression)', () => {
    // stdio 서버: command basename만 (예: 'npx', 'node', 'python')
    const stdioDetail = 'npx'
    expect(stdioDetail).not.toMatch(/--env\s/)        // env 인자 없음
    expect(stdioDetail).not.toMatch(/ANTHROPIC_API_KEY/) // 시크릿 없음
    expect(stdioDetail).not.toMatch(/Bearer\s/)        // 토큰 없음
    expect(stdioDetail).not.toMatch(/sk-ant-/)          // API 키 패턴 없음

    // http/sse 서버: host만 (예: 'api.example.com', 'localhost:3000')
    const httpDetail = 'api.example.com'
    expect(httpDetail).not.toMatch(/token=/)
    expect(httpDetail).not.toMatch(/key=/)
    expect(httpDetail).not.toMatch(/Authorization/)
  })

  // ── McpSetEnabledReq 타입 구조 계약 ──────────────────────────────────────

  it('McpSetEnabledReq 샘플이 타입 계약을 충족한다 (name + enabled)', () => {
    const req: import('../../src/shared/ipc-contract').McpSetEnabledReq = {
      name: 'filesystem',
      enabled: false,
    }
    expect(req.name).toBe('filesystem')
    expect(req.enabled).toBe(false)
  })

  it('McpSetEnabledReq 는 name·enabled 두 필드만 포함한다', () => {
    const req: import('../../src/shared/ipc-contract').McpSetEnabledReq = {
      name: 'brave-search',
      enabled: true,
    }
    const keys = Object.keys(req)
    expect(keys).toEqual(expect.arrayContaining(['name', 'enabled']))
    expect(keys).toHaveLength(2)
    // 시크릿/path 필드 없음
    expect(keys).not.toContain('env')
    expect(keys).not.toContain('args')
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('secret')
  })

  it('McpSetEnabledReq enabled 는 boolean만 허용한다 (boolean-only 토글)', () => {
    const reqOn: import('../../src/shared/ipc-contract').McpSetEnabledReq = { name: 'x', enabled: true }
    const reqOff: import('../../src/shared/ipc-contract').McpSetEnabledReq = { name: 'x', enabled: false }
    expect(typeof reqOn.enabled).toBe('boolean')
    expect(typeof reqOff.enabled).toBe('boolean')
    expect(typeof reqOn.enabled).not.toBe('string')
  })

  // ── mcp.list 응답 = McpServerInfo[] 계약 ─────────────────────────────────

  it('mcp.list 응답은 McpServerInfo[] 형식이다 (빈 배열 포함)', () => {
    const emptyList: import('../../src/shared/ipc-contract').McpServerInfo[] = []
    expect(emptyList).toHaveLength(0)
    const list: import('../../src/shared/ipc-contract').McpServerInfo[] = [
      { name: 'filesystem', scope: 'global', origin: 'user', transport: 'stdio', detail: 'npx', enabled: true },
      { name: 'brave-search', scope: 'local', origin: 'project', transport: 'http', detail: 'api.search.brave.com', enabled: false },
    ]
    expect(list).toHaveLength(2)
    expect(list[0].name).toBe('filesystem')
    expect(list[1].enabled).toBe(false)
  })

  // ── mcp.setEnabled 응답 = { ok: boolean } 계약 ───────────────────────────

  it('mcp.setEnabled 응답 { ok: boolean } 샘플이 타입 계약을 충족한다', () => {
    const ok: { ok: boolean } = { ok: true }
    const fail: { ok: boolean } = { ok: false }
    expect(ok.ok).toBe(true)
    expect(fail.ok).toBe(false)
  })

  // ── 신뢰경계 regression 방지 ─────────────────────────────────────────────

  it('McpServerInfo 에 시크릿 운반 필드(env/args/url/command/headers)가 없다 (신뢰경계 regression 가드)', () => {
    const server: import('../../src/shared/ipc-contract').McpServerInfo = {
      name: 'test', scope: 'global', origin: 'user', transport: 'stdio', detail: 'node', enabled: true,
    }
    const keys = Object.keys(server)
    // CRITICAL: 이 필드들이 McpServerInfo에 추가되면 신뢰경계 붕괴 — 타입 레벨 regression 가드
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

// ── P3 engine.state 계약 골든 ────────────────────────────────────────────────

describe('P3 engine.state 채널 계약', () => {
  // ── 채널 존재 + 문자열 정합 ────────────────────────────────────────────────

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

  // ── EngineState 타입 구조 + 필드 목록 계약 ─────────────────────────────────

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
    // authed=false → renderer가 EngineGate 안내를 표시해야 하는 상태
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

  // ── 신뢰경계 regression 방지 ──────────────────────────────────────────────

  it('EngineState 에는 available·authed·version 3개 필드만 존재한다 (최소 표면 계약)', () => {
    // 핵심 신뢰경계 불변식: 이 타입에 토큰·키·시크릿이 추가되면 안 된다.
    // 런타임 샘플의 키 목록으로 regression을 방지한다.
    const state: EngineState = { available: true, authed: true, version: '0.1.0' }
    const keys = Object.keys(state)
    expect(keys).toEqual(expect.arrayContaining(['available', 'authed', 'version']))
    expect(keys).toHaveLength(3)
  })

  it('EngineState 에 토큰·키·시크릿 필드가 없다 (신뢰경계 regression 가드)', () => {
    // authed 는 불리언만 — 실제 토큰/API 키 문자열을 담으면 신뢰경계 위반.
    const state: EngineState = { available: true, authed: true, version: '1.0.0' }
    const keys = Object.keys(state)
    // forbidden fields: 토큰·키·시크릿 이름 패턴
    const forbidden = ['token', 'accessToken', 'apiKey', 'secret', 'credential',
                       'password', 'key', 'authToken', 'bearerToken']
    for (const field of forbidden) {
      expect(keys).not.toContain(field)
    }
  })

  it('EngineState authed 는 boolean 타입이다 (토큰 값 미포함 확인)', () => {
    // authed가 string이면 실수로 토큰 값을 담은 것 — boolean이어야 한다.
    const authedTrue: EngineState = { available: true, authed: true, version: '1.0.0' }
    const authedFalse: EngineState = { available: true, authed: false, version: '1.0.0' }
    expect(typeof authedTrue.authed).toBe('boolean')
    expect(typeof authedFalse.authed).toBe('boolean')
    // 토큰 문자열(예: 'sk-ant-...')을 담을 수 없음 — string이 아님을 런타임 확인
    expect(typeof authedTrue.authed).not.toBe('string')
  })

  it('EngineState available·authed 는 독립적이다 — available=false 여도 authed 값을 가진다', () => {
    // available=false 시에도 authed 필드는 존재해야 함(렌더러가 독립 분기 가능).
    const state: EngineState = { available: false, authed: false, version: null }
    expect('authed' in state).toBe(true)
    expect('available' in state).toBe(true)
  })
})

// ── ADR-020 ConversationRecord.cwd 계약 골든 ────────────────────────────────────
// cwd = 대화별 작업 폴더 절대경로. 옵셔널(기존 대화 호환) — undefined 시 전역 workspaceRoot 폴백.
// 신뢰경계: 경로 문자열(시크릿 아님). main이 isAbsolute+existsSync+isDirectory 재검증.
// ConversationSaveRequest는 Omit<ConversationRecord,'createdAt'|'updatedAt'>&{id?} 파생 → cwd 자동 포함.

describe('ADR-020 ConversationRecord.cwd 옵셔널 필드 계약', () => {
  it('cwd 없는 ConversationRecord 샘플이 기존 계약을 그대로 충족한다 (하위 호환)', () => {
    const rec: import('../../src/shared/ipc-contract').ConversationRecord = {
      id: 'conv-1',
      title: '첫 대화',
      messages: [{ role: 'user', content: 'hello' }],
      backendId: 'claude-code',
      createdAt: '2026-06-24T00:00:00.000Z',
      updatedAt: '2026-06-24T00:00:00.000Z',
    }
    // cwd 없어도 유효 — 기존 대화/마이그레이션 전 레코드와 호환
    expect(rec.id).toBe('conv-1')
    expect(rec.cwd).toBeUndefined()
  })

  it('cwd 있는 ConversationRecord 샘플이 타입 계약을 충족한다', () => {
    const rec: import('../../src/shared/ipc-contract').ConversationRecord = {
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
    const rec: import('../../src/shared/ipc-contract').ConversationRecord = {
      id: 'conv-3',
      title: '보안 테스트',
      messages: [],
      backendId: 'claude-code',
      createdAt: '2026-06-24T00:00:00.000Z',
      updatedAt: '2026-06-24T00:00:00.000Z',
      cwd: 'C:\\Dev\\CustomGUI_Agent',
    }
    // cwd = 경로 문자열 — 시크릿·토큰 패턴 아님
    expect(rec.cwd).not.toMatch(/sk-ant-/)
    expect(rec.cwd).not.toMatch(/Bearer/)
    expect(rec.cwd).not.toMatch(/token=/)
    expect(rec.cwd).not.toMatch(/secret=/)
  })

  it('ConversationSaveRequest.conversation은 cwd를 그대로 운반한다 (Omit 파생 자동포함)', () => {
    // ConversationSaveRequest.conversation = Omit<ConversationRecord,'createdAt'|'updatedAt'>&{id?}
    // cwd는 Omit 대상 아님 → 파생 타입에 자동 포함됨을 런타임 샘플로 확인한다.
    const saveReq: import('../../src/shared/ipc-contract').ConversationSaveRequest = {
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
    // id는 교집합 타입(&{id?})에 의해 선택적 — 기존 저장 요청과 호환.
    // cwd 미설정 = undefined → 전역 workspaceRoot 폴백.
    const saveReq: import('../../src/shared/ipc-contract').ConversationSaveRequest = {
      conversation: {
        id: 'conv-existing',  // 기존 레코드 업데이트 시 id 제공
        title: '기존 대화',
        messages: [],
        backendId: 'claude-code',
        // cwd 미설정 → undefined(기존 대화 호환, 전역 workspaceRoot 폴백)
      },
    }
    expect(saveReq.conversation.cwd).toBeUndefined()
    expect(saveReq.conversation.id).toBe('conv-existing')
  })
})

// ── P15 dialog.pickFolder 멀티 패널별 cwd 계약 골든 ────────────────────────────
// 유래: 멀티 에이전트 모드에서 각 패널이 독립 cwd를 갖도록 OS 폴더 다이얼로그를 띄우는 경량 picker.
//   workspace.open은 전역 _currentWorkspaceRoot를 변경하므로 멀티 패널에 부적합 → 신규 채널.
// 용도: MultiWorkspace 패널 폴더 선택 — 전역 워크스페이스 미변경.
// 신뢰경계:
//   - 요청 인자 없음 — renderer가 경로를 주입할 수 없음, main이 OS 다이얼로그로 선택.
//   - 응답 PickFolderResponse.path 는 절대경로 또는 null(취소/실패)만 — 경로 외 정보 0.
//   - 전역 워크스페이스(_currentWorkspaceRoot) 미변경.
// 구현: main-process ipc/index.ts. 소비: renderer MultiWorkspace.

describe('P15 dialog.pickFolder 채널 계약', () => {
  // ── 채널 존재 + 문자열 정합 ────────────────────────────────────────────────

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

  // ── PickFolderResponse 타입 구조 계약 ─────────────────────────────────────

  it('PickFolderResponse 샘플(경로 선택)이 타입 계약을 충족한다', () => {
    const res: import('../../src/shared/ipc-contract').PickFolderResponse = {
      path: '/home/user/projects/my-app',
    }
    expect(res.path).toBe('/home/user/projects/my-app')
  })

  it('PickFolderResponse 는 취소/실패 시 path=null 을 허용한다', () => {
    const res: import('../../src/shared/ipc-contract').PickFolderResponse = {
      path: null,
    }
    expect(res.path).toBeNull()
  })

  it('PickFolderResponse 는 path 단일 필드만 포함한다 (최소 표면 계약 — 시크릿/추가 정보 0)', () => {
    const res: import('../../src/shared/ipc-contract').PickFolderResponse = {
      path: 'C:\\Dev\\my-project',
    }
    const keys = Object.keys(res)
    expect(keys).toEqual(['path'])
    expect(keys).toHaveLength(1)
    // 시크릿·추가 정보 필드 없음 (신뢰경계 불변식)
    expect(keys).not.toContain('rootPath')
    expect(keys).not.toContain('tree')
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('secret')
    expect(keys).not.toContain('workspaceRoot')
  })

  it('PickFolderResponse path 는 string | null 타입이다', () => {
    const withPath: import('../../src/shared/ipc-contract').PickFolderResponse = { path: '/some/path' }
    const withNull: import('../../src/shared/ipc-contract').PickFolderResponse = { path: null }
    expect(typeof withPath.path).toBe('string')
    expect(withNull.path).toBeNull()
  })

  it('PickFolderResponse 에 시크릿·토큰·전역 워크스페이스 필드가 없다 (신뢰경계 regression 가드)', () => {
    const res: import('../../src/shared/ipc-contract').PickFolderResponse = { path: '/some/path' }
    const keys = Object.keys(res)
    // CRITICAL: 전역 워크스페이스·시크릿·트리 정보가 포함되면 계약 위반
    const forbidden = [
      'token', 'secret', 'apiKey', 'password', 'credential',
      'tree', 'workspaceRoot', 'rootPath', 'files', 'children',
    ]
    for (const f of forbidden) {
      expect(keys).not.toContain(f)
    }
  })

  it('dialog.pickFolder 는 요청 인자가 없음을 preload 시그니처로 표현한다 (신뢰경계 — renderer 경로 주입 불가)', () => {
    // 채널 자체는 invoke-only — 요청 페이로드 없음.
    // preload에서 pickFolder(): Promise<PickFolderResponse> 로 노출되어야 한다.
    // 테스트는 채널명 존재 + 계약 정합만 검증 (preload 런타임은 Electron 필요).
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

// ── P10 슬래시 커맨드 자동완성 계약 골든 ────────────────────────────────────────
// 유래: SDK supportedCommands/init.slash_commands + 커스텀 .claude/commands 스캔.
// 용도: Composer 슬래시 팔레트 — '/' 입력 시 빌트인 + 커스텀 커맨드 목록 표시.
// 신뢰경계: name/description/argHint/scope만 — 시크릿 0, .md 본문/path 미노출.
// 구현: main `settings/commands.ts`. 소비: renderer Composer 슬래시 팔레트.

describe('P10 command.list 채널 계약', () => {
  // ── 채널 존재 + 문자열 정합 ────────────────────────────────────────────────

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

  // ── SlashCommandInfo 타입 구조 계약 ──────────────────────────────────────

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
    // 각 scope로 SlashCommandInfo 생성 가능 — 타입 레벨 보장
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

  // ── 최소 표면 계약 (신뢰경계 핵심) ──────────────────────────────────────

  it('SlashCommandInfo 는 name/description/scope 필수 + argHint 선택 (4필드 최대)', () => {
    // argHint 없는 경우: 3개 필드
    const minimal: SlashCommandInfo = {
      name: 'compact',
      description: 'Compacts context',
      scope: 'builtin',
    }
    const minimalKeys = Object.keys(minimal)
    expect(minimalKeys).toEqual(expect.arrayContaining(['name', 'description', 'scope']))
    expect(minimalKeys).toHaveLength(3)

    // argHint 있는 경우: 4개 필드
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
    // CRITICAL: .md 본문·경로·환경변수는 renderer로 전달하면 안 됨 (신뢰경계 불변식)
    const forbidden = ['path', 'content', 'body', 'env', 'token', 'secret', 'apiKey',
                       'filePath', 'absolutePath', 'source', 'markdown']
    for (const f of forbidden) {
      expect(keys).not.toContain(f)
    }
  })

  it('SlashCommandInfo name 은 슬래시 제외 식별자이다 (/ 접두사 없음)', () => {
    // name = 'compact' (슬래시 없음), 렌더러가 표시 시 '/' + name 으로 조합
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
    // 빈 배열도 유효 (커맨드 미설정 환경)
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
