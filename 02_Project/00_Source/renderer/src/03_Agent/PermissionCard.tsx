import { useEffect, useRef, useState, type JSX } from 'react'
import { IconShieldChk, IconChevDown } from '../../components/common/icons'
import type { PendingPermission } from '../../store/reducer'
import { mcpToolLabel } from '../../lib/toolKind'
import { MarkdownView } from '../conversation'
import './PermissionCard.css'

export type PermissionChoice = 'allow' | 'allow_always' | 'deny'

const PERM_CHOICES: { key: PermissionChoice; label: string; desc: string; color: string }[] = [
  { key: 'allow',        label: '허용',       desc: '이번 한 번만 실행을 허용해요',            color: 'var(--green)'  },
  { key: 'allow_always', label: '항상 허용',  desc: '이번 세션 동안 이 도구를 자동 허용해요', color: 'var(--accent)' },
  { key: 'deny',         label: '거부',       desc: '이 작업을 실행하지 않아요',              color: 'var(--red)'    },
]

const PLAN_CHOICES: { key: PermissionChoice; label: string; desc: string; color: string }[] = [
  { key: 'allow', label: '실행 승인', desc: '계획대로 실행을 진행해요', color: 'var(--green)'  },
  { key: 'deny',  label: '계속 계획', desc: '계획을 더 다듬어요',       color: 'var(--accent)' },
]

function planFileBasename(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath
}

function isInputFocused(): boolean {
  const ae = document.activeElement as HTMLElement | null
  return !!ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable)
}

export interface PermissionCardProps {
  pending: PendingPermission | null
  onRespond: (choice: PermissionChoice) => void
}

export function PermissionCard({ pending, onRespond }: PermissionCardProps): JSX.Element | null {
  const rootRef = useRef<HTMLDivElement>(null)

  const onRespondRef = useRef(onRespond)
  onRespondRef.current = onRespond

  const [planOpen, setPlanOpen] = useState(false)
  useEffect(() => {
    setPlanOpen(false)
  }, [pending])

  useEffect(() => {
    if (!pending) return
    const el = rootRef.current
    if (!el) return

    if (!isInputFocused()) el.focus()

    const choices = pending.planReview != null ? PLAN_CHOICES : PERM_CHOICES

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        onRespondRef.current('deny')
        return
      }
      const n = parseInt(e.key, 10)
      if (Number.isInteger(n) && n >= 1 && n <= choices.length) {
        e.preventDefault()
        onRespondRef.current(choices[n - 1].key)
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [pending])

  if (!pending) return null

  const isPlanMode = pending.planReview != null
  const planText = pending.planReview?.plan ?? ''
  const hasPlanBody = planText.length > 0
  const choices = isPlanMode ? PLAN_CHOICES : PERM_CHOICES

  return (
    <div
      className="perm-card"
      ref={rootRef}
      tabIndex={-1}
      role="group"
      aria-label={isPlanMode ? '계획 검토 요청' : '도구 사용 승인 요청'}
      aria-live="polite"
      data-plan-mode={isPlanMode ? true : undefined}
    >
      <div className="perm-card-head">
        <span className="perm-card-ic" aria-hidden="true">
          <IconShieldChk size={17} />
        </span>
        <div className="perm-card-text">
          <span className="perm-card-title">{isPlanMode ? '계획 검토' : '도구 사용 승인 요청'}</span>
          {pending.toolName && <span className="perm-card-tool">{mcpToolLabel(pending.toolName)}</span>}
        </div>
      </div>

      {isPlanMode ? (
        hasPlanBody ? (
          <div className="perm-card-plan">
            <button
              type="button"
              className={`perm-card-plan-toggle${planOpen ? ' open' : ''}`}
              data-plan-toggle
              aria-expanded={planOpen}
              aria-label={planOpen ? '계획 본문 접기' : '계획 본문 펼치기'}
              onClick={() => setPlanOpen((v) => !v)}
            >
              <span className="perm-card-plan-toggle-ic" aria-hidden="true">
                <IconChevDown size={12} />
              </span>
              <span>{planOpen ? '계획 본문 접기' : '계획 본문 펼치기'}</span>
              {pending.planReview?.planFilePath && (
                <span className="perm-card-plan-path" title={pending.planReview.planFilePath}>
                  {planFileBasename(pending.planReview.planFilePath)}
                </span>
              )}
            </button>
            {planOpen && (
              <div className="perm-card-plan-body">
                <MarkdownView source={planText} />
              </div>
            )}
          </div>
        ) : (
          <div className="perm-card-plan-empty">계획 본문을 가져올 수 없음</div>
        )
      ) : (
        pending.summary && <div className="perm-card-sum">{pending.summary}</div>
      )}

      <div className={`perm-card-opts${choices.length === 2 ? ' perm-card-opts-2' : ''}`}>
        {choices.map((c, i) => (
          <button
            key={c.key}
            type="button"
            className="perm-card-opt"
            data-perm-choice={c.key}
            title={c.desc}
            aria-label={`${c.label} — ${c.desc}`}
            onClick={() => onRespond(c.key)}
          >
            <span className="q-num" style={{ background: c.color, color: 'var(--on-accent)' }}>
              {i + 1}
            </span>
            <span className="perm-card-opt-text">
              <span className="perm-card-opt-label">{c.label}</span>
              <span className="perm-card-opt-desc">{c.desc}</span>
            </span>
          </button>
        ))}
        <span className="perm-card-hint">{isPlanMode ? '숫자 키 · Esc 계속 계획' : '숫자 키 · Esc 거부'}</span>
      </div>
    </div>
  )
}

export default PermissionCard
