import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ipc } from '@renderer/01_Ipc'
import { sameCwd, useWorkStore } from '@renderer/13_Loop'
import { decideSteps, type OnboardingInputs, type Reading, type Step } from './onboardingModel'

const FIRST: Omit<OnboardingInputs, 'cwd'> = {
  engine: 'checking', github: 'checking', gh: 'checking', gitRoot: 'checking', taste: 'checking', loop: 'checking',
}

// 안내는 앱을 쓰는 데 꼭 필요한 화면이 아니다 — 읽기 하나가 던지거나 비어 와도 그 단계만 「읽지 못함」이 된다
function settle<T>(call: () => Promise<T | undefined>, done: (v: Reading<T>) => void): void {
  let p: Promise<T | undefined>
  try {
    p = call()
  } catch {
    done('failed')
    return
  }
  p.then((v) => done(v === undefined ? 'failed' : v), () => done('failed'))
}

function subscribe(on: () => () => void): () => void {
  try {
    return on()
  } catch {
    return () => undefined
  }
}

// 안내가 그려져 있는 동안만 쓴다 — 열 때, 「다시 확인」, 창으로 돌아올 때 다시 읽는다
export function useOnboardingSteps(): { steps: Step[]; recheck: () => void } {
  const cwd = useWorkStore((s) => s.cwd)
  const cwdRef = useRef(cwd)
  cwdRef.current = cwd
  const [inputs, setInputs] = useState<OnboardingInputs>(() => ({ ...FIRST, cwd }))
  const [round, setRound] = useState(0)
  const recheck = useCallback(() => setRound((n) => n + 1), [])

  const putter = (alive: () => boolean) =>
    <K extends keyof OnboardingInputs>(key: K) => (value: OnboardingInputs[K]): void => {
      if (alive()) setInputs((i) => ({ ...i, [key]: value }))
    }

  useEffect(() => {
    let alive = true
    const put = putter(() => alive)
    setInputs((i) => ({ ...i, engine: 'checking', github: 'checking', gh: 'checking' }))
    settle(() => ipc.engine.state(), put('engine'))
    settle(() => ipc.github.status(), put('github'))
    settle(() => ipc.onboarding.ghCheck(), put('gh'))
    return () => { alive = false }
  }, [round])

  useEffect(() => {
    let alive = true
    const put = putter(() => alive)
    setInputs((i) => ({ ...i, cwd, gitRoot: cwd === null ? null : 'checking', taste: 'checking', loop: 'checking' }))
    if (cwd === null) return
    settle(() => ipc.git.root({ cwd }), (root) => {
      put('gitRoot')(root)
      if (root === null || root === 'failed' || !alive) return
      settle(() => ipc.taste.read({ cwd }), put('taste'))
      settle(() => ipc.loop.status({ cwd }), put('loop'))
    })
    return () => { alive = false }
  }, [cwd, round])

  useEffect(() => subscribe(() => ipc.github.onState((s) => setInputs((i) => ({ ...i, github: s })))), [])
  useEffect(() => subscribe(() => ipc.loop.onState((s) => {
    if (sameCwd(s.cwd, cwdRef.current)) setInputs((i) => ({ ...i, loop: s }))
  })), [])

  useEffect(() => {
    window.addEventListener('focus', recheck)
    return () => window.removeEventListener('focus', recheck)
  }, [recheck])

  const steps = useMemo(() => decideSteps(inputs), [inputs])
  return { steps, recheck }
}
