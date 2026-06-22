/**
 * Composer.tsx — 리치 컴포저 (F3-02 시각 골격).
 *
 * textarea + 하단 바(이미지 첨부[시각] · 모델/Effort/모드 피커[로컬 선택] · send)
 * + 컨텍스트 게이지 3종(정적 placeholder).
 *
 * ⚠️ 경계(F3 시각 vs M4 실동작):
 *   - 피커 선택은 *로컬 상태*만 — 백엔드/agentRun 인자 미변경(모델 전환=M4).
 *   - 게이지는 *정적 리터럴*(0/1M·—) — store lastUsage/토큰 계산 미참조(B8=M4).
 *   - 첨부 아이콘은 시각만(no-op) — 실제 첨부=M4. 슬래시/@멘션/큐=M4.
 *
 * CRITICAL: 윈도우/IPC 직접 호출 0. send/abort는 부모(Conversation) 콜백 경유.
 * 인라인 색상 0(게이지 conic의 동적 --p 변수 제외).
 */
import { memo, useEffect, useRef, useState, type JSX } from 'react'
import { IconImage, IconArrowUp, IconChevDown, IconCheck } from './icons'
import './Composer.css'

// ── Picker (재사용 드롭다운) ───────────────────────────────────────────────────

interface PickOption {
  id: string
  label: string
  desc?: string
}

interface PickerProps {
  /** 트리거 aria-label (예: "모델 선택") */
  ariaLabel: string
  /** 작은 라벨 (예: "모델") */
  caption: string
  options: PickOption[]
  value: string
  onChange: (id: string) => void
  align?: 'left' | 'right'
}

const Picker = memo(function Picker({ ariaLabel, caption, options, value, onChange, align = 'left' }: PickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const cur = options.find((o) => o.id === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="pick" ref={ref}>
      <button
        type="button"
        className={`pick-btn${open ? ' active' : ''}`}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="pick-lbl">{caption}</span>
        <span className="pick-val">{cur.label}</span>
        <span className="pick-chev" aria-hidden="true">
          <IconChevDown size={12} />
        </span>
      </button>
      {open && (
        <div className={`pick-menu${align === 'right' ? ' right' : ''}`} role="listbox">
          <div className="pick-menu-h">{caption}</div>
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`pick-opt${o.id === value ? ' on' : ''}`}
              role="option"
              aria-selected={o.id === value}
              onClick={() => {
                onChange(o.id)
                setOpen(false)
              }}
            >
              <span className="po-text">
                <span className="po-main">{o.label}</span>
                {o.desc && <span className="po-desc">{o.desc}</span>}
              </span>
              {o.id === value && (
                <span className="po-check" aria-hidden="true">
                  <IconCheck size={15} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})

// ── ContextStrip (정적 게이지 — placeholder) ──────────────────────────────────

const GAUGES: { label: string; pct: number; detail: string }[] = [
  { label: '현재 컨텍스트', pct: 0, detail: '0 / 1M 토큰' },
  { label: '5시간 한도', pct: 0, detail: '—' },
  { label: '주간 한도', pct: 0, detail: '—' },
]

const ContextStrip = memo(function ContextStrip(): JSX.Element {
  return (
    <div className="ctx-strip">
      {GAUGES.map((g) => (
        <div className="ctx-chip" key={g.label}>
          <span className="cc-ring" style={{ ['--p' as string]: g.pct }} aria-hidden="true" />
          <span className="cc-text">
            <span className="cc-top">
              <span className="cc-label">{g.label}</span>
              <span className="cc-pct">{g.pct}%</span>
            </span>
            <span className="cc-detail">{g.detail}</span>
          </span>
        </div>
      ))}
    </div>
  )
})

// ── Composer ───────────────────────────────────────────────────────────────────

const MODELS: PickOption[] = [
  { id: 'opus', label: 'Opus 4.8', desc: '최고 성능' },
  { id: 'sonnet', label: 'Sonnet 4.6', desc: '균형' },
  { id: 'haiku', label: 'Haiku 4.5', desc: '빠름' },
]
const EFFORTS: PickOption[] = [
  { id: 'low', label: '낮음' },
  { id: 'mid', label: '중간' },
  { id: 'high', label: '높음' },
  { id: 'max', label: '매우 높음' },
]
const MODES: PickOption[] = [
  { id: 'auto', label: '자동', desc: '권한 자동 판단' },
  { id: 'plan', label: '계획', desc: '먼저 계획' },
  { id: 'accept', label: '수락', desc: '편집 자동 수락' },
]

export interface ComposerProps {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onAbort: () => void
  isRunning: boolean
}

function ComposerInner({ value, onChange, onSend, onAbort, isRunning }: ComposerProps): JSX.Element {
  // 피커 로컬 선택(시각만 — 백엔드 미반영, M4)
  const [model, setModel] = useState('opus')
  const [effort, setEffort] = useState('max')
  const [mode, setMode] = useState('auto')

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="composer-wrap">
      <div className="composer-inner">
        <ContextStrip />
        <div className="composer">
          <textarea
            className="composer-ta"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="오늘 어떤 도움을 드릴까요?"
            rows={1}
            disabled={isRunning}
            aria-label="메시지 입력"
          />
          <div className="composer-bar">
            <button type="button" className="cm-icon" aria-label="이미지 첨부" title="이미지 첨부 (준비 중)">
              <IconImage size={16} />
            </button>
            <Picker ariaLabel="모델 선택" caption="모델" options={MODELS} value={model} onChange={setModel} />
            <span className="pick-div" aria-hidden="true" />
            <Picker ariaLabel="Effort 선택" caption="Effort" options={EFFORTS} value={effort} onChange={setEffort} />
            <span className="pick-div" aria-hidden="true" />
            <Picker ariaLabel="모드 선택" caption="모드" options={MODES} value={mode} onChange={setMode} align="right" />
            <span className="cm-spacer" />
            {isRunning ? (
              <button type="button" className="send stop" aria-label="실행 중단" onClick={onAbort}>
                <span className="send-stop-sq" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className="send"
                aria-label="전송"
                disabled={!value.trim()}
                onClick={onSend}
              >
                <IconArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export const Composer = memo(ComposerInner)
export default Composer
