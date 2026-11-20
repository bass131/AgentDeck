import { useEffect } from 'react'
import type { LoopInfo } from '@shared/agentEvents'
import { isAnyModalOpen } from '@renderer/02_Common/modalStack'
import { decideStopAction } from '@renderer/03_Agent/stopAction'
import type { GoalPendingLike } from '@renderer/03_Agent/loopStatus'
import type { WorkspaceMode } from './windowMode'

// 모달 판정은 열린 모달의 층이다(M11 G4 — 설계 감사 22). 옛 import 자리를 위해 다시 내보낸다
export { isAnyModalOpen, pushModalLayer } from '@renderer/02_Common/modalStack'

export interface EscapeContext {
  isRunning: boolean
  workspaceMode: WorkspaceMode
  getState: () => {
    replMode: boolean
    activeLoops: LoopInfo[]
    pendingCommand?: GoalPendingLike | null
    interruptRun: () => Promise<void>
    abortRun: () => Promise<void>
  }
}

// Shell의 Esc — 모달이 열려 있거나(그 키를 처음 본 때의 층) 작업 모드면 채팅 실행을 끊지 않는다. 실행 상태는 한 번 읽은 스냅숏에서 고른다
export function shellEscape(e: KeyboardEvent | undefined, c: EscapeContext): void {
  if (isAnyModalOpen(e)) return
  if (c.workspaceMode !== 'single') return
  if (!c.isRunning) return
  const state = c.getState()
  const action = decideStopAction(state.replMode, state.activeLoops, state.pendingCommand)
  if (action === 'interrupt') void state.interruptRun()
  else void state.abortRun()
}

export interface GlobalShortcutOptions {
  toggleSidebar?: () => void
  onEscape?: (e: KeyboardEvent) => void
  onNewChat?: () => void
  onOpenFolder?: () => void
  onSearch?: () => void
  onZoomIn?: () => void
  onModeSwitch?: () => void
}

// 전역 Shift+Tab의 모드 순환 대상(P5, 사용자 결정) — 단일 선택기는 「채팅」 모드의 화면에만 있다.
// 「작업」 모드(M10 G1)에서는 화면에 없는 단일 선택기를 돌리지 않는다.
export function globalModeSwitchFor(
  workspaceMode: WorkspaceMode,
  cycleSingle: () => void,
): (() => void) | undefined {
  return workspaceMode === 'single' ? cycleSingle : undefined
}

function isInputFocused(): boolean {
  const ae = document.activeElement as HTMLElement | null
  if (!ae) return false
  return ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable
}

export function useGlobalShortcuts(opts: GlobalShortcutOptions): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const isCtrl = e.ctrlKey || e.metaKey

      if (e.key === 'Escape') {
        opts.onEscape?.(e)
        return
      }

      if (e.key === '`' && !isCtrl) {
        if (isInputFocused()) return
        e.preventDefault()
        opts.toggleSidebar?.()
        return
      }

      if (isCtrl) {
        switch (e.key.toLowerCase()) {
          case 'n':
            if (isInputFocused()) return
            e.preventDefault()
            opts.onNewChat?.()
            return
          case 'o':
            if (isInputFocused()) return
            e.preventDefault()
            opts.onOpenFolder?.()
            return
          case 'f':
            if (isInputFocused()) return
            e.preventDefault()
            opts.onSearch?.()
            return
          case '=':
            if (e.shiftKey || e.isComposing) return
            e.preventDefault()
            opts.onZoomIn?.()
            return
        }
        return
      }

      if (e.key === 'Tab' && e.shiftKey) {
        // 바꿀 모드가 없는 화면(작업 모드)에서는 브라우저 기본 동작(역방향 포커스 이동)을 살린다(M10 G1 검수 사소 5)
        if (isAnyModalOpen(e) || !opts.onModeSwitch) return
        e.preventDefault()
        opts.onModeSwitch()
        return
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    opts.toggleSidebar,
    opts.onEscape,
    opts.onNewChat,
    opts.onOpenFolder,
    opts.onSearch,
    opts.onZoomIn,
    opts.onModeSwitch,
  ])
}
