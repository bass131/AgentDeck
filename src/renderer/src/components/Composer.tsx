/**
 * Composer.tsx — 리치 컴포저 (F9 웨이브).
 *
 * F3-02 기반 위에 F9 리치 트레이 추가:
 *   - 슬래시 커맨드 메뉴 (/) + @멘션 팔레트
 *   - 이미지 첨부 트레이 (로컬 state, 샘플 썸네일)
 *   - 드롭 힌트 (dragOver 오버레이)
 *   - 예약 큐 스트립 (sched, queued prop)
 *   - placeholder 3-상태 (isRunning / hasStarted / 신규)
 *
 * CRITICAL: window.api 호출 0. 실행/해석/저장/드레인=M4.
 * 인라인 색상 0(썸네일 data URL은 CSP img-src data: 허용).
 */
import { memo, useEffect, useRef, useState, useCallback, type JSX, type CSSProperties } from 'react'
import {
  IconImage,
  IconArrowUp,
  IconChevDown,
  IconCheck,
  IconFolder,
  IconSearch,
  IconChevRight,
  IconClock,
  IconAlert,
  IconShieldChk,
  IconClipList,
  IconCheckCirc,
  IconBolt,
} from './icons'
import { FileBadge } from './FileBadge'
import {
  SLASH_COMMANDS,
  SAMPLE_SKILLS,
  SAMPLE_THUMB_DATA_URL,
} from '../lib/composerSampleData'
import { mentionEntries } from '../lib/mentions'
import type { MentionEntry } from '../lib/mentions'
import {
  MODELS,
  EFFORTS,
  MODES,
  DEFAULT_MODEL,
  DEFAULT_EFFORT,
  DEFAULT_MODE_SINGLE,
  type ModelOption,
  type EffortOption,
  type ModeOption,
} from '../lib/pickerOptions'
import { calcGauge } from '../lib/gaugeCalc'
import type { TokenUsage } from '../../../shared/agent-events'
import './Composer.css'

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

// ── Picker (재사용 드롭다운) — ModelOption / EffortOption / ModeOption 지원 ──

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

// ── ContextStrip (M4-1: 첫 게이지를 실 usage로 연결) ─────────────────────────

interface ContextStripProps {
  /** 마지막 run usage (done 이벤트 수신 후 채워짐) */
  lastUsage?: TokenUsage
  /** 현재 선택된 모델 id (컨텍스트 윈도우 분모) */
  selectedModel?: string
  /**
   * SDK가 보고한 실 컨텍스트 윈도우 크기(Phase 21c).
   * 양수일 때 MODEL_CONTEXT_WINDOW 룩업보다 우선 적용.
   * 미전달 시 기존 modelId 룩업 동작 유지(하위호환).
   */
  lastContextWindow?: number
}

