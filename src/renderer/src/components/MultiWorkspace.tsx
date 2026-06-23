/**
 * MultiWorkspace.tsx — F13 멀티에이전트 워크스페이스 그리드.
 *
 * 원본 AgentCodeGUI MultiAgent.tsx L1324~1370 시각 셸 이식.
 * - MultiWorkspace: 헤더(count 탭 2~6) + 그리드(cols 가변) + 확장 오버레이
 * - PanelView: 패널 헤더/ctx/thread/footer(RunPickers+PanelComposer)
 * - 일괄 폴더 → FolderSwitchDialog(F11 재사용)
 * - 패널 프롬프트 → PromptModal(F11 재사용)
 *
 * M4-3 23e: 정적 샘플 → 패널별 usePanelSession() 실 실행 배선.
 * - 6개 고정 훅(원본 s0~s5 미러): React 훅 규칙 — 조건/루프 금지.
 * - PanelView session prop: messages/streamingText/isRunning/errorMessage/lastUsage.
 * - PanelComposer onSend(text): session.send(text, { picker, workspaceRoot }).
 * - cwd 게이팅: workspaceRoot=null → send 비활성.
 * - 전역 격리: subscribeAgentEvents/sendMessage(전역) 미호출.
 *
 * CRITICAL: renderer untrusted — fs/Node/require 직접 호출 0.
 * CRITICAL: 전역 appStore.sendMessage/subscribeAgentEvents 미사용 (패널 훅만).
 * 인라인 색상 0 (ctx-ring conic --p / grid gridTemplateColumns 동적 기하값 허용).
 */
import { memo, useState, useCallback, useEffect, useRef, type CSSProperties, type JSX } from 'react'
import {
  IconGrid,
  IconFolder,
  IconChevDown,
  IconCode,
  IconExpand,
  IconClose,
  IconSend,
  IconSquare,
  IconSpark,
  IconAlert,
  IconShieldChk,
  IconClipList,
  IconCheckCirc,
  IconBolt,
  IconCheck,
} from './icons'
import { FolderSwitchDialog } from './FolderSwitchDialog'
import { PromptModal } from './PromptModal'
import { MessageBubble } from './Conversation'
import {
  SAMPLE_PANELS,
  COLS,
  COUNT_OPTIONS,
  STATUS_META,
  DEFAULT_PICKER,
  SAMPLE_BATCH_TO,
  type PickerState,
  type SamplePanel,
} from '../lib/multiAgentSampleData'
import {
  MODELS,
  EFFORTS,
  MODES,
  type ModelOption,
  type EffortOption,
  type ModeOption,
} from '../lib/pickerOptions'
import { usePanelSession, type PanelSessionHookResult } from '../store/panelSession'
import { useAppStore, selectWorkspaceRoot } from '../store/appStore'
import { calcGauge } from '../lib/gaugeCalc'
import './MultiWorkspace.css'

// ── AgentStatus 실데이터 매핑 헬퍼 ────────────────────────────────────────────

type LiveStatus = 'idle' | 'running' | 'done' | 'error'

function liveStatus(session: PanelSessionHookResult): LiveStatus {
  const { isRunning, errorMessage, messages } = session.state
  if (isRunning) return 'running'
  if (errorMessage) return 'error'
  if (messages.length > 0) return 'done'
  return 'idle'
}

// LiveStatus → STATUS_META 매핑 (원본 STATUS_META 재사용)
const LIVE_STATUS_META: Record<LiveStatus, { label: string; cls: string }> = {
  idle:    STATUS_META.idle,
  running: STATUS_META.working,
  done:    STATUS_META.done,
  error:   STATUS_META.error,
}

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

