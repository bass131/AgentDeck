import { describe, expect, it } from 'vitest'
import { OPEN_LINE, openingPrompt, tasteProblemText } from '@main/13_Taste/tasteDialog'
import { LOOP_DOC_MAX_BYTES, TasteWriteError } from '@main/13_Taste/tasteStore'
import type { TasteDocsRead } from '@shared/14_Taste/taste'

const NONE: TasteDocsRead = {
  global: { absent: true, path: 'C:/ud/taste/global-taste.md' },
  charter: { absent: true, path: 'C:/w/docs/agentdeck/헌장.md' },
  project: { absent: true, path: 'C:/w/docs/agentdeck/Taste.md' },
}

describe('Taste·헌장 문답의 여는 턴', () => {
  it('전역 문답은 지금 전역 Taste 원문(없으면 없음), 문서 꼴 규칙, 판정할 수 있는 꼴 안내를 싣는다', () => {
    const none = openingPrompt('global', NONE)
    expect(none).toContain('[Taste 문답]')
    expect(none).toContain('### 전역 Taste\n\n(없음)')
    expect(none).toContain('## 문서 꼴')
    expect(none).toContain('propose_taste_doc')
    expect(none).toContain('## 판정할 수 있는 꼴')
    expect(none).toContain('한 화면에 카드 여섯 장 이상')
    expect(none).not.toContain('프로젝트 헌장 (')
    const raw = '# 전역 Taste\n\n## T1 밀도\n- 원칙: 높게\n'
    const some = openingPrompt('global', { ...NONE, global: { absent: false, path: 'C:/ud/g.md', raw, doc: { scope: 'global', items: [] }, problems: [] } })
    expect(some).toContain('### 전역 Taste (C:/ud/g.md)\n\n# 전역 Taste\n\n## T1 밀도\n- 원칙: 높게')
  })

  it('상한을 넘는 원문은 싣지 않고 크기와 함께 그 사실만 알린다', () => {
    const raw = `# 전역 Taste\n\n## T1 큼\n- 원칙: ${'가'.repeat(LOOP_DOC_MAX_BYTES)}\n`
    const p = openingPrompt('global', { ...NONE, global: { absent: false, path: 'C:/ud/g.md', raw, doc: { scope: 'global', items: [] }, problems: [] } })
    expect(p).toContain(`상한 ${LOOP_DOC_MAX_BYTES}바이트를 넘어 싣지 않았다`)
    expect(p).not.toContain('가'.repeat(100))
    expect(Buffer.byteLength(p, 'utf8')).toBeLessThan(LOOP_DOC_MAX_BYTES)
  })

  it('프로젝트 문답은 헌장과 프로젝트 Taste를 싣고, 검사 문제가 있으면 줄과 함께 붙인다', () => {
    const p = openingPrompt('project', {
      ...NONE,
      charter: {
        absent: false, path: 'C:/w/docs/agentdeck/헌장.md', raw: '# 프로젝트 헌장\n', doc: { goal: [], nonGoals: null },
        problems: [{ kind: 'empty-goal', line: null, message: '목표가 비었다' }, { kind: 'stray-line', line: 3, message: '절 밖의 줄 — x' }],
      },
    })
    expect(p).toContain('[헌장·Taste 문답]')
    expect(p).toContain('기본 브랜치로 가는 PR')
    expect(p).toContain('### 프로젝트 헌장 (C:/w/docs/agentdeck/헌장.md)')
    expect(p).toContain('검사 문제:\n- 목표가 비었다\n- 3줄: 절 밖의 줄 — x')
    expect(p).toContain('### 프로젝트 Taste\n\n(없음)')
    expect(OPEN_LINE.project).toContain('헌장')
  })

  it('검사 거절 글은 사유와 문제 줄을 싣고, 기존 문서 문제면 사람이 고쳐야 한다고 덧붙인다', () => {
    const bad = tasteProblemText(new TasteWriteError('bad-input', '다시 읽으면 문제가 있는 글은 쓰지 않는다', [{ kind: 'empty-item', line: 3, message: 'T1에 칸이 하나도 없다' }]))
    expect(bad).toBe('다시 읽으면 문제가 있는 글은 쓰지 않는다.\n- 3줄: T1에 칸이 하나도 없다')
    expect(tasteProblemText(new TasteWriteError('existing-problems', 'x에 문제가 있어 덮어쓰지 않는다'))).toContain('사람이 파일을 고치기 전에는')
    expect(tasteProblemText(new Error('뿌리 밖'))).toBe('뿌리 밖')
  })
})
