/**
 * buildPrompt.ts — 모델 컨텍스트 프롬프트 빌더 (순수 함수, LR1 Phase 02, ADR-029)
 *
 * 배경: `claudeAgentRun.ts`가 매 턴 마지막 user 메시지만 SDK prompt로 보낸다.
 * 모델 맥락 복원이 resume(sessionId) 단독 의존이라, sessionId 없는 옛 대화는
 * 맥락을 못 잇는다. 이 함수는 sessionId가 없을 때 최근 대화를 컨텍스트 예산
 * 안에서 prompt에 폴백 주입한다("모델 컨텍스트(유계) ↔ 채팅 기록(전체)" 분리).
 *
 * electron import 0 — 순수 node 환경에서 테스트 가능(run-args.ts 패턴 미러).
 *
 * 계약(골든 = `99.Others/tests/main/build-prompt.test.ts`, qa 작성):
 *  1. 토큰 근사: approxTokens(s) = Math.ceil(s.length / 4).
 *  2. resumeSessionId truthy → 이전 대화/예산 무시, 마지막 user 메시지 content만 반환
 *     (기존 resume 경로 회귀 고정).
 *  3. 마지막 user 메시지가 없으면(messages 비었거나 user role 없음) '' 반환(방어값,
 *     resumeSessionId 유무보다 우선).
 *  4. 그 외: 마지막 user 메시지 이전의 user/assistant 메시지만 후보(system/tool은
 *     항상 제외 — ADR-008). 후보가 0개면 마지막 user 메시지만(degrade).
 *  5. 후보가 있으면 최근→과거 순으로 한 줄씩 시험 추가 — 매 시도마다 "헤더 + 지금까지
 *     채택한 줄 + 푸터 + 현재 메시지" 전체 문자열의 approxTokens가 예산 이내면 채택하고
 *     계속 더 과거로 진행, 한 번이라도 예산을 넘기면 그 시점에서 중단(결정적 단조
 *     truncation — best-fit 패킹 아님). 단 한 줄도 못 들어가면 degrade(마지막 user
 *     메시지만).
 *  6. 포맷: "이전 대화 맥락:\n" + "${role}: ${content}"를 "\n"로 연결한 줄들 +
 *     "\n\n현재 메시지: " + 현재 메시지 content.
 */

/** buildModelContextPrompt 입력 메시지 단위. ConversationMessage보다 느슨(role: string) —
 *  system/tool 등 임의 role도 받아 필터링 대상으로 삼는다(ADR-008 방어). */
export interface PromptMessage {
  role: string
  content: string
}

export interface BuildModelContextPromptOptions {
  /** 있으면(truthy) 이전 대화/예산 전부 무시 — 마지막 user 메시지만 반환. */
  resumeSessionId?: string
  /** 프리앰블 포함 최종 문자열의 근사 토큰 상한. */
  contextBudgetTokens: number
}

const PREAMBLE_HEADER = '이전 대화 맥락:\n'
const PREAMBLE_FOOTER = '\n\n현재 메시지: '

/** 토큰 근사: 문자수/4 올림 (계약 §1). */
function approxTokens(s: string): number {
  return Math.ceil(s.length / 4)
}

/**
 * 최근 대화를 컨텍스트 예산 안에서 SDK prompt 문자열로 빌드한다.
 *
 * @param messages 대화 히스토리(마지막 요소가 현재 user 입력이 아니어도 무방 —
 *   내부에서 마지막 'user' role 메시지를 찾는다).
 * @param opts resumeSessionId(있으면 폴백 생략) + contextBudgetTokens(예산).
 * @returns SDK에 보낼 prompt 문자열. 조건에 따라 프리앰블 포함/미포함.
 */
export function buildModelContextPrompt(
  messages: PromptMessage[],
  opts: BuildModelContextPromptOptions
): string {
  // 마지막 user 메시지 탐색(계약 §3 — resumeSessionId 유무보다 우선 확인).
  let lastUserIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIndex = i
      break
    }
  }
  if (lastUserIndex === -1) return ''

  const currentMessage = messages[lastUserIndex].content

  // resumeSessionId 있음 → 이전 대화/예산 전부 무시(계약 §2, 회귀 고정).
  if (opts.resumeSessionId) {
    return currentMessage
  }

  // 이전 턴 후보: 마지막 user 메시지 이전, role이 user/assistant인 것만(원래 순서 유지).
  const candidates = messages
    .slice(0, lastUserIndex)
    .filter((m) => m.role === 'user' || m.role === 'assistant')

  if (candidates.length === 0) return currentMessage

  // 최근→과거로 한 줄씩 시험 추가. includedFrom = candidates 배열에서 채택 구간의 시작
  // 인덱스(포함, 오래된 쪽). candidates.length면 "아직 아무것도 채택 안 함".
  let includedFrom = candidates.length
  for (let i = candidates.length - 1; i >= 0; i--) {
    const body = candidates
      .slice(i)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n')
    const full = `${PREAMBLE_HEADER}${body}${PREAMBLE_FOOTER}${currentMessage}`
    if (approxTokens(full) <= opts.contextBudgetTokens) {
      includedFrom = i
    } else {
      // 한 번이라도 예산 초과 → 그 시점에서 중단(결정적 단조 truncation, 계약 §4/§5).
      break
    }
  }

  // 단 한 줄도 못 들어감 → degrade(계약 §6-b): 현재 메시지만.
  if (includedFrom === candidates.length) return currentMessage

  const body = candidates
    .slice(includedFrom)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n')
  return `${PREAMBLE_HEADER}${body}${PREAMBLE_FOOTER}${currentMessage}`
}
