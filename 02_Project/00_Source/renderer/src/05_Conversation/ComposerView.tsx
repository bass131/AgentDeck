import { memo, useEffect, useRef, useState, useCallback, type JSX } from 'react'
import { computeComposerHeight } from './composerHeight'
import type { TokenUsage } from '@shared/agentEvents'
import type { UsageInfo } from '@shared/ipcContract'

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
import { useComposerKeywordMirror } from './hooks/useComposerKeywordMirror'

import './Composer.css'

// 입력창 본체 하나(M05 G9b) — store를 모른다. 선택기 값과 setter는 호출부(단일 store 어댑터 Composer,
// 멀티 PanelView)가 넘긴다.

export interface QueuedMessageView {
  id: string
  text: string
  images?: string[]
}

export interface PickerValues {
  model: string
  effort: string
  mode: string
  orchestration?: boolean
}

export interface ComposerInputProps {
  value: string
  onChange: (v: string) => void
  onSend: (opts?: PickerValues) => void
  onAbort: () => void
  isRunning: boolean
  hasStarted?: boolean
  queued?: QueuedMessageView[]
  onRemoveQueued?: (id: string) => void
  onSlashAsk?: () => void
  onOpenImage?: (images: string[], index: number) => void
  lastUsage?: TokenUsage
  lastContextWindow?: number
  usage?: UsageInfo
  mentionFiles?: string[]
  workspaceRoot?: string | null
  history?: string[]
  disabled?: boolean
  attachedImages?: string[]
  onAttachFiles?: (files: File[]) => void
  onRemoveImage?: (index: number) => void
}

export interface ComposerPickerBinding {
  model: string
  setModel: (id: string) => void
  effort: string
  setEffort: (id: string) => void
  mode: string
  setMode: (id: string) => void
  orchestration: boolean
  setOrchestration: (on: boolean) => void
  replMode: boolean
  setReplMode: (on: boolean) => void
  replLit: boolean
}

// 밀도(C3 사용자 결정) — compact는 멀티 패널 외형이다. 크기·색은 Composer.css의 .composer--compact 규칙이
// 맡고, 사용량 띠(ContextStrip)는 그리지 않는다(패널은 자기 컨텍스트 링을 둔다). 문구·아이콘은 같다.
export type ComposerDensity = 'default' | 'compact'

// compact 줄 높이 — Composer.css .composer--compact의 --composer-line-height(20px)와 같다.
const LINE_HEIGHT: Record<ComposerDensity, number> = { default: 22, compact: 20 }

export interface ComposerLayoutProps {
  density?: ComposerDensity
  // Shift+Tab을 입력창이 처리한다(P5) — 있으면 이 입력창의 모드만 돌리고 전역 단축키로 올리지 않는다.
  onCycleMode?: () => void
}

export type ComposerViewProps = ComposerInputProps & ComposerPickerBinding & ComposerLayoutProps

function ComposerViewInner({
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
  lastContextWindow,
  usage,
  mentionFiles = [],
  attachedImages = [],
  onAttachFiles,
  onRemoveImage,
  history = [],
  workspaceRoot,
  disabled = false,
  model,
  setModel,
  effort,
  setEffort,
  mode,
  setMode,
  orchestration,
  setOrchestration,
  replMode,
  setReplMode,
  replLit,
  density = 'default',
  onCycleMode,
}: ComposerViewProps): JSX.Element {
  const doSend = useCallback((): void => {
    onSend({ model, effort, mode, orchestration })
  }, [onSend, model, effort, mode, orchestration])

  const inputRef = useRef<HTMLTextAreaElement>(null)

  const slash = useSlashPalette({ value, isRunning, workspaceRoot, onChange, onSlashAsk })
  const mention = useMentionPalette({ value, mentionFiles, onChange, inputRef })
  const img = useImageAttach({ onAttachFiles })
  const hist = useInputHistory({ onChange, inputRef, onCaretChange: mention.setCaret })
  const kwMirror = useComposerKeywordMirror(value, inputRef, orchestration)

  const handleKey = useComposerKeyHandler({
    disabled,
    slash,
    mention,
    hist,
    history,
    value,
    doSend,
  })

  const TA_LINE_HEIGHT = LINE_HEIGHT[density]
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

  const placeholder = disabled
    ? '프로젝트 폴더를 먼저 열어주세요'
    : isRunning
      ? '다음 메시지를 예약하세요… (작업 후 자동 전송)'
      : hasStarted
        ? '메세지를 입력하세요.'
        : '오늘 어떤 도움을 드릴까요?'

  return (
    <div className={'composer-wrap' + (density === 'compact' ? ' composer--compact' : '')}>
      <div className="composer-inner">
        {density !== 'compact' && (
          <ContextStrip
            lastUsage={lastUsage}
            selectedModel={model}
            lastContextWindow={lastContextWindow}
            usage={usage}
          />
        )}

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

          <div className="composer-ta-wrap">
            {kwMirror.ghostActive && (
              <div
                className="composer-ta-mirror"
                ref={kwMirror.mirrorRef}
                aria-hidden="true"
                style={{ height: taStyle.height }}
              >
                {kwMirror.segments.map((seg, i) =>
                  seg.kind === 'orchestration' ? (
                    <span
                      key={i}
                      className={
                        'orch-kw' + (kwMirror.highlightVariant === 'muted' ? ' orch-kw--muted' : '')
                      }
                    >
                      {seg.text}
                    </span>
                  ) : seg.kind === 'slash' ? (
                    <span key={i} className="slash-kw">
                      {seg.text}
                    </span>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  )
                )}
              </div>
            )}
            <textarea
              ref={inputRef}
              className={'composer-ta' + (kwMirror.ghostActive ? ' composer-ta--ghost' : '')}
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
              onKeyDown={(e) => {
                if (onCycleMode && e.key === 'Tab' && e.shiftKey) {
                  e.preventDefault()
                  e.stopPropagation()
                  onCycleMode()
                  return
                }
                handleKey(e)
              }}
              onPaste={img.handlePaste}
              onScroll={kwMirror.handleScroll}
              onCompositionStart={kwMirror.handleCompositionStart}
              onCompositionEnd={kwMirror.handleCompositionEnd}
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
          </div>

          {!orchestration && kwMirror.hasOrchestrationKeyword && (
            <div className="composer-orch-hint" role="status">
              UltraCode가 꺼져 있어요 — 토글을 켜면 오케스트레이션이 활성화됩니다
            </div>
          )}

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

export const ComposerView = memo(ComposerViewInner)
