import { describe, it, expect } from 'vitest'
import { mapClaudeStreamLine } from '../../../02_Source/main/01_agents/claudeStream'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'

const SESSION = '29c6123d-7baf-485b-a694-413dfcee6ddb'

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

function expectedToolResult(id: string, output: unknown): AgentEvent {
  return { type: 'tool_result', id, ok: true, output }
}

describe('gap1-p08 Grep content 모드 → search_result(matches 파싱)', () => {
  it('content 문자열(경로:라인:텍스트) 파싱 → tool_result 뒤에 search_result 추가 방출', () => {
    const content = [
      "02_Source/main/index.ts:10:import { app } from 'electron'",
      '02_Source/main/index.ts:42:app.whenReady()',
      '02_Source/renderer/src/App.tsx:7:export function App()',
    ].join('\n')
    const obj = userToolResultMsg({
      toolUseId: 'toolu_grep_content_01',
      blockContent: [{ type: 'text', text: content }],
      toolUseResult: {
        mode: 'content',
        numFiles: 2,
        filenames: ['02_Source/main/index.ts', '02_Source/renderer/src/App.tsx'],
        content,
        numLines: 3,
        numMatches: 3,
      },
    })
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      expectedToolResult('toolu_grep_content_01', [{ type: 'text', text: content }]),
      {
        type: 'search_result',
        toolUseId: 'toolu_grep_content_01',
        mode: 'content',
        matches: [
          { path: '02_Source/main/index.ts', line: 10, text: "import { app } from 'electron'" },
          { path: '02_Source/main/index.ts', line: 42, text: 'app.whenReady()' },
          { path: '02_Source/renderer/src/App.tsx', line: 7, text: 'export function App()' },
        ],
        files: ['02_Source/main/index.ts', '02_Source/renderer/src/App.tsx'],
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
          { path: 'C:\\Dev\\x.ts', line: 12, text: 'foo' },
          { path: 'C:\\Dev\\y.ts', line: 3, text: "const url = 'http://localhost:3000'" },
        ],
        files: ['C:\\Dev\\x.ts', 'C:\\Dev\\y.ts'],
        total: 2,
      },
    ])
  })

  it("컨텍스트 구분줄 '--'·빈 줄은 skip — 매치 2건만 파싱", () => {
    const content = '02_Source/a.ts:5:match one\n--\n\n02_Source/b.ts:9:match two\n'
    const obj = userToolResultMsg({
      toolUseId: 'toolu_grep_sep_01',
      blockContent: [{ type: 'text', text: content }],
      toolUseResult: {
        mode: 'content',
        numFiles: 2,
        filenames: ['02_Source/a.ts', '02_Source/b.ts'],
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
          { path: '02_Source/a.ts', line: 5, text: 'match one' },
          { path: '02_Source/b.ts', line: 9, text: 'match two' },
        ],
        files: ['02_Source/a.ts', '02_Source/b.ts'],
        total: 2,
      },
    ])
  })

  it('content 파싱 결과 매치 0(구분줄·빈 줄뿐) → search_result 무방출(tool_result만)', () => {
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

describe('gap1-p08 Grep files_with_matches 모드 → search_result(files·total)', () => {
  it('filenames → files 그대로 · total=numFiles · matches 없음', () => {
    const obj = userToolResultMsg({
      toolUseId: 'toolu_grep_files_01',
      blockContent: [
        { type: 'text', text: 'Found 3 files\n02_Source/main/a.ts\n02_Source/main/b.ts\n99_Others/tests/c.test.ts' },
      ],
      toolUseResult: {
        mode: 'files_with_matches',
        numFiles: 3,
        filenames: ['02_Source/main/a.ts', '02_Source/main/b.ts', '99_Others/tests/c.test.ts'],
      },
    })
    const events = mapClaudeStreamLine(obj)
    expect(events).toHaveLength(2)
    expect(events[1]).toEqual<AgentEvent>({
      type: 'search_result',
      toolUseId: 'toolu_grep_files_01',
      mode: 'files_with_matches',
      files: ['02_Source/main/a.ts', '02_Source/main/b.ts', '99_Others/tests/c.test.ts'],
      total: 3,
    })
  })
})

describe('gap1-p08 Grep count 모드 → search_result(total=numMatches 우선)', () => {
  it('numMatches 있음 → total=numMatches · files=filenames · matches 없음(content 미파싱)', () => {
    const obj = userToolResultMsg({
      toolUseId: 'toolu_grep_count_01',
      blockContent: [{ type: 'text', text: '02_Source/a.ts:12\n02_Source/b.ts:5' }],
      toolUseResult: {
        mode: 'count',
        numFiles: 2,
        filenames: ['02_Source/a.ts', '02_Source/b.ts'],
        content: '02_Source/a.ts:12\n02_Source/b.ts:5',
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
      files: ['02_Source/a.ts', '02_Source/b.ts'],
      total: 17,
    })
  })

  it('numMatches 없음(SDK optional) → total=numFiles 폴백', () => {
    const obj = userToolResultMsg({
      toolUseId: 'toolu_grep_count_02',
      blockContent: [{ type: 'text', text: '02_Source/a.ts:3\n02_Source/b.ts:1' }],
      toolUseResult: {
        mode: 'count',
        numFiles: 2,
        filenames: ['02_Source/a.ts', '02_Source/b.ts'],
      },
    })
    const events = mapClaudeStreamLine(obj)
    expect(events).toHaveLength(2)
    expect(events[1]).toEqual<AgentEvent>({
      type: 'search_result',
      toolUseId: 'toolu_grep_count_02',
      mode: 'count',
      files: ['02_Source/a.ts', '02_Source/b.ts'],
      total: 2,
    })
  })
})

describe("gap1-p08 Glob → search_result(mode:'glob')", () => {
  it('GlobOutput(mode 필드 없음 — 형상 판별) → files=filenames · total=numFiles · truncated 전달', () => {
    const obj = userToolResultMsg({
      toolUseId: 'toolu_glob_01',
      blockContent: [{ type: 'text', text: '02_Source/main/index.ts\n02_Source/preload/index.ts' }],
      toolUseResult: {
        durationMs: 12,
        numFiles: 2,
        filenames: ['02_Source/main/index.ts', '02_Source/preload/index.ts'],
        truncated: false,
      },
    })
    const events = mapClaudeStreamLine(obj)
    expect(events).toHaveLength(2)
    expect(events[1]).toEqual<AgentEvent>({
      type: 'search_result',
      toolUseId: 'toolu_glob_01',
      mode: 'glob',
      files: ['02_Source/main/index.ts', '02_Source/preload/index.ts'],
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
    const obj = userToolResultMsg({
      toolUseId: 'toolu_edit_01',
      blockContent: [{ type: 'text', text: 'File updated' }],
      toolUseResult: {
        filename: '02_Source/main/index.ts',
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
        filenames: ['02_Source/a.ts'],
      },
      isReplay: true,
    })
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([])
  })
})
