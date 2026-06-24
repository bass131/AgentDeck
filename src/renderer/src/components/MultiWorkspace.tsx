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
 * M3 영속: 멀티 워크스페이스 복원/저장.
 * - B4 picker 리프팅: picker 상태를 MultiWorkspace per-slot state로 끌어올림.
 *   PanelView는 picker/setPicker props를 수용한다.
 * - B3 race 게이트: restoredRef — 마운트 첫 effect에서 multiSessionLoad() async,
 *   복원 setState 후 restoredRef=true. 저장 effect는 restoredRef===true일 때만 발화.
 * - 마운트 복원: load된 활성 세션 → count/패널메타(title/cwd/picker/sysPrompt)/thread 복원.
 * - 디바운스 저장(≥500ms): restored 이후 변경 시 multiSessionSave(buildPersistState()).
 * - sysPrompt 배선(M2): 패널 sysPrompt → 영속 + session.send({sysPrompt}) 전달.
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
import { usePanelSession, snapshotForPersist, type PanelSessionHookResult } from '../store/panelSession'
import { useAppStore, selectWorkspaceRoot } from '../store/appStore'
import { CmdResultCard } from './CmdResultCard'
import { OrchestrationCard } from './OrchestrationCard'
import { calcGauge } from '../lib/gaugeCalc'
import type { PersistedMultiState, PersistedPanel } from '../../../shared/ipc-contract'
import './MultiWorkspace.css'

// ── AgentStatus 실데이터 매핑 헬퍼 ────────────────────────────────────────────

type LiveStatus = 'idle' | 'running' | 'done' | 'error'

