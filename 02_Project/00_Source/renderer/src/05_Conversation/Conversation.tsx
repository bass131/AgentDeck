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
} from '../../store/appStore'
import type { AttachedImage } from '../../store/appStore'
import type { ThreadItem } from '../../store/threadTypes'
import type { PickerValues } from './Composer'
import { LoopStatusBanner } from '../../features/notice'
import { resolveLoopStatus } from '../../lib/loopStatus'
import { decideStopAction } from '../../lib/stopAction'
import { groupIntoTurnBlocks } from '../../lib/turnBlocks'
import { MarkdownView } from './MarkdownView'
import { SmoothMarkdown } from './SmoothMarkdown'
import { MessageBubble } from './MessageBubble'
import { HookBadge } from './HookBadge'
import { deriveHookTurnBadges } from '../../store/hookBadge'
import { getProviderBrand } from '../../lib/providerBrand'
import { getTheme } from '../../lib/theme'
import { Composer } from './Composer'
import { PermissionCard } from '../../features/notice'
import { QuestionModal } from '../../features/prompt'
import { ToolGroup } from './ToolGroup'
import { extractMentions } from '../../lib/mentions'
import { buildEnginePrompt } from '../../lib/composerNotes'
import { IconEye, IconSearch, IconBolt, IconPencil, IconSpark, IconAlert, IconClaude, IconClock, IconInfo, IconChevDown } from '../../components/common/icons'
import type { IconProps } from '../../components/common/icons'
import { HookTimeline } from '../../features/notice'
import { useZoom, ZoomBadge } from '../../lib/zoom'
import { SelectionToolbar } from './SelectionToolbar'
import { CmdResultCard } from './CmdResultCard'
import { OrchestrationCard, SubAgentInline, SubAgentFullscreen } from '../../features/agent'
import { ScrollToBottomButton } from './ScrollToBottomButton'
import { StatusLine } from './StatusLine'
import { isScrolledUp } from '../../lib/scrollHelpers'
import './Conversation.css'

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

export interface ThinkingItemProps {
  text: string
  estimatedTokens?: number
  continuous?: boolean
  bare?: boolean
}

