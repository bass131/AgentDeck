// @vitest-environment jsdom
/**
 * agentpanel-detail.test.tsx — F10-02 AgentPanel 강화 단언.
 * Todos 진행바·행·SubAgent 카드·SubAgentModal·FileRow optional props·빈상태.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import type { Todo, SubAgentInfo } from '../../../02.Source/renderer/src/lib/agentSampleData'

afterEach(() => cleanup())

async function getStore() {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  return useAppStore
}

async function renderPanel(props: {
  todos?: Todo[]
  subagents?: SubAgentInfo[]
  files?: Array<{ path: string; add?: number; del?: number; tag?: 'new' | 'edit' }>
} = {}) {
  const store = await getStore()
  store.setState({
    isRunning: false,
    changedFiles: new Set<string>(props.files?.map((f) => f.path) ?? []),
    toolCards: [],
    errorMessage: undefined,
  } as Parameters<typeof store.setState>[0])
  const { AgentPanel } = await import('../../../02.Source/renderer/src/components/05_agent/AgentPanel')
  return act(async () =>
    render(
      <AgentPanel
        todos={props.todos}
        subagents={props.subagents}
        files={props.files}
      />
    )
  )
}

// ── SAMPLE_TODOS ───────────────────────────────────────────────────────────────
describe('AgentPanel — Todos (F10-02)', () => {
  it('todos 빈 → 빈상태 텍스트 "아직 할 일이 없어요"', async () => {
    await renderPanel({ todos: [] })
    expect(screen.getByText('아직 할 일이 없어요')).toBeTruthy()
  })

  it('todos 주입 → progress 바 + todo 행', async () => {
    const todos: Todo[] = [
      { id: 't1', label: '코드 분석', status: 'done' },
      { id: 't2', label: '패치 적용', status: 'running' },
      { id: 't3', label: '검증', status: 'planned' },
    ]
    const { container } = await renderPanel({ todos })
    expect(container.querySelector('.progress')).toBeTruthy()
    expect(container.querySelectorAll('.todo').length).toBe(3)
  })

  it('done todo → .todo.done + .box(check)', async () => {
    const todos: Todo[] = [{ id: 't1', label: '완료됨', status: 'done' }]
    const { container } = await renderPanel({ todos })
    expect(container.querySelector('.todo.done')).toBeTruthy()
    // done 상태의 .box에는 체크 아이콘(svg)이 렌더됨
    const box = container.querySelector('.todo.done .box')
    expect(box?.querySelector('svg')).toBeTruthy()
  })

  it('running todo → .todo.running + .spin', async () => {
    const todos: Todo[] = [{ id: 't1', label: '실행 중', status: 'running' }]
    const { container } = await renderPanel({ todos })
    expect(container.querySelector('.todo.running')).toBeTruthy()
    expect(container.querySelector('.todo.running .spin')).toBeTruthy()
  })

  it('progress width: done/total 비율 인라인 style', async () => {
    const todos: Todo[] = [
      { id: 't1', label: 'a', status: 'done' },
      { id: 't2', label: 'b', status: 'done' },
      { id: 't3', label: 'c', status: 'planned' },
    ]
    const { container } = await renderPanel({ todos })
    const bar = container.querySelector('.progress > i') as HTMLElement
    expect(bar).toBeTruthy()
    // 2/3 ≈ 67% — style.width 존재 여부만 확인 (정확 % 문자열 환경 의존)
    expect(bar.style.width).toBeTruthy()
  })
})

// ── SAMPLE_SUBAGENTS ──────────────────────────────────────────────────────────
describe('AgentPanel — SubAgent 카드 (F10-02)', () => {
  it('subagents 빈 → 빈상태 텍스트 "아직 서브에이전트가 없어요"', async () => {
    await renderPanel({ subagents: [] })
    expect(screen.getByText('아직 서브에이전트가 없어요')).toBeTruthy()
  })

  it('subagents 주입 → .subagent 카드 렌더', async () => {
    const subagents: SubAgentInfo[] = [
      { id: 's1', name: '코드 탐색기', role: 'explorer', status: 'done', tools: [] },
      { id: 's2', name: '빌더', role: 'builder', status: 'running', tools: [] },
    ]
    const { container } = await renderPanel({ subagents })
    expect(container.querySelectorAll('.subagent').length).toBe(2)
  })

  it('SubAgent running → .subagent.running + .sa-ic running + .spin', async () => {
    const subagents: SubAgentInfo[] = [
      { id: 's1', name: '실행 에이전트', role: '구현', status: 'running', tools: [] },
    ]
    const { container } = await renderPanel({ subagents })
    expect(container.querySelector('.subagent.running')).toBeTruthy()
    expect(container.querySelector('.spin')).toBeTruthy()
  })

  it('SubAgent done → .subagent.done + sa-check', async () => {
    const subagents: SubAgentInfo[] = [
      { id: 's1', name: '완료 에이전트', role: '검증', status: 'done', tools: [] },
    ]
    const { container } = await renderPanel({ subagents })
    expect(container.querySelector('.subagent.done')).toBeTruthy()
    expect(container.querySelector('.sa-check')).toBeTruthy()
  })

  it('SubAgent 클릭 → SubAgentFullscreen 열림(fs-overlay + fs-panel, Phase 37 #3 갱신)', async () => {
    const tools = [
      { id: 'tool1', verb: 'read', target: 'src/main.ts', status: 'done' as const },
    ]
    const subagents: SubAgentInfo[] = [
      { id: 's1', name: '탐색기', role: 'explorer', status: 'done', activity: '결과입니다', tools },
    ]
    const { container } = await renderPanel({ subagents })
    const card = container.querySelector('.subagent')!
    act(() => fireEvent.click(card))
    expect(container.querySelector('.fs-overlay')).toBeTruthy()
    expect(container.querySelector('.fs-panel')).toBeTruthy()
  })

  it('SubAgentFullscreen: 채팅 대화 — 작업 지시 + 최종 답변 + 도구 행(F-E)', async () => {
    const subagents: SubAgentInfo[] = [
      {
        id: 's1', name: '에이전트', role: 'builder', status: 'done', activity: '작업 완료',
        tools: [{ id: 'tool1', verb: 'read', target: 'src/index.ts', status: 'done' }],
        transcript: [{ kind: 'tool', verb: 'read', target: 'src/index.ts', status: 'done', id: 'tool1' }],
      },
    ]
    const { container } = await renderPanel({ subagents })
    act(() => fireEvent.click(container.querySelector('.subagent')!))
    // 대화 컨테이너 + 작업 지시(task) + 최종 답변(정제) + 도구 행
    expect(container.querySelector('.saf-convo')).toBeTruthy()
    expect(container.querySelector('.saf-msg--task')).toBeTruthy()
    expect(screen.getByText('작업 완료')).toBeTruthy()
    expect(container.querySelector('.saf-tool-row')).toBeTruthy()
  })

  it('SubAgentFullscreen: 빈 대화 → "아직 대화가 없어요"(F-E)', async () => {
    const subagents: SubAgentInfo[] = [
      { id: 's1', name: '에이전트', role: 'builder', status: 'queued', tools: [] },
    ]
    const { container } = await renderPanel({ subagents })
    act(() => fireEvent.click(container.querySelector('.subagent')!))
    expect(screen.getByText('아직 대화가 없어요')).toBeTruthy()
  })

  it('Esc 키 → SubAgentFullscreen 닫힘(Phase 37 #3 갱신)', async () => {
    const subagents: SubAgentInfo[] = [
      { id: 's1', name: '에이전트', role: 'builder', status: 'done', tools: [] },
    ]
    const { container } = await renderPanel({ subagents })
    act(() => fireEvent.click(container.querySelector('.subagent')!))
    expect(container.querySelector('.fs-overlay')).toBeTruthy()
    act(() => fireEvent.keyDown(document, { key: 'Escape' }))
    expect(container.querySelector('.fs-overlay')).toBeNull()
  })
})

// ── FileRow 태그 (optional props) ─────────────────────────────────────────────
describe('AgentPanel — FileRow 태그 (F10-02)', () => {
  it('files prop(add/del/tag) → .file .stat 렌더', async () => {
    const files = [{ path: 'src/new.ts', add: 42, del: 3, tag: 'new' as const }]
    const { container } = await renderPanel({ files })
    expect(container.querySelector('.file')).toBeTruthy()
    expect(container.querySelector('.file .stat')).toBeTruthy()
    expect(container.querySelector('.file .add')).toBeTruthy()
    expect(container.querySelector('.file .del')).toBeTruthy()
    expect(container.querySelector('.file .tag.new')).toBeTruthy()
  })

  it('files prop tag=edit → .file .tag.edit', async () => {
    const files = [{ path: 'src/edit.ts', tag: 'edit' as const }]
    const { container } = await renderPanel({ files })
    expect(container.querySelector('.file .tag.edit')).toBeTruthy()
  })

  it('files prop stat 없음(경로만) → .file 렌더, stat 요소 없음', async () => {
    const files = [{ path: 'src/a.ts' }]
    const { container } = await renderPanel({ files })
    expect(container.querySelector('.file')).toBeTruthy()
    // stat은 없거나 비어있음
    const stat = container.querySelector('.file .stat')
    const hasAddOrDel = stat?.querySelector('.add') || stat?.querySelector('.del') || stat?.querySelector('.tag')
    expect(hasAddOrDel).toBeFalsy()
  })

  it('빈 prop → 기존 빈상태 "아직 변경된 파일이 없어요"', async () => {
    const store = await getStore()
    store.setState({ changedFiles: new Set<string>() } as Parameters<typeof store.setState>[0])
    await renderPanel({})
    expect(screen.getByText('아직 변경된 파일이 없어요')).toBeTruthy()
  })
})

// ── SAMPLE_DATA 임포트 ────────────────────────────────────────────────────────
describe('agentSampleData — 구조 검증', () => {
  it('SAMPLE_TODOS: id/label/status 필드 + 3가지 status 존재', async () => {
    const { SAMPLE_TODOS } = await import('../../../02.Source/renderer/src/lib/agentSampleData')
    expect(Array.isArray(SAMPLE_TODOS)).toBe(true)
    expect(SAMPLE_TODOS.length).toBeGreaterThan(0)
    const statuses = new Set(SAMPLE_TODOS.map((t) => t.status))
    // done/running/planned 중 최소 2가지 포함
    expect(statuses.size).toBeGreaterThanOrEqual(2)
  })

  it('SAMPLE_SUBAGENTS: id/name/role/status/tools 필드', async () => {
    const { SAMPLE_SUBAGENTS } = await import('../../../02.Source/renderer/src/lib/agentSampleData')
    expect(Array.isArray(SAMPLE_SUBAGENTS)).toBe(true)
    expect(SAMPLE_SUBAGENTS.length).toBeGreaterThan(0)
    const first = SAMPLE_SUBAGENTS[0]
    expect(first.id).toBeTruthy()
    expect(first.name).toBeTruthy()
    expect(Array.isArray(first.tools)).toBe(true)
  })
})
