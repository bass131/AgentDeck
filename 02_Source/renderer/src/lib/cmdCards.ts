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
  goal: {
    // LR2-03: /goal 진행 카드 — SDK stop-hook 자기지속(실측: goal-event-probe)의 시각화.
    // title/running은 턴 카운트가 붙는 베이스("… · N턴" — reducer text/lifecycle 핸들러).
    // sub는 begin 시 detail(목표 텍스트)로 대체 — cfg 기본은 null(맨몸 /goal).
    title: '목표 반복을 마쳤어요',
    running: '목표를 향해 자율 반복 중…',
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

/**
 * goalDetailOf — `/goal <목표 텍스트>` 입력에서 목표 텍스트(카드 sub·배너 2행에 쓰는
 * "작업 주제")만 뽑아낸다 (LR2-03 · FB2 P08 3단 정보위계).
 *
 * RS1 P04: 동일한 정규식 한 줄이 slices/runtime.ts(단일챗)와 panelSession.ts 2곳
 * (패널 send 경로 · 패널 로컬 begin 경로)에 복사돼 있었다 — 셋 다 goal 한정 조건까지
 * 같은 모양이라 조건째로 이 함수가 소유한다(포맷이 갈라질 여지 제거).
 *
 * 판정: cmdName이 'goal'이 아니면 애초에 대상이 아니므로 null(타 카드 회귀 0).
 * 맨몸 `/goal`(인자 없음)이나 공백만 남는 경우도 null — 빈 문자열을 sub로 내려보내면
 * 카드/배너에 빈 줄이 생기므로 "없음"으로 정규화한다.
 *
 * 순수 함수 — 부수효과 0, window.api 0.
 *
 * @param cmdName commandOf(text) 결과(카드 커맨드명). 'goal' 외에는 전부 null 반환.
 * @param text    사용자 원문 입력(예: "/goal 리팩터링 마무리").
 * @returns 목표 텍스트, 없으면 null.
 */
export function goalDetailOf(cmdName: string | null, text: string): string | null {
  if (cmdName !== 'goal') return null
  return text.trim().replace(/^\/goal\b\s*/i, '') || null
}
