// @vitest-environment jsdom
/**
 * lm1-live-model-picker.test.ts — LM1 P04 renderer 모델 피커 라이브 전환 배선 (TDD RED)
 *
 * 대상(R only — 구현은 renderer Worker 몫):
 *   02.Source/renderer/src/store/slices/composer.ts —
 *     (1) `LIVE_SWITCHABLE_MODELS`(= pickerOptions MODELS id 파생 — 리터럴 신설 금지, 4번째
 *         동기화 지점 방지) + `requestLiveModelSwitch(runId, replMode, model)`(requestLive
 *         ModeSwitch :48-62 미러 — 게이트 3조건·fire-and-forget).
 *     (2) `setSelectedModel`에 same-value 가드 후 낙관 set + `requestLiveModelSwitch` 헬퍼
 *         호출(:150-152는 현재 raw set만 — dogfood 결함의 모델판 원인).
 *   02.Source/renderer/.../ComposerBar.tsx:97-98 + PanelPicker.tsx(RunPickers 모델 Picker) —
 *     체감 언어 문구 2지점(title "즉시 적용" · note "다음 응답부터 적용"). 노출 지점 전수.
 *   02.Source/renderer/.../PanelView.tsx handleSetPicker — model 분기 추가(멀티패널) →
 *     같은 requestLiveModelSwitch 단일 출처 공유(게이트 드리프트 차단).
 *
 * 계약 핀(영호 확정 2026-07-17 · Phase 04 📐 박제 — 임의 변경 금지):
 *   - 게이트 3조건(전부 만족 시에만 IPC): replMode=true ∧ currentRunId≠null ∧
 *     model ∈ LIVE_SWITCHABLE_MODELS('opus'|'sonnet'|'haiku'|'fable', MODELS 파생).
 *     통과 시 `window.api.agentSetModel({runId, model})` fire-and-forget 1회.
 *   - same-value 가드 — Conversation.tsx sendNow가 setSelectedModel을 재호출한다.
 *     현재값과 동일 model이면 IPC 미발화(어댑터 change-guard와 이중 방어).
 *   - 낙관 반영만(역통지 이벤트 없음) — 로컬을 먼저 set하고 위임은 뒤로(서버 응답 미대기).
 *   - 대화 복원 경로(conversation.ts:103·sessions.ts:375)는 raw set({selectedModel})이라
 *     액션 훅 미경유 → 로드 시 IPC 오발화 0(여기 무접촉 — 재봉인 대상 아님).
 *
 * 현재(RED) 이유:
 *   - setSelectedModel은 `set({selectedModel})`만 수행(IPC 0) → ① 라이브 발화 단정 FAIL.
 *   - `requestLiveModelSwitch`(모델)·`LIVE_SWITCHABLE_MODELS` 미존재 → ⑦ 단위 게이트 FAIL.
 *   - ComposerBar/PanelPicker 모델 피커 문구가 "새 대화(세션)부터"(또는 부재) → 문구 단정 FAIL.
 *   게이트 미충족·복원 raw set 케이스(②③④⑤⑥)는 현행에서도 IPC 0이라 GREEN 핀(구현 후 불변).
 *
 * 환경/결정론: @vitest-environment jsdom(문구 render 위해). window.api mock(gap1-p13-live-
 *   mode-picker 미러 + agentSetModel 추가) → jsdom window 증강. 시간/랜덤/네트워크 의존 0.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createElement } from 'react'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { makeInitialState } from '../../../02.Source/renderer/src/store/reducer'
import { ComposerBar } from '../../../02.Source/renderer/src/components/01_conversation/ComposerBar'
import { RunPickers } from '../../../02.Source/renderer/src/components/00_shell/panel/PanelPicker'
import { MODES, DEFAULT_MODEL, DEFAULT_EFFORT } from '../../../02.Source/renderer/src/lib/pickerOptions'
import * as composerMod from '../../../02.Source/renderer/src/store/slices/composer'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

// ── mock window.api (gap1-p13-live-mode-picker.test.ts 미러 + agentSetModel 캡처) ──

const mockApi = {
  conversationLoad: async () => ({ conversations: [] }),
  conversationSave: async () => ({ id: 'cv-1' }),
  agentRun: vi.fn(async () => ({ runId: 'r1' })),
  agentAbort: async () => ({ accepted: true }),
  agentSetMode: vi.fn(async () => ({ accepted: true })),
  // P04 대상: 라이브 모델 전환 IPC — 현행 setSelectedModel은 이를 호출하지 않는다(RED 관찰점).
  agentSetModel: vi.fn(async () => ({ accepted: true })),
  // 구독 등록은 no-op unsubscribe만 반환 — P04는 permission_mode 역동기화를 다루지 않는다.
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

// jsdom window 증강(replace 아님 — render가 쓰는 document/window는 jsdom 것을 유지).
Object.defineProperty(window, 'api', {
  value: mockApi,
  writable: true,
  configurable: true,
})

// ── 공통 store 헬퍼 ─────────────────────────────────────────────────────────────

async function getStore() {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  return useAppStore
}

type Store = Awaited<ReturnType<typeof getStore>>

function resetStore(useAppStore: Store, patch: Record<string, unknown> = {}) {
  mockApi.agentSetModel.mockClear()
  useAppStore.setState({
    ...makeInitialState(),
    conversationId: null,
    currentRunId: null,
    isRunning: false,
    replMode: true,
    selectedModel: DEFAULT_MODEL, // 'opus'
    ...patch,
  } as Parameters<typeof useAppStore.setState>[0])
}

afterEach(() => {
  cleanup()
})

// ═══════════════════════════════════════════════════════════════════════════════
// ① 활성 REPL run + 유효 모델 → agentSetModel fire-and-forget (RED)
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P04 ① setSelectedModel — 활성 REPL run 라이브 모델 전환 IPC (RED)', () => {
  let useAppStore: Store

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: 'run-live-1', replMode: true, selectedModel: 'opus' })
  })

  it("setSelectedModel('haiku') → agentSetModel({runId:'run-live-1', model:'haiku'}) 1회 + 로컬 selectedModel 반영", () => {
    useAppStore.getState().setSelectedModel('haiku')

    // 낙관 반영(회귀 0) — 로컬 상태는 먼저 갱신된다.
    expect(useAppStore.getState().selectedModel).toBe('haiku')
    // RED: 현행 setSelectedModel은 IPC를 호출하지 않는다(raw set만 — 모델판 dogfood 결함).
    expect(mockApi.agentSetModel).toHaveBeenCalledTimes(1)
    expect(mockApi.agentSetModel).toHaveBeenCalledWith({ runId: 'run-live-1', model: 'haiku' })
  })

  it("model은 picker id 원문 'sonnet' 그대로(매핑 없음 — 모델은 SDK 원문 수용, ADR-003)", () => {
    useAppStore.getState().setSelectedModel('sonnet')

    expect(mockApi.agentSetModel).toHaveBeenCalledTimes(1)
    expect(mockApi.agentSetModel).toHaveBeenCalledWith({ runId: 'run-live-1', model: 'sonnet' })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ②③④⑤ 게이트 미충족 → 미발화(로컬만) — GREEN 핀·구현 후 불변
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P04 ②③④⑤ 라이브 전환 게이트 — 미충족 시 미발화 (GREEN 핀)', () => {
  it('② replMode=false(단발 대화) → agentSetModel 미호출 — 라이브 전환은 REPL 전용', async () => {
    const useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: 'run-oneshot', replMode: false, selectedModel: 'opus' })

    useAppStore.getState().setSelectedModel('haiku')

    // 단발 run은 어댑터 계약상 setModel 자체가 no-op(SDK streaming-input 한정) — 애초에 안 보냄.
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

    // renderer 게이트는 소음 절감용(신뢰 근거는 main P03) — 미지 id는 IPC 소음 0으로 거른다.
    expect(mockApi.agentSetModel).not.toHaveBeenCalled()
  })

  it("⑤ same-value(현재 selectedModel과 동일) → agentSetModel 미호출 (sendNow 재호출 중복 차단)", async () => {
    const useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: 'run-live-1', replMode: true, selectedModel: 'haiku' })

    useAppStore.getState().setSelectedModel('haiku') // 이미 'haiku' → 변화 없음

    // Conversation.tsx sendNow가 setSelectedModel을 매 전송 재호출 → 가드 없으면 중복 발화.
    expect(mockApi.agentSetModel).not.toHaveBeenCalled()
    expect(useAppStore.getState().selectedModel).toBe('haiku')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ⑥ 복원 경로 무발화 — raw set({selectedModel})은 액션 훅 미경유 (GREEN 핀)
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P04 ⑥ 대화 복원 경로 — raw setState는 IPC 0 (GREEN 핀·conversation 전환 미러)', () => {
  it('useAppStore.setState({selectedModel}) 직접 호출 → agentSetModel 미호출', async () => {
    const useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: 'run-live-1', replMode: true, selectedModel: 'opus' })

    // 대화 복원(conversation.ts:103·sessions.ts:375)은 raw set — 액션 훅을 경유하지 않으므로
    // 로드 시 IPC가 튀지 않는다(이 경로를 액션으로 바꾸면 오발화 — 함정 핀).
    useAppStore.setState({ selectedModel: 'haiku' } as Parameters<typeof useAppStore.setState>[0])

    expect(useAppStore.getState().selectedModel).toBe('haiku')
    expect(mockApi.agentSetModel).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ⑦ 멀티패널 분기 — requestLiveModelSwitch 단일 출처 게이트 (RED)
//    미러 원본에 패널 handleSetPicker 렌더 테스트가 없어 → 단일 출처 헬퍼 단위 게이트로 대체.
//    PanelView handleSetPicker(model 분기)·단일챗 setSelectedModel이 이 함수 하나를 공유한다.
// ═══════════════════════════════════════════════════════════════════════════════

/** 구현 전 additive 표면 — 네임스페이스 캐스트(미존재 export는 undefined, 하드 모듈 에러 아님). */
const requestLiveModelSwitch = (composerMod as unknown as Record<string, unknown>)
  .requestLiveModelSwitch as
  | ((runId: string | null | undefined, replMode: boolean, model: string) => void)
  | undefined

