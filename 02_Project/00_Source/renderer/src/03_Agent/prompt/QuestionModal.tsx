import { useEffect, useRef, useState, type JSX } from 'react'
import { IconCheck, IconChevDown, IconClose, IconExpand, IconPencil, IconSend } from '@renderer/02_Common/icons'
import { useModalLayer } from '@renderer/02_Common/modalStack'
import type { AgentQuestion } from './types'
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
  // 어느 패널의 질문인지 — 단일 대화는 넘기지 않는다.
  source?: string
  // 이 창이 실제로 그려지는 화면 층(그 창을 감싼 겹침 맥락의 z-index). 기본은 대화·패널 질문 창의 층이다.
  layer?: number
}

// 질문 창의 화면 층 — CSS z-index와 같은 값이다(시험이 CSS 파일과 대조한다).
//   app: 대화·루프 화면의 질문 창 — QuestionModal.css의 .q-overlay(320)
// M10 G1 — 루프 화면이 모달을 벗어나 작업 모드의 가운데 칸에 그려지며 겹침 맥락(옛 .loop-overlay, 60)이 없어졌다.
// 그래서 루프 질문 창도 app 층에 그려지고 loop 층을 뺐다. 층 prop은 다른 겹침 맥락이 생길 때를 위해 남긴다.
export const DIALOG_LAYER = { app: 320 } as const

export function QuestionModal({ open, questions, onAnswer, onDismiss, source, layer = DIALOG_LAYER.app }: QuestionModalProps): JSX.Element | null {
  if (!open) return null
  return (
    <QuestionDialog
      key={questions.map((q) => q.question).join('|')}
      questions={questions}
      onAnswer={onAnswer}
      onDismiss={onDismiss}
      source={source}
      layer={layer}
    />
  )
}

export default QuestionModal

// G4 검수 차단 B2 — 열린 질문 창의 쌓임 순서. 창마다 window keydown을 듣지만 키(숫자·Enter·Esc·화살표)는 맨 위 창 하나만 받는다.
// G4 확인 검수 — 맨 위는 화면 겹침으로 정한다. 순서는 ① 펼친 창이 내려둔 창(알약)보다 위 ② 층(layer)이 높은 창이 위
// ③ 같은 층에서는 나중에 열거나 펼친 창이 위다. 내려둔 창끼리는 나중에 내려둔 창이 아래다. 그래서 맨 위가 내려둔 창이면 모두 내려둔 것이다.
// ①이 ②보다 먼저인 까닭: 높은 층의 창을 내려두면 화면에 펼쳐진 것은 낮은 층의 창이다 — 키와 Esc가 보이는 창에 가야 한다.
interface StackEntry { layer: number; order: number; minimized: boolean }
const dialogStack = new Map<symbol, StackEntry>()
let raiseSeq = 0
let lowerSeq = 0
const stackPlace = (t: symbol, layer: number, minimized: boolean): void => {
  dialogStack.set(t, { layer, minimized, order: minimized ? --lowerSeq : ++raiseSeq })
}
const stackRemove = (t: symbol): void => { dialogStack.delete(t) }
const above = (a: StackEntry, b: StackEntry): boolean =>
  a.minimized !== b.minimized ? !a.minimized : a.layer !== b.layer ? a.layer > b.layer : a.order > b.order
const isTopDialog = (t: symbol): boolean => {
  const me = dialogStack.get(t)
  if (!me) return false
  for (const [other, e] of dialogStack) if (other !== t && above(e, me)) return false
  return true
}
// M11 G4(설계 감사 22) — 펼친 질문 창은 모달 층에 오른다. 그 층이 Esc를 받으면 질문 창끼리의 맨 위(위 순서)를 내려둔다
const minimizers = new Map<symbol, () => void>()
const minimizeTopQuestion = (): void => {
  for (const [t, minimize] of minimizers) if (isTopDialog(t)) { minimize(); return }
}
const dismissers = new Map<symbol, () => void>()
const dismissTopQuestion = (): void => {
  for (const [t, dismiss] of dismissers) if (isTopDialog(t)) { dismiss(); return }
}

function QuestionDialog({
  questions,
  onAnswer,
  onDismiss,
  source,
  layer,
}: {
  questions: AgentQuestion[]
  onAnswer: (answers: string[][]) => void
  onDismiss: () => void
  source?: string
  layer: number
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

  const [token] = useState(() => Symbol('question-dialog'))
  // 마운트 때 그 층의 맨 위에 올리고 내릴 때 뺀다. 펼침·내려두기는 아래 효과가 순서를 옮긴다.
  const layerRef = useRef(layer)
  layerRef.current = layer
  useEffect(() => {
    stackPlace(token, layerRef.current, false)
    return () => stackRemove(token)
  }, [token])
  const firstLayout = useRef(true)
  useEffect(() => {
    if (firstLayout.current) { firstLayout.current = false; return }
    stackPlace(token, layerRef.current, minimized)
  }, [minimized, token])
  // 층이 바뀌면(같은 창이 다른 겹침으로 옮겨지면) 순서는 그대로 두고 층만 고친다
  useEffect(() => {
    const e = dialogStack.get(token)
    if (e && e.layer !== layer) dialogStack.set(token, { ...e, layer })
  }, [layer, token])

  useEffect(() => {
    if (!minimized) modalRef.current?.focus()
  }, [minimized])

  useEffect(() => {
    if (other[step]) customRef.current?.focus()
  }, [other, step])

  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss
  useEffect(() => {
    minimizers.set(token, () => setMinimized(true))
    return () => { minimizers.delete(token) }
  }, [token])
  useEffect(() => {
    if (!minimized) return
    dismissers.set(token, () => onDismissRef.current())
    return () => { dismissers.delete(token) }
  }, [token, minimized])
  // 펼친 창은 모달 층, 내려둔 알약은 곁 층이다. 알약은 모달이나 나중에 내려간 알약이 있으면 Esc를 양보한다(M05 Backlog 49)
  useModalLayer(!minimized, minimizeTopQuestion)
  useModalLayer(minimized, dismissTopQuestion, 'aside')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!isTopDialog(token) || minimized || e.key === 'Escape') return
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
      // 답 키(Enter·숫자)는 반복 입력을 받지 않는다 — 답하자마자 다음 질문 창이 같은 자리에 뜰 수 있어서
      // 길게 누른 키가 다음 질문에 들어가면 안 된다(G9b 재검수 경미 3). 사람의 한 번 누름 의미는 그대로다.
      if (e.repeat) return
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
            {source ? `${source} · ` : ''}
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
          {source && <span className="qm-step-count qm-source">{source}</span>}
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
