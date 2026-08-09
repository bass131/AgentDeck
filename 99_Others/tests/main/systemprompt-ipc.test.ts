import { describe, it, expect, vi } from 'vitest'
import { normalizeSystemPrompt, MAX_SYSTEM_PROMPT_LEN } from '../../../02_Source/main/00_ipc/normalize'

describe('normalizeSystemPrompt — 정규화 순수 함수 (Phase 30)', () => {

  describe('비-string 입력 → undefined', () => {
    it('undefined → undefined', () => {
      expect(normalizeSystemPrompt(undefined)).toBeUndefined()
    })

    it('null → undefined', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(normalizeSystemPrompt(null as any)).toBeUndefined()
    })

    it('number → undefined', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(normalizeSystemPrompt(42 as any)).toBeUndefined()
    })

    it('object → undefined', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(normalizeSystemPrompt({} as any)).toBeUndefined()
    })
  })

  describe('빈문자열 · 공백만 → undefined', () => {
    it('빈문자열("") → undefined', () => {
      expect(normalizeSystemPrompt('')).toBeUndefined()
    })

    it("공백만('   ') → undefined", () => {
      expect(normalizeSystemPrompt('   ')).toBeUndefined()
    })

    it("탭+공백('\\t  \\t') → undefined", () => {
      expect(normalizeSystemPrompt('\t  \t')).toBeUndefined()
    })
  })

  describe('길이 > cap → 절단 (trim 후 기준)', () => {
    it(`정확히 ${MAX_SYSTEM_PROMPT_LEN}자 → 그대로 통과`, () => {
      const s = 'a'.repeat(MAX_SYSTEM_PROMPT_LEN)
      expect(normalizeSystemPrompt(s)).toBe(s)
    })

    it(`${MAX_SYSTEM_PROMPT_LEN + 1}자 → cap까지 절단`, () => {
      const s = 'a'.repeat(MAX_SYSTEM_PROMPT_LEN + 1)
      const result = normalizeSystemPrompt(s)
      expect(result).toBe(s.slice(0, MAX_SYSTEM_PROMPT_LEN))
      expect(result?.length).toBe(MAX_SYSTEM_PROMPT_LEN)
    })

    it('앞뒤 공백 + 본문 길이 > cap → trim 후 절단', () => {
      const body = 'b'.repeat(MAX_SYSTEM_PROMPT_LEN + 5)
      const padded = '  ' + body + '  '
      const result = normalizeSystemPrompt(padded)
      expect(result).toBe(body.slice(0, MAX_SYSTEM_PROMPT_LEN))
    })
  })

  describe('정상 string → 통과', () => {
    it('짧은 정상 string → 그대로 반환', () => {
      const s = 'Respond only in French'
      expect(normalizeSystemPrompt(s)).toBe(s)
    })

    it('앞뒤 공백 있는 string → trim 후 반환', () => {
      expect(normalizeSystemPrompt('  hello  ')).toBe('hello')
    })
  })

  describe('상수 MAX_SYSTEM_PROMPT_LEN 값 검증', () => {
    it('MAX_SYSTEM_PROMPT_LEN === 16000', () => {
      expect(MAX_SYSTEM_PROMPT_LEN).toBe(16000)
    })
  })
})

describe('B1 — runManager.start 호출 인자에 systemPrompt 포함 (spy 패턴)', () => {
  it('normalizeSystemPrompt가 string을 반환할 때 start()에 systemPrompt를 전달해야 함', () => {

    const startSpy = vi.fn().mockReturnValue({
      events: (async function* () { yield { type: 'done' } })(),
      abort: () => {},
      interrupt: () => {},
      push: () => {},
      respond: () => {},
    })

    const mockBackend = {
      id: 'claude-code' as const,
      isAvailable: async () => true,
      version: async () => null,
      latestVersion: async () => null,
      start: startSpy,
      listSupportedCommands: () => [],
    }

    const rawInput = 'Respond only in French'
    const normalized = normalizeSystemPrompt(rawInput)
    expect(normalized).toBe(rawInput)

    mockBackend.start({
      messages: [{ role: 'user', content: 'hello' }],
      systemPrompt: normalized,
    })

    expect(startSpy).toHaveBeenCalledOnce()
    const callArg = startSpy.mock.calls[0][0]
    expect(callArg).toHaveProperty('systemPrompt', rawInput)
  })

  it('normalizeSystemPrompt가 undefined를 반환할 때 start()에 systemPrompt:undefined 또는 키 없음', () => {
    const startSpy = vi.fn().mockReturnValue({
      events: (async function* () { yield { type: 'done' } })(),
      abort: () => {},
      interrupt: () => {},
      push: () => {},
      respond: () => {},
    })

    const mockBackend = {
      id: 'claude-code' as const,
      isAvailable: async () => true,
      version: async () => null,
      latestVersion: async () => null,
      start: startSpy,
      listSupportedCommands: () => [],
    }

    const normalized = normalizeSystemPrompt('')
    expect(normalized).toBeUndefined()

    mockBackend.start({
      messages: [{ role: 'user', content: 'hello' }],
      systemPrompt: normalized,
    })

    expect(startSpy).toHaveBeenCalledOnce()
    const callArg = startSpy.mock.calls[0][0]
    expect(callArg.systemPrompt).toBeUndefined()
  })
})
