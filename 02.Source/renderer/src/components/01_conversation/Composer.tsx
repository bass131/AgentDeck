/**
 * Composer.tsx — 리치 컴포저 조립자 (Phase 14 리팩토링).
 *
 * 관심사 분리(SoC): 각 기능을 커스텀 훅으로 추출, 이 파일은 조립 + 레이아웃만.
 *   - useInputHistory    : B9 ↑↓ 셸식 히스토리
 *   - useImageAttach     : B7 drop·paste·picker 이미지 첨부
 *   - useSlashPalette    : B6 슬래시 커맨드·스킬 팔레트 (P10 IPC)
 *   - useMentionPalette  : @멘션 팔레트 (M4-2)
 *   - useComposerKeyHandler: 키보드 이벤트 조율
 *   하위 컴포넌트: SlashPalette, MentionPalette, ImageTray, SchedStrip, ComposerBar, ContextStrip
 *
 * CRITICAL: window.api 화이트리스트만(훅 내부). fs/Node 직접 0.
 * 인라인 색상 0(data URL은 CSP img-src data: 허용).
 */
import { memo, useEffect, useRef, useState, useCallback, type JSX } from 'react'
import { computeComposerHeight } from '../../lib/composerHeight'
import type { TokenUsage } from '../../../../shared/agent-events'
import type { UsageInfo } from '../../../../shared/ipc-contract'
import {
  DEFAULT_MODEL,
  DEFAULT_EFFORT,
} from '../../lib/pickerOptions'
import { useAppStore, selectPickerMode, selectReplMode } from '../../store/appStore'
import { resolveReplLit } from '../../lib/replIndicator'
import { detectOrchestrationKeyword } from '../../lib/orchestrationKeyword'

import { ContextStrip } from './ComposerContext'
import { SlashPalette } from './SlashPalette'
import { MentionPalette } from './MentionPalette'
import { ImageTray } from './ImageTray'
import { SchedStrip } from './SchedStrip'
import { ComposerBar } from './ComposerBar'

import { useInputHistory } from './hooks/useInputHistory'
import { useImageAttach } from './hooks/useImageAttach'
import { useSlashPalette } from './hooks/useSlashPalette'
import { useMentionPalette } from './hooks/useMentionPalette'
import { useComposerKeyHandler } from './hooks/useComposerKeyHandler'

import './Composer.css'

// ── 공개 타입 (Conversation.tsx 등이 import) ─────────────────────────────────

// 도메인 QueuedMessage(store/slices/types.ts)와 구분되는 렌더용 뷰 타입
export interface QueuedMessageView {
  id: string
  text: string
  images?: string[]
}

/** 피커 선택값 묶음 (M4-1 + Phase 37) */
export interface PickerValues {
  model: string
  effort: string
  mode: string
  /** 오케스트레이션 모드 토글 — backend가 실제 SDK 옵션으로 매핑. */
  orchestration?: boolean
}

export interface ComposerProps {
  value: string
  onChange: (v: string) => void
  /** 전송 콜백. M4-1: 피커 선택값을 인자로 포함. */
  onSend: (opts?: PickerValues) => void
  onAbort: () => void
  isRunning: boolean
  /** true면 대화가 시작된 상태(메시지 있음) → placeholder 구분 */
  hasStarted?: boolean
  /** 예약 큐 (기본 []) */
  queued?: QueuedMessageView[]
  onRemoveQueued?: (id: string) => void
  /** /ask 슬래시 선택 시 콜백 */
  onSlashAsk?: () => void
  /** 첨부 이미지 썸네일 클릭 시 콜백 */
  onOpenImage?: (images: string[], index: number) => void
  /** 마지막 run usage (M4-1: 토큰 게이지 실데이터) */
  lastUsage?: TokenUsage
  /** 선택된 모델 id (토큰 게이지 컨텍스트 윈도우 분모) */
  selectedModel?: string
  /** SDK가 보고한 실 컨텍스트 윈도우 크기 (Phase 21c) */
  lastContextWindow?: number
  /** OAuth 레이트리밋 게이지 (B8 Phase 26) */
  usage?: UsageInfo
  /** 실 프로젝트 파일 목록 (M4-2: @멘션 팔레트 배선) */
  mentionFiles?: string[]
  /** 현재 워크스페이스 루트 경로 (P10 슬래시 커맨드 재로드 캐시 키) */
  workspaceRoot?: string | null
  /** 셸식 입력 히스토리 (Phase 25 B9). */
  history?: string[]
  /** 입력 비활성화 (workspaceRoot===null 시 Conversation이 전달) */
  disabled?: boolean
  /** 현재 첨부 이미지 data URL 목록 */
  attachedImages?: string[]
  /** 파일 첨부 이벤트 */
  onAttachFiles?: (files: File[]) => void
  /** 특정 index 이미지 제거 콜백 */
  onRemoveImage?: (index: number) => void
}

