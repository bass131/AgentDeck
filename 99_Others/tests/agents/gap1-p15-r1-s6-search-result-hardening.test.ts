import { describe, it, expect } from 'vitest'
import { mapClaudeStreamLine } from '../../../02_Source/main/01_agents/claudeStream'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'

const SESSION = '29c6123d-7baf-485b-a694-413dfcee0f15'

function userMsgWithBlocks(opts: {
  blocks: { toolUseId: string; content?: unknown }[]
  toolUseResult?: unknown
}): Record<string, unknown> {
  return {
    type: 'user',
    parent_tool_use_id: null,
    ...(opts.toolUseResult !== undefined ? { tool_use_result: opts.toolUseResult } : {}),
    uuid: '00000000-0000-0000-0000-000000000f15',
    session_id: SESSION,
    message: {
      role: 'user',
      content: opts.blocks.map((b) => ({
        type: 'tool_result',
        tool_use_id: b.toolUseId,
        content: b.content ?? [{ type: 'text', text: 'tool output' }],
      })),
    },
  }
}

function searchResultsOf(events: AgentEvent[]): AgentEvent[] {
  return events.filter((e) => e.type === 'search_result')
}

describe('GAP1 P15-R1 S6a — tool_use_result 다중 블록 귀속 골든 (안전망)', () => {
  const GREP_FWM = {
    mode: 'files_with_matches',
    numFiles: 1,
    filenames: ['02_Source/main/index.ts'],
  }

  it('단일 tool_result 블록 → toolUseId = 그 블록 id (기본 귀속)', () => {
    const events = mapClaudeStreamLine(
      userMsgWithBlocks({ blocks: [{ toolUseId: 'toolu_only' }], toolUseResult: GREP_FWM })
    )
    const [sr] = searchResultsOf(events)
    expect(sr).toBeTruthy()
    expect((sr as { toolUseId?: string }).toolUseId).toBe('toolu_only')
  })

  it('다중 tool_result 블록 → toolUseId = 첫 블록 id (결정론 휴리스틱 핀 — 조용한 변경 방지)', () => {
    const events = mapClaudeStreamLine(
      userMsgWithBlocks({
        blocks: [{ toolUseId: 'toolu_first' }, { toolUseId: 'toolu_second' }],
        toolUseResult: GREP_FWM,
      })
    )
    expect(events.map((e) => e.type)).toEqual(['tool_result', 'tool_result', 'search_result'])
    const [sr] = searchResultsOf(events)
    expect((sr as { toolUseId?: string }).toolUseId).toBe('toolu_first')
  })

  it('tool_result 블록 0개 + tool_use_result 존재 → search_result는 방출하되 toolUseId 키 자체 없음', () => {
    const events = mapClaudeStreamLine(
      userMsgWithBlocks({ blocks: [], toolUseResult: GREP_FWM })
    )
    const [sr] = searchResultsOf(events)
    expect(sr).toBeTruthy()
    expect(Object.prototype.hasOwnProperty.call(sr, 'toolUseId')).toBe(false)
  })
})

describe('GAP1 P15-R1 S6b — Grep 라인번호 없는 출력 오파싱 방어 (RED)', () => {
  it('`-n:false` 형식(경로:텍스트)에서 텍스트 내 `:숫자:` 우연 매치 → filenames 대조로 드롭, 유효 0이면 무방출', () => {
    const content = '02_Source/server.ts:listen on localhost:3000:ok'
    const events = mapClaudeStreamLine(
      userMsgWithBlocks({
        blocks: [{ toolUseId: 'toolu_nofalse', content: [{ type: 'text', text: content }] }],
        toolUseResult: {
          mode: 'content',
          numFiles: 1,
          filenames: ['02_Source/server.ts'],
          content,
          numLines: 1,
        },
      })
    )
    expect(searchResultsOf(events)).toEqual([])
  })

  it('실 SDK 회귀(S6b-R2, RED): filenames 빈 배열 + 유효 매치 3건 → 대조 생략, 정상 방출', () => {
    const content = [
      "big-data.ts:1500:export const ROW_1500 = 'lorem ipsum'",
      "big-data.ts:1501:export const ROW_1501 = 'dolor sit'",
      "big-data.ts:1502:export const ROW_1502 = 'amet consectetur'",
    ].join('\n')
    const events = mapClaudeStreamLine(
      userMsgWithBlocks({
        blocks: [{ toolUseId: 'toolu_live_r2', content: [{ type: 'text', text: content }] }],
        toolUseResult: {
          mode: 'content',
          numFiles: 0,
          filenames: [],
          content,
          numLines: 3,
        },
      })
    )
    expect(searchResultsOf(events)).toEqual([
      {
        type: 'search_result',
        toolUseId: 'toolu_live_r2',
        mode: 'content',
        matches: [
          { path: 'big-data.ts', line: 1500, text: "export const ROW_1500 = 'lorem ipsum'" },
          { path: 'big-data.ts', line: 1501, text: "export const ROW_1501 = 'dolor sit'" },
          { path: 'big-data.ts', line: 1502, text: "export const ROW_1502 = 'amet consectetur'" },
        ],
        files: ['big-data.ts'],
        total: 3,
      },
    ])
  })

  it('대조군(GREEN 유지): 정상 `-n:true` 출력(path가 filenames와 일치) → 기존 그대로 파싱·방출', () => {
    const content = [
      '02_Source/main/index.ts:10:import { app } from "electron"',
      '02_Source/main/index.ts:42:app.whenReady()',
    ].join('\n')
    const events = mapClaudeStreamLine(
      userMsgWithBlocks({
        blocks: [{ toolUseId: 'toolu_ntrue', content: [{ type: 'text', text: content }] }],
        toolUseResult: {
          mode: 'content',
          numFiles: 1,
          filenames: ['02_Source/main/index.ts'],
          content,
          numLines: 2,
          numMatches: 2,
        },
      })
    )
    const [sr] = searchResultsOf(events)
    expect(sr).toBeTruthy()
    expect((sr as { matches?: unknown[] }).matches).toEqual([
      { path: '02_Source/main/index.ts', line: 10, text: 'import { app } from "electron"' },
      { path: '02_Source/main/index.ts', line: 42, text: 'app.whenReady()' },
    ])
  })
})
