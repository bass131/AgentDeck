import { memo, useState, useEffect, useRef, type CSSProperties, type JSX } from 'react'
import {
  IconChevDown,
  IconShieldChk,
  IconClipList,
  IconCheckCirc,
  IconBolt,
  IconAlert,
  IconCheck,
  IconCode,
  IconTerminal,
} from '../../../components/common/icons'
import type { PickerState } from '../../../lib/multiAgentSampleData'
import {
  MODELS,
  MODES,
  effortPickerFor,
  type ModelOption,
  type EffortOption,
  type ModeOption,
} from '../../../lib/pickerOptions'

const MODE_ICONS = {
  shield: IconShieldChk,
  plan: IconClipList,
  check: IconCheckCirc,
  bolt: IconBolt,
  warn: IconAlert,
} as const

type ModeIconKey = keyof typeof MODE_ICONS

function ModeIc({ iconKey, size = 14 }: { iconKey?: ModeIconKey; size?: number }): JSX.Element | null {
  if (!iconKey) return null
  const C = MODE_ICONS[iconKey]
  return <C size={size} />
}

type PickOption = ModelOption | EffortOption | ModeOption

function isModeOption(o: PickOption): o is ModeOption {
  return 'icon' in o
}

function isModelOption(o: PickOption): o is ModelOption {
  return 'ctx' in o
}

interface PickerProps {
  ariaLabel: string
  caption: string
  options: PickOption[]
  value: string
  onChange: (id: string) => void
  align?: 'left' | 'right'
  icons?: boolean
  dots?: boolean
  title?: string
  note?: string
  disabled?: boolean
}

const Picker = memo(function Picker({
  ariaLabel,
  caption,
  options,
  value,
  onChange,
  align = 'left',
  icons,
  dots,
  title,
  note,
  disabled,
}: PickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const cur = options.find((o) => o.id === value) ?? options[0]
  const curMode = cur && isModeOption(cur) ? cur : null
  const curModel = cur && isModelOption(cur) ? cur : null

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
        className={`pick-btn${open ? ' active' : ''}${icons && curMode?.warn ? ' warnbtn' : ''}`}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {icons && curMode ? (
          <span className="pick-mode-ic" style={{ color: curMode.color } as CSSProperties}>
            <ModeIc iconKey={curMode.icon} size={14} />
          </span>
        ) : dots && curModel ? (
          <span className="pick-dot" style={{ background: curModel.color } as CSSProperties} />
        ) : null}
        <span className="pick-lbl">{caption}</span>
        <span className="pick-val">{cur?.label ?? ''}</span>
        <span className="pick-chev" aria-hidden="true">
          <IconChevDown size={12} />
        </span>
      </button>
      {open && (
        <div className={`pick-menu${align === 'right' ? ' right' : ''}`} role="listbox">
          <div className="pick-menu-h">{caption}</div>
          {options.map((o) => {
            const oMode = isModeOption(o) ? o : null
            const oModel = isModelOption(o) ? o : null
            return (
              <div key={o.id}>
                {oMode?.warn && <span className="pick-sep" />}
                <button
                  type="button"
                  className={`pick-opt${o.id === value ? ' on' : ''}${oMode?.warn ? ' warn' : ''}`}
                  role="option"
                  aria-selected={o.id === value}
                  onClick={() => {
                    onChange(o.id)
                    setOpen(false)
                  }}
                >
                  {icons && oMode && (
                    <span className="po-mode-ic" style={{ color: oMode.color } as CSSProperties}>
                      <ModeIc iconKey={oMode.icon} size={14} />
                    </span>
                  )}
                  {dots && (oMode?.warn
                    ? <IconAlert size={14} className="po-warn-ic" />
                    : oModel
                      ? <span className="po-dot" style={{ background: oModel.color } as CSSProperties} />
                      : null
                  )}
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
              </div>
            )
          })}
          {note && <div className="pick-menu-note">{note}</div>}
        </div>
      )}
    </div>
  )
})

