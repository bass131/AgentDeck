/**
 * workingPhrases.ts — 유희적 "생각 중" 동사 순환 phrase 자산 (P14a 원안, TG1 P04 추출).
 *
 * WORKING_PHRASES/nextPhraseIndex는 Conversation.tsx가 아니라 이 파일이 소유한다 —
 * StatusLine.tsx가 Conversation.tsx를 직접 import하면 순환참조
 * (Conversation → StatusLine → Conversation)가 생긴다(FB1 P06 MessageBubble 추출과 동일
 * 근거 — Conversation.tsx의 MessageBubble 추출 주석 참조).
 *
 * CRITICAL: 순수 자산/함수 — React·window.api 의존 0.
 */

/**
 * 에이전트 실행 중 표시할 한국어 phrase 목록.
 * thinkingText가 없을 때 5~20초 간격으로 무작위 순환 표시.
 * 원본 WORKING_PHRASES 톤 유지 — 과하지 않게, 자연스러운 한국어.
 */
export const WORKING_PHRASES: string[] = [
  '골똘히 생각하는 중',
  '코드를 살펴보는 중',
  '차근차근 정리하는 중',
  '실마리를 찾는 중',
  '이리저리 탐색하는 중',
  '퍼즐을 맞추는 중',
  '가능성을 저울질하는 중',
  '단서를 모으는 중',
  '논리를 다듬는 중',
  '맥락을 읽는 중',
  '흐름을 따라가는 중',
  '빈칸을 채우는 중',
  '큰 그림을 그리는 중',
  '차곡차곡 쌓는 중',
  '두뇌 풀가동 중',
]

/**
 * 결정적 non-repeating 인덱스 선택.
 * 테스트 가능하도록 Math.random 대신 (cur + 1) % len 기반 순환.
 * len < 2이면 항상 0 반환.
 */
export function nextPhraseIndex(cur: number, len: number): number {
  if (len < 2) return 0
  return (cur + 1) % len
}
