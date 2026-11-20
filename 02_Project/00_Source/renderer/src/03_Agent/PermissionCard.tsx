import { useEffect, useRef, useState, type JSX } from 'react'
import { IconShieldChk, IconChevDown } from '@renderer/02_Common/icons'
import { isBlockingModalOpen, useModalLayer } from '@renderer/02_Common/modalStack'
import type { PendingPermission } from '@renderer/05_Conversation/state/reducer'
import { mcpToolLabel } from './toolKind'
import { MarkdownView } from '@renderer/05_Conversation'
import './PermissionCard.css'

export type PermissionChoice = 'allow' | 'allow_always' | 'deny'

// 숫자 키의 뜻은 카드 종류와 관계없이 같다(M11 G2, M06 Backlog 11) — 2는 언제나 거부(계획 카드는 계속 계획)다.
const CHOICE_KEY: Record<PermissionChoice, number> = { allow: 1, deny: 2, allow_always: 3 }

const PERM_CHOICES: { key: PermissionChoice; label: string; desc: string; color: string }[] = [
  { key: 'allow',        label: '허용',       desc: '이번 한 번만 실행을 허용해요',            color: 'var(--green)'  },
  { key: 'deny',         label: '거부',       desc: '이 작업을 실행하지 않아요',              color: 'var(--red)'    },
  { key: 'allow_always', label: '항상 허용',  desc: '이번 세션 동안 이 도구를 자동 허용해요', color: 'var(--accent)' },
]

// M06 G3 — 모드와 관계없이 사람에게 올린 호출에는 「항상 허용」이 없다. 도구 단위 세션 규칙이 Bash 전체를 열어 가드 질문까지 덮기 때문이다.
const GUARD_CHOICES = PERM_CHOICES.filter((c) => c.key !== 'allow_always')

const PLAN_CHOICES: { key: PermissionChoice; label: string; desc: string; color: string }[] = [
  { key: 'allow', label: '실행 승인', desc: '계획대로 실행을 진행해요', color: 'var(--green)'  },
  { key: 'deny',  label: '계속 계획', desc: '계획을 더 다듬어요',       color: 'var(--accent)' },
]

// 이보다 긴 명령은 접힌 채로 시작한다. 접혀도 전문은 DOM에 남는다(높이만 줄인다).
const LONG_COMMAND_CHARS = 200
const LONG_COMMAND_LINES = 4

// 사유는 가드가 낸 것일 수도, SDK의 다른 안전 검사가 낸 것일 수도, 아예 없을 수도 있다. 구별할 표지가 없어 한 라벨로 부른다.
const REASON_LABEL = '확인이 필요한 이유'
const REASON_FALLBACK = '도구가 사유를 보내지 않았어요. 아래 명령 전문을 보고 판단하세요.'
const ALLOW_LOCKED_HINT = '명령 전문을 펼친 뒤 허용할 수 있어요'
const ALLOW_TAIL_HINT = '명령 끝까지 스크롤한 뒤 허용할 수 있어요'

function isLongCommand(summary: string): boolean {
  return summary.length > LONG_COMMAND_CHARS || summary.split('\n').length > LONG_COMMAND_LINES
}

function isEscalated(pending: PendingPermission): boolean {
  if (pending.planReview != null) return false
  if (pending.escalated === true) return true
  return typeof pending.askReason === 'string' && pending.askReason.length > 0
}

function choicesFor(pending: PendingPermission): typeof PERM_CHOICES {
  if (pending.planReview != null) return PLAN_CHOICES
  return isEscalated(pending) ? GUARD_CHOICES : PERM_CHOICES
}

function planFileBasename(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath
}

function isInputFocused(): boolean {
  const ae = document.activeElement as HTMLElement | null
  return !!ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable)
}

const NEXT_REQUEST_KEY_DELAY_MS = 300

function scrolledToEnd(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= 2
}

export interface PermissionCardProps {
  pending: PendingPermission | null
  onRespond: (choice: PermissionChoice) => void
}

