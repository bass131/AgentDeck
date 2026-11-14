export type ToolKind = 'read' | 'write' | 'edit' | 'bash' | 'web' | 'search' | 'mcp' | 'git' | 'other'

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
  killshell: { kind: 'bash', verb: 'Kill', color: 'var(--violet)' },
  notebookread: { kind: 'read', verb: 'Notebook', color: 'var(--blue)' },
  taskstop: { kind: 'mcp', verb: 'Stop', color: 'var(--rose)' },
  taskget: { kind: 'mcp', verb: 'Task', color: 'var(--rose)' },
  taskoutput: { kind: 'mcp', verb: 'Output', color: 'var(--rose)' },
  monitor: { kind: 'mcp', verb: 'Monitor', color: 'var(--rose)' },
  enterworktree: { kind: 'git', verb: 'Worktree', color: 'var(--teal)' },
  exitworktree: { kind: 'git', verb: 'Worktree', color: 'var(--teal)' },
  toolsearch: { kind: 'search', verb: 'Tools', color: 'var(--yellow)' },
  waitformcpservers: { kind: 'mcp', verb: 'MCP', color: 'var(--rose)' },
}

export function mcpToolLabel(name: string): string {
  if (!name) return name
  const parts = name.split('__')
  if (parts.length < 3 || parts[0].toLowerCase() !== 'mcp') return name
  const server = parts[1]
  const tool = parts.slice(2).join('__')
  if (!server || !tool) return name
  return `${server} · ${tool}`
}

export function toolMetaFor(name: string): ToolMeta {
  const key = (name || '').toLowerCase().replace(/[^a-z]/g, '')
  if (MAP[key]) return MAP[key]
  if (key.startsWith('mcp')) return { kind: 'mcp', verb: mcpToolLabel(name), color: 'var(--rose)' }
  return { kind: 'other', verb: name || '도구', color: 'var(--text-3)' }
}

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
