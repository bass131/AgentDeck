/**
 * AppGate.tsx — 부트 진입 게이트 (P2 + P3).
 *
 * 원본 AgentCodeGUI App.tsx 1143~1191 3단계 흐름 실배선 + engine 체크(P3):
 *   boot → (profile null) → 온보딩 → MainApp(Shell)
 *   boot → (profile 있음) → engine 체크 → (authed) → Shell
 *                                         → (미authed) → EngineGate 안내
 *                                            → 재확인(authed) → Shell
 *                                            → 계속 진행 → Shell (우회)
 *
 * 동작:
 *   1. 마운트 시 window.api.getProfile() IPC 호출.
 *   2. null 반환 → Profile 온보딩 표시.
 *   3. profile 있음 반환 → window.api.getEngineState() 호출.
 *      3a. available=true + authed=true → Shell 진입.
 *      3b. available=false 또는 authed=false → EngineGate 안내 표시.
 *   4. EngineGate 재확인 → getEngineState 재호출 → authed 시 Shell, 아니면 유지.
 *   5. EngineGate 계속 진행 → Shell 진입 (graceful 우회).
 *   6. 온보딩 제출 → setProfile IPC + engine 체크 → Shell.
 *   7. 로드 중 → 부트 스플래시(절제된 우리 스타일).
 *
 * CRITICAL: renderer untrusted — window.api.*(IPC 화이트리스트)만 호출.
 * EngineState.authed = 불리언만 소비 — 토큰/키 값 미취급.
 * 인라인 색상 0 (avatarColor는 Profile 컴포넌트 내 예외 — 기존 관례).
 * store 단방향: IPC → applyProfile() → state → 컴포넌트.
 */

import { useState, useEffect, useCallback, type JSX } from 'react'
import { Profile } from './components/Profile'
import type { UserProfile } from './components/Profile'
import type { Profile as IpcProfile } from '../../shared/ipc-contract'
import Shell from './layout/Shell'
import { EngineGate } from './components/EngineGate'
import { useAppStore } from './store/appStore'
import './AppGate.css'

/** 부트 로드 단계 */
type BootPhase = 'loading' | 'onboarding' | 'engine-check' | 'engine-gate' | 'main'

/**
 * AppGate — 4단계 진입 게이트 (P2 + P3 engine 체크).
 *
 * 단방향 데이터 흐름:
 *   getProfile IPC → phase 상태 → 컴포넌트 렌더.
 *   getEngineState IPC → engine phase 분기 → EngineGate 또는 Shell.
 *   재확인 → getEngineState 재호출 → phase 갱신.
 *   계속 진행 → phase 'main' 강제 진입.
 */
export function AppGate(): JSX.Element {
  const [phase, setPhase] = useState<BootPhase>('loading')
  const [initial, setInitial] = useState<UserProfile | null>(null)
  const [engineVersion, setEngineVersion] = useState<string | null>(null)
  const [engineAvailable, setEngineAvailable] = useState<boolean>(true)

  // engine 체크 공통 로직 — profile 완료 후 호출
  const checkEngine = useCallback((): Promise<void> => {
    // CRITICAL: renderer untrusted — window.api.getEngineState(화이트리스트)만 호출
    // EngineState.authed = 불리언만 — 토큰/키 값 절대 미수령
    return window.api.getEngineState()
      .then((state) => {
        setEngineVersion(state.version)
        setEngineAvailable(state.available)
        if (state.available && state.authed) {
          setPhase('main')
        } else {
          setPhase('engine-gate')
        }
      })
      .catch(() => {
        // engine 체크 실패 시 graceful: Shell 진입 (앱 중단보다 진입 후 실패 허용)
        setPhase('main')
      })
  }, [])

  // 부트: getProfile IPC 호출 → phase 결정
  useEffect(() => {
    // CRITICAL: renderer untrusted — window.api.getProfile(화이트리스트)만 호출
    window.api.getProfile()
      .then((profile) => {
        if (profile) {
          // 프로필 있음 → store 갱신 후 engine 체크
          useAppStore.getState().applyProfile(profile)
          setInitial({ nickname: profile.nickname, color: profile.color })
          setPhase('engine-check')
        } else {
          // 첫 실행 → 온보딩 (engine 체크는 온보딩 완료 후)
          setPhase('onboarding')
        }
      })
      .catch(() => {
        // IPC 실패 시 graceful: 온보딩으로 진입 (프로필 없이 앱 동작 보장)
        setPhase('onboarding')
      })
  }, [])

  // engine-check 단계: engine 상태 조회
  useEffect(() => {
    if (phase !== 'engine-check') return
    void checkEngine()
  }, [phase, checkEngine])

  // 온보딩 제출: setProfile IPC + store 갱신 + engine 체크
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
        // 온보딩 완료 → engine 체크로 전환
        setPhase('engine-check')
      })
  }

  // EngineGate 재확인: getEngineState 재호출
  const handleRetry = (): void => {
    void checkEngine()
  }

  // EngineGate 계속 진행: 인증 없이 Shell 진입 (graceful 우회)
  const handleSkip = (): void => {
    setPhase('main')
  }

  // 부트 스플래시 (절제된 우리 스타일 — 네온/글로우/슬롭 금지)
  if (phase === 'loading' || phase === 'engine-check') {
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

  // EngineGate — 미인증 또는 SDK 비가용 안내
  if (phase === 'engine-gate') {
    return (
      <EngineGate
        open={true}
        available={engineAvailable}
        authed={false}
        version={engineVersion}
        onRetry={handleRetry}
        onSkip={handleSkip}
      />
    )
  }

  // MainApp (Shell) — profile 있음 + authed, 또는 온보딩 완료 + engine 통과
  return <Shell />
}

export default AppGate
