// Taste·헌장 문답의 글. 메인 대화의 여는 턴과, 제안 검사의 결과 글을 만든다.
import type { DocRead, TasteDialogScope, TasteDocsRead, TasteDraft } from '@shared/14_Taste/taste'
import type { DocProblem } from '@shared/14_Taste/tasteDoc'
import { checkTasteDraft, TasteWriteError, type TasteDirs } from './tasteStore'

const PROBLEMS_MAX = 20

function problemLines(problems: DocProblem[]): string[] {
  const lines = problems.slice(0, PROBLEMS_MAX).map((p) => `- ${p.line === null ? '' : `${p.line}줄: `}${p.message}`)
  if (problems.length > PROBLEMS_MAX) lines.push(`- (그 밖에 ${problems.length - PROBLEMS_MAX}개)`)
  return lines
}

export function tasteProblemText(e: unknown): string {
  if (!(e instanceof TasteWriteError)) return e instanceof Error ? e.message : String(e)
  const hint = e.kind === 'existing-problems' ? ' 사람이 파일을 고치기 전에는 앱이 덮어쓰지 않는다.' : ''
  return [`${e.message}.${hint}`, ...problemLines(e.problems)].join('\n')
}

export async function tasteCheck(draft: TasteDraft, dirs: TasteDirs): Promise<{ ok: true; preview: string } | { ok: false; reason: string }> {
  try {
    return { ok: true, preview: await checkTasteDraft(draft, dirs) }
  } catch (e) {
    return { ok: false, reason: tasteProblemText(e) }
  }
}

const FORM_RULE = [
  '## 문서 꼴',
  '',
  '- Taste 문서는 항목의 목록이다. 항목은 `T<숫자>` id와 제목, 칸 원칙·레퍼런스·금지 가운데 하나 이상을 갖는다. 칸 글은 한 줄이다.',
  '- 프로젝트 헌장은 「목표」 줄들(하나 이상)과 「하지 않을 것」 줄들이다. 줄 하나에 줄바꿈을 넣지 않는다.',
  '- 문서는 앱이 쓴다. 너는 파일을 쓰지 않고, 정리한 구조를 propose_taste_doc 도구로 제안한다. 검사에 걸리면 문제 목록이 온다 — 고쳐서 다시 제안한다.',
  '- 제안하면 사람에게 승인 카드가 뜬다. 확정·반려는 사람이 카드로 한다. 반려되면 이유가 다음 턴으로 온다.',
].join('\n')

const JUDGEABLE_RULE = [
  '## 판정할 수 있는 꼴',
  '',
  '- 한 항목은 에이전트가 판정할 수 있는 꼴이어야 한다. 「보기 좋게」는 판정할 수 없고, 「한 화면에 카드 여섯 장 이상」이나 「레퍼런스 A의 여백 비율과 닮았다」는 판정할 수 있다.',
  '- 원칙만 있으면 검수가 추측이 되기 쉽다. 레퍼런스(닮고 싶은 화면·앱의 링크)와 금지 예시(걸리면 FAIL)를 함께 묻는다.',
  '- 모호한 곳이 없어질 때까지 여러 턴으로 묻고, 사람이 답한 것만 문서에 담는다.',
].join('\n')

function rawOf<T>(label: string, d: DocRead<T>): string {
  if (d.absent) return `### ${label}\n\n(없음)`
  const problems = d.problems.length > 0 ? `\n\n검사 문제:\n${problemLines(d.problems).join('\n')}` : ''
  return `### ${label} (${d.path})\n\n${d.raw.trim() === '' ? '(빈 파일)' : d.raw.trim()}${problems}`
}

export const OPEN_LINE: Record<TasteDialogScope, string> = {
  global: '전역 Taste 문답을 열었다',
  project: '프로젝트 헌장·Taste 문답을 열었다',
}

export function openingPrompt(scope: TasteDialogScope, docs: TasteDocsRead): string {
  const head = scope === 'global'
    ? '[Taste 문답] 사람이 전역 Taste(모든 프로젝트에 걸리는 취향의 기준) 문답을 열었다. 지금 문서를 보고, 채우거나 고칠 곳을 사람에게 묻는다.'
    : '[헌장·Taste 문답] 사람이 이 프로젝트의 헌장과 프로젝트 Taste 문답을 열었다. 지금 문서를 보고, 목표·하지 않을 것과 이 프로젝트만의 취향을 사람에게 묻는다. 프로젝트 문서는 확정하면 기본 브랜치로 가는 PR이 된다.'
  const now = scope === 'global'
    ? [rawOf('전역 Taste', docs.global)]
    : [rawOf('프로젝트 헌장', docs.charter), rawOf('프로젝트 Taste', docs.project), rawOf('참고 — 전역 Taste', docs.global)]
  return [head, FORM_RULE, JUDGEABLE_RULE, '## 지금 문서', ...now].join('\n\n')
}
