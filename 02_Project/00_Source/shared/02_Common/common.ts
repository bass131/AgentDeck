export type BackendId = 'claude-code' | 'codex'

// 확인 응답은 이 모양 하나다. 실패 사유가 있는 채널만 error를 채운다.
export interface Ack {
  ok: boolean
  error?: string
}

export const BACKEND_LABELS: Record<BackendId, string> = {
  'claude-code': 'Claude Code',
  'codex': 'Codex'
}

export const WORKSPACE_ROOT_ID = 'workspace' as const
