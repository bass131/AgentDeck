export interface PromptMessage {
  role: string
  content: string
}

export interface BuildModelContextPromptOptions {
  resumeSessionId?: string
  contextBudgetTokens: number
}

const PREAMBLE_HEADER = '이전 대화 맥락:\n'
const PREAMBLE_FOOTER = '\n\n현재 메시지: '

function approxTokens(s: string): number {
  return Math.ceil(s.length / 4)
}

export function buildModelContextPrompt(
  messages: PromptMessage[],
  opts: BuildModelContextPromptOptions
): string {
  let lastUserIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIndex = i
      break
    }
  }
  if (lastUserIndex === -1) return ''

  const currentMessage = messages[lastUserIndex].content

  if (opts.resumeSessionId) {
    return currentMessage
  }

  const candidates = messages
    .slice(0, lastUserIndex)
    .filter((m) => m.role === 'user' || m.role === 'assistant')

  if (candidates.length === 0) return currentMessage

  let includedFrom = candidates.length
  for (let i = candidates.length - 1; i >= 0; i--) {
    const body = candidates
      .slice(i)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n')
    const full = `${PREAMBLE_HEADER}${body}${PREAMBLE_FOOTER}${currentMessage}`
    if (approxTokens(full) <= opts.contextBudgetTokens) {
      includedFrom = i
    } else {
      break
    }
  }

  if (includedFrom === candidates.length) return currentMessage

  const body = candidates
    .slice(includedFrom)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n')
  return `${PREAMBLE_HEADER}${body}${PREAMBLE_FOOTER}${currentMessage}`
}
