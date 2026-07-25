/**
 * gap1-p15-r1-s6-search-result-hardening.test.ts — GAP1 P15 라운드1 시드 S6(a·b).
 *
 * P08 reviewer 🟡 잔여분 중 실사용 영향 판정 대상 2건:
 *
 * [S6a — 골든 안전망(현행 거동 핀, GREEN 예상)] tool_use_result 다중 블록 귀속:
 *   mapClaudeStreamLine(claude-stream.ts:739-746)은 search_result의 toolUseId를 "같은
 *   메시지 content의 **첫** tool_result 블록"에서 취한다. 다중 tool_result 블록이 한
 *   user 메시지에 실리는 경우(병렬 도구 회신 배치) 구조적으로 어느 블록이
 *   tool_use_result의 주인인지 payload에 판별 정보가 없다 — 첫 블록 귀속은 "결정론
 *   휴리스틱"이며, 이 골든은 그 휴리스틱이 조용히 바뀌는 회귀(예: 마지막 블록으로
 *   변경돼 카드 부착이 흔들림)를 잠근다. 무블록이면 toolUseId 자체를 싣지 않는
 *   graceful 거동도 함께 핀.
 *
 * [S6b — 오파싱 보수장치(RED)] Grep `-n: false`(라인번호 없는) content 출력:
 *   줄 형식이 `경로:텍스트`가 되는데 parseGrepContentMatches(:521-532)의 정규식
 *   `/^(.+?):(\d+):(.*)$/`는 텍스트 안 우연한 `:숫자:` 패턴(포트번호·시각 등)에서
 *   잘못 매치돼 — path에 텍스트 조각이 붙은 **존재하지 않는 경로**의 매치를 합성한다
 *   (클릭 시 엉뚱한 파일 열기 시도, 렌더 오염). GrepOutput.filenames(구조 필드,
 *   실제 매치 파일 목록 정본)가 같은 payload에 이미 있으므로 대조 가능하다.
 *
 *   기대 스펙(interface-of-record — 봉합은 agent-backend Worker):
 *     content 모드 파싱 매치의 path가 filenames 집합에 없으면 오파싱으로 간주해 드롭.
 *     유효 매치 0이면 기존 규칙(파싱 매치 0 = 무방출, :542)에 합류 → renderer raw 폴백.
 *
 * [S6b-R2 — 실 SDK 회귀(RED), P15 라운드 2] filenames 빈 배열 라이브 형상:
 *   ⚠ 실측 픽스처(SYNTHETIC 아님) — qa#5 R2 라이브 채증: 실 SDK Grep content 모드의
 *   toolUseResult(세션 jsonl)는 `{ mode:'content', numFiles:0, filenames:[],
 *   content:"big-data.ts:1500:…" }` — **filenames가 항상 빈 배열**로 온다(numFiles도 0).
 *   R1 S6b 봉합(claude-stream.ts:565-573)의 `filenameSet.has(m.path)` 대조가 빈 Set이라
 *   유효 매치 전량 드롭 → search_result 무방출 → P08 카드가 raw 폴백으로 강등
 *   (라이브 3/3 재현).
 *
 *   기대 스펙(interface-of-record — 봉합은 agent-backend Worker):
 *     filenames가 **비어 있으면 대조를 생략**하고 파싱 매치를 그대로 신뢰(방출).
 *     filenames가 **실재할 때만** 대조 드롭(-n:false 오파싱 방어, R1 S6b 유지).
 *
 * TDD 상태: S6a 3건 GREEN(안전망) · S6b 봉합 완료로 2건 GREEN · S6b-R2 RED 1건.
 */
import { describe, it, expect } from 'vitest'
import { mapClaudeStreamLine } from '../../../02.Source/main/01_agents/claude-stream'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

const SESSION = '29c6123d-7baf-485b-a694-413dfcee0f15'

/** 다중 tool_result 블록을 실을 수 있는 user 메시지 합성 헬퍼(P08 골든 관례 확장판). */
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

// ── S6a: 다중 블록 귀속 골든(현행 거동 핀 — 안전망) ─────────────────────────────

describe('GAP1 P15-R1 S6a — tool_use_result 다중 블록 귀속 골든 (안전망)', () => {
  const GREP_FWM = {
    mode: 'files_with_matches',
    numFiles: 1,
    filenames: ['02.Source/main/index.ts'],
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
    // tool_result 2건 + search_result 1건, 순서 고정(기존 이벤트 뒤).
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

// ── S6b: Grep -n false 오파싱 보수장치 (RED) ────────────────────────────────────

describe('GAP1 P15-R1 S6b — Grep 라인번호 없는 출력 오파싱 방어 (RED)', () => {
  it('`-n:false` 형식(경로:텍스트)에서 텍스트 내 `:숫자:` 우연 매치 → filenames 대조로 드롭, 유효 0이면 무방출', () => {
    // 라인번호 없는 content 출력 — 텍스트에 `:3000:` 이 있어 현행 정규식이
    // path='02.Source/server.ts:listen on localhost' / line=3000 으로 오파싱한다.
    const content = '02.Source/server.ts:listen on localhost:3000:ok'
    const events = mapClaudeStreamLine(
      userMsgWithBlocks({
        blocks: [{ toolUseId: 'toolu_nofalse', content: [{ type: 'text', text: content }] }],
        toolUseResult: {
          mode: 'content',
          numFiles: 1,
          filenames: ['02.Source/server.ts'], // 실제 매치 파일 정본(구조 필드)
          content,
          numLines: 1,
        },
      })
    )
    // 현행: 오파싱 매치(존재하지 않는 경로)로 search_result 방출 → RED.
    // 봉합: filenames에 없는 path 매치 드롭 → 유효 0 → 무방출(renderer raw 폴백).
    expect(searchResultsOf(events)).toEqual([])
  })

  it('실 SDK 회귀(S6b-R2, RED): filenames 빈 배열 + 유효 매치 3건 → 대조 생략, 정상 방출', () => {
    // ⚠ 실 캡처 형상(qa#5 R2 라이브 채증, 세션 jsonl toolUseResult — SYNTHETIC 아님):
    //   실 SDK는 content 모드에서 numFiles:0 · filenames:[] 로 회신한다(매치 파일 목록을
    //   구조 필드로 채우지 않음). numMatches도 미포함 → total은 파싱 매치 수 폴백.
    //   현행(R1 S6b 봉합): 빈 filenameSet 대조로 유효 매치 전량 드롭 → 무방출 → RED.
    //   봉합 방향: filenames.length === 0 이면 대조 생략(파싱 매치 신뢰), 실재 시에만
    //   -n:false 오파싱 방어 대조(위 케이스 유지).
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
      '02.Source/main/index.ts:10:import { app } from "electron"',
      '02.Source/main/index.ts:42:app.whenReady()',
    ].join('\n')
    const events = mapClaudeStreamLine(
      userMsgWithBlocks({
        blocks: [{ toolUseId: 'toolu_ntrue', content: [{ type: 'text', text: content }] }],
        toolUseResult: {
          mode: 'content',
          numFiles: 1,
          filenames: ['02.Source/main/index.ts'],
          content,
          numLines: 2,
          numMatches: 2,
        },
      })
    )
    const [sr] = searchResultsOf(events)
    expect(sr).toBeTruthy()
    expect((sr as { matches?: unknown[] }).matches).toEqual([
      { path: '02.Source/main/index.ts', line: 10, text: 'import { app } from "electron"' },
      { path: '02.Source/main/index.ts', line: 42, text: 'app.whenReady()' },
    ])
  })
})
