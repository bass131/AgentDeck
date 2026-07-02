// @vitest-environment jsdom
/**
 * lr3-p07-multipanel-continuity.test.tsx — LR3 Phase 07: 멀티패널 전환-연속성 회귀.
 *
 * 배경(01.Phases/switch-continuity/_diagnosis.md §멀티패널, 야간2 진단 63526a5):
 *   usePanelSession()의 상태(useReducer)와 구독(onAgentEvent)이 컴포넌트 수명에 묶여
 *   있어, MultiWorkspace가 언마운트되면(모드 전환·멀티세션 전환 — Shell.tsx
 *   key={activeMultiSessionId}) 진행 중 run의 이벤트가 영구 증발하고(구독 해제) 아무도
 *   안 듣는 run이 main에서 계속 도는 고스트가 생겼다.
 *
 * 수리(Phase 07): usePanelSlot(sessionKey, slot) — 상태·구독을 모듈 스코프 매니저(앱
 * 수명)로 승격. (세션,슬롯) 키가 같으면 컴포넌트가 몇 번을 언마운트→재마운트해도 진행이
 * 이어진다. 세션이 다르면(키가 다르면) 격리된다(교차오염 0). 세션 영구 삭제 시에는
 * 명시적으로 정리한다(고스트 방지).
 *
 * 검증 범위:
 *   (1) 증발 재현+수리: 진행 중 unmount(모드 전환 시뮬) → 이벤트 도착 → 같은 세션으로
 *       remount → thread에 반영돼 있다(디스크가 아니라 라이브 매니저에서 옴).
 *   (2) 멀티세션 전환 시 교차오염 0: 세션 A 슬롯0 진행 중 → 세션 B(다른 id) 슬롯0으로
 *       전환 → B는 A의 텍스트를 보지 않는다.
 *   (3) 고스트 정리: deleteMultiSession(id) → 진행 중이던 슬롯은 agentAbort 호출 +
 *       이후 도착 이벤트는 무시된다(라우팅 정리 확인, 크래시 없음).
 *   (4) AUTO idle-close → resume 연속(비가시 패널의 idle-close 판본, P02 재검증 🟡):
 *       done으로 idle이 된 뒤(sessionId 저장) 화면을 벗어났다 돌아와도 sessionId가
 *       보존돼 다음 send가 resumeSessionId로 주입한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import {
  __resetPanelSessionManagerForTests,
  __getPanelManagerSizesForTests,
  makePanelSlotKey,
} from '../../../02.Source/renderer/src/store/panelSession'
import type { AgentEventPayload, PersistedMultiState } from '../../../02.Source/shared/ipc-contract'

// ── window.api mock ───────────────────────────────────────────────────────────

let runIdCounter = 0
let capturedHandler: ((payload: AgentEventPayload) => void) | null = null

let _disk: PersistedMultiState | null = null

const mockApi = {
  agentRun: vi.fn().mockImplementation(() => {
    const runId = `run-${runIdCounter}`
    runIdCounter++
    return Promise.resolve({ runId })
  }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  agentInterrupt: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockImplementation((cb: (payload: AgentEventPayload) => void) => {
    capturedHandler = cb
    return () => {
      capturedHandler = null
    }
  }),
  multiSessionLoad: vi.fn().mockImplementation(async () => ({ state: _disk })),
  multiSessionSave: vi.fn().mockImplementation(async (state: PersistedMultiState) => {
    _disk = state
    return { ok: true }
  }),
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

beforeEach(() => {
  vi.clearAllMocks()
  runIdCounter = 0
  capturedHandler = null
  _disk = null
  __resetPanelSessionManagerForTests()
  mockApi.agentRun.mockImplementation(() => {
    const runId = `run-${runIdCounter}`
    runIdCounter++
    return Promise.resolve({ runId })
  })
  mockApi.onAgentEvent.mockImplementation((cb: (payload: AgentEventPayload) => void) => {
    capturedHandler = cb
    return () => {
      capturedHandler = null
    }
  })
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ workspaceMode: 'single', workspaceRoot: null, activeMultiSessionId: '' })
  __resetPanelSessionManagerForTests()
})

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

async function renderMultiWorkspace(sessionId: string): Promise<{ container: Element; unmount: () => void }> {
  useAppStore.setState({ workspaceRoot: '/test/workspace', workspaceMode: 'multi', activeMultiSessionId: sessionId })
  const { MultiWorkspace } = await import('../../../02.Source/renderer/src/components/00_shell/MultiWorkspace')
  let container!: Element
  let unmount!: () => void
  await act(async () => {
    const result = render(<MultiWorkspace />)
    container = result.container
    unmount = result.unmount
  })
  return { container, unmount }
}

/** 패널 0의 textarea에 텍스트를 입력하고 Enter로 전송한다(기존 멀티패널 테스트와 동일 관례). */
async function sendFromPanel0(container: Element, text: string): Promise<void> {
  const textarea = container.querySelector('textarea')
  if (!textarea) throw new Error('panel textarea not found')
  await act(async () => {
    fireEvent.change(textarea, { target: { value: text } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
  })
}

function panel0Text(container: Element): string {
  const thread = container.querySelector('.ma-p-thread')
  return thread?.textContent ?? ''
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('Phase 07 (1) — 스트림 증발 재현·수리: 언마운트 중 도착한 이벤트가 재마운트 후에도 보인다', () => {
  it('패널0 전송 중 unmount(모드 전환 시뮬) → 이벤트 도착 → 같은 세션 remount → thread에 반영됨', async () => {
    const SID = 'sess-evap'
    const first = await renderMultiWorkspace(SID)

    await sendFromPanel0(first.container, '1부터 세줘')
    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)

    // unmount — 모드 전환(single로) 또는 다른 멀티세션 전환을 시뮬레이션.
    // MultiWorkspace는 key={activeMultiSessionId}로 재마운트되므로, 화면을 벗어나면
    // 실제로 컴포넌트가 언마운트된다(Phase 07 이전엔 이때 상태·구독이 함께 죽었다).
    act(() => {
      first.unmount()
    })

    // 언마운트 상태에서 이벤트 도착(main은 fire-and-forget push — 받는 쪽이 없어도 계속 보낸다).
    expect(capturedHandler).toBeTruthy()
    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'text', delta: '1, 2, 3' } })
    })
    // done까지 도착 — isRunning=false 전이 후에는 MarkdownView(비-스트리밍, 동기 렌더)로
    // 표시된다. streaming 중(SmoothMarkdown)은 RAF 기반 reveal이라 jsdom에서 텍스트가
    // 비동기로 드러나므로, 이 테스트는 "이어짐" 자체(=매니저가 라이브 상태를 보존)를
    // 완료된 턴의 최종 텍스트로 확정 검증한다.
    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'done' } })
    })

    // 같은 세션으로 복귀(remount) — Phase 07 수리 전: 빈 thread(디스크 base, 스트리밍 미저장).
    // 수리 후: 매니저에 살아있던 라이브 진행이 그대로 보인다(seamless).
    const second = await renderMultiWorkspace(SID)
    expect(panel0Text(second.container)).toContain('1, 2, 3')

    act(() => {
      second.unmount()
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('Phase 07 (2) — 멀티세션 전환 시 교차오염 0: 세션이 다르면 슬롯 상태가 격리된다', () => {
  it('세션A 슬롯0 진행 중 텍스트가 세션B 슬롯0에 새지 않는다', async () => {
    const SID_A = 'sess-cross-a'
    const SID_B = 'sess-cross-b'

    // BF3 Phase 05 수리(useMultiPersist.ts): 자기 세션(activeMultiSessionId)이 디스크에
    // 없으면 폴백 없이 빈 상태로 시작하도록 고쳐, B가 A의 디스크 스냅샷을 잘못 상속하는
    // 레이스(01.Phases/BF3-backlog-sweep/05-multipersist-restore-race.md)가 사라졌다 —
    // 예전에는 이 잡음을 피하려 A·B를 디스크에 미리 등록해뒀지만, 이제 A·B 둘 다 디스크에
    // 전혀 없는 진짜 "최초 세션"으로 시작해도(_disk=null, beforeEach 기본값) 매니저 키
    // 격리 자체만으로 안전하게 통과한다(우회 제거 — BF3 Phase 05).
    const a = await renderMultiWorkspace(SID_A)
    await sendFromPanel0(a.container, 'A 전용 질문')

    act(() => {
      a.unmount()
    })

    // A의 run에 텍스트 도착(A가 화면에 없어도 계속 진행) + done(스트리밍 종료 — MarkdownView로
    // 동기 렌더 전환, SmoothMarkdown의 RAF reveal에 의존하지 않고 최종 텍스트를 확정 검증).
    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'text', delta: 'A 전용 응답' } })
    })
    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'done' } })
    })

    // 세션 B로 전환 — 다른 (세션,슬롯) 키이므로 A의 진행이 보이면 안 된다.
    const b = await renderMultiWorkspace(SID_B)
    expect(panel0Text(b.container)).not.toContain('A 전용 응답')
    expect(panel0Text(b.container)).not.toContain('A 전용 질문')

    act(() => {
      b.unmount()
    })

    // A로 복귀 — A 자신의 진행은 그대로 보존돼 있어야 한다.
    const a2 = await renderMultiWorkspace(SID_A)
    expect(panel0Text(a2.container)).toContain('A 전용 응답')

    act(() => {
      a2.unmount()
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('Phase 07 (3) — 고스트 run 정리: 멀티세션 영구 삭제 시 진행 중 슬롯을 abort·정리한다', () => {
  it('deleteMultiSession(id) → 진행 중이던 패널의 runId로 agentAbort 호출 + 이후 이벤트는 무시된다', async () => {
    const SID = 'sess-delete-me'
    _disk = {
      version: 2,
      activeSessionId: SID,
      sessions: [
        { id: SID, title: '삭제될 세션', count: 2, panels: [] },
        { id: 'sess-keep', title: '남는 세션', count: 2, panels: [] },
      ],
    }

    const view = await renderMultiWorkspace(SID)
    await sendFromPanel0(view.container, '오래 걸리는 작업')
    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)

    act(() => {
      view.unmount()
    })

    // 세션 영구 삭제 — appStore.deleteMultiSession(id) (multiSession.ts, Phase 07 배선).
    await act(async () => {
      await useAppStore.getState().deleteMultiSession(SID)
    })

    // 진행 중이던 run이 abort됐어야 한다(고스트 방지 — 아무도 안 듣는 run이 main에서
    // 계속 도는 것을 막는다).
    expect(mockApi.agentAbort).toHaveBeenCalledWith({ runId: 'run-0' })

    // 삭제 후 도착하는 늦은 이벤트는 라우팅 테이블에서 지워졌으므로 조용히 무시된다
    // (크래시 없음 — 어디에도 매칭 안 되는 run 드롭 경로).
    expect(() => {
      act(() => {
        capturedHandler!({ runId: 'run-0', event: { type: 'text', delta: '너무 늦은 응답' } })
      })
    }).not.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('Phase 07 (4) — AUTO idle-close → resume 연속 (비가시 패널 판본, P02 재검증 🟡)', () => {
  it('done으로 idle이 된 뒤 화면을 벗어났다 돌아와도 sessionId가 보존돼 다음 send가 resumeSessionId로 주입한다', async () => {
    const SID = 'sess-idle-resume'
    const first = await renderMultiWorkspace(SID)

    await sendFromPanel0(first.container, '첫 턴')
    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)

    // session 이벤트로 sessionId 저장(맥락 복구, Phase 1) + done으로 AUTO idle-close
    // (P02: 턴 경계에 예약 활동이 없으면 세션이 닫히고, 다음 턴은 resume — main 쪽 거동은
    // renderer가 resumeSessionId를 정확히 주입하는 한 투명하다).
    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'session', sessionId: 'sess-engine-abc' } })
    })
    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'done' } })
    })

    // 화면 이탈(비가시 패널) — 모드 전환·멀티세션 전환 시뮬레이션.
    act(() => {
      first.unmount()
    })

    // 복귀 — Phase 07 이전엔 상태가 새로 생성돼 sessionId가 유실됐다(단발 재개 불가).
    const second = await renderMultiWorkspace(SID)

    mockApi.agentRun.mockClear()
    await sendFromPanel0(second.container, '두 번째 턴(재개)')

    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)
    const sentReq = mockApi.agentRun.mock.calls[0][0] as { resumeSessionId?: string }
    expect(sentReq.resumeSessionId).toBe('sess-engine-abc')

    act(() => {
      second.unmount()
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('Phase 07 — makePanelSlotKey 유틸(키 스킴 계약)', () => {
  it('makePanelSlotKey(sessionId, slot)는 세션과 슬롯이 다르면 다른 키를 낸다', () => {
    expect(makePanelSlotKey('s1', 0)).not.toBe(makePanelSlotKey('s1', 1))
    expect(makePanelSlotKey('s1', 0)).not.toBe(makePanelSlotKey('s2', 0))
    expect(makePanelSlotKey('s1', 0)).toBe(makePanelSlotKey('s1', 0))
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 07 (5) — 매니저 누수 봉합(reviewer 🟡 2건): 라우팅 무한 증가 차단 + CAP 실효.
describe('Phase 07 (5) — 매니저 누수 회귀 가드(reviewer 🟡)', () => {
  it('같은 슬롯 재전송 시 직전 runId 라우팅이 교체-정리된다(무한 증가 차단)', async () => {
    const SID = 'sess-leak'
    const view = await renderMultiWorkspace(SID)

    await sendFromPanel0(view.container, '첫 턴') // run-0
    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'done' } })
    })
    await sendFromPanel0(view.container, '둘째 턴') // run-1 — SET_RUN_ID 교체

    // 구코드: run-0·run-1 둘 다 잔존(2). 수리: 직전 매핑 교체-정리(1).
    expect(__getPanelManagerSizesForTests().runIds).toBe(1)

    act(() => view.unmount())
  })

  it('CAP 축출이 완료 슬롯을 회수한다(실행 중·마운트 중만 보존) + dangling 라우팅 0', async () => {
    // 33세션 × 슬롯0 send→done(완료) — "한 번이라도 실행한" 슬롯 33개로 CAP=32 초과 유발.
    // 구코드: currentRunId!==null(완료 포함) 전부 보존 → 33+ 잔존(CAP 무력 — reviewer 🟡).
    // 수리: 실행 중(isRunning)·마운트 중만 보존 → 언마운트된 완료 슬롯 회수 → ≤32.
    for (let s = 0; s < 33; s++) {
      const view = await renderMultiWorkspace(`sess-cap-${s}`)
      const before = runIdCounter
      await sendFromPanel0(view.container, `msg-${s}`)
      act(() => {
        capturedHandler!({ runId: `run-${before}`, event: { type: 'done' } })
      })
      act(() => view.unmount())
    }
    const sizes = __getPanelManagerSizesForTests()
    expect(sizes.states).toBeLessThanOrEqual(32)
    // 라우팅 테이블도 상태와 함께 회수(축출 슬롯의 dangling 매핑 0 — 좀비 재생 차단)
    expect(sizes.runIds).toBeLessThanOrEqual(sizes.states)
  })
})
