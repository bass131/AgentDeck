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
  /**
   * GAP1 P02(I-03, semantics b): 트리거 버튼 네이티브 title(hover 툴팁). 모델 피커가
   * "모델 변경은 새 대화(세션)부터 적용" 안내에 사용 — REPL 지속세션(ADR-024) 중에는
   * held-open 세션 재사용 경로가 req.model을 무시하기 때문(agent-runs.ts, renderer 밖
   * — main/agent-backend 변경은 이번 위임 범위 밖).
   */
  title?: string
  /** GAP1 P02: 드롭다운 메뉴 하단 안내 문구(펼쳤을 때만 노출 — 상시 UI 자리 차지 0). */
  note?: string
  /**
   * LM1 P07: true면 트리거 버튼 비활성(effort 미지원 모델 게이팅 등). 항목은 숨기지
   * 않는다 — 발견성·레이아웃 불변(영호 확정 ②). 네이티브 `disabled`라 클릭이 애초에
   * 발화하지 않아 별도 열림 방지 로직이 불필요하다.
   */
  disabled?: boolean
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
          {note && <div className="pick-menu-note">{note}</div>}
        </div>
      )}
    </div>
  )
})
