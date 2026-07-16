/**
 * gap1-p05-hook-events-option.test.ts — GAP1 P05 includeHookEvents 옵션 배선 (TDD RED)
 *
 * 목표: buildClaudeSdkOptions(sdkOptions.ts)가 SDK query 옵션에 includeHookEvents:true를
 *   주입해야 함을 못박는다(sdk.d.ts:1582 — 이 옵션이 켜져야 SDK가 hook_started/hook_progress/
 *   hook_response 시스템 메시지를 방출한다. probe①도 이 옵션으로 캡처됐다). 구현은 후속
 *   agent-backend Worker 몫 — 이 파일은 실패하는 계약(RED)을 먼저 둔다.
 *
 * build() 헬퍼는 gap1-p04-session-state-env.test.ts 그대로 미러.
 *
 * 현재(RED) 이유: buildClaudeSdkOptions 반환 객체(sdkOptions.ts:225-266)에 includeHookEvents
 *   키가 없다 → opts['includeHookEvents']는 undefined !== true.
 */
import { describe, it, expect } from 'vitest'
import { buildClaudeSdkOptions } from '../../../02.Source/main/01_agents/sdkOptions'
import type { CanUseToolFn } from '../../../02.Source/main/01_agents/permissionCoordinator'

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
    // RED: 현재 반환 객체에 includeHookEvents 키 없음 → undefined !== true.
    expect(opts['includeHookEvents']).toBe(true)
  })

  // ── 불변식(대조군): 기존 P04 env 옵트인 · M5 partial messages 회귀 없음 ──────────────
  it("(대조군) env['CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS'] === '1' 여전히 존재(P04 회귀 0)", () => {
    // 지금도·구현 후에도 GREEN이어야 함. 새 옵션(includeHookEvents)을 얹으면서 기존 env
    // 옵트인이 지워지지 않았는지 확인.
    const opts = build()
    const env = opts['env'] as Record<string, string | undefined> | undefined
    expect(env?.[EMIT_KEY]).toBe('1')
  })

  it("(대조군) opts['includePartialMessages'] === true 여전히 존재(M5 스트림 델타 회귀 0)", () => {
    // 지금도·구현 후에도 GREEN이어야 함.
    const opts = build()
    expect(opts['includePartialMessages']).toBe(true)
  })
})
