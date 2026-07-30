/**
 * runArgs.test.ts — buildQueryOptions 골든 테스트 (Phase 21b TDD RED→GREEN)
 *
 * 신뢰경계 CRITICAL: renderer untrusted 문자열이 SDK 옵션으로 주입되지 않음 검증.
 * electron import 0 — 순수 node 환경에서 실행.
 *
 * 매핑 표 (Phase 21b, ADR-016):
 * ┌────────────────────────────────────┬──────────────────────────────────────────────────────┐
 * │ 입력 (model, effort, mode)         │ buildQueryOptions 출력                               │
 * ├────────────────────────────────────┼──────────────────────────────────────────────────────┤
 * │ opus, xhigh, auto                  │ {model:'opus', effort:'xhigh',                       │
 * │                                    │   permissionMode:'acceptEdits'}                      │
 * │ sonnet, xhigh, normal              │ {model:'sonnet', effort:'xhigh',                     │
 * │                                    │   permissionMode:'default'} (Sonnet5, 클램프 없음)   │
 * │ haiku, max, bypass                 │ {model:'haiku',                                      │
 * │                                    │   permissionMode:'bypassPermissions'} (effort 생략)  │
 * │ opus, minimal, plan                │ {model:'opus', thinking:{type:'disabled'},            │
 * │                                    │   permissionMode:'plan'}                             │
 * │ fable, minimal, *                  │ {model:'fable', permissionMode:...} thinking 없음    │
 * │ sonnet, minimal, *                 │ {model:'sonnet', thinking:{type:'disabled'}, ...}    │
 * │ '--inject', *, *                   │ {} 또는 mode만 (allowlist 차단)                      │
 * │ {}, {}, {}                         │ {} (전부 미전달)                                     │
 * │ undefined, high, undefined         │ {effort:'high'} (model 미전달)                       │
 * │ undefined, xhigh, undefined        │ {effort:'xhigh'} (model 미전달, 클램프 없음)         │
 * │ fable, xhigh, acceptEdits          │ {model:'fable', effort:'xhigh',                      │
 * │                                    │   permissionMode:'acceptEdits'}                      │
 * └────────────────────────────────────┴──────────────────────────────────────────────────────┘
 *
 * 원본 engine.ts effortToOptions 미러:
 *   - minimal + fable  → {} (thinking key 없음)
 *   - minimal + others → { thinking: { type: 'disabled' } }
 *   - other efforts    → { effort: clampedEffort }
 *   NOTE: effortToOptions는 MODEL_EFFORT_SUPPORT.supports 체크와 독립.
 *         haiku는 supports:false이므로 effort/thinking 둘 다 생략.
 */

import { describe, it, expect } from 'vitest'
import { buildQueryOptions } from '../../../02_Source/main/01_agents/runArgs'

