// @vitest-environment jsdom
// M06 G4 — 선택기와 effort 메뉴는 main이 준 SDK 모델 목록(displayName, supportedEffortLevels)으로 그린다.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement } from 'react'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { PickerGroup } from '@renderer/05_Conversation/PickerGroup'
import { useAppStore } from '@renderer/00_App/appStore'
import { EFFORTS, DEFAULT_MODEL, modelOptionsFor } from '@renderer/03_Agent/pickerOptions'
import { FALLBACK_MODELS } from '@shared/03_Agent/models/knownModels'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'
import { SDK_MODEL_ROWS } from '../../shared/00_Helpers/sdkModelRows'

function props(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    model: 'claude-opus-5-5',
    setModel: vi.fn(),
    effort: 'max',
    setEffort: vi.fn(),
    mode: 'auto',
    setMode: vi.fn(),
    orchestration: false,
    setOrchestration: vi.fn(),
    replMode: true,
    setReplMode: vi.fn(),
    replLit: false,
    ...over,
  }
}

const trigger = (c: HTMLElement, label: string): HTMLButtonElement =>
  c.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement
const valueOf = (c: HTMLElement, label: string): string =>
  trigger(c, label).querySelector('.pick-val')?.textContent ?? ''
function openOptions(c: HTMLElement, label: string): string[] {
  fireEvent.click(trigger(c, label))
  return Array.from(c.querySelectorAll('[role="option"] .po-main')).map((e) => e.textContent ?? '')
}

beforeEach(() => {
  Object.defineProperty(window, 'api', { value: adaptFlatApi({}), writable: true, configurable: true })
  useAppStore.setState({ modelRows: SDK_MODEL_ROWS } as never)
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ modelRows: [...FALLBACK_MODELS] } as never)
})

describe('선택기 — SDK 목록으로 그린다', () => {
  it('목록의 displayName을 정식 ID 하나당 한 줄로 보여 준다', () => {
    const { container } = render(createElement(PickerGroup, props() as never))
    const names = openOptions(container, '모델 선택')
    expect(names).toHaveLength(13)
    expect(names.slice(0, 4)).toEqual(['Opus 5.5', 'Fable 5.2', 'Sonnet 5.5', 'Haiku 5.5'])
    expect(names).toContain('Haiku 4.5')
    expect(names).not.toContain('Default (recommended)')
  })

  it('목록이 바뀌면 손 편집 없이 새 모델이 나타난다', () => {
    useAppStore.setState({
      modelRows: [...SDK_MODEL_ROWS, { value: 'claude-nova-1', displayName: 'Nova 1', description: '', supportedEffortLevels: ['low'] }],
    } as never)
    const { container } = render(createElement(PickerGroup, props() as never))
    expect(openOptions(container, '모델 선택')).toContain('Nova 1')
  })

  it('별칭 행을 고르면 정식 ID(resolvedModel)를 저장 값으로 넘긴다', () => {
    const setModel = vi.fn()
    const { container } = render(createElement(PickerGroup, props({ setModel }) as never))
    fireEvent.click(trigger(container, '모델 선택'))
    const sonnet = Array.from(container.querySelectorAll('[role="option"]')).find((b) => b.textContent?.includes('Sonnet 5.5'))
    fireEvent.click(sonnet!)
    expect(setModel).toHaveBeenCalledWith('claude-sonnet-5-5')
  })

  it('목록이 오기 전에는 최소 목록으로 뜬다', () => {
    useAppStore.setState({ modelRows: [...FALLBACK_MODELS] } as never)
    const { container } = render(createElement(PickerGroup, props({ model: DEFAULT_MODEL }) as never))
    expect(openOptions(container, '모델 선택')).toHaveLength(4)
  })
})

describe('옛 ID로 저장된 대화', () => {
  it('claude-haiku-4-5는 날짜 접미 행과 맞아 「Haiku 4.5」로 보이고 effort가 꺼진다', () => {
    const { container } = render(createElement(PickerGroup, props({ model: 'claude-haiku-4-5' }) as never))
    expect(valueOf(container, '모델 선택')).toBe('Haiku 4.5')
    expect(trigger(container, 'Effort 선택').disabled).toBe(true)
  })

  it('claude-opus-5는 목록의 「Opus 5」 행으로 보인다', () => {
    const { container } = render(createElement(PickerGroup, props({ model: 'claude-opus-5' }) as never))
    expect(valueOf(container, '모델 선택')).toBe('Opus 5')
  })

  it('목록에 없는 저장 ID는 첫 행으로 둔갑하지 않고 자기 이름으로 보인다', () => {
    const { container } = render(createElement(PickerGroup, props({ model: 'claude-opus-4-1' }) as never))
    expect(valueOf(container, '모델 선택')).toBe('Opus 4.1')
    expect(modelOptionsFor(SDK_MODEL_ROWS, 'claude-opus-4-1').map((o) => o.id)).toContain('claude-opus-4-1')
  })
})

