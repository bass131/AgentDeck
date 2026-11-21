import type { AgentEvent } from '../agentEvents'

// main의 대화 기록과 화면의 턴 짝짓기가 같은 이 규칙을 써야 둘이 어긋나지 않는다
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
