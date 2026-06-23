// @vitest-environment node
/**
 * whatsNewTrigger.test.ts — whatsNewTrigger.ts 순수 함수 단위 테스트 (TDD).
 *
 * 검증 대상:
 *   - seriesOf: 버전 문자열 → 마이너 시리즈 (앞 2 세그먼트)
 *   - decideStartupModal: 부트 시 자동 표시 모달 결정 로직
 *
 * 신뢰경계: 순수 함수만 — window.api / IPC / fs 호출 0.
 * TDD: 이 파일을 먼저 작성(실패) → whatsNewTrigger.ts 구현 후 green.
 */
import { describe, it, expect } from 'vitest'
import { seriesOf, decideStartupModal, SEEN_KEY } from '../../src/renderer/src/lib/whatsNewTrigger'

// ══════════════════════════════════════════════════════════════════════════════
// SEEN_KEY
// ══════════════════════════════════════════════════════════════════════════════

describe('SEEN_KEY', () => {
  it('whatsnew.seenVersion 문자열', () => {
    expect(SEEN_KEY).toBe('whatsnew.seenVersion')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// seriesOf
// ══════════════════════════════════════════════════════════════════════════════

describe('seriesOf', () => {
  it("'1.5.3' → '1.5'", () => {
    expect(seriesOf('1.5.3')).toBe('1.5')
  })

  it("'2.0.0' → '2.0'", () => {
    expect(seriesOf('2.0.0')).toBe('2.0')
  })

  it("'1' → '1' (세그먼트 1개, 그대로)", () => {
    expect(seriesOf('1')).toBe('1')
  })

  it("'1.2' → '1.2' (세그먼트 2개, 그대로)", () => {
    expect(seriesOf('1.2')).toBe('1.2')
  })

  it("'3.14.159' → '3.14'", () => {
    expect(seriesOf('3.14.159')).toBe('3.14')
  })

  it("'0.0.1' → '0.0'", () => {
    expect(seriesOf('0.0.1')).toBe('0.0')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// decideStartupModal
// ══════════════════════════════════════════════════════════════════════════════

describe('decideStartupModal — version 없음(falsy) → null (graceful)', () => {
  it('version=빈 문자열 → null', () => {
    expect(decideStartupModal('', '')).toBeNull()
  })

  it('version=null → null', () => {
    expect(decideStartupModal(null, '')).toBeNull()
  })

  it('version=undefined → null', () => {
    expect(decideStartupModal(undefined, '')).toBeNull()
  })
})

describe('decideStartupModal — 첫 실행(seen=\'\') → whatsnew', () => {
  it("seen='' → 'whatsnew'", () => {
    expect(decideStartupModal('1.0.0', '')).toBe('whatsnew')
  })

  it("version='2.5.1', seen='' → 'whatsnew'", () => {
    expect(decideStartupModal('2.5.1', '')).toBe('whatsnew')
  })
})

describe('decideStartupModal — 마이너 업데이트 → updatenotes', () => {
  it("seen='1.0.0', version='1.1.0' (마이너 업) → 'updatenotes'", () => {
    expect(decideStartupModal('1.1.0', '1.0.0')).toBe('updatenotes')
  })

  it("seen='1.1.0', version='2.0.0' (메이저 업 → 마이너 시리즈 다름) → 'updatenotes'", () => {
    expect(decideStartupModal('2.0.0', '1.1.0')).toBe('updatenotes')
  })

  it("seen='2.0.0', version='2.1.0' → 'updatenotes'", () => {
    expect(decideStartupModal('2.1.0', '2.0.0')).toBe('updatenotes')
  })
})

describe('decideStartupModal — 패치 업데이트만 / 동일 버전 → null', () => {
  it("seen='1.0.0', version='1.0.5' (패치만) → null", () => {
    expect(decideStartupModal('1.0.5', '1.0.0')).toBeNull()
  })

  it("seen='1.0.0', version='1.0.0' (동일) → null", () => {
    expect(decideStartupModal('1.0.0', '1.0.0')).toBeNull()
  })

  it("seen='1.5.3', version='1.5.99' (같은 마이너 재실행) → null", () => {
    expect(decideStartupModal('1.5.99', '1.5.3')).toBeNull()
  })
})
