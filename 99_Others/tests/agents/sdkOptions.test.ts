/**
 * sdkOptions.test.ts — buildClaudeSdkOptions / makeRefusalFallbackHandler 골든 테스트 (RF1-followup P03)
 *
 * ClaudeCodeBackend.ts에서 분리된 SDK 옵션 조립 + refusal-fallback 다이얼로그 핸들러 거동 고정.
 * 분해 전 _runPump/_runPersistentPump 내부에서 인라인으로 만들던 sdkOptions/onUserDialog와
 * 1:1 동일(거동 불변).
 */

import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildClaudeSdkOptions,
  makeRefusalFallbackHandler,
  ORCHESTRATION_SYSTEM_GUIDE,
  MEMORY_CONTINUITY_GUIDE,
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

  it('orchestration=false → disallowedTools 부재(상시 노출) + 가이드 상시 합성(UC1-P02, ADR-032 ④)', () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal', orchestration: false },
      abortController: new AbortController(),
      canUseTool: noopCanUse, skillOverrides: null, mcpDenied: null, onUserDialog: noopDialog,
    })
    // disallowedTools 계산 자체가 제거됐다 — orchestration 값과 무관하게 항상 부재.
    expect('disallowedTools' in opts).toBe(false)
    // 가이드는 OFF 턴에도 상시 합성된다(held-open 세션은 append를 세션 생성 시 한 번만 고정).
    expect((opts['systemPrompt'] as { append?: string }).append).toBe(ORCHESTRATION_SYSTEM_GUIDE)
  })

  it('orchestration=true → disallowedTools 키 없음 + 가이드 append (여전히 성립 — 가이드는 orchestration 무관 상시 합성)', () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal', orchestration: true },
      abortController: new AbortController(),
      canUseTool: noopCanUse, skillOverrides: null, mcpDenied: null, onUserDialog: noopDialog,
    })
    expect('disallowedTools' in opts).toBe(false)
    expect((opts['systemPrompt'] as { append: string }).append).toBe(ORCHESTRATION_SYSTEM_GUIDE)
  })

  it('systemPrompt(사용자) trim 후 append + 가이드 상시 합성(UC1-P02: 사용자 문구 AND 가이드 둘 다 포함)', () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal', systemPrompt: '  내 프롬프트  ' },
      abortController: new AbortController(),
      canUseTool: noopCanUse, skillOverrides: null, mcpDenied: null, onUserDialog: noopDialog,
    })
    const append = (opts['systemPrompt'] as { append: string }).append
    expect(append).toContain('내 프롬프트')
    expect(append).toContain(ORCHESTRATION_SYSTEM_GUIDE)
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

// ── LR1: resume 대화 연속성 안내(MEMORY_CONTINUITY_GUIDE) ──────────────────────
//
// 배경: resume은 정상 작동하지만 모델이 메타질문("이전 대화 기억해?")에 컨텍스트가
// 있는데도 "과거 대화 기억 못 한다"는 거짓 disclaimer를 뱉는 관측 버그(LR1).
// resumeSessionId가 있을 때만 systemPrompt.append에 연속성 안내를 주입해 억제한다.
// 신규 대화(resumeSessionId 없음)에는 안내가 불필요 — append 미포함이어야 회귀 0.
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
    expect(appendStr).toContain(ORCHESTRATION_SYSTEM_GUIDE)
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

// ── LR1 Phase 03 갈래B-2: cwd 검증(trust-boundary) — RED ────────────────────────
//
// 배경: req.workspaceRoot는 renderer(untrusted)가 IPC로 넘긴 경로 문자열이다(ADR-020 cwd
// 앵커 — 대화 레코드에서 복원되어 agentRun 요청에 실린다). 현재 buildClaudeSdkOptions는
// `cwd: req.workspaceRoot ?? process.cwd()`(sdkOptions.ts:197)로 무검증 그대로 SDK cwd에
// 꽂는다 — 존재하지 않는 경로가 와도 그대로 통과된다(trust-boundary 위반. main 프로세스가
// fs 접근 가능한 유일한 계층인데 검증을 안 함). 존재하지 않으면 process.cwd()로 폴백해야
// 안전하다.
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
    // RED: 현재 구현은 무검증이라 opts.cwd === NONEXISTENT_DIR이 되어 이 단언이 실패한다.
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
