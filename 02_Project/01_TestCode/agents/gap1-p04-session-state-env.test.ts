import { describe, it, expect } from 'vitest'
import { buildClaudeSdkOptions } from '../../../02_Project/00_Source/main/01_agents/sdkOptions'
import type { CanUseToolFn } from '../../../02_Project/00_Source/main/01_agents/permissionCoordinator'

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
