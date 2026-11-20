// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement } from 'react'
import { render, cleanup } from '@testing-library/react'
import {
  EFFORTS,
  MODES,
  DEFAULT_MODEL,
  DEFAULT_EFFORT,
  effortPickerFor
} from '@renderer/03_Agent/pickerOptions'
import { Picker as ComposerPickerPicker } from '@renderer/05_Conversation/ComposerPicker'
import { ComposerBar } from '@renderer/05_Conversation/ComposerBar'
import { PickerGroup } from '@renderer/05_Conversation/PickerGroup'
import { useAppStore } from '@renderer/00_App/appStore'
import { FALLBACK_MODELS } from '@shared/03_Agent/models/knownModels'
import type { ModelRow } from '@shared/03_Agent/models/modelList'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'
import { SDK_MODEL_ROWS } from '../../shared/00_Helpers/sdkModelRows'

Object.defineProperty(window, 'api', { value: adaptFlatApi({}), writable: true, configurable: true })

// M06 G4: effort 단계는 SDK 목록의 supportedEffortLevels에서 온다 — 실측 행을 store에 깐다.
beforeEach(() => {
  useAppStore.setState({ modelRows: SDK_MODEL_ROWS } as never)
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ modelRows: [...FALLBACK_MODELS] } as never)
})

const HAIKU = 'claude-haiku-4-5'
const OPUS5 = 'claude-opus-5'

const PARTIAL = 'claude-partial-1'
const SYNTH_ROWS: ModelRow[] = [
  ...SDK_MODEL_ROWS,
  { value: PARTIAL, displayName: 'Partial 1', description: '', supportedEffortLevels: ['low', 'medium', 'high'] }
]

describe('effortPickerFor — effort 미지원 모델', () => {
  it('Haiku 4.5(옛 저장 ID)는 disabled=true이고 옵션은 원형을 유지한다', () => {
    const state = effortPickerFor(HAIKU, 'xhigh', SDK_MODEL_ROWS)
    expect(state.disabled).toBe(true)
    expect(state.options).toHaveLength(EFFORTS.length)
    expect(state.displayValue).toBe('xhigh')
  })
})

describe('effortPickerFor — 전 레벨 지원 모델', () => {
  for (const model of FALLBACK_MODELS.map((m) => m.value)) {
    it(`${model}은 활성이고 옵션·표시값이 원형이다`, () => {
      const state = effortPickerFor(model, 'max', SDK_MODEL_ROWS)
      expect(state.disabled).toBe(false)
      expect(state.options).toHaveLength(EFFORTS.length)
      expect(state.displayValue).toBe('max')
    })
  }
})

describe('effortPickerFor — 일부 레벨만 받는 모델(합성)', () => {
  it('지원하지 않는 레벨을 옵션에서 제외하고 순서를 보존한다', () => {
    const ids = effortPickerFor(PARTIAL, 'high', SYNTH_ROWS).options.map((o) => o.id)
    expect(ids).toEqual(['high', 'medium', 'low'])
  })

  it('선택값을 지원되는 최대 레벨로 낮춰 표시한다', () => {
    expect(effortPickerFor(PARTIAL, 'max', SYNTH_ROWS).displayValue).toBe('high')
    expect(effortPickerFor(PARTIAL, 'xhigh', SYNTH_ROWS).displayValue).toBe('high')
  })

  it('지원되는 선택값은 클램프하지 않는다', () => {
    expect(effortPickerFor(PARTIAL, 'low', SYNTH_ROWS).displayValue).toBe('low')
  })

  // main과 같은 규칙 — 옛 「최소」는 low로 보인다(G4 검수 1-2).
  it("옛 저장값 'minimal'은 low로 보인다", () => {
    expect(effortPickerFor(PARTIAL, 'minimal', SYNTH_ROWS).displayValue).toBe('low')
    expect(effortPickerFor(PARTIAL, 'turbo', SYNTH_ROWS).displayValue).toBe('high')
    expect(effortPickerFor(OPUS5, 'minimal', SYNTH_ROWS).displayValue).toBe('low')
  })

  it('저장값을 파괴하지 않는다 — 모델을 되돌리면 원래 값이 복원된다', () => {
    const saved = 'max'
    expect(effortPickerFor(PARTIAL, saved, SYNTH_ROWS).displayValue).toBe('high')
    expect(effortPickerFor(OPUS5, saved, SYNTH_ROWS).displayValue).toBe('max')
  })
})

// M11 G2 — M06 Backlog 16. main은 목록에 없는 모델에 effort를 싣지 않으므로 메뉴도 끈다.
describe('effortPickerFor — 목록에 없는 모델', () => {
  it('목록에 없는 모델은 effort 메뉴를 끈다 — main도 effort를 보내지 않는다', () => {
    const state = effortPickerFor('claude-nova-9', 'xhigh', SDK_MODEL_ROWS)
    expect(state.disabled).toBe(true)
    expect(state.options).toHaveLength(EFFORTS.length)
    expect(state.displayValue).toBe('xhigh')
  })

  it('최소 목록만 있을 때 저장된 claude-opus-5도 끈다', () => {
    expect(effortPickerFor('claude-opus-5', 'max', FALLBACK_MODELS).disabled).toBe(true)
    expect(effortPickerFor('opus', 'max', FALLBACK_MODELS).disabled).toBe(false)
  })
})

// M05 G9b: 패널 선택기 사본(RunPickers)이 지워지고 패널도 PickerGroup을 쓴다.
function pickerGroupProps(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    model: OPUS5,
    setModel: vi.fn(),
    effort: 'max',
    setEffort: vi.fn(),
    mode: 'bypass',
    setMode: vi.fn(),
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
      'PickerGroup(패널 공용)',
      (model) =>
        render(
          createElement(
            PickerGroup,
            pickerGroupProps({ model, effort: 'max', mode: 'bypass' }) as never
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
