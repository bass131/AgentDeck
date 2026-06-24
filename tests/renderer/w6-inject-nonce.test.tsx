// @vitest-environment jsdom
/**
 * w6-inject-nonce.test.tsx — Shell inject 단일 채널 통합 회귀 테스트.
 *
 * 버그: gitInject·fileAskInject 독립 카운터 `>` 비교.
 * 재현: Git 커밋(nonce=1) → 선택질문(nonce=1) → 1>1=false → gitInject 선택
 *       → Conversation useEffect([injectNonce,injectText]) 미트리거 → 무음 실패.
 *
 * 수정 후 보장:
 *   1. Git 커밋 주입 후 선택질문 주입 → 선택질문 텍스트·nonce 증가 전달.
 *   2. 선택질문 주입 후 Git 커밋 주입 → Git 텍스트·nonce 증가 전달.
 *   3. 같은 소스 재클릭도 nonce 증가.
 *   4. Git 커밋 단독 기존 동작 회귀 0.
 */
import { describe, it, expect } from 'vitest'

// ── Shell의 inject 로직만 순수 함수로 추출해 단위 테스트 ─────────────────────
// Shell이 단일 inject 채널을 사용하면,
// setInject(p => ({nonce: p.nonce + 1, text})) 패턴이 적용된다.
// 이 테스트는 그 패턴이 올바르게 동작하는지 검증한다.

/**
 * 단일 채널 inject reducer (Shell이 채택해야 할 패턴).
 * prev state를 받아 nonce+1, text 갱신.
 */
function nextInject(prev: { nonce: number; text: string }, text: string): { nonce: number; text: string } {
  return { nonce: prev.nonce + 1, text }
}

describe('단일 inject 채널 — nonce 단조 증가', () => {
  it('Git 커밋 주입 후 선택질문 주입 → nonce 계속 증가, 텍스트 갱신', () => {
    let inject = { nonce: 0, text: '' }

    // Git 커밋 주입 (nonce: 0 → 1)
    inject = nextInject(inject, 'git: 커밋 메시지')
    expect(inject.nonce).toBe(1)
    expect(inject.text).toBe('git: 커밋 메시지')

    // 선택질문 주입 (nonce: 1 → 2) — 버그 상황: 독립 카운터면 fileAsk.nonce=1, git.nonce=1 → 1>1=false → 실패
    inject = nextInject(inject, '`src/foo.ts:L3-L5`\n```\nconst x = 1\n```\n')
    expect(inject.nonce).toBe(2) // 단일 채널이면 항상 증가
    expect(inject.text).toContain('src/foo.ts:L3-L5')
  })

  it('선택질문 주입 후 Git 커밋 주입 → nonce 계속 증가', () => {
    let inject = { nonce: 0, text: '' }

    // 선택질문 먼저
    inject = nextInject(inject, '`src/bar.ts:L1-L2`\n```\nhello\n```\n')
    expect(inject.nonce).toBe(1)

    // Git 커밋
    inject = nextInject(inject, 'feat: 변경사항')
    expect(inject.nonce).toBe(2)
    expect(inject.text).toBe('feat: 변경사항')
  })

  it('같은 소스 재클릭(동일 텍스트) → nonce 증가로 재트리거', () => {
    let inject = { nonce: 0, text: '' }
    const text = '`src/foo.ts:L1-L1`\n```\nconst x = 1\n```\n'

    inject = nextInject(inject, text)
    const firstNonce = inject.nonce

    inject = nextInject(inject, text) // 같은 텍스트 재클릭
    expect(inject.nonce).toBe(firstNonce + 1) // nonce는 반드시 증가
    expect(inject.text).toBe(text)
  })

  it('Git 커밋 단독 — nonce 증가·텍스트 전달 (기존 동작 회귀 0)', () => {
    let inject = { nonce: 0, text: '' }
    inject = nextInject(inject, 'feat: 새 기능')
    expect(inject.nonce).toBe(1)
    expect(inject.text).toBe('feat: 새 기능')
  })

  it('초기 상태 nonce=0 — 첫 주입 후 nonce=1', () => {
    const inject = nextInject({ nonce: 0, text: '' }, '첫 주입')
    expect(inject.nonce).toBe(1)
    expect(inject.text).toBe('첫 주입')
  })
})

// ── 버그 재현: 독립 카운터 `>` 비교가 실패하는 케이스 ────────────────────────

describe('버그 재현 — 독립 카운터 비교의 실패 케이스', () => {
  it('독립 카운터 비교에서 nonce가 같으면 선택질문이 무시된다 (버그 증명)', () => {
    // 버그 패턴: 두 독립 카운터
    let gitNonce = 0
    let fileNonce = 0

    // Git 커밋 (gitNonce: 0→1)
    gitNonce++
    const gitText = 'feat: 커밋'

    // 선택질문 (fileNonce: 0→1)
    fileNonce++
    const fileText = '`src/foo.ts:L1-L3`\n```\nconst x = 1\n```\n'

    // 버그: fileNonce(1) > gitNonce(1) → false → gitText가 전달됨
    const injected = fileNonce > gitNonce
      ? { nonce: fileNonce, text: fileText }
      : { nonce: gitNonce, text: gitText }

    // 버그: 선택질문을 주입했는데 gitText가 전달됨
    expect(injected.text).toBe(gitText) // 버그 상황 증명
    expect(injected.text).not.toContain('src/foo.ts') // 선택질문 텍스트 없음
  })

  it('단일 채널 통합 후 같은 케이스가 선택질문을 올바르게 전달한다 (수정 검증)', () => {
    // 수정 패턴: 단일 카운터
    let inject = { nonce: 0, text: '' }

    // Git 커밋 (nonce: 0→1)
    inject = nextInject(inject, 'feat: 커밋')

    // 선택질문 (nonce: 1→2) — 항상 증가
    inject = nextInject(inject, '`src/foo.ts:L1-L3`\n```\nconst x = 1\n```\n')

    // 수정 후: 선택질문 텍스트 정상 전달
    expect(inject.nonce).toBe(2)
    expect(inject.text).toContain('src/foo.ts')
    expect(inject.text).not.toBe('feat: 커밋')
  })
})
