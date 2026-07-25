/**
 * smoothReveal.ts — SmoothMarkdown 점진 reveal 순수 함수.
 *
 * 원본 Chat.tsx:312~356 (AgentCodeGUI) 의 RAF 루프 로직을 순수 함수로 추출.
 * 컴포넌트에서 분리해 단위 테스트 가능하게 하고, 실제 RAF 루프에서 호출함.
 *
 * 공식(원본 그대로):
 *   targetVel = buffer * 3.2 + 18
 *   vel += (targetVel - vel) * min(1, dt * 3.5)
 *   cur  = min(target, cur + vel * dt)
 *
 * dt는 max 0.05s clamp (탭 전환 시 큰 gap 방지 — 원본 동일).
 */

export interface SmoothRevealInput {
  /** 현재 분수 커서 위치 (fractional cursor) */
  cur: number
  /** 현재 reveal 속도 (chars/sec) */
  vel: number
  /** 전체 텍스트 길이 */
  textLen: number
  /** 프레임 간 경과 시간(초) — clamp는 내부에서 적용 */
  dt: number
}

export interface SmoothRevealOutput {
  /** 다음 프레임의 분수 커서 */
  nextCur: number
  /** 다음 프레임의 reveal 속도 */
  nextVel: number
}

/**
 * 한 프레임의 reveal 진행 계산.
 * 원본 AgentCodeGUI Chat.tsx tick() 내부 로직을 순수 함수로 분리.
 */
export function smoothRevealStep({
  cur,
  vel,
  textLen,
  dt,
}: SmoothRevealInput): SmoothRevealOutput {
  // 원본과 동일: 탭 전환 등 큰 gap clamp
  const clampedDt = Math.min(0.05, dt)

  if (cur < textLen) {
    const buffer = textLen - cur
    // 원본 공식: desired speed scales with how far behind we are
    const targetVel = buffer * 3.2 + 18
    // 원본 공식: ease actual velocity toward target (~280ms)
    const nextVel = vel + (targetVel - vel) * Math.min(1, clampedDt * 3.5)
    const nextCur = Math.min(textLen, cur + nextVel * clampedDt)
    return { nextCur, nextVel }
  }

  // 따라잡음 → vel 리셋
  return { nextCur: cur, nextVel: 0 }
}
