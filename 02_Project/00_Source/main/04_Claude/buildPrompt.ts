interface PromptMessage {
  role: string
  content: string
}

interface BuildModelContextPromptOptions {
  resumeSessionId?: string
  contextBudgetTokens: number
}

// 이어받을 세션 없이 대화 기록을 프롬프트로 다시 실을 때의 예산 (M06 G4).
// 대화가 마지막으로 잰 창(modelUsage.contextWindow)을 따르고, 모르면 가장 작은 창 기준으로 보수적으로 잡는다.
const CONTEXT_FALLBACK_RESERVE_TOKENS = 20_000
const UNKNOWN_WINDOW_TOKENS = 200_000

export function contextFallbackBudget(measuredWindow: number | undefined): number {
  const valid = typeof measuredWindow === 'number' && Number.isFinite(measuredWindow) && measuredWindow > 0
  const windowTokens = valid ? measuredWindow : UNKNOWN_WINDOW_TOKENS
  return Math.max(windowTokens - CONTEXT_FALLBACK_RESERVE_TOKENS, 0)
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
