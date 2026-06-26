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
import { memo, useState, useCallback, useEffect, useRef, type CSSProperties, type JSX, type ChangeEvent } from 'react'
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
  IconSearch,
  IconChevRight,
  IconBook,
} from './icons'
import { FolderSwitchDialog } from './FolderSwitchDialog'
import { PromptModal } from './PromptModal'
import { MessageBubble } from './Conversation'
import { FileBadge } from './FileBadge'
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
import { useAppStore, selectWorkspaceRoot, selectProjectFiles, selectActiveMultiSessionId, selectUsage, selectReplMode, computeTaskScope } from '../store/appStore'
import type { AttachedImage } from '../store/appStore'
import { filesToAttachedImages } from '../lib/imageAttach'
import { CmdResultCard } from './CmdResultCard'
import { OrchestrationCard } from './OrchestrationCard'
import { SubAgentInline } from './SubAgentInline'
import { SubAgentFullscreen } from './SubAgentFullscreen'
import { LoopIndicator } from './LoopIndicator'
import { isLoopCommand, parseLoopCommand, decideLoopTick, type ActiveLoop } from '../lib/loopCommand'
import { calcGauge } from '../lib/gaugeCalc'
import type { PersistedMultiState, PersistedPanel } from '../../../shared/ipc-contract'
import { useInputPalettes } from '../hooks/useInputPalettes'
import './MultiWorkspace.css'
import './Composer.css'

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

// ── RunPickers (3개: 모델/effort/모드 + UltraCode 토글) ───────────────────

interface RunPickersProps {
  picker: PickerState
  setPicker: (p: PickerState) => void
  /** UltraCode(오케스트레이션) 토글 상태 — ephemeral, 비영속 */
  orchestration: boolean
  setOrchestration: (v: boolean) => void
}

function RunPickers({ picker, setPicker, orchestration, setOrchestration }: RunPickersProps): JSX.Element {
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
        <span className="pick-lbl">UltraCode</span>
        <span className="orch-badge">{orchestration ? 'ON' : 'OFF'}</span>
      </button>
    </div>
  )
}

// ── PanelComposer ────────────────────────────────────────────────────────

interface PanelComposerProps {
  /** 전송 콜백 — 텍스트 + 이미지 인자 (패널 이미지 첨부) */
  onSend: (text: string, images?: AttachedImage[]) => void
  /** 중단 콜백 (isRunning 시 stop 버튼) */
  onAbort?: () => void
  /** 실행 중 여부 — stop 버튼 표시 */
  isRunning?: boolean
  /** 비활성화 — workspaceRoot=null 시 send 차단 */
  disabled?: boolean
  /**
   * 실 프로젝트 파일 목록 (@멘션 팔레트 — workspaceRoot 기반).
   * store.selectProjectFiles → PanelView → prop으로 전달.
   * 기본 [] — 미주입 시 팔레트 항목 없음(동작 유지).
   */
  mentionFiles?: string[]
  /**
   * 현재 워크스페이스 루트 (슬래시 IPC 캐시 키).
   * 기본 null.
   */
  workspaceRoot?: string | null
  /**
   * 셸식 입력 히스토리 (이 패널의 user 메시지 오래된→최신).
   * 기본 [] — 미주입 시 히스토리 비활성.
   */
  history?: string[]
}

