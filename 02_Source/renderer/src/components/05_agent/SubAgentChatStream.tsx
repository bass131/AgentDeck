import { useEffect, useMemo, useRef, type JSX } from 'react'
import type { SubAgentInfo } from '../../lib/agentSampleData'
import {
  buildSubagentChatItems,
  hasSubagentConversation,
  groupSubagentToolRuns,
  type SubagentToolItem,
} from '../../lib/subagentChat'
import { isScrolledUp } from '../../lib/scrollHelpers'
import { MessageBubble, ToolCallCard } from '../../features/conversation'
import type { ToolCard, ToolCardStatus } from '../../store/reducer'
import '../../features/shell/MultiWorkspace.css'
import '../../features/conversation/ToolGroup.css'
import './SubAgentFullscreen.css'
import './AgentPanel.css'

export const SA_STATUS_LABEL: Record<SubAgentInfo['status'], string> = {
  queued: '대기 중',
  running: '실행 중',
  done: '완료',
}

export function panelStatusCls(status: SubAgentInfo['status']): string {
  if (status === 'running') return 'working'
  if (status === 'done') return 'done'
  return ''
}

function toShimToolCard(item: SubagentToolItem): ToolCard {
  const status: ToolCardStatus = item.status === 'queued' ? 'running' : item.status
  return { id: item.id, name: item.verb, input: undefined, status }
}

export function SubAgentChatStream({ agent }: { agent: SubAgentInfo }): JSX.Element {
  const items = useMemo(() => buildSubagentChatItems(agent), [agent])
  const groups = useMemo(() => groupSubagentToolRuns(items), [items])

  const hasConvo = hasSubagentConversation(items)
  const displayLabel = agent.displayName ?? agent.name

  const threadRef = useRef<HTMLDivElement | null>(null)
  const userScrolledUp = useRef(false)
  const handleScroll = (): void => {
    const el = threadRef.current
    if (!el) return
    userScrolledUp.current = isScrolledUp({
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
    })
  }
  useEffect(() => {
    const el = threadRef.current
    if (!el || userScrolledUp.current) return
    el.scrollTop = el.scrollHeight
  }, [items])

  let lastTextId: string | null = null
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === 'text') {
      lastTextId = items[i].id
      break
    }
  }

  return (
    <div className="ma-p-body">
      <div className="ma-p-thread" ref={threadRef} onScroll={handleScroll}>
        <div className="ma-p-messages saf-convo">
          {groups.map((group, groupIdx) => {
            if (group.kind === 'toolgroup') {
              return (
                <div className="toollog" key={group.id}>
                  {group.tools.map((t) => (
                    <ToolCallCard key={t.id} card={toShimToolCard(t)} targetOverride={t.target} />
                  ))}
                </div>
              )
            }

            const item = group.item

            if (item.kind === 'task') {
              return (
                <div className="saf-msg saf-msg--task" key={item.id}>
                  <MessageBubble role="user" name="작업" content={item.text} />
                </div>
              )
            }

            if (item.kind === 'thinking') {
              const nextGroup = groups[groupIdx + 1]
              const isContinuous = nextGroup?.kind === 'single' && nextGroup.item.kind === 'text'
              return (
                <div className={`saf-msg saf-msg--thinking${isContinuous ? ' saf-msg-continues' : ''}`} key={item.id}>
                  <div className="saf-msg-who">
                    <span className="saf-status-symbol" aria-hidden="true">✻</span>
                    생각 중
                  </div>
                  <div className="saf-msg-body">{item.text}</div>
                </div>
              )
            }

            const streaming = item.id === lastTextId && agent.status === 'running'
            const prevGroup = groups[groupIdx - 1]
            const isContinuation = prevGroup?.kind === 'single' && prevGroup.item.kind === 'thinking'
            return (
              <div className={`saf-msg saf-msg--agent${isContinuation ? ' saf-msg-continuation' : ''}`} key={item.id}>
                <MessageBubble role="assistant" name={displayLabel} content={item.text} streaming={streaming} />
              </div>
            )
          })}

          {agent.status === 'running' && (
            <div className="saf-running">
              <span className="spin" aria-hidden="true" />
              <span>서브에이전트가 작업 중…</span>
            </div>
          )}

          {!hasConvo && agent.status !== 'running' && (
            <div className="ag-empty">아직 대화가 없어요</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SubAgentChatStream
