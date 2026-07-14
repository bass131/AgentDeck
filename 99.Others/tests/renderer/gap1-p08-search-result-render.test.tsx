// @vitest-environment jsdom
/**
 * gap1-p08-search-result-render.test.tsx — GAP1 P08 search_result renderer RED (TDD 선행).
 *
 * 대상(R only — qa는 앱 소스 미편집, 구현은 renderer Worker 몫):
 *   02.Source/renderer/src/store/reducer.ts          — case 'search_result' 신설(현재 default 무시)
 *   02.Source/renderer/src/store/reducer/types.ts    — ToolCard에 additive optional
 *                                                      `searchResult?: AgentEventSearchResult`
 *   02.Source/renderer/src/components/01_conversation/SearchResultView.tsx — 신규(현재 미존재)
 *   02.Source/renderer/src/components/01_conversation/ToolCallCard.tsx     — searchResult 배선
 *
 * 계약(interface-of-record — 구현이 여기에 맞춘다):
 *   [store] applyAgentEvent case 'search_result' → thread toolgroup 내 event.toolUseId 매칭
 *     카드에 card.searchResult = event(AgentEventSearchResult 그대로) 부착.
 *     toolUseId 없음/미매칭 → no-op(어떤 카드에도 부착 없음·throw 없음).
 *   [컴포넌트] SearchResultView — named export, props { result: AgentEventSearchResult }.
 *     · content 모드: path별 그룹핑 — 파일 헤더 [data-search-file="<path>"](클릭 가능)
 *       + 매치 라인 [data-search-match][data-path="<path>"][data-line="<line>"]
 *       (textContent에 라인번호+매치 텍스트, 클릭 가능).
 *     · files_with_matches/count/glob: 파일 목록 행 [data-search-file="<path>"](클릭 가능)
 *       + total 표기(textContent에 total 숫자 포함).
 *     · 클릭 → store openFile(path) 호출(viewer slice — window.api.fsRead 경유.
 *       테스트는 agentpanel-fileopen.test.tsx 패턴대로 store action을 spy로 교체).
 *   [배선] ToolCallCard — card.searchResult 있으면 펼침 상세에 SearchResultView 렌더,
 *     없으면 기존 raw <pre>(.bo-res) 유지(폴백 — 기존 동작 회귀 0).
 *
 * TDD 상태: RED.
 *   - reducer는 'search_result'를 default(무시)로 흘려 searchResult 미부착 → 부착 단정 FAIL.
 *   - SearchResultView 모듈이 미존재 → dynamic import 에러 FAIL(P07 선례 — 이 컴포넌트에
 *     한해 모듈 미존재 import 에러 허용).
 *   - ToolCallCard는 searchResult를 몰라 [data-search-file] 미렌더 → 배선 단정 FAIL.
 *   - no-op·raw 폴백 케이스는 현행 거동 그대로 GREEN(회귀 핀 — 구현 후에도 불변).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { applyAgentEvent, makeInitialState } from '../../../02.Source/renderer/src/store/reducer'
import type { AppState, ToolCard } from '../../../02.Source/renderer/src/store/reducer'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc/agent'
import type { AgentEventSearchResult } from '../../../02.Source/shared/agent-events'
import { ToolCallCard } from '../../../02.Source/renderer/src/components/01_conversation/ToolCallCard'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ── 공통 헬퍼 ────────────────────────────────────────────────────────────────────

const runId = 'run-p08'

function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

/** ToolCard + 구현 예정 additive 필드(searchResult) — 구현 전 타입 다리(P07 선례). */
type CardWithSearch = ToolCard & { searchResult?: AgentEventSearchResult }

function allToolCards(state: AppState): CardWithSearch[] {
  return state.thread
    .filter((item): item is Extract<ThreadItem, { kind: 'toolgroup' }> => item.kind === 'toolgroup')
    .flatMap((group) => group.tools as CardWithSearch[])
}

