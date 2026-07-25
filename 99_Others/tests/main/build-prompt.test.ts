/**
 * build-prompt.test.ts — buildModelContextPrompt 골든 테스트 (LR1 Phase 02 TDD RED, ADR-029)
 *
 * ⚠️ 이 테스트는 **RED로 남아있는 게 정상**이다.
 * `02.Source/main/01_agents/buildPrompt.ts`는 아직 존재하지 않는다(다음 단계=agent-backend
 * Worker가 GREEN으로 만든다). import 실패(모듈 없음) 또는 assertion 실패로 fail해야 한다.
 * qa 에이전트는 앱 소스(`02.Source/**`)를 쓰지 않는다 — 테스트만 작성.
 *
 * 배경(ADR-029 draft, `01.Phases/LR1-loop-resume/_adr-029-transcript-fallback-draft.md`):
 * `claudeAgentRun.ts:379`가 매 턴 마지막 user 메시지만 SDK prompt로 보낸다. 모델 맥락 복원이
 * resume(sessionId) 단독 의존이라, sessionId 없는 옛 대화는 맥락을 못 잇는다. 결정: sessionId
 * 없을 때 최근 대화를 컨텍스트 창 예산 안에서 prompt에 폴백 주입한다("모델 컨텍스트(유계)
 * ↔ 채팅 기록(전체)" 개념 분리).
 *
 * electron import 0 — 순수 node 환경에서 실행 (run-args.test.ts 패턴 미러).
 *
 * ── 계약(이 테스트가 고정하는 golden contract) ──────────────────────────────────────
 * 요청서에 명시된 6개 요구사항 중 "애매한 부분"은 qa(이 파일 작성자)가 아래와 같이
 * 결정했다. 다음 구현자(agent-backend)는 이 결정을 그대로 구현해 GREEN으로 만들어야
 * 하며, 만약 다른 설계가 더 낫다고 판단되면 이 테스트를 갱신 + 이유를 커밋 메시지에
 * 남기고 coordinator/영호에게 의도 확인을 받아야 한다(회귀 은폐 금지).
 *
 *  1. 토큰 근사: `approxTokens(s) = Math.ceil(s.length / 4)` (문자수/4, 대략).
 *  2. 포맷:
 *       헤더 = "이전 대화 맥락:\n"
 *       각 이전 턴 라인 = "${role}: ${content}" (role은 'user' | 'assistant' 그대로,
 *                          다른 role은 애초에 후보에서 제외됨 — 계약 §5)
 *       라인 사이 구분자 = "\n"
 *       푸터 = "\n\n현재 메시지: " (뒤에 현재 메시지 content가 개행 없이 바로 붙음)
 *  3. 예산 판정 대상 = **최종 반환 문자열 전체**(헤더+본문+푸터+현재메시지).
 *       approxTokens(fullString) <= contextBudgetTokens 를 만족해야 포함.
 *  4. 선택 방향 = **최근→과거**로 훑는다. 이미 채택된 집합에 그다음(더 오래된) 한 줄을
 *       추가로 넣어보고, 그래도 예산 안이면 채택 후 계속 더 오래된 쪽으로 진행한다.
 *       한 번이라도 예산을 넘기면 그 시점에서 **중단**한다(그보다 더 오래된 턴은
 *       개별로는 더 작더라도 다시 시도하지 않는다 — 결정적 단조 truncation, best-fit
 *       패킹이 아님). 결과적으로 "오래된 것부터 잘림" 계약을 만족.
 *  5. 이전 턴 후보 = 마지막 user 메시지 **이전**의 메시지들 중 role이 'user' 또는
 *       'assistant'인 것만(원래 순서 유지). system/tool 등 다른 role은 예산과 무관하게
 *       항상 제외(ADR-008 정합 — 시크릿/노이즈 프리앰블 유입 차단).
 *  6. degrade(프리앰블 없음) 조건 = 다음 중 하나라도 해당하면 헤더/푸터 없이
 *       **현재 메시지 content만** 반환한다:
 *         a) 이전 턴 후보가 0개 (계약 §4의 원 요구사항).
 *         b) 이전 턴 후보가 있어도 단 한 줄도 예산에 못 들어감(헤더+한줄+푸터+현재
 *            메시지조차 예산 초과) — qa가 §3의 자연스러운 경계로 추가 결정.
 *  7. resumeSessionId가 **truthy**(빈 문자열 아님)이면 이전 대화/예산을 전부 무시하고
 *       마지막 user 메시지 content만 반환한다(기존 거동 회귀 고정, ADR-029 트리거는
 *       "sessionId 유무"만).
 *  8. 마지막 user 메시지가 아예 없으면(messages가 비었거나 user role이 하나도 없으면)
 *       빈 문자열("")을 반환한다(방어값).
 *
 * 계약 §3/§4의 정확한 golden 문자열은 스크래치 참조 구현(qa가 위 알고리즘을 그대로
 * 코딩해 노드에서 실행)으로 산출해 하드코딩했다 — 손 계산 아님, 결정론적.
 */

