/**
 * run-args.test.ts — buildRunArgs 골든 테스트 (TDD RED→GREEN)
 *
 * 신뢰경계 CRITICAL: renderer untrusted 문자열이 CLI 인자로 주입되지 않음 검증.
 * electron import 0 — 순수 node 환경에서 실행.
 *
 * 매핑 표 (Phase 20b 확정):
 * ┌────────────────────────────────────┬──────────────────────────────────────────┐
 * │ 입력 (model, effort, mode)         │ buildRunArgs 출력                        │
 * ├────────────────────────────────────┼──────────────────────────────────────────┤
 * │ opus, xhigh, auto                  │ --model opus --effort xhigh              │
 * │                                    │   --permission-mode auto                 │
 * │ sonnet, xhigh, normal              │ --model sonnet --effort high             │
 * │                                    │   --permission-mode default (클램프)     │
 * │ haiku, max, bypass                 │ --model haiku --permission-mode          │
 * │                                    │   bypassPermissions (effort 생략)        │
 * │ opus, minimal, plan                │ --model opus --permission-mode plan      │
 * │                                    │   (minimal 생략)                         │
 * │ '--dangerously-skip-permissions'   │ [] (allowlist 차단)                      │
 * │ {}, {}, {}                         │ [] (전부 미전달)                         │
 * │ undefined, high, undefined         │ --effort high (model 미전달)             │
 * │ undefined, xhigh, undefined        │ --effort xhigh (model 미전달, 클램프 X)  │
 * │ fable, xhigh, acceptEdits          │ --model fable --effort xhigh             │
 * │                                    │   --permission-mode acceptEdits          │
 * └────────────────────────────────────┴──────────────────────────────────────────┘
 */

import { describe, it, expect } from 'vitest'
import { buildRunArgs } from '../../src/main/agents/run-args'

