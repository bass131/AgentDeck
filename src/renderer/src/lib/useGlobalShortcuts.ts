/**
 * useGlobalShortcuts.ts — 전역 키보드 단축키 훅 (F14-03, renderer 부분).
 *
 * document keydown 훅: Ctrl/⌘+N(새 채팅) · O(폴더) · F(검색) · 백쿼트(사이드바 토글) ·
 * Shift+Tab(모드 순환) · ↑↓(히스토리) · Esc(중지 콜백).
 *
 * 핵심 제약(plan-auditor 반영):
 * 1. **입력 필드 포커스 시 텍스트 단축키 무시** (textarea/input/contenteditable).
 * 2. **모달 오픈 시 Esc는 모달 우선** — 전역 Esc 무조건 preventDefault 금지.
 *    각 모달이 자체 keydown에서 Esc를 처리하므로 여기서 preventDefault하면 안 됨.
 *    onEscape는 콜백만 호출, preventDefault 호출 없음.
 * 3. **처리한 키만 preventDefault** — Esc는 제외.
 * 4. **콜백 미주입 시 no-op** (동작=M4).
 * 5. window.api 0.
 */
import { useEffect } from 'react'

export interface GlobalShortcutOptions {
  /** 백쿼트(`) — 사이드바 접기/펼치기 토글 */
  toggleSidebar?: () => void
  /** Esc — 중지 콜백(모달 우선, preventDefault 금지) */
  onEscape?: () => void
  /** Ctrl/⌘+N — 새 채팅(no-op, M4) */
  onNewChat?: () => void
  /** Ctrl/⌘+O — 폴더 열기(no-op, M4) */
  onOpenFolder?: () => void
  /** Ctrl/⌘+F — 검색(no-op, M4) */
  onSearch?: () => void
  /** Shift+Tab — 모드 순환(no-op, M4) */
  onModeSwitch?: () => void
}

/** 입력 포커스 여부 — textarea/input/contenteditable */
function isInputFocused(): boolean {
  const ae = document.activeElement as HTMLElement | null
  if (!ae) return false
  return ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable
}

/**
 * 전역 단축키 훅 — Shell에서 호출. 콜백은 모두 optional(미전달 시 no-op).
 *
 * Esc 모달 우선 보장: 이 훅에서 Esc의 preventDefault를 절대 호출하지 않음.
 * AskModal/PermissionModal/QuestionModal/GitModal/ImageViewer 등이 자체 keydown
 * 핸들러에서 Esc를 처리(stopPropagation 없이 addEventListener). 전파 순서상 모달
 * 핸들러와 이 훅이 동시에 실행되지만, preventDefault 없으면 브라우저 기본 동작만
 * 유지되므로 회귀 없음.
 */
export function useGlobalShortcuts(opts: GlobalShortcutOptions): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const isCtrl = e.ctrlKey || e.metaKey

      // ── Esc: 모달 우선 — preventDefault 금지 ──────────────────────────────
      if (e.key === 'Escape') {
        // 콜백만 호출. preventDefault 절대 금지(모달 체인 Esc 회귀 보장).
        opts.onEscape?.()
        return
      }

      // ── 백쿼트: 사이드바 토글 ─────────────────────────────────────────────
      // 입력 포커스 시 무시
      if (e.key === '`' && !isCtrl) {
        if (isInputFocused()) return
        e.preventDefault()
        opts.toggleSidebar?.()
        return
      }

      // ── Ctrl/⌘ 단축키 ────────────────────────────────────────────────────
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
        }
        return
      }

      // ── Shift+Tab: 모드 순환 ──────────────────────────────────────────────
      if (e.key === 'Tab' && e.shiftKey) {
        if (isInputFocused()) return
        e.preventDefault()
        opts.onModeSwitch?.()
        return
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [
    opts.toggleSidebar,
    opts.onEscape,
    opts.onNewChat,
    opts.onOpenFolder,
    opts.onSearch,
    opts.onModeSwitch,
  ])
}
