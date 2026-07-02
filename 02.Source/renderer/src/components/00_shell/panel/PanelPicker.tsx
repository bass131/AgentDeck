/**
 * PanelPicker.tsx — 멀티워크스페이스 패널 피커 컴포넌트.
 *
 * 원본 MultiWorkspace.tsx에서 추출 (Phase 13 분해).
 * - Picker: 모델/effort/모드 드롭다운.
 * - UsagePill: OAuth 한도 게이지 배지.
 * - RunPickers: Picker 3개 + UltraCode/REPL 토글 묶음.
 *
 * CRITICAL: 인라인 색상 0 (CSS 변수 토큰만). glass/glow/gradient 금지(UI.md 안티슬롭).
 */
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
} from '../../common/icons'
import type { PickerState } from '../../../lib/multiAgentSampleData'
import {
  MODELS,
  EFFORTS,
  MODES,
  type ModelOption,
  type EffortOption,
  type ModeOption,
} from '../../../lib/pickerOptions'

// ── モード アイコン マップ ─────────────────────────────────────────────────────

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

// ── Picker (패널별 로컬 state, pickerOptions 공유) ──────────────────────────

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
  /** 드롭다운 정렬 — 좁은 패널에서 좌측 피커는 'left'(우측으로 펼침)로 사이드바 가림 방지 */
  align?: 'left' | 'right'
  /** true: 모드 아이콘 렌더 */
  icons?: boolean
  /** true: 컬러 도트 렌더 */
  dots?: boolean
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
        </div>
      )}
    </div>
  )
})

// ── UsagePill ────────────────────────────────────────────────────────────

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

// ── RunPickers (3개: 모델/effort/모드 + UltraCode 토글 + REPL 토글) ────────

interface RunPickersProps {
  picker: PickerState
  setPicker: (p: PickerState) => void
  /** UltraCode(오케스트레이션) 토글 상태 — ephemeral, 비영속 */
  orchestration: boolean
  setOrchestration: (v: boolean) => void
  /** Phase 5b: REPL 지속세션 모드 — 전역 store(패널 공통) */
  replMode: boolean
  setReplMode: (v: boolean) => void
  /** LR3-06: REPL 상태 표시등 점등 여부(resolveReplLit) — PanelView가 미리 판정해 전달. */
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
  return (
    <div className="ma-p-pickers">
      <Picker
        ariaLabel="모델 선택"
        caption="모델"
        options={MODELS}
        value={picker.model}
        onChange={(id) => setPicker({ ...picker, model: id })}
        dots
      />
      <Picker
        ariaLabel="Effort 선택"
        caption="Effort"
        options={EFFORTS}
        value={picker.effort}
        onChange={(id) => setPicker({ ...picker, effort: id })}
      />
      <Picker
        ariaLabel="실행 모드 선택"
        caption="모드"
        options={MODES}
        value={picker.mode}
        onChange={(id) => setPicker({ ...picker, mode: id })}
        align="right"
        icons
      />
      {/* UltraCode 토글 — 단일채팅 .orch-toggle/.orch-on/.orch-badge 클래스 재사용 */}
      <button
        type="button"
        className={`pick-btn orch-toggle${orchestration ? ' orch-on' : ''}`}
        aria-pressed={orchestration}
        aria-label="UltraCode 모드 토글"
        title={orchestration ? 'UltraCode ON — 병렬 오케스트레이션 실행' : 'UltraCode OFF — 클릭해서 활성화'}
        onClick={() => setOrchestration(!orchestration)}
      >
        {/* 아이콘 칩(영호 시안 2026-07-03) — 단일채팅 ComposerBar와 동형 */}
        <span className="toggle-chip" aria-hidden>
          <IconCode size={11} />
        </span>
        <span className="pick-lbl">UltraCode</span>
        <span className="orch-badge">{orchestration ? 'ON' : 'OFF'}</span>
      </button>
      {/* LR3-06(영호 조정 2026-07-03): REPL 상태 표시등 — 전역 store(패널 공통). 단일채팅
          .repl-toggle 패턴 재활용(UltraCode .orch-toggle과 분리). 점등(repl-lit)은 이제
          replMode 자체(ON=상시 점등, 활동 무관) — 금색 pulse 연출은 Composer.css 공유. */}
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
        {/* 아이콘 칩(영호 시안 2026-07-03) — 단일채팅 ComposerBar와 동형 */}
        <span className="toggle-chip" aria-hidden>
          <IconTerminal size={11} />
        </span>
        <span className="pick-lbl">REPL</span>
        <span className="orch-badge">{replMode ? 'ON' : 'OFF'}</span>
      </button>
    </div>
  )
}
