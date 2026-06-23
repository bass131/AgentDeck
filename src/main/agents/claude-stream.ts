/**
 * claude-stream.ts — 순수 정규화 함수 (Phase 21b 업데이트: SDK result 확장)
 *
 * mapClaudeStreamLine: 파싱된 SDK/NDJSON 객체 1개 → AgentEvent[] 변환.
 *
 * 격리 원칙: 엔진 출력 스키마 가정을 이 파일에만 모아둔다.
 * 버전 업그레이드로 스키마가 바뀌면 이 파일만 수정하면 된다.
 * raw 누수 금지 — 반환값은 공통 AgentEvent만.
 *
 * ── SDK / CLI 스키마 가정 ────────────────────────────────────────────────────
 *
 * 1. assistant 메시지 (텍스트/tool_use):
 *    {
 *      type: "assistant",
 *      message: {
 *        role: "assistant",
 *        content: Array<
 *          | { type: "text"; text: string }
 *          | { type: "tool_use"; id: string; name: string; input: unknown }
 *        >
 *      }
 *    }
 *
 * 2. user 메시지 (tool_result):
 *    {
 *      type: "user",
 *      message: {
 *        role: "user",
 *        content: Array<{
 *          type: "tool_result";
 *          tool_use_id: string;
 *          is_error?: boolean;
 *          content: unknown;
 *        }>
 *      }
 *    }
 *
 * 3. 최종 result (SDK 기준):
 *    {
 *      type: "result";
 *      subtype: "success" | "error_max_turns" | "error_during_execution" | "error";
 *      is_error: boolean;           // SDK 기준: false=성공, true=실패
 *      usage?: { input_tokens, output_tokens, cache_creation_input_tokens?, cache_read_input_tokens? }
 *      modelUsage?: Record<string, { contextWindow?: number; ... }>  // SDK result
 *      errors?: string[];           // SDK error 배열
 *      error?: string;              // CLI 구 포맷 단일 오류
 *    }
 *
 * 4. system (초기화, 무시):
 *    { type: "system"; subtype: "init"; ... }
 *
 * 5. stream_event (partial message, Phase 21b 무시):
 *    { type: "stream_event"; ... }
 *    includePartialMessages=false이므로 이 phase에선 yield 없음.
 *
 * ── 알 수 없는 줄 → [] (forward-compatible: 미래 타입 추가 시 조용히 무시)
 */

import type { AgentEvent, TokenUsage } from '../../shared/agent-events'

// ── 내부 타입 가드 헬퍼 ────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number'
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v)
}

// ── content 블록 처리 ─────────────────────────────────────────────────────────

/**
 * assistant 메시지의 content 배열을 AgentEvent[]로 변환.
 * text 블록 → AgentEventText, tool_use 블록 → AgentEventToolCall.
 * 빈 텍스트(delta === '')는 필터링한다.
 */
function mapAssistantContent(content: unknown[]): AgentEvent[] {
  const events: AgentEvent[] = []
  for (const block of content) {
    if (!isObject(block)) continue
    const blockType = block['type']

    if (blockType === 'text') {
      const text = block['text']
      if (isString(text) && text.length > 0) {
        events.push({ type: 'text', delta: text })
      }
      // 빈 텍스트 필터링 (스트리밍 중 빈 청크 무시)
    } else if (blockType === 'tool_use') {
      const id = block['id']
      const name = block['name']
      const input = block['input']
      if (isString(id) && isString(name)) {
        events.push({
          type: 'tool_call',
          id,
          name,
          input: input !== undefined ? input : {}
        })
      }
    }
    // 미지원 블록 타입 → 조용히 무시 (forward-compatible)
  }
  return events
}

/**
 * user 메시지의 content 배열을 AgentEvent[]로 변환.
 * tool_result 블록 → AgentEventToolResult.
 */
function mapUserContent(content: unknown[]): AgentEvent[] {
  const events: AgentEvent[] = []
  for (const block of content) {
    if (!isObject(block)) continue
    const blockType = block['type']

    if (blockType === 'tool_result') {
      const id = block['tool_use_id']
      const isError = block['is_error']
      const blockContent = block['content']
      if (isString(id)) {
        events.push({
          type: 'tool_result',
          id,
          // is_error가 true이면 실패, 없거나 false이면 성공
          ok: isError !== true,
          output: blockContent !== undefined ? blockContent : null
        })
      }
    }
    // 미지원 블록 타입 → 조용히 무시
  }
  return events
}

/**
 * usage 객체를 TokenUsage로 변환.
 * 필드명: snake_case → AgentEvent의 camelCase.
 */