// ── ComposerInner ─────────────────────────────────────────────────────────────

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
  usage,
  mentionFiles = [],
  attachedImages = [],
  onAttachFiles,
  onRemoveImage,
  history = [],
  workspaceRoot,
  disabled = false,
}: ComposerProps): JSX.Element {
  // ── 피커 로컬 상태 ────────────────────────────────────────────────────────
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [effort, setEffort] = useState(DEFAULT_EFFORT)
  // P7: mode는 store(Shift+Tab cyclePickerMode 지원). 단방향: store → value.
  const mode = useAppStore(selectPickerMode)
  const setMode = useAppStore.getState().setPickerMode

  // UC1-P04(ADR-032): 오케스트레이션 토글 — 지속(사용자가 끌 때까지 유지, one-shot 폐기)
  const [orchestration, setOrchestration] = useState(false)

  // Phase 5b: REPL 지속세션 토글 — 전역 store
  const replMode = useAppStore(selectReplMode)
  const setReplMode = useAppStore((s) => s.setReplMode)
  // LR3-06(영호 조정 2026-07-03): REPL 버튼 = 상시 표시등 — 토글 ON이면 활동 무관 계속
  // 점등, OFF면 소등. 판정은 replMode 그 자체(resolveReplLit는 이제 단순 항등 함수).
  const replLit = resolveReplLit(replMode)

  // 전송 래퍼: UC1-P04(ADR-032) — 토글(지속) OR 키워드(턴 단위) 결합. 토글은 더 이상
  // 전송 후 자동 OFF되지 않는다(one-shot 폐기). 키워드 감지는 플래그만 세움 — value(표시
  // 원문·엔진 전달문)는 가공하지 않는다.
  const doSend = useCallback((): void => {
    onSend({ model, effort, mode, orchestration: orchestration || detectOrchestrationKeyword(value) })
  }, [onSend, model, effort, mode, orchestration, value])

  // ── textarea ref ──────────────────────────────────────────────────────────
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // ── 훅 조립 ──────────────────────────────────────────────────────────────
  const slash = useSlashPalette({ value, isRunning, workspaceRoot, onChange, onSlashAsk })
  const mention = useMentionPalette({ value, mentionFiles, onChange, inputRef })
  const img = useImageAttach({ onAttachFiles })
  const hist = useInputHistory({ onChange, inputRef, onCaretChange: mention.setCaret })

  // ── 키 핸들러 훅 ─────────────────────────────────────────────────────────
  const handleKey = useComposerKeyHandler({
    disabled,
    slash,
    mention,
    hist,
    history,
    value,
    doSend,
  })

  // ── textarea 자동 높이 ────────────────────────────────────────────────────
  const TA_LINE_HEIGHT = 22 // font-size:14 * line-height:1.55 ≈ 21.7 → 22
  const TA_PADDING_Y = 0
  const [taStyle, setTaStyle] = useState<React.CSSProperties>({
    height: TA_LINE_HEIGHT,
    overflowY: 'hidden',
  })

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const { height, overflow } = computeComposerHeight(
      el.scrollHeight,
      TA_LINE_HEIGHT,
      TA_PADDING_Y,
      3
    )
    el.style.height = ''
    setTaStyle({ height, overflowY: overflow })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // ── 파생값 ───────────────────────────────────────────────────────────────
  const placeholder = disabled
    ? '프로젝트 폴더를 먼저 열어주세요'
    : isRunning
      ? '다음 메시지를 예약하세요… (작업 후 자동 전송)'
      : hasStarted
        ? '메세지를 입력하세요.'
        : '오늘 어떤 도움을 드릴까요?'

  const gaugeModel = selectedModelProp ?? model

  // ── 렌더 ──────────────────────────────────────────────────────────────────
  return (
    <div className="composer-wrap">
      <div className="composer-inner">
        <ContextStrip
          lastUsage={lastUsage}
          selectedModel={gaugeModel}
          lastContextWindow={lastContextWindow}
          usage={usage}
        />

        <SchedStrip queued={queued} onRemoveQueued={onRemoveQueued} />

        <div
          className={
            'composer' +
            (img.dragOver ? ' drag' : '') +
            (isRunning && (value.trim() || attachedImages.length > 0)
              ? ''
              : isRunning
                ? ' scheduling'
                : '')
          }
          {...img.dragHandlers}
        >
          <SlashPalette
            slashOpen={slash.slashOpen}
            cmdHits={slash.cmdHits}
            skillHits={slash.skillHits}
            safeSlashIdx={slash.safeSlashIdx}
            setSlashIdx={slash.setSlashIdx}
            pickSlash={slash.pickSlash}
          />

          <MentionPalette
            mentionOpen={mention.mentionOpen}
            mentionHits={mention.mentionHits}
            safeMentionIdx={mention.safeMentionIdx}
            mentionResult={mention.mentionResult}
            mentionLocText={mention.mentionLocText}
            setMentionIdx={mention.setMentionIdx}
            pickMention={mention.pickMention}
          />

          <ImageTray
            dragOver={img.dragOver}
            attachedImages={attachedImages}
            fileInputRef={img.fileInputRef}
            handleFileInputChange={img.handleFileInputChange}
            onOpenImage={onOpenImage}
            onRemoveImage={onRemoveImage}
          />

          {disabled && (
            <div className="composer-disabled-hint">
              프로젝트 폴더를 열면 대화를 시작할 수 있어요
            </div>
          )}

          <textarea
            ref={inputRef}
            className="composer-ta"
            value={value}
            disabled={disabled}
            style={taStyle}
            onChange={(e) => {
              onChange(e.target.value)
              const sel = e.target.selectionStart ?? e.target.value.length
              mention.setCaret(sel)
              mention.setMentionDismissed(false)
              slash.setSlashDismissed(false)
              hist.setHistIdx(null)
            }}
            onSelect={(e) => {
              mention.setCaret(e.currentTarget.selectionStart ?? 0)
            }}
            onKeyDown={handleKey}
            onPaste={img.handlePaste}
            onFocus={() => {
              slash.setSlashDismissed(false)
              mention.setMentionDismissed(false)
            }}
            onBlur={() => {
              slash.setSlashDismissed(true)
              mention.setMentionDismissed(true)
            }}
            placeholder={placeholder}
            rows={1}
            aria-label="메시지 입력"
          />

          <ComposerBar
            disabled={disabled}
            isRunning={isRunning}
            value={value}
            attachedImages={attachedImages}
            model={model}
            setModel={setModel}
            effort={effort}
            setEffort={setEffort}
            mode={mode}
            setMode={setMode}
            orchestration={orchestration}
            setOrchestration={setOrchestration}
            replMode={replMode}
            setReplMode={setReplMode}
            replLit={replLit}
            doSend={doSend}
            onAbort={onAbort}
            onAttachButton={img.handleAttach}
          />
        </div>
      </div>
    </div>
  )
}

export const Composer = memo(ComposerInner)
export default Composer
