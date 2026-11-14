import { memo, useMemo, useState, type CSSProperties, type JSX, type ReactNode } from 'react'
import { useAppStore, selectBackendLabel } from '@renderer/00_App/appStore'
import type { ThreadItem } from './state/threadTypes'
import type { AppState } from './state/reducer'
import { groupIntoTurnBlocks } from './turnBlocks'
import { MessageBubble } from './MessageBubble'
import { deriveHookTurnBadges } from './state/hookBadge'
import { getProviderBrand } from '@renderer/02_Common/providerBrand'
import { getTheme } from '@renderer/02_Common/theme'
import { ToolGroup } from './ToolGroup'
import { CmdResultCard } from './CmdResultCard'
import { StatusLine } from './StatusLine'
import { IconSpark, IconAlert, IconClaude, IconInfo, IconChevDown } from '@renderer/02_Common/icons'
import { OrchestrationCard, SubAgentInline } from '@renderer/03_Agent'

// 스레드 렌더 하나(M05 G9b) — 단일 대화(Conversation)와 멀티 패널(PanelView)이 같은 렌더를 쓴다.
// 복원 배지·Welcome·빈 화면·줌·스크롤 같은 장식과 배치는 호출부가 맡는다(R6).

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

// 스레드 렌더가 읽는 실행 상태 — 단일 store와 패널 상태가 같은 모양(AppState)이라 그대로 넘긴다.
export type ThreadViewState = Pick<
  AppState,
  | 'thread'
  | 'isRunning'
  | 'errorMessage'
  | 'subagents'
  | 'fileDiffs'
  | 'currentRunId'
  | 'thinkingText'
  | 'thinkingStartedAt'
  | 'sdkSessionState'
  | 'pendingQuestion'
  | 'pendingPermission'
>

export interface ThreadViewProps {
  state: ThreadViewState
  onOpenSubagent: (id: string) => void
  className: string
  style?: CSSProperties
  // 블록 앞에 놓을 장식(단일의 복원 배지 등).
  before?: ReactNode
}

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

export const ThreadView = memo(function ThreadView({
  state,
  onOpenSubagent,
  className,
  style,
  before,
}: ThreadViewProps): JSX.Element {
  const {
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
  } = state

  const hookBadges = useMemo(() => deriveHookTurnBadges(thread), [thread])
  const turnBlocks = useMemo(() => groupIntoTurnBlocks(thread), [thread])

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

  function renderAgentItem(item: ThreadItem, idx: number): JSX.Element | null {
    const prev = thread[idx - 1]
    const prevIsAiBlock = prev !== undefined && (
      prev.kind === 'toolgroup' ||
      (prev.kind === 'msg' && prev.role === 'assistant')
    )

    if (item.kind === 'msg' && item.role === 'assistant') {
      const isLastItem = idx === thread.length - 1
      const isLiveAssistant = isLastItem && isRunning && !item.error
      return (
        <MessageBubble
          key={item.id}
          role="assistant"
          content={item.text}
          streaming={isLiveAssistant}
          time={item.time}
          origin={item.origin}
          interrupted={item.interrupted}
          hookBadge={hookBadges.has(item.id)}
          bare
        />
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
          onOpen={onOpenSubagent}
        />
      )
    }

    return null
  }

  let flatIdx = -1
  return (
    <div className={className} style={style}>
      {before}

      {turnBlocks.map((block, blockIdx) => {
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
      })}

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
  )
})