describe('effort 메뉴 — supportedEffortLevels로 그린다', () => {
  it('「최소」 단계가 없다', () => {
    expect(EFFORTS.map((e) => e.id)).not.toContain('minimal')
    const { container } = render(createElement(PickerGroup, props() as never))
    expect(openOptions(container, 'Effort 선택')).not.toContain('최소')
  })

  // G4 검수 1-2: 옛 「최소」는 가장 싼 설정이었으므로 「낮음」으로 읽는다.
  it("옛 저장값 'minimal'은 「낮음」으로 보인다", () => {
    const { container } = render(createElement(PickerGroup, props({ effort: 'minimal' }) as never))
    expect(valueOf(container, 'Effort 선택')).toBe('낮음')
  })

  it('Opus 4.6은 xhigh가 없는 목록대로 그린다', () => {
    const { container } = render(createElement(PickerGroup, props({ model: 'claude-opus-4-6' }) as never))
    expect(openOptions(container, 'Effort 선택')).toEqual(['최대', '높음', '보통', '낮음'])
  })
})

describe('실행 중 모델 전환 — 받는 목록 기준', () => {
  it('짧은 별칭은 넘긴 목록에 있을 때만 전환 요청을 보낸다', async () => {
    const setModel = vi.fn(async () => ({ ok: true }))
    Object.defineProperty(window, 'api', { value: adaptFlatApi({ agentSetModel: setModel }), writable: true, configurable: true })
    const { requestLiveModelSwitch } = await import('@renderer/05_Conversation/state/composer')
    requestLiveModelSwitch('run-1', true, 'sonnet', FALLBACK_MODELS)
    expect(setModel).not.toHaveBeenCalled()
    requestLiveModelSwitch('run-1', true, 'sonnet', SDK_MODEL_ROWS)
    expect(setModel).toHaveBeenCalledWith({ runId: 'run-1', model: 'sonnet' })
  })
})

describe('store — main에서 목록 받기', () => {
  it('loadModelRows가 agent.listModels 응답으로 목록을 바꾼다', async () => {
    useAppStore.setState({ modelRows: [...FALLBACK_MODELS] } as never)
    const listModels = vi.fn(async () => ({ models: SDK_MODEL_ROWS, source: 'sdk' }))
    Object.defineProperty(window, 'api', {
      value: adaptFlatApi({ agentListModels: listModels }),
      writable: true,
      configurable: true,
    })
    await useAppStore.getState().loadModelRows()
    expect(listModels).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().modelRows).toEqual(SDK_MODEL_ROWS)
  })

  it('IPC가 실패하면 지금 목록을 그대로 둔다', async () => {
    useAppStore.setState({ modelRows: [...FALLBACK_MODELS] } as never)
    Object.defineProperty(window, 'api', {
      value: adaptFlatApi({ agentListModels: vi.fn(async () => Promise.reject(new Error('x'))) }),
      writable: true,
      configurable: true,
    })
    await useAppStore.getState().loadModelRows()
    expect(useAppStore.getState().modelRows).toEqual([...FALLBACK_MODELS])
  })

  it('대화 저장에는 선택기가 넘긴 정식 ID가 실린다', async () => {
    const save = vi.fn(async () => ({ id: 'cv-1' }))
    Object.defineProperty(window, 'api', {
      value: adaptFlatApi({ conversationSave: save, conversationLoad: vi.fn(async () => ({ conversations: [] })) }),
      writable: true,
      configurable: true,
    })
    const opt = modelOptionsFor(SDK_MODEL_ROWS).find((o) => o.label === 'Fable 5.2')!
    useAppStore.setState({
      selectedModel: DEFAULT_MODEL,
      conversationId: null,
      thread: [{ kind: 'msg', id: 'm1', role: 'user', text: 'hi' }],
    } as never)
    useAppStore.getState().setSelectedModel(opt.id)
    await useAppStore.getState().saveConversation()
    const payload = (save.mock.calls[0] as unknown as [{ conversation: { model?: string } }])[0]
    expect(payload.conversation.model).toBe('claude-fable-5-2')
  })
})
