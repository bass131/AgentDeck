import { describe, it, expect, vi } from 'vitest'
import { decideStopAction } from '../../../02_Source/renderer/src/lib/stopAction'
import type { LoopInfo } from '../../../02_Source/shared/agentEvents'
import type { GoalPendingLike } from '../../../02_Source/renderer/src/lib/loopStatus'

function mkLoop(id = 'wakeup'): LoopInfo {
  return { id, summary: '주기 작업' }
}

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
