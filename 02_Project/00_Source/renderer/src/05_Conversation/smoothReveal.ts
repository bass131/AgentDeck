export interface SmoothRevealInput {
  cur: number
  vel: number
  textLen: number
  dt: number
}

export interface SmoothRevealOutput {
  nextCur: number
  nextVel: number
}

export function smoothRevealStep({
  cur,
  vel,
  textLen,
  dt,
}: SmoothRevealInput): SmoothRevealOutput {
  const clampedDt = Math.min(0.05, dt)

  if (cur < textLen) {
    const buffer = textLen - cur
    const targetVel = buffer * 3.2 + 18
    const nextVel = vel + (targetVel - vel) * Math.min(1, clampedDt * 3.5)
    const nextCur = Math.min(textLen, cur + nextVel * clampedDt)
    return { nextCur, nextVel }
  }

  return { nextCur: cur, nextVel: 0 }
}
