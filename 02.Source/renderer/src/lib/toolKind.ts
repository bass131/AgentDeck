/**
 * toolKind.ts — 도구명 → {kind, verb, 색} + 입력에서 대상 추출 (순수, F3-03).
 *
 * store ToolCard는 name/input만 가지므로 표시용 kind·verb·색·target을 여기서 파생.
 * 색은 종류별 식별 토큰(인라인 hex 0).
 */

export type ToolKind = 'read' | 'write' | 'edit' | 'bash' | 'web' | 'search' | 'mcp' | 'other'

export interface ToolMeta {
  kind: ToolKind
  verb: string
  color: string
}

const MAP: Record<string, ToolMeta> = {
  read: { kind: 'read', verb: 'Read', color: 'var(--blue)' },
  write: { kind: 'write', verb: 'Write', color: 'var(--green)' },
  edit: { kind: 'edit', verb: 'Edit', color: 'var(--accent-2)' },
  multiedit: { kind: 'edit', verb: 'Edit', color: 'var(--accent-2)' },
  notebookedit: { kind: 'edit', verb: 'Edit', color: 'var(--accent-2)' },
  bash: { kind: 'bash', verb: 'Bash', color: 'var(--violet)' },
  bashoutput: { kind: 'bash', verb: 'Bash', color: 'var(--violet)' },
  glob: { kind: 'search', verb: 'Glob', color: 'var(--yellow)' },
  grep: { kind: 'search', verb: 'Grep', color: 'var(--yellow)' },
  webfetch: { kind: 'web', verb: 'Fetch', color: 'var(--cyan)' },
  websearch: { kind: 'web', verb: 'Search', color: 'var(--cyan)' },
  task: { kind: 'mcp', verb: 'Task', color: 'var(--rose)' },
}

/** 도구명 → 표시 메타. 대소문자/구분자(_,-,공백) 무시. */
export function toolMetaFor(name: string): ToolMeta {
  const key = (name || '').toLowerCase().replace(/[^a-z]/g, '')
  if (MAP[key]) return MAP[key]
  // mcp__* 류는 mcp
  if (key.startsWith('mcp')) return { kind: 'mcp', verb: name, color: 'var(--rose)' }
  return { kind: 'other', verb: name || '도구', color: 'var(--text-3)' }
}

/** 입력에서 대상 문자열 추출(파일/명령/패턴/URL/쿼리). 없으면 ''. */
export function toolTarget(input: unknown): string {
  if (input == null) return ''
  if (typeof input === 'string') return input
  if (typeof input === 'object') {
    const o = input as Record<string, unknown>
    for (const k of ['file_path', 'path', 'pattern', 'command', 'url', 'query', 'prompt']) {
      const v = o[k]
      if (typeof v === 'string' && v.length > 0) return v
    }
  }
  return ''
}
