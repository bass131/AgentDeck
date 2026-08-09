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

export function nextPhraseIndex(cur: number, len: number): number {
  if (len < 2) return 0
  return (cur + 1) % len
}