export function PermissionCard({ pending, onRespond }: PermissionCardProps): JSX.Element | null {
  const rootRef = useRef<HTMLDivElement>(null)
  const cmdRef = useRef<HTMLDivElement>(null)

  const onRespondRef = useRef(onRespond)
  onRespondRef.current = onRespond

  const [planOpen, setPlanOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [tailSeen, setTailSeen] = useState(false)
  const requestId = pending?.requestId ?? null
  // 곁 층 — 떠 있는 동안 Esc가 채팅 실행을 끊지 않지만, 다른 모달의 Esc는 가로채지 않는다(M11 G4)
  useModalLayer(pending !== null, undefined, 'aside')
  const lastRequestIdRef = useRef<string | null>(null)
  const armedAtRef = useRef(0)
  useEffect(() => {
    setPlanOpen(false)
    setCmdOpen(false)
    setTailSeen(false)
    // 줄 선 다음 요청으로 바뀐 직후의 키는 앞 요청에 누른 키일 수 있다
    if (requestId !== null && lastRequestIdRef.current !== null) armedAtRef.current = Date.now() + NEXT_REQUEST_KEY_DELAY_MS
    lastRequestIdRef.current = requestId
  }, [requestId])

  useEffect(() => {
    if (cmdOpen && cmdRef.current && scrolledToEnd(cmdRef.current)) setTailSeen(true)
  }, [cmdOpen])

  const escalated = pending != null && isEscalated(pending)
  const cmdLong = escalated && pending != null && isLongCommand(pending.summary)
  // 긴 명령은 꼬리를 보기 전에는 허용을 막는다. 거부와 Esc는 언제나 열려 있다.
  const allowLocked = cmdLong && (!cmdOpen || !tailSeen)
  const lockHint = cmdOpen ? ALLOW_TAIL_HINT : ALLOW_LOCKED_HINT
  const allowLockedRef = useRef(allowLocked)
  allowLockedRef.current = allowLocked

  useEffect(() => {
    if (!pending) return
    const el = rootRef.current
    if (!el) return

    if (!isInputFocused()) el.focus()

    const choices = choicesFor(pending)

    function onKey(e: KeyboardEvent): void {
      if (e.repeat || Date.now() < armedAtRef.current) return
      if (e.key === 'Escape') {
        if (!isBlockingModalOpen(e)) onRespondRef.current('deny')
        return
      }
      const n = parseInt(e.key, 10)
      const choice = choices.find((c) => CHOICE_KEY[c.key] === n)
      if (choice) {
        e.preventDefault()
        if (choice.key === 'allow' && allowLockedRef.current) return
        onRespondRef.current(choice.key)
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [pending])

  if (!pending) return null

  const isPlanMode = pending.planReview != null
  const planText = pending.planReview?.plan ?? ''
  const hasPlanBody = planText.length > 0
  const choices = choicesFor(pending)
  const reasonText = typeof pending.askReason === 'string' && pending.askReason.length > 0 ? pending.askReason : undefined
  const behind = pending.behind?.length ?? 0

  return (
    <div
      className="perm-card"
      ref={rootRef}
      tabIndex={-1}
      role="group"
      aria-label={isPlanMode ? '계획 검토 요청' : '도구 사용 승인 요청'}
      aria-live="polite"
      data-plan-mode={isPlanMode ? true : undefined}
      data-guard-ask={escalated ? true : undefined}
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
      ) : escalated ? (
        <>
          <div className="perm-card-reason" data-ask-reason>
            <span className="perm-card-reason-label">{REASON_LABEL}</span>
            <span className={`perm-card-reason-text${reasonText ? '' : ' empty'}`}>{reasonText ?? REASON_FALLBACK}</span>
          </div>
          <div
            ref={cmdRef}
            className={`perm-card-sum perm-card-sum-full${cmdLong && !cmdOpen ? ' collapsed' : ''}`}
            data-cmd-full
            onScroll={(e) => {
              if (cmdOpen && scrolledToEnd(e.currentTarget)) setTailSeen(true)
            }}
          >
            {pending.summary}
          </div>
          {cmdLong && (
            <button
              type="button"
              className={`perm-card-plan-toggle${cmdOpen ? ' open' : ''}`}
              data-cmd-toggle
              aria-expanded={cmdOpen}
              aria-label={cmdOpen ? '명령 전문 접기' : '명령 전문 펼치기'}
              onClick={() => setCmdOpen((v) => !v)}
            >
              <span className="perm-card-plan-toggle-ic" aria-hidden="true">
                <IconChevDown size={12} />
              </span>
              <span>{cmdOpen ? '명령 전문 접기' : '명령 전문 펼치기'}</span>
            </button>
          )}
        </>
      ) : (
        pending.summary && <div className="perm-card-sum">{pending.summary}</div>
      )}

      <div className={`perm-card-opts${choices.length === 2 ? ' perm-card-opts-2' : ''}`}>
        {choices.map((c) => {
          const locked = c.key === 'allow' && allowLocked
          return (
            <button
              key={c.key}
              type="button"
              className="perm-card-opt"
              data-perm-choice={c.key}
              title={locked ? lockHint : c.desc}
              aria-label={`${c.label} — ${locked ? lockHint : c.desc}`}
              disabled={locked}
              onClick={() => {
                if (locked) return
                onRespond(c.key)
              }}
            >
              <span className="q-num" style={{ background: c.color, color: 'var(--on-accent)' }}>
                {CHOICE_KEY[c.key]}
              </span>
              <span className="perm-card-opt-text">
                <span className="perm-card-opt-label">{c.label}</span>
                <span className="perm-card-opt-desc">{c.desc}</span>
              </span>
            </button>
          )
        })}
        {allowLocked && (
          <span className="perm-card-lock-hint" data-allow-locked>
            {lockHint}
          </span>
        )}
        {behind > 0 && (
          <span className="perm-card-hint" data-perm-behind>
            뒤에 {behind}건 대기
          </span>
        )}
        <span className="perm-card-hint">{isPlanMode ? '숫자 키 · Esc 계속 계획' : '숫자 키 · Esc 거부'}</span>
      </div>
    </div>
  )
}

export default PermissionCard