const Picker = memo(function Picker({ ariaLabel, caption, options, value, onChange, align = 'left', icons, dots }: PickerProps): JSX.Element {
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

function UsagePill({ label, pct }: { label: string; pct: number | null }): JSX.Element {
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

// ── RunPickers (3개: 모델/effort/모드) ────────────────────────────────────

interface RunPickersProps {
  picker: PickerState
  setPicker: (p: PickerState) => void
}

function RunPickers({ picker, setPicker }: RunPickersProps): JSX.Element {
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
    </div>
  )
}

// ── PanelComposer ────────────────────────────────────────────────────────

interface PanelComposerProps {
  /** 전송 콜백 — 텍스트 인자 포함 (M4-3 23e 배선) */
  onSend: (text: string) => void
  /** 중단 콜백 (isRunning 시 stop 버튼) */
  onAbort?: () => void
  /** 실행 중 여부 — stop 버튼 표시 */
  isRunning?: boolean
  /** 비활성화 — workspaceRoot=null 시 send 차단 */
  disabled?: boolean
}

function PanelComposer({ onSend, onAbort, isRunning, disabled }: PanelComposerProps): JSX.Element {
  const [value, setValue] = useState('')

  const handleSend = useCallback(() => {
    if (disabled) return
    const text = value.trim()
    if (!text) return
    onSend(text)
    setValue('')
  }, [disabled, value, onSend])

  return (
    <div className="ma-p-composer">
      <div className="ma-p-composer-row">
        <button
          type="button"
          className="ma-attach"
          aria-label="파일 첨부"
          onClick={() => {/* no-op: 멀티패널 첨부 미지원(단일 모드 전용) */}}
        >
          {/* 첨부 아이콘 — 클립 형태의 아이콘 (IconImage 재사용) */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <textarea
          className="ma-composer-ta"
          placeholder="메시지를 입력하세요"
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (isRunning) {
                onAbort?.()
              } else {
                handleSend()
              }
            }
          }}
          aria-label="메시지 입력"
        />
        {isRunning ? (
          <button
            type="button"
            className="ma-send ma-stop"
            aria-label="중단"
            onClick={() => onAbort?.()}
          >
            <IconSquare size={14} />
          </button>
        ) : (
          <button
            type="button"
            className="ma-send"
            aria-label="전송"
            disabled={disabled}
            onClick={handleSend}
          >
            <IconSend size={14} />
          </button>
        )}
      </div>
      {disabled && (
        <div className="ma-composer-disabled-hint">
          워크스페이스를 열어야 에이전트를 실행할 수 있습니다
        </div>
      )}
    </div>
  )
}

// ── PanelView ────────────────────────────────────────────────────────────

interface PanelViewProps {
  slot: number
  panel: SamplePanel
  session: PanelSessionHookResult
  workspaceRoot: string | null
  expanded?: boolean
  onExpand: (slot: number) => void
  onPrompt: (slot: number) => void
  onPickFolder: (slot: number) => void | Promise<void>
}

