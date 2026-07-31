// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createElement } from 'react'
import { render, cleanup } from '@testing-library/react'
import {
  EFFORTS,
  MODES,
  MODELS,
  DEFAULT_MODEL,
  DEFAULT_EFFORT,
  effortPickerFor
} from '../../../02_Source/renderer/src/lib/pickerOptions'
import { Picker as ComposerPickerPicker } from '../../../02_Source/renderer/src/components/01_conversation/ComposerPicker'
import { ComposerBar } from '../../../02_Source/renderer/src/components/01_conversation/ComposerBar'
import { RunPickers } from '../../../02_Source/renderer/src/components/00_shell/panel/PanelPicker'
import { MODEL_EFFORT_LEVELS, type EffortLevel } from '../../../02_Source/shared/modelEffort'

Object.defineProperty(window, 'api', { value: {}, writable: true, configurable: true })

afterEach(() => {
  cleanup()
})

const HAIKU = 'claude-haiku-4-5'
const OPUS5 = 'claude-opus-5'

const PARTIAL = 'synthetic-partial'
const SYNTH_TABLE: Record<string, readonly EffortLevel[]> = {
  ...MODEL_EFFORT_LEVELS,
  [PARTIAL]: ['low', 'medium', 'high']
}

describe('effortPickerFor — effort 미지원 모델', () => {
  it('Haiku 4.5는 disabled=true이고 옵션은 원형을 유지한다', () => {
    const state = effortPickerFor(HAIKU, 'xhigh')
    expect(state.disabled).toBe(true)
    expect(state.options).toHaveLength(EFFORTS.length)
    expect(state.displayValue).toBe('xhigh')
  })
})

describe('effortPickerFor — 전 레벨 지원 모델', () => {
  for (const model of MODELS.map((m) => m.id).filter((id) => id !== HAIKU)) {
    it(`${model}은 활성이고 옵션·표시값이 원형이다`, () => {
      const state = effortPickerFor(model, 'max')
      expect(state.disabled).toBe(false)
      expect(state.options).toHaveLength(EFFORTS.length)
      expect(state.displayValue).toBe('max')
    })
  }
})

describe('effortPickerFor — 일부 레벨만 받는 모델(합성)', () => {
  it('지원하지 않는 레벨을 옵션에서 제외하고 순서를 보존한다', () => {
    const state = effortPickerFor(PARTIAL, 'high', SYNTH_TABLE)
    const ids = state.options.map((o) => o.id)
    expect(ids).not.toContain('max')
    expect(ids).not.toContain('xhigh')
    expect(ids).toEqual(['high', 'medium', 'low', 'minimal'])
  })

  it('선택값을 지원되는 최대 레벨로 낮춰 표시한다', () => {
    expect(effortPickerFor(PARTIAL, 'max', SYNTH_TABLE).displayValue).toBe('high')
    expect(effortPickerFor(PARTIAL, 'xhigh', SYNTH_TABLE).displayValue).toBe('high')
  })

  it('지원되는 선택값은 클램프하지 않는다', () => {
    expect(effortPickerFor(PARTIAL, 'low', SYNTH_TABLE).displayValue).toBe('low')
  })

  it("selected==='minimal'은 클램프 대상이 아니다", () => {
    expect(effortPickerFor(PARTIAL, 'minimal', SYNTH_TABLE).displayValue).toBe('minimal')
  })

  it('저장값을 파괴하지 않는다 — 모델을 되돌리면 원래 값이 복원된다', () => {
    const saved = 'max'
    expect(effortPickerFor(PARTIAL, saved, SYNTH_TABLE).displayValue).toBe('high')
    expect(effortPickerFor(OPUS5, saved, SYNTH_TABLE).displayValue).toBe('max')
  })
})

describe('effortPickerFor — 미지 모델', () => {
  it('표에 없는 모델은 방어적으로 활성 취급한다', () => {
    const state = effortPickerFor('gpt-5', 'xhigh')
    expect(state.disabled).toBe(false)
    expect(state.options).toHaveLength(EFFORTS.length)
    expect(state.displayValue).toBe('xhigh')
  })
})

function runPickersProps(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    picker: { model: OPUS5, effort: 'max', mode: 'bypass' },
    setPicker: vi.fn(),
    orchestration: false,
    setOrchestration: vi.fn(),
    replMode: true,
    setReplMode: vi.fn(),
    replLit: false,
    ...over
  }
}

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
    ...over
  }
}

const effortTriggerOf = (c: HTMLElement): HTMLButtonElement | null =>
  c.querySelector('button[aria-label="Effort 선택"]')

describe('ComposerPicker Picker — disabled prop', () => {
  it('disabled=true → 트리거 버튼 비활성', () => {
    const { container } = render(
      createElement(ComposerPickerPicker, {
        ariaLabel: 'Effort 선택',
        caption: 'Effort',
        options: EFFORTS,
        value: 'max',
        onChange: vi.fn(),
        disabled: true
      } as never)
    )
    expect(effortTriggerOf(container)?.disabled).toBe(true)
  })

  it('disabled 미전달 → 트리거 버튼 활성 (회귀 방지 핀)', () => {
    const { container } = render(
      createElement(ComposerPickerPicker, {
        ariaLabel: 'Effort 선택',
        caption: 'Effort',
        options: EFFORTS,
        value: 'max',
        onChange: vi.fn()
      } as never)
    )
    expect(effortTriggerOf(container)?.disabled).toBe(false)
  })
})

describe('노출 지점 전수 — effort 게이팅이 모든 표면에 배선됐다', () => {
  const surfaces: [string, (model: string) => HTMLElement][] = [
    [
      'ComposerBar',
      (model) =>
        render(createElement(ComposerBar, composerBarProps({ model, effort: 'max' }) as never))
          .container
    ],
    [
      'PanelPicker RunPickers',
      (model) =>
        render(
          createElement(
            RunPickers,
            runPickersProps({ picker: { model, effort: 'max', mode: 'bypass' } }) as never
          )
        ).container
    ]
  ]

  for (const [name, renderWith] of surfaces) {
    it(`${name}: Haiku 4.5 → 트리거 비활성 + "지원하지 않" 안내`, () => {
      const container = renderWith(HAIKU)
      const trigger = effortTriggerOf(container)
      expect(trigger, `${name} 트리거`).toBeTruthy()
      expect(trigger?.disabled).toBe(true)
      expect(trigger?.getAttribute('title') ?? '').toContain('effort를 지원하지 않')
    })

    it(`${name}: Opus 5 → 세션 고정 고지`, () => {
      const container = renderWith(OPUS5)
      const title = effortTriggerOf(container)?.getAttribute('title') ?? ''
      expect(title).toContain('새 대화')
      expect(title).toContain('세션')
    })
  }
})
