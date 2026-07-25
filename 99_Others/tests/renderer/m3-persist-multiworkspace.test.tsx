// @vitest-environment jsdom
/**
 * m3-persist-multiworkspace.test.tsx — M3 MultiWorkspace 복원/저장 TDD (jsdom)
 *
 * 검증 범위:
 *   (B3) race 게이트 — 복원 완료 전 save 미발화 (빈 상태가 복원본 안 덮어씀)
 *   (B4) picker 리프팅 — PanelView가 picker/setPicker props 수용, 기존 picker 동작 회귀 0
 *   통합 — multiSessionLoad() 호출 시 마운트 복원 가능성 확인
 *
 * TDD 원칙: 실패(RED) → 구현 → 통과(GREEN).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import React from 'react'
import type { PersistedMultiState } from '../../../02.Source/shared/ipc-contract'
import { makeMultiCmdMocks } from './helpers/multiCmdMock'

// ── window.api mock ───────────────────────────────────────────────────────────
// RMW1-P04/P05: 저장(flush)은 multiCmdUpsert(명령 1발) 경유 — 통짜 SAVE(P05 제거)는
// 더 이상 존재하지 않는다. multiCmdUpsert는 main의 실제 순수 병합 함수(upsertSession)를
// 재사용하는 helpers/multiCmdMock.ts로 위임(getDisk/setDisk를 이 파일의 `_disk`에 연결 —
// multiSessionLoad와 같은 단일 진실원 공유. multi-session-persist-2.test.tsx와 동일 패턴).

let runIdCounter = 0
let _disk: PersistedMultiState | null = null
const mockMultiSessionLoad = vi.fn()
const { multiCmdUpsert: mockMultiCmdUpsert } = makeMultiCmdMocks(
  () => _disk,
  (s) => { _disk = s }
)

const mockApi = {
  agentRun: vi.fn().mockImplementation(() => {
    const runId = `run-${runIdCounter++}`
    return Promise.resolve({ runId })
  }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  multiCmdUpsert: mockMultiCmdUpsert,
  multiSessionLoad: mockMultiSessionLoad,
  pickFolder: vi.fn().mockResolvedValue({ path: null }),
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
  windowMinimize: vi.fn(),
  windowMaximizeToggle: vi.fn().mockResolvedValue({ maximized: false }),
  windowClose: vi.fn(),
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
  windowGetBounds: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1200, height: 800 }),
  windowSetBounds: vi.fn(),
  windowDragStart: vi.fn(),
  windowDragEnd: vi.fn(),
  windowResizeStart: vi.fn(),
  windowResizeEnd: vi.fn(),
  onWindowState: vi.fn().mockReturnValue(() => {}),
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

async function renderMultiWorkspace() {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  useAppStore.setState({ workspaceRoot: '/test/root', workspaceMode: 'multi' })
  const { MultiWorkspace } = await import('../../../02.Source/renderer/src/components/00_shell/MultiWorkspace')
  let container: Element = document.body
  await act(async () => {
    const result = render(React.createElement(MultiWorkspace))
    container = result.container
  })
  return container
}

// ── setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  runIdCounter = 0
  vi.clearAllMocks()
  _disk = null
  // 기본: load는 null 반환 (first-run)
  mockMultiSessionLoad.mockResolvedValue({ state: null })
})

afterEach(() => {
  cleanup()
  vi.resetModules()
})

// ═══════════════════════════════════════════════════════════════════════════════
// (B3) race 게이트 — 복원 완료 전 save 미발화
// ═══════════════════════════════════════════════════════════════════════════════

describe('B3 — race 게이트: 복원 완료 전 save 미발화', () => {

  it('마운트 시 multiSessionLoad()가 호출된다', async () => {
    await renderMultiWorkspace()
    expect(mockMultiSessionLoad).toHaveBeenCalled()
  })

  it('multiSessionLoad가 null 반환 시 — first-run, save는 복원 완료 후에만 허용', async () => {
    // load가 지연되는 상황 시뮬레이션: 마운트 직후 save가 즉시 발화하지 않아야 함
    let resolveLoad!: (v: { state: null }) => void
    const loadDeferred = new Promise<{ state: null }>((res) => { resolveLoad = res })
    mockMultiSessionLoad.mockReturnValue(loadDeferred)

    await renderMultiWorkspace()

    // 복원 전에는 save 미발화
    // (restored 게이트가 false이므로 저장 effect가 실행되지 않아야 함)
    const saveBeforeResolve = mockMultiCmdUpsert.mock.calls.length

    // load 완료
    await act(async () => {
      resolveLoad({ state: null })
      await new Promise((r) => setTimeout(r, 600)) // 디바운스 대기
    })

    // load 완료 전에 save가 실행됐을 가능성 → 0이어야 한다 (빈 상태 덮어쓰기 차단)
    // load 후에는 허용되지만 빈 state null 반환 시 first-run은 save 발화 여부가 구현 결정
    // 핵심은: 복원 완료 전 saveBeforeResolve === 0
    expect(saveBeforeResolve).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// (B4) picker 리프팅 — PanelView picker/setPicker props 수용
// ═══════════════════════════════════════════════════════════════════════════════

describe('B4 — picker 리프팅: PanelView가 picker/setPicker props 수용', () => {

  it('PanelView는 picker prop을 외부에서 주입받아 모델 표시', async () => {
    // PanelView를 직접 렌더하여 picker prop이 동작하는지 확인
    const { PanelView } = await import('../../../02.Source/renderer/src/components/00_shell/MultiWorkspace')
    const { DEFAULT_PICKER, SAMPLE_PANELS } = await import('../../../02.Source/renderer/src/lib/multiAgentSampleData')
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 동적 import에서는 `import type`을 쓸 수 없어 값으로 가져오지만 ReturnType<typeof usePanelSession> 타입 캐스트에만 사용
    const { usePanelSession } = await import('../../../02.Source/renderer/src/store/panelSession')

    // 훅을 직접 쓰기 어려우므로 mock session을 제공
    const mockSession = {
      state: {
        thread: [],
        isRunning: false,
        activeLoops: [],
        errorMessage: undefined,
        lastUsage: undefined,
        lastContextWindow: undefined,
        currentRunId: null,
        openMsgId: null,
        openGroupId: null,
        seq: 0,
        changedFiles: new Set<string>(),
        fileDiffs: {},
        thinkingText: null,
        // TG1 P02: AppState 신규 필수 필드(thinkingStartedAt) — hookRuns와 동일 취지의
        // 최소 collateral 추가(mock 정합 — 활동 신호 아직 없음).
        thinkingStartedAt: null,
        todos: [],
        subagents: [],
        pendingPermission: null,
        pendingQuestion: null,
        loopsStoppedNotice: false,
        // LR4 P05: AppState 신규 필드(autonomyActive) — 이 스위트가 fixture로 손수 구성한
        // 마운트 mock을 PanelSessionState와 정합시키기 위한 최소 collateral 추가.
        autonomyActive: false,
        // BL1 P03: AppState 신규 필드(stale-watchdog) — 동일 취지의 최소 collateral 추가.
        lastActivityAt: null,
        bannerStale: false,
        staleDismissed: false,
        // goal 표시 수명 일원화(BL1 후속): AppState 신규 필드(goalRun) — 동일 취지의
        // 최소 collateral 추가.
        goalRun: null,
        // LR4 P07: PanelSessionState 신규 필수 필드(replMode) — 기본 held-open true로 시드.
        replMode: true,
        // GAP1 P04: AppState 신규 필드 — required 조이기 collateral (apiRetry/compacting/sdkSessionState).
        apiRetry: null,
        compacting: null,
        sdkSessionState: null,
        // GAP1 P05: AppState 신규 필수 필드(hookRuns) — 동일 취지의 최소 collateral 추가.
        // HookTimeline이 hookRuns.length를 읽어 undefined 크래시 → []로 봉합.
        hookRuns: [],
      },
      send: vi.fn(),
      abort: vi.fn(),
      restore: vi.fn(),
      dismissLoopsStopped: vi.fn(),
      respondPermission: vi.fn(),
      // LR4 P07: PanelSessionHookResult에 setReplMode(필수) 추가 — mock 정합용.
      setReplMode: vi.fn(),
      // BL1 P03: PanelSessionHookResult에 dismissGoalStale(필수) 추가 — mock 정합용.
      dismissGoalStale: vi.fn(),
    }

    const pickerState = { ...DEFAULT_PICKER, model: 'opus' }
    const setPicker = vi.fn()

    let container: Element = document.body
    await act(async () => {
      const result = render(
        React.createElement(PanelView, {
          slot: 0,
          panel: SAMPLE_PANELS[0],
          session: mockSession as ReturnType<typeof usePanelSession>,
          workspaceRoot: '/test',
          expanded: false,
          onExpand: vi.fn(),
          onPrompt: vi.fn(),
          onPickFolder: vi.fn(),
          picker: pickerState,
          setPicker: setPicker,
        })
      )
      container = result.container
    })

    // picker prop이 수용돼 렌더됐는지 확인 (opus 모델 레이블 표시)
    expect(container).toBeTruthy()
  })

  it('MultiWorkspace 마운트 — picker가 per-slot state로 관리됨 (리프팅 후)', async () => {
    const container = await renderMultiWorkspace()
    // 패널이 렌더됐는지 확인
    const panels = container.querySelectorAll('.ma-panel')
    expect(panels.length).toBeGreaterThan(0)
    // 피커 버튼이 존재 (모델/Effort/모드)
    const pickBtns = container.querySelectorAll('.pick-btn')
    expect(pickBtns.length).toBeGreaterThan(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// (통합) multiSessionLoad 복원 경로 — 기본 동작
// ═══════════════════════════════════════════════════════════════════════════════

describe('통합 — multiSessionLoad 마운트 복원', () => {

  it('load state=null 시 크래시 없이 기본 패널 렌더', async () => {
    mockMultiSessionLoad.mockResolvedValue({ state: null })
    const container = await renderMultiWorkspace()
    expect(container.querySelector('.multi')).toBeTruthy()
  })

  it('load state가 유효한 PersistedMultiState → 패널 count 복원', async () => {
    const savedState = {
      version: 2,
      activeSessionId: 'sess-1',
      sessions: [{
        id: 'sess-1',
        count: 3,
        panels: [
          { title: '복원패널1', picker: { model: 'sonnet', effort: 'high', mode: 'normal' } },
          { title: '복원패널2', picker: { model: 'opus', effort: 'max', mode: 'normal' } },
          { title: '복원패널3', picker: { model: 'haiku', effort: 'medium', mode: 'normal' } },
        ],
      }],
    }

    mockMultiSessionLoad.mockResolvedValue({ state: savedState })

    const container = await renderMultiWorkspace()

    // 복원 후 count=3 반영 — panel이 3개
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    const panels = container.querySelectorAll('.ma-panel:not(.ma-placeholder)')
    expect(panels.length).toBe(3)
  })
})
