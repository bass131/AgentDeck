/**
 * ipc/index.ts — IPC 핸들러 등록 집계자 (Phase 10 분해 · Phase 04 컨텍스트 분리)
 *
 * 이 파일은 도메인별 핸들러 등록 모듈을 *조립*하는 오케스트레이터다.
 * 공유 상태·도메인 스토어·인프라 초기화(스토어/LSP 생성)는 context.ts가 소유하고,
 * 실제 핸들러 로직은 handlers/ 하위 모듈에 있다. 여기엔 *배선*만 남는다.
 *
 *   handlers/workspace.ts    — workspace.open / workspace.tree
 *   handlers/agent.ts        — agent.run / abort / interrupt / permission / question
 *   handlers/fs.ts           — fs.diff / read / listFiles / listDir / saveData / pickFolder
 *   handlers/conversation.ts — conversation.load / save / delete / rename
 *   handlers/reference.ts    — reference.add / list / tree
 *   handlers/git.ts          — git 9채널 (root·status·log·commitDetail·fileAt·workingFile·commit·push·pull)
 *   handlers/lsp.ts          — lsp 5채널 (status·hover·definition·semanticTokens·cachedTokens)
 *   handlers/engine.ts       — engine 7채널 (state·backendList·checkUpdate·appVersion·install·setActive·versionState)
 *   handlers/settings.ts     — skill / mcp / command 5채널
 *   handlers/personalization.ts — profile / prefs / usage 5채널
 *   handlers/multi.ts        — multiSession.load / multi.cmd* 5종(ADR-031, 유일한 쓰기 경로)
 *
 * 윈도우 컨트롤(F1-b) — registerWindowControls() 별도 등록(이 목록 미포함).
 *
 * CRITICAL(헌법 신뢰경계):
 *   - 모든 renderer 입력 검증은 각 핸들러 모듈에서 수행한다.
 *   - API 키·시크릿는 절대 IPC 응답·로그에 평문 노출 금지.
 *   - 채널명은 IPC_CHANNELS import만 — 하드코딩 0.
 */

import type { BrowserWindow } from 'electron'
import { registerWindowControls } from '../06_window/controls'
import {
  ipcState,
  roots,
  runManager,
  initStores,
  initLsp,
  getStore,
  getPrefsStore,
  getProfileStore,
  getSkillsStore,
  getMcpStore,
  getCommandsStore,
} from './context'
import { registerWorkspaceHandlers } from './handlers/workspace'
import { registerAgentHandlers } from './handlers/agent'
import { registerFsHandlers } from './handlers/fs'
import { registerConversationHandlers } from './handlers/conversation'
import { registerReferenceHandlers } from './handlers/reference'
import { registerGitHandlers } from './handlers/git'
import { registerLspHandlers } from './handlers/lsp'
import { registerEngineHandlers } from './handlers/engine'
import { registerSettingsHandlers } from './handlers/settings'
import { registerPersonalizationHandlers } from './handlers/personalization'
import { registerMultiHandlers } from './handlers/multi'

// 라이프사이클 API 재노출 — main/index.ts가 소비(공개 API 불변, context.ts가 구현).
export { setStore, disposeAllRuns, initMultiStore } from './context'

/** 핸들러 등록 중복 방지 플래그 (ipcMain.handle 중복 등록 시 throw 방지). */
let _registered = false

// ── 핸들러 등록 집계자 ────────────────────────────────────────────────────────

/**
 * BrowserWindow에 모든 도메인 IPC 핸들러를 등록한다.
 *
 * 호출 시점: app.whenReady() + createWindow() 이후.
 * activate 재호출 시 ipcState.win만 갱신하고 핸들러 재등록은 생략(_registered 플래그).
 * 핸들러들이 ipcState 객체 참조를 통해 갱신된 win을 자동 반영한다.
 *
 * @param win BrowserWindow 인스턴스 (AGENT_EVENT 스트리밍 + dialog용)
 */
export function registerIpc(win: BrowserWindow): void {
  ipcState.win = win  // activate 시 항상 갱신 (핸들러에 자동 반영)
  if (_registered) return
  _registered = true

  // ── 인프라 초기화 (스토어 + LSP 매니저) ──────────────────────────────────
  initStores()
  initLsp()

  // ── 윈도우 컨트롤 (F1-b) ─────────────────────────────────────────────────
  registerWindowControls()

  // ── 도메인 핸들러 등록 ────────────────────────────────────────────────────
  registerWorkspaceHandlers({ state: ipcState, roots })
  registerAgentHandlers({ state: ipcState, runManager })
  registerFsHandlers({ state: ipcState, roots })
  registerConversationHandlers({ getStore })
  registerReferenceHandlers({ state: ipcState, roots })
  registerGitHandlers()
  registerLspHandlers()
  registerEngineHandlers()
  registerSettingsHandlers({
    getCurrentWorkspaceRoot: () => ipcState.currentWorkspaceRoot,
    getSkillsStore,
    getMcpStore,
    getCommandsStore,
  })
  registerPersonalizationHandlers({
    getPrefsStore,
    getProfileStore,
  })
  registerMultiHandlers({
    getMultiStorePath: () => ipcState.multiStorePath,
  })
}
