/**
 * useGlobalShortcuts.ts — 전역 키보드 단축키 훅 (F14-03 / P6 배선).
 *
 * document keydown 훅: Ctrl/⌘+N(새 채팅) · O(폴더) · F(검색) · 백쿼트(사이드바 토글) ·
 * Shift+Tab(모드 순환) · ↑↓(히스토리) · Esc(중지 콜백).
 *
 * 핵심 제약(plan-auditor 반영):
 * 1. **입력 필드 포커스 시 텍스트 단축키 무시** (textarea/input/contenteditable).
 *    예외: Shift+Tab(모드 순환)은 입력 포커스 여부 무관하게 동작(원본 동작).
 *    Composer 작성 중 모드를 바꿀 수 있어야 하므로 isInputFocused 가드 없음.
 * 2. **모달 오픈 시 Esc는 모달 우선** — 전역 Esc 무조건 preventDefault 금지.
 *    각 모달이 자체 keydown에서 Esc를 처리하므로 여기서 preventDefault하면 안 됨.
 *    onEscape는 콜백만 호출, preventDefault 호출 없음.
 * 3. **Shift+Tab 모달 가드** — 모달 열림 시 Shift+Tab 미가로채기(모달 포커스 이동 양보).
 * 4. **처리한 키만 preventDefault** — Esc는 제외.
 * 5. **콜백 미주입 시 no-op** (동작=M4).
 * 6. window.api 0.
 *
 * P6 추가: isAnyModalOpen — DOM 오버레이 클래스 감지 유틸(Shell onEscape 가드용).
 * 새 오버레이 추가 시 아래 MODAL_SELECTORS 상수만 갱신(테스트 afterEach도 동기화).
 */
import { useEffect } from 'react'

/**
 * Esc를 소비하거나 Esc로 닫히는 모달/오버레이의 루트 클래스 목록.
 *
 * 규칙: "열렸을 때만 DOM에 존재하는 오버레이 루트 클래스"여야 함.
 * open=false 시 null 반환하거나 조건부 렌더로 DOM에서 제거되는 컴포넌트만 포함.
 *
 * 매핑 (클래스 = 컴포넌트):
 * - modal-overlay:     Modal.tsx — SettingsModal 등 공통 크롬 (open=false → null)
 * - q-overlay:         PermissionModal.tsx, QuestionModal.tsx (open=false → null / minimized=false 조건)
 * - ask-overlay:       AskModal.tsx 풀 모달 (minimized=true면 ask-mini로 교체됨)
 * - pf-overlay:        Shell.tsx Profile 온보딩 (profileOpen && 조건부 렌더)
 * - iv-overlay:        ImageViewer.tsx (imageViewer!=null 조건부 렌더)
 * - gitm-overlay:      GitModal.tsx 독립 크롬 (open=false → null)
 * - fv-overlay:        FileModal.tsx — openedFile 시 활성, 가장 빈번 (openedFile=null → null)
 * - set-dialog-overlay: WhatsNew.tsx(wn-overlay), UpdateNotes.tsx(un-overlay),
 *                       AppUpdateGate.tsx — P4 부트 자동 트리거 (open=false → null)
 * - sa-overlay:        SubAgentModal.tsx (agent=null → null)
 * - pr-overlay:        PromptModal.tsx — Sidebar/MultiWorkspace (promptSlot/promptSession 조건부)
 * - ask-mini:          AskModal.tsx 최소화 알약 — Esc 소비(닫기 or 최소화해제)
 * - q-mini-pill:       QuestionModal.tsx 최소화 알약 (minimized=true 시 렌더)
 * - sel-bar:           SelectionToolbar.tsx (pos!=null 시 렌더, Esc → 닫힘)
 */
export const MODAL_SELECTORS =
  '.modal-overlay, .q-overlay, .ask-overlay, .pf-overlay, .iv-overlay, .gitm-overlay,' +
  ' .fv-overlay, .set-dialog-overlay, .sa-overlay, .pr-overlay,' +
  ' .ask-mini, .q-mini-pill, .sel-bar'

/**
 * 현재 DOM에 모달/오버레이가 열려 있는지 감지.
 *
 * Shell.tsx의 onEscape 핸들러가 이 함수로 "모달이 열린 상태"를 판단해
 * abortRun을 스킵한다. 모달 자체 Esc 핸들러가 먼저 닫히도록 우선권을 보장.
 *
 * CRITICAL: renderer 전용 DOM 조회 — fs/Node/window.api 호출 0.
 */
export function isAnyModalOpen(): boolean {
  return document.querySelector(MODAL_SELECTORS) !== null
}

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
      // 입력 포커스 여부 무관하게 동작(원본 동작: Composer 작성 중 모드 순환).
      // 단, 모달 열림 시에는 Shift+Tab을 모달 포커스 이동에 양보(미가로채기).
      if (e.key === 'Tab' && e.shiftKey) {
        if (isAnyModalOpen()) return
        e.preventDefault()
        opts.onModeSwitch?.()
        return
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // opts 객체 자체는 매 렌더 새 참조지만 개별 콜백을 deps에 포함. opts 전체 추가 시 무한 재구독.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    opts.toggleSidebar,
    opts.onEscape,
    opts.onNewChat,
    opts.onOpenFolder,
    opts.onSearch,
    opts.onModeSwitch,
  ])
}
