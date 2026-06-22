/**
 * avatarColor.ts — 아바타 색상 팔레트 (F12-03).
 *
 * 12색 고정 리터럴 배열. avatarColor/swatch 인라인 동적색 허용 예외(안티슬롭 F8/F12-03).
 * 동적 사용자 색 → 토큰 부적합 → 인라인 style 사용(설계 예외).
 * 이 파일은 순수 상수. window.api/store/fs 호출 절대 금지.
 */

/** 아바타 색 팔레트 — 12색 고정 리터럴. */
export const AVATAR_PALETTE: readonly string[] = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#a855f7', // purple
  '#f43f5e', // rose
]
