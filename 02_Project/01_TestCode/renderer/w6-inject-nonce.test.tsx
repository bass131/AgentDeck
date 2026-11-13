// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { nextInject } from '../../../02_Project/00_Source/renderer/src/layout/Shell'

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
