// 작업 ID: cp1-p06 · 옛 이름 cp1-p06-esc-interrupt-wiring.test.ts
// M11 G4(설계 감사 24) — 옛 시험은 Shell의 Esc 처리를 사본(makeOnEscape)으로 다시 만들어 모달·작업 모드 가드가 빠져 있었다.
// 이제 Shell이 부르는 그 함수(shellEscape)를 직접 부른다 — Shell에서 가드를 지우면 이 시험이 실패한다.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { pushModalLayer, shellEscape, type EscapeContext } from '@renderer/12_Window/useGlobalShortcuts'
import type { LoopInfo } from '../../../../02_Project/00_Source/shared/agentEvents'
import type { GoalPendingLike } from '@renderer/03_Agent/loopStatus'

function mkLoop(id = 'wakeup'): LoopInfo {
  return { id, summary: '주기 작업' }
}

function ctx(over: {
  isRunning?: boolean
  workspaceMode?: EscapeContext['workspaceMode']
  replMode?: boolean
  activeLoops?: LoopInfo[]
  pendingCommand?: GoalPendingLike | null
} = {}) {
  const interruptRun = vi.fn().mockResolvedValue(undefined)
  const abortRun = vi.fn().mockResolvedValue(undefined)
  const getState = vi.fn(() => ({
    replMode: over.replMode ?? true,
    activeLoops: over.activeLoops ?? [],
    pendingCommand: over.pendingCommand ?? null,
    interruptRun,
    abortRun,
  }))
  const c: EscapeContext = { isRunning: over.isRunning ?? true, workspaceMode: over.workspaceMode ?? 'single', getState }
  return { c, interruptRun, abortRun, getState }
}

let closeLayer: (() => void) | null = null
afterEach(() => { closeLayer?.(); closeLayer = null })

describe('CP1 P06 ① — Shell의 Esc가 decideStopAction을 경유 (M11 G4 24: 실제 처리 함수)', () => {
  it('[M11-G4 24] repl 일반 턴(activeLoops 없음·goal 아님) → interruptRun 호출(abortRun 미호출)', () => {
    const { c, interruptRun, abortRun } = ctx()
    shellEscape(undefined, c)
    expect(interruptRun).toHaveBeenCalledOnce()
    expect(abortRun).not.toHaveBeenCalled()
  })

  it('[M11-G4 24] replMode=false(비-REPL) → 기존 계약대로 abortRun 호출(BF1 P03 불변)', () => {
    const { c, interruptRun, abortRun } = ctx({ replMode: false })
    shellEscape(undefined, c)
    expect(abortRun).toHaveBeenCalledOnce()
    expect(interruptRun).not.toHaveBeenCalled()
  })

  it('[M11-G4 24] activeLoops 활성(SDK 크론) → replMode 무관 abortRun(정지 버튼과 동일 승격)', () => {
    const { c, interruptRun, abortRun } = ctx({ activeLoops: [mkLoop()] })
    shellEscape(undefined, c)
    expect(abortRun).toHaveBeenCalledOnce()
    expect(interruptRun).not.toHaveBeenCalled()
  })

  it("[M11-G4 24] pendingCommand.name==='goal' → replMode 무관 abortRun(정지 버튼과 동일 승격)", () => {
    const { c, interruptRun, abortRun } = ctx({ pendingCommand: { name: 'goal' } })
    shellEscape(undefined, c)
    expect(abortRun).toHaveBeenCalledOnce()
    expect(interruptRun).not.toHaveBeenCalled()
  })

  it('[M11-G4 24] isRunning=false → 둘 다 미호출(정지할 실행이 없음)', () => {
    const { c, interruptRun, abortRun } = ctx({ isRunning: false })
    shellEscape(undefined, c)
    expect(interruptRun).not.toHaveBeenCalled()
    expect(abortRun).not.toHaveBeenCalled()
  })

  it('[M11-G4 24] 모달이 열려 있으면 실행을 끊지 않는다', () => {
    const { c, interruptRun, abortRun, getState } = ctx()
    closeLayer = pushModalLayer()
    shellEscape(undefined, c)
    expect(interruptRun).not.toHaveBeenCalled()
    expect(abortRun).not.toHaveBeenCalled()
    expect(getState).not.toHaveBeenCalled()
  })

  it('[M11-G4 24] 곁 층(권한 카드·질문 알약)만 있어도 실행을 끊지 않는다', () => {
    const { c, interruptRun, abortRun } = ctx()
    closeLayer = pushModalLayer({ kind: 'aside' })
    shellEscape(undefined, c)
    expect(interruptRun).not.toHaveBeenCalled()
    expect(abortRun).not.toHaveBeenCalled()
  })

  it('[M11-G4 24] 작업 모드에서는 채팅 실행을 끊지 않는다', () => {
    const { c, interruptRun, abortRun } = ctx({ workspaceMode: 'work' })
    shellEscape(undefined, c)
    expect(interruptRun).not.toHaveBeenCalled()
    expect(abortRun).not.toHaveBeenCalled()
  })

  it('[M11-G4 24] 스냅숏에 대기 명령 칸이 없으면(앱 상태의 선택 칸) 일반 턴처럼 interruptRun', () => {
    const interruptRun = vi.fn().mockResolvedValue(undefined)
    const abortRun = vi.fn().mockResolvedValue(undefined)
    shellEscape(undefined, { isRunning: true, workspaceMode: 'single', getState: () => ({ replMode: true, activeLoops: [], interruptRun, abortRun }) })
    expect(interruptRun).toHaveBeenCalledOnce()
    expect(abortRun).not.toHaveBeenCalled()
  })

  it('[M11-G4 24] 실행 상태는 Esc 때 한 번 읽은 스냅숏에서 고른다', () => {
    const { c, getState } = ctx({ replMode: false })
    shellEscape(undefined, c)
    expect(getState).toHaveBeenCalledTimes(1)
  })
})