describe('buildRunArgs', () => {
  // ── 골든 케이스 (Phase 20b 완료조건) ──────────────────────────────────────

  it('(opus, xhigh, auto) → 전체 플래그 순서 고정', () => {
    expect(buildRunArgs({ model: 'opus', effort: 'xhigh', mode: 'auto' })).toEqual([
      '--model', 'opus',
      '--effort', 'xhigh',
      '--permission-mode', 'auto'
    ])
  })

  it('(sonnet, xhigh, normal) → xhigh→high 클램프 + normal→default 매핑', () => {
    expect(buildRunArgs({ model: 'sonnet', effort: 'xhigh', mode: 'normal' })).toEqual([
      '--model', 'sonnet',
      '--effort', 'high',
      '--permission-mode', 'default'
    ])
  })

  it('(haiku, max, bypass) → haiku effort 생략, bypass→bypassPermissions', () => {
    expect(buildRunArgs({ model: 'haiku', effort: 'max', mode: 'bypass' })).toEqual([
      '--model', 'haiku',
      '--permission-mode', 'bypassPermissions'
    ])
  })

  it('(opus, minimal, plan) → minimal effort 생략, plan→plan', () => {
    expect(buildRunArgs({ model: 'opus', effort: 'minimal', mode: 'plan' })).toEqual([
      '--model', 'opus',
      '--permission-mode', 'plan'
    ])
  })

  it('(fable, xhigh, acceptEdits) → fable xhigh 지원, acceptEdits 그대로', () => {
    expect(buildRunArgs({ model: 'fable', effort: 'xhigh', mode: 'acceptEdits' })).toEqual([
      '--model', 'fable',
      '--effort', 'xhigh',
      '--permission-mode', 'acceptEdits'
    ])
  })

  // ── 신뢰경계 (allowlist 차단) ──────────────────────────────────────────────

  it('미지 model "--dangerously-skip-permissions" → [] (주입 차단)', () => {
    expect(buildRunArgs({ model: '--dangerously-skip-permissions' })).toEqual([])
  })

  it('미지 model "gpt-4" → [] (allowlist 외 모델 무시)', () => {
    expect(buildRunArgs({ model: 'gpt-4' })).toEqual([])
  })

  it('미지 mode "dontAsk" → mode 생략 (allowlist 외 mode 무시)', () => {
    // dontAsk는 mode 맵에 없으므로 생략
    expect(buildRunArgs({ model: 'opus', mode: 'dontAsk' })).toEqual([
      '--model', 'opus'
    ])
  })

  it('미지 effort "turbo" → effort 생략 (유효하지 않은 CLI 값)', () => {
    expect(buildRunArgs({ model: 'opus', effort: 'turbo' })).toEqual([
      '--model', 'opus'
    ])
  })

  // ── 미전달 케이스 ────────────────────────────────────────────────────────

  it('{} → [] (전부 미전달)', () => {
    expect(buildRunArgs({})).toEqual([])
  })

  it('model 미전달 + effort "high" → effort 포함 (지원 가정)', () => {
    expect(buildRunArgs({ effort: 'high' })).toEqual([
      '--effort', 'high'
    ])
  })

  it('model 미전달 + effort "xhigh" → xhigh 그대로 (클램프 없음, 지원 가정)', () => {
    // 모델 미전달 시 "전체 지원" 가정 → 클램프 없이 그대로
    expect(buildRunArgs({ effort: 'xhigh' })).toEqual([
      '--effort', 'xhigh'
    ])
  })

  it('model 미전달 + effort "minimal" → effort 생략', () => {
    // minimal은 CLI에 없는 값 → 항상 생략
    expect(buildRunArgs({ effort: 'minimal' })).toEqual([])
  })

  it('model 미전달 + mode "bypass" → permission-mode만', () => {
    expect(buildRunArgs({ mode: 'bypass' })).toEqual([
      '--permission-mode', 'bypassPermissions'
    ])
  })

  // ── 개별 필드 단위 검증 ───────────────────────────────────────────────────

  it('model만: opus → --model opus', () => {
    expect(buildRunArgs({ model: 'opus' })).toEqual(['--model', 'opus'])
  })

  it('model만: sonnet → --model sonnet', () => {
    expect(buildRunArgs({ model: 'sonnet' })).toEqual(['--model', 'sonnet'])
  })

  it('model만: haiku → --model haiku', () => {
    expect(buildRunArgs({ model: 'haiku' })).toEqual(['--model', 'haiku'])
  })

  it('model만: fable → --model fable', () => {
    expect(buildRunArgs({ model: 'fable' })).toEqual(['--model', 'fable'])
  })

  it('haiku + effort "high" → effort 생략 (haiku effort 미지원)', () => {
    expect(buildRunArgs({ model: 'haiku', effort: 'high' })).toEqual([
      '--model', 'haiku'
    ])
  })

  it('sonnet + effort "max" → --effort max (sonnet max 지원)', () => {
    expect(buildRunArgs({ model: 'sonnet', effort: 'max' })).toEqual([
      '--model', 'sonnet',
      '--effort', 'max'
    ])
  })

  it('opus + effort "low" → --effort low', () => {
    expect(buildRunArgs({ model: 'opus', effort: 'low' })).toEqual([
      '--model', 'opus',
      '--effort', 'low'
    ])
  })

  it('mode만: normal → --permission-mode default', () => {
    expect(buildRunArgs({ mode: 'normal' })).toEqual([
      '--permission-mode', 'default'
    ])
  })

  it('mode만: plan → --permission-mode plan', () => {
    expect(buildRunArgs({ mode: 'plan' })).toEqual([
      '--permission-mode', 'plan'
    ])
  })

  it('mode만: auto → --permission-mode auto', () => {
    expect(buildRunArgs({ mode: 'auto' })).toEqual([
      '--permission-mode', 'auto'
    ])
  })

  it('mode만: acceptEdits → --permission-mode acceptEdits', () => {
    expect(buildRunArgs({ mode: 'acceptEdits' })).toEqual([
      '--permission-mode', 'acceptEdits'
    ])
  })

  // ── 결과는 항상 짝수 길이 (플래그+값 쌍) 또는 빈 배열 ──────────────────

  it('buildRunArgs 결과는 항상 짝수 길이', () => {
    const cases = [
      { model: 'opus', effort: 'xhigh', mode: 'auto' },
      { model: 'sonnet', effort: 'xhigh' },
      { model: 'haiku', effort: 'max' },
      { effort: 'high' },
      { mode: 'bypass' },
      {},
      { model: '--inject', effort: 'minimal', mode: 'badMode' }
    ]
    for (const c of cases) {
      const result = buildRunArgs(c)
      expect(result.length % 2).toBe(0)
    }
  })
})
