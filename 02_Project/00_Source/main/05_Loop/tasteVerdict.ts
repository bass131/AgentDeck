// 항목 줄이 빠지거나 겹치면 불통과다 — 떨어질 항목의 줄을 빼서 통과하는 구멍을 막는다
import { scanTaste, type TasteScope } from '@shared/14_Taste/tasteDoc'
import { LOOP_DOC_MAX_BYTES } from '@main/13_Taste/tasteStore'
import type { TasteConflict } from './runState'

export interface TasteCheckItem { id: string; title: string; fields: { name: string; text: string }[] }

const LAYERS: { key: TasteScope; prefix: string; label: string }[] = [
  { key: 'project', prefix: 'P', label: '프로젝트 Taste' },
  { key: 'global', prefix: 'G', label: '전역 Taste' },
]

export function tasteChecklist(raw: Record<TasteScope, string | null>): { ok: true; items: TasteCheckItem[] } | { ok: false; reason: string } {
  const items: TasteCheckItem[] = []
  for (const layer of LAYERS) {
    const text = raw[layer.key]
    if (text === null) continue
    const size = Buffer.byteLength(text, 'utf8')
    if (size > LOOP_DOC_MAX_BYTES) return { ok: false, reason: `${layer.label}가 ${size}바이트로 상한 ${LOOP_DOC_MAX_BYTES}바이트를 넘는다` }
    const { doc, problems } = scanTaste(text, layer.key)
    if (problems.length > 0) {
      const shown = problems.slice(0, 3).map((p) => `${p.line === null ? '' : `${p.line}행 `}${p.message}`).join('; ')
      return { ok: false, reason: `${layer.label}에 검사 문제가 ${problems.length}개 있다 — ${shown}` }
    }
    for (const item of doc.items) items.push({ id: `${layer.prefix}-${item.id}`, title: item.title, fields: item.fields })
  }
  return { ok: true, items }
}

export function renderChecklist(items: readonly TasteCheckItem[]): string {
  return items
    .map((i) => [i.title ? `## ${i.id} ${i.title}` : `## ${i.id}`, ...i.fields.map((f) => (f.text ? `- ${f.name}: ${f.text}` : `- ${f.name}:`))].join('\n'))
    .join('\n\n')
}

type TasteMark = 'pass' | 'fail' | 'n/a'
interface TasteEntry {
  id: string
  state: TasteMark | 'missing' | 'duplicate'
  reason: string | null
  forbidden: boolean
  exemptBy: string | null
}
interface TasteJudgement {
  pass: boolean
  entries: TasteEntry[]
  // 항목에 묶이지 않는 문제 — 모르는 ID, 꼴이 틀린 TASTE 줄
  strays: string[]
  ignoredConflicts: string[]
  conflicts: TasteConflict[]
}

const CONFLICT_HEAD = 'TASTE-CONFLICT'
const MARK_HEAD = 'TASTE '
const MARK_LINE = /^TASTE (\S+): (pass|fail|n\/a) — (\S.*)$/
const CONFLICT_LINE = /^TASTE-CONFLICT (\S+) (\S+): (\S.*)$/
const MALFORMED = '꼴이 틀린 TASTE 줄'
const NOTE_MAX = 200

const TOKEN_MAX = 24
const REASON_ITEM_MAX = 80
const LIST_MAX = 5
const BAD_CONFLICT = '꼴 틀림'

export const isTasteLine = (line: string): boolean => line.startsWith(CONFLICT_HEAD) || line.startsWith(MARK_HEAD)

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s)

const hasBan = (item: TasteCheckItem): boolean => item.fields.some((f) => f.name === '금지' && f.text.trim() !== '')

