/**
 * gap1-p08-search-result.golden.test.ts — GAP1 P08 Grep/Glob `search_result` 정규화 골든 (TDD RED)
 *
 * 목표: claude-stream.ts `mapClaudeStreamLine`이 user 메시지의 top-level
 *   `tool_use_result`(sdk.d.ts:4297 `tool_use_result?: unknown` — 현재 전량 드롭,
 *   case 'user'는 message.content의 tool_result 블록만 매핑 claude-stream.ts:510-525)를
 *   Grep/Glob 형상일 때 엔진 중립 `search_result` 이벤트(agent-events.ts:918-951,
 *   P03 선정의 계약)로 정규화하는지 고정한다. 구현은 후속 agent-backend Worker 몫 —
 *   이 파일은 실패하는 계약(RED)을 먼저 못박는다.
 *
 * 합의된 표면(interface-of-record — 구현이 여기에 맞춘다):
 *   - 방출 위치: 기존 tool_result 이벤트 **뒤에** search_result 추가 방출(순서 고정).
 *   - toolUseId = 같은 메시지 content의 tool_result 블록 tool_use_id.
 *   - Grep content        : mode:'content' · matches[{path,line,text}](content 문자열 파싱,
 *                           1-based line) · files(매치 경로 unique·등장순) · total(numMatches 우선)
 *   - Grep files_with_matches: mode:'files_with_matches' · files=filenames · total=numFiles
 *   - Grep count          : mode:'count' · files=filenames · total(numMatches 우선, 없으면 numFiles)
 *   - Glob                : mode:'glob' · files=filenames · total(totalMatches 우선, 없으면
 *                           numFiles) · truncated(GlobOutput.truncated 그대로)
 *   - 폴백(무방출): tool_use_result 없음 / Grep·Glob 형상 아님(예: 파일편집 {filename,patch}
 *     출력·문자열) / content 파싱 결과 매치 0 → search_result 방출 안 함(tool_result만 기존
 *     그대로). isReplay:true 가드(GAP1 P04 S-13)도 기존대로 [] 유지.
 *   - Windows 경로 견고성: `C:\Dev\x.ts:12:foo` → path=C:\Dev\x.ts · line=12 · text=foo
 *     (드라이브 콜론에 split 파싱이 깨지면 안 됨). 컨텍스트 구분줄 `--`·빈 줄은 skip.
 *
 * fixture 근거(SYNTHETIC — P03 계약 주석에 probe 미포함 명시, SDK 타입 선언에서 유도):
 *   GrepOutput: sdk-tools.d.ts:2862-2871 { mode?, numFiles, filenames, content?, numLines?,
 *               numMatches?, appliedLimit?, appliedOffset? } — content 모드에서도 파일별
 *               배열이 아니라 원문 텍스트 블록(content: string, `경로:라인:텍스트` 줄 형식).
 *   GlobOutput: sdk-tools.d.ts:2836-2861 { durationMs, numFiles, filenames, truncated,
 *               totalMatches?, countIsComplete? } — mode 필드 없음(형상으로 판별).
 *
 * 현재(RED) 이유: case 'user'가 obj['tool_use_result']를 읽지 않아 search_result가
 *   한 번도 방출되지 않는다 → 정규화 단정 전부 FAIL. 폴백/대조군 케이스는 현행 거동
 *   그대로라 GREEN(회귀 핀 — 구현 후에도 불변이어야 한다).
 */
import { describe, it, expect } from 'vitest'
import { mapClaudeStreamLine } from '../../../02.Source/main/01_agents/claude-stream'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

const SESSION = '29c6123d-7baf-485b-a694-413dfcee6ddb'

/**
 * SDKUserMessage 형상 합성 헬퍼 — top-level tool_use_result(sdk.d.ts:4297)와
 * message.content의 tool_result 블록(기존 매핑 대상)을 함께 실은 user 한 줄.
 */
function userToolResultMsg(opts: {
  toolUseId: string
  blockContent?: unknown
  toolUseResult?: unknown
  isReplay?: boolean
}): Record<string, unknown> {
  return {
    type: 'user',
    ...(opts.isReplay ? { isReplay: true } : {}),
    parent_tool_use_id: null,
    ...(opts.toolUseResult !== undefined ? { tool_use_result: opts.toolUseResult } : {}),
    uuid: '00000000-0000-0000-0000-0000000000f8',
    session_id: SESSION,
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: opts.toolUseId,
          content: opts.blockContent ?? [{ type: 'text', text: 'tool output' }],
        },
      ],
    },
  }
}

