export type BackendId = 'claude-code' | 'codex'

export const BACKEND_LABELS: Record<BackendId, string> = {
  'claude-code': 'Claude Code',
  'codex': 'Codex'
}

export const WORKSPACE_ROOT_ID = 'workspace' as const
