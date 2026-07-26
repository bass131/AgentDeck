/**
 * handlers/settings.ts — settings 도메인 핸들러 등록
 *
 * 채널: SKILL_LIST · SKILL_SET_ENABLED · MCP_LIST · MCP_SET_ENABLED · COMMAND_LIST
 *
 * CRITICAL(신뢰경계):
 *   - SKILL_LIST/COMMAND_LIST: req.root(선택, CP1 P01 additive)는 renderer untrusted
 *     절대경로 — validateWorkspaceRoot(02_fs/workspace.ts, workspace.open과 동일
 *     관례)로 isAbsolute+존재+디렉토리 재검증 후에만 사용. 검증 실패·미전달(undefined,
 *     req 자체가 undefined로 도착 가능 — 옵셔널 체이닝 필수)이면 전역
 *     currentWorkspaceRoot로 폴백(기존 무인자 거동 100% 보존).
 *   - MCP_LIST/SKILL_SET_ENABLED/MCP_SET_ENABLED: 경로 인자 없음 — main의
 *     currentWorkspaceRoot만 사용.
 *   - SKILL_SET_ENABLED/MCP_SET_ENABLED: name·enabled 2개만 — path·시크릿 0.
 *     enabled: boolean 타입 검증. name: 비어있지 않은 string 검증.
 *   - MCP_LIST: detail은 store 내부에서 화이트리스트 마스킹 후 반환 — 시크릿 0.
 *   - COMMAND_LIST: SlashCommandInfo 4개 필드만 — .md 본문·경로·시크릿 0.
 *     backend 호출 실패 → store만 반환 (graceful try/catch).
 *     **root 소비처 2곳(store.listSlashCommands + getBackend().listSupportedCommands)
 *     모두 동일한 재검증-완료 root로 호출** — 한쪽만 배선하면 패널-root/전역-root
 *     커맨드가 혼합 반환된다(CP1 P02 감사 🟡 봉합).
 *   - store 미초기화 → [] (graceful).
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipc-contract'
import type {
  SkillListRequest,
  SkillSetEnabledReq,
  McpSetEnabledReq,
  McpServerInfo,
  CommandListRequest,
  SlashCommandInfo,
} from '../../../shared/ipc-contract'
import type { SkillsStore } from '../../05_settings/skills'
import type { McpStore } from '../../05_settings/mcp'
import type { CommandsStore } from '../../05_settings/commands'
import { mergeSlashCommands } from '../../05_settings/merge-slash-commands'
import { getBackend } from '../../01_agents/registry'
import { validateWorkspaceRoot } from '../../02_fs/workspace'

// ── 의존성 타입 ──────────────────────────────────────────────────────────────

export interface SettingsHandlerDeps {
  /** currentWorkspaceRoot getter — skill.list·mcp.list·command.list의 workspace 스캔 기준. */
  getCurrentWorkspaceRoot: () => string | null
  getSkillsStore: () => SkillsStore | null
  getMcpStore: () => McpStore | null
  getCommandsStore: () => CommandsStore | null
}

// ── root 재검증 + 전역 폴백 (CP1 P02) ────────────────────────────────────────

/**
 * 요청의 root(선택, untrusted)를 재검증하여 유효하면 그 값을, 무효(비절대·
 * 미존재·파일경로)이거나 부재(undefined)이면 전역 워크스페이스 root로 폴백한다.
 *
 * skill.list·command.list 두 핸들러가 공유 — root 소비처가 여럿(command.list는
 * 스토어 함수 + getBackend().listSupportedCommands 2곳)이므로, 이 함수를 한 번만
 * 호출해 얻은 동일한 effective root를 모든 소비처에 전달해야 한다(혼합 반환 방지).
 *
 * CRITICAL(신뢰경계): requestedRoot는 renderer(패널)에서 온 미검증 절대경로 —
 * validateWorkspaceRoot(02_fs/workspace.ts, workspace.open과 동일 관례)로
 * isAbsolute+존재+디렉토리 재검증 후에만 사용한다.
 */
function resolveEffectiveRoot(
  requestedRoot: string | undefined,
  getGlobalRoot: () => string | null
): string | null {
  return validateWorkspaceRoot(requestedRoot) ?? getGlobalRoot()
}

// ── 핸들러 등록 ──────────────────────────────────────────────────────────────

/** settings 도메인 IPC 핸들러를 등록한다. */
export function registerSettingsHandlers(deps: SettingsHandlerDeps): void {
  const { getCurrentWorkspaceRoot, getSkillsStore, getMcpStore, getCommandsStore } = deps

  // ── skill.list (P5a, CP1 P01/P02 — root 선택 파라미터) ───────────────────────
  // CRITICAL: req는 undefined로 도착 가능 — 옵셔널 체이닝 필수. SkillInfo 4개 필드만.
  //   req.root 재검증 실패·부재 시 전역 currentWorkspaceRoot로 폴백(기존 거동 보존).

  ipcMain.handle(IPC_CHANNELS.SKILL_LIST, async (_e, req?: SkillListRequest) => {
    const store = getSkillsStore()
    if (!store) return []
    const root = resolveEffectiveRoot(req?.root, getCurrentWorkspaceRoot)
    return store.listSkills(root)
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

  // ── command.list (P10, CP1 P01/P02 — root 선택 파라미터) ─────────────────────
  // CRITICAL: req는 undefined로 도착 가능 — 옵셔널 체이닝 필수.
  //   SlashCommandInfo 4개 필드만 — .md 본문·경로·시크릿 0.
  //   backend.listSupportedCommands 실패 → store만 반환 (graceful).
  //   ADR-003: getBackend() registry 경유 — 구체 엔진 클래스 미인지.
  //   root 소비처 2곳(store.listSlashCommands + getBackend().listSupportedCommands)
  //   모두 동일한 effective root로 호출 — 한쪽만 배선하면 패널-root/전역-root
  //   커맨드 혼합 반환(CP1 P02 감사 🟡 봉합).

  ipcMain.handle(IPC_CHANNELS.COMMAND_LIST, async (_e, req?: CommandListRequest): Promise<SlashCommandInfo[]> => {
    const store = getCommandsStore()
    if (!store) return []
    const root = resolveEffectiveRoot(req?.root, getCurrentWorkspaceRoot)
    const storeCommands = store.listSlashCommands(root)
    let captured: SlashCommandInfo[] = []
    try {
      captured = getBackend().listSupportedCommands(root)
    } catch {
      // backend 호출 실패 → store만 사용 (graceful)
    }
    return mergeSlashCommands(storeCommands, captured)
  })
}