function liveStatus(session: PanelSessionHookResult): LiveStatus {
  // Phase A-2: thread가 단일 소스 — 콘텐츠 유무는 thread로 판정.
  const { isRunning, errorMessage, thread } = session.state
  if (isRunning) return 'running'
  if (errorMessage) return 'error'
  if (thread.length > 0) return 'done'
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
  /**
   * B4 picker 리프팅 — picker 상태를 MultiWorkspace per-slot state에서 관리.
   * picker/setPicker가 제공되면 외부 상태를 사용하고,
   * 제공되지 않으면 로컬 state를 폴백으로 사용한다(하위호환).
   */
  picker?: PickerState
  setPicker?: (p: PickerState) => void
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
  picker: pickerProp,
  setPicker: setPickerProp,
}: PanelViewProps): JSX.Element {
  // B4: picker를 props(리프팅)에서 받거나, 없으면 로컬 state 폴백(하위호환)
  const [localPicker, setLocalPicker] = useState<PickerState>({ ...DEFAULT_PICKER })
  const picker = pickerProp ?? localPicker
  const setPicker = setPickerProp ?? setLocalPicker

  // 실데이터 상태 — session에서 파생
  const status = LIVE_STATUS_META[liveStatus(session)]
  const cwdLabel = workspaceRoot ? basename(workspaceRoot) : (panel.cwd ? basename(panel.cwd) : '폴더 선택')

  // 컨텍스트 게이지: 실 usage + lastContextWindow
  const gauge = calcGauge(session.state.lastUsage, picker.model, session.state.lastContextWindow)
  const ctxPct = gauge.pct

  // Phase A-2 + M6: thread 기반으로 이행 (패널은 msg/cmdresult 표시 — 도구카드 미표시 유지)
  const { thread, isRunning, errorMessage } = session.state
  // M6 + Phase 37 #4b(B-2): orchestration 포함 (msg+cmdresult+orchestration)
  const threadMsgs = thread.filter(
    (item): item is Extract<typeof item, { kind: 'msg' | 'cmdresult' | 'orchestration' }> =>
      item.kind === 'msg' || item.kind === 'cmdresult' || item.kind === 'orchestration'
  )
  // 마지막 assistant msg가 live streaming 버블인지 판단 (M6: cmdresult 카드는 제외)
  const lastItem = thread[thread.length - 1]
  const lastIsLiveAssistant = lastItem &&
    lastItem.kind === 'msg' &&
    lastItem.role === 'assistant' &&
    isRunning
  const hasContent = thread.length > 0 || !!errorMessage
  const isDisabled = workspaceRoot === null

  const handleSend = useCallback((text: string) => {
    // M3 sysPrompt 배선(M2 연계): panel.sysPrompt → session.send() opts.sysPrompt 전달.
    // CRITICAL(신뢰경계): string만 운반 — SDK 형상은 backend 내부 처리(ADR-003).
    void session.send(text, {
      picker,
      workspaceRoot: workspaceRoot ?? undefined,
      ...(panel.sysPrompt ? { sysPrompt: panel.sysPrompt } : {}),
    })
  }, [session, picker, workspaceRoot, panel.sysPrompt])

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
              {/* Phase A-2 + M6 + #4b(B-2): thread의 msg/cmdresult/orchestration 항목 렌더 (도구카드 미표시 유지) */}
              {threadMsgs.map((item, idx) => {
                if (item.kind === 'cmdresult') {
                  return (
                    <CmdResultCard
                      key={item.id}
                      id={item.id}
                      name={item.name}
                      title={item.title}
                      sub={item.sub}
                      running={item.running}
                      failed={item.failed}
                      time={item.time}
                    />
                  )
                }
                if (item.kind === 'orchestration') {
                  return (
                    <OrchestrationCard
                      key={item.id}
                      id={item.id}
                      name={item.name}
                      description={item.description}
                      phases={item.phases}
                      running={item.running}
                      failed={item.failed}
                      result={item.result}
                      script={item.script}
                      time={item.time}
                    />
                  )
                }
                // msg 렌더
                const isLastMsg = idx === threadMsgs.length - 1
                const isStreaming = isLastMsg && item.role === 'assistant' && isRunning && !!lastIsLiveAssistant
                return (
                  <MessageBubble
                    key={item.id}
                    role={item.role}
                    content={item.text}
                    streaming={isStreaming}
                  />
                )
              })}
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

/** M3: 패널 메타 실데이터 (영속 복원 우선, SAMPLE 폴백) */
interface PanelMeta {
  title: string
  cwd?: string
  sysPrompt?: string
}

/** M3: 6개 picker 초기값 (DEFAULT_PICKER 복사, 리프팅용) */
function makeDefaultPickers(): PickerState[] {
  return Array.from({ length: 6 }, () => ({ ...DEFAULT_PICKER }))
}

/** 기본 패널 메타 (first-run용 — 빈 값). 사용자 요청: 멀티 패널에 세션별 네이밍/
 *  프롬프트가 미리 채워지지 않도록. title='' → 렌더 시 '새 작업' 폴백, cwd=전역
 *  workspaceRoot 폴백, sysPrompt 미주입(데모 프롬프트가 에이전트 동작에 새지 않게).
 *  SAMPLE_PANELS는 패널 개수(6)만 유지하는 데 사용. */
function makeDefaultPanelMetas(): PanelMeta[] {
  return SAMPLE_PANELS.map(() => ({
    title: '',
    cwd: undefined,
    sysPrompt: undefined,
  }))
}

export function MultiWorkspace(): JSX.Element {
  // ── 6개 고정 훅 (원본 s0~s5 미러) ────────────────────────────────────────
  // CRITICAL: React 훅 규칙 — 조건/루프/함수 내부 호출 금지.
  // count(2~6) 표시와 무관하게 6훅 상주. MultiWorkspace가 마운트된 동안만 활성.
  // M3: makePanelInitialState() — 마운트 시 빈 초기상태. 복원은 effect에서 setState.
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

  // B4: picker를 MultiWorkspace per-slot state로 끌어올림 (리프팅)
  // 이전: PanelView 로컬 useState — buildPersistState에서 수집 불가.
  // 이후: 이 배열로 관리 → buildPersistState가 picker 수집 가능.
  const [pickers, setPickers] = useState<PickerState[]>(makeDefaultPickers)

  // M3: 패널 메타 (title/cwd/sysPrompt) — 복원 실데이터 우선, SAMPLE 폴백
  const [panelMetas, setPanelMetas] = useState<PanelMeta[]>(makeDefaultPanelMetas)

  // M3: 패널별 cwd 상태 — panelMetas[slot].cwd + 런타임 선택 우선
  const [panelCwds, setPanelCwds] = useState<Record<number, string | null>>({})

  // B3: 복원/저장 race 게이트
  // restoredRef: false → 마운트 첫 effect에서 load 완료 후 true.
  // 저장 effect는 restoredRef.current===true일 때만 발화 → 빈 초기상태가 복원본 덮어쓰기 차단.
  const restoredRef = useRef(false)

  // 디바운스 타이머 ref
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── M3: 마운트 복원 effect ────────────────────────────────────────────────
  // CRITICAL: window.api.multiSessionLoad() IPC 경유 — fs 직접 호출 0.
  // B3: 이 effect가 완료된 후 restoredRef=true → 저장 effect 허가.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await window.api.multiSessionLoad()
        if (cancelled) return

        if (res.state && res.state.version === 2 && res.state.sessions.length > 0) {
          const activeSession = res.state.sessions.find(
            (s) => s.id === res.state!.activeSessionId
          ) ?? res.state.sessions[0]

          // count 복원 (2~6 범위 클램핑)
          const restoredCount = Math.min(Math.max(activeSession.count, 2), 6)
          setCount(restoredCount)

          // 패널 메타 복원 (실데이터 우선)
          const restoredMetas = makeDefaultPanelMetas()
          const restoredPickersArr = makeDefaultPickers()
          const restoredCwds: Record<number, string | null> = {}

          activeSession.panels.forEach((panel: PersistedPanel, i: number) => {
            if (i >= 6) return
            restoredMetas[i] = {
              title: panel.title,
              cwd: panel.cwd,
              sysPrompt: panel.sysPrompt,
            }
            restoredPickersArr[i] = {
              model: panel.picker.model,
              effort: panel.picker.effort,
              mode: panel.picker.mode,
            }
            if (panel.cwd) {
              // CRITICAL: 복원된 cwd는 main이 재검증한 값(B2) → 신뢰 가능
              restoredCwds[i] = panel.cwd
            }
          })

          setPanelMetas(restoredMetas)
          setPickers(restoredPickersArr)
          setPanelCwds(restoredCwds)

          // M3 thread 복원 배선: 각 패널 세션에 snapshot을 dispatch(RESTORE 액션).
          // usePanelSession().restore(snapshot) → panelReducer case 'RESTORE'
          //   → makePanelInitialState(snapshot) → thread 교체.
          // CRITICAL: shared reducer.ts 무변경 — panelSession 로컬 래퍼만 사용.
          // B5: seedCounter(seq + messages.length) → 복원 id < 미래 nextId() 보장.
          activeSession.panels.forEach((panel: PersistedPanel, i: number) => {
            if (i >= 6) return
            if (panel.snapshot && panel.snapshot.messages.length > 0) {
              sessions[i].restore(panel.snapshot)
            }
          })
        }
      } catch {
        // IPC 실패 graceful — 크래시 0, SAMPLE 폴백 유지
      } finally {
        if (!cancelled) {
          // B3: 복원 완료 → 저장 허가
          restoredRef.current = true
        }
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 마운트 1회만

  // ── M3: buildPersistState ─────────────────────────────────────────────────
  // 현재 멀티 워크스페이스 상태 → PersistedMultiState 직렬화.
  // B4: pickers 배열에서 각 slot picker 수집 가능(리프팅 결과).
  const buildPersistState = useCallback((): PersistedMultiState => {
    const panels: PersistedPanel[] = SLOTS.slice(0, 6).map((slot) => {
      const meta = panelMetas[slot] ?? { title: SAMPLE_PANELS[slot % SAMPLE_PANELS.length].title }
      const picker = pickers[slot] ?? DEFAULT_PICKER
      const sessionState = sessions[slot]?.state
      const snapshot = sessionState ? snapshotForPersist(sessionState) : undefined
      const hasSnapshot = snapshot && snapshot.messages.length > 0

      return {
        title: meta.title,
        ...(panelCwds[slot] != null ? { cwd: panelCwds[slot] as string } : meta.cwd ? { cwd: meta.cwd } : {}),
        picker: {
          model: picker.model,
          effort: picker.effort,
          mode: picker.mode,
        },
        ...(meta.sysPrompt ? { sysPrompt: meta.sysPrompt } : {}),
        ...(hasSnapshot ? { snapshot } : {}),
      }
    })

    const sessionId = 'main-session'
    return {
      version: 2,
      activeSessionId: sessionId,
      sessions: [{
        id: sessionId,
        count,
        panels,
      }],
    }
  // sessions는 훅 반환값(안정적 참조 아님) → 의존성 최소화
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, panelMetas, pickers, panelCwds, s0.state, s1.state, s2.state, s3.state, s4.state, s5.state])

  // ── M3: 디바운스 저장 effect ──────────────────────────────────────────────
  // B3: restoredRef.current===true일 때만 발화 → 복원 전 빈 상태 저장 차단.
  // 디바운스 ≥500ms — 매 키입력 저장 폭주 방지.
  useEffect(() => {
    if (!restoredRef.current) return

    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = setTimeout(() => {
      const state = buildPersistState()
      void window.api.multiSessionSave(state).catch(() => {
        // best-effort — 저장 실패해도 크래시 0
      })
    }, 500)

    return () => {
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current)
      }
    }
  }, [buildPersistState])

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

  const handlePickFolder = useCallback(async (slot: number): Promise<void> => {
    // CRITICAL: window.api.pickFolder(화이트리스트 IPC) 경유 — fs 직접 호출 0.
    try {
      const res = await window.api.pickFolder()
      if (res.path !== null) {
        setPanelCwds((prev) => ({ ...prev, [slot]: res.path }))
      }
    } catch {
      // IPC 실패 graceful 처리 — 컴포넌트 크래시 방지
    }
  }, [])

  // B4: picker setter per-slot
  const handleSetPicker = useCallback((slot: number, p: PickerState) => {
    setPickers((prev) => {
      const next = [...prev]
      next[slot] = p
      return next
    })
  }, [])

  // 패널 메타 (M3: 복원 실데이터 우선, SAMPLE 폴백)
  const panelAt = (slot: number): SamplePanel => {
    const meta = panelMetas[slot]
    const sampleBase = SAMPLE_PANELS[slot % SAMPLE_PANELS.length]
    return {
      ...sampleBase,
      title: meta?.title ?? sampleBase.title,
      cwd: meta?.cwd ?? sampleBase.cwd,
      sysPrompt: meta?.sysPrompt ?? sampleBase.sysPrompt,
    }
  }

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
            // 유효 cwd: 패널 개별 선택 우선, 없으면 복원 메타, 없으면 전역 기본
            const effectiveCwd = panelCwds[slot] ?? panelMetas[slot]?.cwd ?? workspaceRoot
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
                picker={pickers[slot]}
                setPicker={(p) => handleSetPicker(slot, p)}
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
              workspaceRoot={panelCwds[expandedSlot] ?? panelMetas[expandedSlot]?.cwd ?? workspaceRoot}
              expanded={true}
              onExpand={handleExpand}
              onPrompt={handlePrompt}
              onPickFolder={handlePickFolder}
              picker={pickers[expandedSlot]}
              setPicker={(p) => handleSetPicker(expandedSlot, p)}
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
          value={panelMetas[promptSlot]?.sysPrompt ?? ''}
          onSave={(text) => {
            // M3 sysPrompt 배선: 영속 상태(panelMetas)에 저장
            setPanelMetas((prev) => {
              const next = [...prev]
              next[promptSlot] = { ...next[promptSlot], sysPrompt: text }
              return next
            })
          }}
          onClose={() => setPromptSlot(null)}
        />
      )}
    </>
  )
}

export default MultiWorkspace
