// @vitest-environment jsdom
/**
 * lm1-effort-picker-gating.test.ts — LM1 P07 effort 피커 모델 반응형 게이팅 (TDD RED)
 *
 * 대상(R only — 구현은 renderer Worker 몫):
 *   02.Source/renderer/src/lib/pickerOptions.ts —
 *     신설 파생 헬퍼 `effortPickerFor(modelId, selectedEffort, table?)` (아직 미존재 → RED).
 *     shared 지원 표(`02.Source/shared/model-effort.ts` MODEL_EFFORT_SUPPORT, P06)를 소비해
 *     effort 피커의 유효 상태를 계산하는 순수 함수. 지원 표를 인자로 받아(기본 = shared 표)
 *     합성 레코드 주입을 허용한다(영호 확정 ③ — 공허 green 방지).
 *       반환 EffortPickerState = { options, disabled, displayValue }
 *   02.Source/renderer/src/components/01_conversation/ComposerPicker.tsx:79 —
 *     export `Picker`에 optional `disabled?: boolean` prop 추가(현재 부재 → RED). true면
 *     트리거 버튼 disabled.
 *   02.Source/renderer/src/components/00_shell/panel/PanelPicker.tsx:84 —
 *     로컬 `Picker`(별개 정의)에도 동일 `disabled?` prop 추가(현재 부재 → RED).
 *   02.Source/renderer/.../ComposerBar.tsx effort 피커 + PanelPicker RunPickers effort 피커 —
 *     effortPickerFor(model) 반영 배선(disabled·options·displayValue·title/note). 노출 지점
 *     전수(배지 3번째 지점 누락 교훈): ComposerBar + RunPickers 둘 다.
 *
 * 계약 핀(영호 확정 2026-07-17 · Phase 07 📐 박제 — 임의 변경 금지):
 *   - haiku(supports:false) → disabled=true · options 원형(항목 숨김 아님, 확정 ②) ·
 *     displayValue 원형.
 *   - opus·fable·sonnet(supports:true ∧ xhigh:true, 현행 표) → 전부 원형·활성.
 *   - 합성 {supports:true, xhigh:false}(현행 표엔 0개, 주입으로만 발화 — 확정 ③) →
 *     options에서 id==='xhigh' 제외 + selected==='xhigh'면 displayValue='high' 클램프.
 *   - 저장값 원형 보존 — 헬퍼는 순수 함수라 selectedEffort를 변형하지 않는다. 합성 xhigh:false
 *     모델에서 displayValue='high'였다가 같은 selectedEffort로 xhigh:true 모델을 다시 조회하면
 *     displayValue='xhigh' 복원(표시 계층 클램프, 저장 덮어쓰기 금지 — ⚠️ 함정).
 *   - 미지 modelId(표에 없음) → 현행 거동 유지(전부 원형·활성, 방어적 기본 — main이 전송
 *     시점 최종 클램프).
 *   - 'minimal'은 앱 내부 id(SDK effort 아님) — 어떤 경우에도 제외 대상 아님(⚠️ 함정).
 *   - 문구: haiku 선택 시 title에 "effort를 지원하지 않" 안내. 평시 title/note에 "새 대화"·
 *     "세션" 고지(effort는 SDK 라이브 API 부재로 세션 생성 시 1회 고정). 정확 문자열은
 *     renderer 구현이 확정 — 여기선 핵심 구절 포함으로 느슨 고정(육안 문구 조정 여지).
 *
 * 현재(RED) 이유:
 *   - effortPickerFor 미존재(pickerOptions namespace에 undefined) → ①~⑥ 헬퍼 단정 FAIL.
 *   - Picker(ComposerPicker export · PanelPicker 로컬) disabled prop 부재 → 트리거 항상 활성
 *     → ⑦⑧ 비활성 단정 FAIL.
 *   - ComposerBar·RunPickers effort 피커는 모델 무관 정적(title/disabled 부재) → ⑨⑩⑪ FAIL.
 *
 * 환경/결정론: @vitest-environment jsdom(컴포넌트 render 위해). 시간/랜덤/네트워크 의존 0 —
 *   헬퍼는 순수 함수, 컴포넌트는 순수 렌더러(window.api 미접촉). 방어적 window.api stub만 둔다.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createElement } from 'react'
import { render, cleanup } from '@testing-library/react'
import * as pickerOptions from '../../../02.Source/renderer/src/lib/pickerOptions'
import {
  EFFORTS,
  MODES,
  DEFAULT_MODEL,
  DEFAULT_EFFORT,
} from '../../../02.Source/renderer/src/lib/pickerOptions'
import { Picker as ComposerPickerPicker } from '../../../02.Source/renderer/src/components/01_conversation/ComposerPicker'
import { ComposerBar } from '../../../02.Source/renderer/src/components/01_conversation/ComposerBar'
import { RunPickers } from '../../../02.Source/renderer/src/components/00_shell/panel/PanelPicker'
import {
  MODEL_EFFORT_SUPPORT,
  type EffortSupport,
} from '../../../02.Source/shared/model-effort'

// ── 방어적 window.api stub (이 파일의 대상들은 순수 렌더러라 미접촉이나, 전이 import 대비) ──

Object.defineProperty(window, 'api', {
  value: {},
  writable: true,
  configurable: true,
})

afterEach(() => {
  cleanup()
})

// ── 신설 헬퍼 시그니처 핀(구현 전 additive 표면 — 네임스페이스 캐스트로 하드 모듈 에러 회피) ──
//    미존재 export는 undefined로 관측된다(선례 lm1-live-model-picker.test.ts ⑦ 미러).

interface EffortOptionT {
  id: string
  label: string
  desc: string
  level: number
}
interface EffortPickerStateT {
  /** xhigh 미지원(∧ supports) 모델이면 id==='xhigh' 제외 부분집합, 그 외 원형 */
  options: EffortOptionT[]
  /** supports:false(haiku) → true */
  disabled: boolean
  /** 표시 클램프: xhigh 미지원 ∧ selected==='xhigh' → 'high', 그 외 selected 원형 */
  displayValue: string
}
type EffortPickerFor = (
  modelId: string,
  selectedEffort: string,
  table?: Record<string, EffortSupport>,
) => EffortPickerStateT

