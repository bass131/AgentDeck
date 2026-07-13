/**
 * PanelView.tsx — 멀티워크스페이스 단일 패널 뷰.
 *
 * 원본 MultiWorkspace.tsx에서 추출 (Phase 13 분해).
 * - 패널 헤더(번호·상태·폴더·프롬프트) / 컨텍스트 게이지 / 쓰레드 바디 / 풋터(RunPickers+PanelComposer).
 * - send/abort는 이 컴포넌트가 직접 session에 위임(LR3-03: usePanelLoop 훅 폐기 — /loop 앱
 *   인터셉트가 사라져 루프 상태를 별도로 다룰 이유가 없어짐. session.state.activeLoops(SDK
 *   크론) + pendingCommand(goal)를 resolveLoopStatus로 판정해 LoopStatusBanner에 흘려보낸다).
 * - LR3-06(영호 조정 2026-07-03): REPL 표시등(resolveReplLit)은 이제 replMode 자체만
 *   반영하는 상시 표시등 — RunPickers에 여전히 공유 판정 함수로 전달하되 activity 신호는
 *   더 이상 필요 없다(resolveLoopStatus는 배너·gloss 전용으로 남음).
 * - RunPickers / PanelComposer는 동일 panel/ 디렉토리 형제.
 *
 * M4-3 23e: 패널별 usePanelSession() 실 실행 배선.
 * M3: picker 리프팅(B4) — picker/setPicker props로 외부 상태 수용.
 *
 * CRITICAL: renderer untrusted — fs/Node 직접 호출 0.
 * CRITICAL: 전역 appStore.sendMessage/subscribeAgentEvents 미사용 (패널 훅만).
 * 인라인 색상 0 (ctx-ring conic --p / grid 동적 기하값 허용).
 */