describe('buildQueryOptions', () => {
  // ── 완료조건 골든 케이스 (Phase 21b) ─────────────────────────────────────────

  it('(opus, xhigh, auto) → effort:xhigh + permissionMode:acceptEdits', () => {
    expect(buildQueryOptions({ model: 'opus', effort: 'xhigh', mode: 'auto' })).toEqual({
      model: 'opus',
      effort: 'xhigh',
      permissionMode: 'acceptEdits'
    })
  })

  it('(sonnet, xhigh, normal) → Sonnet5 xhigh 지원, permissionMode:default (클램프 없음)', () => {
    expect(buildQueryOptions({ model: 'sonnet', effort: 'xhigh', mode: 'normal' })).toEqual({
      model: 'sonnet',
      effort: 'xhigh',
      permissionMode: 'default'
    })
  })

  it('(haiku, max, bypass) → haiku effort 생략, permissionMode:bypassPermissions', () => {
    expect(buildQueryOptions({ model: 'haiku', effort: 'max', mode: 'bypass' })).toEqual({
      model: 'haiku',
      permissionMode: 'bypassPermissions'
    })
  })

  it('(opus, minimal, plan) → thinking:{type:disabled}, permissionMode:plan', () => {
    // minimal + non-fable → { thinking: { type: 'disabled' } }
    expect(buildQueryOptions({ model: 'opus', effort: 'minimal', mode: 'plan' })).toEqual({
      model: 'opus',
      thinking: { type: 'disabled' },
      permissionMode: 'plan'
    })
  })

  it('(fable, minimal, *) → thinking 없음(fable minimal → {})', () => {
    // fable + minimal → {} from effortToOptions (no thinking key, no effort key)
    const result = buildQueryOptions({ model: 'fable', effort: 'minimal', mode: 'auto' })
    expect(result.model).toBe('fable')
    expect(result.permissionMode).toBe('acceptEdits')
    // thinking key는 없어야 함
    expect('thinking' in result).toBe(false)
    // effort key도 없어야 함
    expect('effort' in result).toBe(false)
  })

  it('(sonnet, minimal, *) → thinking:{type:disabled}', () => {
    const result = buildQueryOptions({ model: 'sonnet', effort: 'minimal', mode: 'normal' })
    expect(result).toEqual({
      model: 'sonnet',
      thinking: { type: 'disabled' },
      permissionMode: 'default'
    })
  })

  it('(fable, xhigh, acceptEdits) → fable xhigh 지원, permissionMode:acceptEdits', () => {
    expect(buildQueryOptions({ model: 'fable', effort: 'xhigh', mode: 'acceptEdits' })).toEqual({
      model: 'fable',
      effort: 'xhigh',
      permissionMode: 'acceptEdits'
    })
  })

  // ── 신뢰경계 (allowlist 차단) ─────────────────────────────────────────────────

  it('미지 model "--inject" → model 키 없음 (주입 차단)', () => {
    const result = buildQueryOptions({ model: '--inject' })
    expect('model' in result).toBe(false)
  })

  it('미지 model "gpt-4" → model 키 없음 (allowlist 외 모델 무시)', () => {
    const result = buildQueryOptions({ model: 'gpt-4' })
    expect('model' in result).toBe(false)
  })

  it('미지 mode "dontAsk" → permissionMode 키 없음 (allowlist 외 mode 무시)', () => {
    const result = buildQueryOptions({ model: 'opus', mode: 'dontAsk' })
    expect('model' in result).toBe(true)
    expect('permissionMode' in result).toBe(false)
  })

  it('미지 effort "turbo" → effort/thinking 키 없음 (유효하지 않은 값)', () => {
    const result = buildQueryOptions({ model: 'opus', effort: 'turbo' })
    expect('effort' in result).toBe(false)
    expect('thinking' in result).toBe(false)
  })

  // ── 미전달 케이스 ─────────────────────────────────────────────────────────────

  it('{} → {} (전부 미전달)', () => {
    expect(buildQueryOptions({})).toEqual({})
  })

  it('model 미전달 + effort "high" → {effort:"high"} (지원 가정)', () => {
    expect(buildQueryOptions({ effort: 'high' })).toEqual({ effort: 'high' })
  })

  it('model 미전달 + effort "xhigh" → {effort:"xhigh"} (클램프 없음, 지원 가정)', () => {
    expect(buildQueryOptions({ effort: 'xhigh' })).toEqual({ effort: 'xhigh' })
  })

  it('model 미전달 + effort "minimal" → thinking:{type:disabled} (fable 아니면 disabled)', () => {
    // model이 미전달 → fable로 취급하지 않음 → disabled
    const result = buildQueryOptions({ effort: 'minimal' })
    expect(result).toEqual({ thinking: { type: 'disabled' } })
  })

  it('model 미전달 + mode "bypass" → {permissionMode:"bypassPermissions"}', () => {
    expect(buildQueryOptions({ mode: 'bypass' })).toEqual({ permissionMode: 'bypassPermissions' })
  })

  // ── 개별 모델 검증 ────────────────────────────────────────────────────────────

  it('model만: opus → {model:"opus"}', () => {
    expect(buildQueryOptions({ model: 'opus' })).toEqual({ model: 'opus' })
  })

  it('model만: sonnet → {model:"sonnet"}', () => {
    expect(buildQueryOptions({ model: 'sonnet' })).toEqual({ model: 'sonnet' })
  })

  it('model만: haiku → {model:"haiku"}', () => {
    expect(buildQueryOptions({ model: 'haiku' })).toEqual({ model: 'haiku' })
  })

  it('model만: fable → {model:"fable"}', () => {
    expect(buildQueryOptions({ model: 'fable' })).toEqual({ model: 'fable' })
  })

  it('haiku + effort "high" → effort 생략 (haiku effort 미지원)', () => {
    const result = buildQueryOptions({ model: 'haiku', effort: 'high' })
    expect(result).toEqual({ model: 'haiku' })
    expect('effort' in result).toBe(false)
    expect('thinking' in result).toBe(false)
  })

  it('haiku + effort "minimal" → effort/thinking 둘 다 생략 (haiku effort 미지원)', () => {
    const result = buildQueryOptions({ model: 'haiku', effort: 'minimal' })
    expect(result).toEqual({ model: 'haiku' })
    expect('effort' in result).toBe(false)
    expect('thinking' in result).toBe(false)
  })

  it('sonnet + effort "max" → {model:"sonnet", effort:"max"} (sonnet max 지원)', () => {
    expect(buildQueryOptions({ model: 'sonnet', effort: 'max' })).toEqual({
      model: 'sonnet',
      effort: 'max'
    })
  })

  it('opus + effort "low" → {model:"opus", effort:"low"}', () => {
    expect(buildQueryOptions({ model: 'opus', effort: 'low' })).toEqual({
      model: 'opus',
      effort: 'low'
    })
  })

  // ── mode 매핑 ─────────────────────────────────────────────────────────────────

  it('mode만: normal → {permissionMode:"default"}', () => {
    expect(buildQueryOptions({ mode: 'normal' })).toEqual({ permissionMode: 'default' })
  })

  it('mode만: plan → {permissionMode:"plan"}', () => {
    expect(buildQueryOptions({ mode: 'plan' })).toEqual({ permissionMode: 'plan' })
  })

  it('mode만: auto → {permissionMode:"acceptEdits"}', () => {
    expect(buildQueryOptions({ mode: 'auto' })).toEqual({ permissionMode: 'acceptEdits' })
  })

  it('mode만: acceptEdits → {permissionMode:"acceptEdits"}', () => {
    expect(buildQueryOptions({ mode: 'acceptEdits' })).toEqual({ permissionMode: 'acceptEdits' })
  })

  it('mode만: bypass → {permissionMode:"bypassPermissions"}', () => {
    expect(buildQueryOptions({ mode: 'bypass' })).toEqual({ permissionMode: 'bypassPermissions' })
  })

  // ── 결과 키는 CLI 플래그 리터럴 없음 검증 ─────────────────────────────────────

  it('결과 객체에 CLI 플래그 문자열이 없음 (--model 등)', () => {
    const result = buildQueryOptions({ model: 'opus', effort: 'xhigh', mode: 'auto' })
    // 결과의 키/값이 CLI 플래그 형식이 아님
    const keys = Object.keys(result)
    for (const k of keys) {
      expect(k.startsWith('--')).toBe(false)
    }
    const values = Object.values(result)
    for (const v of values) {
      if (typeof v === 'string') {
        expect(v.startsWith('--')).toBe(false)
        expect(v).not.toBe('stream-json')
        expect(v).not.toBe('stream_json')
      }
    }
  })

  // ── 어휘 re-export 확인 ─────────────────────────────────────────────────────
  // 어휘의 내용·정합은 tests/shared/model-canon.test.ts가 단언한다. 여기서는
  // `./runArgs` 경로로 받아 온 소비처 관례가 살아있는지만 본다.

  it('어휘를 runArgs 경로로 re-export한다', async () => {
    const mod = await import('../../../02_Source/main/01_agents/runArgs')
    expect(Array.isArray(mod.KNOWN_MODELS)).toBe(true)
    expect(Array.isArray(mod.PICKER_MODELS)).toBe(true)
    expect(typeof mod.normalizeModel).toBe('function')
    expect(mod.MODEL_EFFORT_LEVELS).toBeTypeOf('object')
  })
})
