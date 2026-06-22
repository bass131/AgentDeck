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
  FsReadRequest,
  FsReadResponse,
  ConversationLoadRequest,
  ConversationLoadResponse,
  ConversationSaveRequest,
  ConversationSaveResponse,
  ReferenceAddRequest,
  ReferenceAddResponse,
  ReferenceListRequest,
  ReferenceListResponse,
  ReferenceTreeRequest,
  ReferenceTreeResponse,
  WindowBounds,
  ResizeEdge,
  WindowMaximizedResponse,
  WindowStatePayload,
  GitRootRequest,
  GitRootResponse,
  GitStatusRequest,
  GitStatusResponse,
  GitLogRequest,
  GitLogResponse,
  GitCommitDetailRequest,
  GitCommitDetailResponse,
  GitFileAtRequest,
  GitFileAtResponse,
  GitWorkingFileRequest,
  GitWorkingFileResponse,
  GitCommitRequest,
  GitCommitResponse,
  GitPushRequest,
  GitPushResponse,
  GitPullRequest,
  GitPullResponse,
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

  /**
   * 파일 내용 읽기 — 텍스트(하이라이팅용) 또는 바이너리(이미지 data URL).
   * 응답 kind로 분기(text/binary/too-large/binary-skipped/not-found).
   */
  fsRead: (req: FsReadRequest): Promise<FsReadResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.FS_READ, req),

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

  // ── Reference Folder (M2-03) ───────────────────────────────────────────────
  // trust-boundary 깃발: 이 세 노출은 레퍼런스 폴더 보안 불변식에 의존한다.
  // folderPath는 main에서 검증, 이후 파일 접근은 등록 루트 ID 경유만 허용.

  /**
   * 레퍼런스 폴더를 워크스페이스 밖 읽기전용 보조 루트로 등록.
   * folderPath 미지정 시 main이 OS 폴더 선택 다이얼로그를 띄운다.
   * 등록 성공 시 main이 발급한 고유 ID(ref-1, ref-2…)를 포함한 레코드를 반환.
   * 사용자 취소 또는 검증 실패 시 reference: null.
   */
  referenceAdd: (
    req: ReferenceAddRequest
  ): Promise<ReferenceAddResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.REFERENCE_ADD, req),

  /**
   * 현재 세션에 등록된 레퍼런스 폴더 목록 반환.
   */
  referenceList: (
    req: ReferenceListRequest
  ): Promise<ReferenceListResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.REFERENCE_LIST, req),

  /**
   * 특정 레퍼런스 루트(등록 ID)의 파일 트리 반환.
   * 미등록 ID면 tree: null.
   */
  referenceTree: (
    req: ReferenceTreeRequest
  ): Promise<ReferenceTreeResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.REFERENCE_TREE, req),

  // ── Window Control (F1-b — 투명 frameless 셸) ──────────────────────────────
  // trust-boundary 깃발: 윈도우 조작 노출. 창 식별자 인자 없음 — main이
  // event.sender로 *요청한 창*만 조작(임의 창 조작 불가). drag/resize는
  // start/end 브래킷만 노출하고 커서 추종은 main이 수행(mousemove IPC 없음).

  /** 현재 창 최소화. */
  windowMinimize: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),

  /** 최대화 토글(custom maximize). 토글 후 상태 반환. */
  windowMaximizeToggle: (): Promise<WindowMaximizedResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE),

  /** 현재 창 닫기. */
  windowClose: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),

  /** 현재 창의 최대화 상태 조회(초기 .win.max 동기화용). */
  windowIsMaximized: (): Promise<WindowMaximizedResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),

  /** 현재 창 bounds 조회. */
  windowGetBounds: (): Promise<WindowBounds> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_GET_BOUNDS),

  /** 현재 창 bounds 설정. */
  windowSetBounds: (bounds: WindowBounds): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SET_BOUNDS, bounds),

  /** 수동 드래그 시작(타이틀바 mousedown). 커서 추종은 main 수행. */
  windowDragStart: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_DRAG_START),

  /** 수동 드래그 종료(mouseup). */
  windowDragEnd: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_DRAG_END),

  /** 수동 리사이즈 시작(핸들 mousedown, 엣지 지정). */
  windowResizeStart: (edge: ResizeEdge): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_RESIZE_START, { edge }),

  /** 수동 리사이즈 종료(mouseup). */
  windowResizeEnd: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_RESIZE_END),

  /**
   * main → renderer 최대화 상태 변경 구독(.win.max 토글용).
   * @returns 구독 해제 함수.
   */
  onWindowState: (
    cb: (payload: WindowStatePayload) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: WindowStatePayload
    ): void => {
      cb(payload)
    }
    ipcRenderer.on(IPC_CHANNELS.WINDOW_STATE, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_STATE, handler)
    }
  },

  // ── Git (M3 — 탐색기 Git 카드) ────────────────────────────────────────────
  // trust-boundary 깃발: git 연산은 main 프로세스 단독(child_process).
  // renderer는 이 그룹을 통해서만 git 데이터에 접근 — 직접 경로/exec 불가.

  git: {
    /**
     * cwd에서 상위 탐색하여 git 레포 최상위 경로 반환.
     * git 레포가 없으면 null.
     */
    root: (req: GitRootRequest): Promise<GitRootResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_ROOT, req),

    /**
     * 브랜치·ahead/behind·작업 트리 변경·브랜치/원격/태그 목록 반환.
     * git 레포가 없거나 오류 시 null.
     */
    status: (req: GitStatusRequest): Promise<GitStatusResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_STATUS, req),

    /**
     * 커밋 목록 반환 (최신순, limit 적용).
     */
    log: (req: GitLogRequest): Promise<GitLogResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_LOG, req),

    /**
     * 특정 커밋의 변경 파일 목록 + 증감 반환.
     */
    commitDetail: (req: GitCommitDetailRequest): Promise<GitCommitDetailResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT_DETAIL, req),

    /**
     * 커밋 시점 파일 내용 + 부모→커밋 diff 반환 (뷰어 마킹용).
     */
    fileAt: (req: GitFileAtRequest): Promise<GitFileAtResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_FILE_AT, req),

    /**
     * 작업 트리 파일의 HEAD→디스크 diff 반환 (뷰어 마킹용).
     */
    workingFile: (req: GitWorkingFileRequest): Promise<GitWorkingFileResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_WORKING_FILE, req),

    /**
     * git add -A + commit. subject/body로 커밋 메시지 구성.
     */
    commit: (req: GitCommitRequest): Promise<GitCommitResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT, req),

    /**
     * git push (upstream 미설정 시 main이 -u 재시도).
     * CRITICAL(비가역): 실 origin push — 인간 게이트(UI 확인 버튼)에서만 호출.
     */
    push: (req: GitPushRequest): Promise<GitPushResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_PUSH, req),

    /**
     * git pull --ff-only.
     */
    pull: (req: GitPullRequest): Promise<GitPullResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_PULL, req),
  },
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
