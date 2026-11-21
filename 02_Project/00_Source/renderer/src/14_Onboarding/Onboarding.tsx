// 각 단계의 일은 이미 있는 화면이 한다 — 이 목록은 상태를 읽어 보이고 그 화면으로 잇기만 한다.
import { useEffect, useState, type JSX } from 'react'
import { Modal } from '@renderer/02_Common/Modal'
import { ipc } from '@renderer/01_Ipc'
import { setPref } from '@renderer/11_Settings/prefs'
import { ONBOARDING_KEY, allDone, closedValue, type StepId, type StepState } from './onboardingModel'
import { useOnboardingSteps } from './useOnboardingSteps'
import './Onboarding.css'

export type OnboardingTarget = Exclude<StepId, 'gh'>

const ACTION: Record<StepId, string> = {
  claude: '로그인 안내',
  github: 'GitHub 계정 열기',
  gh: '설치 안내',
  project: '폴더 열기',
  taste: '헌장·Taste 열기',
  milestone: '현황판 열기',
}
const BADGE: Record<StepState, string> = { done: '끝남', todo: '할 일', checking: '확인 중', blocked: '막힘' }
const MARK: Record<StepState, string> = { done: '✓', todo: '', checking: '…', blocked: '!' }
const GH_OPENED = '브라우저에서 gh 설치 안내를 열었어요 — 설치한 뒤 「다시 확인」을 눌러 주세요'
const OPEN_FAILED = '브라우저를 열지 못했어요'

interface OnboardingProps {
  // 「나중에」·Esc·닫기 — 기록은 이 화면이 하고 부르는 쪽은 닫기만 한다
  onClose: () => void
  onGo: (target: OnboardingTarget) => void
}

export function Onboarding({ onClose, onGo }: OnboardingProps): JSX.Element {
  const { steps, recheck } = useOnboardingSteps()
  const [note, setNote] = useState<string | null>(null)
  const finished = allDone(steps)

  useEffect(() => {
    if (finished) setPref(ONBOARDING_KEY, 'done')
  }, [finished])

  const close = (): void => {
    setPref(ONBOARDING_KEY, closedValue(steps))
    onClose()
  }

  const go = (id: StepId): void => {
    if (id !== 'gh') {
      onGo(id)
      return
    }
    ipc.onboarding.openGhInstall().then(
      (r) => setNote(r.ok ? GH_OPENED : (r.error ?? OPEN_FAILED)),
      () => setNote(OPEN_FAILED),
    )
  }

  return (
    <Modal title="시작하기" onClose={close}>
      <div className="ob-intro">
        {finished
          ? '모두 끝났어요. 이 안내는 사이드바의 「시작하기」에서 다시 볼 수 있어요.'
          : '처음 쓰는 데 필요한 일을 차례로 보여 드려요. 버튼을 누르면 그 일을 하는 화면이 열려요.'}
      </div>
      <ul className="ob-steps" aria-label="시작하기 단계">
        {steps.map((s) => (
          <li key={s.id} className="ob-step" data-step={s.id} data-state={s.state} aria-label={s.title}>
            <span className="ob-mark" aria-hidden="true">{MARK[s.state]}</span>
            <div className="ob-text">
              <div className="ob-title">
                <span>{s.title}</span>
                <span className="ob-badge">{BADGE[s.state]}</span>
              </div>
              <div className="ob-detail">{s.detail}</div>
            </div>
            <button
              type="button"
              className={'ob-btn' + (s.state === 'todo' ? ' pri' : '')}
              disabled={!s.actionable}
              onClick={() => go(s.id)}
            >
              {ACTION[s.id]}
            </button>
          </li>
        ))}
      </ul>
      {note !== null && <div className="ob-note" role="status">{note}</div>}
      <div className="ob-foot">
        <button type="button" className="ob-btn" onClick={recheck}>다시 확인</button>
        <button type="button" className="ob-btn" onClick={close}>나중에</button>
      </div>
    </Modal>
  )
}