export function UsagePill({ label, pct }: { label: string; pct: number | null }): JSX.Element {
  return (
    <span className="ma-usage">
      <span
        className="ma-usage-ring"
        style={{ ['--p' as string]: pct ?? 0 } as CSSProperties}
        aria-hidden="true"
      />
      <span className="ma-usage-label">{label}</span>
      <span className="ma-usage-pct">{pct != null ? `${pct}%` : '—'}</span>
    </span>
  )
}

interface RunPickersProps {
  picker: PickerState
  setPicker: (p: PickerState) => void
  orchestration: boolean
  setOrchestration: (v: boolean) => void
  replMode: boolean
  setReplMode: (v: boolean) => void
  replLit: boolean
}

export function RunPickers({
  picker,
  setPicker,
  orchestration,
  setOrchestration,
  replMode,
  setReplMode,
  replLit,
}: RunPickersProps): JSX.Element {
  const effortPicker = effortPickerFor(picker.model, picker.effort)
  const effortTitle = effortPicker.disabled
    ? '이 모델은 effort를 지원하지 않아요'
    : 'Effort는 새 대화(세션)부터 적용됩니다'
  const effortNote = effortPicker.disabled
    ? '이 모델은 effort를 지원하지 않아요.'
    : 'Effort는 세션 생성 시 고정돼요. 변경은 새 대화(세션)부터 적용돼요.'

  return (
    <div className="ma-p-pickers">
      <Picker
        ariaLabel="모델 선택"
        caption="모델"
        options={MODELS}
        value={picker.model}
        onChange={(id) => setPicker({ ...picker, model: id })}
        dots
        title="모델 변경은 진행 중 REPL 세션에 즉시 적용됩니다 (단발 모드는 새 대화부터)"
        note="REPL 세션 중 변경은 다음 응답부터 적용돼요. 전환 직후 첫 응답은 준비로 조금 느릴 수 있어요."
      />
      <Picker
        ariaLabel="Effort 선택"
        caption="Effort"
        options={effortPicker.options}
        value={effortPicker.displayValue}
        onChange={(id) => setPicker({ ...picker, effort: id })}
        disabled={effortPicker.disabled}
        title={effortTitle}
        note={effortNote}
      />
      <Picker
        ariaLabel="실행 모드 선택"
        caption="모드"
        options={MODES}
        value={picker.mode}
        onChange={(id) => setPicker({ ...picker, mode: id })}
        align="right"
        icons
        title="모드 변경은 진행 중 세션에 즉시 적용됩니다 (Bypass는 새 세션부터)"
        note="Bypass는 새 세션부터 적용돼요. 진행 중 세션은 라이브 전환되지 않아요."
      />
      <button
        type="button"
        className={`pick-btn orch-toggle${orchestration ? ' orch-on' : ''}`}
        aria-pressed={orchestration}
        aria-label="UltraCode 모드 토글"
        title={orchestration ? 'UltraCode ON — 병렬 오케스트레이션 실행' : 'UltraCode OFF — 클릭해서 활성화'}
        onClick={() => setOrchestration(!orchestration)}
      >
        <span className="toggle-chip" aria-hidden>
          <IconCode size={11} />
        </span>
        <span className="pick-lbl">UltraCode</span>
        <span className="orch-badge">{orchestration ? 'ON' : 'OFF'}</span>
      </button>
      <button
        type="button"
        className={`pick-btn repl-toggle${replLit ? ' repl-lit' : ''}`}
        aria-pressed={replMode}
        aria-label="REPL 지속세션 모드 토글"
        title={
          replMode
            ? 'REPL 지속세션 모드 — 켜짐(클릭하여 단발 모드로)'
            : '단발 모드 — 매 전송마다 새 세션(클릭하여 REPL로)'
        }
        onClick={() => setReplMode(!replMode)}
      >
        <span className="toggle-chip" aria-hidden>
          <IconTerminal size={11} />
        </span>
        <span className="pick-lbl">REPL</span>
        <span className="orch-badge">{replMode ? 'ON' : 'OFF'}</span>
      </button>
    </div>
  )
}