export function judgeTaste(items: readonly TasteCheckItem[], text: string): TasteJudgement {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const known = new Map(items.map((i) => [i.id, i]))
  const seen = new Map<string, { mark: TasteMark; reason: string }[]>()
  const strays: string[] = []
  const conflictLines: { p: string; g: string; note: string; line: string }[] = []
  const ignoredConflicts: string[] = []
  for (const line of lines) {
    if (line.startsWith(CONFLICT_HEAD)) {
      const m = CONFLICT_LINE.exec(line)
      if (m) conflictLines.push({ p: m[1], g: m[2], note: m[3], line })
      else ignoredConflicts.push(BAD_CONFLICT)
      continue
    }
    if (!line.startsWith(MARK_HEAD)) continue
    const m = MARK_LINE.exec(line)
    if (!m) { strays.push(`${MALFORMED} — ${clip(line, 60)}`); continue }
    if (!known.has(m[1])) { strays.push(`모르는 ID ${clip(m[1], TOKEN_MAX)}`); continue }
    seen.set(m[1], [...(seen.get(m[1]) ?? []), { mark: m[2] as TasteMark, reason: m[3] }])
  }
  const entries: TasteEntry[] = items.map((item) => {
    const got = seen.get(item.id) ?? []
    const state = got.length === 0 ? 'missing' : got.length > 1 ? 'duplicate' : got[0].mark
    return { id: item.id, state, reason: got.length === 1 ? got[0].reason : null, forbidden: state === 'fail' && hasBan(item), exemptBy: null }
  })
  const byId = new Map(entries.map((e) => [e.id, e]))
  const conflicts: TasteConflict[] = []
  for (const c of conflictLines) {
    const p = byId.get(c.p)
    const g = byId.get(c.g)
    const recognized = c.p.startsWith('P-') && c.g.startsWith('G-') && p?.state === 'pass' && g?.state === 'fail'
    if (!recognized || !g) { ignoredConflicts.push(`${clip(c.p, TOKEN_MAX)} ${clip(c.g, TOKEN_MAX)}`); continue }
    if (conflicts.some((x) => x.project === c.p && x.global === c.g)) continue
    g.exemptBy ??= c.p
    conflicts.push({ project: c.p, global: c.g, note: clip(c.note, NOTE_MAX) })
  }
  const settled = entries.every((e) => e.state === 'pass' || e.state === 'n/a' || (e.state === 'fail' && e.exemptBy !== null))
  return { pass: settled && strays.length === 0, entries, strays, ignoredConflicts, conflicts }
}

function tags(e: TasteEntry): string {
  const t = [...(e.forbidden ? ['금지'] : []), ...(e.exemptBy ? [`면제 ${e.exemptBy}`] : [])]
  return t.length > 0 ? `(${t.join(', ')})` : ''
}
const STATE_WORD: Record<TasteEntry['state'], string> = { pass: 'pass', fail: 'fail', 'n/a': 'n/a', missing: '없음', duplicate: '중복' }

interface HeadPart { full: string; folded: string }

const capped = (xs: string[]): string[] => (xs.length > LIST_MAX ? [...xs.slice(0, LIST_MAX), `외 ${xs.length - LIST_MAX}개`] : xs)

function extras(j: TasteJudgement): HeadPart[] {
  const unknown = j.strays.filter((s) => s.startsWith('모르는 ID ')).map((s) => s.slice('모르는 ID '.length))
  const malformed = j.strays.filter((s) => s.startsWith(MALFORMED)).length
  const pairs = j.ignoredConflicts.filter((c) => c !== BAD_CONFLICT)
  const bad = j.ignoredConflicts.length - pairs.length
  const ignored = [...capped(pairs), ...(bad > 0 ? [`${BAD_CONFLICT} ${bad}개`] : [])]
  return [
    ...(unknown.length > 0 ? [{ full: `모르는 ID ${capped(unknown).join(' ')}`, folded: `모르는 ID ${unknown.length}개` }] : []),
    ...(malformed > 0 ? [{ full: `${MALFORMED} ${malformed}개`, folded: `${MALFORMED} ${malformed}개` }] : []),
    ...(ignored.length > 0 ? [{ full: `인정하지 않은 충돌 ${ignored.join(', ')}`, folded: `인정하지 않은 충돌 ${j.ignoredConflicts.length}개` }] : []),
  ]
}

const NOT_PASSED: TasteEntry['state'][] = ['fail', 'missing', 'duplicate']

// 불통과 ID는 가장 늦게 접는다 — FAIL 줄이 왜 떨어졌는지를 잃지 않게(헌법 1조)
export function tasteHead(j: TasteJudgement, max: number): string {
  const tail = extras(j)
  const flat = `Taste ${j.entries.map((e) => `${e.id} ${STATE_WORD[e.state]}${tags(e)}`).join(', ')}${tail.map((x) => `; ${x.full}`).join('')}`
  if (flat.length <= max) return flat
  const group = (s: TasteEntry['state']): HeadPart[] => {
    const es = j.entries.filter((e) => e.state === s)
    return es.length === 0 ? [] : [{ full: `${STATE_WORD[s]} ${es.map((e) => `${e.id}${tags(e)}`).join(' ')}`, folded: `${STATE_WORD[s]} ${es.length}개` }]
  }
  const parts = [...NOT_PASSED.flatMap(group), ...tail, ...group('n/a'), ...group('pass')]
  const shown = parts.map((p) => p.full)
  const render = (): string => `Taste ${shown.join('; ')}`
  for (let i = parts.length - 1; i >= 0 && render().length > max; i--) shown[i] = parts[i].folded
  return clip(render(), max)
}

export const tasteFailReasons = (j: TasteJudgement): string[] =>
  j.entries.filter((e) => e.state === 'fail' && e.reason).map((e) => `${e.id}: ${clip(e.reason ?? '', REASON_ITEM_MAX)}`)
