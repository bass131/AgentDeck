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

// boot 시 UI prefs + profile 동시 로드 후 렌더 (P1+P2).
// 실패해도 graceful — getPref는 fallback 반환, profile은 AppGate가 별도 로드.
// CRITICAL: renderer untrusted — window.api.getUiPrefs/getProfile(IPC)만 호출.
// Promise.all: prefs와 profile 병렬 로드 → 첫 페인트 지연 최소화.
Promise.all([
  loadPrefs(),
  window.api.getProfile().catch(() => null), // profile 실패 시 null — AppGate가 처리
])
  .then(([, profile]) => {
    // prefs 로드 완료 후 영속 설정 복원 (렌더 전 — 첫 페인트부터 올바른 상태).
    // workspace.mode: 저장된 모드(또는 기본 'single')로 store 초기화.
    const savedMode = getPref<'single' | 'multi'>('workspace.mode', 'single')
    useAppStore.getState().setWorkspaceMode(savedMode)

    // LR3-03: replMode 복원 — 저장된 값(또는 기본 true, AUTO 세션 수명이 비용 상쇄)으로 store 초기화.
    // 가법 하위호환: 기존 prefs에 replMode 키가 없던 사용자도 getPref fallback으로 true.
    const savedReplMode = getPref<boolean>('replMode', true)
    useAppStore.getState().setReplMode(savedReplMode)

    // single 모드일 때만: 마지막 활성 단일챗 대화 자동 복원 (fire-and-forget).
    // await 하지 않음 — 첫 페인트 지연 방지. 대화는 resolve 후 채워짐.
    // multi 모드는 loadMultiSessions가 activeMultiSessionId를 복원하므로 건드리지 않음.
    // CRITICAL: IPC는 restoreLastActiveConversation 내부 window.api 경유 — renderer untrusted.
    if (savedMode === 'single') {
      void useAppStore.getState().restoreLastActiveConversation()
    }

    // P2: profile 미리 로드 → AppGate 마운트 시 IPC 중복 호출 방지 효과.
    // AppGate가 자체 getProfile()도 호출하나 미리 store에 넣어두면 반응이 빠름.
    // null이면 AppGate가 onboarding 표시 → 정상 흐름.
    if (profile) {
      useAppStore.getState().applyProfile(profile)
    }
  })
  .catch(() => {
    // IPC 실패도 무시 — prefs/profile 없이 앱 기동(fallback).
    // store는 기본값(single) 유지, profile=null → AppGate가 onboarding 표시.
  })
  .finally(() => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  })
