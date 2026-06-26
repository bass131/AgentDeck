/**
 * reducer/helpers.ts — 리듀서 내부 순수 헬퍼 (P12 분해).
 *
 * extractTarget·isMetaBlockText·extractSubagentText.
 * CRITICAL: 순수 함수 — window.api/Node/fs 0.
 */

/**
 * tool_call input 객체에서 도구 대상을 best-effort로 1줄 추출한다.
 * file_path > path > command > pattern 순으로 확인.
 * 미발견 시 빈 문자열.
 */
export function extractTarget(input: unknown): string {
  if (input === null || typeof input !== 'object') return ''
  const obj = input as Record<string, unknown>
  const candidate = obj['file_path'] ?? obj['path'] ?? obj['command'] ?? obj['pattern']
  if (candidate === undefined || candidate === null) return ''
  return String(candidate)
}

/**
 * 서브에이전트 tool_result content → 정제 텍스트 (F-E).
 *
 * Task 서브에이전트 최종 결과는 `[{type:'text',text:'…'}, {type:'text',text:'agentId:… <usage>…'}]`
 * 형태로 온다(라이브 프로브 확인). text 블록만 추출·join하고 agentId/usage 메타 블록은 제거해
 * 상세/카드에 raw JSON이 덤프되지 않게 한다. 추출 불가(객체 등)면 JSON.stringify 폴백(truthy 보존).
 *
 * CRITICAL(신뢰경계): 모델 출력 텍스트만 — 별도 fs/네트워크 접근 0.
 */
export function isMetaBlockText(t: string): boolean {
  const s = t.trim()
  return s.startsWith('agentId:') || s.includes('<usage>') || s.includes('use SendMessage with to:')
}

export function extractSubagentText(output: unknown): string {
  if (typeof output === 'string') return output
  if (Array.isArray(output)) {
    const texts = output
      .map((b) =>
        b !== null && typeof b === 'object' &&
        (b as Record<string, unknown>)['type'] === 'text' &&
        typeof (b as Record<string, unknown>)['text'] === 'string'
          ? ((b as Record<string, unknown>)['text'] as string)
          : ''
      )
      .filter((t) => t.length > 0 && !isMetaBlockText(t))
    if (texts.length > 0) return texts.join('\n\n')
    return JSON.stringify(output) // text 블록 없음 → 폴백
  }
  if (output !== null && typeof output === 'object') {
    const t = (output as Record<string, unknown>)['text']
    if (typeof t === 'string' && t.length > 0) return t
  }
  return JSON.stringify(output) // 객체/기타 → 폴백(truthy 보존)
}
