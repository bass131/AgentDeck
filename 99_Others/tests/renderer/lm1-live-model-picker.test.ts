// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createElement } from 'react'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { resetAppStore } from './helpers/storeReset'
import { ComposerBar } from '../../../02_Source/renderer/src/components/01_conversation/ComposerBar'
import { RunPickers } from '../../../02_Source/renderer/src/components/00_shell/panel/PanelPicker'
import { MODES, DEFAULT_MODEL, DEFAULT_EFFORT } from '../../../02_Source/renderer/src/lib/pickerOptions'
import * as composerMod from '../../../02_Source/renderer/src/store/slices/composer'
import type { AgentEventPayload } from '../../../02_Source/shared/ipcContract'

const mockApi = {
  conversationLoad: async () => ({ conversations: [] }),
  conversationSave: async () => ({ id: 'cv-1' }),
  agentRun: vi.fn(async () => ({ runId: 'r1' })),
  agentAbort: async () => ({ accepted: true }),
  agentSetMode: vi.fn(async () => ({ accepted: true })),
  agentSetModel: vi.fn(async () => ({ accepted: true })),
  onAgentEvent: vi.fn((_cb: (payload: AgentEventPayload) => void) => () => {}),
  listFiles: async () => ({ files: [] }),
  getUsage: async () => ({ fiveHour: null, weekly: null }),
  pathForFile: () => '',
  workspaceOpen: async () => ({ rootPath: null, tree: null }),
  referenceList: async () => ({ references: [] }),
  referenceTree: async () => ({ tree: null }),
  referenceAdd: async () => ({ reference: null }),
  fsRead: async () => ({ kind: 'not-found' }),
}

Object.defineProperty(window, 'api', {
  value: mockApi,
  writable: true,
  configurable: true,
})

async function getStore() {
  const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
  return useAppStore
}

type Store = Awaited<ReturnType<typeof getStore>>

function resetStore(useAppStore: Store, patch: Record<string, unknown> = {}) {
  mockApi.agentSetModel.mockClear()
  resetAppStore(useAppStore, {
    conversationId: null,
    currentRunId: null,
    isRunning: false,
    replMode: true,
    selectedModel: DEFAULT_MODEL,
    ...patch,
  })
}

afterEach(() => {
  cleanup()
})

describe('LM1 P04 ① setSelectedModel — 활성 REPL run 라이브 모델 전환 IPC (RED)', () => {
  let useAppStore: Store

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: 'run-live-1', replMode: true, selectedModel: 'opus' })
  })

  it("setSelectedModel('haiku') → agentSetModel({runId:'run-live-1', model:'haiku'}) 1회 + 로컬 selectedModel 반영", () => {
    useAppStore.getState().setSelectedModel('haiku')

    expect(useAppStore.getState().selectedModel).toBe('haiku')
    expect(mockApi.agentSetModel).toHaveBeenCalledTimes(1)
    expect(mockApi.agentSetModel).toHaveBeenCalledWith({ runId: 'run-live-1', model: 'haiku' })
  })

  it("model은 picker id 원문 'sonnet' 그대로(매핑 없음 — 모델은 SDK 원문 수용, ADR-003)", () => {
    useAppStore.getState().setSelectedModel('sonnet')

    expect(mockApi.agentSetModel).toHaveBeenCalledTimes(1)
    expect(mockApi.agentSetModel).toHaveBeenCalledWith({ runId: 'run-live-1', model: 'sonnet' })
  })
})

describe('LM1 P04 ②③④⑤ 라이브 전환 게이트 — 미충족 시 미발화 (GREEN 핀)', () => {
  it('② replMode=false(단발 대화) → agentSetModel 미호출 — 라이브 전환은 REPL 전용', async () => {
    const useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: 'run-oneshot', replMode: false, selectedModel: 'opus' })

    useAppStore.getState().setSelectedModel('haiku')

    expect(mockApi.agentSetModel).not.toHaveBeenCalled()
    expect(useAppStore.getState().selectedModel).toBe('haiku')
  })

  it('③ currentRunId=null(진행 중 세션 없음) → agentSetModel 미호출 + 로컬 변경만', async () => {
    const useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: null, replMode: true, selectedModel: 'opus' })

    useAppStore.getState().setSelectedModel('haiku')

    expect(mockApi.agentSetModel).not.toHaveBeenCalled()
    expect(useAppStore.getState().selectedModel).toBe('haiku')
  })

  it("④ 미지 모델 id('gpt-5' — LIVE_SWITCHABLE_MODELS 밖) → agentSetModel 미호출", async () => {
    const useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: 'run-live-1', replMode: true, selectedModel: 'opus' })

    useAppStore.getState().setSelectedModel('gpt-5')

    expect(mockApi.agentSetModel).not.toHaveBeenCalled()
  })

  it("⑤ same-value(현재 selectedModel과 동일) → agentSetModel 미호출 (sendNow 재호출 중복 차단)", async () => {
    const useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: 'run-live-1', replMode: true, selectedModel: 'haiku' })

    useAppStore.getState().setSelectedModel('haiku')

    expect(mockApi.agentSetModel).not.toHaveBeenCalled()
    expect(useAppStore.getState().selectedModel).toBe('haiku')
  })
})

