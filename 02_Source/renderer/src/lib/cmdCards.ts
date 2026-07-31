export const CMD_CARDS: Record<string, { title: string; running: string; sub: string | null }> = {
  compact: {
    title: '대화를 요약했어요',
    running: '대화를 요약하는 중…',
    sub: null,
  },
  goal: {
    title: '목표 반복을 마쳤어요',
    running: '목표를 향해 자율 반복 중…',
    sub: null,
  },
}

export function commandOf(text: string): string | null {
  const m = /^\/([a-z][a-z-]*)/i.exec(text.trim())
  const name = m?.[1]?.toLowerCase()
  return name && name in CMD_CARDS ? name : null
}

export function goalDetailOf(cmdName: string | null, text: string): string | null {
  if (cmdName !== 'goal') return null
  return text.trim().replace(/^\/goal\b\s*/i, '') || null
}
