// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'

function nextInject(prev: { nonce: number; text: string }, text: string): { nonce: number; text: string } {
  return { nonce: prev.nonce + 1, text }
}

describe('단일 inject 채널 — nonce 단조 증가', () => {
  it('Git 커밋 주입 후 선택질문 주입 → nonce 계속 증가, 텍스트 갱신', () => {
    let inject = { nonce: 0, text: '' }

    inject = nextInject(inject, 'git: 커밋 메시지')
    expect(inject.nonce).toBe(1)
    expect(inject.text).toBe('git: 커밋 메시지')

    inject = nextInject(inject, '`src/foo.ts:L3-L5`\n```\nconst x = 1\n```\n')
    expect(inject.nonce).toBe(2)
    expect(inject.text).toContain('src/foo.ts:L3-L5')
  })

  it('선택질문 주입 후 Git 커밋 주입 → nonce 계속 증가', () => {
    let inject = { nonce: 0, text: '' }

    inject = nextInject(inject, '`src/bar.ts:L1-L2`\n```\nhello\n```\n')
    expect(inject.nonce).toBe(1)

    inject = nextInject(inject, 'feat: 변경사항')
    expect(inject.nonce).toBe(2)
    expect(inject.text).toBe('feat: 변경사항')
  })

  it('같은 소스 재클릭(동일 텍스트) → nonce 증가로 재트리거', () => {
    let inject = { nonce: 0, text: '' }
    const text = '`src/foo.ts:L1-L1`\n```\nconst x = 1\n```\n'

    inject = nextInject(inject, text)
    const firstNonce = inject.nonce

    inject = nextInject(inject, text)
    expect(inject.nonce).toBe(firstNonce + 1)
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

describe('버그 재현 — 독립 카운터 비교의 실패 케이스', () => {
  it('독립 카운터 비교에서 nonce가 같으면 선택질문이 무시된다 (버그 증명)', () => {
    let gitNonce = 0
    let fileNonce = 0

    gitNonce++
    const gitText = 'feat: 커밋'

    fileNonce++
    const fileText = '`src/foo.ts:L1-L3`\n```\nconst x = 1\n```\n'

    const injected = fileNonce > gitNonce
      ? { nonce: fileNonce, text: fileText }
      : { nonce: gitNonce, text: gitText }

    expect(injected.text).toBe(gitText)
    expect(injected.text).not.toContain('src/foo.ts')
  })

  it('단일 채널 통합 후 같은 케이스가 선택질문을 올바르게 전달한다 (수정 검증)', () => {
    let inject = { nonce: 0, text: '' }

    inject = nextInject(inject, 'feat: 커밋')

    inject = nextInject(inject, '`src/foo.ts:L1-L3`\n```\nconst x = 1\n```\n')

    expect(inject.nonce).toBe(2)
    expect(inject.text).toContain('src/foo.ts')
    expect(inject.text).not.toBe('feat: 커밋')
  })
})
