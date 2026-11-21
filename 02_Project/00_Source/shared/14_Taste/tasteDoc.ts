// Taste·헌장 문서의 꼴. 사람이 읽고 git diff로 감사하는 마크다운이라 YAML·JSON을 쓰지 않는다.
// 바른 꼴(canonical): LF 줄바꿈, 끝 줄바꿈 하나, 머리 뒤와 절·항목 사이에 빈 줄 하나, 절·항목 머리와 그 몸 사이에는 빈 줄 없음.
// 바른 꼴의 글은 parse → serialize가 같은 글이다. 읽기는 CRLF·BOM을 받고, 쓰기는 늘 바른 꼴로 쓴다.
// 문제가 하나라도 있는 글은 다시 쓰면 사람이 쓴 글을 잃을 수 있다 — 저장소(tasteStore)는 그런 글을 덮어쓰지 않는다.

export type TasteScope = 'global' | 'project'

const TASTE_HEAD: Record<TasteScope, string> = { global: '# 전역 Taste', project: '# 프로젝트 Taste' }
const TASTE_FIELDS: readonly string[] = ['원칙', '레퍼런스', '금지']
const CHARTER_HEAD = '# 프로젝트 헌장'
const GOAL = '## 목표'
const NON_GOALS = '## 하지 않을 것'

export interface TasteItem {
  id: string
  title: string
  // 모르는 이름의 칸도 남긴다 — 검사가 알리고, 다시 쓸 때 사람이 쓴 글을 잃지 않는다
  fields: { name: string; text: string }[]
}
export interface TasteDoc { scope: TasteScope; items: TasteItem[] }

// goal은 목표 절의 줄들(앞뒤 빈 줄을 뗀다). nonGoals가 null이면 「하지 않을 것」 절이 없다.
export interface CharterDoc { goal: string[]; nonGoals: string[] | null }

export type DocProblemKind =
  | 'bad-head'
  | 'bad-heading'
  | 'stray-line'
  | 'code-fence'
  | 'empty-item'
  | 'duplicate-id'
  | 'unknown-field'
  | 'empty-goal'
  | 'unreadable'
export interface DocProblem { kind: DocProblemKind; line: number | null; message: string }

const ITEM_HEADING = /^## (T\d+)(?: (.*))?$/

function linesOf(text: string): string[] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  return body.split('\n').map((l) => l.replace(/\r$/, '').trimEnd())
}

const isFence = (line: string): boolean => {
  const t = line.trimStart()
  return t.startsWith('```') || t.startsWith('~~~')
}

// 아는 칸은 이름 바로 뒤의 쌍점에서, 모르는 칸은 첫 「쌍점+공백」(또는 줄 끝 쌍점)에서 가른다. 칸 꼴이 아니면 null.
function fieldOf(line: string): { name: string; text: string } | null {
  if (!line.startsWith('- ')) return null
  const body = line.slice(2)
  for (const name of TASTE_FIELDS) {
    if (body.startsWith(`${name}:`)) return { name, text: body.slice(name.length + 1).trim() }
  }
  let i = body.indexOf(': ')
  if (i < 0 && body.endsWith(':')) i = body.length - 1
  if (i < 0) return null
  const name = body.slice(0, i).trim()
  return name === '' ? null : { name, text: body.slice(i + 1).trim() }
}

const idKey = (id: string): string => id.slice(1).replace(/^0+(?=\d)/, '')

const byLine = (ps: DocProblem[]): DocProblem[] => [...ps].sort((a, b) => (a.line ?? 0) - (b.line ?? 0))

// 머리 줄 판정. 첫 글 줄이 머리가 아니면 문제를 남긴다 — `# `로 시작하면 머리 자리로 보고 먹고, 아니면 그 줄을 몸으로 읽게 둔다.
function takeHead(line: string, n: number, head: string, problems: DocProblem[]): boolean {
  if (line === head) return true
  problems.push({ kind: 'bad-head', line: n, message: `첫 줄은 「${head}」여야 한다` })
  return line.startsWith('# ')
}

// 줄을 차례로 넘기되 코드 울타리 안의 줄은 넘기지 않고, 여는 줄마다 문제 하나를 남긴다.
function eachLine(text: string, problems: DocProblem[], visit: (line: string, n: number) => void): void {
  let fenced = false
  linesOf(text).forEach((line, i) => {
    const n = i + 1
    if (isFence(line)) {
      if (!fenced) problems.push({ kind: 'code-fence', line: n, message: '코드 울타리 안의 글은 Taste·헌장으로 읽지 않는다' })
      fenced = !fenced
      return
    }
    if (!fenced) visit(line, n)
  })
}

