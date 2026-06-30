/**
 * App.tsx — 앱 루트. AppGate(P2 부트 게이트)를 렌더.
 *
 * P2 변경: Shell 직접 렌더 → AppGate 래핑.
 *   AppGate가 getProfile IPC 부트 → (null) 온보딩 → Shell / (있음) Shell 직접 진입.
 *   기존 Shell 마운트 회귀 없음 — AppGate는 Shell 위 래퍼.
 */
import { type JSX } from 'react'
import AppGate from './AppGate'

export default function App(): JSX.Element {
  return <AppGate />
}
