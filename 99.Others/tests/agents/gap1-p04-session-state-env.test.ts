/**
 * gap1-p04-session-state-env.test.ts — GAP1 P04 env 옵트인 주입 (TDD RED)
 *
 * 목표: buildClaudeSdkOptions(sdkOptions.ts)가 SDK query `env` 옵션에
 *   CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1을 주입하되, 상속 환경변수를 보존해야 함을
 *   못박는다. 구현은 후속 agent-backend Worker 몫 — 이 파일은 실패하는 계약(RED)을 먼저 둔다.
 *
 * 핵심 함정(sdk.d.ts:1391-1409): SDK query `env` 옵션은 서브프로세스 환경을 통째로 "대체"한다
 *   (merge 아님). 그래서 { CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS:'1' }만 넘기면 PATH/HOME/
 *   ANTHROPIC_API_KEY 등 상속 변수가 전부 날아가 SDK 서브프로세스가 오작동한다. 반드시
 *   { ...process.env, CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS:'1' } 형태여야 한다.
 *
 * 근거: probe②b 실측 — session_state_changed는 이 env 옵트인 시에만 방출(기본 미방출).
 *
 * 현재(RED) 이유: buildClaudeSdkOptions 반환 객체에 `env` 키 자체가 없다(sdkOptions.ts:225-258).
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

describe('gap1-p04 buildClaudeSdkOptions env 주입 (session_state 옵트인)', () => {
  it("(a) env['CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS'] === '1' (옵트인 플래그 주입)", () => {
    const opts = build()
    // RED: 현재 반환 객체에 env 키 없음 → optional chaining으로 undefined → '1' 단정 실패.
    const env = opts['env'] as Record<string, string | undefined> | undefined
    expect(env?.[EMIT_KEY]).toBe('1')
  })

  it("(b) 상속 보존: env['PATH']가 process.env.PATH와 동일(스프레드 확인 — 통째 대체 함정 방어)", () => {
    const opts = build()
    const env = opts['env'] as Record<string, string | undefined> | undefined
    // RED: env 키 부재 → undefined !== process.env.PATH.
    // 구현 후: { ...process.env, [EMIT_KEY]:'1' }이므로 PATH가 그대로 상속돼야 한다.
    expect(env?.['PATH']).toBe(process.env['PATH'])
  })

  it("(c) 전역 오염 금지: build 호출 후 process.env['CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS']는 여전히 undefined", () => {
    // 불변식(지금도·구현 후에도 GREEN이어야 함): env는 옵션 객체 안에서만 구성돼야 하고
    // process.env를 전역 mutate하면 안 된다(다른 백엔드/테스트로 누수). 잘못된 구현(전역
    // 세팅)을 잡는 가드.
    expect(process.env[EMIT_KEY]).toBeUndefined()
    build()
    expect(process.env[EMIT_KEY]).toBeUndefined()
  })
})
