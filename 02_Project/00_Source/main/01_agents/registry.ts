import type { AgentBackend } from './AgentBackend'
import type { BackendId } from '../../shared/ipcContract'
import { ClaudeCodeBackend } from './ClaudeCodeBackend'
import { CodexBackend } from './CodexBackend'
import { echoBackend } from './EchoBackend'

const _backends: Record<BackendId, AgentBackend> = {
  'claude-code': new ClaudeCodeBackend(),
  'codex': new CodexBackend()
}

export function getBackend(id?: BackendId): AgentBackend {
  if (process.env.AGENTDECK_E2E === '1') {
    return echoBackend
  }
  if (id && id in _backends) {
    return _backends[id]
  }
  return _backends['claude-code']
}

export function listBackends(): AgentBackend[] {
  return Object.values(_backends)
}