describe('LM1 P04 ⑥ 대화 복원 경로 — raw setState는 IPC 0 (GREEN 핀·conversation 전환 미러)', () => {
  it('useAppStore.setState({selectedModel}) 직접 호출 → agentSetModel 미호출', async () => {
    const useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: 'run-live-1', replMode: true, selectedModel: 'opus' })

    useAppStore.setState({ selectedModel: 'haiku' } as Parameters<typeof useAppStore.setState>[0])

    expect(useAppStore.getState().selectedModel).toBe('haiku')
    expect(mockApi.agentSetModel).not.toHaveBeenCalled()
  })
})

const requestLiveModelSwitch = (composerMod as unknown as Record<string, unknown>)
  .requestLiveModelSwitch as
  | ((runId: string | null | undefined, replMode: boolean, model: string) => void)
  | undefined

describe('LM1 P04 ⑦ requestLiveModelSwitch — 단일 출처 게이트 (RED)', () => {
  beforeEach(() => {
    mockApi.agentSetModel.mockClear()
  })

  it('composer.ts가 requestLiveModelSwitch를 export한다(패널·단일챗 공유 출처)', () => {
    expect(typeof requestLiveModelSwitch).toBe('function')
  })

  it('게이트 3조건 충족(replMode+runId+유효 model) → agentSetModel({runId, model}) 1회', () => {
    requestLiveModelSwitch?.('panel-run-1', true, 'haiku')

    expect(mockApi.agentSetModel).toHaveBeenCalledTimes(1)
    expect(mockApi.agentSetModel).toHaveBeenCalledWith({ runId: 'panel-run-1', model: 'haiku' })
  })
})

function composerBarProps(over: Record<string, unknown> = {}) {
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

function runPickersProps(over: Record<string, unknown> = {}) {
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

describe('LM1 P04 문구 — ComposerBar 모델 피커 체감 언어 (RED)', () => {
  it('title에 "즉시 적용" 포함(현재 "새 대화(세션)부터"라 RED)', () => {
    const { container } = render(createElement(ComposerBar, composerBarProps() as never))
    const trigger = container.querySelector('button[aria-label="모델 선택"]')
    expect(trigger).toBeTruthy()
    expect(trigger?.getAttribute('title') ?? '').toContain('즉시 적용')
  })

  it('펼침 note에 "다음 응답부터 적용" 포함(현재 "새 대화(세션)부터"라 RED)', () => {
    const { container } = render(createElement(ComposerBar, composerBarProps() as never))
    const trigger = container.querySelector('button[aria-label="모델 선택"]') as HTMLButtonElement
    fireEvent.click(trigger)
    const note = container.querySelector('.pick-menu-note')
    expect(note?.textContent ?? '').toContain('다음 응답부터 적용')
  })
})

describe('LM1 P04 문구 — PanelPicker 모델 피커 동형 (노출 지점 전수, RED)', () => {
  it('title에 "즉시 적용" 포함(현재 모델 피커에 title 부재라 RED)', () => {
    const { container } = render(createElement(RunPickers, runPickersProps() as never))
    const trigger = container.querySelector('button[aria-label="모델 선택"]')
    expect(trigger).toBeTruthy()
    expect(trigger?.getAttribute('title') ?? '').toContain('즉시 적용')
  })

  it('펼침 note에 "다음 응답부터 적용" 포함(현재 모델 피커에 note 부재라 RED)', () => {
    const { container } = render(createElement(RunPickers, runPickersProps() as never))
    const trigger = container.querySelector('button[aria-label="모델 선택"]') as HTMLButtonElement
    fireEvent.click(trigger)
    const note = container.querySelector('.pick-menu-note')
    expect(note?.textContent ?? '').toContain('다음 응답부터 적용')
  })
})
