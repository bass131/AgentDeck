/**
 * cp1-p06-esc-interrupt-wiring.test.ts — CP1 Phase 06 ①: Shell.tsx onEscape의
 * decideStopAction 경유 배선 잠금 테스트.
 *
 * 배경(01.Phases/CP1-cwd-persist-sweep/06-backlog-sweep-renderer.md ①):
 * Shell.tsx의 onEscape는 기존에 `isRunning`일 때 항상 `abortRun()`을 호출했다
 * (global-shortcuts-p6.test.tsx의 makeOnEscape가 그 옛 계약을 그대로 고정한다).
 * 하지만 정지 "버튼"(Conversation.tsx/PanelView.tsx handleAbort)은 이미
 * decideStopAction(lib/stopAction.ts)으로 replMode/activeLoops/pendingCommand를 보고
 * interrupt/abort를 판정한다(FB2 P02) — 같은 "정지" 의도의 두 진입점(Esc·버튼)이
 * 다른 판정을 타면 거동이 갈린다. 이 Phase는 Esc도 같은 판정 함수를 타도록 통일한다.
 *
 * ⚠️ 거동 변화(영호 육안 확인 항목): repl 일반 턴(activeLoops 없음·goal 아님)에서
 * Esc가 이제 abort 대신 interrupt를 호출한다. NG면 Shell.tsx의 이 onEscape 블록만
 * 원복하면 되는 국소 변경(키바인딩 1점).
 *
 * 이 테스트는 Shell.tsx가 실제로 주입하는 onEscape 콜백과 동일한 로직을
 * 격리 재현해 검증한다(global-shortcuts-p6.test.tsx의 Shell onEscape 격리 테스트 관례를
 * decideStopAction 배선까지 확장).
 */
import { describe, it, expect, vi } from 'vitest'
import { decideStopAction } from '../../../02.Source/renderer/src/lib/stopAction'
import type { LoopInfo } from '../../../02.Source/shared/agent-events'
import type { GoalPendingLike } from '../../../02.Source/renderer/src/lib/loopStatus'

function mkLoop(id = 'wakeup'): LoopInfo {
  return { id, summary: '주기 작업' }
}

/**
 * Shell.tsx onEscape와 동일한 로직 — isRunning일 때 decideStopAction으로
 * interrupt/abort를 판정해 각각의 액션을 호출한다(모달/워크스페이스 가드는
 * global-shortcuts-p6.test.tsx가 이미 커버 — 여기서는 액션 판정 배선만 검증).
 */
function makeOnEscape(
  isRunning: boolean,
  replMode: boolean,
  activeLoops: LoopInfo[],
  pendingCommand: GoalPendingLike | null | undefined,
  interruptRun: () => Promise<void>,
  abortRun: () => Promise<void>
): () => void {
  return () => {
    if (!isRunning) return
    const action = decideStopAction(replMode, activeLoops, pendingCommand)
    if (action === 'interrupt') void interruptRun()
    else void abortRun()
  }
}

describe('CP1 P06 ① — Shell onEscape가 decideStopAction을 경유', () => {
  it('거동 변화: repl 일반 턴(activeLoops 없음·goal 아님) → interruptRun 호출(abortRun 미호출)', () => {
    const interruptRun = vi.fn().mockResolvedValue(undefined)
    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeOnEscape(true, true, [], null, interruptRun, abortRun)
    onEscape()
    expect(interruptRun).toHaveBeenCalledOnce()
    expect(abortRun).not.toHaveBeenCalled()
  })

  it('replMode=false(비-REPL) → 기존 계약대로 abortRun 호출(BF1 P03 불변)', () => {
    const interruptRun = vi.fn().mockResolvedValue(undefined)
    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeOnEscape(true, false, [], null, interruptRun, abortRun)
    onEscape()
    expect(abortRun).toHaveBeenCalledOnce()
    expect(interruptRun).not.toHaveBeenCalled()
  })

  it('activeLoops 활성(SDK 크론) → replMode 무관 abortRun(정지 버튼과 동일 승격)', () => {
    const interruptRun = vi.fn().mockResolvedValue(undefined)
    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeOnEscape(true, true, [mkLoop()], null, interruptRun, abortRun)
    onEscape()
    expect(abortRun).toHaveBeenCalledOnce()
    expect(interruptRun).not.toHaveBeenCalled()
  })

  it("pendingCommand.name==='goal' → replMode 무관 abortRun(정지 버튼과 동일 승격)", () => {
    const interruptRun = vi.fn().mockResolvedValue(undefined)
    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeOnEscape(true, true, [], { name: 'goal' }, interruptRun, abortRun)
    onEscape()
    expect(abortRun).toHaveBeenCalledOnce()
    expect(interruptRun).not.toHaveBeenCalled()
  })

  it('isRunning=false → 둘 다 미호출(정지할 실행이 없음)', () => {
    const interruptRun = vi.fn().mockResolvedValue(undefined)
    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeOnEscape(false, true, [], null, interruptRun, abortRun)
    onEscape()
    expect(interruptRun).not.toHaveBeenCalled()
    expect(abortRun).not.toHaveBeenCalled()
  })
})

describe('CP1 렌더러 후속(reviewer 🟡 봉합) — Shell onEscape 단일 원자 스냅샷', () => {
  // Shell.tsx onEscape의 수정된 형태: replMode/activeLoops/pendingCommand/interruptRun/
  // abortRun을 전부 단일 getState() 호출 하나에서 뽑는다(이전엔 replMode만 렌더 클로저,
  // 나머지 둘은 getState()로 따로 읽는 혼합 스냅샷이었다). 이 재현은 "단일 스냅샷 객체"를
  // 유일한 데이터 소스로 강제해, 그 계약을 회귀 잠근다.
  interface Snapshot {
    replMode: boolean
    activeLoops: LoopInfo[]
    pendingCommand: GoalPendingLike | null
    interruptRun: () => Promise<void>
    abortRun: () => Promise<void>
  }

  function makeAtomicOnEscape(isRunning: boolean, getState: () => Snapshot): () => void {
    return () => {
      if (!isRunning) return
      const state = getState()
      const action = decideStopAction(state.replMode, state.activeLoops, state.pendingCommand)
      if (action === 'interrupt') void state.interruptRun()
      else void state.abortRun()
    }
  }

  it('replMode를 단일 스냅샷에서 읽는다 — 스냅샷이 false면 abort(다른 소스의 stale true는 무관)', () => {
    const interruptRun = vi.fn().mockResolvedValue(undefined)
    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeAtomicOnEscape(true, () => ({
      replMode: false,
      activeLoops: [],
      pendingCommand: null,
      interruptRun,
      abortRun,
    }))
    onEscape()
    expect(abortRun).toHaveBeenCalledOnce()
    expect(interruptRun).not.toHaveBeenCalled()
  })

  it('스냅샷이 replMode:true면 interrupt(단일 소스 일관성 확인)', () => {
    const interruptRun = vi.fn().mockResolvedValue(undefined)
    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeAtomicOnEscape(true, () => ({
      replMode: true,
      activeLoops: [],
      pendingCommand: null,
      interruptRun,
      abortRun,
    }))
    onEscape()
    expect(interruptRun).toHaveBeenCalledOnce()
    expect(abortRun).not.toHaveBeenCalled()
  })
})