function basename(p: string): string {
  const parts = p.split(/[\\/]+/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : p
}

export const PanelView = memo(function PanelView({
  slot,
  panel,
  session,
  workspaceRoot,
  expanded = false,
  onExpand,
  onPrompt,
  onPickFolder,
}: PanelViewProps): JSX.Element {
  const [picker, setPicker] = useState<PickerState>({ ...DEFAULT_PICKER })

  // 실데이터 상태 — session에서 파생
  const status = LIVE_STATUS_META[liveStatus(session)]
  const cwdLabel = workspaceRoot ? basename(workspaceRoot) : (panel.cwd ? basename(panel.cwd) : '폴더 선택')

  // 컨텍스트 게이지: 실 usage + lastContextWindow
  const gauge = calcGauge(session.state.lastUsage, picker.model, session.state.lastContextWindow)
  const ctxPct = gauge.pct

  const { messages, streamingText, isRunning, errorMessage } = session.state
  const hasContent = messages.length > 0 || streamingText.length > 0 || !!errorMessage
  const isDisabled = workspaceRoot === null

  const handleSend = useCallback((text: string) => {
    void session.send(text, {
      picker,
      workspaceRoot: workspaceRoot ?? undefined,
    })
  }, [session, picker, workspaceRoot])

  const handleAbort = useCallback(() => {
    void session.abort()
  }, [session])

  return (
    <div
      className={`ma-panel${expanded ? ' expanded' : ''}`}
      data-slot={slot}
    >
      {/* ── 패널 헤더 ── */}
      <div className="ma-p-head">
        <div className="ma-p-row1">
          <span className="ma-p-num">{slot + 1}</span>
          <span className={`ma-p-dot ${status.cls}`} />
          <span className="ma-p-title">{panel.title || '새 작업'}</span>
          <span className="ma-spacer" />
          {expanded && (
            <button
              type="button"
              className="ma-p-act"
              aria-label="닫기"
              onClick={() => onExpand(-1)}
            >
              <IconClose size={15} />
            </button>
          )}
          <span className={`ma-status ${status.cls}`}>
            <span>{status.label}</span>
          </span>
        </div>
        <div className="ma-p-row2">
          <button
            type="button"
            className="ma-p-folder"
            onClick={() => onPickFolder(slot)}
            title={workspaceRoot || panel.cwd || '작업 폴더 선택'}
          >
            <IconFolder size={13} />
            <span className="ma-p-folder-name">{cwdLabel}</span>
            <IconChevDown size={11} />
          </button>
          <button
            type="button"
            className={`ma-p-prompt${panel.sysPrompt ? ' on' : ''}`}
            onClick={() => onPrompt(slot)}
            title={panel.sysPrompt ? '프롬프트 설정됨' : '이 패널의 프롬프트 설정'}
          >
            <IconSpark size={11} stroke={2.4} />
            <span>프롬프트</span>
          </button>
        </div>
      </div>

      {/* ── 컨텍스트 게이지 ── */}
      <div className="ma-p-ctx">
        <span
          className="ma-ctx-ring"
          style={{ ['--p' as string]: ctxPct } as CSSProperties}
          aria-hidden="true"
        />
        <span className="ma-ctx-label">컨텍스트</span>
        <span className="ma-ctx-detail">{gauge.used.toLocaleString()} / {gauge.window >= 1_000_000 ? `${Math.round(gauge.window / 1_000_000)}M` : `${Math.round(gauge.window / 1_000)}K`} 토큰</span>
        <span className="ma-spacer" />
        <span className="ma-ctx-pct">{ctxPct}%</span>
      </div>

      {/* ── 패널 바디 ── */}
      <div className="ma-p-body">
        {!expanded && (
          <button
            type="button"
            className="ma-p-zoom"
            aria-label="크게 보기"
            onClick={() => onExpand(slot)}
          >
            <IconExpand size={13} />
            <span>크게 보기</span>
          </button>
        )}
        <div className="ma-p-thread scroll">
          {!hasContent ? (
            <div className="ma-p-empty">
              <div className="ma-p-empty-ic">
                <IconCode size={20} />
              </div>
              <div className="ma-p-empty-text">메시지를 입력해 작업을 시작하세요</div>
            </div>
          ) : (
            <div className="ma-p-messages">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
              ))}
              {/* 스트리밍 중 버블 */}
              {streamingText && (
                <MessageBubble role="assistant" content={streamingText} streaming />
              )}
              {/* 에러 표시 */}
              {errorMessage && !isRunning && (
                <div className="ma-p-error" role="alert">
                  오류: {errorMessage}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 패널 풋터: RunPickers + PanelComposer ── */}
      <div className="ma-p-foot">
        <RunPickers picker={picker} setPicker={setPicker} />
        <PanelComposer
          onSend={handleSend}
          onAbort={handleAbort}
          isRunning={isRunning}
          disabled={isDisabled}
        />
      </div>
    </div>
  )
})

// ── MultiWorkspace ────────────────────────────────────────────────────────

const SLOTS = [0, 1, 2, 3, 4, 5]

// 정적 사용량 (실 API=M4)
const USAGE_5H = 37
const USAGE_WEEKLY = 12

export function MultiWorkspace(): JSX.Element {
  // ── 6개 고정 훅 (원본 s0~s5 미러) ────────────────────────────────────────
  // CRITICAL: React 훅 규칙 — 조건/루프/함수 내부 호출 금지.
  // count(2~6) 표시와 무관하게 6훅 상주. MultiWorkspace가 마운트된 동안만 활성.
  const s0 = usePanelSession()
  const s1 = usePanelSession()
  const s2 = usePanelSession()
  const s3 = usePanelSession()
  const s4 = usePanelSession()
  const s5 = usePanelSession()
  const sessions = [s0, s1, s2, s3, s4, s5]

  // 워크스페이스 루트 — 패널 기본 cwd (null이면 send 비활성)
  const workspaceRoot = useAppStore(selectWorkspaceRoot)

  const [count, setCount] = useState(4)
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null)
  const [batchFolderOpen, setBatchFolderOpen] = useState(false)
  const [promptSlot, setPromptSlot] = useState<number | null>(null)
  // 패널별 sysPrompt 로컬 state
  const [sysPrompts, setSysPrompts] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {}
    SAMPLE_PANELS.forEach((p, i) => { if (p.sysPrompt) init[i] = p.sysPrompt })
    return init
  })

  const cols = COLS[count] ?? 2

  // Esc로 확장 패널 닫기
  useEffect(() => {
    if (expandedSlot === null) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setExpandedSlot(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expandedSlot])

  const handleExpand = useCallback((slot: number) => {
    setExpandedSlot(slot >= 0 ? slot : null)
  }, [])

  const handlePrompt = useCallback((slot: number) => {
    setPromptSlot(slot)
  }, [])

  // 패널별 cwd 상태 — panelCwds[slot] 있으면 전역 workspaceRoot보다 우선
  const [panelCwds, setPanelCwds] = useState<Record<number, string | null>>({})

  const handlePickFolder = useCallback(async (slot: number): Promise<void> => {
    // CRITICAL: window.api.pickFolder(화이트리스트 IPC) 경유 — fs 직접 호출 0.
    // 채널명 하드코딩 없음 — preload가 이미 IPC_CHANNELS.DIALOG_PICK_FOLDER로 바인딩.
    try {
      const res = await window.api.pickFolder()
      if (res.path !== null) {
        setPanelCwds((prev) => ({ ...prev, [slot]: res.path }))
      }
      // 취소(path=null)이면 state 변경 없음 — 기존 cwd 유지
    } catch {
      // IPC 실패 graceful 처리 — 컴포넌트 크래시 방지
    }
  }, [])

  const panelAt = (slot: number): SamplePanel => ({
    ...SAMPLE_PANELS[slot % SAMPLE_PANELS.length],
    sysPrompt: sysPrompts[slot] ?? SAMPLE_PANELS[slot % SAMPLE_PANELS.length].sysPrompt,
  })

  return (
    <>
      <section className="multi">
        {/* ── 헤더 ── */}
        <div className="ma-head">
          <span className="ma-head-ic" aria-hidden="true">
            <IconGrid size={17} />
          </span>
          <span className="ma-head-title">멀티 에이전트</span>
          <span className="ma-spacer" />
          <button
            type="button"
            className="ma-batch"
            title="모든 패널 작업 폴더 설정"
            onClick={() => setBatchFolderOpen(true)}
          >
            <IconFolder size={14} />
            <span>일괄 폴더</span>
            <IconChevDown size={11} />
          </button>
          <UsagePill label="5시간 한도" pct={USAGE_5H} />
          <UsagePill label="주간 한도" pct={USAGE_WEEKLY} />
          <div className="ma-count" role="tablist" aria-label="패널 수">
            {COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={count === n}
                className={`ma-count-btn${count === n ? ' on' : ''}`}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* ── 그리드 ── */}
        <div
          className="ma-grid scroll"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {SLOTS.slice(0, count).map((slot) => {
            // 유효 cwd: 패널 개별 선택 우선, 없으면 전역 기본
            const effectiveCwd = panelCwds[slot] ?? workspaceRoot
            return expandedSlot === slot ? (
              <div key={slot} className="ma-panel ma-placeholder" />
            ) : (
              <PanelView
                key={slot}
                slot={slot}
                panel={panelAt(slot)}
                session={sessions[slot]}
                workspaceRoot={effectiveCwd}
                expanded={false}
                onExpand={handleExpand}
                onPrompt={handlePrompt}
                onPickFolder={handlePickFolder}
              />
            )
          })}
        </div>
      </section>

      {/* ── 확장 오버레이 (백드롭은 .win-body 전체 덮음) ── */}
      {expandedSlot !== null && (
        <div
          className="ma-expand-overlay"
          onMouseDown={() => setExpandedSlot(null)}
          data-testid="ma-expand-overlay"
        >
          <div
            className="ma-expand-card"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <PanelView
              slot={expandedSlot}
              panel={panelAt(expandedSlot)}
              session={sessions[expandedSlot]}
              workspaceRoot={panelCwds[expandedSlot] ?? workspaceRoot}
              expanded={true}
              onExpand={handleExpand}
              onPrompt={handlePrompt}
              onPickFolder={handlePickFolder}
            />
          </div>
        </div>
      )}

      {/* ── 일괄 폴더 다이얼로그 (F11 재사용) ── */}
      {batchFolderOpen && (
        <FolderSwitchDialog
          from={SAMPLE_PANELS[0].cwd}
          to={SAMPLE_BATCH_TO}
          multi={true}
          onCancel={() => setBatchFolderOpen(false)}
          onConfirm={() => {
            // 일괄 폴더 확인: pickFolder IPC → 모든 패널 cwd 동일 설정
            // CRITICAL: window.api.pickFolder(화이트리스트 IPC) 경유 — fs 직접 호출 0.
            setBatchFolderOpen(false)
            void (async () => {
              try {
                const res = await window.api.pickFolder()
                if (res.path !== null) {
                  const batchCwds: Record<number, string | null> = {}
                  for (let i = 0; i < 6; i++) {
                    batchCwds[i] = res.path
                  }
                  setPanelCwds(batchCwds)
                }
              } catch {
                // IPC 실패 graceful 처리
              }
            })()
          }}
        />
      )}

      {/* ── 패널 프롬프트 모달 (F11 재사용) ── */}
      {promptSlot !== null && (
        <PromptModal
          target={panelAt(promptSlot).title || '새 작업'}
          scope={`패널 ${promptSlot + 1}에만 적용`}
          noun="패널"
          value={sysPrompts[promptSlot] ?? ''}
          onSave={(text) => {
            setSysPrompts((prev) => ({ ...prev, [promptSlot]: text }))
          }}
          onClose={() => setPromptSlot(null)}
        />
      )}
    </>
  )
}

export default MultiWorkspace
