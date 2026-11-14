import { memo, type JSX } from 'react'
import { IconImage, IconArrowUp, IconClock } from '@renderer/02_Common/icons'
import { PickerGroup } from './PickerGroup'

export interface ComposerBarProps {
  disabled: boolean
  isRunning: boolean
  value: string
  attachedImages: string[]
  model: string
  setModel: (id: string) => void
  effort: string
  setEffort: (id: string) => void
  mode: string
  setMode: (id: string) => void
  orchestration: boolean
  setOrchestration: (on: boolean) => void
  replMode: boolean
  setReplMode: (v: boolean) => void
  replLit: boolean
  doSend: () => void
  onAbort: () => void
  onAttachButton: () => void
}

function ComposerBarInner({
  disabled,
  isRunning,
  value,
  attachedImages,
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
  doSend,
  onAbort,
  onAttachButton,
}: ComposerBarProps): JSX.Element {
  const hasContent = value.trim().length > 0 || attachedImages.length > 0

  return (
    <div className="composer-bar">
      <button
        type="button"
        className="cm-icon"
        aria-label="이미지 첨부"
        title="이미지 첨부"
        disabled={disabled}
        onClick={onAttachButton}
      >
        <IconImage size={16} />
      </button>

      <PickerGroup
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
      />

      <span className="cm-spacer" />

      {isRunning ? (
        hasContent ? (
          <button
            type="button"
            className="send schedule"
            aria-label="예약"
            title="작업 후 전송 예약 (Enter)"
            onClick={doSend}
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
          disabled={disabled || !hasContent}
          onClick={doSend}
        >
          <IconArrowUp size={16} />
        </button>
      )}
    </div>
  )
}

export const ComposerBar = memo(ComposerBarInner)
