/**
 * composerNotes.ts — 엔진 전달 prompt 노트 합성 (M4-2 작업2).
 *
 * 순수 함수 — window.api 호출 0, 부수효과 0.
 * 원본 App.tsx:615-623 포맷과 정확히 일치.
 *
 * 단방향 흐름: Conversation.handleSend → buildEnginePrompt → store.sendMessage(promptForEngine).
 * 표시/저장 메시지(사용자 버블)는 원문 text. 엔진 history 마지막 메시지만 교체.
 */

export interface BuildEnginePromptOpts {
  /** 추출된 @멘션 경로 목록 */
  mentions?: string[]
  /** 첨부 이미지 경로 목록 (22c 사용 예정 — 지금 빈 배열이어도 함수 지원) */
  images?: string[]
}

/**
 * 원문 text에 멘션/이미지 노트를 합성해 엔진 전달용 prompt 문자열 반환.
 *
 * 노트 없으면 text 그대로. 있으면 `${text}\n\n${notes.join('\n\n')}`.
 * 원본 App.tsx:617-623 포맷 정확히 일치:
 *   - 멘션: `[멘션된 파일 — 필요하면 Read 도구로 확인하세요]\n- path1\n- path2`
 *   - 이미지: `[첨부 이미지 — Read 도구로 확인하세요]\n- path1`
 */
export function buildEnginePrompt(text: string, opts: BuildEnginePromptOpts): string {
  const notes: string[] = []

  if (opts.mentions && opts.mentions.length > 0) {
    notes.push(
      `[멘션된 파일 — 필요하면 Read 도구로 확인하세요]\n${opts.mentions.map((p) => '- ' + p).join('\n')}`
    )
  }

  if (opts.images && opts.images.length > 0) {
    notes.push(
      `[첨부 이미지 — Read 도구로 확인하세요]\n${opts.images.map((p) => '- ' + p).join('\n')}`
    )
  }

  if (notes.length === 0) return text

  return `${text}\n\n${notes.join('\n\n')}`
}
