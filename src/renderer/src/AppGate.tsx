/**
 * AppGate.tsx — 부트 진입 게이트 (P2).
 *
 * 원본 AgentCodeGUI App.tsx 1143~1191 3단계 흐름 실배선:
 *   boot → (profile null) → 온보딩 → MainApp(Shell)
 *   boot → (profile 있음) → MainApp(Shell) 바로 진입
 *
 * 동작:
 *   1. 마운트 시 window.api.getProfile() IPC 호출.
 *   2. null 반환 → Profile 온보딩 표시.
 *   3. profile 있음 반환 → Shell 바로 표시.
 *   4. 온보딩 제출(닉네임/색) → window.api.setProfile() IPC + store 갱신 → Shell.
 *   5. 로드 중 → 부트 스플래시(절제된 우리 스타일).
 *
 * CRITICAL: renderer untrusted — window.api.getProfile/setProfile(IPC)만 호출.
 * 인라인 색상 0 (avatarColor는 Profile 컴포넌트 내 예외 — 기존 관례).
 * store 단방향: IPC → applyProfile() → state → 컴포넌트.
 */

import { useState, useEffect, type JSX } from 'react'
import { Profile } from './components/Profile'
import type { UserProfile } from './components/Profile'
import type { Profile as IpcProfile } from '../../shared/ipc-contract'
import Shell from './layout/Shell'
import { useAppStore } from './store/appStore'
import './AppGate.css'

/** 부트 로드 단계 */
type BootPhase = 'loading' | 'onboarding' | 'main'

/**
 * AppGate — 3단계 진입 게이트.
 *
 * 단방향 데이터 흐름:
 *   getProfile IPC → phase 상태 → 컴포넌트 렌더.
 *   제출 → setProfile IPC → applyProfile(store) → phase 전환 → Shell.
 */
export function AppGate(): JSX.Element {
  const [phase, setPhase] = useState<BootPhase>('loading')
  const [initial, setInitial] = useState<UserProfile | null>(null)

  // 부트: getProfile IPC 호출 → phase 결정
  useEffect(() => {
    // CRITICAL: renderer untrusted — window.api.getProfile(화이트리스트)만 호출
    window.api.getProfile()
      .then((profile) => {
        if (profile) {
          // 프로필 있음 → store 갱신 후 Shell 진입
          useAppStore.getState().applyProfile(profile)
          setInitial({ nickname: profile.nickname, color: profile.color })
          setPhase('main')
        } else {
          // 첫 실행 → 온보딩
          setPhase('onboarding')
        }
      })
      .catch(() => {
        // IPC 실패 시 graceful: 온보딩으로 진입 (프로필 없이 앱 동작 보장)
        setPhase('onboarding')
      })
  }, [])

  // 온보딩 제출: setProfile IPC + store 갱신 + Shell 전환
  const handleEnter = (userProfile: UserProfile): void => {
    const ipcProfile: IpcProfile = {
      nickname: userProfile.nickname,
      color: userProfile.color,
    }

    // CRITICAL: renderer untrusted — window.api.setProfile(화이트리스트)만 호출
    window.api.setProfile(ipcProfile)
      .then(() => {
        // store 동기화 (단방향: IPC 성공 → applyProfile → state → 컴포넌트)
        useAppStore.getState().applyProfile(ipcProfile)
      })
      .catch(() => {
        // IPC 실패도 store는 업데이트 (로컬 세션 유효 — 재시작 시 재입력)
        useAppStore.getState().applyProfile(ipcProfile)
      })
      .finally(() => {
        // Shell 전환 (성공/실패 무관 — graceful)
        setPhase('main')
      })
  }

  // 부트 스플래시 (절제된 우리 스타일 — 네온/글로우/슬롭 금지)
  if (phase === 'loading') {
    return (
      <div className="boot-splash">
        <div className="boot-brand">AgentDeck</div>
      </div>
    )
  }

  // 온보딩 게이트 (첫 실행 또는 IPC 실패 fallback)
  if (phase === 'onboarding') {
    return (
      <div className="boot-onboarding">
        <Profile initial={initial} onEnter={handleEnter} />
      </div>
    )
  }

  // MainApp (Shell) — profile 있음 또는 온보딩 완료
  return <Shell />
}

export default AppGate
