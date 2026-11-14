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

  const handleSend = useCallback((text: string, imgs?: AttachedImage[]) => {
    userScrolledUp.current = false
    void session.send(text, {
      picker,
      workspaceRoot: workspaceRoot ?? undefined,
      ...(panel.sysPrompt ? { sysPrompt: panel.sysPrompt } : {}),
      ...(orchestration ? { orchestration: true } : {}),
      ...(imgs && imgs.length > 0 ? { images: imgs } : {}),
    })
  }, [session, picker, workspaceRoot, panel.sysPrompt, orchestration])

  const handleAbort = useCallback(() => {
    const action = decideStopAction(replMode, panelActiveLoops, pendingCommand)
    if (action === 'interrupt') {
      void session.interrupt()
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
