/**
 * composer-notes.test.ts — lib/composerNotes TDD (M4-2 작업2).
 * 실패 우선 → 구현 → green.
 */
import { describe, it, expect } from 'vitest'
import { buildEnginePrompt } from '../../src/renderer/src/lib/composerNotes'

describe('buildEnginePrompt', () => {
  it('멘션만 — 노트 포맷이 원본 App.tsx:620 포맷과 일치', () => {
    const text = '@src/x.ts 확인해줘'
    const result = buildEnginePrompt(text, { mentions: ['src/x.ts'] })
    expect(result).toBe(
      `${text}\n\n[멘션된 파일 — 필요하면 Read 도구로 확인하세요]\n- src/x.ts`
    )
  })

  it('멘션 여러 개 — 목록 나열', () => {
    const text = '@a.ts @b.ts 봐줘'
    const result = buildEnginePrompt(text, { mentions: ['a.ts', 'b.ts'] })
    expect(result).toContain('- a.ts')
    expect(result).toContain('- b.ts')
    expect(result).toContain('[멘션된 파일 — 필요하면 Read 도구로 확인하세요]')
  })

  it('이미지만 — 이미지 노트 포맷', () => {
    const text = '이 이미지 봐줘'
    const result = buildEnginePrompt(text, { images: ['/tmp/img.png'] })
    expect(result).toBe(
      `${text}\n\n[첨부 이미지 — Read 도구로 확인하세요]\n- /tmp/img.png`
    )
  })

  it('멘션 + 이미지 둘 다 — 두 노트 모두 포함, 개행 구분', () => {
    const text = '@src/a.ts 봐줘'
    const result = buildEnginePrompt(text, { mentions: ['src/a.ts'], images: ['/tmp/img.png'] })
    expect(result).toContain('[멘션된 파일 — 필요하면 Read 도구로 확인하세요]')
    expect(result).toContain('[첨부 이미지 — Read 도구로 확인하세요]')
    // 두 노트는 \n\n 으로 구분
    expect(result).toContain('\n\n[')
  })

  it('없음 — text 그대로 반환', () => {
    const text = '일반 텍스트'
    expect(buildEnginePrompt(text, {})).toBe(text)
    expect(buildEnginePrompt(text, { mentions: [], images: [] })).toBe(text)
    expect(buildEnginePrompt(text, { mentions: [] })).toBe(text)
    expect(buildEnginePrompt(text, { images: [] })).toBe(text)
  })

  it('멘션 빈 배열 + 이미지 있음 → 이미지 노트만', () => {
    const text = '이미지'
    const result = buildEnginePrompt(text, { mentions: [], images: ['/img.png'] })
    expect(result).not.toContain('[멘션된 파일')
    expect(result).toContain('[첨부 이미지')
  })

  it('전체 포맷 — text + \\n\\n + 노트 join(\\n\\n) 구조', () => {
    const text = 't'
    const result = buildEnginePrompt(text, { mentions: ['a.ts'], images: ['img.png'] })
    // 구조: text\n\n<멘션노트>\n\n<이미지노트>
    const parts = result.split('\n\n')
    expect(parts[0]).toBe(text)
    expect(parts[1]).toContain('[멘션된 파일')
    expect(parts[2]).toContain('[첨부 이미지')
  })
})
