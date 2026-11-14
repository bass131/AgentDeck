import { memo, type JSX } from 'react'
import { IconCode, IconTerminal } from '@renderer/02_Common/icons'
import { MODELS, MODES, effortPickerFor } from '@renderer/03_Agent/pickerOptions'
import { Picker } from './ComposerPicker'

// 선택기 묶음 하나(M05 G9b P1·P2) — 단일 입력창 바와 멀티 패널이 같은 묶음을 쓴다.
// 값의 거처(store·패널 상태)와 라이브 전환 요청은 호출부가 setter로 넘긴다.
export interface PickerGroupProps {
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

function PickerGroupInner({
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
}: PickerGroupProps): JSX.Element {
  const effortPicker = effortPickerFor(model, effort)
  const effortTitle = effortPicker.disabled
    ? '이 모델은 effort를 지원하지 않아요'
    : 'Effort는 새 대화(세션)부터 적용됩니다'
  const effortNote = effortPicker.disabled
    ? '이 모델은 effort를 지원하지 않아요.'
    : 'Effort는 세션 생성 시 고정돼요. 변경은 새 대화(세션)부터 적용돼요.'

  return (
    <>
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
        onClick={() => setOrchestration(!orchestration)}
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
    </>
  )
}

export const PickerGroup = memo(PickerGroupInner)
