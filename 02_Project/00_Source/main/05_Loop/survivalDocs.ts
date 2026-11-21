// 작업 저장소의 `.agentdeck/` 폴더를 fs 포트로 다룬다.
//   milestone-spec.md  마일스톤 스펙(메인 세션이 쓴다)
//   goals/<id>.md      goal 문서(분해 노드가 쓴다, 첫 「# 제목」 줄이 goal 제목)
//   decisions.md       결정 대장
//   verification.md    검증 기록 — 실행기가 run-state.json의 줄에서 다시 그리는 출력일 뿐이다. 읽지 않는다.
//   run-state.json     실행 상태 — 커서와 검증 줄의 정본
// 템플릿 자체는 복사하지 않는다. 나아감의 근거는 run-state.json의 실행기 줄뿐이고, 마크다운에 누가 「PASS」를 적어도 읽히지 않는다.
import { createHash } from 'node:crypto'
import type { GoalSeed } from './executor'
import type { FsPort } from './ports'
import { GOAL_ID, type RunState } from './runState'
import type { DocKind } from './template'

export const DOCS = {
  dir: '.agentdeck',
  milestoneSpec: '.agentdeck/milestone-spec.md',
  decisions: '.agentdeck/decisions.md',
  verification: '.agentdeck/verification.md',
  runState: '.agentdeck/run-state.json',
  goalsDir: '.agentdeck/goals',
} as const

export const goalDocPath = (goalId: string): string => `${DOCS.goalsDir}/${goalId}.md`

// 상태 파일 본문 — 실행기는 이 글을 앱 영역의 사본(DigestStore.writeCopy)과 상태 파일에 똑같이 쓴다.
export const runStateText = (state: RunState): string => `${JSON.stringify(state, null, 2)}\n`

export const sha256Text = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

const SCOPE_TITLE = (state: RunState, scope: string | null): string => {
  if (scope === null) return '마일스톤'
  const g = state.goals.find((x) => x.id === scope)
  return g ? `${g.id} — ${g.title}` : scope
}

function renderVerification(state: RunState): string {
  const out = [
    `# 검증 기록 — ${state.milestoneId}`,
    '',
    '실행기가 실행 상태(`run-state.json`)의 줄에서 다시 그린다. 이 파일을 고쳐도 실행은 나아가지 않고, 다음 기록 때 덮어쓴다.',
  ]
  const scopes: (string | null)[] = [null, ...state.goals.map((g) => g.id)]
  for (const scope of scopes) {
    out.push('', `## ${SCOPE_TITLE(state, scope)}`, '')
    const lines = state.lines.filter((l) => l.goal === scope)
    if (lines.length === 0) out.push('- (기록 없음)')
    for (const l of lines) out.push(`- ${l.marker} ${l.at} — ${l.node}(${l.judge}): ${l.sentence}`)
  }
  if (state.status === 'needs-user') out.push('', `사람 판단 대기: ${state.haltReason ?? ''}`)
  return `${out.join('\n')}\n`
}

export async function writeVerification(fs: FsPort, state: RunState): Promise<void> {
  await fs.write(DOCS.verification, renderVerification(state))
}

// 분해 노드가 쓴 goal 문서에서 id(파일 이름)와 제목만 읽는다. 문서에 적힌 등급 같은 표시는 읽지 않는다.
// 읽은 본문의 sha256을 함께 낸다. 실행기가 상태에 적고 검수 직전·goal PR 직전에 지금 문서와 대조한다.
export async function readGoalSeeds(fs: FsPort): Promise<{ ok: true; goals: GoalSeed[] } | { ok: false; reason: string }> {
  const names = (await fs.list(DOCS.goalsDir))
    .filter((n) => n.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  if (names.length === 0) return { ok: false, reason: `${DOCS.goalsDir}에 goal 문서가 하나도 없다` }
  const goals: GoalSeed[] = []
  for (const name of names) {
    const id = name.slice(0, -'.md'.length)
    if (!GOAL_ID.test(id)) return { ok: false, reason: `goal 문서 이름 ${name}이 id 꼴이 아니다` }
    const text = await fs.read(goalDocPath(id))
    const title = /^#\s+(.+?)\s*$/m.exec(text ?? '')?.[1]
    if (text === null || !title) return { ok: false, reason: `${name}에 「# 제목」 줄이 없다` }
    goals.push({ id, title, docSha256: sha256Text(text) })
  }
  return { ok: true, goals }
}

// 작업 노드에 줄 생존 문서. 템플릿이 노드마다 적은 종만 읽는다.
export async function readNodeDocs(
  fs: FsPort, kinds: readonly DocKind[], goalId: string | null,
): Promise<Partial<Record<DocKind, string | null>>> {
  const docs: Partial<Record<DocKind, string | null>> = {}
  for (const kind of kinds) {
    const path = kind === 'goal'
      ? (goalId === null ? null : goalDocPath(goalId))
      : kind === 'milestoneSpec' ? DOCS.milestoneSpec : kind === 'decisions' ? DOCS.decisions : DOCS.verification
    docs[kind] = path === null ? null : await fs.read(path)
  }
  return docs
}

// 스펙 승인 카드가 보이는 것과 사람 판정이 묶이는 것. 같은 읽기·같은 해시 함수라 둘이 어긋나지 않는다.
// 해시는 파일 본문(UTF-8 문자열)의 sha256이다. 파일이 없으면 둘 다 null이다.
export async function readSpecView(fs: FsPort): Promise<{ text: string | null; sha256: string | null }> {
  const text = await fs.read(DOCS.milestoneSpec)
  return { text, sha256: text === null ? null : createHash('sha256').update(text, 'utf8').digest('hex') }
}

// goal PR 본문에 싣는 그 goal의 검증 줄. verification.md와 같은 꼴을 실행 상태의 줄에서 그린다(파일은 출력일 뿐이다).
// 줄에 명령 출력이 섞일 수 있어(`@scope/pkg` 같은 멘션) 코드 울타리 안에 싣는다.
export function renderGoalLines(state: RunState, goalId: string): string {
  const lines = state.lines.filter((l) => l.goal === goalId)
  const body = lines.length === 0 ? '- (기록 없음)' : lines.map((l) => `- ${l.marker} ${l.at} — ${l.node}(${l.judge}): ${l.sentence.replace(/`/g, "'")}`).join('\n')
  return ['## 검증 기록', '', '```text', body, '```'].join('\n')
}
