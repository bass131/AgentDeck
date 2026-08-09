import { useState, useEffect, useCallback, type JSX } from 'react'
import { Profile } from './features/shell'
import type { UserProfile } from './features/shell'
import type { Profile as IpcProfile } from '../../shared/ipcContract'
import Shell from './layout/Shell'
import { EngineGate } from './features/notice'
import { useAppStore } from './store/appStore'
import './AppGate.css'

type BootPhase = 'loading' | 'onboarding' | 'engine-check' | 'engine-gate' | 'main'

export function AppGate(): JSX.Element {
  const [phase, setPhase] = useState<BootPhase>('loading')
  const [initial, setInitial] = useState<UserProfile | null>(null)
  const [engineVersion, setEngineVersion] = useState<string | null>(null)
  const [engineAvailable, setEngineAvailable] = useState<boolean>(true)

  const checkEngine = useCallback((): Promise<void> => {
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
        setPhase('main')
      })
  }, [])

  useEffect(() => {
    window.api.getProfile()
      .then((profile) => {
        if (profile) {
          useAppStore.getState().applyProfile(profile)
          setInitial({ nickname: profile.nickname, color: profile.color })
          setPhase('engine-check')
        } else {
          setPhase('onboarding')
        }
      })
      .catch(() => {
        setPhase('onboarding')
      })
  }, [])

  useEffect(() => {
    if (phase !== 'engine-check') return
    void checkEngine()
  }, [phase, checkEngine])

  const handleEnter = (userProfile: UserProfile): void => {
    const ipcProfile: IpcProfile = {
      nickname: userProfile.nickname,
      color: userProfile.color,
    }

    window.api.setProfile(ipcProfile)
      .then(() => {
        useAppStore.getState().applyProfile(ipcProfile)
      })
      .catch(() => {
        useAppStore.getState().applyProfile(ipcProfile)
      })
      .finally(() => {
        setPhase('engine-check')
      })
  }

  const handleRetry = (): void => {
    void checkEngine()
  }

  const handleSkip = (): void => {
    setPhase('main')
  }

  if (phase === 'loading' || phase === 'engine-check') {
    return (
      <div className="boot-splash">
        <div className="boot-brand">AgentDeck</div>
      </div>
    )
  }

  if (phase === 'onboarding') {
    return (
      <div className="boot-onboarding">
        <Profile initial={initial} onEnter={handleEnter} />
      </div>
    )
  }

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

  return <Shell />
}

export default AppGate
