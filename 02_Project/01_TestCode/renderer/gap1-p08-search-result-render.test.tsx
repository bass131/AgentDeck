// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { applyAgentEvent, makeInitialState } from '../../../02_Project/00_Source/renderer/src/store/reducer'
import type { AppState, ToolCard } from '../../../02_Project/00_Source/renderer/src/store/reducer'
import type { ThreadItem } from '../../../02_Project/00_Source/renderer/src/store/threadTypes'
import type { AgentEventPayload } from '../../../02_Project/00_Source/shared/ipc/agent'
import type { AgentEventSearchResult } from '../../../02_Project/00_Source/shared/agentEvents'
import { ToolCallCard } from '../../../02_Project/00_Source/renderer/src/features/conversation/ToolCallCard'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const runId = 'run-p08'

function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

type CardWithSearch = ToolCard & { searchResult?: AgentEventSearchResult }

function allToolCards(state: AppState): CardWithSearch[] {
  return state.thread
    .filter((item): item is Extract<ThreadItem, { kind: 'toolgroup' }> => item.kind === 'toolgroup')
    .flatMap((group) => group.tools as CardWithSearch[])
}

const SEARCH_VIEW_PATH = '../../../02_Project/00_Source/renderer/src/features/conversation/SearchResultView'

async function getStore() {
  const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
  return useAppStore
}

async function spyOpenFile() {
  const store = await getStore()
  const openFileSpy = vi.fn().mockResolvedValue(undefined)
  store.setState({ openFile: openFileSpy } as Parameters<typeof store.setState>[0])
  return openFileSpy
}

const CONTENT_RESULT: AgentEventSearchResult = {
  type: 'search_result',
  toolUseId: 'tc-grep',
  mode: 'content',
  matches: [
    { path: '02_Project/00_Source/main/index.ts', line: 10, text: "import { app } from 'electron'" },
    { path: '02_Project/00_Source/main/index.ts', line: 42, text: 'app.whenReady()' },
    { path: '02_Project/00_Source/renderer/src/App.tsx', line: 7, text: 'export function App()' },
  ],
  files: ['02_Project/00_Source/main/index.ts', '02_Project/00_Source/renderer/src/App.tsx'],
  total: 3,
}

const FILES_RESULT: AgentEventSearchResult = {
  type: 'search_result',
  toolUseId: 'tc-grep',
  mode: 'files_with_matches',
  files: ['02_Project/00_Source/main/a.ts', '02_Project/00_Source/main/b.ts', '02_Project/01_TestCode/c.test.ts'],
  total: 3,
}

const COUNT_RESULT: AgentEventSearchResult = {
  type: 'search_result',
  toolUseId: 'tc-grep',
  mode: 'count',
  files: ['02_Project/00_Source/a.ts', '02_Project/00_Source/b.ts'],
  total: 17,
}

const GLOB_RESULT: AgentEventSearchResult = {
  type: 'search_result',
  toolUseId: 'tc-glob',
  mode: 'glob',
  files: ['02_Project/00_Source/main/index.ts', '02_Project/00_Source/preload/index.ts'],
  total: 245,
  truncated: true,
}

describe("GAP1 P08 — reducer 'search_result' 카드 부착 (RED)", () => {
  function stateWithGrepCard(): AppState {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({ type: 'tool_call', id: 'tc-grep', name: 'Grep', input: { pattern: 'app' } })
    )
    return applyAgentEvent(s1, payload({ type: 'tool_result', id: 'tc-grep', ok: true, output: 'raw grep text' }))
  }

  it('toolUseId 매칭 카드에 card.searchResult = event 부착(기존 status/result 불변)', () => {
    const base = stateWithGrepCard()
    const next = applyAgentEvent(base, payload(CONTENT_RESULT))
    const card = allToolCards(next).find((c) => c.id === 'tc-grep')
    expect(card).toBeTruthy()
    expect(card?.searchResult).toEqual(CONTENT_RESULT)
    expect(card?.status).toBe('done')
    expect(card?.result).toBe('raw grep text')
  })

  it('toolUseId 없음 → no-op(어떤 카드에도 searchResult 부착 없음·throw 없음)', () => {
    const base = stateWithGrepCard()
    const noId: AgentEventSearchResult = {
      type: 'search_result',
      mode: 'files_with_matches',
      files: ['02_Project/00_Source/a.ts'],
      total: 1,
    }
    const next = applyAgentEvent(base, payload(noId))
    for (const card of allToolCards(next)) {
      expect(card.searchResult).toBeUndefined()
    }
  })

  it('toolUseId 미매칭(카드 없음) → no-op', () => {
    const base = stateWithGrepCard()
    const orphan: AgentEventSearchResult = { ...FILES_RESULT, toolUseId: 'tc-없는-카드' }
    const next = applyAgentEvent(base, payload(orphan))
    for (const card of allToolCards(next)) {
      expect(card.searchResult).toBeUndefined()
    }
  })
})

