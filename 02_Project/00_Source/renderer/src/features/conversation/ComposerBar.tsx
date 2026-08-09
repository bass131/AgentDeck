import { memo, type JSX } from 'react'
import { IconImage, IconArrowUp, IconClock, IconCode, IconTerminal } from '../../components/common/icons'
import { MODELS, MODES, effortPickerFor } from '../../lib/pickerOptions'
import { Picker } from './ComposerPicker'

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
  setOrchestration: React.Dispatch<React.SetStateAction<boolean>>
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

  const effortPicker = effortPickerFor(model, effort)
  const effortTitle = effortPicker.disabled
    ? '이 모델은 effort를 지원하지 않아요'
    : 'Effort는 새 대화(세션)부터 적용됩니다'
  const effortNote = effortPicker.disabled
    ? '이 모델은 effort를 지원하지 않아요.'
    : 'Effort는 세션 생성 시 고정돼요. 변경은 새 대화(세션)부터 적용돼요.'

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

      <Picker
        ariaLabel="모델 선택"
        caption="모델"
        options={MODELS}
        value={model}
        onChange={setModel}
        dots
        title="모델 변경은 진행 중 REPL 세션에 즉시 적용됩니다 (단발 모드는 새 대화부터)"
        note="REPL 세션 중 변경은 다음 응답부터 적용돼요. 전환 직후 첫 응답은 준비로 조금 느릴 수 있어요."
      />
      <span className="pick-div" aria-hidden="true" />

      <Picker
        ariaLabel="Effort 선택"
        caption="Effort"
        options={effortPicker.options}
        value={effortPicker.displayValue}
        onChange={setEffort}
        disabled={effortPicker.disabled}
        title={effortTitle}
        note={effortNote}
      />
      <span className="pick-div" aria-hidden="true" />

      <Picker
        ariaLabel="모드 선택"
        caption="모드"
        options={MODES}
        value={mode}
        onChange={setMode}
        align="right"
        icons
        title="모드 변경은 진행 중 세션에 즉시 적용됩니다 (Bypass는 새 세션부터)"
        note="Bypass는 새 세션부터 적용돼요. 진행 중 세션은 라이브 전환되지 않아요."
      />
      <span className="pick-div" aria-hidden="true" />

      <button
        type="button"
        className={`pick-btn orch-toggle${orchestration ? ' orch-on' : ''}`}
        aria-label="UltraCode 모드 토글"
        aria-pressed={orchestration}
        title={
          orchestration
            ? '복잡·병렬 작업을 여러 에이전트로 — 실행마다 승인'
            : 'UltraCode 모드 (클릭하여 활성화)'
        }
        onClick={() => setOrchestration((v) => !v)}
      >
        <span className="toggle-chip" aria-hidden>
          <IconCode size={11} />
        </span>
        <span className="pick-lbl">UltraCode</span>
        <span className="orch-badge">{orchestration ? 'ON' : 'OFF'}</span>
      </button>

      <button
        type="button"
        className={`pick-btn repl-toggle${replLit ? ' repl-lit' : ''}`}
        aria-label="REPL 지속세션 모드 토글"
        aria-pressed={replMode}
        title={
          replMode
            ? 'REPL 지속세션 모드 — 켜짐(클릭하여 단발 모드로)'
            : '단발 모드 — 매 전송마다 새 세션(클릭하여 REPL 지속세션으로)'
        }
        onClick={() => setReplMode(!replMode)}
      >
        <span className="toggle-chip" aria-hidden>
          <IconTerminal size={11} />
        </span>
        <span className="pick-lbl">REPL</span>
        <span className="orch-badge">{replMode ? 'ON' : 'OFF'}</span>
      </button>

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
