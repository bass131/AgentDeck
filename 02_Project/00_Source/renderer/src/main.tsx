import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyTheme } from '@renderer/02_Common/theme'
import { loadPrefs, getPref } from '@renderer/11_Settings/prefs'
import { useAppStore } from '@renderer/00_App/appStore'
import { setReplModeDefault } from '@renderer/05_Conversation/replModeDefault'
import { restoreSavedWorkspace } from '@renderer/12_Window/restoreWorkspace'
import '@renderer/02_Common/tokens.css'

applyTheme()

const container = document.getElementById('root')
if (!container) throw new Error('#root 엘리먼트를 찾을 수 없습니다.')

const root = createRoot(container)

Promise.all([
  loadPrefs(),
  window.api.getProfile().catch(() => null),
])
  .then(([, profile]) => {
    setReplModeDefault(getPref<boolean>('replMode', true))

    // 화면 배치 복원과 배치별 시작 동작(마지막 대화 복원)은 12_Window가 맡는다(G9c).
    restoreSavedWorkspace()

    if (profile) {
      useAppStore.getState().applyProfile(profile)
    }
  })
  .catch(() => {
  })
  .finally(() => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  })
