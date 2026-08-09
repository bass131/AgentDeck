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

describe('gap1-p05 buildClaudeSdkOptions — includeHookEvents 주입', () => {
  it("opts['includeHookEvents'] === true (훅 생명주기 방출 활성화, sdk.d.ts:1582)", () => {
    const opts = build()
    expect(opts['includeHookEvents']).toBe(true)
  })

  it("(대조군) env['CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS'] === '1' 여전히 존재(P04 회귀 0)", () => {
    const opts = build()
    const env = opts['env'] as Record<string, string | undefined> | undefined
    expect(env?.[EMIT_KEY]).toBe('1')
  })

  it("(대조군) opts['includePartialMessages'] === true 여전히 존재(M5 스트림 델타 회귀 0)", () => {
    const opts = build()
    expect(opts['includePartialMessages']).toBe(true)
  })
})
