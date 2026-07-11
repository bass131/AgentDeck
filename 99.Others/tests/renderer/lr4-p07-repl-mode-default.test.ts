/**
 * lr4-p07-repl-mode-default.test.ts — LR4 P07 RED 테스트 (TDD 1단계, 기본값 단일 출처).
 *
 * 목표: replMode 폴백의 단일 출처 모듈 `lib/replModeDefault.ts`를 고정한다. 세션별
 *   replMode가 미설정(옛 대화/패널)일 때, 로드 경로들이 공유하는 폴백값을 이 모듈이 소유한다:
 *     getReplModeDefault(): boolean          — 현재 폴백값 반환(시드 전 기본 true).
 *     setReplModeDefault(v: boolean): void    — 전역 pref(getPref('replMode')) 마이그값 흡수.
 *     __resetReplModeDefaultForTests(): void  — 테스트 격리(모듈 싱글턴 리셋).
 *
 * 이 파일은 *실패하는 테스트만* 작성한다: `lib/replModeDefault.ts` 모듈이 아직 없어
 *   import 자체가 해소되지 않는다 → 파일 전체가 "미존재 모듈" RED로 수집 단계에서 실패한다
 *   (behavioral 실패가 아니라 심볼/모듈 compile-resolve 실패 — 구현이 모듈을 만들면 GREEN 전환).
 *
 * 시나리오 매핑(코디네이터 4종 중):
 *   4. 하위호환 마이그(단일 출처) — setReplModeDefault로 시드한 전역 마이그값이 로드 폴백으로 적용.
 *
 * CRITICAL(신뢰경계): 이 모듈은 순수 인메모리 — window.api/Node/fs 0(단순 boolean). 시크릿 아님.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getReplModeDefault,
  setReplModeDefault,
  __resetReplModeDefaultForTests,
} from '../../../02.Source/renderer/src/lib/replModeDefault'
import { makeInitialState } from '../../../02.Source/renderer/src/store/reducer'

// ── window.api mock (통합 테스트용 — loadConversation 경유) ─────────────────────
const recordLegacy = {
  id: 'conv-legacy-migrate',
  title: '옛 대화(마이그 전)',
  messages: [{ role: 'user', content: '옛 메시지' }],
  backendId: 'claude-code',
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  // replMode 없음
}
const mockApi = {
  conversationLoad: vi.fn(async () => ({ conversations: [recordLegacy] })),
  conversationSave: vi.fn(async () => ({ id: 'conv-legacy-migrate' })),
  agentRun: vi.fn(async () => ({ runId: 'r1' })),
  onAgentEvent: () => () => {},
  listFiles: async () => ({ files: [] }),
  getUsage: async () => ({ fiveHour: null, weekly: null }),
}
Object.defineProperty(globalThis, 'window', {
  value: { api: mockApi },
  writable: true,
  configurable: true,
})

beforeEach(() => {
  __resetReplModeDefaultForTests()
})

// ── 모듈 계약 (단일 출처) ─────────────────────────────────────────────────────

describe('LR4 P07 — replModeDefault 모듈 계약 (getReplModeDefault/setReplModeDefault/reset)', () => {
  it('미시드 기본값은 true (held-open 지속세션이 기본 — ADR-024/LR3-03 정합)', () => {
    expect(getReplModeDefault()).toBe(true)
  })

  it('setReplModeDefault(false) → getReplModeDefault()===false (전역 마이그값 흡수)', () => {
    setReplModeDefault(false)
    expect(getReplModeDefault()).toBe(false)
  })

  it('setReplModeDefault(true) → getReplModeDefault()===true', () => {
    setReplModeDefault(false)
    setReplModeDefault(true)
    expect(getReplModeDefault()).toBe(true)
  })

  it('__resetReplModeDefaultForTests() → 미시드 기본(true)으로 복귀', () => {
    setReplModeDefault(false)
    __resetReplModeDefaultForTests()
    expect(getReplModeDefault()).toBe(true)
  })
})

// ── 통합: 시드한 전역 마이그값이 옛 레코드 로드 폴백으로 적용 (시나리오 4) ────────

describe('LR4 P07 시나리오 4: 시드된 전역 마이그값이 로드 폴백으로 적용', () => {
  async function getStore() {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    return useAppStore
  }

  it('setReplModeDefault(false) 후 옛 레코드 로드 → store.replMode=false (마이그값 폴백)', async () => {
    const useAppStore = await getStore()
    // 전역 pref 'replMode'=false를 마이그한 상황을 시드로 재현.
    setReplModeDefault(false)
    useAppStore.setState({
      ...makeInitialState(),
      conversationId: null,
      replMode: true,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().loadConversation() // replMode 없는 옛 레코드

    // conv.replMode 미설정 → getReplModeDefault() 시드값(false)이 적용되어야 한다.
    expect(useAppStore.getState().replMode).toBe(false)
  })
})