const effortPickerFor = (pickerOptions as unknown as Record<string, unknown>)
  .effortPickerFor as EffortPickerFor | undefined

/** 합성 지원 표: 현행 3모델 + 주입 {supports:true, xhigh:false}(확정 ③ 비공허 green). */
const SYNTH_TABLE: Record<string, EffortSupport> = {
  ...MODEL_EFFORT_SUPPORT,
  noxhigh: { supports: true, xhigh: false },
}

const optionIds = (opts: EffortOptionT[] | undefined): string[] => (opts ?? []).map((o) => o.id)

// ═══════════════════════════════════════════════════════════════════════════════
// ① 헬퍼 — haiku(supports:false) → disabled + 옵션·표시 원형 (RED)
//    확정 ②: 미지원은 '숨김'이 아니라 '비활성 + 안내' — 발견성·레이아웃 불변.
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P07 ① effortPickerFor — haiku(supports:false) 비활성·원형 (RED)', () => {
  it('pickerOptions가 effortPickerFor를 export한다(단일 출처 파생 헬퍼)', () => {
    // RED: 현행 pickerOptions.ts에 헬퍼 부재(정적 EFFORTS 상수만 존재).
    expect(typeof effortPickerFor).toBe('function')
  })

  it("effortPickerFor('haiku','xhigh') → disabled=true · options 원형(6개, xhigh 포함) · displayValue 원형", () => {
    const r = effortPickerFor?.('haiku', 'xhigh')
    expect(r?.disabled).toBe(true)
    // 숨김 아님 — 항목은 전부 유지(확정 ②).
    expect(r?.options).toEqual(EFFORTS)
    expect(optionIds(r?.options)).toContain('xhigh')
    // 저장값 표시는 클램프하지 않음(supports:false는 전체 비활성이지 항목 제외가 아님).
    expect(r?.displayValue).toBe('xhigh')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ② 헬퍼 — 현행 지원 3모델(opus·fable·sonnet, supports:true ∧ xhigh:true) → 전부 원형 (RED)
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P07 ② effortPickerFor — 현행 지원 3모델 원형·활성 (RED)', () => {
  for (const modelId of ['opus', 'fable', 'sonnet'] as const) {
    it(`effortPickerFor('${modelId}','xhigh') → disabled=false · options 원형 · displayValue='xhigh'`, () => {
      const r = effortPickerFor?.(modelId, 'xhigh')
      expect(r?.disabled).toBe(false)
      expect(r?.options).toEqual(EFFORTS)
      expect(r?.displayValue).toBe('xhigh')
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// ③ 헬퍼 — 합성 {supports:true, xhigh:false} → xhigh 제외 + 표시 클램프 (RED)
//    확정 ③: 현행 표엔 이 조합이 0개라 합성 주입으로 필터·클램프 경로를 강제 발화(비공허 green).
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P07 ③ effortPickerFor — 합성 xhigh:false 제외+클램프 (RED)', () => {
  it("effortPickerFor('noxhigh','xhigh', SYNTH) → options에서 id==='xhigh' 제외(길이 -1) · 그 외 순서 보존", () => {
    const r = effortPickerFor?.('noxhigh', 'xhigh', SYNTH_TABLE)
    expect(r?.disabled).toBe(false)
    expect(optionIds(r?.options)).not.toContain('xhigh')
    expect(r?.options).toHaveLength(EFFORTS.length - 1)
    // xhigh만 빠지고 나머지는 원래 순서·내용 그대로.
    expect(r?.options).toEqual(EFFORTS.filter((o) => o.id !== 'xhigh'))
  })

  it("selected==='xhigh' → displayValue='high' 표시 클램프", () => {
    const r = effortPickerFor?.('noxhigh', 'xhigh', SYNTH_TABLE)
    expect(r?.displayValue).toBe('high')
  })

  it("selected가 xhigh가 아니면(예: 'max') 클램프하지 않음 — displayValue 원형", () => {
    const r = effortPickerFor?.('noxhigh', 'max', SYNTH_TABLE)
    expect(r?.displayValue).toBe('max')
    // 여전히 xhigh 항목은 제외(모델이 xhigh 미지원이므로).
    expect(optionIds(r?.options)).not.toContain('xhigh')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ④ 헬퍼 — 저장값 원형 보존·복원 (RED)
//    ⚠️ 함정: 클램프는 표시 계층에서만. 저장값(selectedEffort)을 덮어쓰면 복원 불가.
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P07 ④ effortPickerFor — 저장값 보존·복원(순수 함수) (RED)', () => {
  it('같은 selectedEffort=\'xhigh\'로 xhigh:false 모델 조회 후 xhigh:true 모델 조회 → displayValue \'high\'→\'xhigh\' 복원', () => {
    // 표시 클램프: 미지원 모델에선 high.
    const clamped = effortPickerFor?.('noxhigh', 'xhigh', SYNTH_TABLE)
    expect(clamped?.displayValue).toBe('high')

    // 저장값을 변형하지 않았으므로(순수 함수), 지원 모델로 되돌리면 원래 'xhigh'가 복원.
    const restored = effortPickerFor?.('opus', 'xhigh', SYNTH_TABLE)
    expect(restored?.displayValue).toBe('xhigh')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ⑤ 헬퍼 — 미지 모델(표에 없음) → 방어적 기본(전부 원형·활성) (RED)
//    renderer 게이트는 소음 절감용 — 신뢰 근거는 main 전송 시점 클램프(effortToOptions).
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P07 ⑤ effortPickerFor — 미지 모델 방어적 기본 (RED)', () => {
  it("effortPickerFor('gpt-5','xhigh') (표에 없음) → disabled=false · options 원형 · displayValue 원형", () => {
    const r = effortPickerFor?.('gpt-5', 'xhigh')
    expect(r?.disabled).toBe(false)
    expect(r?.options).toEqual(EFFORTS)
    expect(r?.displayValue).toBe('xhigh')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ⑥ 헬퍼 — 'minimal'은 앱 내부 id → 어떤 경우에도 제외 대상 아님 (RED)
//    ⚠️ 함정: minimal은 effortToOptions special-case(SDK effort 아님). xhigh 필터가
//    이를 SDK effort로 오분류해 제외하면 안 된다.
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P07 ⑥ effortPickerFor — minimal 불제외 (RED)', () => {
  it('xhigh:false 모델에서도 options에 minimal 유지(xhigh만 제외)', () => {
    const r = effortPickerFor?.('noxhigh', 'minimal', SYNTH_TABLE)
    expect(optionIds(r?.options)).toContain('minimal')
    expect(optionIds(r?.options)).not.toContain('xhigh')
  })

  it("selected==='minimal' → 클램프 없이 displayValue='minimal'", () => {
    const r = effortPickerFor?.('noxhigh', 'minimal', SYNTH_TABLE)
    expect(r?.displayValue).toBe('minimal')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ⑦ ComposerPicker export Picker — disabled prop → 트리거 버튼 비활성 (RED)
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P07 ⑦ ComposerPicker Picker — disabled prop (RED)', () => {
  it('disabled=true → 트리거 버튼 disabled', () => {
    const { container } = render(
      createElement(ComposerPickerPicker, {
        ariaLabel: 'Effort 선택',
        caption: 'Effort',
        options: EFFORTS,
        value: 'xhigh',
        onChange: vi.fn(),
        disabled: true,
      } as never),
    )
    const trigger = container.querySelector('button[aria-label="Effort 선택"]') as HTMLButtonElement | null
    expect(trigger).toBeTruthy()
    // RED: 현행 Picker는 disabled prop을 수용하지 않아 트리거가 항상 활성.
    expect(trigger?.disabled).toBe(true)
  })

  it('disabled 미전달(기본) → 트리거 버튼 활성 (회귀 방지 핀)', () => {
    const { container } = render(
      createElement(ComposerPickerPicker, {
        ariaLabel: 'Effort 선택',
        caption: 'Effort',
        options: EFFORTS,
        value: 'xhigh',
        onChange: vi.fn(),
      } as never),
    )
    const trigger = container.querySelector('button[aria-label="Effort 선택"]') as HTMLButtonElement | null
    expect(trigger?.disabled).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ⑧ PanelPicker 로컬 Picker — disabled prop → 트리거 비활성 (RED)
//    로컬 Picker는 export 안 됨(별개 정의) → RunPickers 렌더로 관측(배선 미러 원본과 동형).
//    haiku 모델 → effort 피커 비활성. 로컬 Picker disabled prop 부재 시 트리거 활성 유지 → RED.
// ═══════════════════════════════════════════════════════════════════════════════

function runPickersProps(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    picker: { model: 'opus', effort: 'xhigh', mode: 'bypass' },
    setPicker: vi.fn(),
    orchestration: false,
    setOrchestration: vi.fn(),
    replMode: true,
    setReplMode: vi.fn(),
    replLit: false,
    ...over,
  }
}

describe('LM1 P07 ⑧ PanelPicker 로컬 Picker — disabled prop (RED)', () => {
  it('haiku 모델 → effort 피커 트리거 disabled', () => {
    const { container } = render(
      createElement(RunPickers, runPickersProps({
        picker: { model: 'haiku', effort: 'xhigh', mode: 'bypass' },
      }) as never),
    )
    const effortTrigger = container.querySelector('button[aria-label="Effort 선택"]') as HTMLButtonElement | null
    expect(effortTrigger).toBeTruthy()
    // RED: 로컬 Picker disabled prop 부재 + 배선 부재 → 트리거 활성 유지.
    expect(effortTrigger?.disabled).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ⑨ ComposerBar — haiku 배선(effort 피커 비활성 + "지원하지 않" 안내) (RED)
// ═══════════════════════════════════════════════════════════════════════════════

function composerBarProps(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    disabled: false,
    isRunning: false,
    value: '',
    attachedImages: [],
    model: DEFAULT_MODEL,
    setModel: vi.fn(),
    effort: DEFAULT_EFFORT,
    setEffort: vi.fn(),
    mode: MODES[0].id,
    setMode: vi.fn(),
    orchestration: false,
    setOrchestration: vi.fn(),
    replMode: true,
    setReplMode: vi.fn(),
    replLit: false,
    doSend: vi.fn(),
    onAbort: vi.fn(),
    onAttachButton: vi.fn(),
    ...over,
  }
}

describe('LM1 P07 ⑨ ComposerBar — haiku effort 배선(비활성+안내) (RED)', () => {
  it('model=haiku → effort 피커 트리거 disabled', () => {
    const { container } = render(
      createElement(ComposerBar, composerBarProps({ model: 'haiku', effort: 'xhigh' }) as never),
    )
    const effortTrigger = container.querySelector('button[aria-label="Effort 선택"]') as HTMLButtonElement | null
    expect(effortTrigger).toBeTruthy()
    expect(effortTrigger?.disabled).toBe(true)
  })

  it('model=haiku → effort 피커 title에 "effort를 지원하지 않" 안내(느슨 고정)', () => {
    const { container } = render(
      createElement(ComposerBar, composerBarProps({ model: 'haiku', effort: 'xhigh' }) as never),
    )
    const effortTrigger = container.querySelector('button[aria-label="Effort 선택"]')
    // RED: 현행 effort 피커는 title 부재(모델 무관 정적).
    expect(effortTrigger?.getAttribute('title') ?? '').toContain('effort를 지원하지 않')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ⑩ ComposerBar — effort 세션 고정 고지(평시 지원 모델) (RED)
//    effort는 SDK 라이브 API 부재 → 세션 생성 시 1회 고정. 모델·모드 피커 title 관례 동형.
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P07 ⑩ ComposerBar — effort 세션 고정 고지 (RED)', () => {
  it('model=opus(지원) → effort 피커 title에 "새 대화"·"세션" 고지(느슨 고정)', () => {
    const { container } = render(
      createElement(ComposerBar, composerBarProps({ model: 'opus', effort: 'xhigh' }) as never),
    )
    const effortTrigger = container.querySelector('button[aria-label="Effort 선택"]')
    const title = effortTrigger?.getAttribute('title') ?? ''
    // RED: 현행 effort 피커는 세션 고지 문구 부재.
    expect(title).toContain('새 대화')
    expect(title).toContain('세션')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ⑪ PanelPicker — 배선 미러(노출 지점 전수: haiku 안내 + 세션 고지) (RED)
//    한 표면만 배선하면 다른 표면이 옛 정적 표시 노출(배지 3번째 지점 누락 교훈).
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P07 ⑪ PanelPicker RunPickers — 배선 미러 (RED)', () => {
  it('haiku 모델 → effort 피커 title에 "effort를 지원하지 않" 안내', () => {
    const { container } = render(
      createElement(RunPickers, runPickersProps({
        picker: { model: 'haiku', effort: 'xhigh', mode: 'bypass' },
      }) as never),
    )
    const effortTrigger = container.querySelector('button[aria-label="Effort 선택"]')
    expect(effortTrigger?.getAttribute('title') ?? '').toContain('effort를 지원하지 않')
  })

  it('opus 모델(지원) → effort 피커 title에 "새 대화"·"세션" 고지', () => {
    const { container } = render(
      createElement(RunPickers, runPickersProps({
        picker: { model: 'opus', effort: 'xhigh', mode: 'bypass' },
      }) as never),
    )
    const effortTrigger = container.querySelector('button[aria-label="Effort 선택"]')
    const title = effortTrigger?.getAttribute('title') ?? ''
    expect(title).toContain('새 대화')
    expect(title).toContain('세션')
  })
})
