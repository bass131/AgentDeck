import {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  memo,
  type JSX,
} from 'react'
import {
  useAppStore,
  selectThread,
  selectIsRunning,
  selectErrorMessage,
  selectLastUsage,
  selectLastContextWindow,
  selectProjectFiles,
  selectAttachedImages,
  selectQueue,
  selectThinkingText,
  selectPendingPermission,
  selectPendingQuestion,
  selectUsage,
  selectProfile,
  selectWorkspaceRoot,
  selectFileDiffs,
  selectSubagents,
  selectReplMode,
  selectActiveLoops,
  selectPendingCommand,
  selectLoopsStoppedNotice,
  selectGoalRun,
  selectBannerStale,
  selectStaleDismissed,
  selectRestoredSession,
  selectApiRetry,
  selectCompacting,
  selectSdkSessionState,
  selectHookRuns,
  selectBackendLabel,
} from '@renderer/00_App/appStore'
import type { AttachedImage } from '@renderer/00_App/appStore'
import type { PickerValues } from './Composer'
import { LoopStatusBanner } from '@renderer/10_Engine'
import { resolveLoopStatus } from '@renderer/03_Agent/loopStatus'
import { decideStopAction } from '@renderer/03_Agent/stopAction'
import { getProviderBrand } from '@renderer/02_Common/providerBrand'
import { getTheme } from '@renderer/02_Common/theme'
import { Composer } from './Composer'
import { PermissionCard } from '@renderer/10_Engine'
import { QuestionModal } from '@renderer/03_Agent/prompt'
import { enginePromptFor } from '@renderer/03_Agent/state/runCore'
import { IconEye, IconSearch, IconBolt, IconPencil, IconSpark, IconClock } from '@renderer/02_Common/icons'
import type { IconProps } from '@renderer/02_Common/icons'
import { HookTimeline } from '@renderer/10_Engine'
import { useZoom, ZoomBadge } from './zoom'
import { SelectionToolbar } from './SelectionToolbar'
import { SubAgentFullscreen } from '@renderer/03_Agent'
import { ScrollToBottomButton } from './ScrollToBottomButton'
import { ThreadView } from './ThreadView'
import { useQueuedSend } from './hooks/useQueuedSend'
import { isScrolledUp } from '@renderer/02_Common/scrollHelpers'
import './Conversation.css'

// 항목 렌더 부품은 공용 스레드 렌더(ThreadView)로 옮겼다 — 기존 소비처를 위해 같은 것을 재수출한다.
export {
  ThinkingItem,
  NoticeItem,
  informationalTone,
  informationalDisplayText,
  decisionReasonTypeLabel,
  permissionDeniedDisplayText,
} from './ThreadView'
export type { ThinkingItemProps, NoticeTone, NoticeItemProps } from './ThreadView'

const SUGGESTIONS: { Icon: (p: IconProps) => JSX.Element; label: string }[] = [
  { Icon: IconEye, label: '이 프로젝트의 구조를 설명해줘' },
  { Icon: IconSearch, label: '버그를 찾아서 고쳐줘' },
  { Icon: IconBolt, label: '성능을 개선할 부분을 찾아줘' },
  { Icon: IconPencil, label: '테스트 코드를 작성해줘' },
]

