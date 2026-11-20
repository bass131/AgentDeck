import type { AgentBackend } from '@main/03_Agent/AgentBackend'
import type { BackendId } from '../../shared/ipcContract'
import { ClaudeCodeBackend } from '@main/04_Claude/ClaudeCodeBackend'
import { CodexBackend } from '@main/03_Agent/CodexBackend'
import { echoBackend } from '@main/03_Agent/testing/EchoBackend'
import { getSkillsStore, getMcpStore } from './context'
import { getUserDataDir } from '@main/02_Common/userData'
import { controlsForAppRun } from '@main/04_Claude/permission/controlsStore'

// 실행용 skills·MCP 값은 조립 지점(context)이 만든 store 하나에서 지연으로 읽는다 (M05 G11).
// 실행마다 store를 새로 만들지 않는다. 읽기가 throw하면 null — 옮기기 전 기본 provider와 같다.
const skillOverridesProvider = (): Record<string, 'off'> | null => {
  try {
    return getSkillsStore()?.disabledSkillOverrides() ?? null
  } catch {
    return null
  }
}

const mcpDeniedProvider = (): { serverName: string }[] | null => {
  try {
    return getMcpStore()?.deniedMcpServers() ?? null
  } catch {
    return null
  }
}

const _backends: Record<BackendId, AgentBackend> = {
  'claude-code': new ClaudeCodeBackend(undefined, skillOverridesProvider, mcpDeniedProvider, {
    controlsAtRunStart: () => controlsForAppRun(getUserDataDir),
    engineLockDir: getUserDataDir,
  }),
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
