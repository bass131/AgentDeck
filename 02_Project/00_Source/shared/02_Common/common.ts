export type BackendId = 'claude-code' | 'codex'

// M05 G10 ack 통일 — 확인 응답은 이 모양 하나다. 실패 사유가 있는 채널만 error를 채운다.
// (옛 모양: agent 5채널 { accepted }, git·engine.install { ok, error? }, 나머지 { ok })
export interface Ack {
  ok: boolean
  error?: string
}

export const BACKEND_LABELS: Record<BackendId, string> = {
  'claude-code': 'Claude Code',
  'codex': 'Codex'
}

export const WORKSPACE_ROOT_ID = 'workspace' as const