export const ThinkingItem = memo(function ThinkingItem({ text, estimatedTokens, continuous, bare = false }: ThinkingItemProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const hasText = text.length > 0
  const continuousCls = continuous ? ' msg-continues' : ''

  if (!hasText && estimatedTokens !== undefined) {
    return (
      <div className={`msg ai-msg${continuousCls}`}>
        {!bare && (
          <span className="ava ai" aria-hidden="true">
            <IconClaude size={16} />
          </span>
        )}
        <div className="msg-main">
          <div className="thinking" data-testid="thinking-progress">
            <span>사고 중… ~{estimatedTokens.toLocaleString('ko-KR')} 토큰</span>
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`msg ai-msg${continuousCls}`}>
      {!bare && (
        <span className="ava ai" aria-hidden="true">
          <IconClaude size={16} />
        </span>
      )}
      <div className="msg-main">
        <div className="thinking-block" data-testid="thinking-block">
          <button
            type="button"
            className="thinking-summary"
            data-testid="thinking-toggle"
            aria-expanded={open}
            aria-label={`사고 과정 ${open ? '접기' : '펼치기'}`}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="thinking-summary-ic" aria-hidden="true">
              <IconSpark size={13} />
            </span>
            <span className="thinking-summary-label">사고 과정</span>
            <span className="thinking-summary-count">{text.length.toLocaleString('ko-KR')}자</span>
            {estimatedTokens !== undefined && (
              <span className="thinking-summary-tokens">~{estimatedTokens.toLocaleString('ko-KR')} 토큰</span>
            )}
            <span className={`thinking-summary-chev${open ? ' open' : ''}`} aria-hidden="true">
              <IconChevDown size={12} />
            </span>
          </button>
          {open && (
            <div className="thinking-detail" data-testid="thinking-detail">
              {text}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

export type NoticeTone = 'warn' | 'error' | 'info' | 'muted'

export interface NoticeItemProps {
  text: string
  time?: string
  tone?: NoticeTone
}

export const NoticeItem = memo(function NoticeItem({ text, time, tone = 'warn' }: NoticeItemProps): JSX.Element {
  const Icon = tone === 'info' || tone === 'muted' ? IconInfo : IconAlert
  return (
    <div className={`notice-row tone-${tone}`}>
      <span className="notice-ic">
        <Icon size={15} />
      </span>
      <div className="notice-text">{text}</div>
      {time && <span className="notice-time">{time}</span>}
    </div>
  )
})

export function informationalTone(level: 'info' | 'notice' | 'suggestion' | 'warning'): NoticeTone {
  switch (level) {
    case 'warning':
      return 'error'
    case 'suggestion':
      return 'warn'
    case 'notice':
      return 'info'
    case 'info':
    default:
      return 'muted'
  }
}

export function informationalDisplayText(item: { content: string; preventContinuation?: boolean }): string {
  return item.preventContinuation ? `${item.content} — 이후 진행이 중단됐어요` : item.content
}

const DECISION_REASON_TYPE_LABEL: Record<string, string> = {
  rule: '규칙',
  mode: '모드',
  subcommandResults: '하위 명령 결과',
  permissionPromptTool: '권한 프롬프트 도구',
  hook: '훅',
  asyncAgent: '비동기 에이전트',
  sandboxOverride: '샌드박스 오버라이드',
  workingDir: '작업 디렉터리',
  safetyCheck: '안전 점검',
  classifier: '분류기',
  other: '기타',
}

export function decisionReasonTypeLabel(type?: string): string | undefined {
  if (!type) return undefined
  return DECISION_REASON_TYPE_LABEL[type] ?? type
}

export function permissionDeniedDisplayText(item: {
  toolName: string
  decisionReasonType?: string
  decisionReason?: string
}): string {
  const typeLabel = decisionReasonTypeLabel(item.decisionReasonType)
  const head = typeLabel ? `차단: ${item.toolName} (${typeLabel})` : `차단: ${item.toolName}`
  return item.decisionReason ? `${head} — ${item.decisionReason}` : head
}

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

  const backendLabel = useAppStore(selectBackendLabel)

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
    const isCommand = text.startsWith('/')
    const mentions = isCommand ? [] : extractMentions(text)
    const promptForEngine = isCommand ? text : buildEnginePrompt(text, { mentions, images: imagePaths.length > 0 ? imagePaths : undefined })
    void sendMessage(
      text,
      picker,
      promptForEngine !== text ? promptForEngine : undefined,
      displayImages.length > 0 ? displayImages : undefined,
      picker?.orchestration,
    )
  }, [clearConversation, onSlashAsk, setSelectedModel, sendMessage])

  const handleSend = useCallback((pickerValues?: PickerValues) => {
    const text = inputText.trim()
    const imgs = attachedImages
    if (!text && imgs.length === 0) return

    if (isRunning) {
      const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `q-${queue.length}-${text.slice(0, 8)}`
      enqueueMessage({ id, text, images: imgs, picker: pickerValues })
      setInputText('')
      clearAttachedImages()
      return
    }

    setInputText('')
    clearAttachedImages()
    sendNow(text, imgs, pickerValues)
  }, [inputText, attachedImages, isRunning, queue.length, enqueueMessage, clearAttachedImages, sendNow])

  const prevRunningRef = useRef(isRunning)
  useEffect(() => {
    const was = prevRunningRef.current
    prevRunningRef.current = isRunning
    if (isRunning || !was) return
    if (queue.length === 0) return
    const next = dequeueMessage()
    if (next) sendNow(next.text, next.images, next.picker)
  }, [isRunning, queue, dequeueMessage, sendNow])

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

  const hookBadges = useMemo(() => deriveHookTurnBadges(thread), [thread])

  const turnBlocks = useMemo(() => groupIntoTurnBlocks(thread), [thread])

  const isEmpty = thread.length === 0 && !isRunning

  const loopStatus = resolveLoopStatus(activeLoops, goalRun, loopsStoppedNotice, bannerStale, staleDismissed)
  const hasActiveLoops = loopStatus.kind === 'sdk' || loopStatus.kind === 'goal'

  const isClaudeEngine = backendLabel === 'Claude Code'
  const turnAvatarBrand = getProviderBrand(isClaudeEngine ? 'claude-code' : 'unknown', getTheme())
  const turnAvatar = turnAvatarBrand.kind === 'logo' ? (
    <span className="ava ai turn-block-ava ava-spark" aria-hidden="true">
      <img src={turnAvatarBrand.src} alt={turnAvatarBrand.alt} width={16} height={16} />
    </span>
  ) : (
    <span className="ava ai turn-block-ava" aria-hidden="true">
      <IconClaude size={16} />
    </span>
  )

  const showWorking = isRunning && !pendingQuestion && !pendingPermission && (() => {
    const lastItem = thread[thread.length - 1]
    const lastIsLiveAssistant = lastItem &&
      lastItem.kind === 'msg' &&
      lastItem.role === 'assistant' &&
      !lastItem.error
    return !lastIsLiveAssistant
  })()
  const workingIndicatorText = sdkSessionState === 'requires_action' ? '작업 확인이 필요해요' : thinkingText
  const lastBlockIsAgent = turnBlocks.length > 0 && turnBlocks[turnBlocks.length - 1].kind === 'agent'
  const lastThreadItem = thread[thread.length - 1]
  const openThinkingEstimatedTokens =
    lastThreadItem?.kind === 'thinking' ? lastThreadItem.estimatedTokens : undefined

  function renderStandaloneItem(item: ThreadItem): JSX.Element | null {
    if (item.kind === 'notice') {
      return <NoticeItem key={item.id} text={item.text} time={item.time} />
    }

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

    if (item.kind === 'compact-boundary') {
      const tokensNote = item.preTokens !== undefined && item.postTokens !== undefined
        ? ` (${item.preTokens.toLocaleString('ko-KR')} → ${item.postTokens.toLocaleString('ko-KR')} 토큰)`
        : ''
      return (
        <NoticeItem
          key={item.id}
          text={`대화가 길어져 컨텍스트를 압축했어요${tokensNote}`}
          time={item.time}
        />
      )
    }

    if (item.kind === 'informational') {
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
      return (
        <NoticeItem
          key={item.id}
          text={permissionDeniedDisplayText(item)}
          time={item.time}
          tone="error"
        />
      )
    }

    return null
  }

  function renderAgentItem(item: ThreadItem, idx: number): JSX.Element | null {
    const prev = thread[idx - 1]
    const prevIsAiBlock = prev !== undefined && (
      prev.kind === 'toolgroup' ||
      (prev.kind === 'msg' && prev.role === 'assistant')
    )

    if (item.kind === 'msg' && item.role === 'assistant') {
      const isLastItem = idx === thread.length - 1
      const isLiveAssistant = isLastItem && isRunning && !item.error
      const hasHookBadge = hookBadges.has(item.id)
      return (
        <div
          key={item.id}
          className={`msg ai-msg${item.origin === 'cron' ? ' cron-turn' : ''}`}
        >
          <div className="msg-main">
            <div className="meta">
              <span className="name">Claude</span>
              {item.time && <span className="time">{item.time}</span>}
              {item.origin === 'cron' && (
                <span className="cron-badge" aria-label="자율 발동 turn"><span className="cron-badge-ico" aria-hidden="true">🔁</span>자율 발동</span>
              )}
              {item.interrupted && (
                <span className="msg-interrupted" data-interrupted aria-label="응답이 중단됨">중단됨</span>
              )}
              {hasHookBadge && <HookBadge />}
            </div>
            <div className="content">
              {isLiveAssistant ? (
                <SmoothMarkdown text={item.text} running={isRunning} />
              ) : (
                <MarkdownView source={item.text} />
              )}
            </div>
          </div>
        </div>
      )
    }

    if (item.kind === 'toolgroup') {
      return (
        <ToolGroup
          key={item.id}
          group={item}
          lead={!prevIsAiBlock}
          bare
          fileDiffs={fileDiffs}
          runId={currentRunId ?? undefined}
        />
      )
    }

    if (item.kind === 'thinking') {
      return (
        <ThinkingItem
          key={item.id}
          text={item.text}
          estimatedTokens={item.estimatedTokens}
          bare
        />
      )
    }

    if (item.kind === 'subagent') {
      return (
        <SubAgentInline
          key={item.id}
          agent={subagents.find((sa) => sa.id === item.id)}
          onOpen={setOpenedSubId}
        />
      )
    }

    return null
  }

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
          <div className="thread" style={{ zoom }}>
            {restoredSession && <RestoredContextBadge />}

            {(() => {
              let flatIdx = -1
              return turnBlocks.map((block, blockIdx) => {
                if (block.kind === 'user') {
                  flatIdx += 1
                  const item = block.items[0] as Extract<ThreadItem, { kind: 'msg' }>
                  return (
                    <MessageBubble
                      key={item.id}
                      role="user"
                      content={item.text}
                      images={item.images}
                      time={item.time}
                    />
                  )
                }

                if (block.kind === 'standalone') {
                  flatIdx += 1
                  return renderStandaloneItem(block.items[0])
                }

                const isLastBlock = blockIdx === turnBlocks.length - 1
                return (
                  <div key={`turn-${block.items[0].id}`} className="turn-block">
                    {turnAvatar}
                    <div className="turn-body">
                      {block.items.map((item) => {
                        flatIdx += 1
                        return renderAgentItem(item, flatIdx)
                      })}
                      {isLastBlock && showWorking && (
                        <StatusLine
                          text={workingIndicatorText}
                          thinkingStartedAt={thinkingStartedAt}
                          estimatedTokens={openThinkingEstimatedTokens}
                        />
                      )}
                    </div>
                  </div>
                )
              })
            })()}

            {showWorking && !lastBlockIsAgent && (
              <div className="turn-block">
                {turnAvatar}
                <div className="turn-body">
                  <StatusLine
                    text={workingIndicatorText}
                    thinkingStartedAt={thinkingStartedAt}
                    estimatedTokens={openThinkingEstimatedTokens}
                  />
                </div>
              </div>
            )}

            {errorMessage && !isRunning && (
              <div className="conv-error" role="alert">
                오류: {errorMessage}
              </div>
            )}
          </div>
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