describe('GAP1 P08 — SearchResultView content 모드 그룹핑 렌더 (RED)', () => {
  it('path별 그룹핑 — 파일 헤더 2개([data-search-file]) + 매치 라인 3개([data-search-match])', async () => {
    const { SearchResultView } = await import(SEARCH_VIEW_PATH)
    const { container } = render(<SearchResultView result={CONTENT_RESULT} />)

    const headers = container.querySelectorAll('[data-search-file]')
    expect(headers.length).toBe(2)
    expect(container.querySelector('[data-search-file="02_Project/00_Source/main/index.ts"]')).toBeTruthy()
    expect(container.querySelector('[data-search-file="02_Project/00_Source/renderer/src/App.tsx"]')).toBeTruthy()

    const matchRows = container.querySelectorAll('[data-search-match]')
    expect(matchRows.length).toBe(3)
    const indexMatches = container.querySelectorAll('[data-search-match][data-path="02_Project/00_Source/main/index.ts"]')
    expect(indexMatches.length).toBe(2)

    const line10 = container.querySelector('[data-search-match][data-line="10"]')
    expect(line10?.textContent).toContain('10')
    expect(line10?.textContent).toContain("import { app } from 'electron'")
  })

  it('파일 헤더 클릭 → store openFile(path) 호출', async () => {
    const openFileSpy = await spyOpenFile()
    const { SearchResultView } = await import(SEARCH_VIEW_PATH)
    const { container } = render(<SearchResultView result={CONTENT_RESULT} />)

    const header = container.querySelector('[data-search-file="02_Project/00_Source/main/index.ts"]') as HTMLElement
    expect(header).toBeTruthy()
    fireEvent.click(header)

    expect(openFileSpy).toHaveBeenCalledWith('02_Project/00_Source/main/index.ts')
  })

  it('매치 라인 클릭 → store openFile(해당 매치의 path) 호출', async () => {
    const openFileSpy = await spyOpenFile()
    const { SearchResultView } = await import(SEARCH_VIEW_PATH)
    const { container } = render(<SearchResultView result={CONTENT_RESULT} />)

    const row = container.querySelector('[data-search-match][data-line="7"]') as HTMLElement
    expect(row).toBeTruthy()
    fireEvent.click(row)

    expect(openFileSpy).toHaveBeenCalledWith('02_Project/00_Source/renderer/src/App.tsx', undefined, 7)
  })
})

describe('GAP1 P08 — SearchResultView 파일목록 모드(files_with_matches/count/glob) 렌더 (RED)', () => {
  it('files_with_matches — 파일 행 3개 + 행 클릭 → openFile(path)', async () => {
    const openFileSpy = await spyOpenFile()
    const { SearchResultView } = await import(SEARCH_VIEW_PATH)
    const { container } = render(<SearchResultView result={FILES_RESULT} />)

    const rows = container.querySelectorAll('[data-search-file]')
    expect(rows.length).toBe(3)

    const row = container.querySelector('[data-search-file="02_Project/00_Source/main/b.ts"]') as HTMLElement
    expect(row).toBeTruthy()
    fireEvent.click(row)
    expect(openFileSpy).toHaveBeenCalledWith('02_Project/00_Source/main/b.ts')
  })

  it('count — 파일 행 2개 + total(17) 표기', async () => {
    const { SearchResultView } = await import(SEARCH_VIEW_PATH)
    const { container } = render(<SearchResultView result={COUNT_RESULT} />)

    expect(container.querySelectorAll('[data-search-file]').length).toBe(2)
    expect(container.textContent).toContain('17')
  })

  it('glob — 파일 행 2개 + total(245) 표기', async () => {
    const { SearchResultView } = await import(SEARCH_VIEW_PATH)
    const { container } = render(<SearchResultView result={GLOB_RESULT} />)

    expect(container.querySelectorAll('[data-search-file]').length).toBe(2)
    expect(container.textContent).toContain('245')
  })
})

describe('GAP1 P08 — ToolCallCard searchResult 배선 + raw 폴백', () => {
  it('card.searchResult 있음 → 펼침 상세에 SearchResultView([data-search-file]) 렌더 (RED)', () => {
    const card = {
      id: 'tc-grep',
      name: 'Grep',
      input: { pattern: 'app' },
      status: 'done',
      result: 'raw grep text',
      searchResult: FILES_RESULT,
    } as CardWithSearch
    const { container } = render(<ToolCallCard card={card} />)

    fireEvent.click(container.querySelector('.t-row')!)

    expect(container.querySelector('[data-search-file]')).toBeTruthy()
  })

  it('폴백: card.searchResult 없음 → 기존 raw <pre>(.bo-res) 유지 + 검색 렌더 없음 (GREEN 회귀 핀)', () => {
    const card: ToolCard = {
      id: 'tc-grep-raw',
      name: 'Grep',
      input: { pattern: 'app' },
      status: 'done',
      result: 'raw grep text',
    }
    const { container } = render(<ToolCallCard card={card} />)
    fireEvent.click(container.querySelector('.t-row')!)

    const pre = container.querySelector('.bo-res')
    expect(pre).toBeTruthy()
    expect(pre?.textContent).toContain('raw grep text')
    expect(container.querySelector('[data-search-file]')).toBeFalsy()
  })
})
