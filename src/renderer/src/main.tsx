import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './theme/tokens.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root 엘리먼트를 찾을 수 없습니다.')

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
