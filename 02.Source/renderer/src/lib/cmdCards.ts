/**
 * cmdCards.ts — 슬래시 커맨드 카드 데이터 (순수 데이터, 부수효과 0).
 *
 * 원본 AgentCodeGUI/src/renderer/src/store/session.ts L77-88 미러 (최소 compact).
 * M6: 진행카드(running→done/failed) 구현의 데이터 레이어.
 *
 * CRITICAL:
 *   - nowTime은 이 모듈에 없음 — 컴포넌트 전용.
 *   - reducer는 CMD_CARDS만 import (순수 유지, nowTime 호출 0).
 *   - 문자열 하드코딩 0 — 이 모듈이 단일 진실 소스.
 */

/**
 * 슬래시 커맨드 카드 메타데이터.
 * title: 완료 제목, running: 진행 중 제목, sub: 완료 설명(compact는 동적 생성).
 */
export const CMD_CARDS: Record<string, { title: string; running: string; sub: string | null }> = {
  compact: {
    title: '대화를 요약했어요',
    running: '대화를 요약하는 중…',
    // compact는 done in-place에서 beforeMsgs 기반 동적 생성 → null.
    sub: null,
  },
}

/**
 * commandOf — "/compact …" → "compact" (카드 커맨드면), 그 외 null.
 *
 * 원본 session.ts L84-88 미러.
 * 슬래시 커맨드 중 CMD_CARDS에 등록된 것만 카드로 처리한다.
 * /clear·/ask 등 클라이언트 인터셉트 커맨드는 CMD_CARDS 미포함 → null.
 *
 * 순수 함수 — 부수효과 0, window.api 0.
 */
export function commandOf(text: string): string | null {
  const m = /^\/([a-z][a-z-]*)/i.exec(text.trim())
  const name = m?.[1]?.toLowerCase()
  return name && name in CMD_CARDS ? name : null
}
