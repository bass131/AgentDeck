import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyTheme } from './lib/theme'
import './theme/tokens.css'

// 첫 페인트 전 테마 적용 — 저장된 선택(또는 기본 dark)으로 <html> data-theme 설정.
applyTheme()

const container = document.getElementById('root')
if (!container) throw new Error('#root 엘리먼트를 찾을 수 없습니다.')

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
