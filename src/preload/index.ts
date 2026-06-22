/**
 * preload/index.ts — contextBridge 화이트리스트 (신뢰 경계 게이트)
 *
 * CRITICAL (헌법 + ARCHITECTURE.md):
 *   - nodeIntegration: false, contextIsolation: true 환경 전제.
 *   - ipcRenderer를 통째로 noExpose 금지 — 채널별 함수만 노출.
 *   - 채널명 문자열은 src/shared/ipc-contract에서만 import.
 *   - 이 파일은 브릿지 역할만 — 핸들러 구현 로직 없음(Phase 04 main 담당).
 *
 * trust-boundary 깃발: 이 파일의 노출 목록 변경은 reviewer 게이트 필수.
 */

import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-contract'
import type {
  WorkspaceOpenRequest,
  WorkspaceOpenResponse,
  WorkspaceTreeRequest,
  WorkspaceTreeResponse,
  AgentRunRequest,
  AgentRunResponse,
  AgentAbortRequest,
  AgentAbortResponse,
  AgentEventPayload,
  FsDiffRequest,
  FsDiffResponse,
  ConversationLoadRequest,
  ConversationLoadResponse,
  ConversationSaveRequest,
  ConversationSaveResponse,
} from '../shared/ipc-contract'

// ── 화이트리스트 API 정의 ─────────────────────────────────────────────────────

/**
 * renderer에 노출되는 API 객체.
 * window.api.* 로 접근 (env.d.ts의 Window 확장과 대응).
 *
 * invoke형: ipcRenderer.invoke 래퍼 — renderer가 main에 요청 후 응답 대기.
 * event형:  구독 helper — main → renderer push 이벤트 등록/해제.
 */
const api = {
  // ── Workspace ──────────────────────────────────────────────────────────────

  /**
   * 워크스페이스 폴더 열기.
   * folderPath 미지정 시 OS 폴더 선택 다이얼로그를 main이 띄운다.
   */
  workspaceOpen: (
    req: WorkspaceOpenRequest
  ): Promise<WorkspaceOpenResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_OPEN, req),

  /**
   * 현재 열린 워크스페이스의 파일 트리 반환.
   */
  workspaceTree: (
    req: WorkspaceTreeRequest
  ): Promise<WorkspaceTreeResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_TREE, req),

  // ── Agent ──────────────────────────────────────────────────────────────────

  /**
   * 에이전트 대화 실행 시작.
   * 반환된 runId로 abort 및 AGENT_EVENT 이벤트를 식별한다.
   */
  agentRun: (req: AgentRunRequest): Promise<AgentRunResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_RUN, req),

  /**
   * 진행 중인 에이전트 실행 중단.
   */
  agentAbort: (req: AgentAbortRequest): Promise<AgentAbortResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_ABORT, req),

  /**
   * main → renderer AgentEvent 스트리밍 구독.
   *
   * 사용법:
   *   const unsubscribe = window.api.onAgentEvent((payload) => { ... })
   *   // 언마운트 시:
   *   unsubscribe()
   *
   * @returns 구독 해제 함수 (호출하면 해당 리스너만 제거)
   */
  onAgentEvent: (
    cb: (payload: AgentEventPayload) => void
  ): (() => void) => {
    // IpcRendererEvent 첫 번째 인자를 제거하고 페이로드만 전달
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: AgentEventPayload
    ): void => {
      cb(payload)
    }
    ipcRenderer.on(IPC_CHANNELS.AGENT_EVENT, handler)
    // 해제 함수 반환 — renderer가 useEffect cleanup 등에서 호출
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.AGENT_EVENT, handler)
    }
  },

  // ── FileSystem ─────────────────────────────────────────────────────────────

  /**
   * 파일 경로를 받아 워크 트리 vs 스냅샷 diff를 반환.
   */
  fsDiff: (req: FsDiffRequest): Promise<FsDiffResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.FS_DIFF, req),

  // ── Conversation ───────────────────────────────────────────────────────────

  /**
   * 대화 히스토리 로드.
   * id 미지정 시 최근 목록(limit 적용) 반환.
   */
  conversationLoad: (
    req: ConversationLoadRequest
  ): Promise<ConversationLoadResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_LOAD, req),

  /**
   * 대화 히스토리 저장(upsert).
   */
  conversationSave: (
    req: ConversationSaveRequest
  ): Promise<ConversationSaveResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_SAVE, req),
} as const

// ── contextBridge 노출 ────────────────────────────────────────────────────────

try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  // contextIsolation 비활성 등 예외 상황 로깅 (정상 경로에선 발생 X)
  console.error('[preload] exposeInMainWorld 실패:', error)
}

/**
 * Api 타입 export.
 * src/renderer/src/env.d.ts가 `import type { Api } from '../../preload'`로
 * Window.api 타입을 선언할 때 사용.
 */
export type Api = typeof api
