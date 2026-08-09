import { memo, useState, useRef, useEffect, useCallback, useMemo, type CSSProperties, type JSX } from 'react'
import {
  IconFolder,
  IconChevDown,
  IconCode,
  IconExpand,
  IconClose,
  IconSpark,
  IconClaude,
} from '../../../components/common/icons'
import {
  MessageBubble,
  NoticeItem,
  ThinkingItem,
  informationalTone,
  informationalDisplayText,
  permissionDeniedDisplayText,
  StatusLine,
  ScrollToBottomButton,
  CmdResultCard,
} from '../../../features/conversation'
import { OrchestrationCard, SubAgentInline, SubAgentFullscreen, TodosSection } from '../../../features/agent'
import { LoopStatusBanner, PermissionCard, HookTimeline } from '../../../features/notice'
import { resolveLoopStatus } from '../../../lib/loopStatus'
import { decideStopAction } from '../../../lib/stopAction'
import { resolveReplLit } from '../../../lib/replIndicator'
import { calcGauge } from '../../../lib/gaugeCalc'
import { isScrolledUp } from '../../../lib/scrollHelpers'
import { groupIntoTurnBlocks } from '../../../lib/turnBlocks'
import {
  STATUS_META,
  DEFAULT_PICKER,
  type PickerState,
  type SamplePanel,
} from '../../../lib/multiAgentSampleData'
import {
  useAppStore,
  selectActiveMultiSessionId,
  selectBackendLabel,
  computeTaskScope,
  type AttachedImage,
} from '../../../store/appStore'
import type { ThreadItem } from '../../../store/threadTypes'
import { deriveHookTurnBadges } from '../../../store/hookBadge'
import type { PanelSessionHookResult } from '../../../store/panelSession'
import { requestLiveModeSwitch, requestLiveModelSwitch } from '../../../store/slices/composer'
import { useUltracodeToggle } from '../../../store/ultracodeToggle'
import { getProviderBrand } from '../../../lib/providerBrand'
import { getTheme } from '../../../lib/theme'
import { RunPickers } from './PanelPicker'
import { PanelComposer } from './PanelComposer'

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
  const panelSessionKey = `multi:${activeMultiSessionId ?? 'm'}:slot:${slot}`

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
    thinkingStartedAt,
    pendingPermission,
    pendingQuestion,
    todos: panelTodos,
    apiRetry: panelApiRetry,
    compacting: panelCompacting,
    sdkSessionState: panelSdkSessionState,
    hookRuns: panelHookRuns,
  } = session.state
  const panelLoopStatus = resolveLoopStatus(panelActiveLoops, goalRun, loopsStoppedNotice, bannerStale, staleDismissed)
  const replLit = resolveReplLit(replMode)
  const panelScope = computeTaskScope(session.state)
  const panelHookBadges = useMemo(() => deriveHookTurnBadges(thread), [thread])
  const turnBlocks = useMemo(() => groupIntoTurnBlocks(thread), [thread])
  const panelSubagents = session.state.subagents
  const [openedSubId, setOpenedSubId] = useState<string | null>(null)
  const hasContent = thread.length > 0 || !!errorMessage
  const isDisabled = workspaceRoot === null

  const backendLabel = useAppStore(selectBackendLabel)
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
    const lastMsg = thread[thread.length - 1]
    const lastMsgIsLiveAssistant = lastMsg &&
      lastMsg.kind === 'msg' &&
      lastMsg.role === 'assistant' &&
      !lastMsg.error
    return !lastMsgIsLiveAssistant
  })()
  const workingIndicatorText = panelSdkSessionState === 'requires_action' ? '작업 확인이 필요해요' : thinkingText
  const lastBlockIsAgent = turnBlocks.length > 0 && turnBlocks[turnBlocks.length - 1].kind === 'agent'
  const lastThreadItem = thread[thread.length - 1]
  const openThinkingEstimatedTokens =
    lastThreadItem?.kind === 'thinking' ? lastThreadItem.estimatedTokens : undefined

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

  const handleSend = useCallback((text: string, imgs?: AttachedImage[]) => {
    userScrolledUp.current = false
    void session.send(text, {
      picker,
      workspaceRoot: workspaceRoot ?? undefined,
      ...(panel.sysPrompt ? { sysPrompt: panel.sysPrompt } : {}),
      ...(orchestration ? { orchestration: true } : {}),
      ...(imgs && imgs.length > 0 ? { images: imgs } : {}),
      ...(replMode ? { persistent: true, sessionKey: panelSessionKey } : {}),
    })
  }, [session, picker, workspaceRoot, panel.sysPrompt, orchestration, replMode, panelSessionKey])

  const handleAbort = useCallback(() => {
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

  function renderPanelStandaloneItem(item: ThreadItem): JSX.Element | null {
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

  function renderPanelAgentItem(item: ThreadItem, idx: number): JSX.Element | null {
    if (item.kind === 'toolgroup') {
      return null
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
          agent={panelSubagents.find((sa) => sa.id === item.id)}
          onOpen={setOpenedSubId}
        />
      )
    }

    if (item.kind === 'msg' && item.role === 'assistant') {
      const isLastItem = idx === thread.length - 1
      const isStreaming = isLastItem && isRunning && !item.error
      return (
        <MessageBubble
          key={item.id}
          role="assistant"
          content={item.text}
          streaming={isStreaming}
          images={item.images}
          hookBadge={panelHookBadges.has(item.id)}
          origin={item.origin}
          bare
        />
      )
    }

    return null
  }

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
            <div className="ma-p-messages">
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
                        origin={item.origin}
                      />
                    )
                  }

                  if (block.kind === 'standalone') {
                    flatIdx += 1
                    return renderPanelStandaloneItem(block.items[0])
                  }

                  const isLastBlock = blockIdx === turnBlocks.length - 1
                  return (
                    <div key={`turn-${block.items[0].id}`} className="turn-block">
                      {turnAvatar}
                      <div className="turn-body">
                        {block.items.map((item) => {
                          flatIdx += 1
                          return renderPanelAgentItem(item, flatIdx)
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
                <div className="ma-p-error" role="alert">
                  오류: {errorMessage}
                </div>
              )}
            </div>
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
        <RunPickers
          picker={picker}
          setPicker={handleSetPicker}
          orchestration={orchestration}
          setOrchestration={setOrchestration}
          replMode={replMode}
          setReplMode={setReplMode}
          replLit={replLit}
        />
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

      <SubAgentFullscreen
        agent={openedSubId ? (panelSubagents.find((sa) => sa.id === openedSubId) ?? null) : null}
        onClose={() => setOpenedSubId(null)}
      />
    </div>
  )
})
