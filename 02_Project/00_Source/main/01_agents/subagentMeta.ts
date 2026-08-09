const AGENT_ID_LABEL = /^[ \t]*agentId[ \t]*:[ \t]*\S/im

const OUTPUT_FILE_LABEL = /^[ \t]*output_file[ \t]*:[ \t]*\S/im

const USAGE_TAG = /<usage>[\s\S]*?<\/usage>/i

const SEND_MESSAGE_MENTION = /sendmessage/i

export function isInternalAgentMetaText(text: string): boolean {
  if (typeof text !== 'string' || text.length === 0) return false
  if (!AGENT_ID_LABEL.test(text)) return false
  return OUTPUT_FILE_LABEL.test(text) || USAGE_TAG.test(text) || SEND_MESSAGE_MENTION.test(text)
}

export function sanitizeSubagentToolResult(output: unknown): unknown {
  if (typeof output === 'string') {
    return isInternalAgentMetaText(output) ? '' : output
  }
  if (Array.isArray(output)) {
    return output.filter((block) => {
      if (
        block !== null && typeof block === 'object' &&
        (block as Record<string, unknown>)['type'] === 'text' &&
        typeof (block as Record<string, unknown>)['text'] === 'string'
      ) {
        return !isInternalAgentMetaText((block as Record<string, unknown>)['text'] as string)
      }
      return true
    })
  }
  return output
}
