/**
 * ComposerBar.tsx — 컴포저 하단 도구 모음 (Phase 14 분해).
 *
 * Composer.tsx `.composer-bar` div를 별도 컴포넌트로 추출.
 * 피커 3개(모델/Effort/모드) + 이미지 첨부 + UltraCode/REPL 토글 + 전송/중단/예약 버튼.
 *
 * 단방향: Composer가 모든 상태를 소유·전달, ComposerBar는 렌더 전담.
 * 인라인 색상 금지 — CSS 변수 토큰 사용(UI.md).
 * window.api 0. fs/Node 0.
 */
import { memo, type JSX } from 'react'
import { IconImage, IconArrowUp, IconClock } from '../common/icons'
import { MODELS, EFFORTS, MODES } from '../../lib/pickerOptions'
import { Picker } from './ComposerPicker'

// ── ComposerBar 프롭 ──────────────────────────────────────────────────────────

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
  doSend: () => void
  onAbort: () => void
  /** 이미지 첨부 버튼 클릭 핸들러 (img.handleAttach) */
  onAttachButton: () => void
}

// ── ComposerBar ───────────────────────────────────────────────────────────────

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
  doSend,
  onAbort,
  onAttachButton,
}: ComposerBarProps): JSX.Element {
  const hasContent = value.trim().length > 0 || attachedImages.length > 0

  return (
    <div className="composer-bar">
      {/* 이미지 첨부 버튼 */}
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

      {/* 모델 피커 */}
      <Picker
        ariaLabel="모델 선택"
        caption="모델"
        options={MODELS}
        value={model}
        onChange={setModel}
        dots
      />
      <span className="pick-div" aria-hidden="true" />

      {/* Effort 피커 */}
      <Picker
        ariaLabel="Effort 선택"
        caption="Effort"
        options={EFFORTS}
        value={effort}
        onChange={setEffort}
      />
      <span className="pick-div" aria-hidden="true" />

      {/* 모드 피커 */}
      <Picker
        ariaLabel="모드 선택"
        caption="모드"
        options={MODES}
        value={mode}
        onChange={setMode}
        align="right"
        icons
      />
      <span className="pick-div" aria-hidden="true" />

      {/* Phase 37: UltraCode 토글 pill */}
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
        <span className="pick-lbl">UltraCode</span>
        <span className="orch-badge">{orchestration ? 'ON' : 'OFF'}</span>
      </button>

      {/* Phase 5b: REPL 지속세션 토글 pill */}
      <button
        type="button"
        className={`pick-btn orch-toggle${replMode ? ' orch-on' : ''}`}
        aria-label="REPL 지속세션 모드 토글"
        aria-pressed={replMode}
        title={
          replMode
            ? 'REPL 지속세션 모드 — 세션을 유지하며 연속 대화(클릭하여 단발 모드로)'
            : '단발 모드 — 매 전송마다 새 세션(클릭하여 REPL 지속세션으로)'
        }
        onClick={() => setReplMode(!replMode)}
      >
        <span className="pick-lbl">REPL</span>
        <span className="orch-badge">{replMode ? 'ON' : 'OFF'}</span>
      </button>

      <span className="cm-spacer" />

      {/* 전송 / 중단 / 예약 버튼 */}
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
