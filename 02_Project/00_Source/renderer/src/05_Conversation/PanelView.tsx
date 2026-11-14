import { memo, useState, useRef, useEffect, useCallback, useMemo, type CSSProperties, type JSX } from 'react'
import {
  IconFolder,
  IconChevDown,
  IconCode,
  IconExpand,
  IconClose,
  IconSpark,
} from '@renderer/02_Common/icons'
import { ScrollToBottomButton } from '.'
import { ThreadView } from './ThreadView'
import { SubAgentFullscreen, TodosSection } from '@renderer/03_Agent'
import { LoopStatusBanner, PermissionCard, HookTimeline } from '@renderer/10_Engine'
import { QuestionModal } from '@renderer/03_Agent/prompt'
import { resolveLoopStatus } from '@renderer/03_Agent/loopStatus'
import { decideStopAction } from '@renderer/03_Agent/stopAction'
import { resolveReplLit } from './replIndicator'
import { calcGauge } from '@renderer/03_Agent/gaugeCalc'
import { isScrolledUp } from '@renderer/02_Common/scrollHelpers'
import {
  STATUS_META,
  DEFAULT_PICKER,
  type PickerState,
  type SamplePanel,
} from '@renderer/03_Agent/multiAgentDefaults'
import {
  useAppStore,
  selectActiveMultiSessionId,
  computeTaskScope,
  type AttachedImage,
} from '@renderer/00_App/appStore'
import { makePanelSlotKey, type PanelSessionHookResult } from '@renderer/03_Agent/state/panelSession'
import { requestLiveModeSwitch, requestLiveModelSwitch } from './state/composer'
import { useUltracodeToggle } from '@renderer/03_Agent/state/ultracodeToggle'
import { MODES } from '@renderer/03_Agent/pickerOptions'
import { ComposerView, type PickerValues } from './ComposerView'
import { useQueuedSend } from './hooks/useQueuedSend'
import { filesToAttachedImages } from './imageAttach'

// Shift+Tab 모드 순환(P5) — 단일 cyclePickerMode와 같은 순서(MODES)로 다음 모드를 고른다.
function nextModeId(current: string): string {
  const idx = MODES.findIndex((m) => m.id === current)
  return MODES[(idx + 1) % MODES.length].id
}

type LiveStatus = 'idle' | 'running' | 'done' | 'error'

function liveStatus(session: PanelSessionHookResult): LiveStatus {
  const { isRunning, errorMessage, thread } = session.state
  if (isRunning) return 'running'
  if (errorMessage) return 'error'
  if (thread.length > 0) return 'done'
  return 'idle'
}

const LIVE_STATUS_META: Record<LiveStatus, { label: string; cls: string }> = {
  idle:    STATUS_META.idle,
  running: STATUS_META.working,
  done:    STATUS_META.done,
  error:   STATUS_META.error,
}

