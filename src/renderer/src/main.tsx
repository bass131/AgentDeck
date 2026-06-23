import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyTheme } from './lib/theme'
import { loadPrefs, getPref } from './lib/prefs'
import { useAppStore } from './store/appStore'
import './theme/tokens.css'

// 첫 페인트 전 테마 적용 — 저장된 선택(또는 기본 dark)으로 <html> data-theme 설정.
applyTheme()

const container = document.getElementById('root')
if (!container) throw new Error('#root 엘리먼트를 찾을 수 없습니다.')

const root = createRoot(container)

// boot 시 UI prefs 1회 로드 후 렌더 (P1).
// loadPrefs 실패(IPC 미준비 등)해도 graceful — getPref는 fallback 반환.
// CRITICAL: renderer untrusted — loadPrefs는 window.api.getUiPrefs(IPC)만 호출.
loadPrefs()
  .then(() => {
    // prefs 로드 완료 후 영속 설정 복원 (렌더 전 — 첫 페인트부터 올바른 상태).
    // workspace.mode: 저장된 모드(또는 기본 'single')로 store 초기화.
    const savedMode = getPref<'single' | 'multi'>('workspace.mode', 'single')
    useAppStore.getState().setWorkspaceMode(savedMode)
  })
  .catch(() => {
    // IPC 실패도 무시 — prefs 없이 앱 기동(fallback). store는 기본값(single) 유지.
  })
  .finally(() => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  })