import { describe, it, expect } from 'vitest'
import { buildModelContextPrompt } from '../../../02.Source/main/01_agents/buildPrompt'

describe('buildModelContextPrompt', () => {
  // ── 1. resumeSessionId 있음 → 마지막 user 메시지만(회귀 고정) ──────────────────

  describe('resumeSessionId 있음 (기존 resume 경로, 회귀 고정)', () => {
    it('messages=[u"a",a"b",u"c"], resumeSessionId="x" → "c"만 반환(history/예산 무시)', () => {
      const messages = [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
      ]
      const result = buildModelContextPrompt(messages, {
        resumeSessionId: 'x',
        contextBudgetTokens: 1000,
      })
      expect(result).toBe('c')
    })

    it('resumeSessionId 있으면 예산이 극단적으로 작아도 잘리지 않고 마지막 메시지 그대로', () => {
      // resumeSessionId 트리거는 budget과 무관 — history 자체를 안 봄.
      const messages = [
        { role: 'user', content: 'a very long old message padding padding padding' },
        { role: 'assistant', content: 'a very long old reply padding padding padding' },
        { role: 'user', content: 'final' },
      ]
      const result = buildModelContextPrompt(messages, {
        resumeSessionId: 'sess-123',
        contextBudgetTokens: 1,
      })
      expect(result).toBe('final')
    })
  })

  // ── 2. resumeSessionId 없음 + 짧은 history(예산 충분) → 프리앰블 포맷 ───────────

  describe('resumeSessionId 없음 + 짧은 history(예산 충분) → 프리앰블 포함', () => {
    it('messages=[u"a",a"b",u"c"], budget 넉넉함 → 정확한 프리앰블 포맷(golden)', () => {
      const messages = [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
      ]
      const result = buildModelContextPrompt(messages, { contextBudgetTokens: 1000 })

      // 계약 §2 포맷 그대로: 헤더 + "user: a" + "assistant: b" + 빈 줄 + "현재 메시지: c"
      const expected = '이전 대화 맥락:\nuser: a\nassistant: b\n\n현재 메시지: c'
      expect(result).toBe(expected)
      expect(result.length).toBe(41) // 스크래치 참조 구현 산출값(결정론)
    })
  })

  // ── 3. resumeSessionId 없음 + 긴 history(예산 초과) → 오래된 것부터 잘림 ───────

  describe('resumeSessionId 없음 + 긴 history(예산 초과) → 오래된 것부터 잘림', () => {
    // 고정 픽스처: user/assistant 4턴 + 현재 메시지(마지막 user).
    // 오래된 순: [old user] → [old assistant] → [mid user] → [mid assistant] → [current user]
    const messages = [
      { role: 'user', content: 'hello there this is an old message from earlier padding' },
      { role: 'assistant', content: 'sure happy to help with that old topic padding text' },
      { role: 'user', content: 'second question about something else padding' },
      { role: 'assistant', content: 'second answer explaining things padding' },
      { role: 'user', content: 'final current question' },
    ]

    it('budget=25(approxTokens 근사) → 가장 최근 이전 턴 1줄만 남고 더 오래된 건 전부 잘림(golden)', () => {
      const result = buildModelContextPrompt(messages, { contextBudgetTokens: 25 })

      // 참조 구현 산출 golden(결정론 — 계약 §3/§4 알고리즘 그대로 실행한 값):
      const expected =
        '이전 대화 맥락:\nassistant: second answer explaining things padding\n\n현재 메시지: final current question'
      expect(result).toBe(expected)

      // 오래된 것부터 빠짐: 가장 오래된 두 턴은 확실히 없어야 함.
      expect(result).not.toContain('hello there this is an old message from earlier padding')
      expect(result).not.toContain('sure happy to help with that old topic padding text')
      // 더 최근인 두 번째 user 질문도 예산 밖(이 budget에선 못 들어감).
      expect(result).not.toContain('second question about something else padding')
      // 현재 메시지 + 가장 최근 이전 턴(assistant)만 남음.
      expect(result).toContain('final current question')
      expect(result).toContain('second answer explaining things padding')

      // 오버플로 불가(ADR-029 §"오버플로 불가") — 결과 문자열 근사 토큰이 예산 이하.
      expect(Math.ceil(result.length / 4)).toBeLessThanOrEqual(25)
    })

    it('budget=20(더 작음) → 이전 턴 한 줄도 못 들어가 프리앰블 자체가 없어짐(degrade, golden)', () => {
      const result = buildModelContextPrompt(messages, { contextBudgetTokens: 20 })

      // 계약 §6-b: 헤더+한줄+푸터+현재메시지조차 예산 초과 → 현재 메시지만.
      expect(result).toBe('final current question')
      expect(result).not.toContain('이전 대화 맥락')
      expect(result).not.toContain('second answer')
    })

    it('budget=1000(넉넉함) → 이전 턴 4개 전부 포함(잘림 없음, 상한 회귀 고정)', () => {
      const result = buildModelContextPrompt(messages, { contextBudgetTokens: 1000 })
      expect(result).toContain('hello there this is an old message from earlier padding')
      expect(result).toContain('sure happy to help with that old topic padding text')
      expect(result).toContain('second question about something else padding')
      expect(result).toContain('second answer explaining things padding')
      expect(result).toContain('final current question')
    })
  })

  // ── 4. resumeSessionId 없음 + user 메시지 하나뿐(이전 맥락 없음) → degrade ─────

  describe('resumeSessionId 없음 + user 메시지 하나뿐 → 프리앰블 없이 그 메시지만', () => {
    it('messages=[u"only message"] → 헤더/푸터 없이 그대로 반환', () => {
      const messages = [{ role: 'user', content: 'only message' }]
      const result = buildModelContextPrompt(messages, { contextBudgetTokens: 1000 })
      expect(result).toBe('only message')
      expect(result).not.toContain('이전 대화 맥락')
    })
  })

  // ── 5. 경계: 빈 messages / user 메시지 없음 ────────────────────────────────────

  describe('경계 케이스', () => {
    it('빈 messages([]) → 빈 문자열 반환(방어값, 계약 §8)', () => {
      const result = buildModelContextPrompt([], { contextBudgetTokens: 1000 })
      expect(result).toBe('')
    })

    it('user 메시지 없음(assistant만 존재) → 빈 문자열 반환(방어값, 계약 §8)', () => {
      const messages = [{ role: 'assistant', content: 'no user here' }]
      const result = buildModelContextPrompt(messages, { contextBudgetTokens: 1000 })
      expect(result).toBe('')
    })

    it('user 메시지 없음 + resumeSessionId 있어도 빈 문자열(§7보다 §8 우선 — user 자체가 없음)', () => {
      const messages = [{ role: 'assistant', content: 'no user here' }]
      const result = buildModelContextPrompt(messages, {
        resumeSessionId: 'x',
        contextBudgetTokens: 1000,
      })
      expect(result).toBe('')
    })
  })

  // ── 6. 시크릿/노이즈: user·assistant role만 프리앰블 포함(ADR-008 정합) ────────

  describe('system/tool 등 다른 role은 프리앰블에서 항상 제외(ADR-008 정합)', () => {
    it('messages에 system/tool 메시지가 섞여도 user/assistant만 프리앰블에 반영(golden)', () => {
      const messages = [
        { role: 'system', content: 'SYSTEM_SECRET_PROMPT' },
        { role: 'user', content: 'a' },
        { role: 'tool', content: 'TOOL_OUTPUT_NOISE' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
      ]
      const result = buildModelContextPrompt(messages, { contextBudgetTokens: 1000 })

      // golden: system/tool 메시지는 lastUser 이전에 있어도 완전히 배제되고,
      // 결과는 예산 충분한 짧은 history 케이스(그룹 2)와 동일한 포맷.
      const expected = '이전 대화 맥락:\nuser: a\nassistant: b\n\n현재 메시지: c'
      expect(result).toBe(expected)

      expect(result).not.toContain('SYSTEM_SECRET_PROMPT')
      expect(result).not.toContain('TOOL_OUTPUT_NOISE')
      expect(result).not.toContain('system:')
      expect(result).not.toContain('tool:')
    })

    it('budget이 작아 잘리는 상황에서도 system/tool은 애초에 후보가 아니므로 절대 안 나타남', () => {
      const messages = [
        { role: 'system', content: 'SYSTEM_SECRET_PROMPT_LONG_ENOUGH_TO_MATTER' },
        { role: 'user', content: 'old user turn padding padding padding padding' },
        { role: 'tool', content: 'TOOL_OUTPUT_NOISE_LONG_ENOUGH_TO_MATTER' },
        { role: 'assistant', content: 'old assistant turn padding padding padding' },
        { role: 'user', content: 'current' },
      ]
      const result = buildModelContextPrompt(messages, { contextBudgetTokens: 15 })
      expect(result).not.toContain('SYSTEM_SECRET_PROMPT_LONG_ENOUGH_TO_MATTER')
      expect(result).not.toContain('TOOL_OUTPUT_NOISE_LONG_ENOUGH_TO_MATTER')
    })
  })
})