const SEARCH_VIEW_PATH = '../../../02.Source/renderer/src/components/01_conversation/SearchResultView'

async function getStore() {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  return useAppStore
}

/** store.openFile을 spy로 교체 — IPC 실제 호출 없이 action 호출만 검증(단방향 흐름). */
async function spyOpenFile() {
  const store = await getStore()
  const openFileSpy = vi.fn().mockResolvedValue(undefined)
  store.setState({ openFile: openFileSpy } as Parameters<typeof store.setState>[0])
  return openFileSpy
}

// ── 고정 fixture (합성 — 어댑터 골든과 동일 계약 형상) ───────────────────────────

const CONTENT_RESULT: AgentEventSearchResult = {
  type: 'search_result',
  toolUseId: 'tc-grep',
  mode: 'content',
  matches: [
    { path: '02.Source/main/index.ts', line: 10, text: "import { app } from 'electron'" },
    { path: '02.Source/main/index.ts', line: 42, text: 'app.whenReady()' },
    { path: '02.Source/renderer/src/App.tsx', line: 7, text: 'export function App()' },
  ],
  files: ['02.Source/main/index.ts', '02.Source/renderer/src/App.tsx'],
  total: 3,
}

const FILES_RESULT: AgentEventSearchResult = {
  type: 'search_result',
  toolUseId: 'tc-grep',
  mode: 'files_with_matches',
  files: ['02.Source/main/a.ts', '02.Source/main/b.ts', '99.Others/tests/c.test.ts'],
  total: 3,
}

const COUNT_RESULT: AgentEventSearchResult = {
  type: 'search_result',
  toolUseId: 'tc-grep',
  mode: 'count',
  files: ['02.Source/a.ts', '02.Source/b.ts'],
  total: 17,
}

const GLOB_RESULT: AgentEventSearchResult = {
  type: 'search_result',
  toolUseId: 'tc-glob',
  mode: 'glob',
  files: ['02.Source/main/index.ts', '02.Source/preload/index.ts'],
  total: 245,
  truncated: true,
}

// ── 1. store: applyAgentEvent case 'search_result' → 카드 부착 ──────────────────

