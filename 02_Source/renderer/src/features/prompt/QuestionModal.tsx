import { useEffect, useRef, useState, type JSX } from 'react'
import { IconCheck, IconChevDown, IconClose, IconExpand, IconPencil, IconSend } from '../../components/common/icons'
import type { AgentQuestion } from '../../lib/f14SampleData'
import './QuestionModal.css'

const Q_NUM_COLORS = [
  'var(--blue)',
  'var(--green)',
  'var(--violet)',
  'var(--rose)',
  'var(--teal)',
  'var(--accent-2)',
  'var(--cyan)',
  'var(--red)',
]

function IconClipList(): JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  )
}

export interface QuestionModalProps {
  open: boolean
  questions: AgentQuestion[]
  onAnswer: (answers: string[][]) => void
  onDismiss: () => void
}

export function QuestionModal({ open, questions, onAnswer, onDismiss }: QuestionModalProps): JSX.Element | null {
  if (!open) return null
  return (
    <QuestionDialog
      key={questions.map((q) => q.question).join('|')}
      questions={questions}
      onAnswer={onAnswer}
      onDismiss={onDismiss}
    />
  )
}

export default QuestionModal

function QuestionDialog({
  questions,
  onAnswer,
  onDismiss,
}: {
  questions: AgentQuestion[]
  onAnswer: (answers: string[][]) => void
  onDismiss: () => void
}): JSX.Element {
  const [sel, setSel] = useState<string[][]>(() => questions.map(() => []))
  const [custom, setCustom] = useState<string[]>(() => questions.map(() => ''))
  const [other, setOther] = useState<boolean[]>(() => questions.map(() => false))
  const [step, setStep] = useState(0)
  const [minimized, setMinimized] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const customRef = useRef<HTMLInputElement>(null)

  const multi = questions.length > 1
  const cur = questions[step]
  const last = step === questions.length - 1

  const answerAt = (i: number, s = sel, c = custom, o = other): string[] => {
    const extra = o[i] && c[i].trim() ? [c[i].trim()] : []
    return questions[i].multiSelect ? [...s[i], ...extra] : o[i] ? extra : s[i]
  }
  const finalAnswers = (s = sel, c = custom, o = other): string[][] =>
    questions.map((_, i) => answerAt(i, s, c, o))
  const curChosen = answerAt(step).length > 0
  const allAnswered = questions.every((_, i) => answerAt(i).length > 0)

  const choose = (label: string): void => {
    const nextSel = sel.map((a) => a.slice())
    if (cur.multiSelect) {
      const idx = nextSel[step].indexOf(label)
      if (idx >= 0) nextSel[step].splice(idx, 1)
      else nextSel[step].push(label)
    } else {
      nextSel[step] = [label]
    }
    setSel(nextSel)
    let nextOther = other
    if (!cur.multiSelect && other[step]) {
      nextOther = other.slice()
      nextOther[step] = false
      setOther(nextOther)
    }
    if (!cur.multiSelect) {
      if (last) onAnswer(finalAnswers(nextSel, custom, nextOther))
      else setStep(step + 1)
    }
  }

  const chooseOther = (): void => {
    const nextOther = other.slice()
    if (cur.multiSelect) {
      nextOther[step] = !nextOther[step]
    } else {
      nextOther[step] = true
      const nextSel = sel.map((a) => a.slice())
      nextSel[step] = []
      setSel(nextSel)
    }
    setOther(nextOther)
  }

  const setCustomAt = (i: number, val: string): void =>
    setCustom((prev) => {
      const n = prev.slice()
      n[i] = val
      return n
    })

  const proceed = (): void => {
    if (!curChosen) return
    if (last) {
      if (allAnswered) onAnswer(finalAnswers())
    } else setStep(step + 1)
  }

  useEffect(() => {
    if (!minimized) modalRef.current?.focus()
  }, [minimized])

  useEffect(() => {
    if (other[step]) customRef.current?.focus()
  }, [other, step])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (minimized) {
        if (e.key === 'Escape') {
          onDismiss()
        }
        return
      }
      if (e.key === 'Escape') {
        setMinimized(true)
        return
      }
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable)) return

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        setStep((s) => Math.max(0, s - 1))
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        setStep((s) => Math.min(questions.length - 1, s + 1))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        proceed()
        return
      }
      const n = parseInt(e.key, 10)
      if (!Number.isInteger(n) || n < 1) return
      if (n <= cur.options.length) {
        e.preventDefault()
        choose(cur.options[n - 1].label)
      } else if (n === cur.options.length + 1) {
        e.preventDefault()
        chooseOther()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, custom, other, step, onDismiss, minimized, cur, last])

  const otherIdx = cur.options.length
  const footBtn = cur.multiSelect || other[step]

  if (minimized) {
    return (
      <div
        className="q-mini-pill"
        onClick={() => setMinimized(false)}
        role="button"
        aria-label="질문 펼치기"
      >
        <div className="q-mini-orb">
          <IconClipList />
        </div>
        <div className="mini-text">
          <div className="mini-title">질문이 기다리고 있어요</div>
          <div className="mini-sub">
            {multi ? `질문 ${questions.length}개 · 펼쳐서 답하기` : '펼쳐서 답하기'}
          </div>
        </div>
        <span className="mini-spacer" />
        <button
          className="mini-btn has-tip"
          data-tip="펼치기"
          aria-label="펼치기"
          onClick={(e) => { e.stopPropagation(); setMinimized(false) }}
        >
          <IconExpand size={15} />
        </button>
        <button
          className="mini-btn close has-tip"
          data-tip="건너뛰기"
          aria-label="건너뛰기"
          onClick={(e) => { e.stopPropagation(); onDismiss() }}
        >
          <IconClose size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="q-overlay">
      <div className="q-modal" ref={modalRef} tabIndex={-1}>
        <div className="q-modal-head">
          <span className="qm-title">질문</span>
          {multi && (
            <span className="qm-step-count">
              {step + 1} / {questions.length}
            </span>
          )}
          <span className="qm-spacer" />
          <button
            className="qm-min"
            onClick={() => setMinimized(true)}
            aria-label="내려두기"
            title="내려두기 (Esc)"
          >
            <IconChevDown size={18} />
          </button>
          <button
            className="qm-close"
            onClick={onDismiss}
            aria-label="건너뛰기"
            title="건너뛰기"
          >
            <IconClose size={18} />
          </button>
        </div>

        {multi && (
          <div className="q-steps">
            {questions.map((q, i) => {
              const done = answerAt(i).length > 0
              const state = i === step ? 'q-cur' : done ? 'q-done' : 'q-todo'
              return (
                <button
                  key={i}
                  className={'q-step ' + state}
                  onClick={() => setStep(i)}
                  title={done ? answerAt(i).join(', ') : undefined}
                >
                  <span className="q-step-n">
                    {done && i !== step ? <IconCheck size={12} /> : i + 1}
                  </span>
                  <span className="q-step-lbl">{q.header || `질문 ${i + 1}`}</span>
                </button>
              )
            })}
          </div>
        )}

        <div className="q-modal-body scroll">
          <div className="q-block">
            <div className="q-head">
              {cur.header && <span className="q-chip">{cur.header}</span>}
              <span className="q-q">{cur.question}</span>
            </div>
            <div className="q-opts">
              {cur.options.map((o, oi) => {
                const on = sel[step].includes(o.label)
                return (
                  <button
                    key={oi}
                    className={'q-opt' + (on ? ' on' : '')}
                    onClick={() => choose(o.label)}
                  >
                    <span
                      className="q-num"
                      style={{ background: Q_NUM_COLORS[oi % Q_NUM_COLORS.length], color: 'var(--on-accent)' }}
                    >
                      {oi + 1}
                    </span>
                    <span className="q-opt-text">
                      <span className="q-opt-label">{o.label}</span>
                      {o.description && <span className="q-opt-desc">{o.description}</span>}
                    </span>
                    {on && <IconCheck size={15} className="q-check" />}
                  </button>
                )
              })}

              <button
                className={'q-opt q-opt-other' + (other[step] ? ' on' : '')}
                onClick={chooseOther}
              >
                <span
                  className="q-num"
                  style={{
                    background: Q_NUM_COLORS[otherIdx % Q_NUM_COLORS.length],
                    color: 'var(--on-accent)',
                  }}
                >
                  {otherIdx + 1}
                </span>
                <span className="q-opt-text">
                  <span className="q-opt-label">직접 입력</span>
                  <span className="q-opt-desc">원하는 답을 직접 작성해요</span>
                </span>
                {other[step] && <IconCheck size={15} className="q-check" />}
              </button>

              {other[step] && (
                <div className="q-custom-wrap">
                  <IconPencil size={14} className="q-custom-ic" />
                  <input
                    ref={customRef}
                    className="q-custom"
                    placeholder="원하는 답을 직접 입력…"
                    value={custom[step]}
                    onChange={(e) => setCustomAt(step, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        proceed()
                      }
                    }}
                  />
                  <button
                    className="q-custom-go"
                    disabled={!custom[step].trim()}
                    onClick={proceed}
                    title={last ? '완료' : '다음'}
                    aria-label={last ? '완료' : '다음'}
                  >
                    <IconSend size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="q-modal-foot">
          <span className="q-hint">
            숫자 키로 선택{cur.multiSelect ? ' · 여러 개 가능' : ''} · Esc 내려두기
          </span>
          {footBtn && (
            <button className="q-submit" disabled={!curChosen} onClick={proceed}>
              {last ? '완료' : '다음'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
