import type { AgentBackend } from '@main/03_Agent/AgentBackend'
import type { BackendId } from '../../shared/ipcContract'
import { ClaudeCodeBackend } from '@main/04_Claude/ClaudeCodeBackend'
import { CodexBackend } from '@main/03_Agent/CodexBackend'
import { echoBackend } from '@main/03_Agent/testing/EchoBackend'

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