export const Welcome = memo(function Welcome({ onPick }: { onPick: (text: string) => void }) {
  const profile = useAppStore(selectProfile)
  const nickname = profile?.nickname ?? ''

  const backendLabel = useAppStore(selectBackendLabel)
  const welcomeBrand = getProviderBrand(backendLabel === 'Claude Code' ? 'claude-code' : 'unknown', getTheme())

  return (
    <div className="welcome">
      <span className={`wc-mark${welcomeBrand.kind === 'logo' ? ' wc-mark-spark' : ''}`} aria-hidden="true">
        {welcomeBrand.kind === 'logo' ? (
          <img src={welcomeBrand.src} alt={welcomeBrand.alt} width={26} height={26} />
        ) : (
          <IconSpark size={26} stroke={1.7} />
        )}
      </span>
      <h2 className="wc-title">{nickname ? `무엇을 도와드릴까요, ${nickname}님?` : '무엇을 도와드릴까요?'}</h2>
      <p className="wc-sub">코드 작성·리뷰부터 버그 수정, 리팩터링까지 — 아래에 입력하거나 추천으로 시작하세요.</p>
      <div className="wc-grid">
        {SUGGESTIONS.map(({ Icon, label }) => (
          <button key={label} type="button" className="wc-card" onClick={() => onPick(label)}>
            <span className="wc-ic" aria-hidden="true">
              <Icon size={16} />
            </span>
            <span className="wc-lbl">{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
})

export const RestoredContextBadge = memo(function RestoredContextBadge(): JSX.Element {
  return (
    <div className="ctx-restored-badge" role="status">
      <IconClock size={12} stroke={1.8} />
      <span>이전 맥락이 이어지는 대화예요</span>
    </div>
  )
})

export interface InjectedInput {
  text: string
  nonce: number
}

export interface ConversationProps {
  onSlashAsk?: () => void
  onOpenImage?: (images: string[], index: number) => void
  injectedInput?: InjectedInput
}

export function Conversation({ onSlashAsk, onOpenImage, injectedInput }: ConversationProps = {}): JSX.Element {
  const thread = useAppStore(selectThread)
  const subagents = useAppStore(selectSubagents)
  const [openedSubId, setOpenedSubId] = useState<string | null>(null)
  const isRunning = useAppStore(selectIsRunning)
  const currentRunId = useAppStore((s) => s.currentRunId)
  const errorMessage = useAppStore(selectErrorMessage)
  const thinkingText = useAppStore(selectThinkingText)
  const thinkingStartedAt = useAppStore((s) => s.thinkingStartedAt)
  const lastUsage = useAppStore(selectLastUsage)
  const lastContextWindow = useAppStore(selectLastContextWindow)

  const sendMessage = useAppStore((s) => s.sendMessage)
  const abortRun = useAppStore((s) => s.abortRun)
  const interruptRun = useAppStore((s) => s.interruptRun)
  const setSelectedModel = useAppStore((s) => s.setSelectedModel)
  const clearConversation = useAppStore((s) => s.clearConversation)
  const loadProjectFiles = useAppStore((s) => s.loadProjectFiles)
  const projectFiles = useAppStore(selectProjectFiles)

  const attachedImages = useAppStore(selectAttachedImages)
  const attachImagesFromFiles = useAppStore((s) => s.attachImagesFromFiles)
  const removeAttachedImage = useAppStore((s) => s.removeAttachedImage)
  const clearAttachedImages = useAppStore((s) => s.clearAttachedImages)

  const queue = useAppStore(selectQueue)
  const enqueueMessage = useAppStore((s) => s.enqueueMessage)
  const dequeueMessage = useAppStore((s) => s.dequeueMessage)
  const removeQueued = useAppStore((s) => s.removeQueued)

  const replMode = useAppStore(selectReplMode)

  const activeLoops = useAppStore(selectActiveLoops)
  const pendingCommand = useAppStore(selectPendingCommand)
  const loopsStoppedNotice = useAppStore(selectLoopsStoppedNotice)
  const goalRun = useAppStore(selectGoalRun)
  const bannerStale = useAppStore(selectBannerStale)
  const staleDismissed = useAppStore(selectStaleDismissed)
  const dismissGoalStale = useAppStore((s) => s.dismissGoalStale)
  const dismissLoopsStopped = useAppStore((s) => s.dismissLoopsStopped)

  const apiRetry = useAppStore(selectApiRetry)
  const compacting = useAppStore(selectCompacting)
  const sdkSessionState = useAppStore(selectSdkSessionState)

  const hookRuns = useAppStore(selectHookRuns)

  const restoredSession = useAppStore(selectRestoredSession)

  const fileDiffs = useAppStore(selectFileDiffs)

  const pendingPermission = useAppStore(selectPendingPermission)
  const respondPermission = useAppStore((s) => s.respondPermission)

  const pendingQuestion = useAppStore(selectPendingQuestion)
  const respondQuestion = useAppStore((s) => s.respondQuestion)

  const usage = useAppStore(selectUsage)
  const loadUsage = useAppStore((s) => s.loadUsage)

  const workspaceRoot = useAppStore(selectWorkspaceRoot)

  const [inputText, setInputText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)

  const injectNonce = injectedInput?.nonce ?? 0
  const injectText = injectedInput?.text ?? ''
  useEffect(() => {
    if (injectText.trim()) {
      setInputText(injectText)
    }
  }, [injectNonce, injectText])

  const { ref: zoomRef, zoom, pct, flash } = useZoom('chat')

  useEffect(() => {
    void loadProjectFiles()
    void loadUsage()
  }, [loadProjectFiles, loadUsage])

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

    const thread = container.querySelector('.thread')
    if (thread) observer.observe(thread)

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

  const chatScrollRef = useCallback((node: HTMLDivElement | null) => {
    (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node
    zoomRef(node)
  }, [zoomRef])

  const sendNow = useCallback((text: string, images: AttachedImage[], picker?: PickerValues) => {
    if (text === '/clear' || text.startsWith('/clear ')) {
      clearConversation()
      return
    }
    if (text === '/ask' || text.startsWith('/ask ')) {
      onSlashAsk?.()
      return
    }
    if (picker?.model) {
      setSelectedModel(picker.model)
    }
    userScrolledUp.current = false
    const imagePaths = images.map((i) => i.path)
    const displayImages = images.map((i) => i.dataUrl)
    // 엔진 프롬프트 계산은 G9a 코어 하나(E4) — 패널과 같은 규칙이다.
    const promptForEngine = enginePromptFor(text, imagePaths)
    void sendMessage(
      text,
      picker,
      promptForEngine !== text ? promptForEngine : undefined,
      displayImages.length > 0 ? displayImages : undefined,
      picker?.orchestration,
    )
  }, [clearConversation, onSlashAsk, setSelectedModel, sendMessage])

  // 실행 중 Enter는 예약, 실행이 끝나면 맨 앞부터 보낸다(C1) — 패널과 같은 공용 훅.
  const submit = useQueuedSend({
    isRunning,
    queueLength: queue.length,
    enqueue: enqueueMessage,
    dequeue: dequeueMessage,
    sendNow,
  })

  const handleSend = useCallback((pickerValues?: PickerValues) => {
    const text = inputText.trim()
    const imgs = attachedImages
    if (!text && imgs.length === 0) return
    setInputText('')
    clearAttachedImages()
    submit(text, imgs, pickerValues)
  }, [inputText, attachedImages, clearAttachedImages, submit])

  const prevRunningForUsageRef = useRef(isRunning)
  useEffect(() => {
    const was = prevRunningForUsageRef.current
    prevRunningForUsageRef.current = isRunning
    if (!isRunning && was) {
      void loadUsage()
    }
  }, [isRunning, loadUsage])

  const handleElaborate = useCallback((_text: string) => {
  }, [])

  const handleAbort = useCallback(() => {
    const action = decideStopAction(replMode, activeLoops, pendingCommand)
    if (action === 'interrupt') void interruptRun()
    else void abortRun()
  }, [replMode, activeLoops, pendingCommand, interruptRun, abortRun])

  const handleAttachFiles = useCallback(
    (files: File[]) => { void attachImagesFromFiles(files) },
    [attachImagesFromFiles]
  )

  const attachedImageUrls = useMemo(
    () => attachedImages.map((i) => i.dataUrl),
    [attachedImages]
  )

  const queuedView = useMemo(
    () => queue.map((q) => ({ id: q.id, text: q.text, images: q.images.map((i) => i.dataUrl) })),
    [queue]
  )

  const userHistory = useMemo(
    () =>
      thread
        .flatMap((item) => (item.kind === 'msg' && item.role === 'user' ? [item.text] : []))
        .filter((t) => t.trim().length > 0),
    [thread]
  )

  const threadState = useMemo(
    () => ({
      thread,
      isRunning,
      errorMessage,
      subagents,
      fileDiffs,
      currentRunId,
      thinkingText,
      thinkingStartedAt,
      sdkSessionState,
      pendingQuestion,
      pendingPermission,
    }),
    [thread, isRunning, errorMessage, subagents, fileDiffs, currentRunId, thinkingText, thinkingStartedAt, sdkSessionState, pendingQuestion, pendingPermission]
  )

  const isEmpty = thread.length === 0 && !isRunning

  const loopStatus = resolveLoopStatus(activeLoops, goalRun, loopsStoppedNotice, bannerStale, staleDismissed)
  const hasActiveLoops = loopStatus.kind === 'sdk' || loopStatus.kind === 'goal'

  return (
    <div className={`conversation${hasActiveLoops ? ' loop-active' : ''}`}>
      <QuestionModal
        open={!!pendingQuestion}
        questions={pendingQuestion?.questions ?? []}
        onAnswer={(answers) => void respondQuestion(answers)}
        onDismiss={() => void respondQuestion(null)}
      />

      <SubAgentFullscreen
        agent={openedSubId ? (subagents.find((sa) => sa.id === openedSubId) ?? null) : null}
        onClose={() => setOpenedSubId(null)}
      />

      <div
        className="chat-scroll"
        ref={chatScrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label="대화 내용"
        style={{ position: 'relative' }}
      >
        <ZoomBadge pct={pct} show={flash} />

        {isEmpty ? (
          <Welcome onPick={setInputText} />
        ) : (
          <ThreadView
            state={threadState}
            onOpenSubagent={setOpenedSubId}
            className="thread"
            style={{ zoom }}
            before={restoredSession ? <RestoredContextBadge /> : null}
          />
        )}

        <SelectionToolbar scrollRef={scrollRef} onElaborate={handleElaborate} />

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
        status={loopStatus}
        onStopSdk={() => void abortRun()}
        onDismissStopped={dismissLoopsStopped}
        onDismissStale={dismissGoalStale}
        currentActivity={thinkingText}
        apiRetry={apiRetry}
        compacting={compacting}
      />

      <HookTimeline hookRuns={hookRuns} />

      <PermissionCard
        pending={pendingPermission}
        onRespond={(choice) => void respondPermission(choice)}
      />

      <Composer
        value={inputText}
        onChange={setInputText}
        onSend={handleSend}
        onAbort={handleAbort}
        isRunning={isRunning}
        hasStarted={thread.length > 0}
        onSlashAsk={onSlashAsk}
        onOpenImage={onOpenImage}
        lastUsage={lastUsage}
        lastContextWindow={lastContextWindow}
        usage={usage}
        mentionFiles={projectFiles}
        attachedImages={attachedImageUrls}
        onAttachFiles={handleAttachFiles}
        onRemoveImage={removeAttachedImage}
        queued={queuedView}
        onRemoveQueued={removeQueued}
        history={userHistory}
        workspaceRoot={workspaceRoot}
        disabled={!workspaceRoot}
      />
    </div>
  )
}

export default memo(Conversation)
