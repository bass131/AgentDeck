import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyTheme } from '@renderer/02_Common/theme'
import { loadPrefs, getPref } from '@renderer/11_Settings/prefs'
import { useAppStore } from '@renderer/00_App/appStore'
import { setReplModeDefault } from '@renderer/05_Conversation/replModeDefault'
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
    const savedMode = getPref<'single' | 'multi'>('workspace.mode', 'single')
    useAppStore.getState().setWorkspaceMode(savedMode)

    setReplModeDefault(getPref<boolean>('replMode', true))

    if (savedMode === 'single') {
      void useAppStore.getState().restoreLastActiveConversation()
    }

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