function PanelComposer({
  onSend,
  onAbort,
  isRunning = false,
  disabled = false,
  mentionFiles = [],
  workspaceRoot,
  history = [],
}: PanelComposerProps): JSX.Element {
  const [value, setValue] = useState('')
  const [caret, setCaret] = useState(0)
  const [images, setImages] = useState<AttachedImage[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleChange = useCallback((v: string) => {
    setValue(v)
  }, [])

  // ── 공용 팔레트 훅 ────────────────────────────────────────────────────────
  const palettes = useInputPalettes({
    value,
    caret,
    mentionFiles,
    workspaceRoot,
    history,
    isRunning,
    onChange: handleChange,
  })

  // 이미지 파일 input change 핸들러: 선택된 파일을 AttachedImage[]로 변환 후 state append
  const handleFileInputChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    // input value 리셋 (동일 파일 재선택 허용)
    e.target.value = ''
    const added = await filesToAttachedImages(files)
    if (added.length > 0) {
      setImages((prev) => [...prev, ...added])
    }
  }, [])

  // 이미지 붙여넣기 핸들러 (단일모드 Composer.tsx L821-831 미러)
  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items ?? [])
    const imageFiles = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null)
    if (imageFiles.length > 0) {
      e.preventDefault() // 스크린샷이 텍스트로 붙여넣기되지 않도록
      const added = await filesToAttachedImages(imageFiles)
      if (added.length > 0) {
        setImages((prev) => [...prev, ...added])
      }
    }
  }, [])

  // 이미지 드롭 핸들러 (단일모드 Composer.tsx L919-927 미러)
  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length === 0) return
    const added = await filesToAttachedImages(files)
    if (added.length > 0) {
      setImages((prev) => [...prev, ...added])
    }
  }, [])

  const handleSend = useCallback(() => {
    if (disabled) return
    const text = value.trim()
    // 이미지 단독 전송 허용: 텍스트도 없고 이미지도 없으면 전송 차단
    if (!text && images.length === 0) return
    onSend(text, images.length > 0 ? images : undefined)
    setValue('')
    setCaret(0)
    setImages([])
    palettes.history.resetHistIdx()
  }, [disabled, value, images, onSend, palettes.history])

  return (
    <div className="ma-p-composer">
      {/* ── 숨김 file input (이미지 첨부 picker) ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* ── 슬래시 팔레트 ── */}
      {palettes.slash.open && (
        <div className="slash-menu scroll" role="listbox">
          {palettes.slash.cmdHits.length > 0 && <div className="slash-sec">명령어</div>}
          {palettes.slash.cmdHits.map((c, i) => (
            <button
              key={'cmd:' + c.scope + ':' + c.name}
              type="button"
              role="option"
              aria-selected={i === palettes.slash.safeSlashIdx}
              className={'slash-opt' + (i === palettes.slash.safeSlashIdx ? ' on' : '')}
              onMouseEnter={() => palettes.slash.setSlashIdx(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                palettes.slash.pick(c.name)
              }}
            >
              <span className="slash-ic">
                <IconBolt size={15} />
              </span>
              <span className="slash-name">{c.name}</span>
              {c.argHint && <span className="slash-arg-hint">{c.argHint}</span>}
              {(c.scope === 'user' || c.scope === 'project') && (
                <span className="slash-scope-badge">{c.scope}</span>
              )}
              <span className="slash-desc">{c.description}</span>
            </button>
          ))}
          {palettes.slash.skillHits.length > 0 && <div className="slash-sec">스킬</div>}
          {palettes.slash.skillHits.map((s, i) => {
            const gi = palettes.slash.cmdHits.length + i
            return (
              <button
                key={'skill:' + s.scope + ':' + s.name}
                type="button"
                role="option"
                aria-selected={gi === palettes.slash.safeSlashIdx}
                className={'slash-opt' + (gi === palettes.slash.safeSlashIdx ? ' on' : '')}
                onMouseEnter={() => palettes.slash.setSlashIdx(gi)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  palettes.slash.pick(s.name)
                }}
              >
                <span className="slash-ic skill">
                  <IconBook size={15} />
                </span>
                <span className="slash-name">{s.name}</span>
                <span className="slash-desc">{s.description ?? '설명이 없습니다.'}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── @멘션 팔레트 ── */}
      {palettes.mention.open && (
        <div className="slash-menu scroll" role="listbox">
          <div className="slash-sec mention-loc">
            {palettes.mention.mode === 'browse' ? (
              <>
                <IconFolder size={11} />
                <span>{palettes.mention.locText || '루트'}</span>
              </>
            ) : (
              <>
                <IconSearch size={11} />
                <span>{palettes.mention.locText || '루트'}</span>
              </>
            )}
          </div>
          {palettes.mention.mentionHits.map((e, i) => (
            <button
              key={e.kind + ':' + e.full}
              type="button"
              role="option"
              aria-selected={i === palettes.mention.safeMentionIdx}
              className={'slash-opt' + (i === palettes.mention.safeMentionIdx ? ' on' : '')}
              onMouseEnter={() => palettes.mention.setMentionIdx(i)}
              onMouseDown={(ev) => {
                ev.preventDefault()
                palettes.mention.pick(e)
              }}
            >
              {e.kind === 'dir' ? (
                <>
                  <span className="slash-ic folder">
                    <IconFolder size={16} />
                  </span>
                  <span className="slash-name">{e.name}</span>
                  <span className="slash-desc into">
                    <IconChevRight size={15} />
                  </span>
                </>
              ) : (
                <>
                  <span className="slash-ic ft">
                    <FileBadge path={e.full} size={22} />
                  </span>
                  <span className="slash-name path">{e.name}</span>
                  {e.dir !== undefined && (
                    <span className="slash-desc">{e.dir ? e.dir.replace(/\/$/, '') : '루트'}</span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── 이미지 썸네일 스트립 (단일모드 Composer.tsx L1055-1080 미러) ── */}
      {images.length > 0 && (
        <div className="img-tray">
          {images.map((img, i) => (
            <div className="img-thumb" key={img.dataUrl + i}>
              <button
                type="button"
                className="img-thumb-open"
                aria-label={`첨부 이미지 ${i + 1}`}
                title={`첨부 이미지 ${i + 1}`}
              >
                <img src={img.dataUrl} alt={`첨부 이미지 ${i + 1}`} draggable={false} />
              </button>
              <button
                type="button"
                className="img-thumb-x"
                aria-label="제거"
                onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <span className="img-thumb-x-ic" aria-hidden="true">×</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className="ma-p-composer-row"
        onDragOver={(e) => {
          if (!Array.from(e.dataTransfer.items ?? []).some((it) => it.kind === 'file')) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={(e) => {
          if (!Array.from(e.dataTransfer.items ?? []).some((it) => it.kind === 'file')) return
          void handleDrop(e)
        }}
      >
        <button
          type="button"
          className="ma-attach"
          aria-label="이미지 첨부"
          onClick={() => fileInputRef.current?.click()}
        >
          {/* 첨부 아이콘 — 클립 형태 */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <textarea
          ref={inputRef}
          className="ma-composer-ta"
          placeholder="메시지를 입력하세요"
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const sel = e.target.selectionStart ?? e.target.value.length
            setCaret(sel)
            palettes.onValueChange(e.target.value, sel)
          }}
          onSelect={(e) => {
            setCaret(e.currentTarget.selectionStart ?? 0)
          }}
          onKeyDown={(e) => {
            // 팔레트 키 처리 먼저 — 가로채면 handled=true
            const handled = palettes.handlePaletteKey(e, inputRef)
            if (handled) return
            // Enter 전송 (슬래시/멘션 팔레트 닫힘 상태)
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (isRunning) {
                onAbort?.()
              } else {
                handleSend()
              }
            }
          }}
          onPaste={handlePaste}
          onFocus={palettes.onFocus}
          onBlur={palettes.onBlur}
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
            disabled={disabled || (!value.trim() && images.length === 0)}
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
  /**
   * 실 프로젝트 파일 목록 (@멘션 팔레트 — workspaceRoot 기반).
   * store.selectProjectFiles → MultiWorkspace → PanelView → PanelComposer.
   * 기본 [] — 미주입 시 팔레트 항목 없음.
   */
  mentionFiles?: string[]
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
  mentionFiles = [],
}: PanelViewProps): JSX.Element {
  // B4: picker를 props(리프팅)에서 받거나, 없으면 로컬 state 폴백(하위호환)
  const [localPicker, setLocalPicker] = useState<PickerState>({ ...DEFAULT_PICKER })
  const picker = pickerProp ?? localPicker
  const setPicker = setPickerProp ?? setLocalPicker

  // UltraCode 토글 — ephemeral(비영속). buildPersistState/multiStore 미포함.
  const [orchestration, setOrchestration] = useState(false)

  // Phase 5a(ADR-024): REPL 기본 모드(전역 토글). ON이면 패널 send도 persistent +
  // 패널별 안정 sessionKey(슬롯 기반) → cron-turn이 같은 패널로 라우팅. /loop는 SDK 통과.
  const replMode = useAppStore(selectReplMode)
  const activeMultiSessionId = useAppStore(selectActiveMultiSessionId)
  const panelSessionKey = `multi:${activeMultiSessionId ?? 'm'}:slot:${slot}`

  // 실데이터 상태 — session에서 파생
  const status = LIVE_STATUS_META[liveStatus(session)]
  const cwdLabel = workspaceRoot ? basename(workspaceRoot) : (panel.cwd ? basename(panel.cwd) : '폴더 선택')

  // 컨텍스트 게이지: 실 usage + lastContextWindow
  const gauge = calcGauge(session.state.lastUsage, picker.model, session.state.lastContextWindow)
  const ctxPct = gauge.pct

  // Phase A-2 + M6: thread 기반으로 이행 (패널은 msg/cmdresult 표시 — 도구카드 미표시 유지)
  const { thread, isRunning, errorMessage } = session.state
  // B2: 패널 작업 범위(파일·도구 수) — 실데이터(session.state changedFiles + thread) 파생.
  const panelScope = computeTaskScope(session.state)
  // M6 + Phase 37 #4b(B-2) + F-G: orchestration·subagent 포함 (멀티 패널엔 우측 패널이 없어
  // 서브에이전트를 채팅 인라인으로 표시 — 단일과 공통)
  const threadMsgs = thread.filter(
    (item): item is Extract<typeof item, { kind: 'msg' | 'cmdresult' | 'orchestration' | 'subagent' }> =>
      item.kind === 'msg' || item.kind === 'cmdresult' || item.kind === 'orchestration' || item.kind === 'subagent'
  )
  // F-G/F-E: 패널별 서브에이전트 데이터(session.state.subagents) + 상세(라이브 id 조회)
  const panelSubagents = session.state.subagents
  const [openedSubId, setOpenedSubId] = useState<string | null>(null)
  // 마지막 assistant msg가 live streaming 버블인지 판단 (M6: cmdresult 카드는 제외)
  const lastItem = thread[thread.length - 1]
  const lastIsLiveAssistant = lastItem &&
    lastItem.kind === 'msg' &&
    lastItem.role === 'assistant' &&
    isRunning
  const hasContent = thread.length > 0 || !!errorMessage
  const isDisabled = workspaceRoot === null

  // B9: 입력 히스토리 파생 — thread의 user 메시지 텍스트(오래된→최신, 빈 텍스트 제외).
  // 단방향: thread → 파생 → PanelComposer history prop → 훅. 신규 IPC/영속 0.
  // 타입: kind==='msg'로 좁힌 후 role==='user' 필터 (Extract<ThreadItem,{kind:'msg'}> 패턴)
  const panelHistory = thread
    .filter((item): item is Extract<typeof item, { kind: 'msg' }> => item.kind === 'msg')
    .filter((item) => item.role === 'user')
    .map((item) => item.text)
    .filter((t) => t.trim().length > 0)

  // ── 앱 레벨 /loop (패널 로컬 — usePanelSession 격리 정합, panelReducer 무관) ──
  // CRITICAL(Q2): 루프 상태를 패널 컴포넌트 로컬에 둬 패널 간 격리 보장. reducer 순수성 무관.
  const [activeLoop, setActiveLoop] = useState<ActiveLoop | null>(null)
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevRunningRef = useRef(isRunning)

  // sendNow: 실제 session.send (루프 틱·일반 전송 공통). pickerOverride=루프 캡처 피커.
  const sendNow = useCallback((text: string, imgs?: AttachedImage[], pickerOverride?: { model: string; effort: string; mode: string }) => {
    // M3 sysPrompt 배선(M2 연계): panel.sysPrompt → session.send() opts.sysPrompt 전달.
    // CRITICAL(신뢰경계): string만 운반 — SDK 형상은 backend 내부 처리(ADR-003).
    // orchestration: 엔진중립 boolean — 'Workflow' 리터럴 0. renderer는 boolean 전달만(ADR-003).
    void session.send(text, {
      picker: pickerOverride ?? picker,
      workspaceRoot: workspaceRoot ?? undefined,
      ...(panel.sysPrompt ? { sysPrompt: panel.sysPrompt } : {}),
      ...(orchestration ? { orchestration: true } : {}),
      ...(imgs && imgs.length > 0 ? { images: imgs } : {}),
      // Phase 5a(ADR-024): replMode ON → persistent + 패널별 sessionKey(단발 토글 OFF면 미포함).
      ...(replMode ? { persistent: true, sessionKey: panelSessionKey } : {}),
    })
    // 단발성(one-shot): 전송 후 UltraCode 자동 OFF — 단일 모드 Composer와 동일.
    if (orchestration) setOrchestration(false)
  }, [session, picker, workspaceRoot, panel.sysPrompt, orchestration, replMode, panelSessionKey])

  const handleSend = useCallback((text: string, imgs?: AttachedImage[]) => {
    // 🔴#1: /loop 최상단 인터셉트 — SDK로 안 보내고 패널이 직접 반복(드라이버 docs/LOOP_SUPPORT.md).
    // Phase 5a(ADR-024): replMode ON이면 인터셉트 건너뜀 → /loop가 SDK로 통과(Claude 자기제어).
    //   단발 모드(replMode OFF)에선 SDK 세션이 닫혀 크론 소멸하므로 기존 앱 레벨 인터셉트 유지(폴백).
    if (isLoopCommand(text) && !replMode) {
      const cmd = parseLoopCommand(text)
      if (cmd.kind === 'stop') {
        setActiveLoop(null) // 정지(타이머는 정리 effect가 clearTimeout)
        return
      }
      if (cmd.kind === 'invalid') return
      const loopPicker = { model: picker.model, effort: picker.effort, mode: picker.mode }
      setActiveLoop({ prompt: cmd.prompt, intervalMs: cmd.intervalMs, picker: loopPicker, tickCount: 1, status: 'running', startedAt: Date.now() })
      sendNow(cmd.prompt, imgs) // 첫 틱 즉시
      return
    }
    sendNow(text, imgs)
  }, [sendNow, picker, replMode])

  const handleAbort = useCallback(() => {
    setActiveLoop(null) // 🔴#3: abort = 루프도 해제(타이머 정리 effect가 clearTimeout)
    void session.abort()
  }, [session])

  // ── 루프 틱 스케줄 (busy→idle 전이) — 패널엔 큐 없음 → 바로 틱 ──────────────
  useEffect(() => {
    const was = prevRunningRef.current
    prevRunningRef.current = isRunning
    if (isRunning || !was) return // busy→idle 전이일 때만
    const decision = decideLoopTick(activeLoop, Date.now())
    if (decision.action === 'halt') {
      setActiveLoop((l) => (l ? { ...l, status: 'stopped', stopReason: decision.reason } : l))
      return
    }
    if (decision.action === 'schedule' && activeLoop) {
      const { prompt, picker: lp } = activeLoop
      loopTimerRef.current = setTimeout(() => {
        setActiveLoop((l) => (l ? { ...l, tickCount: l.tickCount + 1 } : l))
        sendNow(prompt, undefined, lp)
      }, decision.intervalMs)
    }
  }, [isRunning, activeLoop, sendNow])

  // ── 루프 타이머 정리 (🔴#3): 정지/언마운트 시 대기 중 setTimeout 취소 ──────────
  useEffect(() => {
    if (!activeLoop || activeLoop.status !== 'running') {
      if (loopTimerRef.current) {
        clearTimeout(loopTimerRef.current)
        loopTimerRef.current = null
      }
    }
    return () => {
      if (loopTimerRef.current) {
        clearTimeout(loopTimerRef.current)
        loopTimerRef.current = null
      }
    }
  }, [activeLoop])

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

      {/* B2: 작업 범위 요약 1줄 (파일·도구 수) — 실데이터 있을 때만 */}
      {(panelScope.fileCount > 0 || panelScope.toolCount > 0) && (
        <div className="ma-p-scope" aria-label="작업 범위">
          <span className="ma-p-scope-item">파일 {panelScope.fileCount}</span>
          <span className="ma-p-scope-sep" aria-hidden="true">·</span>
          <span className="ma-p-scope-item">도구 {panelScope.toolCount}</span>
        </div>
      )}

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
                      livePhases={item.livePhases}
                      agents={item.agents}
                      liveSummary={item.liveSummary}
                    />
                  )
                }
                if (item.kind === 'subagent') {
                  // F-G: 멀티 패널 채팅 인라인 서브에이전트 — 패널 session.state.subagents에서 라이브 조회.
                  return (
                    <SubAgentInline
                      key={item.id}
                      agent={panelSubagents.find((sa) => sa.id === item.id)}
                      onOpen={setOpenedSubId}
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
                    images={item.images}
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
        <RunPickers
          picker={picker}
          setPicker={setPicker}
          orchestration={orchestration}
          setOrchestration={setOrchestration}
        />
        {activeLoop && (
          <LoopIndicator
            loop={activeLoop}
            onStop={() => setActiveLoop(null)}
            onDismiss={() => setActiveLoop(null)}
          />
        )}
        <PanelComposer
          onSend={handleSend}
          onAbort={handleAbort}
          isRunning={isRunning}
          disabled={isDisabled}
          mentionFiles={mentionFiles}
          workspaceRoot={workspaceRoot}
          history={panelHistory}
        />
      </div>

      {/* F-E: 멀티 패널 인라인 서브에이전트 클릭 → 라이브 상세(패널 session.state에서 id 조회) */}
      <SubAgentFullscreen
        agent={openedSubId ? (panelSubagents.find((sa) => sa.id === openedSubId) ?? null) : null}
        onClose={() => setOpenedSubId(null)}
      />
    </div>
  )
})

// ── MultiWorkspace ────────────────────────────────────────────────────────

const SLOTS = [0, 1, 2, 3, 4, 5]

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
  // 프로젝트 파일 목록 (@멘션 팔레트용) — 전역 store에서 구독
  const projectFiles = useAppStore(selectProjectFiles)
  // 2단계: 활성 멀티세션 ID — store가 소유(truth). MultiWorkspace는 key로 재마운트됨.
  // CRITICAL: 단방향 — store.activeMultiSessionId → key → 재마운트 → 마운트 load.
  // MultiWorkspace가 activeId의 truth가 아님(store 소유).
  const activeMultiSessionId = useAppStore(selectActiveMultiSessionId)

  // B8 실배선: OAuth 레이트리밋 게이지(5시간/주간) — 단일채팅과 동일 store.usage 구독.
  // CRITICAL(신뢰경계): renderer는 window.api.getUsage(화이트리스트)만 호출 — fs/Node 직접 0.
  // 토큰/시크릿 미포함, pct·resetsAt 파생값만(ipc-contract UsageInfo).
  const usage = useAppStore(selectUsage)
  const loadUsage = useAppStore((s) => s.loadUsage)

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
  // 2단계: key 재마운트로 항상 새 인스턴스 → restoredRef가 깨끗이 false에서 시작.
  const restoredRef = useRef(false)

  // 디바운스 타이머 ref (언마운트 flush에서 사용)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // buildActiveSession 최신 참조 — 언마운트 flush용 (클로저 stale 방지)
  const buildActiveSessionRef = useRef<(() => import('../../../shared/ipc-contract').PersistedMultiSession) | null>(null)

  // ── B8 실배선: usage 게이지 로드 ────────────────────────────────────────────
  // 마운트 시 1회 + 어느 패널이든 run 완료(running true→false) 전이 시 재로드.
  // 원본 App.tsx L233-238(단일채팅) 미러 — 멀티는 6패널 중 하나라도 끝나면 갱신.
  // loadUsage 내부 catch-and-ignore → IPC 실패 시 이전 게이지 유지.
  useEffect(() => {
    void loadUsage()
  }, [loadUsage])

  const anyRunning = sessions.some((s) => s.state.isRunning)
  const prevAnyRunningRef = useRef(false)
  useEffect(() => {
    // 실행 중(true) → 종료(false) 전이에서만 재로드 (원본 done/error 전이 미러)
    if (prevAnyRunningRef.current && !anyRunning) {
      void loadUsage()
    }
    prevAnyRunningRef.current = anyRunning
  }, [anyRunning, loadUsage])

  // ── M3/2단계: 마운트 복원 effect ────────────────────────────────────────────
  // CRITICAL: window.api.multiSessionLoad() IPC 경유 — fs 직접 호출 0.
  // B3: 이 effect가 완료된 후 restoredRef=true → 저장 effect 허가.
  // 2단계: store.activeMultiSessionId 우선 사용(없으면 첫/디스크activeSessionId 폴백).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await window.api.multiSessionLoad()
        if (cancelled) return

        if (res.state && res.state.version === 2 && res.state.sessions.length > 0) {
          // 2단계: store.activeMultiSessionId로 세션 선택(없으면 디스크 activeSessionId 폴백)
          const preferredId = activeMultiSessionId || res.state.activeSessionId
          const activeSession =
            res.state.sessions.find((s) => s.id === preferredId) ??
            res.state.sessions.find((s) => s.id === res.state!.activeSessionId) ??
            res.state.sessions[0]

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
  }, []) // 마운트 1회만 (key 재마운트로 새 인스턴스 보장)

  // ── 2단계: buildActiveSession ─────────────────────────────────────────────
  // 활성 세션 하나의 PersistedMultiSession만 생성 (RMW upsert용).
  // id = 현재 activeMultiSessionId (store 소유). title은 RMW에서 디스크값 보존.
  // B4: pickers 배열에서 각 slot picker 수집 가능(리프팅 결과).
  const buildActiveSession = useCallback((): import('../../../shared/ipc-contract').PersistedMultiSession => {
    const panels: PersistedPanel[] = SLOTS.slice(0, 6).map((slot) => {
      const meta = panelMetas[slot] ?? { title: '' }
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

    // 활성 세션 ID: store 소유(truth). 빈 문자열이면 그대로 '' 반환.
    // performRmwSave 가드(!activeSession.id)가 빈 id 저장을 차단함.
    return {
      id: activeMultiSessionId,
      // title: RMW에서 디스크의 기존 title 보존 (buildActiveSession은 title 미포함)
      count,
      panels,
    }
  // sessions는 훅 반환값(안정적 참조 아님) → 의존성 최소화
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMultiSessionId, count, panelMetas, pickers, panelCwds, s0.state, s1.state, s2.state, s3.state, s4.state, s5.state])

  // buildActiveSessionRef 항상 최신값 유지 (언마운트 flush에서 stale 클로저 방지)
  buildActiveSessionRef.current = buildActiveSession

  // ── 2단계: RMW save 헬퍼 ─────────────────────────────────────────────────
  // async RMW: 디스크 read → 활성 세션 upsert → write.
  // upsert: id 일치 세션 교체, 없으면 append. 나머지 세션 보존.
  // title: 디스크의 기존 세션 title 보존(renameMultiSession이 RMW로 기록한 값).
  // disk null/빈 → 활성 세션만으로 새로 생성(graceful first-run).
  // CRITICAL: window.api 경유만 — fs/Node 직접 0.
  const performRmwSave = useCallback(async (activeSession: import('../../../shared/ipc-contract').PersistedMultiSession): Promise<void> => {
    // 방어 가드 1: activeSession.id가 빈 문자열이면 no-op.
    // 부트 직후 loadMultiSessions 완료 전 multi 진입 시 id='' → 유령 'main-session' append 차단.
    if (!activeSession.id) return
    // 방어 가드 2: window.api 미목/미존재 환경에서 unhandled rejection 방지.
    // 테스트에서 multiSessionLoad/Save mock이 없으면 조용히 no-op.
    if (
      typeof window?.api?.multiSessionLoad !== 'function' ||
      typeof window?.api?.multiSessionSave !== 'function'
    ) return
    try {
      const disk = await window.api.multiSessionLoad()
      const existingSessions = disk.state?.sessions ?? []
      const activeId = activeSession.id

      // upsert: 기존 세션 목록에서 id 일치하면 교체, 없으면 append
      // title 보존: 디스크의 기존 title 사용(rename이 기록한 값)
      const existingForId = existingSessions.find((s) => s.id === activeId)
      const mergedSession = {
        ...activeSession,
        // title: 디스크 기존값 우선(rename 보존), 없으면 현재값(or '')
        title: existingForId?.title ?? activeSession.title ?? '',
      }

      let merged: import('../../../shared/ipc-contract').PersistedMultiSession[]
      const idx = existingSessions.findIndex((s) => s.id === activeId)
      if (idx >= 0) {
        merged = existingSessions.map((s, i) => (i === idx ? mergedSession : s))
      } else {
        merged = [...existingSessions, mergedSession]
      }

      const newState: PersistedMultiState = {
        version: 2,
        activeSessionId: activeId,
        sessions: merged,
      }

      await window.api.multiSessionSave(newState)
    } catch {
      // best-effort — 저장 실패해도 크래시 0
    }
  }, []) // 의존성 없음: IPC 경유만, 인자로 주입

  // ── M3/2단계: 디바운스 저장 effect ──────────────────────────────────────────
  // B3: restoredRef.current===true일 때만 발화 → 복원 전 빈 상태 저장 차단.
  // 디바운스 ≥500ms — 매 키입력 저장 폭주 방지.
  // 2단계: async RMW save (다른 세션 보존).
  // 언마운트 flush: cleanup에서 pending 타이머가 있으면 즉시 RMW save 발화(fire-and-forget).
  //   key 재마운트(세션 전환)로 언마운트 시 미저장 변경 보존. best-effort, 크래시 0.
  useEffect(() => {
    if (!restoredRef.current) return
    // 유령 세션 방지: activeMultiSessionId 빈 문자열이면 save 차단.
    // 부트 직후 loadMultiSessions 완료 전 multi 진입 시 id='' → 유령 append 차단.
    if (!activeMultiSessionId) return

    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current)
    }

    const activeSession = buildActiveSession()
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void performRmwSave(activeSession).catch(() => {
        // best-effort — performRmwSave 내부 try/catch와 이중 안전
      })
    }, 500)

    return () => {
      // 언마운트 flush: pending 타이머가 있으면 즉시 RMW save (fire-and-forget)
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
        // 최신 buildActiveSession 사용(ref에서 얻음 — stale 클로저 방지)
        const latest = buildActiveSessionRef.current
        if (latest) {
          void performRmwSave(latest()).catch(() => {
            // best-effort — 언마운트 flush 실패해도 크래시/미처리거부 0
          })
        }
      }
    }
  }, [buildActiveSession, performRmwSave])

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

  // 패널 메타 (M3: 복원 실데이터 우선 — SAMPLE 데이터 참조 0)
  const panelAt = (slot: number): SamplePanel => {
    const meta = panelMetas[slot]
    return {
      title: meta?.title ?? '',
      status: 'idle',
      cwd: meta?.cwd ?? '',
      ctxPct: 0,
      sysPrompt: meta?.sysPrompt,
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
          <UsagePill label="5시간 한도" pct={usage.fiveHour?.pct ?? null} />
          <UsagePill label="주간 한도" pct={usage.weekly?.pct ?? null} />
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
                mentionFiles={projectFiles}
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
              mentionFiles={projectFiles}
            />
          </div>
        </div>
      )}

      {/* ── 일괄 폴더 다이얼로그 (F11 재사용) ── */}
      {batchFolderOpen && (
        <FolderSwitchDialog
          from={''}
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
