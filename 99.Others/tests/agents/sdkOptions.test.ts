/**
 * sdkOptions.test.ts — buildClaudeSdkOptions / makeRefusalFallbackHandler 골든 테스트 (RF1-followup P03)
 *
 * ClaudeCodeBackend.ts에서 분리된 SDK 옵션 조립 + refusal-fallback 다이얼로그 핸들러 거동 고정.
 * 분해 전 _runPump/_runPersistentPump 내부에서 인라인으로 만들던 sdkOptions/onUserDialog와
 * 1:1 동일(거동 불변).
 */

import { describe, it, expect } from 'vitest'
import {
  buildClaudeSdkOptions,
  makeRefusalFallbackHandler,
  ORCHESTRATION_SYSTEM_GUIDE,
} from '../../../02.Source/main/01_agents/sdkOptions'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'
import type { CanUseToolFn } from '../../../02.Source/main/01_agents/permissionCoordinator'

const noopCanUse: CanUseToolFn = async (_t, input) => ({ behavior: 'allow', updatedInput: input })
const noopDialog = async () => ({ behavior: 'cancelled' as const })

describe('buildClaudeSdkOptions', () => {
  it('기본 옵션 형상: preset systemPrompt + settings 핀 + settingSources + canUseTool', () => {
    const ac = new AbortController()
    const opts = buildClaudeSdkOptions({
      req: { messages: [{ role: 'user', content: 'hi' }], mode: 'normal' },
      abortController: ac,
      canUseTool: noopCanUse,
      skillOverrides: null,
      mcpDenied: null,
      onUserDialog: noopDialog,
    })
    expect((opts['systemPrompt'] as { type: string; preset: string }).type).toBe('preset')
    expect((opts['systemPrompt'] as { preset: string }).preset).toBe('claude_code')
    expect((opts['settings'] as { permissions: { defaultMode: string } }).permissions.defaultMode).toBe('default')
    expect(opts['settingSources']).toEqual(['user', 'project', 'local'])
    expect(opts['canUseTool']).toBe(noopCanUse)
    expect(opts['includePartialMessages']).toBe(true)
    expect(opts['abortController']).toBe(ac)
    expect(opts['supportedDialogKinds']).toEqual(['refusal_fallback_prompt'])
  })

  it('orchestration=false → disallowedTools=[Workflow], append 없음', () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal', orchestration: false },
      abortController: new AbortController(),
      canUseTool: noopCanUse, skillOverrides: null, mcpDenied: null, onUserDialog: noopDialog,
    })
    expect(opts['disallowedTools']).toEqual(['Workflow'])
    expect((opts['systemPrompt'] as { append?: string }).append).toBeUndefined()
  })

  it('orchestration=true → disallowedTools 키 없음 + 가이드 append', () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal', orchestration: true },
      abortController: new AbortController(),
      canUseTool: noopCanUse, skillOverrides: null, mcpDenied: null, onUserDialog: noopDialog,
    })
    expect('disallowedTools' in opts).toBe(false)
    expect((opts['systemPrompt'] as { append: string }).append).toBe(ORCHESTRATION_SYSTEM_GUIDE)
  })

  it('systemPrompt(사용자) trim 후 append', () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal', systemPrompt: '  내 프롬프트  ' },
      abortController: new AbortController(),
      canUseTool: noopCanUse, skillOverrides: null, mcpDenied: null, onUserDialog: noopDialog,
    })
    expect((opts['systemPrompt'] as { append: string }).append).toBe('내 프롬프트')
  })

  it('resumeSessionId 있으면 resume 키 포함, 없으면 미포함', () => {
    const withResume = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal', resumeSessionId: 'sess-1' },
      abortController: new AbortController(),
      canUseTool: noopCanUse, skillOverrides: null, mcpDenied: null, onUserDialog: noopDialog,
    })
    expect(withResume['resume']).toBe('sess-1')
    const without = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal' },
      abortController: new AbortController(),
      canUseTool: noopCanUse, skillOverrides: null, mcpDenied: null, onUserDialog: noopDialog,
    })
    expect('resume' in without).toBe(false)
  })

  it('skillOverrides/mcpDenied null이면 settings 키 미포함, 있으면 포함', () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal' },
      abortController: new AbortController(),
      canUseTool: noopCanUse,
      skillOverrides: { foo: 'off' },
      mcpDenied: [{ serverName: 'srv' }],
      onUserDialog: noopDialog,
    })
    const settings = opts['settings'] as Record<string, unknown>
    expect(settings['skillOverrides']).toEqual({ foo: 'off' })
    expect(settings['deniedMcpServers']).toEqual([{ serverName: 'srv' }])
  })
})

describe('makeRefusalFallbackHandler', () => {
  function mkNorm() {
    return {
      pending: 0,
      cur: 'msg-1' as string | null,
      incrementPendingFallback() { this.pending++ },
      resetCurTextId() { this.cur = null },
      get curTextId() { return this.cur },
    }
  }

  it('refusal_fallback_prompt → model-fallback push + increment + retract id + completed', async () => {
    const pushed: AgentEvent[] = []
    const norm = mkNorm()
    const handler = makeRefusalFallbackHandler(norm, (e) => pushed.push(e))
    const r = await handler({
      dialogKind: 'refusal_fallback_prompt',
      payload: { originalModel: 'claude-fable-5', fallbackModel: 'claude-opus-4-8', apiRefusalCategory: 'cyber' },
    })
    expect(r).toEqual({ behavior: 'completed', result: 'retry_fallback' })
    expect(norm.pending).toBe(1)
    expect(norm.cur).toBeNull() // resetCurTextId 호출됨
    expect(pushed.length).toBe(1)
    const e = pushed[0] as { type: string; fromModel: string; toModel: string; retractMessageId: string | null }
    expect(e.type).toBe('model-fallback')
    expect(e.fromModel).toBe('claude-fable-5')
    expect(e.toModel).toBe('claude-opus-4-8')
    expect(e.retractMessageId).toBe('msg-1') // reset 전 캡처값
  })

  it('다른 dialogKind → cancelled (push 없음)', async () => {
    const pushed: AgentEvent[] = []
    const norm = mkNorm()
    const handler = makeRefusalFallbackHandler(norm, (e) => pushed.push(e))
    const r = await handler({ dialogKind: 'something_else' })
    expect(r).toEqual({ behavior: 'cancelled' })
    expect(pushed).toEqual([])
    expect(norm.pending).toBe(0)
  })
})