const ContextStrip = memo(function ContextStrip({ lastUsage, selectedModel, lastContextWindow }: ContextStripProps): JSX.Element {
  // Phase 21c: lastContextWindow 우선, 없으면 modelId 룩업 fallback
  const gauge = calcGauge(lastUsage, selectedModel, lastContextWindow)
  const winK = gauge.window >= 1_000_000
    ? `${gauge.window / 1_000_000}M`
    : `${gauge.window / 1_000}K`
  const usedK = gauge.used >= 1_000_000
    ? `${(gauge.used / 1_000_000).toFixed(2)}M`
    : gauge.used >= 1_000
      ? `${Math.round(gauge.used / 1_000)}K`
      : String(gauge.used)

  const STATIC_GAUGES: { label: string; pct: number; detail: string }[] = [
    { label: '현재 컨텍스트', pct: gauge.pct, detail: `${usedK} / ${winK} 토큰` },
    { label: '5시간 한도', pct: 0, detail: '—' },
    { label: '주간 한도', pct: 0, detail: '—' },
  ]

  return (
    <div className="ctx-strip">
      {STATIC_GAUGES.map((g) => (
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

// ── 슬래시 쿼리 파싱 ─────────────────────────────────────────────────────────

/**
 * value가 '/'로 시작하고 공백이 없으면 슬래시 쿼리 반환.
 * 아니면 null.
 */
function parseSlashQuery(value: string): string | null {
  if (value.startsWith('/') && !/\s/.test(value)) {
    return value.slice(1)
  }
  return null
}

// ── @멘션 토큰 파싱 ───────────────────────────────────────────────────────────

interface MentionToken {
  /** @ 뒤 텍스트 */
  term: string
  /** value 내 @토큰 시작 인덱스 */
  start: number
  /** value 내 @토큰 끝 인덱스 (exclusive) */
  end: number
}

/**
 * caret 위치에서 @토큰을 추출.
 * @뒤 공백 전까지가 토큰. @ 자체가 없으면 null.
 */
function parseMentionToken(value: string, caret: number): MentionToken | null {
  // caret 왼쪽에서 @ 찾기
  const before = value.slice(0, caret)
  const atIdx = before.lastIndexOf('@')
  if (atIdx === -1) return null
  const afterAt = before.slice(atIdx + 1)
  // 공백이 있으면 멘션 아님
  if (/\s/.test(afterAt)) return null
  const term = afterAt
  // 토큰 끝: caret 이후 공백까지
  const rest = value.slice(caret)
  const spaceIdx = rest.search(/\s/)
  const end = spaceIdx === -1 ? value.length : caret + spaceIdx
  return { term, start: atIdx, end }
}

// ── Composer ───────────────────────────────────────────────────────────────────
// MODELS / EFFORTS / MODES are imported from pickerOptions (shared, no local definitions).

export interface QueuedMessage {
  id: string
  text: string
  images?: string[]
}

/** 피커 선택값 묶음 (M4-1) */
export interface PickerValues {
  model: string
  effort: string
  mode: string
}

export interface ComposerProps {
  value: string
  onChange: (v: string) => void
  /**
   * 전송 콜백. M4-1: 피커 선택값을 인자로 포함.
   * 하위호환: 기존 호출부/테스트가 `onSend: vi.fn()` 형태이면 인자 무시됨(타입 확장만).
   */
  onSend: (opts?: PickerValues) => void
  onAbort: () => void
  isRunning: boolean
  /** true면 대화가 시작된 상태(메시지 있음) → placeholder 구분 */
  hasStarted?: boolean
  /** 예약 큐 (기본 []; 라이브=M4; 단위테스트 샘플 주입 용도) */
  queued?: QueuedMessage[]
  /** 예약 취소 콜백 (optional) */
  onRemoveQueued?: (id: string) => void
  /**
   * /ask 슬래시 선택 시 콜백 (optional — 하위호환).
   * 미주입 시: 기존 onChange('/ask ') 동작 유지 (composer-trays.test 무파손).
   * 주입 시: onSlashAsk() 호출 → AskModal open (onChange 대신).
   */
  onSlashAsk?: () => void
  /**
   * 첨부 이미지 썸네일 클릭 시 콜백 (optional — 하위호환).
   * 미주입 시: no-op (composer-trays.test 무파손).
   * 주입 시: onOpenImage(images, clickedIndex) 호출 → Shell ImageViewer open.
   */
  onOpenImage?: (images: string[], index: number) => void
  /**
   * 마지막 run usage (M4-1: 토큰 게이지 실데이터).
   * 미전달 시 게이지 0 상태 유지(하위호환).
   */
  lastUsage?: TokenUsage
  /**
   * 선택된 모델 id (M4-1: 토큰 게이지 컨텍스트 윈도우 분모).
   * 미전달 시 DEFAULT_CONTEXT_WINDOW(1M) fallback.
   */
  selectedModel?: string
  /**
   * SDK가 보고한 실 컨텍스트 윈도우 크기 (Phase 21c).
   * 양수일 때 modelId 룩업보다 우선 적용. 미전달 시 하위호환 동작 유지.
   */
  lastContextWindow?: number
  /**
   * 실 프로젝트 파일 목록 (M4-2: @멘션 팔레트 배선).
   * store.selectProjectFiles → Conversation → prop으로 전달.
   * Composer는 window.api 직접 호출 0 — prop만 소비.
   */
  mentionFiles?: string[]
}

function ComposerInner({
  value,
  onChange,
  onSend,
  onAbort,
  isRunning,
  hasStarted = false,
  queued = [],
  onRemoveQueued,
  onSlashAsk,
  onOpenImage,
  lastUsage,
  selectedModel: selectedModelProp,
  lastContextWindow,
  mentionFiles = [],
}: ComposerProps): JSX.Element {
  // 피커 로컬 선택 — 기본값 = DEFAULT_MODEL/DEFAULT_EFFORT/DEFAULT_MODE_SINGLE
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [effort, setEffort] = useState(DEFAULT_EFFORT)
  const [mode, setMode] = useState(DEFAULT_MODE_SINGLE)

  // ── 슬래시 메뉴 상태 ──────────────────────────────────────────────────────
  const [slashDismissed, setSlashDismissed] = useState(false)
  const [slashIdx, setSlashIdx] = useState(0)

  // ── @멘션 팔레트 상태 ─────────────────────────────────────────────────────
  // value.length 초기화: 외부 value 주입 시 caret이 끝에 있는 것이 자연스럽다
  const [caret, setCaret] = useState(() => value.length)
  const [mentionDismissed, setMentionDismissed] = useState(false)
  const [mentionIdx, setMentionIdx] = useState(0)

  // ── 첨부 이미지 상태 ──────────────────────────────────────────────────────
  const [images, setImages] = useState<string[]>([])

  // ── 드래그오버 상태 ───────────────────────────────────────────────────────
  const [dragOver, setDragOver] = useState(false)
  const dragDepth = useRef(0)

  const inputRef = useRef<HTMLTextAreaElement>(null)

  // ── 슬래시 메뉴 계산 ──────────────────────────────────────────────────────
  const slashQuery = parseSlashQuery(value)
  const slashOpen = slashQuery !== null && !slashDismissed

  const cmdHits = slashOpen
    ? SLASH_COMMANDS.filter((c) => c.name.includes(slashQuery))
    : []
  const skillHits = slashOpen
    ? SAMPLE_SKILLS.filter(
        (s) => s.name.includes(slashQuery) || (s.description ?? '').includes(slashQuery)
      )
    : []
  const totalSlash = cmdHits.length + skillHits.length

  // slashIdx clamp when list changes
  const safeSlashIdx = totalSlash > 0 ? Math.min(slashIdx, totalSlash - 1) : 0

  // ── @멘션 계산 ────────────────────────────────────────────────────────────
  const mentionTok = parseMentionToken(value, caret)
  const mentionOpen = mentionTok !== null && !mentionDismissed

  // M4-2: mentionEntries(실 파일 목록, @토큰 query) → browse/search 결과
  // mentionTok.term = @ 뒤 텍스트 (e.g. '', 'src/', 'src/comp', 'READ')
  const mentionResult = mentionOpen && mentionTok ? mentionEntries(mentionFiles, mentionTok.term) : null
  const mentionHits: MentionEntry[] = mentionResult?.entries ?? []

  const safeMentionIdx = mentionHits.length > 0 ? Math.min(mentionIdx, mentionHits.length - 1) : 0

  // ── 슬래시 선택 ───────────────────────────────────────────────────────────
  const pickSlash = useCallback(
    (name: string) => {
      // /ask + onSlashAsk 주입 시 → 모달 열기 (하위호환: 미주입 시 기존 onChange)
      if (name === 'ask' && onSlashAsk) {
        setSlashDismissed(true)
        setSlashIdx(0)
        onSlashAsk()
        return
      }
      onChange('/' + name + ' ')
      setSlashDismissed(true)
      setSlashIdx(0)
    },
    [onChange, onSlashAsk]
  )

  // ── 멘션 선택 ─────────────────────────────────────────────────────────────
  const pickMention = useCallback(
    (entry: MentionEntry) => {
      if (!mentionTok) return
      if (entry.kind === 'dir') {
        // M4-2: 드릴다운 — @{full}/ (후행 슬래시) 삽입.
        // mentionEntries가 새 query(= full + '/') 로 browse 재계산 → 팔레트 자동 갱신.
        // MentionEntry.full은 trailing slash 없음(원본 spec) → 삽입 시 추가.
        const inserted = entry.full + '/'
        const newValue =
          value.slice(0, mentionTok.start) + '@' + inserted + value.slice(mentionTok.end)
        onChange(newValue)
        setMentionIdx(0)
        // caret을 @dir/ 끝으로
        const newCaret = mentionTok.start + 1 + inserted.length
        setCaret(newCaret)
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.setSelectionRange(newCaret, newCaret)
          }
        }, 0)
      } else {
        // 파일 선택: @path 삽입 후 공백 + dismiss
        const newValue =
          value.slice(0, mentionTok.start) + '@' + entry.full + ' ' + value.slice(mentionTok.end)
        onChange(newValue)
        setMentionDismissed(true)
        const newCaret = mentionTok.start + 1 + entry.full.length + 1
        setCaret(newCaret)
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.setSelectionRange(newCaret, newCaret)
          }
        }, 0)
      }
    },
    [mentionTok, value, onChange]
  )

  // ── 키 핸들러 ─────────────────────────────────────────────────────────────
  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // slash-menu 우선
      if (slashOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSlashIdx((i) => (i + 1) % totalSlash)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSlashIdx((i) => (i - 1 + totalSlash) % totalSlash)
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          const idx = safeSlashIdx
          if (idx < cmdHits.length) {
            pickSlash(cmdHits[idx].name)
          } else {
            const s = skillHits[idx - cmdHits.length]
            if (s) pickSlash(s.name)
          }
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setSlashDismissed(true)
          return
        }
      }

      // mention 팔레트
      if (mentionOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setMentionIdx((i) => (i + 1) % (mentionHits.length || 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setMentionIdx((i) => (i - 1 + (mentionHits.length || 1)) % (mentionHits.length || 1))
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          const entry = mentionHits[safeMentionIdx]
          if (entry) pickMention(entry)
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setMentionDismissed(true)
          return
        }
      }

      // 기본 Enter 전송
      if (e.key === 'Enter' && !e.shiftKey && !slashOpen && !mentionOpen) {
        e.preventDefault()
        onSend({ model, effort, mode })
      }
    },
    [
      slashOpen,
      mentionOpen,
      totalSlash,
      safeSlashIdx,
      cmdHits,
      skillHits,
      mentionHits,
      safeMentionIdx,
      pickSlash,
      pickMention,
      onSend,
      model,
      effort,
      mode,
    ]
  )

  // ── 드래그 여부 판단 ──────────────────────────────────────────────────────
  const dragHasFile = (e: React.DragEvent): boolean => {
    const types = e.dataTransfer?.types ?? []
    return Array.from(types).includes('Files')
  }

  // ── 첨부 버튼 ─────────────────────────────────────────────────────────────
  const handleAttach = useCallback(() => {
    setImages((prev) => [...prev, SAMPLE_THUMB_DATA_URL])
  }, [])

  // ── placeholder 계산 ──────────────────────────────────────────────────────
  const placeholder = isRunning
    ? '다음 메시지를 예약하세요… (작업 후 자동 전송)'
    : hasStarted
      ? '메세지를 입력하세요.'
      : '오늘 어떤 도움을 드릴까요?'

  // ── mention-loc 헤더 텍스트 (M4-2: mentionResult 기반, 원본 Chat.tsx 미러) ─
  // browse 모드: base 경로('' → '루트') 표시. term 있으면 필터 힌트 추가.
  // search 모드: '"term" 검색' 표시.
  const mentionLocText: string = (() => {
    if (!mentionResult) return ''
    if (mentionResult.mode === 'search') {
      return `'${mentionResult.term}' 검색`
    }
    // browse
    const baseName = mentionResult.base || '루트'
    return mentionResult.term ? `${baseName} · '${mentionResult.term}'` : baseName
  })()

  // 게이지에 사용할 모델: prop 우선(store 동기화), 없으면 로컬 picker state
  const gaugeModel = selectedModelProp ?? model

  return (
    <div className="composer-wrap">
      <div className="composer-inner">
        <ContextStrip lastUsage={lastUsage} selectedModel={gaugeModel} lastContextWindow={lastContextWindow} />

        {/* 예약 큐 스트립 */}
        {queued.length > 0 && (
          <div className="sched">
            <div className="sched-head">
              <span className="sched-title">
                <IconClock size={14} />
                예약된 메시지 {queued.length}
              </span>
              <span className="sched-hint">작업이 끝나면 순서대로 전송돼요</span>
            </div>
            <div className="sched-list">
              {queued.map((m, i) => (
                <div className="sched-item" key={m.id}>
                  <span className="sched-num">{i + 1}</span>
                  <span className="sched-text">
                    {m.text.trim() || ((m.images?.length ?? 0) > 0 ? `이미지 ${m.images!.length}장` : '')}
                  </span>
                  {(m.images?.length ?? 0) > 0 && (
                    <span className="sched-img" title={`이미지 ${m.images!.length}장`}>
                      <IconImage size={14} />
                    </span>
                  )}
                  <button
                    type="button"
                    className="sched-x"
                    aria-label="예약 취소"
                    onClick={() => onRemoveQueued?.(m.id)}
                  >
                    <span className="sched-x-ic" aria-hidden="true">×</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          className={
            'composer' +
            (dragOver ? ' drag' : '') +
            (isRunning && (value.trim() || images.length > 0) ? '' : isRunning ? ' scheduling' : '')
          }
          onDragEnter={(e) => {
            if (!dragHasFile(e)) return
            dragDepth.current += 1
            setDragOver(true)
          }}
          onDragOver={(e) => {
            if (!dragHasFile(e)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDragLeave={() => {
            dragDepth.current = Math.max(0, dragDepth.current - 1)
            if (dragDepth.current === 0) setDragOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            dragDepth.current = 0
            setDragOver(false)
            // 실제 파일 처리=M4; 샘플 썸네일 추가
            setImages((prev) => [...prev, SAMPLE_THUMB_DATA_URL])
          }}
        >
          {/* 드롭 힌트 오버레이 */}
          {dragOver && (
            <div className="drop-hint">
              <IconImage size={24} />
              <span>이미지를 여기에 놓으세요</span>
            </div>
          )}

          {/* 슬래시 커맨드 메뉴 */}
          {slashOpen && (
            <div className="slash-menu scroll" role="listbox">
              {cmdHits.length > 0 && <div className="slash-sec">명령어</div>}
              {cmdHits.map((c, i) => {
                const Ic = c.icon
                return (
                  <button
                    key={'cmd:' + c.name}
                    type="button"
                    role="option"
                    aria-selected={i === safeSlashIdx}
                    className={'slash-opt' + (i === safeSlashIdx ? ' on' : '')}
                    onMouseEnter={() => setSlashIdx(i)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickSlash(c.name)
                    }}
                  >
                    <span className="slash-ic">
                      <Ic size={15} />
                    </span>
                    <span className="slash-name">{c.name}</span>
                    <span className="slash-desc">{c.desc}</span>
                  </button>
                )
              })}
              {skillHits.length > 0 && <div className="slash-sec">스킬</div>}
              {skillHits.map((s, i) => {
                const gi = cmdHits.length + i
                const Ic = s.icon
                return (
                  <button
                    key={'skill:' + s.scope + ':' + s.name}
                    type="button"
                    role="option"
                    aria-selected={gi === safeSlashIdx}
                    className={'slash-opt' + (gi === safeSlashIdx ? ' on' : '')}
                    onMouseEnter={() => setSlashIdx(gi)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickSlash(s.name)
                    }}
                  >
                    <span className="slash-ic skill">
                      <Ic size={15} />
                    </span>
                    <span className="slash-name">{s.name}</span>
                    <span className="slash-desc">{s.description ?? '설명이 없습니다.'}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* @멘션 팔레트 */}
          {mentionOpen && (
            <div className="slash-menu scroll" role="listbox">
              <div className="slash-sec mention-loc">
                {mentionResult?.mode === 'browse' ? (
                  <>
                    <IconFolder size={11} />
                    <span>{mentionLocText || '루트'}</span>
                  </>
                ) : (
                  <>
                    <IconSearch size={11} />
                    <span>{mentionLocText || '루트'}</span>
                  </>
                )}
              </div>
              {mentionHits.map((e, i) => (
                <button
                  key={e.kind + ':' + e.full}
                  type="button"
                  role="option"
                  aria-selected={i === safeMentionIdx}
                  className={'slash-opt' + (i === safeMentionIdx ? ' on' : '')}
                  onMouseEnter={() => setMentionIdx(i)}
                  onMouseDown={(ev) => {
                    ev.preventDefault()
                    pickMention(e)
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

          {/* 이미지 첨부 트레이 */}
          {images.length > 0 && (
            <div className="img-tray">
              {images.map((src, i) => (
                <div className="img-thumb" key={src + i}>
                  <button
                    type="button"
                    className="img-thumb-open"
                    aria-label={`첨부 이미지 ${i + 1}`}
                    title={`첨부 이미지 ${i + 1}`}
                    onClick={() => onOpenImage?.(images, i)}
                  >
                    <img src={src} alt={`첨부 이미지 ${i + 1}`} draggable={false} />
                  </button>
                  <button
                    type="button"
                    className="img-thumb-x"
                    aria-label="제거"
                    onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <span className="img-thumb-x-ic" aria-hidden="true">×</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={inputRef}
            className="composer-ta"
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              const sel = e.target.selectionStart ?? e.target.value.length
              setCaret(sel)
              // 멘션 dismissed 해제 — 새로 타이핑 시 팔레트 재오픈
              setMentionDismissed(false)
              setSlashDismissed(false)
            }}
            onSelect={(e) => {
              setCaret(e.currentTarget.selectionStart ?? 0)
            }}
            onKeyDown={handleKey}
            onFocus={() => {
              setSlashDismissed(false)
              setMentionDismissed(false)
            }}
            onBlur={() => {
              setSlashDismissed(true)
              setMentionDismissed(true)
            }}
            placeholder={placeholder}
            rows={1}
            aria-label="메시지 입력"
          />

          <div className="composer-bar">
            <button
              type="button"
              className="cm-icon"
              aria-label="이미지 첨부"
              title="이미지 첨부"
              onClick={handleAttach}
            >
              <IconImage size={16} />
            </button>
            <Picker
              ariaLabel="모델 선택"
              caption="모델"
              options={MODELS}
              value={model}
              onChange={(id) => setModel(id)}
              dots
            />
            <span className="pick-div" aria-hidden="true" />
            <Picker ariaLabel="Effort 선택" caption="Effort" options={EFFORTS} value={effort} onChange={setEffort} />
            <span className="pick-div" aria-hidden="true" />
            <Picker ariaLabel="모드 선택" caption="모드" options={MODES} value={mode} onChange={setMode} align="right" icons />
            <span className="cm-spacer" />
            {isRunning ? (
              value.trim() || images.length > 0 ? (
                <button
                  type="button"
                  className="send schedule"
                  aria-label="예약"
                  title="작업 후 전송 예약 (Enter)"
                  onClick={() => {
                    // 예약 로직=M4; 로컬에서는 전송 시도
                    onSend({ model, effort, mode })
                  }}
                >
                  <IconClock size={17} />
                </button>
              ) : (
                <button
                  type="button"
                  className="send stop"
                  aria-label="실행 중단"
                  onClick={onAbort}
                >
                  <span className="send-stop-sq" aria-hidden="true" />
                </button>
              )
            ) : (
              <button
                type="button"
                className="send"
                aria-label="전송"
                disabled={!value.trim() && images.length === 0}
                onClick={() => onSend({ model, effort, mode })}
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
