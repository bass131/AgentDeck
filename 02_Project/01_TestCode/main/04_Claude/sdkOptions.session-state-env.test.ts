import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildClaudeSdkOptions } from '@main/04_Claude/sdkOptions'
import type { CanUseToolFn } from '@main/04_Claude/permission/permissionCoordinator'

const noopCanUse: CanUseToolFn = async (_t, input) => ({ behavior: 'allow', updatedInput: input })
const noopDialog = async () => ({ behavior: 'cancelled' as const })

const EMIT_KEY = 'CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS'

function build(): Record<string, unknown> {
  return buildClaudeSdkOptions({
    req: { messages: [], mode: 'normal' },
    abortController: new AbortController(),
    canUseTool: noopCanUse,
    skillOverrides: null,
    mcpDenied: null,
    onUserDialog: noopDialog,
  })
}

describe('gap1-p04 buildClaudeSdkOptions env 주입 (session_state 옵트인)', () => {
  // 앱 세션 안에서 돌리면 앱이 SDK에 넣은 이 변수가 셸까지 물려 내려온다.
  // 각 테스트는 변수를 비운 채 돌고, 끝나면 물려받은 값으로 되돌린다.
  let inherited: string | undefined
  beforeEach(() => {
    inherited = process.env[EMIT_KEY]
    delete process.env[EMIT_KEY]
  })
  afterEach(() => {
    if (inherited === undefined) delete process.env[EMIT_KEY]
    else process.env[EMIT_KEY] = inherited
  })

  it("(a) env['CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS'] === '1' (옵트인 플래그 주입)", () => {
    const opts = build()
    const env = opts['env'] as Record<string, string | undefined> | undefined
    expect(env?.[EMIT_KEY]).toBe('1')
  })

  it("(b) 상속 보존: env['PATH']가 process.env.PATH와 동일(스프레드 확인 — 통째 대체 함정 방어)", () => {
    const opts = build()
    const env = opts['env'] as Record<string, string | undefined> | undefined
    expect(env?.['PATH']).toBe(process.env['PATH'])
  })

  it("(c) 전역 오염 금지: build 호출 후 process.env['CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS']는 여전히 undefined", () => {
    expect(process.env[EMIT_KEY]).toBeUndefined()
    build()
    expect(process.env[EMIT_KEY]).toBeUndefined()
  })
})
