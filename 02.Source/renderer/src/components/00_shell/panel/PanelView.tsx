/**
 * PanelView.tsx — 멀티워크스페이스 단일 패널 뷰.
 *
 * 원본 MultiWorkspace.tsx에서 추출 (Phase 13 분해).
 * - 패널 헤더(번호·상태·폴더·프롬프트) / 컨텍스트 게이지 / 쓰레드 바디 / 풋터(RunPickers+PanelComposer).
 * - 루프 상태는 usePanelLoop 훅으로 분리.
 * - RunPickers / PanelComposer는 동일 panel/ 디렉토리 형제.
 *
 * M4-3 23e: 패널별 usePanelSession() 실 실행 배선.
 * M3: picker 리프팅(B4) — picker/setPicker props로 외부 상태 수용.
 *
 * CRITICAL: renderer untrusted — fs/Node 직접 호출 0.
 * CRITICAL: 전역 appStore.sendMessage/subscribeAgentEvents 미사용 (패널 훅만).
 * 인라인 색상 0 (ctx-ring conic --p / grid 동적 기하값 허용).
 */
import { memo, useState, useCallback, type CSSProperties, type JSX } from 'react'
import {
  IconFolder,
  IconChevDown,
  IconCode,
  IconExpand,
  IconClose,
  IconSpark,
} from '../../common/icons'
import { MessageBubble } from '../../01_conversation/Conversation'
import { CmdResultCard } from '../../01_conversation/CmdResultCard'
import { OrchestrationCard } from '../../05_agent/OrchestrationCard'
import { SubAgentInline } from '../../05_agent/SubAgentInline'
import { SubAgentFullscreen } from '../../05_agent/SubAgentFullscreen'
import { LoopStatusBanner } from '../../07_notice/LoopStatusBanner'
import { resolveLoopStatus } from '../../../lib/loopStatus'
import { calcGauge } from '../../../lib/gaugeCalc'
import {
  STATUS_META,
  DEFAULT_PICKER,
  type PickerState,
  type SamplePanel,
} from '../../../lib/multiAgentSampleData'
import { useAppStore, selectReplMode, selectActiveMultiSessionId, computeTaskScope } from '../../../store/appStore'
import type { PanelSessionHookResult } from '../../../store/panelSession'
import { usePanelLoop } from '../../../hooks/usePanelLoop'
import { RunPickers } from './PanelPicker'
import { PanelComposer } from './PanelComposer'

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

// ── 경로 basename 헬퍼 ────────────────────────────────────────────────────────

function basename(p: string): string {
  const parts = p.split(/[\\/]+/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : p
}

// ── PanelView ────────────────────────────────────────────────────────────────

export interface PanelViewProps {
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
  // Phase 5b: REPL 토글 액션 — RunPickers에 전달
  const setReplMode = useAppStore((s) => s.setReplMode)
  const activeMultiSessionId = useAppStore(selectActiveMultiSessionId)
  const panelSessionKey = `multi:${activeMultiSessionId ?? 'm'}:slot:${slot}`

  // 실데이터 상태 — session에서 파생
  const status = LIVE_STATUS_META[liveStatus(session)]
  const cwdLabel = workspaceRoot ? basename(workspaceRoot) : (panel.cwd ? basename(panel.cwd) : '폴더 선택')

  // 컨텍스트 게이지: 실 usage + lastContextWindow
  const gauge = calcGauge(session.state.lastUsage, picker.model, session.state.lastContextWindow)
  const ctxPct = gauge.pct

  // Phase A-2 + M6: thread 기반으로 이행 (패널은 msg/cmdresult 표시 — 도구카드 미표시 유지)
  const { thread, isRunning, errorMessage, activeLoops: panelActiveLoops } = session.state
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
  const panelHistory = thread
    .filter((item): item is Extract<typeof item, { kind: 'msg' }> => item.kind === 'msg')
    .filter((item) => item.role === 'user')
    .map((item) => item.text)
    .filter((t) => t.trim().length > 0)

  // ── 루프 상태 — usePanelLoop 훅으로 위임 (Phase 13 분해) ──────────────────
  // CRITICAL(Q2): 루프 상태를 패널 컴포넌트 로컬에 둬 패널 간 격리 보장.
  const { activeLoop, setActiveLoop, handleSend, handleAbort } = usePanelLoop({
    session,
    picker,
    replMode,
    workspaceRoot,
    panelSysPrompt: panel.sysPrompt,
    orchestration,
    setOrchestration,
    panelSessionKey,
    isRunning,
  })

  const handleExpandClick = useCallback(() => onExpand(slot), [onExpand, slot])
  const handleExpandClose = useCallback(() => onExpand(-1), [onExpand])
  const handlePromptClick = useCallback(() => onPrompt(slot), [onPrompt, slot])
  const handlePickFolderClick = useCallback(() => onPickFolder(slot), [onPickFolder, slot])

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
              onClick={handleExpandClose}
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
            onClick={handlePickFolderClick}
            title={workspaceRoot || panel.cwd || '작업 폴더 선택'}
          >
            <IconFolder size={13} />
            <span className="ma-p-folder-name">{cwdLabel}</span>
            <IconChevDown size={11} />
          </button>
          <button
            type="button"
            className={`ma-p-prompt${panel.sysPrompt ? ' on' : ''}`}
            onClick={handlePromptClick}
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
      <div className="ma-p-body" style={{ position: 'relative' }}>
        {!expanded && (
          <button
            type="button"
            className="ma-p-zoom"
            aria-label="크게 보기"
            onClick={handleExpandClick}
          >
            <IconExpand size={13} />
            <span>크게 보기</span>
          </button>
        )}
        <div className="ma-p-thread scroll" style={{ position: 'relative' }}>
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
                // msg 렌더 — Phase 5b: cron-turn 배지(origin prop) 전달
                const isLastMsg = idx === threadMsgs.length - 1
                const isStreaming = isLastMsg && item.role === 'assistant' && isRunning && !!lastIsLiveAssistant
                return (
                  <MessageBubble
                    key={item.id}
                    role={item.role}
                    content={item.text}
                    streaming={isStreaming}
                    images={item.images}
                    origin={item.origin}
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
          replMode={replMode}
          setReplMode={setReplMode}
        />
        {/* LR2-03: 통합 루프 배너 — 앱 타이머(activeLoop)·SDK 크론(panelActiveLoops) 단일
            표면. none이면 자체 null. SDK 정지=session.abort(세션스코프 크론 사멸). */}
        <LoopStatusBanner
          status={resolveLoopStatus(activeLoop, panelActiveLoops)}
          onStopApp={() => setActiveLoop(null)}
          onDismissApp={() => setActiveLoop(null)}
          onStopSdk={() => session.abort()}
        />
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
