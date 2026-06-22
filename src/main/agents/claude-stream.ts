/**
 * claude-stream.ts — 순수 정규화 함수
 *
 * mapClaudeStreamLine: 파싱된 NDJSON 객체 1개 → AgentEvent[] 변환.
 *
 * 격리 원칙: CLI 스키마 가정을 이 파일에만 모아둔다.
 * claude 버전 업그레이드로 스키마가 바뀌면 이 파일만 수정하면 된다.
 * raw 누수 금지 — 반환값은 공통 AgentEvent만.
 *
 * ── CLI 스키마 가정 (claude -p --output-format stream-json --verbose) ──────
 *
 * 검증 대상 버전: claude CLI (정확한 버전은 실행 환경에 따라 다름)
 * 아래 구조는 실동작 관찰 기반이며 버전 드리프트 시 여기만 수정.
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
 * 3. 최종 result:
 *    {
 *      type: "result";
 *      subtype: "success" | "error";
 *      result?: string;          // success 시 최종 응답
 *      error?: string;           // error 시 오류 메시지
 *      usage?: {
 *        input_tokens: number;
 *        output_tokens: number;
 *        cache_creation_input_tokens?: number;
 *        cache_read_input_tokens?: number;
 *      }
 *    }
 *
 * 4. system (초기화, 무시):
 *    { type: "system"; subtype: "init"; ... }
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
 * 필드명: CLI의 snake_case → AgentEvent의 camelCase.
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

// ── 공개 API ──────────────────────────────────────────────────────────────────

/**
 * NDJSON 한 줄(파싱된 객체)을 받아 0개 이상의 AgentEvent로 변환.
 *
 * 이 함수가 CLI 스키마의 단일 진실 공급원이다.
 * 엔진 출력 드리프트 시 이 함수만 수정한다.
 *
 * @param obj JSON.parse() 결과 (unknown 타입으로 받아 내부에서 narrowing)
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
      const subtype = obj['subtype']
      if (subtype === 'success') {
        const usage = mapUsage(obj['usage'])
        const done: AgentEvent = usage ? { type: 'done', usage } : { type: 'done' }
        return [done]
      } else if (subtype === 'error') {
        const errorMsg = obj['error']
        const message = isString(errorMsg) ? errorMsg : 'Unknown error from claude CLI'
        return [
          { type: 'error', message },
          { type: 'done' }
        ]
      }
      // 미지원 subtype → 빈 배열
      return []
    }

    case 'system': {
      // 초기화 이벤트 — 무시 (소비자에게 노출할 정보 없음)
      return []
    }

    default:
      // 알 수 없는 타입 → 빈 배열 (forward-compatible)
      return []
  }
}