/** 기존(불변) tool_result 이벤트 기대값 — mapUserContent 현행 거동 그대로. */
function expectedToolResult(id: string, output: unknown): AgentEvent {
  return { type: 'tool_result', id, ok: true, output }
}

// ── 1. Grep content 모드 ────────────────────────────────────────────────────────

describe('gap1-p08 Grep content 모드 → search_result(matches 파싱)', () => {
  it('content 문자열(경로:라인:텍스트) 파싱 → tool_result 뒤에 search_result 추가 방출', () => {
    const content = [
      "02.Source/main/index.ts:10:import { app } from 'electron'",
      '02.Source/main/index.ts:42:app.whenReady()',
      '02.Source/renderer/src/App.tsx:7:export function App()',
    ].join('\n')
    const obj = userToolResultMsg({
      toolUseId: 'toolu_grep_content_01',
      blockContent: [{ type: 'text', text: content }],
      toolUseResult: {
        mode: 'content',
        numFiles: 2,
        filenames: ['02.Source/main/index.ts', '02.Source/renderer/src/App.tsx'],
        content,
        numLines: 3,
        numMatches: 3,
      },
    })
    // RED: 현재 tool_use_result가 드롭돼 search_result가 방출되지 않는다(길이 1).
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      expectedToolResult('toolu_grep_content_01', [{ type: 'text', text: content }]),
      {
        type: 'search_result',
        toolUseId: 'toolu_grep_content_01',
        mode: 'content',
        matches: [
          { path: '02.Source/main/index.ts', line: 10, text: "import { app } from 'electron'" },
          { path: '02.Source/main/index.ts', line: 42, text: 'app.whenReady()' },
          { path: '02.Source/renderer/src/App.tsx', line: 7, text: 'export function App()' },
        ],
        files: ['02.Source/main/index.ts', '02.Source/renderer/src/App.tsx'],
        total: 3,
      },
    ])
  })

  it('Windows 절대경로 — 드라이브 콜론(C:\\)·텍스트 내 콜론에 파싱이 깨지지 않는다', () => {
    const content = [
      'C:\\Dev\\x.ts:12:foo',
      "C:\\Dev\\y.ts:3:const url = 'http://localhost:3000'",
    ].join('\n')
    const obj = userToolResultMsg({
      toolUseId: 'toolu_grep_winpath_01',
      blockContent: [{ type: 'text', text: content }],
      toolUseResult: {
        mode: 'content',
        numFiles: 2,
        filenames: ['C:\\Dev\\x.ts', 'C:\\Dev\\y.ts'],
        content,
        numLines: 2,
        numMatches: 2,
      },
    })
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      expectedToolResult('toolu_grep_winpath_01', [{ type: 'text', text: content }]),
      {
        type: 'search_result',
        toolUseId: 'toolu_grep_winpath_01',
        mode: 'content',
        matches: [
          // 드라이브 콜론이 path에 보존되고 line/text가 정확히 분리돼야 한다.
          { path: 'C:\\Dev\\x.ts', line: 12, text: 'foo' },
          // 라인번호 뒤 텍스트에 콜론이 섞여도 text가 잘리면 안 된다.
          { path: 'C:\\Dev\\y.ts', line: 3, text: "const url = 'http://localhost:3000'" },
        ],
        files: ['C:\\Dev\\x.ts', 'C:\\Dev\\y.ts'],
        total: 2,
      },
    ])
  })

  it("컨텍스트 구분줄 '--'·빈 줄은 skip — 매치 2건만 파싱", () => {
    const content = '02.Source/a.ts:5:match one\n--\n\n02.Source/b.ts:9:match two\n'
    const obj = userToolResultMsg({
      toolUseId: 'toolu_grep_sep_01',
      blockContent: [{ type: 'text', text: content }],
      toolUseResult: {
        mode: 'content',
        numFiles: 2,
        filenames: ['02.Source/a.ts', '02.Source/b.ts'],
        content,
        numLines: 4,
        numMatches: 2,
      },
    })
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      expectedToolResult('toolu_grep_sep_01', [{ type: 'text', text: content }]),
      {
        type: 'search_result',
        toolUseId: 'toolu_grep_sep_01',
        mode: 'content',
        matches: [
          { path: '02.Source/a.ts', line: 5, text: 'match one' },
          { path: '02.Source/b.ts', line: 9, text: 'match two' },
        ],
        files: ['02.Source/a.ts', '02.Source/b.ts'],
        total: 2,
      },
    ])
  })

  it('content 파싱 결과 매치 0(구분줄·빈 줄뿐) → search_result 무방출(tool_result만)', () => {
    // 폴백 계약: 파싱이 아무것도 못 건지면 raw 폴백(renderer)이 담당 — 빈 search_result로
    // 렌더를 오염시키지 않는다. 현행도 무방출이라 GREEN(회귀 핀).
    const content = '--\n\n'
    const obj = userToolResultMsg({
      toolUseId: 'toolu_grep_empty_01',
      blockContent: [{ type: 'text', text: content }],
      toolUseResult: {
        mode: 'content',
        numFiles: 0,
        filenames: [],
        content,
        numLines: 0,
        numMatches: 0,
      },
    })
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      expectedToolResult('toolu_grep_empty_01', [{ type: 'text', text: content }]),
    ])
  })
})

