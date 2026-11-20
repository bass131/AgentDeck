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
    requestLiveModelSwitch('run-1', true, 'nova', SDK_MODEL_ROWS)
    expect(setModel).not.toHaveBeenCalled()
    requestLiveModelSwitch('run-1', true, 'sonnet', SDK_MODEL_ROWS)
    expect(setModel).toHaveBeenCalledWith({ runId: 'run-1', model: 'sonnet' })
    // 최소 목록도 별칭 행을 가진다(M11 G2, M06 Backlog 16)
    requestLiveModelSwitch('run-2', true, 'sonnet', FALLBACK_MODELS)
    expect(setModel).toHaveBeenCalledWith({ runId: 'run-2', model: 'sonnet' })
  })
})

// M11 G2 — M06 Backlog 24. effort는 세션을 만들 때 정해져 대화 중에 바뀌지 않았다.
describe('실행 중 effort 전환', () => {
  it('REPL 실행이 있으면 agent.setEffort로 보내고, 없거나 단계가 아니면 보내지 않는다', async () => {
    const setEffort = vi.fn(async () => ({ ok: true }))
    Object.defineProperty(window, 'api', { value: adaptFlatApi({ agentSetEffort: setEffort }), writable: true, configurable: true })
    const { requestLiveEffortSwitch } = await import('@renderer/05_Conversation/state/composer')
    requestLiveEffortSwitch(null, true, 'low')
    requestLiveEffortSwitch('run-1', false, 'low')
    requestLiveEffortSwitch('run-1', true, 'turbo')
    expect(setEffort).not.toHaveBeenCalled()
    requestLiveEffortSwitch('run-1', true, 'low')
    expect(setEffort).toHaveBeenCalledWith({ runId: 'run-1', effort: 'low' })
  })

  it('대화 입력창에서 effort를 고르면 실행 중인 REPL 세션에 보낸다', async () => {
    const setEffort = vi.fn(async () => ({ ok: true }))
    Object.defineProperty(window, 'api', { value: adaptFlatApi({ agentSetEffort: setEffort }), writable: true, configurable: true })
    useAppStore.setState({ replMode: true, currentRunId: 'run-live', modelRows: [...FALLBACK_MODELS], selectedModel: DEFAULT_MODEL } as never)
    const { Composer } = await import('@renderer/05_Conversation/Composer')
    const { container } = render(createElement(Composer, { value: '', onChange: vi.fn(), onSend: vi.fn(), onAbort: vi.fn(), isRunning: true }))
    const effortBtn = Array.from(container.querySelectorAll('.pick-btn')).find(
      (b) => b.querySelector('.pick-lbl')?.textContent === 'Effort',
    ) as HTMLButtonElement
    fireEvent.click(effortBtn)
    const low = Array.from(container.querySelectorAll('.po-main')).find((el) => el.textContent === '낮음') as HTMLElement
    fireEvent.click(low)
    expect(setEffort).toHaveBeenCalledWith({ runId: 'run-live', effort: 'low' })
    expect(container.querySelector('.pick-btn .pick-val')).toBeTruthy()
    useAppStore.setState({ replMode: false, currentRunId: null } as never)
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

  // M11 G2 — M06 Backlog 13. main이 SDK 목록을 못 받아 최소 목록·캐시를 주면, 재시작 전까지 다시 묻지 않았다.
  it('SDK 목록이 아니면(builtin·cache) 조금 뒤 다시 묻고, sdk를 받으면 멈춘다', async () => {
    vi.useFakeTimers()
    try {
      useAppStore.setState({ modelRows: [...FALLBACK_MODELS] } as never)
      const listModels = vi.fn()
        .mockResolvedValueOnce({ models: [...FALLBACK_MODELS], source: 'builtin' })
        .mockResolvedValueOnce({ models: [...FALLBACK_MODELS], source: 'cache' })
        .mockResolvedValue({ models: SDK_MODEL_ROWS, source: 'sdk' })
      Object.defineProperty(window, 'api', {
        value: adaptFlatApi({ agentListModels: listModels }),
        writable: true,
        configurable: true,
      })
      await useAppStore.getState().loadModelRows()
      expect(listModels).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(5_000)
      expect(listModels).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(15_000)
      expect(listModels).toHaveBeenCalledTimes(3)
      expect(useAppStore.getState().modelRows).toEqual(SDK_MODEL_ROWS)
      await vi.advanceTimersByTimeAsync(600_000)
      expect(listModels).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('다시 묻기는 세 번까지다', async () => {
    vi.useFakeTimers()
    try {
      const listModels = vi.fn().mockResolvedValue({ models: [...FALLBACK_MODELS], source: 'builtin' })
      Object.defineProperty(window, 'api', {
        value: adaptFlatApi({ agentListModels: listModels }),
        writable: true,
        configurable: true,
      })
      await useAppStore.getState().loadModelRows()
      await vi.advanceTimersByTimeAsync(3_600_000)
      expect(listModels).toHaveBeenCalledTimes(4)
      // IPC 자체가 실패해도 같은 규칙으로 다시 묻는다
      const failing = vi.fn().mockRejectedValue(new Error('ipc down'))
      Object.defineProperty(window, 'api', {
        value: adaptFlatApi({ agentListModels: failing }),
        writable: true,
        configurable: true,
      })
      await useAppStore.getState().loadModelRows()
      await vi.advanceTimersByTimeAsync(3_600_000)
      expect(failing).toHaveBeenCalledTimes(4)
    } finally {
      vi.useRealTimers()
    }
  })

  // M11 G2 — M06 Backlog 17. 기본 모델이 손으로 적은 값에 묶여 있었다.
  it('SDK 목록이 오면 손대지 않은 새 대화의 모델이 default 행의 정식 ID가 된다', async () => {
    const rows = SDK_MODEL_ROWS.map((r) => (r.value === 'default' ? { ...r, resolvedModel: 'claude-fable-5-2' } : r))
    useAppStore.setState({ modelRows: [...FALLBACK_MODELS], selectedModel: DEFAULT_MODEL, modelChosen: false, conversationId: null, thread: [] } as never)
    Object.defineProperty(window, 'api', {
      value: adaptFlatApi({ agentListModels: vi.fn(async () => ({ models: rows, source: 'sdk' })) }),
      writable: true,
      configurable: true,
    })
    await useAppStore.getState().loadModelRows()
    expect(useAppStore.getState().selectedModel).toBe('claude-fable-5-2')
  })

  it('사람이 고른 모델이나 연 대화의 모델은 덮지 않는다', async () => {
    const rows = SDK_MODEL_ROWS.map((r) => (r.value === 'default' ? { ...r, resolvedModel: 'claude-fable-5-2' } : r))
    Object.defineProperty(window, 'api', {
      value: adaptFlatApi({ agentListModels: vi.fn(async () => ({ models: rows, source: 'sdk' })), agentSetModel: vi.fn(async () => ({ ok: true })) }),
      writable: true,
      configurable: true,
    })
    useAppStore.setState({ modelRows: [...FALLBACK_MODELS], selectedModel: 'claude-sonnet-5-5', modelChosen: false, conversationId: null, thread: [] } as never)
    useAppStore.getState().setSelectedModel(DEFAULT_MODEL)
    await useAppStore.getState().loadModelRows()
    expect(useAppStore.getState().selectedModel).toBe(DEFAULT_MODEL)

    useAppStore.setState({ selectedModel: DEFAULT_MODEL, modelChosen: false, conversationId: 'cv-9', thread: [] } as never)
    await useAppStore.getState().loadModelRows()
    expect(useAppStore.getState().selectedModel).toBe(DEFAULT_MODEL)
  })

  // M11 G2 — M06 Backlog 18. 직전 턴이 잰 창은 그 모델의 창이다 — 모델을 바꾸면 버려서 재적재 예산이 보수 기본값으로 간다.
  it('모델을 바꾸면 직전 턴이 잰 창(lastContextWindow)을 버린다', () => {
    useAppStore.setState({ selectedModel: 'claude-opus-5-5', lastContextWindow: 1_000_000, currentRunId: null } as never)
    useAppStore.getState().setSelectedModel('claude-haiku-4-5-20251001')
    expect(useAppStore.getState().lastContextWindow).toBeUndefined()
    // 같은 모델을 다시 고르면 그대로 둔다
    useAppStore.setState({ lastContextWindow: 200_000 } as never)
    useAppStore.getState().setSelectedModel('claude-haiku-4-5-20251001')
    expect(useAppStore.getState().lastContextWindow).toBe(200_000)
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
