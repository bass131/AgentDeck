export function computeThinkingElapsedSeconds(
  thinkingStartedAt: number | null,
  nowMs: number,
): number | null {
  if (thinkingStartedAt === null || thinkingStartedAt <= 0) return null
  const deltaMs = nowMs - thinkingStartedAt
  if (deltaMs <= 0) return 0
  return Math.floor(deltaMs / 1000)
}