describe('LM1 P04 ⑦ requestLiveModelSwitch — 단일 출처 게이트 (RED)', () => {
  beforeEach(() => {
    mockApi.agentSetModel.mockClear()
  })

  it('composer.ts가 requestLiveModelSwitch를 export한다(패널·단일챗 공유 출처)', () => {
    // RED: 현행 composer.ts에 모델판 헬퍼 부재(모드판 requestLiveModeSwitch만 존재).
    expect(typeof requestLiveModelSwitch).toBe('function')
  })

  it('게이트 3조건 충족(replMode+runId+유효 model) → agentSetModel({runId, model}) 1회', () => {
    requestLiveModelSwitch?.('panel-run-1', true, 'haiku')

    // RED: 헬퍼 undefined(optional chaining no-op) → 위임 0.
    expect(mockApi.agentSetModel).toHaveBeenCalledTimes(1)
    expect(mockApi.agentSetModel).toHaveBeenCalledWith({ runId: 'panel-run-1', model: 'haiku' })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 문구 2지점 — 체감 언어 정본(노출 지점 전수: ComposerBar + PanelPicker) (RED)
//   title에 "즉시 적용" · note에 "다음 응답부터 적용" 포함. 현재 "새 대화(세션)부터"(또는
//   패널은 부재)라 RED. render 컨벤션 = ComposerBar.test.tsx(jsdom render + DOM 조회) 미러.
// ═══════════════════════════════════════════════════════════════════════════════

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
    fireEvent.click(trigger) // 드롭다운 펼침 → .pick-menu-note 노출
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
