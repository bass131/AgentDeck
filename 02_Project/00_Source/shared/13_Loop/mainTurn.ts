import type { AgentEvent } from '../agentEvents'

// 메인 대화 한 턴의 답 글. main은 이 글을 대화 기록의 메인 답으로 남기고, 화면은 같은 글로 세션 사건의 턴과 그 답을 짝짓는다
export function mainAnswerOf(events: readonly AgentEvent[]): string {
  const paras: string[] = []
  let cur = ''
  let msgId: string | undefined
  let afterTool = false
  const flush = (): void => {
    if (cur.trim() !== '') paras.push(cur.trim())
    cur = ''
  }
  for (const ev of events) {
    if (ev.type === 'text' && ev.parentToolId === undefined) {
      if (afterTool || (ev.messageId !== undefined && ev.messageId !== msgId)) { flush(); msgId = ev.messageId }
      afterTool = false
      cur += ev.delta
    } else if (ev.type === 'tool_call' && ev.parentToolId === undefined) {
      afterTool = true
    }
  }
  flush()
  return paras.join('\n\n')
}
