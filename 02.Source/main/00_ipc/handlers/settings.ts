/**
 * handlers/settings.ts — settings 도메인 핸들러 등록
 *
 * 채널: SKILL_LIST · SKILL_SET_ENABLED · MCP_LIST · MCP_SET_ENABLED · COMMAND_LIST
 *
 * CRITICAL(신뢰경계):
 *   - 모든 채널: 경로 인자 없음 — main의 currentWorkspaceRoot만 사용.
 *   - SKILL_SET_ENABLED/MCP_SET_ENABLED: name·enabled 2개만 — path·시크릿 0.
 *     enabled: boolean 타입 검증. name: 비어있지 않은 string 검증.
 *   - MCP_LIST: detail은 store 내부에서 화이트리스트 마스킹 후 반환 — 시크릿 0.
 *   - COMMAND_LIST: SlashCommandInfo 4개 필드만 — .md 본문·경로·시크릿 0.
 *     backend 호출 실패 → store만 반환 (graceful try/catch).
 *   - store 미초기화 → [] (graceful).
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipc-contract'
import type {
  SkillSetEnabledReq,
  McpSetEnabledReq,
  McpServerInfo,
  SlashCommandInfo,
} from '../../../shared/ipc-contract'
import type { SkillsStore } from '../../05_settings/skills'
import type { McpStore } from '../../05_settings/mcp'
import type { CommandsStore } from '../../05_settings/commands'
import { mergeSlashCommands } from '../../05_settings/merge-slash-commands'
import { getBackend } from '../../01_agents/registry'

// ── 의존성 타입 ──────────────────────────────────────────────────────────────

export interface SettingsHandlerDeps {
  /** currentWorkspaceRoot getter — skill.list·mcp.list·command.list의 workspace 스캔 기준. */
  getCurrentWorkspaceRoot: () => string | null
  getSkillsStore: () => SkillsStore | null
  getMcpStore: () => McpStore | null
  getCommandsStore: () => CommandsStore | null
}

// ── 핸들러 등록 ──────────────────────────────────────────────────────────────

/** settings 도메인 IPC 핸들러를 등록한다. */
export function registerSettingsHandlers(deps: SettingsHandlerDeps): void {
  const { getCurrentWorkspaceRoot, getSkillsStore, getMcpStore, getCommandsStore } = deps

  // ── skill.list (P5a) ──────────────────────────────────────────────────────
  // CRITICAL: 인자 없음 — currentWorkspaceRoot만 사용. SkillInfo 4개 필드만.

  ipcMain.handle(IPC_CHANNELS.SKILL_LIST, async () => {
    const store = getSkillsStore()
    if (!store) return []
    return store.listSkills(getCurrentWorkspaceRoot())
  })

  // ── skill.setEnabled (P5a) ────────────────────────────────────────────────
  // CRITICAL: name·enabled 2개만 — path·시크릿 0. enabled: boolean 검증.

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

  // ── mcp.list (P5b) ────────────────────────────────────────────────────────
  // CRITICAL: 인자 없음 — currentWorkspaceRoot만. detail: store 내부 마스킹.

  ipcMain.handle(IPC_CHANNELS.MCP_LIST, async (): Promise<McpServerInfo[]> => {
    const store = getMcpStore()
    if (!store) return []
    return store.listMcpServers(getCurrentWorkspaceRoot())
  })

  // ── mcp.setEnabled (P5b) ─────────────────────────────────────────────────
  // CRITICAL: name·enabled 2개만 — env/args/url/command/headers 0.

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

  // ── command.list (P10) ────────────────────────────────────────────────────
  // CRITICAL: SlashCommandInfo 4개 필드만 — .md 본문·경로·시크릿 0.
  //   backend.listSupportedCommands 실패 → store만 반환 (graceful).
  //   ADR-003: getBackend() registry 경유 — 구체 엔진 클래스 미인지.

  ipcMain.handle(IPC_CHANNELS.COMMAND_LIST, async (): Promise<SlashCommandInfo[]> => {
    const store = getCommandsStore()
    if (!store) return []
    const storeCommands = store.listSlashCommands(getCurrentWorkspaceRoot())
    let captured: SlashCommandInfo[] = []
    try {
      captured = getBackend().listSupportedCommands(getCurrentWorkspaceRoot())
    } catch {
      // backend 호출 실패 → store만 사용 (graceful)
    }
    return mergeSlashCommands(storeCommands, captured)
  })
}
