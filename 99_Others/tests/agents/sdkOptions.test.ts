import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildClaudeSdkOptions,
  makeRefusalFallbackHandler,
  WORKFLOW_GATE_NOTICE,
  MEMORY_CONTINUITY_GUIDE,
} from '../../../02_Source/main/01_agents/sdkOptions'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'
import type { CanUseToolFn } from '../../../02_Source/main/01_agents/permissionCoordinator'

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

  it('orchestration=false → disallowedTools 부재(상시 노출) + 게이트 고지 상시 합성', () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal', orchestration: false },
      abortController: new AbortController(),
      canUseTool: noopCanUse, skillOverrides: null, mcpDenied: null, onUserDialog: noopDialog,
    })
    expect('disallowedTools' in opts).toBe(false)
    expect((opts['systemPrompt'] as { append?: string }).append).toBe(WORKFLOW_GATE_NOTICE)
  })

  it('orchestration=true → disallowedTools 키 없음 + 고지 append (고지는 orchestration 무관 상시 합성)', () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal', orchestration: true },
      abortController: new AbortController(),
      canUseTool: noopCanUse, skillOverrides: null, mcpDenied: null, onUserDialog: noopDialog,
    })
    expect('disallowedTools' in opts).toBe(false)
    expect((opts['systemPrompt'] as { append: string }).append).toBe(WORKFLOW_GATE_NOTICE)
  })

  it('systemPrompt(사용자) trim 후 append + 고지 상시 합성 (사용자 문구 AND 고지 둘 다 포함)', () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal', systemPrompt: '  내 프롬프트  ' },
      abortController: new AbortController(),
      canUseTool: noopCanUse, skillOverrides: null, mcpDenied: null, onUserDialog: noopDialog,
    })
    const append = (opts['systemPrompt'] as { append: string }).append
    expect(append).toContain('내 프롬프트')
    expect(append).toContain(WORKFLOW_GATE_NOTICE)
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

describe('buildClaudeSdkOptions — resume 대화 연속성 안내 (MEMORY_CONTINUITY_GUIDE, LR1)', () => {
  it('case A: resumeSessionId 있음 → append 에 MEMORY_CONTINUITY_GUIDE 포함', () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal', resumeSessionId: 'sess-1' },
      abortController: new AbortController(),
      canUseTool: noopCanUse, skillOverrides: null, mcpDenied: null, onUserDialog: noopDialog,
    })
    const append = (opts['systemPrompt'] as { append?: string }).append
    expect(typeof append).toBe('string')
    expect(append as string).toContain(MEMORY_CONTINUITY_GUIDE)
  })

  it('case B: resumeSessionId 없음(신규 대화) → append 에 MEMORY_CONTINUITY_GUIDE 미포함(회귀 0)', () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal' },
      abortController: new AbortController(),
      canUseTool: noopCanUse, skillOverrides: null, mcpDenied: null, onUserDialog: noopDialog,
    })
    const append = (opts['systemPrompt'] as { append?: string }).append
    if (typeof append === 'string') {
      expect(append).not.toContain(MEMORY_CONTINUITY_GUIDE)
    } else {
      expect(append).toBeUndefined()
    }
  })

  it('case C: resumeSessionId + userAppend(systemPrompt) + orchestration:true → 셋 다 append 에 포함(합성 보존)', () => {
    const userPrompt = '프랑스어로만 답해'
    const opts = buildClaudeSdkOptions({
      req: {
        messages: [],
        mode: 'normal',
        resumeSessionId: 'sess-2',
        systemPrompt: userPrompt,
        orchestration: true,
      },
      abortController: new AbortController(),
      canUseTool: noopCanUse, skillOverrides: null, mcpDenied: null, onUserDialog: noopDialog,
    })
    const append = (opts['systemPrompt'] as { append?: string }).append
    expect(typeof append).toBe('string')
    const appendStr = append as string
    expect(appendStr).toContain(userPrompt)
    expect(appendStr).toContain(WORKFLOW_GATE_NOTICE)
    expect(appendStr).toContain(MEMORY_CONTINUITY_GUIDE)
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
    expect(norm.cur).toBeNull()
    expect(pushed.length).toBe(1)
    const e = pushed[0] as { type: string; fromModel: string; toModel: string; retractMessageId: string | null }
    expect(e.type).toBe('model-fallback')
    expect(e.fromModel).toBe('claude-fable-5')
    expect(e.toModel).toBe('claude-opus-4-8')
    expect(e.retractMessageId).toBe('msg-1')
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

describe('buildClaudeSdkOptions — cwd 검증(trust-boundary, LR1 Phase03 갈래B-2)', () => {
  const REAL_DIR = mkdtempSync(join(tmpdir(), 'agentdeck-lr1-p03-sdkopts-'))
  const NONEXISTENT_DIR = join(tmpdir(), 'agentdeck-lr1-p03-does-not-exist')

  afterAll(() => {
    rmSync(REAL_DIR, { recursive: true, force: true })
  })

  it('케이스1: workspaceRoot가 실제 존재하는 디렉토리 → opts.cwd는 그 디렉토리 그대로', () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal', workspaceRoot: REAL_DIR },
      abortController: new AbortController(),
      canUseTool: noopCanUse, skillOverrides: null, mcpDenied: null, onUserDialog: noopDialog,
    })
    expect(opts['cwd']).toBe(REAL_DIR)
  })

  it('케이스2: workspaceRoot가 존재하지 않는 경로 → opts.cwd는 그 경로가 아니어야 한다(process.cwd() 폴백)', () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal', workspaceRoot: NONEXISTENT_DIR },
      abortController: new AbortController(),
      canUseTool: noopCanUse, skillOverrides: null, mcpDenied: null, onUserDialog: noopDialog,
    })
    expect(opts['cwd']).not.toBe(NONEXISTENT_DIR)
    expect(opts['cwd']).toBe(process.cwd())
  })

  it('케이스3: workspaceRoot 미전달(undefined) → opts.cwd는 process.cwd() (현행 유지, 회귀 0)', () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal' },
      abortController: new AbortController(),
      canUseTool: noopCanUse, skillOverrides: null, mcpDenied: null, onUserDialog: noopDialog,
    })
    expect(opts['cwd']).toBe(process.cwd())
  })
})