export function scanTaste(text: string, scope: TasteScope): { doc: TasteDoc; problems: DocProblem[] } {
  const head = TASTE_HEAD[scope]
  const problems: DocProblem[] = []
  const items: TasteItem[] = []
  const itemLine: number[] = []
  let headSeen = false
  let cur: TasteItem | null = null
  let skipping = false
  eachLine(text, problems, (line, n) => {
    if (line.trim() === '') return
    if (!headSeen) {
      headSeen = true
      if (takeHead(line, n, head, problems)) return
    }
    if (line.startsWith('## ')) {
      const m = ITEM_HEADING.exec(line)
      if (!m) {
        problems.push({ kind: 'bad-heading', line: n, message: `항목 머리는 「## T<숫자> 제목」이어야 한다 — ${line}` })
        cur = null
        skipping = true
        return
      }
      cur = { id: m[1], title: (m[2] ?? '').trim(), fields: [] }
      items.push(cur)
      itemLine.push(n)
      skipping = false
      return
    }
    const f = cur ? fieldOf(line) : null
    if (cur && f) {
      cur.fields.push(f)
      if (!TASTE_FIELDS.includes(f.name)) {
        problems.push({ kind: 'unknown-field', line: n, message: `모르는 칸 「${f.name}」 — 칸은 원칙·레퍼런스·금지다` })
      }
      return
    }
    if (!skipping) problems.push({ kind: 'stray-line', line: n, message: `항목의 칸이 아닌 줄 — ${line}` })
  })
  if (!headSeen) problems.push({ kind: 'bad-head', line: null, message: `빈 문서 — 첫 줄은 「${head}」여야 한다` })
  const seen = new Set<string>()
  items.forEach((item, k) => {
    if (item.fields.length === 0) problems.push({ kind: 'empty-item', line: itemLine[k], message: `${item.id}에 칸이 하나도 없다` })
    if (seen.has(idKey(item.id))) problems.push({ kind: 'duplicate-id', line: itemLine[k], message: `${item.id}가 겹친다` })
    seen.add(idKey(item.id))
  })
  return { doc: { scope, items }, problems: byLine(problems) }
}

export function parseTaste(text: string, scope: TasteScope): TasteDoc {
  return scanTaste(text, scope).doc
}

export function validateTaste(text: string, scope: TasteScope): DocProblem[] {
  return scanTaste(text, scope).problems
}

export function serializeTaste(doc: TasteDoc): string {
  const out = [TASTE_HEAD[doc.scope]]
  for (const item of doc.items) {
    out.push('', item.title ? `## ${item.id} ${item.title}` : `## ${item.id}`)
    for (const f of item.fields) out.push(f.text ? `- ${f.name}: ${f.text}` : `- ${f.name}:`)
  }
  return `${out.join('\n')}\n`
}

function trimBlank(lines: string[]): string[] {
  let a = 0
  let b = lines.length
  while (a < b && lines[a] === '') a++
  while (b > a && lines[b - 1] === '') b--
  return lines.slice(a, b)
}

export function scanCharter(text: string): { doc: CharterDoc; problems: DocProblem[] } {
  const problems: DocProblem[] = []
  const sections: { goal?: string[]; nonGoals?: string[] } = {}
  let goalLine: number | null = null
  let headSeen = false
  let cur: string[] | null = null
  let skipping = false
  eachLine(text, problems, (line, n) => {
    if (line.trim() === '') {
      cur?.push('')
      return
    }
    if (!headSeen) {
      headSeen = true
      if (takeHead(line, n, CHARTER_HEAD, problems)) return
    }
    if (line.startsWith('## ')) {
      const key = line === GOAL ? 'goal' : line === NON_GOALS ? 'nonGoals' : null
      if (key === null || sections[key] !== undefined) {
        problems.push({ kind: 'bad-heading', line: n, message: key === null ? `모르는 절 — ${line}` : `겹치는 절 — ${line}` })
        cur = null
        skipping = true
        return
      }
      cur = sections[key] = []
      if (key === 'goal') goalLine = n
      skipping = false
      return
    }
    if (cur) cur.push(line)
    else if (!skipping) problems.push({ kind: 'stray-line', line: n, message: `절 밖의 줄 — ${line}` })
  })
  if (!headSeen) problems.push({ kind: 'bad-head', line: null, message: `빈 문서 — 첫 줄은 「${CHARTER_HEAD}」여야 한다` })
  const goal = trimBlank(sections.goal ?? [])
  if (goal.length === 0) problems.push({ kind: 'empty-goal', line: goalLine, message: '목표가 비었다 — 「## 목표」 아래에 문장이 하나 이상 있어야 한다' })
  return { doc: { goal, nonGoals: sections.nonGoals ? trimBlank(sections.nonGoals) : null }, problems: byLine(problems) }
}

export function parseCharter(text: string): CharterDoc {
  return scanCharter(text).doc
}

export function validateCharter(text: string): DocProblem[] {
  return scanCharter(text).problems
}

export function serializeCharter(doc: CharterDoc): string {
  const out = [CHARTER_HEAD, '', GOAL, ...doc.goal]
  if (doc.nonGoals !== null) out.push('', NON_GOALS, ...doc.nonGoals)
  return `${out.join('\n')}\n`
}