// ── 2. Grep files_with_matches 모드 ────────────────────────────────────────────

describe('gap1-p08 Grep files_with_matches 모드 → search_result(files·total)', () => {
  it('filenames → files 그대로 · total=numFiles · matches 없음', () => {
    const obj = userToolResultMsg({
      toolUseId: 'toolu_grep_files_01',
      blockContent: [
        { type: 'text', text: 'Found 3 files\n02.Source/main/a.ts\n02.Source/main/b.ts\n99.Others/tests/c.test.ts' },
      ],
      toolUseResult: {
        mode: 'files_with_matches',
        numFiles: 3,
        filenames: ['02.Source/main/a.ts', '02.Source/main/b.ts', '99.Others/tests/c.test.ts'],
      },
    })
    const events = mapClaudeStreamLine(obj)
    // RED: 현재 search_result 무방출(길이 1).
    expect(events).toHaveLength(2)
    expect(events[1]).toEqual<AgentEvent>({
      type: 'search_result',
      toolUseId: 'toolu_grep_files_01',
      mode: 'files_with_matches',
      files: ['02.Source/main/a.ts', '02.Source/main/b.ts', '99.Others/tests/c.test.ts'],
      total: 3,
    })
  })
})

// ── 3. Grep count 모드 ─────────────────────────────────────────────────────────

describe('gap1-p08 Grep count 모드 → search_result(total=numMatches 우선)', () => {
  it('numMatches 있음 → total=numMatches · files=filenames · matches 없음(content 미파싱)', () => {
    // count 모드의 content('경로:건수' 형식)는 매치 라인이 아니다 — matches로 오파싱 금지.
    const obj = userToolResultMsg({
      toolUseId: 'toolu_grep_count_01',
      blockContent: [{ type: 'text', text: '02.Source/a.ts:12\n02.Source/b.ts:5' }],
      toolUseResult: {
        mode: 'count',
        numFiles: 2,
        filenames: ['02.Source/a.ts', '02.Source/b.ts'],
        content: '02.Source/a.ts:12\n02.Source/b.ts:5',
        numLines: 2,
        numMatches: 17,
      },
    })
    const events = mapClaudeStreamLine(obj)
    expect(events).toHaveLength(2)
    expect(events[1]).toEqual<AgentEvent>({
      type: 'search_result',
      toolUseId: 'toolu_grep_count_01',
      mode: 'count',
      files: ['02.Source/a.ts', '02.Source/b.ts'],
      total: 17,
    })
  })

  it('numMatches 없음(SDK optional) → total=numFiles 폴백', () => {
    const obj = userToolResultMsg({
      toolUseId: 'toolu_grep_count_02',
      blockContent: [{ type: 'text', text: '02.Source/a.ts:3\n02.Source/b.ts:1' }],
      toolUseResult: {
        mode: 'count',
        numFiles: 2,
        filenames: ['02.Source/a.ts', '02.Source/b.ts'],
      },
    })
    const events = mapClaudeStreamLine(obj)
    expect(events).toHaveLength(2)
    expect(events[1]).toEqual<AgentEvent>({
      type: 'search_result',
      toolUseId: 'toolu_grep_count_02',
      mode: 'count',
      files: ['02.Source/a.ts', '02.Source/b.ts'],
      total: 2,
    })
  })
})

