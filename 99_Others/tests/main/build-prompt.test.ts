import { describe, it, expect } from 'vitest'
import { buildModelContextPrompt } from '../../../02_Source/main/01_agents/buildPrompt'

describe('buildModelContextPrompt', () => {

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

  describe('resumeSessionId 없음 + 짧은 history(예산 충분) → 프리앰블 포함', () => {
    it('messages=[u"a",a"b",u"c"], budget 넉넉함 → 정확한 프리앰블 포맷(golden)', () => {
      const messages = [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
      ]
      const result = buildModelContextPrompt(messages, { contextBudgetTokens: 1000 })

      const expected = '이전 대화 맥락:\nuser: a\nassistant: b\n\n현재 메시지: c'
      expect(result).toBe(expected)
      expect(result.length).toBe(41)
    })
  })

  describe('resumeSessionId 없음 + 긴 history(예산 초과) → 오래된 것부터 잘림', () => {
    const messages = [
      { role: 'user', content: 'hello there this is an old message from earlier padding' },
      { role: 'assistant', content: 'sure happy to help with that old topic padding text' },
      { role: 'user', content: 'second question about something else padding' },
      { role: 'assistant', content: 'second answer explaining things padding' },
      { role: 'user', content: 'final current question' },
    ]

    it('budget=25(approxTokens 근사) → 가장 최근 이전 턴 1줄만 남고 더 오래된 건 전부 잘림(golden)', () => {
      const result = buildModelContextPrompt(messages, { contextBudgetTokens: 25 })

      const expected =
        '이전 대화 맥락:\nassistant: second answer explaining things padding\n\n현재 메시지: final current question'
      expect(result).toBe(expected)

      expect(result).not.toContain('hello there this is an old message from earlier padding')
      expect(result).not.toContain('sure happy to help with that old topic padding text')
      expect(result).not.toContain('second question about something else padding')
      expect(result).toContain('final current question')
      expect(result).toContain('second answer explaining things padding')

      expect(Math.ceil(result.length / 4)).toBeLessThanOrEqual(25)
    })

    it('budget=20(더 작음) → 이전 턴 한 줄도 못 들어가 프리앰블 자체가 없어짐(degrade, golden)', () => {
      const result = buildModelContextPrompt(messages, { contextBudgetTokens: 20 })

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

  describe('resumeSessionId 없음 + user 메시지 하나뿐 → 프리앰블 없이 그 메시지만', () => {
    it('messages=[u"only message"] → 헤더/푸터 없이 그대로 반환', () => {
      const messages = [{ role: 'user', content: 'only message' }]
      const result = buildModelContextPrompt(messages, { contextBudgetTokens: 1000 })
      expect(result).toBe('only message')
      expect(result).not.toContain('이전 대화 맥락')
    })
  })

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
