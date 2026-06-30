/**
 * ComposerPicker.tsx — Composer 전용 피커 드롭다운 컴포넌트.
 *
 * Composer.tsx Phase 14 분해: Picker + ModeIc + 유틸 타입을 별도 파일로 추출.
 * ModelOption·EffortOption·ModeOption 세 종류 옵션을 단일 컴포넌트로 처리.
 * 색은 CSS 변수 토큰 — 인라인 색상 금지(UI.md).
 */
import { memo, useState, useEffect, useRef, type JSX, type CSSProperties } from 'react'
import {
  IconChevDown,
  IconCheck,
  IconAlert,
} from '../common/icons'
import {
  type ModelOption,
  type EffortOption,
  type ModeOption,
} from '../../lib/pickerOptions'
import {
  IconShieldChk,
  IconClipList,
  IconCheckCirc,
  IconBolt,
} from '../common/icons'

// ── 모드 아이콘 맵 ────────────────────────────────────────────────────────────

const MODE_ICONS = {
  shield: IconShieldChk,
  plan: IconClipList,
  check: IconCheckCirc,
  bolt: IconBolt,
  warn: IconAlert,
} as const

type ModeIconKey = keyof typeof MODE_ICONS

export function ModeIc({ iconKey, size = 14 }: { iconKey?: ModeIconKey; size?: number }): JSX.Element | null {
  if (!iconKey) return null
  const C = MODE_ICONS[iconKey]
  return <C size={size} />
}

// ── 타입 유틸 ─────────────────────────────────────────────────────────────────

export type PickOption = ModelOption | EffortOption | ModeOption

export function isModeOption(o: PickOption): o is ModeOption {
  return 'icon' in o
}
export function isModelOption(o: PickOption): o is ModelOption {
  return 'ctx' in o
}

// ── Picker 드롭다운 ───────────────────────────────────────────────────────────

interface PickerProps {
  ariaLabel: string
  caption: string
  options: PickOption[]
  value: string
  onChange: (id: string) => void
  align?: 'left' | 'right'
  /** true: 모드 아이콘 렌더 */
  icons?: boolean
  /** true: 컬러 도트 렌더 */
  dots?: boolean
}

export const Picker = memo(function Picker({
  ariaLabel,
  caption,
  options,
  value,
  onChange,
  align = 'left',
  icons,
  dots,
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
        <span className="pick-val">{cur.label}</span>
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
                  {dots &&
                    (oMode?.warn ? (
                      <IconAlert size={14} className="po-warn-ic" />
                    ) : oModel ? (
                      <span className="po-dot" style={{ background: oModel.color } as CSSProperties} />
                    ) : null)}
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
        </div>
      )}
    </div>
  )
})