// ── 4. Glob ─────────────────────────────────────────────────────────────────────

describe("gap1-p08 Glob → search_result(mode:'glob')", () => {
  it('GlobOutput(mode 필드 없음 — 형상 판별) → files=filenames · total=numFiles · truncated 전달', () => {
    const obj = userToolResultMsg({
      toolUseId: 'toolu_glob_01',
      blockContent: [{ type: 'text', text: '02.Source/main/index.ts\n02.Source/preload/index.ts' }],
      toolUseResult: {
        durationMs: 12,
        numFiles: 2,
        filenames: ['02.Source/main/index.ts', '02.Source/preload/index.ts'],
        truncated: false,
      },
    })
    const events = mapClaudeStreamLine(obj)
    // RED: 현재 search_result 무방출(길이 1).
    expect(events).toHaveLength(2)
    expect(events[1]).toEqual<AgentEvent>({
      type: 'search_result',
      toolUseId: 'toolu_glob_01',
      mode: 'glob',
      files: ['02.Source/main/index.ts', '02.Source/preload/index.ts'],
      total: 2,
      truncated: false,
    })
  })

  it('truncated:true + totalMatches 있음 → total=totalMatches 우선 · truncated:true', () => {
    const obj = userToolResultMsg({
      toolUseId: 'toolu_glob_02',
      blockContent: [{ type: 'text', text: 'a.ts\nb.ts\nc.ts\n(Results are truncated...)' }],
      toolUseResult: {
        durationMs: 40,
        numFiles: 3,
        filenames: ['a.ts', 'b.ts', 'c.ts'],
        truncated: true,
        totalMatches: 245,
        countIsComplete: false,
      },
    })
    const events = mapClaudeStreamLine(obj)
    expect(events).toHaveLength(2)
    expect(events[1]).toEqual<AgentEvent>({
      type: 'search_result',
      toolUseId: 'toolu_glob_02',
      mode: 'glob',
      files: ['a.ts', 'b.ts', 'c.ts'],
      total: 245,
      truncated: true,
    })
  })
})

// ── 5. 폴백(무방출) 대조군 — 현행 GREEN·구현 후에도 불변이어야 하는 회귀 핀 ───────

describe('gap1-p08 폴백 — search_result 무방출(기존 tool_result 거동 불변)', () => {
  it('tool_use_result 없음 → [tool_result]만 (기존 mapUserContent 거동 그대로)', () => {
    const obj = userToolResultMsg({
      toolUseId: 'toolu_plain_01',
      blockContent: [{ type: 'text', text: 'plain output' }],
    })
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      expectedToolResult('toolu_plain_01', [{ type: 'text', text: 'plain output' }]),
    ])
  })

  it('Grep/Glob 형상 아님(파일편집 출력 {filename, patch, ...}) → search_result 무방출', () => {
    // sdk-tools.d.ts:2820 부근 파일편집 출력 형상 — filenames 배열이 없어 검색 결과가 아니다.
    const obj = userToolResultMsg({
      toolUseId: 'toolu_edit_01',
      blockContent: [{ type: 'text', text: 'File updated' }],
      toolUseResult: {
        filename: '02.Source/main/index.ts',
        status: 'modified',
        additions: 3,
        deletions: 1,
        changes: 4,
        patch: '@@ -1,3 +1,5 @@',
      },
    })
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      expectedToolResult('toolu_edit_01', [{ type: 'text', text: 'File updated' }]),
    ])
  })

  it('tool_use_result가 문자열(비객체) → search_result 무방출', () => {
    const obj = userToolResultMsg({
      toolUseId: 'toolu_str_01',
      blockContent: [{ type: 'text', text: 'ok' }],
      toolUseResult: 'ok',
    })
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      expectedToolResult('toolu_str_01', [{ type: 'text', text: 'ok' }]),
    ])
  })

  it('isReplay:true + Grep 형상 → [] (GAP1 P04 S-13 가드 유지 — search_result도 재방출 금지)', () => {
    const obj = userToolResultMsg({
      toolUseId: 'toolu_replay_01',
      blockContent: [{ type: 'text', text: 'replayed grep output' }],
      toolUseResult: {
        mode: 'files_with_matches',
        numFiles: 1,
        filenames: ['02.Source/a.ts'],
      },
      isReplay: true,
    })
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([])
  })
})
