import { useEffect } from 'react'
import type { WorkspaceMode } from './windowMode'

export const MODAL_SELECTORS =
  '.modal-overlay, .q-overlay, .perm-card, .ask-overlay, .pf-overlay, .iv-overlay, .gitm-overlay,' +
  ' .fv-overlay, .set-dialog-overlay, .sa-overlay, .pr-overlay,' +
  ' .ask-mini, .q-mini-pill, .sel-bar'

export function isAnyModalOpen(): boolean {
  return document.querySelector(MODAL_SELECTORS) !== null
}

export interface GlobalShortcutOptions {
  toggleSidebar?: () => void
  onEscape?: () => void
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
        opts.onEscape?.()
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
        if (isAnyModalOpen() || !opts.onModeSwitch) return
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