import { memo, useState, useRef, useEffect, useCallback, type CSSProperties, type JSX } from 'react'
import {
  IconFolder,
  IconChevDown,
  IconCode,
  IconExpand,
  IconClose,
  IconSpark,
} from '../../common/icons'
import {
  MessageBubble,
  WorkingIndicator,
  NoticeItem,
  informationalTone,
  informationalDisplayText,
  permissionDeniedDisplayText,
} from '../../01_conversation/Conversation'
import { ScrollToBottomButton } from '../../01_conversation/ScrollToBottomButton'
import { CmdResultCard } from '../../01_conversation/CmdResultCard'
import { OrchestrationCard } from '../../05_agent/OrchestrationCard'
import { SubAgentInline } from '../../05_agent/SubAgentInline'
import { SubAgentFullscreen } from '../../05_agent/SubAgentFullscreen'
import { TodosSection } from '../../05_agent/AgentPanel'
import { LoopStatusBanner } from '../../07_notice/LoopStatusBanner'
import { PermissionCard } from '../../07_notice/PermissionCard'
import { HookTimeline } from '../../07_notice/HookTimeline'
import { resolveLoopStatus } from '../../../lib/loopStatus'
import { decideStopAction } from '../../../lib/stopAction'
import { resolveReplLit } from '../../../lib/replIndicator'
import { calcGauge } from '../../../lib/gaugeCalc'
import { isScrolledUp } from '../../../lib/scrollHelpers'
import {
  STATUS_META,
  DEFAULT_PICKER,
  type PickerState,
  type SamplePanel,
} from '../../../lib/multiAgentSampleData'
import {
  useAppStore,
  selectActiveMultiSessionId,
  computeTaskScope,
  type AttachedImage,
} from '../../../store/appStore'
import type { PanelSessionHookResult } from '../../../store/panelSession'
import { useUltracodeToggle } from '../../../store/ultracodeToggle'
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

  // LR4 P07: REPL 모드가 전역 단일 필드→세션별(패널별)로 이관됨 — 이 패널 자신의
  // session.state.replMode/session.setReplMode를 사용한다(전역 appStore 비의존).
  // ON이면 패널 send도 persistent + 패널별 안정 sessionKey(슬롯 기반) → cron-turn이
  // 같은 패널로 라우팅. /loop는 SDK 통과.
  const replMode = session.state.replMode
  const setReplMode = session.setReplMode
  const activeMultiSessionId = useAppStore(selectActiveMultiSessionId)
  const panelSessionKey = `multi:${activeMultiSessionId ?? 'm'}:slot:${slot}`

  // UltraCode 토글 — ephemeral(비영속). buildPersistState/multiStore 미포함.
  // UC1-P07(ADR-032 개정 v2): 지속 토글(one-shot 폐기, P04) + 기본값 ON(권한 진실원
  // 단일화 — 첫 실행부터 Workflow 경로 개방, 실사용은 perm-card가 게이트).
  // LR4 P06: 컴포넌트 로컬 useState → 패널 스코프(panelSessionKey) store로 리프팅
  // (멀티↔단일 왕복·멀티세션 재마운트에도 패널별 OFF 보존 — REPL sessionKey와 동일
  // 키 스킴 재사용, 신규 키 스킴 0).
  const [orchestration, setOrchestration] = useUltracodeToggle(panelSessionKey)

  // 실데이터 상태 — session에서 파생
  const status = LIVE_STATUS_META[liveStatus(session)]
  const cwdLabel = workspaceRoot ? basename(workspaceRoot) : (panel.cwd ? basename(panel.cwd) : '폴더 선택')

  // 컨텍스트 게이지: 실 usage + lastContextWindow
  const gauge = calcGauge(session.state.lastUsage, picker.model, session.state.lastContextWindow)
  const ctxPct = gauge.pct

  // Phase A-2 + M6: thread 기반으로 이행 (패널은 msg/cmdresult 표시 — 도구카드 미표시 유지)
  // FB2(영호 육안 피드백 2026-07-04 ④): pendingPermission/pendingQuestion — WorkingIndicator
  // 억제 게이팅에 사용(단일챗 Conversation.tsx L771과 동일 조건).
  const {
    thread,
    isRunning,
    errorMessage,
    activeLoops: panelActiveLoops,
    pendingCommand,
    loopsStoppedNotice,
    goalRun,
    bannerStale,
    staleDismissed,
    thinkingText,
    pendingPermission,
    pendingQuestion,
    // GAP1 P01b(T-08): panelApply가 공유 applyAgentEvent(reducer/lifecycle.ts handleTodos)
    // 경유로 이미 채우는 필드 — 신규 배선 0, 마운트만 누락돼 있었다.
    todos: panelTodos,
    // GAP1 P04(턴 신뢰성 신호): panelApply가 공유 applyAgentEvent(reducer/reliability.ts)
    // 경유로 이미 채우는 필드 — 단일챗(Conversation.tsx)과 동일 배선, 신규 IPC 0.
    apiRetry: panelApiRetry,
    compacting: panelCompacting,
    sdkSessionState: panelSdkSessionState,
    // GAP1 P05(훅 콕핏): panelApply가 공유 applyAgentEvent(reducer/cockpit.ts) 경유로 이미
    // 채우는 필드 — 단일챗과 동일 배선, 신규 IPC 0.
    hookRuns: panelHookRuns,
  } = session.state
  // LR3-06: 단일채팅과 동일 판정 재사용(단일 표시 불변식 — resolveLoopStatus 한 곳).
  // gloss는 단일 모드 전용(.conversation)이라 패널엔 없음 — 배너만 이 판정 사용.
  // 정지 신뢰 피드백: abort로 루프를 끊은 직후 stopped 확인 배너(세 번째 인자).
  // goal 표시 수명 일원화(BL1 후속): session.state.goalRun — panelApply가 공유
  // applyAgentEvent를 경유해 단일채팅과 동일한 begin-command/handleAutonomyStatus/
  // handleError 처리를 받는다(두 번째 인자, 가시성+내용 단일 소스 — autonomyActive는
  // 이 판정에서 완전히 제외).
  // BL1 P03: session.state.bannerStale/staleDismissed — panelSession.ts 매니저의 패널별
  // 독립 stale-watchdog이 갱신(4·5번째 인자, 단일채팅과 동일 판정 함수 재사용).
  const panelLoopStatus = resolveLoopStatus(panelActiveLoops, goalRun, loopsStoppedNotice, bannerStale, staleDismissed)
  // 영호 조정 2026-07-03: REPL 표시등 = replMode 상시 반영(활동 무관) — activity 인자 제거.
  const replLit = resolveReplLit(replMode)
  // B2: 패널 작업 범위(파일·도구 수) — 실데이터(session.state changedFiles + thread) 파생.
  const panelScope = computeTaskScope(session.state)
  // M6 + Phase 37 #4b(B-2) + F-G: orchestration·subagent 포함 (멀티 패널엔 우측 패널이 없어
  // 서브에이전트를 채팅 인라인으로 표시 — 단일과 공통)
  // GAP1 P05(훅 콕핏): informational/permission-denied도 포함 — 자동거부·훅 차단 사유는
  // 멀티패널에서도 "왜 막혔는지"가 보여야 한다(단일챗과 동일 노출 지점, 브리프 명시).
  const threadMsgs = thread.filter(
    (item): item is Extract<typeof item, { kind: 'msg' | 'cmdresult' | 'orchestration' | 'subagent' | 'informational' | 'permission-denied' }> =>
      item.kind === 'msg' ||
      item.kind === 'cmdresult' ||
      item.kind === 'orchestration' ||
      item.kind === 'subagent' ||
      item.kind === 'informational' ||
      item.kind === 'permission-denied'
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

  // ── FB2(영호 육안 피드백 2026-07-04 ⑤): 자동 스크롤 — 단일챗 Conversation.tsx(scrollRef/
  // userScrolledUp/handleScroll/isScrolledUp) 동형 이식. 단일챗은 .chat-scroll을 스크롤
  // 컨테이너로 쓰지만(.thread가 내용 컨테이너), 패널은 .ma-p-thread가 스크롤 컨테이너이고
  // .ma-p-messages가 내용 컨테이너 — 역할 대응만 다를 뿐 판정 로직은 완전히 동일하다.
  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)

  // thread 변경 시 자동 스크롤(사용자가 스크롤업 중이면 정지) — Conversation.tsx L406-414 동형.
  useEffect(() => {
    if (userScrolledUp.current) return
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [thread])

  // P11 동형: MessageBubble도 streaming 시 SmoothMarkdown 점진 reveal을 쓰므로(도구카드는
  // 패널 미표시) thread 참조가 안 바뀌어도 콘텐츠 높이가 프레임마다 자란다 — ResizeObserver로
  // .ma-p-messages 높이 변화를 감지해 같은 방식으로 따라간다(Conversation.tsx L419-436 동형).
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      if (!userScrolledUp.current) {
        container.scrollTop = container.scrollHeight
      }
    })

    const messages = container.querySelector('.ma-p-messages')
    if (messages) observer.observe(messages)

    return () => observer.disconnect()
  }, [isRunning])

  // handleScroll — 매 scroll 이벤트마다 "바닥 근접" 여부를 다시 판정해 userScrolledUp에
  // 대입한다. 이 재판정 자체가 재부착 메커니즘이다: 사용자가 바닥 40px 이내로 되돌아오면
  // scrolled=false가 되어 다음 thread 갱신부터 자동 스크롤이 다시 붙는다(Conversation.tsx
  // L438-449 동형 — threshold 40px는 lib/scrollHelpers.ts 기본값 공유).
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const scrolled = isScrolledUp({
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
    })
    userScrolledUp.current = scrolled
    setShowScrollToBottom(scrolled)
  }, [])

  // ── send/abort — session에 직접 위임 (LR3-03: usePanelLoop 훅 폐기) ──────────
  // 구 usePanelLoop.sendNow/handleAbort를 그대로 이관 — /loop 인터셉트·루프 틱 스케줄만 제거.
  const handleSend = useCallback((text: string, imgs?: AttachedImage[]) => {
    // M3 sysPrompt 배선(M2 연계): panelSysPrompt → session.send() opts.sysPrompt 전달.
    // CRITICAL(신뢰경계): string만 운반 — SDK 형상은 backend 내부 처리(ADR-003).
    // orchestration: 엔진중립 boolean — 'Workflow' 리터럴 0. renderer는 boolean 전달만(ADR-003).
    // UC1-P07(ADR-032 v2): 전송되는 orchestration = 토글 상태 "그대로"(권한 진실원 단일화 —
    // P04의 키워드 OR 승격 폐지). text는 가공하지 않는다.
    // FB2 ⑤: 사용자가 직접 새 메시지를 보내면 스크롤업 상태를 리셋 — 단일챗
    // Conversation.tsx sendNow(L475)와 동형(전송 = "다시 바닥을 보고 싶다"는 암묵적 의도).
    userScrolledUp.current = false
    // CP1 P03 실증 노트: 여기 `workspaceRoot`는 이 컴포넌트의 prop이고, 이미
    // MultiWorkspace.tsx의 effectiveCwd(panelCwds[slot] ?? panelMetas[slot]?.cwd ?? 전역,
    // P15부터 존재)가 "패널 개별 선택 > 복원 메타 > 전역" 순으로 해결해 넘긴 값이다 —
    // 즉 `panel.cwd`(panelMetas 원본, PromptModal/복원 시점 값만 반영)를 여기서 다시
    // 우선시키면 방금 재선택한 최신 cwd(panelCwds)를 오히려 되돌리는 회귀가 된다
    // (복원 후 재선택 시 panel.cwd는 stale). cwdLabel(위 L147)도 동일하게 이 prop을
    // 1순위로 쓰므로 라벨=실행 cwd 정합은 이미 성립 — 배선 갭은 팔레트 IPC(root
    // 파라미터 미배선) 쪽이었다(useInputPalettes.ts에서 해결, 99.Others/tests/renderer/
    // cp1-p03-panel-cwd-wiring.test.tsx가 이 정합을 실증).
    void session.send(text, {
      picker,
      workspaceRoot: workspaceRoot ?? undefined,
      ...(panel.sysPrompt ? { sysPrompt: panel.sysPrompt } : {}),
      ...(orchestration ? { orchestration: true } : {}),
      ...(imgs && imgs.length > 0 ? { images: imgs } : {}),
      // Phase 5a(ADR-024): replMode ON → persistent + 패널별 sessionKey(단발 토글 OFF면 미포함).
      ...(replMode ? { persistent: true, sessionKey: panelSessionKey } : {}),
    })
    // UC1-P04(ADR-032): one-shot 폐기 — 지속 토글이므로 전송 후 자동 OFF하지 않는다.
  }, [session, picker, workspaceRoot, panel.sysPrompt, orchestration, replMode, panelSessionKey])

  const handleAbort = useCallback(() => {
    // Phase 5b: 정지 의미 분리 — replMode ON이면 turn만 중단(세션 유지), OFF면 세션 종료.
    // FB2 P02(P01 진단 반영): interrupt()는 "현재 턴"만 중단 — goal/loop의 self-re-arm
    // (세션 스코프 자기지속)은 세션을 끝내는 abort()만이 해제한다. decideStopAction이
    // panelActiveLoops/pendingCommand를 함께 보고 goal/loop 활성 중엔 replMode 무관
    // abort로 승격한다(Conversation.tsx handleAbort와 판정 로직 공유 — 중복 정의 금지).
    const action = decideStopAction(replMode, panelActiveLoops, pendingCommand)
    if (action === 'interrupt') {
      const runId = session.state.currentRunId
      if (runId) {
        void window.api.agentInterrupt({ runId })
      }
    } else {
      void session.abort()
    }
  }, [session, replMode, panelActiveLoops, pendingCommand])

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

      {/* GAP1 P01b(T-08): 할 일 — AgentPanel.TodosSection 재사용(신규 컴포넌트 0).
          비어있을 때는 마운트하지 않아(패널 카드가 조밀한 멀티워크스페이스에서 "아직
          할 일이 없어요" 문구로 상시 클러터를 만들지 않음) 위 .ma-p-scope와 동일한
          "실데이터 있을 때만" 관례를 그대로 따른다. */}
      {panelTodos.length > 0 && <TodosSection todos={panelTodos} isRunning={isRunning} />}

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
        <div
          className="ma-p-thread scroll"
          ref={scrollRef}
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
          aria-label="대화 내용"
          style={{ position: 'relative' }}
        >
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
                if (item.kind === 'informational') {
                  // GAP1 P05(S-03): 단일챗과 동일 표시 카피 재사용(informationalTone/
                  // informationalDisplayText — Conversation.tsx export, 단일 진실원).
                  return (
                    <NoticeItem
                      key={item.id}
                      text={informationalDisplayText(item)}
                      time={item.time}
                      tone={informationalTone(item.level)}
                    />
                  )
                }
                if (item.kind === 'permission-denied') {
                  // GAP1 P05(S-04): 단일챗과 동일 표시 카피 재사용(permissionDeniedDisplayText).
                  return (
                    <NoticeItem
                      key={item.id}
                      text={permissionDeniedDisplayText(item)}
                      time={item.time}
                      tone="error"
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

              {/* FB2(영호 육안 피드백 2026-07-04 ④): 응답 대기 인디케이터 — 단일챗
                  Conversation.tsx L771-780과 동일 게이팅(isRunning && 권한/질문 대기중
                  아님 && 마지막 항목이 아직 live assistant 버블이 아님)을 그대로 이식.
                  WorkingIndicator 자체도 단일챗 컴포넌트를 재사용(신규 시각 문법 0). */}
              {isRunning && !pendingQuestion && !pendingPermission && (() => {
                const lastMsg = thread[thread.length - 1]
                const lastMsgIsLiveAssistant = lastMsg &&
                  lastMsg.kind === 'msg' &&
                  lastMsg.role === 'assistant' &&
                  !lastMsg.error
                return !lastMsgIsLiveAssistant
              })() && (
                // GAP1 P04(S-05): 단일챗과 동일 보강 — requires_action이면 그 문구 우선.
                <WorkingIndicator
                  text={panelSdkSessionState === 'requires_action' ? '작업 확인이 필요해요' : thinkingText}
                />
              )}

              {/* 에러 표시 */}
              {errorMessage && !isRunning && (
                <div className="ma-p-error" role="alert">
                  오류: {errorMessage}
                </div>
              )}
            </div>
          )}
          {/* FB2 ⑤: 맨 아래로 플로팅 버튼 — 위로 스크롤 시만 표시(Conversation.tsx
              ScrollToBottomButton과 동일 컴포넌트 재사용, .ma-p-thread가 position:relative
              앵커). */}
          <ScrollToBottomButton
            show={showScrollToBottom}
            onClick={() => {
              const el = scrollRef.current
              if (el) {
                el.scrollTop = el.scrollHeight
                userScrolledUp.current = false
                setShowScrollToBottom(false)
              }
            }}
          />
        </div>
        {/* FB2 P08 개정(영호 피드백 ⑥): 배너를 .ma-p-foot(픽커+컴포저로 빽빽한 "입력 UI
            영역") 밖으로 빼서 .ma-p-body(채팅 스트림 컨테이너) 하단·.ma-p-thread 바로
            다음에 배치 — 단일챗(Conversation.tsx: .chat-scroll 바로 다음, Composer 바로
            앞) 배치 문법과 동형화. .ma-p-thread가 flex:1이라 배너가 늘어나면 스레드
            높이가 그만큼 줄어드는 것도 단일챗(.chat-scroll flex:1)과 동일한 거동.
            너비: LoopStatusBanner.css 기본 margin(0 14px)이 .ma-p-messages의 14px 패딩과
            이미 같은 값이라 별도 CSS 불필요(우연이 아니라 두 값이 같은 "메시지 컬럼" 인셋
            관례를 따름). LR2-03/LR3-03/LR3-06: 통합 루프 배너 — SDK 크론(panelActiveLoops)
            > goal(pendingCommand) 표시. none이면 자체 null. 정지=session.abort(세션스코프
            크론 사멸, goal 변형은 정지 버튼 없음 — PanelComposer 자체 중단 버튼이 대신함). */}
        <LoopStatusBanner
          status={panelLoopStatus}
          onStopSdk={() => session.abort()}
          onDismissStopped={session.dismissLoopsStopped}
          // BL1 P03: stale(신호 없음) 배너 수동 해제 — 이 패널만(session.dismissGoalStale).
          onDismissStale={session.dismissGoalStale}
          // FB2 P08: 3단 위계의 "현재 작업내용" — 패널별 session.state.thinkingText 재사용(신규 IPC 0).
          currentActivity={thinkingText}
          // GAP1 P04(S-02/S-01): 단일챗과 동일 배선 — 패널별 session.state 재사용(신규 IPC 0).
          apiRetry={panelApiRetry}
          compacting={panelCompacting}
        />
        {/* GAP1 P05(훅 콕핏): 훅 타임라인 — 단일챗과 동일 배너 슬롯 배치(LoopStatusBanner
            바로 다음). hookRuns 비어있으면 자체 null 렌더(소음 억제). */}
        <HookTimeline hookRuns={panelHookRuns} />
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
          replLit={replLit}
        />
        {/* BF3 Phase 06(ADR-030): 권한 요청 인라인 카드 — 단일챗 Conversation.tsx와 동일
            컴포넌트를 패널 컴포저 위에 마운트(1 컴포넌트 2 마운트 지점, 로직 중복 금지).
            session.state.pendingPermission은 공유 reducer(applyAgentEvent)가 이미 채워두고
            (panelApply가 자기 runId 이벤트만 적용 — 타 패널 무영향), 응답은 session.
            respondPermission이 자기 runId/requestId로 처리(패널별 격리, 오배선 불가). */}
        <PermissionCard
          pending={session.state.pendingPermission}
          onRespond={(choice) => void session.respondPermission(choice)}
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