function mapUsage(usageRaw: unknown): TokenUsage | undefined {
  if (!isObject(usageRaw)) return undefined
  const inputTokens = usageRaw['input_tokens']
  const outputTokens = usageRaw['output_tokens']
  if (!isNumber(inputTokens) || !isNumber(outputTokens)) return undefined

  const usage: TokenUsage = { inputTokens, outputTokens }

  const cacheCreation = usageRaw['cache_creation_input_tokens']
  if (isNumber(cacheCreation)) usage.cacheCreationTokens = cacheCreation

  const cacheRead = usageRaw['cache_read_input_tokens']
  if (isNumber(cacheRead)) usage.cacheReadTokens = cacheRead

  return usage
}

/**
 * result.modelUsage から最大 contextWindow を取得する.
 * 원본 engine.ts windowFromModelUsage 미러.
 *
 * @param modelUsage Record<string, { contextWindow?: number; ... }>
 * @returns max contextWindow 또는 undefined
 */
function windowFromModelUsage(modelUsage: unknown): number | undefined {
  if (!isObject(modelUsage)) return undefined
  let maxWindow: number | undefined
  for (const key of Object.keys(modelUsage)) {
    const entry = modelUsage[key]
    if (!isObject(entry)) continue
    const cw = entry['contextWindow']
    if (isNumber(cw)) {
      if (maxWindow === undefined || cw > maxWindow) {
        maxWindow = cw
      }
    }
  }
  return maxWindow
}

/**
 * result is_error 기준으로 성공/실패 판정.
 * SDK: is_error=false → 성공, is_error=true → 실패.
 * CLI 구 포맷: subtype='success' → 성공, subtype='error' → 실패.
 */
function isSuccess(obj: Record<string, unknown>): boolean {
  // SDK 기준: is_error 필드가 있으면 우선 사용
  const isError = obj['is_error']
  if (typeof isError === 'boolean') {
    return !isError
  }
  // CLI 구 포맷: subtype으로 판정
  const subtype = obj['subtype']
  return subtype === 'success'
}

/**
 * result 실패 시 에러 메시지 추출.
 */
function extractErrorMessage(obj: Record<string, unknown>): string {
  // SDK: errors 배열
  const errors = obj['errors']
  if (isArray(errors) && errors.length > 0) {
    const msgs = errors.filter(isString)
    if (msgs.length > 0) return msgs.join('; ')
  }
  // CLI 구 포맷: error 단일 문자열
  const error = obj['error']
  if (isString(error) && error.length > 0) return error
  // subtype으로 기본 메시지
  const subtype = obj['subtype']
  if (isString(subtype)) {
    return `Agent execution failed: ${subtype}`
  }
  return 'Unknown error from agent'
}

// ── 공개 API ──────────────────────────────────────────────────────────────────

/**
 * SDK/NDJSON 한 줄(파싱된 객체)을 받아 0개 이상의 AgentEvent로 변환.
 *
 * 이 함수가 엔진 출력 스키마의 단일 진실 공급원이다.
 * 엔진 출력 드리프트 시 이 함수만 수정한다.
 *
 * @param obj JSON.parse() 또는 SDK yield 결과 (unknown 타입으로 받아 내부에서 narrowing)
 * @returns AgentEvent 배열 (0개 이상)
 */
export function mapClaudeStreamLine(obj: unknown): AgentEvent[] {
  if (!isObject(obj)) return []

  const type = obj['type']
  if (!isString(type)) return []

  switch (type) {
    case 'assistant': {
      // assistant 메시지: 텍스트 스트리밍 + tool_use
      const message = obj['message']
      if (!isObject(message)) return []
      const content = message['content']
      if (!isArray(content)) return []
      return mapAssistantContent(content)
    }

    case 'user': {
      // user 메시지: tool_result (에이전트가 도구 실행 후 결과 전달)
      const message = obj['message']
      if (!isObject(message)) return []
      const content = message['content']
      if (!isArray(content)) return []
      return mapUserContent(content)
    }

    case 'result': {
      // 최종 완료 이벤트
      // Phase 21b: is_error 기반 판정 (SDK) + subtype 폴백 (CLI 구 포맷)
      if (isSuccess(obj)) {
        const usage = mapUsage(obj['usage'])
        const contextWindow = windowFromModelUsage(obj['modelUsage'])
        const done: AgentEvent = {
          type: 'done',
          ...(usage ? { usage } : {}),
          ...(contextWindow !== undefined ? { contextWindow } : {})
        }
        return [done]
      } else {
        const message = extractErrorMessage(obj)
        return [
          { type: 'error', message },
          { type: 'done' }
        ]
      }
    }

    case 'system': {
      // 초기화 이벤트 — 무시 (소비자에게 노출할 정보 없음)
      // session_id는 ClaudeCodeBackend가 내부적으로 캡처 (이 phase에서는 무시)
      return []
    }

    case 'stream_event': {
      // 부분 메시지 이벤트 — Phase 21b에서 무시 (includePartialMessages=false)
      // 실시간 토큰 스트리밍은 M4-2에서 구현
      return []
    }

    default:
      // 알 수 없는 타입 → 빈 배열 (forward-compatible)
      return []
  }
}