function basename(p: string): string {
  const parts = p.split(/[\\/]+/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : p
}

export interface PanelViewProps {
  slot: number
  panel: SamplePanel
  session: PanelSessionHookResult
  workspaceRoot: string | null
  expanded?: boolean
  onExpand: (slot: number) => void
  onPrompt: (slot: number) => void
  onPickFolder: (slot: number) => void | Promise<void>
  picker?: PickerState
  setPicker?: (p: PickerState) => void
  mentionFiles?: string[]
  // /ask(L2·C7)와 첨부 이미지 뷰어(C4) — Shell이 단일과 같은 창을 연다.
  onSlashAsk?: () => void
  onOpenImage?: (images: string[], index: number) => void
  // 이 패널의 질문 창을 띄울 차례인가 — MultiWorkspace가 작업 공간 전체에서 하나만 고른다(pickQuestionSlot).
  // false인데 질문이 있으면 창 대신 머리에 「질문 대기」를 보인다. 단독 렌더(테스트·하네스)는 기본 true.
  questionActive?: boolean
}

export const PanelView = memo(function PanelView({
  slot,
  panel,
  session,
  workspaceRoot,
  expanded = false,
  questionActive = true,
  onExpand,
  onPrompt,
  onPickFolder,
  picker: pickerProp,
  setPicker: setPickerProp,
  mentionFiles = [],
  onSlashAsk,
  onOpenImage,
}: PanelViewProps): JSX.Element {
  const [localPicker, setLocalPicker] = useState<PickerState>({ ...DEFAULT_PICKER })
  const picker = pickerProp ?? localPicker
  const setPicker = setPickerProp ?? setLocalPicker

  const replMode = session.state.replMode
  const setReplMode = session.setReplMode

  const panelRunId = session.state.currentRunId
  const handleSetPicker = useCallback((p: PickerState): void => {
    if (p.mode !== picker.mode) {
      requestLiveModeSwitch(panelRunId, replMode, p.mode)
    }
    if (p.model !== picker.model) {
      requestLiveModelSwitch(panelRunId, replMode, p.model)
    }
    setPicker(p)
  }, [picker, setPicker, panelRunId, replMode])

  const enginePickerMode = session.state.enginePickerMode
  const lastEngineModeRef = useRef(enginePickerMode)
  useEffect(() => {
    if (enginePickerMode === lastEngineModeRef.current) return
    lastEngineModeRef.current = enginePickerMode
    if (enginePickerMode != null && enginePickerMode !== picker.mode) {
      setPicker({ ...picker, mode: enginePickerMode })
    }
  }, [enginePickerMode, picker, setPicker])
  const activeMultiSessionId = useAppStore(selectActiveMultiSessionId)
  const panelSessionKey = makePanelSlotKey(activeMultiSessionId, slot)

  const [orchestration, setOrchestration] = useUltracodeToggle(panelSessionKey)

  const status = LIVE_STATUS_META[liveStatus(session)]
  const cwdLabel = workspaceRoot ? basename(workspaceRoot) : (panel.cwd ? basename(panel.cwd) : '폴더 선택')

  const gauge = calcGauge(session.state.lastUsage, picker.model, session.state.lastContextWindow)
  const ctxPct = gauge.pct

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
    todos: panelTodos,
    apiRetry: panelApiRetry,
    compacting: panelCompacting,
    hookRuns: panelHookRuns,
    queue,
  } = session.state
  const panelLoopStatus = resolveLoopStatus(panelActiveLoops, goalRun, loopsStoppedNotice, bannerStale, staleDismissed)
  const replLit = resolveReplLit(replMode)
  const panelScope = computeTaskScope(session.state)
  const panelSubagents = session.state.subagents
  const [openedSubId, setOpenedSubId] = useState<string | null>(null)
  const hasContent = thread.length > 0 || !!errorMessage
  const isDisabled = workspaceRoot === null

  const panelHistory = useMemo(
    () =>
      thread
        .filter((item): item is Extract<typeof item, { kind: 'msg' }> => item.kind === 'msg')
        .filter((item) => item.role === 'user')
        .map((item) => item.text)
        .filter((t) => t.trim().length > 0),
    [thread]
  )

  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)

  useEffect(() => {
    if (userScrolledUp.current) return
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [thread])

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

  // 입력창 상태(값·첨부)는 패널 화면이 갖는다 — 단일은 store가 갖는다. 본체는 같은 ComposerView다.
  const [inputText, setInputText] = useState('')
  const [images, setImages] = useState<AttachedImage[]>([])

  // 지금 보낼 메시지 — 단일 sendNow와 같은 순서로 /clear(C6)·/ask(C7)를 가로챈다. 예약분은 예약 시점의 선택기 값을 쓴다.
  const sendNow = useCallback((text: string, imgs: AttachedImage[], pv?: PickerValues) => {
    if (text === '/clear' || text.startsWith('/clear ')) {
      userScrolledUp.current = false
      session.clear()
      return
    }
    if (text === '/ask' || text.startsWith('/ask ')) {
      onSlashAsk?.()
      return
    }
    // 단일 sendNow와 같이 예약분의 모델을 선택기에 되돌린다 — 선택기와 컨텍스트 링이 실제 실행 모델과 맞는다.
    // 단일이 되돌리는 picker 값은 모델 하나뿐이다(effort·mode는 되돌리지 않는다).
    if (pv?.model && pv.model !== picker.model) {
      handleSetPicker({ ...picker, model: pv.model })
    }
    userScrolledUp.current = false
    const runPicker = pv ? { model: pv.model, effort: pv.effort, mode: pv.mode } : picker
    const runOrchestration = pv ? pv.orchestration === true : orchestration
    void session.send(text, {
      picker: runPicker,
      workspaceRoot: workspaceRoot ?? undefined,
      ...(panel.sysPrompt ? { sysPrompt: panel.sysPrompt } : {}),
      ...(runOrchestration ? { orchestration: true } : {}),
      ...(imgs.length > 0 ? { images: imgs } : {}),
    })
  }, [onSlashAsk, session, picker, handleSetPicker, workspaceRoot, panel.sysPrompt, orchestration])

  // 실행 중 Enter는 예약, 실행이 끝나면 맨 앞부터 보낸다(C1) — 단일과 같은 공용 훅.
  const submit = useQueuedSend({
    isRunning,
    queueLength: queue.length,
    enqueue: session.enqueue,
    dequeue: session.dequeue,
    sendNow,
  })

  const handleSend = useCallback((pv?: PickerValues) => {
    const text = inputText.trim()
    const imgs = images
    if (!text && imgs.length === 0) return
    setInputText('')
    setImages([])
    submit(text, imgs, pv)
  }, [inputText, images, submit])

  const handleAbort = useCallback(() => {
    const action = decideStopAction(replMode, panelActiveLoops, pendingCommand)
    if (action === 'interrupt') {
      void session.interrupt()
    } else {
      void session.abort()
    }
  }, [session, replMode, panelActiveLoops, pendingCommand])

  const handleAttachFiles = useCallback((files: File[]) => {
    void filesToAttachedImages(files).then((added) => {
      if (added.length > 0) setImages((prev) => [...prev, ...added])
    })
  }, [])

  const handleRemoveImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const imageUrls = useMemo(() => images.map((i) => i.dataUrl), [images])

  const queuedView = useMemo(
    () => queue.map((q) => ({ id: q.id, text: q.text, images: q.images.map((i) => i.dataUrl) })),
    [queue]
  )

  const handleCycleMode = useCallback(() => {
    handleSetPicker({ ...picker, mode: nextModeId(picker.mode) })
  }, [handleSetPicker, picker])

  const handleExpandClick = useCallback(() => onExpand(slot), [onExpand, slot])
  const handleExpandClose = useCallback(() => onExpand(-1), [onExpand])
  const handlePromptClick = useCallback(() => onPrompt(slot), [onPrompt, slot])
  const handlePickFolderClick = useCallback(() => onPickFolder(slot), [onPickFolder, slot])

  return (
    <div
      className={`ma-panel${expanded ? ' expanded' : ''}`}
      data-slot={slot}
    >
      <div className="ma-p-head">
        <div className="ma-p-row1">
          <span className="ma-p-num">{slot + 1}</span>
          <span className={`ma-p-dot ${status.cls}`} />
          <span className="ma-p-title">{panel.title || '새 작업'}</span>
          <span className="ma-spacer" />
          {session.state.pendingQuestion && !questionActive && (
            <span
              className="ma-status analyzing ma-p-qwait"
              title="앞선 질문에 답하거나 펼친 패널을 닫으면 이 패널의 질문이 열려요"
            >
              <span>질문 대기</span>
            </span>
          )}
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

      {(panelScope.fileCount > 0 || panelScope.toolCount > 0) && (
        <div className="ma-p-scope" aria-label="작업 범위">
          <span className="ma-p-scope-item">파일 {panelScope.fileCount}</span>
          <span className="ma-p-scope-sep" aria-hidden="true">·</span>
          <span className="ma-p-scope-item">도구 {panelScope.toolCount}</span>
        </div>
      )}

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

      {panelTodos.length > 0 && <TodosSection todos={panelTodos} isRunning={isRunning} />}

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
            <ThreadView
              state={session.state}
              onOpenSubagent={setOpenedSubId}
              className="ma-p-messages"
            />
          )}
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
        <LoopStatusBanner
          status={panelLoopStatus}
          onStopSdk={() => session.abort()}
          onDismissStopped={session.dismissLoopsStopped}
          onDismissStale={session.dismissGoalStale}
          currentActivity={thinkingText}
          apiRetry={panelApiRetry}
          compacting={panelCompacting}
        />
        <HookTimeline hookRuns={panelHookRuns} />
      </div>

      <div className="ma-p-foot">
        <PermissionCard
          pending={session.state.pendingPermission}
          onRespond={(choice) => void session.respondPermission(choice)}
        />
        <ComposerView
          density="compact"
          value={inputText}
          onChange={setInputText}
          onSend={handleSend}
          onAbort={handleAbort}
          isRunning={isRunning}
          hasStarted={thread.length > 0}
          queued={queuedView}
          onRemoveQueued={session.removeQueued}
          onSlashAsk={onSlashAsk}
          onOpenImage={onOpenImage}
          mentionFiles={mentionFiles}
          attachedImages={imageUrls}
          onAttachFiles={handleAttachFiles}
          onRemoveImage={handleRemoveImage}
          history={panelHistory}
          workspaceRoot={workspaceRoot}
          disabled={isDisabled}
          model={picker.model}
          setModel={(id) => handleSetPicker({ ...picker, model: id })}
          effort={picker.effort}
          setEffort={(id) => handleSetPicker({ ...picker, effort: id })}
          mode={picker.mode}
          setMode={(id) => handleSetPicker({ ...picker, mode: id })}
          orchestration={orchestration}
          setOrchestration={setOrchestration}
          replMode={replMode}
          setReplMode={setReplMode}
          replLit={replLit}
          onCycleMode={handleCycleMode}
        />
      </div>

      <SubAgentFullscreen
        agent={openedSubId ? (panelSubagents.find((sa) => sa.id === openedSubId) ?? null) : null}
        onClose={() => setOpenedSubId(null)}
      />

      {/* 패널 질문 창(사용자 결정) — 단일과 같은 QuestionModal, 답은 G9a 코어 경로(respondQuestion).
          창 전역 keydown으로 답을 받으므로 MultiWorkspace가 고른 한 패널만 띄운다(questionActive). */}
      <QuestionModal
        open={!!session.state.pendingQuestion && questionActive}
        source={`패널 ${slot + 1} · ${panel.title || '새 작업'}`}
        questions={session.state.pendingQuestion?.questions ?? []}
        onAnswer={(answers) => void session.respondQuestion(answers)}
        onDismiss={() => void session.respondQuestion(null)}
      />
    </div>
  )
})
