export interface BuildEnginePromptOpts {
  mentions?: string[]
  images?: string[]
}

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
