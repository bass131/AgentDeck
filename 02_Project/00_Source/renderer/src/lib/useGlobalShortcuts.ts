import { useEffect } from 'react'

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
        if (isAnyModalOpen()) return
        e.preventDefault()
        opts.onModeSwitch?.()
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
