export interface MentionToken {
  query: string
  start: number
  end: number
}

const isBoundary = (ch: string): boolean => /\s/.test(ch)

export function mentionAtCaret(text: string, caret: number): MentionToken | null {
  let i = caret - 1
  while (i >= 0) {
    const ch = text[i]
    if (ch === '@') {
      const before = i === 0 ? '' : text[i - 1]
      if (before === '' || isBoundary(before)) return { query: text.slice(i + 1, caret), start: i, end: caret }
      return null
    }
    if (isBoundary(ch)) return null
    i--
  }
  return null
}

export function extractMentions(text: string): string[] {
  const re = /(?:^|\s)@([^\s@]+)/g
  const out: string[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const p = m[1]
    if (p.endsWith('/')) continue
    if (!seen.has(p)) {
      seen.add(p)
      out.push(p)
    }
  }
  return out
}

const LIMIT = 60

export interface MentionEntry {
  kind: 'dir' | 'file'
  full: string
  name: string
  dir: string
}

export interface MentionResult {
  mode: 'browse' | 'search'
  base: string
  term: string
  entries: MentionEntry[]
}

const SEARCH_MIN = 4

export function mentionEntries(files: string[], query: string): MentionResult {
  const cut = query.lastIndexOf('/')
  const base = cut === -1 ? '' : query.slice(0, cut + 1)
  const term = (cut === -1 ? query : query.slice(cut + 1)).toLowerCase()

  if (term.length < SEARCH_MIN) {
    const dirs = new Set<string>()
    const fileEntries: MentionEntry[] = []
    for (const f of files) {
      if (base && !f.startsWith(base)) continue
      const rest = f.slice(base.length)
      const slash = rest.indexOf('/')
      if (slash === -1) {
        if (term && !rest.toLowerCase().includes(term)) continue
        fileEntries.push({ kind: 'file', full: f, name: rest, dir: base })
      } else {
        const d = rest.slice(0, slash)
        if (term && !d.toLowerCase().includes(term)) continue
        dirs.add(d)
      }
    }
    const dirEntries: MentionEntry[] = [...dirs]
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map((d) => ({ kind: 'dir' as const, full: base + d, name: d, dir: base }))
    fileEntries.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
    return { mode: 'browse', base, term, entries: [...dirEntries, ...fileEntries].slice(0, LIMIT) }
  }

  const scored: { e: MentionEntry; score: number; len: number }[] = []
  for (const f of files) {
    if (base && !f.startsWith(base)) continue
    const rel = f.slice(base.length).toLowerCase()
    if (!rel.includes(term)) continue
    const slash = f.lastIndexOf('/')
    const name = slash === -1 ? f : f.slice(slash + 1)
    const dir = slash === -1 ? '' : f.slice(0, slash + 1)
    const bi = name.toLowerCase().indexOf(term)
    const score = bi === 0 ? 0 : bi > 0 ? 1 : 2
    scored.push({ e: { kind: 'file', full: f, name, dir }, score, len: f.length })
  }
  scored.sort((a, b) => a.score - b.score || a.len - b.len || a.e.full.localeCompare(b.e.full))
  return { mode: 'search', base, term, entries: scored.slice(0, LIMIT).map((s) => s.e) }
}