describe("GAP1 P08 — reducer 'search_result' 카드 부착 (RED)", () => {
  /** tool_call(tc-grep) + tool_result까지 흘린 기저 상태. */
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
    // RED: 현행 reducer는 'search_result'를 default(무시)로 흘림 → searchResult undefined.
    expect(card?.searchResult).toEqual(CONTENT_RESULT)
    // 부착만 — tool_result가 채운 기존 필드는 그대로.
    expect(card?.status).toBe('done')
    expect(card?.result).toBe('raw grep text')
  })

  it('toolUseId 없음 → no-op(어떤 카드에도 searchResult 부착 없음·throw 없음)', () => {
    const base = stateWithGrepCard()
    const noId: AgentEventSearchResult = {
      type: 'search_result',
      mode: 'files_with_matches',
      files: ['02.Source/a.ts'],
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

// ── 2. 컴포넌트: SearchResultView (신규 — 현재 모듈 미존재 → import 에러 RED) ────

describe('GAP1 P08 — SearchResultView content 모드 그룹핑 렌더 (RED)', () => {
  it('path별 그룹핑 — 파일 헤더 2개([data-search-file]) + 매치 라인 3개([data-search-match])', async () => {
    const { SearchResultView } = await import(SEARCH_VIEW_PATH)
    const { container } = render(<SearchResultView result={CONTENT_RESULT} />)

    // 파일 헤더: 경로별 1개(중복 경로는 그룹 헤더 하나로 묶임).
    const headers = container.querySelectorAll('[data-search-file]')
    expect(headers.length).toBe(2)
    expect(container.querySelector('[data-search-file="02.Source/main/index.ts"]')).toBeTruthy()
    expect(container.querySelector('[data-search-file="02.Source/renderer/src/App.tsx"]')).toBeTruthy()

    // 매치 라인: flat matches 3건 전부 — data-path/data-line으로 소속·위치 식별.
    const matchRows = container.querySelectorAll('[data-search-match]')
    expect(matchRows.length).toBe(3)
    const indexMatches = container.querySelectorAll('[data-search-match][data-path="02.Source/main/index.ts"]')
    expect(indexMatches.length).toBe(2)

    // 라인번호 + 매치 텍스트가 함께 표시된다(라인번호만/텍스트만 있는 렌더 방지).
    const line10 = container.querySelector('[data-search-match][data-line="10"]')
    expect(line10?.textContent).toContain('10')
    expect(line10?.textContent).toContain("import { app } from 'electron'")
  })

  it('파일 헤더 클릭 → store openFile(path) 호출', async () => {
    const openFileSpy = await spyOpenFile()
    const { SearchResultView } = await import(SEARCH_VIEW_PATH)
    const { container } = render(<SearchResultView result={CONTENT_RESULT} />)

    const header = container.querySelector('[data-search-file="02.Source/main/index.ts"]') as HTMLElement
    expect(header).toBeTruthy()
    fireEvent.click(header)

    expect(openFileSpy).toHaveBeenCalledWith('02.Source/main/index.ts')
  })

  it('매치 라인 클릭 → store openFile(해당 매치의 path) 호출', async () => {
    const openFileSpy = await spyOpenFile()
    const { SearchResultView } = await import(SEARCH_VIEW_PATH)
    const { container } = render(<SearchResultView result={CONTENT_RESULT} />)

    const row = container.querySelector('[data-search-match][data-line="7"]') as HTMLElement
    expect(row).toBeTruthy()
    fireEvent.click(row)

    expect(openFileSpy).toHaveBeenCalledWith('02.Source/renderer/src/App.tsx')
  })
})

describe('GAP1 P08 — SearchResultView 파일목록 모드(files_with_matches/count/glob) 렌더 (RED)', () => {
  it('files_with_matches — 파일 행 3개 + 행 클릭 → openFile(path)', async () => {
    const openFileSpy = await spyOpenFile()
    const { SearchResultView } = await import(SEARCH_VIEW_PATH)
    const { container } = render(<SearchResultView result={FILES_RESULT} />)

    const rows = container.querySelectorAll('[data-search-file]')
    expect(rows.length).toBe(3)

    const row = container.querySelector('[data-search-file="02.Source/main/b.ts"]') as HTMLElement
    expect(row).toBeTruthy()
    fireEvent.click(row)
    expect(openFileSpy).toHaveBeenCalledWith('02.Source/main/b.ts')
  })

  it('count — 파일 행 2개 + total(17) 표기', async () => {
    const { SearchResultView } = await import(SEARCH_VIEW_PATH)
    const { container } = render(<SearchResultView result={COUNT_RESULT} />)

    expect(container.querySelectorAll('[data-search-file]').length).toBe(2)
    // total은 files 개수(2)와 다른 값(17) — 표기가 total 필드에서 와야만 통과(가짜 통과 방지).
    expect(container.textContent).toContain('17')
  })

  it('glob — 파일 행 2개 + total(245) 표기', async () => {
    const { SearchResultView } = await import(SEARCH_VIEW_PATH)
    const { container } = render(<SearchResultView result={GLOB_RESULT} />)

    expect(container.querySelectorAll('[data-search-file]').length).toBe(2)
    expect(container.textContent).toContain('245')
  })
})

// ── 3. 배선: ToolCallCard — searchResult 있으면 SearchResultView, 없으면 raw <pre> ──

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

    // 접힘 한 줄(.t-row) 클릭 → 상세 펼침(기존 openable 거동).
    fireEvent.click(container.querySelector('.t-row')!)

    // RED: 현행 ToolCallCard는 searchResult를 몰라 raw <pre>만 렌더.
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
