/**
 * git-mask.test.ts — 백로그 #3 TDD: git 에러 메시지 자격증명 마스킹 (RED → GREEN).
 *
 * push/pull 실패 시 stderr에 원격 URL이 포함될 수 있고, URL에 토큰/비밀번호가
 * 임베드된 경우(예: https://user:ghp_xxx@github.com/…) 그대로 GitOpResult.error로
 * 노출되면 안 된다 (CLAUDE.md CRITICAL: 시크릿 평문 노출 금지).
 *
 * maskCredentials는 scheme://userinfo@host 패턴의 userinfo 전체를 *** 로 치환한다.
 * electron import 0 — vitest node 환경에서 직접 테스트.
 */

import { describe, it, expect } from 'vitest'
import { maskCredentials } from '../../../02.Source/main/git'

describe('maskCredentials', () => {
  it('https URL의 user:token@ userinfo를 통째로 마스킹한다', () => {
    const masked = maskCredentials(
      "fatal: unable to access 'https://user:ghp_SECRET123@github.com/o/r.git/'"
    )
    expect(masked).not.toContain('ghp_SECRET123')
    expect(masked).not.toContain('user:ghp_SECRET123')
    expect(masked).toContain('https://***@github.com')
  })

  it('username만 있는(PAT-as-username) userinfo도 마스킹한다', () => {
    expect(maskCredentials('https://ghp_TOKEN@github.com/x')).toBe('https://***@github.com/x')
  })

  it('ssh/기타 scheme의 자격증명도 동일하게 마스킹한다', () => {
    expect(maskCredentials('ssh://deploy:secretpw@host/r')).toContain('ssh://***@host')
    expect(maskCredentials('ssh://deploy:secretpw@host/r')).not.toContain('secretpw')
  })

  it('자격증명이 없는 메시지는 변형하지 않는다', () => {
    const s = 'fatal: not a git repository (or any of the parent directories): .git'
    expect(maskCredentials(s)).toBe(s)
  })

  it('한 메시지에 여러 URL이 있어도 모두 마스킹한다', () => {
    const masked = maskCredentials(
      'remote https://a:t1@h1/r and https://b:t2@h2/r failed'
    )
    expect(masked).not.toContain('t1')
    expect(masked).not.toContain('t2')
    expect(masked).toContain('https://***@h1')
    expect(masked).toContain('https://***@h2')
  })
})
