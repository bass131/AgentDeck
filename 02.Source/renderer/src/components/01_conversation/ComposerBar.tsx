/**
 * ComposerBar.tsx — 컴포저 하단 도구 모음 (Phase 14 분해, LR3-06 REPL 표시등 재정의).
 *
 * Composer.tsx `.composer-bar` div를 별도 컴포넌트로 추출.
 * 피커 3개(모델/Effort/모드) + 이미지 첨부 + UltraCode 토글 + REPL 상태 표시등 + 전송/중단/예약 버튼.
 *
 * LR3-06: REPL 버튼은 더 이상 UltraCode와 같은 `.orch-toggle`(보라 flow+glow)을 공유하지
 * 않는다 — 전용 `.repl-toggle`/`.repl-lit`(금색) 클래스로 분리. 토글 동작(클릭 시 replMode
 * 반전)은 그대로, 점등만 replLit(Composer가 미리 판정)로.
 * 영호 조정(2026-07-03): replLit은 이제 replMode 자체와 동일 의미(ON=상시 점등, 활동
 * 무관) + 은은한 금색 형광 pulse 연출(Composer.css `.repl-lit` — 안티슬롭 글로우 금지의
 * 명시적 예외, 디자인 오너 승인). ComposerBar 자체는 여전히 순수 렌더러 — 판정 로직 0.
 *
 * 단방향: Composer가 모든 상태를 소유·전달, ComposerBar는 렌더 전담.
 * 인라인 색상 금지 — CSS 변수 토큰 사용(UI.md).
 * window.api 0. fs/Node 0.
 */
import { memo, type JSX } from 'react'
import { IconImage, IconArrowUp, IconClock, IconCode, IconTerminal } from '../common/icons'
import { MODELS, MODES, effortPickerFor } from '../../lib/pickerOptions'
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
  /** LR3-06: REPL 상태 표시등 점등 여부(resolveReplLit) — 토글(replMode)과 별개. */
  replLit: boolean
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
  replLit,
  doSend,
  onAbort,
  onAttachButton,
}: ComposerBarProps): JSX.Element {
  const hasContent = value.trim().length > 0 || attachedImages.length > 0

  // LM1 P07(영호 확정 2026-07-17): 모델은 라이브 전환(P04) 가능하지만 effort는 SDK
  // 라이브 API 부재로 세션 생성 시 1회 고정(비대칭). 선택 모델의 지원 표
  // (shared/model-effort.ts)로 옵션·비활성·표시값을 계산 — 게이트는 표시용(소음 절감),
  // 전송 시점 최종 클램프의 신뢰 근거는 main(effortToOptions, CORE-01 관례).
  const effortPicker = effortPickerFor(model, effort)
  const effortTitle = effortPicker.disabled
    ? '이 모델은 effort를 지원하지 않아요'
    : 'Effort는 새 대화(세션)부터 적용됩니다'
  const effortNote = effortPicker.disabled
    ? '이 모델은 effort를 지원하지 않아요.'
    : 'Effort는 세션 생성 시 고정돼요. 변경은 새 대화(세션)부터 적용돼요.'

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

      {/* 모델 피커 — LM1 P04: 진행 중 REPL 세션 라이브 전환 지원(setSelectedModel →
          agentSetModel, store/slices/composer.ts requestLiveModelSwitch). 단발 모드는
          여전히 새 대화부터 적용(게이트 1: replMode). 체감 언어 정본(영호 확정
          2026-07-17 ②) — 내부 용어 없이 캐시 무효화 비용 고지, 툴팁 + 펼침 하단 안내
          두 지점 모두 표시(발견성 확보). */}
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

      {/* Effort 피커 — LM1 P07: 모델별 지원 표 반영(비활성·xhigh 클램프·세션 고정 고지).
          저장값(effort)은 변형하지 않는다 — displayValue만 표시 클램프(effortPickerFor). */}
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

      {/* 모드 피커 — GAP1 P13: 진행 중 REPL 세션 라이브 전환 지원(setPickerMode →
          agentSetMode, store/slices/composer.ts). 단 Bypass는 라이브 전환 불가(세션 생성
          시에만 — 영호 박제 2026-07-14) → GAP1 P02 모델 피커 선례 미러로 title/note 두
          지점 안내(신규 카드/모달/토스트 발명 금지). */}
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
        {/* 아이콘 칩(영호 시안 2026-07-03): 라운드 사각 배지 안 `</>` — ON 시 네온 톤 */}
        <span className="toggle-chip" aria-hidden>
          <IconCode size={11} />
        </span>
        <span className="pick-lbl">UltraCode</span>
        <span className="orch-badge">{orchestration ? 'ON' : 'OFF'}</span>
      </button>

      {/* LR3-06(영호 조정 2026-07-03): REPL 상태 표시등 — 토글(replMode) 기능은 유지
          (OFF=강제 단발, P03 계약), 점등(repl-lit)은 이제 replMode 자체(ON=상시 점등,
          활동 무관 — resolveReplLit, Composer가 판정). */}
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
        {/* 아이콘 칩(영호 시안 2026-07-03): 라운드 사각 배지 안 `>_` — 점등 시 금색 톤 */}
        <span className="toggle-chip" aria-hidden>
          <IconTerminal size={11} />
        </span>
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
