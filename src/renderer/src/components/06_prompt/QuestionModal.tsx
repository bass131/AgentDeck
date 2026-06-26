/**
 * QuestionModal.tsx — AskUserQuestion 다중 질문 모달 (F14-01).
 *
 * 원본 AgentCodeGUI Chat.tsx QuestionDialog L1059~1393 1:1 이식.
 * - q-overlay > q-modal(q-modal-head + q-steps[다중] + q-block + q-modal-foot + q-submit)
 * - 잠깐 내려두기 → .q-mini-pill 우하단 알약(AskModal .ask-mini와 별 클래스 — 위치 비충돌)
 * - 단일선택 자동진행 / 다중 토글 + 직접 입력(q-custom)
 *
 * CRITICAL: window.api 0. 인라인 색상 0 —
 *   예외: q-num 배경색만 Q_NUM_COLORS 상수 CSS 변수 인라인 허용
 *   (F8 avatarColor 예외 동일 근거: 고정 팔레트 상수, window.api 0, 주석 교차참조).
 */
import { useEffect, useRef, useState, type JSX } from 'react'
import { IconCheck, IconChevDown, IconClose, IconExpand, IconPencil, IconSend } from '../common/icons'
import type { AgentQuestion } from '../../lib/f14SampleData'
import './QuestionModal.css'

// 고정 팔레트 상수 — q-num 배경 인라인 허용 (F8 avatarColor 예외 동일 근거)
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

// 목록 아이콘 (inline glyph — 별도 icon 없음)
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

/**
 * QuestionModal — 내부 다이얼로그(QuestionDialog 패턴).
 * open=false면 null 반환 + 내부 state 초기화(key로 재마운트 권장).
 */
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

// ── 내부 QuestionDialog ──────────────────────────────────────────────────────

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
  // 잠깐 내려두기 — 답을 잃지 않고 우하단 알약(.q-mini-pill)으로 접어 뒤 대화 확인 후 다시 펼침.
  // .q-mini-pill은 AskModal .ask-mini와 별 클래스(위치 비충돌 보장).
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

  // 포커스: 복원 시 모달로 포커스
  useEffect(() => {
    if (!minimized) modalRef.current?.focus()
  }, [minimized])

  // 포커스: 직접 입력 활성화 시 input으로
  useEffect(() => {
    if (other[step]) customRef.current?.focus()
  }, [other, step])

  // 키보드 핸들러
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // 내려둔 동안 — Esc 한 번 더면 건너뛰기
      if (minimized) {
        if (e.key === 'Escape') {
          // Esc 내려둔 상태 → 건너뛰기(onDismiss). preventDefault 금지.
          onDismiss()
        }
        return
      }
      // 펼친 상태 Esc → 잠깐 내려두기(답 보존). preventDefault 금지.
      if (e.key === 'Escape') {
        setMinimized(true)
        return
      }
      // 입력 포커스 시 텍스트 단축키 무시
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
  }, [sel, custom, other, step, onDismiss, minimized, cur, last])

  const otherIdx = cur.options.length
  const footBtn = cur.multiSelect || other[step]

  // ── 내려둔 상태: .q-mini-pill 알약 (AskModal .ask-mini와 별 클래스) ──────────
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

  // ── 펼친 상태 ────────────────────────────────────────────────────────────────
  return (
    <div className="q-overlay">
      <div className="q-modal" ref={modalRef} tabIndex={-1}>
        {/* 헤더 */}
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

        {/* 단계 표시 (다중) */}
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

        {/* 질문 본문 */}
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
                    {/* q-num 배경: 고정 팔레트 상수 인라인 — F8 avatarColor 예외 동일 근거 */}
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

              {/* 직접 입력 옵션 */}
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

              {/* 직접 입력 텍스트 필드 */}
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

        {/* 풋터 */}
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
