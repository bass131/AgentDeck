import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipcContract'
import type {
  SkillListRequest,
  SkillSetEnabledReq,
  McpSetEnabledReq,
  McpServerInfo,
  CommandListRequest,
  SlashCommandInfo,
} from '../../../shared/ipcContract'
import type { SkillsStore } from '../../05_settings/skills'
import type { McpStore } from '../../05_settings/mcp'
import type { CommandsStore } from '../../05_settings/commands'
import { mergeSlashCommands } from '../../05_settings/mergeSlashCommands'
import { getBackend } from '../../01_agents/registry'
import { validateWorkspaceRoot } from '../../02_fs/workspace'

export interface SettingsHandlerDeps {
  getCurrentWorkspaceRoot: () => string | null
  getSkillsStore: () => SkillsStore | null
  getMcpStore: () => McpStore | null
  getCommandsStore: () => CommandsStore | null
}

function resolveEffectiveRoot(
  requestedRoot: string | undefined,
  getGlobalRoot: () => string | null
): string | null {
  return validateWorkspaceRoot(requestedRoot) ?? getGlobalRoot()
}

export function registerSettingsHandlers(deps: SettingsHandlerDeps): void {
  const { getCurrentWorkspaceRoot, getSkillsStore, getMcpStore, getCommandsStore } = deps

  ipcMain.handle(IPC_CHANNELS.SKILL_LIST, async (_e, req?: SkillListRequest) => {
    const store = getSkillsStore()
    if (!store) return []
    const root = resolveEffectiveRoot(req?.root, getCurrentWorkspaceRoot)
    return store.listSkills(root)
  })

  ipcMain.handle(IPC_CHANNELS.SKILL_SET_ENABLED, async (_e, req: SkillSetEnabledReq): Promise<{ ok: boolean }> => {
    const store = getSkillsStore()
    if (!store) return { ok: false }
    const name = req?.name
    if (typeof name !== 'string' || name.trim().length === 0) {
      return { ok: false }
    }
    const enabled = req?.enabled
    if (typeof enabled !== 'boolean') {
      return { ok: false }
    }
    const ok = store.setSkillEnabled(name, enabled)
    return { ok }
  })

  ipcMain.handle(IPC_CHANNELS.MCP_LIST, async (): Promise<McpServerInfo[]> => {
    const store = getMcpStore()
    if (!store) return []
    return store.listMcpServers(getCurrentWorkspaceRoot())
  })

  ipcMain.handle(IPC_CHANNELS.MCP_SET_ENABLED, async (_e, req: McpSetEnabledReq): Promise<{ ok: boolean }> => {
    const store = getMcpStore()
    if (!store) return { ok: false }
    const name = req?.name
    if (typeof name !== 'string' || name.trim().length === 0) {
      return { ok: false }
    }
    const enabled = req?.enabled
    if (typeof enabled !== 'boolean') {
      return { ok: false }
    }
    const ok = store.setMcpEnabled(name, enabled)
    return { ok }
  })

  ipcMain.handle(IPC_CHANNELS.COMMAND_LIST, async (_e, req?: CommandListRequest): Promise<SlashCommandInfo[]> => {
    const store = getCommandsStore()
    if (!store) return []
    const root = resolveEffectiveRoot(req?.root, getCurrentWorkspaceRoot)
    const storeCommands = store.listSlashCommands(root)
    let captured: SlashCommandInfo[] = []
    try {
      captured = getBackend().listSupportedCommands(root)
    } catch {
    }
    return mergeSlashCommands(storeCommands, captured)
  })
}
