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
import { memo, useEffect, useLayoutEffect, useRef, useState, useCallback, type JSX } from 'react'
import { computeComposerHeight } from '../../lib/composerHeight'
import type { TokenUsage } from '../../../../shared/agent-events'
import type { UsageInfo } from '../../../../shared/ipc-contract'
import {
  DEFAULT_MODEL,
  DEFAULT_EFFORT,
} from '../../lib/pickerOptions'
import { useAppStore, selectPickerMode, selectReplMode, selectConversationId } from '../../store/appStore'
import { resolveReplLit } from '../../lib/replIndicator'
import { useUltracodeToggle, SINGLE_CHAT_DEFAULT_SCOPE, migrateSingleChatDefaultScope } from '../../store/ultracodeToggle'

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

  // UC1-P07(ADR-032 개정 v2): 오케스트레이션 토글 — 권한 진실원 단일화. 기본값 ON(첫
  // 실행부터 Workflow 경로 개방, 실사용은 perm-card가 게이트) + 지속(사용자가 끌 때까지
  // 유지, one-shot 폐기는 P04에서 이미 확정).
  // LR4 P06: 컴포넌트 로컬 useState → 대화별 스코프 store로 리프팅(단일→멀티→단일 왕복
  // 언마운트에도 OFF 보존 — 오복원 버그 수정). 비영속(휘발) — ultracodeToggle.ts 참조.
  const conversationId = useAppStore(selectConversationId)
  const [orchestration, setOrchestration] = useUltracodeToggle(conversationId ?? SINGLE_CHAT_DEFAULT_SCOPE)

  // reviewer 🟡#1 봉합(P06 후속): 신규 미저장 대화(conversationId=null → 키
  // SINGLE_CHAT_DEFAULT_SCOPE)가 첫 전송으로 실제 id를 발급받는 순간(null→id 전이)에만
  // SINGLE_CHAT_DEFAULT_SCOPE에 쌓인 OFF를 새 키로 옮긴다(migrateSingleChatDefaultScope
  // 참조). 조건이 "직전 null && 새 값 non-null"로 좁혀져 있어 대화 A→B(둘 다 non-null,
  // 시나리오 B 대화별 독립 계약) 전환이나 id→null 복귀에는 전혀 관여하지 않는다.
  // reviewer 델타(비차단 🟡, P06 마무리): useEffect(paint 후)는 전이 프레임에 새 키가
  // 아직 마이그레이션되기 전 상태(ON)로 1프레임 페인트될 수 있다 — useLayoutEffect(paint
  // 전 동기 실행)로 교체해 배지 깜빡임을 제거한다. 로직 무변경, 실행 타이밍만 당김.
  const prevConversationIdRef = useRef(conversationId)
  useLayoutEffect(() => {
    const prev = prevConversationIdRef.current
    if (prev === null && conversationId !== null) {
      migrateSingleChatDefaultScope(conversationId)
    }
    prevConversationIdRef.current = conversationId
  }, [conversationId])

  // Phase 5b: REPL 지속세션 토글 — 전역 store
  const replMode = useAppStore(selectReplMode)
  const setReplMode = useAppStore((s) => s.setReplMode)
  // LR3-06(영호 조정 2026-07-03): REPL 버튼 = 상시 표시등 — 토글 ON이면 활동 무관 계속
  // 점등, OFF면 소등. 판정은 replMode 그 자체(resolveReplLit는 이제 단순 항등 함수).
  const replLit = resolveReplLit(replMode)

  // 전송 래퍼: UC1-P07(ADR-032 v2) — 전송되는 orchestration은 토글 상태 "그대로"(보이는
  // 것 = 전송되는 것). P04가 넣었던 키워드 OR 승격은 폐지 — 키워드는 더 이상 권한을
  // 올리지 않는다(감지 함수는 하이라이트·힌트 표시에만 쓰인다, 아래 kwMirror 참고).
  const doSend = useCallback((): void => {
    onSend({ model, effort, mode, orchestration })
  }, [onSend, model, effort, mode, orchestration])

  // ── textarea ref ──────────────────────────────────────────────────────────
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // ── 훅 조립 ──────────────────────────────────────────────────────────────
  const slash = useSlashPalette({ value, isRunning, workspaceRoot, onChange, onSlashAsk })
  const mention = useMentionPalette({ value, mentionFiles, onChange, inputRef })
  const img = useImageAttach({ onAttachFiles })
  const hist = useInputHistory({ onChange, inputRef, onCaretChange: mention.setCaret })
  // UC1-P05: UltraCode 키워드("ultracode"/"/workflows") 하이라이트 미러 오버레이.
  // detectOrchestrationKeyword와 동일 규칙(orchestrationKeyword.ts 단일 진실원)으로
  // 세그먼트 분해 — 표시 전용, 전송 로직(doSend)은 불변.
  // UC1-P07(ADR-032 v2): 토글 상태를 훅에 전달 — ON이면 그라데이션(P05 그대로), OFF면
  // 뮤트 스타일(승격되지 않는다는 신호, highlightVariant 참고).
  // FB2-P06: 일반 슬래시 커맨드(`/work-run` 등) 토큰도 같은 미러로 하이라이트 — 세그먼트가
  // kind:'none'|'orchestration'|'slash'로 일반화(composerHighlight.ts).
  const kwMirror = useComposerKeywordMirror(value, inputRef, orchestration)

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

          {/* UC1-P05: 미러 오버레이 — textarea는 부분 스타일 불가라 grid-stack으로 두
              요소를 겹친다. 키워드가 없는 평소 타이핑은 ghostActive=false라 미러가
              마운트조차 안 되고 네이티브 textarea 그대로(회귀 위험 0). */}
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
              onKeyDown={handleKey}
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

          {/* UC1-P07(ADR-032 v2): OFF 유도 힌트 — 토글이 꺼진 채로 키워드를 언급하면
              그 턴은 승격되지 않는다(진실원=토글 단일). "보이지 않는 승격"의 반대급부로
              사용자에게 명시적 사용법을 안내 — 컴포저 높이 변동은 이 한 줄뿐(레이아웃
              점프 최소화, .composer-disabled-hint와 동일 관례).
              FB2-P06: ghostActive는 이제 슬래시 커맨드 토큰만으로도 true가 될 수 있어
              hasOrchestrationKeyword로 좁힌다 — 그렇지 않으면 "/work-run"만 입력해도
              오케스트레이션과 무관한 이 힌트가 잘못 뜬다(간섭 버그, 여기서 선제 차단). */}
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

export const Composer = memo(ComposerInner)
export default Composer
