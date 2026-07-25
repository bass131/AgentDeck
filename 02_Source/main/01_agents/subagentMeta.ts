/**
 * subagentMeta.ts — Task/Agent 서브에이전트 tool_result 내부 메타 정규화 (FB1 Phase 05)
 *
 * 문제(실측 스크린샷, `01.Phases/UC1-ultracode-redesign/Screenshot/
 * SubAgent_상세페이지가_사람이 읽기에 정보가 너무 난잡함...png`):
 *   claude-agent-sdk의 Task/Agent 도구가 서브에이전트를 launch하면 tool_result content로
 *   하네스 내부 지침 원문이 그대로 온다. 예(라이브 캡처, 백그라운드 launch 확인 변형):
 *     "Async agent launched successfully. (This tool result is internal metadata —
 *      never quote or paste any part of it, including the agentId below, into a
 *      user-facing reply.)
 *      agentId: a1eb66c99aa76e143 (internal ID - do not mention to user. Use
 *      SendMessage with to: 'a1eb66c99aa76e143', summary: '<5-10 word recap>' to
 *      continue this agent.)
 *      The agent is working in the background. ...
 *      output_file: C:\Users\...\tasks\a1eb66c99aa76e143.output
 *      Do NOT Read or tail this file via the shell tool ..."
 *   기존에 관측된 동기 완료 변형(99.Others/tests/renderer/subagent-result-clean.test.ts,
 *   렌더러 reducer/helpers.ts extractSubagentText 주석)은 2블록 배열 형태:
 *     [{type:'text', text: <실제 결과>}, {type:'text', text: "agentId: … <usage>…"}]
 *   이 텍스트는 오케스트레이터 LLM(Claude 자신)에게 주는 내부 지침이지 사용자 표시용이
 *   아니다 — ADR-003(정규화가 어댑터의 본질 책임)에 따라 renderer에 도달하기 전에
 *   어댑터가 걸러내야 한다.
 *
 * 격리 원칙: electron import 0, 순수 함수, 사이드이펙트 없음(orchestration-meta.ts와 동형).
 *
 * 판별 규칙(구조 기반 — 자연어 휴리스틱 최소화):
 *   "agentId:" 라벨 줄(정규식 `^\s*agentId\s*:\s*\S`, 대소문자 무관)이 있고,
 *   동시에 다음 중 하나 이상을 만족하면 → 그 텍스트를 내부 메타로 판정한다.
 *     a) "output_file:" 라벨 줄
 *     b) `<usage>…</usage>` 태그
 *     c) "SendMessage" 리터럴 포함(대소문자 무관 — 라이브 캡처에 대문자 'Use SendMessage'
 *        표기가 있어 case-insensitive 필수. 렌더러 helpers.ts의 기존 소문자 전용
 *        `includes('use SendMessage with to:')` 매칭 실패가 이 노출의 직접 원인이었다.)
 *   agentId: 단독으로는 판정하지 않는다(과필터 방지) — 실제 모델 응답이 우연히
 *   "agentId"라는 단어를 언급하는 경우까지 지우지 않기 위함이다.
 *
 * 호출 계약: 이 모듈은 "Task/Agent 최상위 tool_use(subagent 이벤트)로 확인된 id의
 * tool_result"에만 적용하도록 설계됐다(eventNormalizer.ts가 _subagentToolIds로 스코프
 * 확정 후 호출 — F-C의 orchestration id 추적과 동일 패턴). 다른 도구(bash/read/grep 등)의
 * 정상 출력은 이 판별 대상이 아니므로 절대 건드리지 않는다(과필터/오염 방지).
 */

// ── 판별 정규식 (구조 기반) ────────────────────────────────────────────────────

/** "agentId:" 로 시작하는 라벨 줄. 줄 시작(개행 후 포함, m 플래그) + 값 존재. */
const AGENT_ID_LABEL = /^[ \t]*agentId[ \t]*:[ \t]*\S/im

/** "output_file:" 라벨 줄. */
const OUTPUT_FILE_LABEL = /^[ \t]*output_file[ \t]*:[ \t]*\S/im

/** `<usage>…</usage>` 태그(내부 토큰 계측 블록). */
const USAGE_TAG = /<usage>[\s\S]*?<\/usage>/i

/** "SendMessage" 리터럴(대소문자 무관 — 라이브 캡처의 'Use SendMessage' 대문자 표기 포함). */
const SEND_MESSAGE_MENTION = /sendmessage/i

/**
 * 텍스트 1개가 Task/Agent 하네스 내부 메타(launch 확인/완료 지침)인지 판정.
 *
 * agentId: 라벨 + 보강 신호(output_file:/<usage>/SendMessage) 중 1개 이상 → true.
 * 보강 신호 없이 agentId: 라벨만 있으면 false(과필터 방지).
 */
export function isInternalAgentMetaText(text: string): boolean {
  if (typeof text !== 'string' || text.length === 0) return false
  if (!AGENT_ID_LABEL.test(text)) return false
  return OUTPUT_FILE_LABEL.test(text) || USAGE_TAG.test(text) || SEND_MESSAGE_MENTION.test(text)
}

/**
 * Task/Agent 서브에이전트 tool_result의 output에서 내부 메타 텍스트를 제거한다.
 *
 * - 문자열 전체가 메타로 판정되면 빈 문자열('') 반환 — 렌더러
 *   `extractSubagentText`(string 분기)가 그대로 반환하던 raw 노출을 원천 차단하고,
 *   빈 문자열은 렌더러 finalAnswer 판정에서 falsy로 처리돼 별도 버블이 생기지 않는다.
 *   메타가 아니면 원본 그대로 반환(회귀 0).
 * - content 블록 배열(SDK 표준 `[{type:'text', text}, ...]`)이면 메타로 판정된 text
 *   블록만 제거하고 나머지는 보존(부분 필터 — 실제 결과 텍스트 블록은 손대지 않음).
 *   text 블록이 아닌 원소는 판정 대상이 아니므로 그대로 보존.
 * - 그 외 타입(객체 등)은 원형 그대로 통과(과필터 방지 — 알 수 없는 형태는 보존).
 */
export function sanitizeSubagentToolResult(output: unknown): unknown {
  if (typeof output === 'string') {
    return isInternalAgentMetaText(output) ? '' : output
  }
  if (Array.isArray(output)) {
    return output.filter((block) => {
      if (
        block !== null && typeof block === 'object' &&
        (block as Record<string, unknown>)['type'] === 'text' &&
        typeof (block as Record<string, unknown>)['text'] === 'string'
      ) {
        return !isInternalAgentMetaText((block as Record<string, unknown>)['text'] as string)
      }
      return true // text 블록이 아닌 원소는 판정 대상 아님 → 보존
    })
  }
  return output
}
