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

import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'
import { IPC_CHANNELS, ZOOM_FACTOR_RANGE } from '../shared/ipc-contract'
import type {
  McpServerInfo,
  McpSetEnabledReq,
  SkillInfo,
  SkillSetEnabledReq,
  SlashCommandInfo,
  MultiSessionLoadResponse,
  MultiCmdUpsertRequest,
  MultiCmdUpsertResponse,
  MultiCmdCreateResponse,
  MultiCmdDeleteRequest,
  MultiCmdDeleteResponse,
  MultiCmdRenameRequest,
  MultiCmdRenameResponse,
  MultiCmdSelectRequest,
  MultiCmdSelectResponse,
  WorkspaceOpenRequest,
  WorkspaceOpenResponse,
  WorkspaceTreeRequest,
  WorkspaceTreeResponse,
  AgentRunRequest,
  AgentRunResponse,
  AgentAbortRequest,
  AgentAbortResponse,
  AgentInterruptRequest,
  AgentInterruptResponse,
  AgentEventPayload,
  PermissionResponse,
  QuestionResponse,
  FsDiffRequest,
  FsDiffResponse,
  FsReadRequest,
  FsReadResponse,
  ListFilesRequest,
  ListFilesResponse,
  FsListDirRequest,
  FsListDirResponse,
  SaveImageDataRequest,
  SaveImageDataResponse,
  ConversationLoadRequest,
  ConversationLoadResponse,
  ConversationSaveRequest,
  ConversationSaveResponse,
  ConversationDeleteRequest,
  ConversationDeleteResponse,
  ConversationRenameRequest,
  ConversationRenameResponse,
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
  UsageInfo,
  LspDocReq,
  LspPosReq,
  LspStatus,
  LspHoverResult,
  LspLocation,
  LspSemanticTokens,
  UiPrefs,
  UiPrefsSetReq,
  Profile,
  EngineState,
  EngineUpdateInfo,
  BackendStatus,
  EngineInstallRequest,
  EngineInstallResult,
  EngineInstallProgress,
  EngineSetActiveRequest,
  EngineVersionState,
  PickFolderResponse,
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
   * 진행 중인 에이전트 실행 중단 — 세션 종료.
   */
  agentAbort: (req: AgentAbortRequest): Promise<AgentAbortResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_ABORT, req),

  /**
   * 현재 turn만 중단 — 세션 유지(REPL 지속세션 정지, ADR-024 (3)).
   */
  agentInterrupt: (req: AgentInterruptRequest): Promise<AgentInterruptResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_INTERRUPT, req),

  /**
   * 권한 요청에 대한 사용자 선택을 main으로 전송 (M4-4).
   * PermissionModal의 onRespond 콜백에서 호출.
   * behavior: 'allow'=이번만 허용 · 'allow_always'=항상 허용 · 'deny'=거부.
   *
   * trust-boundary 깃발: 에이전트 권한 제어 게이트.
   * main이 runId·requestId를 검증 후 대기 중인 에이전트에만 전달한다.
   */
  permissionRespond: (req: PermissionResponse): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_RESPOND, req),

  /**
   * 질문 요청에 대한 사용자 답변을 main으로 전송 (M4-4).
   * QuestionModal의 onAnswer / onDismiss 콜백에서 호출.
   * answers=null이면 사용자가 건너뜀(dismiss).
   *
   * trust-boundary 깃발: 에이전트 질문 응답 게이트.
   * main이 runId·requestId를 검증 후 대기 중인 에이전트에만 전달한다.
   */
  questionRespond: (req: QuestionResponse): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.QUESTION_RESPOND, req),

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

  /**
   * 현재 워크스페이스의 프로젝트 파일 플랫 목록 반환 (@멘션 팔레트용).
   * 인자 없음 — main이 현재 워크스페이스 루트만 열거(신뢰경계).
   */
  listFiles: (req?: ListFilesRequest): Promise<ListFilesResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_FILES, req ?? {}),

  /**
   * 탐색기 lazy 폴더 열기 — 1폴더 1레벨 entries 반환 (Phase 35 M7).
   *
   * rootId: 등록 루트 ID (미지정 = 워크스페이스 폴백). 임의 절대경로 금지.
   * relDir: 루트 기준 상대경로 ('' = 루트). untrusted — main 이 resolveSafe 검증.
   *
   * trust-boundary 깃발: rootId 는 레지스트리 ID만(임의 경로 주입 불가).
   * relDir 탈출('../'·절대경로) → main 이 [] 반환(신뢰경계).
   * 응답 entries 는 shallow(children 없음).
   */
  fsListDir: (req: FsListDirRequest): Promise<FsListDirResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.FS_LIST_DIR, req),

  /**
   * 붙여넣기/드롭된 이미지 바이트를 앱 attachments 디렉토리에 저장하고 절대 경로 반환.
   * main이 파일명 생성 + 앱 전용 디렉토리에만 기록(신뢰경계 — renderer 경로 미지정).
   */
  saveImageData: (req: SaveImageDataRequest): Promise<SaveImageDataResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_IMAGE_DATA, req),

  /**
   * 디스크 파일(드롭/picker)의 절대 경로를 동기 반환 (Electron webUtils).
   * CRITICAL: webUtils.getPathForFile은 **preload에서만** 호출 가능(sandboxed renderer 불가).
   * 클립보드 붙여넣기 등 디스크 경로 없는 File은 '' 반환 → renderer가 saveImageData로 폴백.
   */
  pathForFile: (file: File): string => webUtils.getPathForFile(file),

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

  /** 대화 영구 삭제 (세션 CRUD — M4-3). */
  conversationDelete: (
    req: ConversationDeleteRequest
  ): Promise<ConversationDeleteResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_DELETE, req),

  /** 대화 제목 변경 — 사용자 지정 제목 보존 (세션 CRUD — M4-3). */
  conversationRename: (
    req: ConversationRenameRequest
  ): Promise<ConversationRenameResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_RENAME, req),

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

  // ── Usage (OAuth 레이트리밋 게이지 — B8) ─────────────────────────────────────

  /**
   * 5시간·주간 OAuth 레이트리밋 게이지 조회.
   *
   * 인자 없음 — main이 현재 세션의 레이트리밋 상태를 파생값(pct·resetsAt)으로 반환.
   *
   * trust-boundary 깃발: 응답 UsageInfo에 토큰/시크릿 필드 없음(pct·resetsAt만).
   * 구현(핸들러): main-process getUsage 담당.
   * 소비: renderer ContextStrip(5h 칩·주간 칩·리셋 타이머) 담당.
   */
  getUsage: (): Promise<UsageInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.USAGE_GET),

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

  // ── LSP (M2-LSP — 27a) ────────────────────────────────────────────────────
  // trust-boundary 깃발: LSP 연산은 main 프로세스 단독(자식프로세스 spawn).
  // req는 rootId+relPath만 허용 — cwd/절대경로 필드 없음.
  // main이 roots.ts/workspace.ts resolveSafe 게이트로 경로를 검증한다.
  // 미등록 rootId 또는 relPath 탈출 → 'unsupported'/null 반환(신뢰경계 불가침).

  lsp: {
    /**
     * LSP 서버 상태 조회.
     * 대응하는 LSP 서버 없음·미등록 rootId·경로 탈출 → 'unsupported'.
     *
     * CRITICAL(신뢰경계): rootId 는 등록 루트 ID(WORKSPACE_ROOT_ID 또는 ref-N).
     * relPath 는 루트 기준 상대경로 — main이 resolveSafe로 검증.
     */
    status: (req: LspDocReq): Promise<LspStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.LSP_STATUS, req),

    /**
     * LSP 호버 정보 조회 (마크다운 결과).
     * 서버 미준비 또는 심볼 없으면 null.
     *
     * CRITICAL(신뢰경계): pos 포함 req — rootId+relPath+pos만. 절대경로 0.
     */
    hover: (req: LspPosReq): Promise<LspHoverResult | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.LSP_HOVER, req),

    /**
     * LSP 정의 이동 조회.
     * 워크스페이스 내부 파일의 정의 위치 목록 반환.
     * 워크스페이스 밖 결과(node_modules 등)는 main이 제외 — graceful no-op.
     *
     * CRITICAL(신뢰경계): 응답 LspLocation.relPath 는 절대경로 아님(워크스페이스 상대만).
     */
    definition: (req: LspPosReq): Promise<LspLocation[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.LSP_DEFINITION, req),

    /**
     * LSP 시맨틱 토큰 라이브 분석.
     * 서버 ready 상태에서 전체 파일 시맨틱 토큰을 분석하여 반환.
     * 서버 미준비 또는 분석 실패 시 null.
     */
    semanticTokens: (req: LspDocReq): Promise<LspSemanticTokens | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.LSP_SEMANTIC_TOKENS, req),

    /**
     * LSP 시맨틱 토큰 캐시 즉시 조회.
     * 인메모리 캐시에서 즉시 반환 — 캐시 없으면 null.
     * renderer가 파일 오픈 직후 cachedTokens로 즉시 색칠하고,
     * ready 후 semanticTokens로 라이브 갱신하는 패턴.
     */
    cachedTokens: (req: LspDocReq): Promise<LspSemanticTokens | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.LSP_CACHED_TOKENS, req),
  },

  // ── Profile (P2 — 로컬 사용자 개인화, profile.json 영속) ─────────────────────
  // trust-boundary 깃발: 닉네임·아바타 색(개인화)만 — 토큰·시크릿 0.
  // null 응답 = 첫실행 판정. renderer 부트 게이트에서 호출 후 온보딩 분기.
  // 구현(핸들러): main-process profile.ts 담당.

  /**
   * 저장된 로컬 프로필 읽기.
   * 인자 없음. null = 미설정(첫실행) → renderer가 온보딩 화면 진입.
   *
   * CRITICAL(신뢰경계): 반환값 Profile은 nickname·color만(토큰·시크릿 0).
   * 구현(핸들러): main-process profile.ts (userData/profile.json 읽기).
   * 소비: renderer 부트 3단계 게이트.
   */
  getProfile: (): Promise<Profile | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROFILE_GET),

  /**
   * 로컬 프로필 저장.
   * nickname·color만 저장. 응답 { ok: true } = 성공.
   *
   * CRITICAL(신뢰경계): Profile에 토큰·시크릿·API 키를 포함하면 안 된다 — 호출부 책임.
   * 구현(핸들러): main-process profile.ts (userData/profile.json 쓰기).
   * 소비: renderer Profile 컴포넌트 onEnter(입장하기 제출 시).
   */
  setProfile: (p: Profile): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROFILE_SET, p),

  // ── UI Prefs (P1 — 원본 lib/prefs.ts 미러, ui-prefs.json 영속) ──────────────
  // trust-boundary 깃발: UI 표시 설정(패널 크기·줌·테마·플래그 등) 전용.
  // 민감 자격증명(API 키·토큰·시크릿)을 이 채널로 저장하면 안 된다.
  // 구현: main P1-main Worker(src/main/prefs.ts) · 소비: renderer lib/prefs.ts.

  /**
   * UI 환경설정 전체 읽기.
   * 인자 없음 — main이 userData/ui-prefs.json 전체를 반환한다.
   *
   * CRITICAL(신뢰경계): 반환값 UiPrefs blob은 무해 UI 설정만 포함해야 한다.
   * 민감 자격증명이 포함된 경우 호출부(renderer lib/prefs.ts)가 책임진다.
   * 구현(핸들러): main-process P1-main Worker 담당.
   * 소비: renderer lib/prefs.ts가 boot 시 loadPrefs()로 호출 후 인메모리 캐시 유지.
   */
  getUiPrefs: (): Promise<UiPrefs> =>
    ipcRenderer.invoke(IPC_CHANNELS.UI_PREFS_GET),

  /**
   * UI 환경설정 단일 키 쓰기.
   * 요청의 key/value를 main이 ui-prefs.json에 병합 저장 후 { ok: true } 반환.
   *
   * CRITICAL(신뢰경계): value에 민감 자격증명(API 키·토큰·시크릿)을 전달하면 안 된다.
   * 이 채널은 UI 표시 설정(패널 크기·줌·테마·seen 플래그 등) 전용 — 호출부 책임으로 명시.
   * 구현(핸들러): main-process P1-main Worker 담당.
   * 소비: renderer lib/prefs.ts setPref() → 인메모리 캐시 갱신 + IPC 비동기 저장.
   */
  setUiPref: (req: UiPrefsSetReq): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.UI_PREFS_SET, req),

  // ── Zoom (FB1 P02 read-only 조회 + FB2 P03 클램프 setter, 신규 IPC 채널 0) ──
  // trust-boundary 깃발: webFrame 모듈 전체를 노출하지 않는다 — getZoomFactor()
  // 순수 조회 1개 + setZoomFactor(factor) 클램프된 적용 1개만 화이트리스트.
  // Electron 기본 View 메뉴 zoom role(zoomIn/zoomOut/resetZoom, Ctrl+=/−/0)은
  // 그대로 공존 — 이 앱은 그 role을 대체하지 않고, P05(Ctrl+= 단축키·우하단
  // ± 버튼) 전용 보조 적용 경로만 얹는다. ipcRenderer.invoke를 쓰는 커스텀
  // IPC *채널*은 만들지 않는다(plan-auditor 스파이크 2026-07-04 결정 유지 —
  // 이 setter는 preload 내부에서 webFrame을 직접 클램프-래핑할 뿐 IPC 왕복
  // 없음). 영속은 기존 setUiPref('zoomFactor') 재사용. per-region CSS
  // zoom(zoom.tsx)과의 곱연산 공존 정의·증분 상수(ZOOM_FACTOR_STEP)·클램프
  // 범위(ZOOM_FACTOR_RANGE)는 shared/ipc/personalization.ts 주석 참조.

  /**
   * 현재 전역 page zoom factor 조회 (webFrame.getZoomFactor 래핑).
   * 인자 없음. 응답 number(예: 1.2 = 120%).
   *
   * CRITICAL(신뢰경계): webFrame 객체 자체를 노출하지 않는다 — 이 getter가
   * 반환하는 순수 number 값만 renderer가 받는다. zoomIn/zoomOut/resetZoom
   * 등 원시 적용 메서드는 이 API 표면에 없다(Electron 기본 role이 담당).
   * 클램프된 적용은 바로 아래 setZoomFactor()를 통해서만 가능하다.
   */
  getZoomFactor: (): number => webFrame.getZoomFactor(),

  /**
   * 전역 page zoom factor를 클램프해 설정 (webFrame.setZoomFactor 클램프 래핑,
   * FB2 P03 — P05 Ctrl+= 단축키·우하단 ± 버튼 소비).
   * 요청 factor: number. 응답 없음(void) — 실패해도 예외를 던지지 않는다.
   *
   * CRITICAL(신뢰경계 — 클램프는 이 노출 지점에서 강제한다):
   *   - `typeof factor !== 'number'`(타입 불일치) 이거나
   *     `!Number.isFinite(factor)`(NaN·±Infinity, 비유한값)이면 아무 것도
   *     하지 않는다(no-op) — webFrame에는 아예 전달하지 않는다. 호출부
   *     (renderer)가 이미 유효한 값을 보낸다고 가정하지 않는다.
   *   - 유한 number면 `ZOOM_FACTOR_RANGE.MIN`~`MAX`(0.5~2.0)로 clamp한 뒤에만
   *     `webFrame.setZoomFactor()`를 호출한다. 범위 밖 입력(예: 0.1, 5.0)은
   *     조용히 경계값으로 스냅된다 — 원시 `webFrame.setZoomFactor`를 그대로
   *     위임하지 않는다.
   *   - webFrame 원시 객체·zoomIn/zoomOut/resetZoom은 여전히 노출하지 않는다
   *     (Electron 기본 View 메뉴 role은 그대로 공존, 대체 아님).
   */
  setZoomFactor: (factor: number): void => {
    if (typeof factor !== 'number' || !Number.isFinite(factor)) return
    const clamped = Math.min(ZOOM_FACTOR_RANGE.MAX, Math.max(ZOOM_FACTOR_RANGE.MIN, factor))
    webFrame.setZoomFactor(clamped)
  },

  // ── App (P4 — 앱 메타 정보) ──────────────────────────────────────────────────
  // trust-boundary 깃발: 시크릿 0 — 앱 버전 문자열(package.json version)만 노출.
  // 원본 AgentCodeGUI window.api.app.getVersion() 미러.
  // 구현(핸들러): main-process 담당.
  // 소비: renderer WhatsNew/UpdateNotes — getAppVersion() + getPref(seen-key) 비교.

  /**
   * Electron 앱 버전 조회.
   * 인자 없음. 응답 string (예: "0.1.0").
   *
   * CRITICAL(신뢰경계): 시크릿 0 — 앱 버전 문자열만.
   * 구현(핸들러): main-process (ipcMain.handle(APP_VERSION, () => app.getVersion())).
   * 소비: renderer WhatsNew/UpdateNotes가 getAppVersion() + getPref(seen-key)로
   *        현재 버전을 이전 seen 버전과 비교해 자동 트리거 여부를 판정한다.
   */
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),

  // ── Engine State (P3 — SDK 가용 + 인증 상태 탐지) ───────────────────────────
  // trust-boundary 깃발: authed 는 불리언만 — 토큰·API 키·시크릿 값 0.
  // renderer는 authed 여부로 EngineGate 분기만 가능, 자격증명 자체 미수령.
  // 구현(핸들러): main-process engine-state.ts 담당.
  // 소비: renderer AppGate — profile 완료(P2) 후 engine.state 체크.

  /**
   * 코딩 엔진 상태 조회 — SDK 가용 + 인증 여부.
   * 인자 없음. 응답 EngineState(available·authed·version).
   *
   * CRITICAL(신뢰경계): 응답 EngineState에 토큰·API 키·시크릿 필드 없음.
   * authed 는 불리언만 — 자격증명 값은 main에서만 보유, renderer로 미전달.
   * 구현(핸들러): main-process engine-state.ts
   *   (ClaudeCodeBackend.isAvailable() + 인증탐지[credentials.json OR ANTHROPIC_API_KEY]).
   * 소비: renderer AppGate — authed=false 시 EngineGate 안내 표시(P3).
   */
  getEngineState: (): Promise<EngineState> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENGINE_STATE),

  /**
   * 엔진 버전 업데이트 체크.
   * 인자 없음. 현재 번들 SDK 버전 vs npm registry 최신 버전을 비교한 결과 반환.
   *
   * CRITICAL(신뢰경계):
   *   - 응답 EngineUpdateInfo 는 버전 문자열·boolean 3개 필드만 — 토큰·API 키·시크릿 0.
   *   - npm registry fetch 는 main 프로세스 단독 — renderer 측 임의 fetch 금지.
   *   - 오프라인/실패 시 current/latest 가 null 로 반환 (updateAvailable: false).
   *
   * 구현(핸들러): main-process engine-state.ts 담당.
   * 소비: renderer 엔진 업데이트 알림 배너/아이콘.
   */
  checkEngineUpdate: (): Promise<EngineUpdateInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENGINE_CHECK_UPDATE),

  /**
   * 등록된 코딩 엔진(백엔드) 상태 목록 조회 — 듀얼 프로바이더 상태 패널(B1).
   * 인자 없음. 응답 BackendStatus[](claude-code·codex …).
   *
   * CRITICAL(신뢰경계 ADR-008):
   *   - 각 원소는 id·name·available·version·latestVersion·authed 6개 필드만 — 토큰·키·시크릿 0.
   *   - authed 는 불리언만. 탐지/버전조회/인증판정은 main(backend-status.ts) 단독.
   * 구현(핸들러): main-process backend-status.ts + ipc/index.ts(BACKEND_LIST).
   * 소비: renderer ProviderStatusPanel(SettingsModal "프로바이더" 섹션).
   */
  listBackends: (): Promise<BackendStatus[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.BACKEND_LIST),

  // ── Engine Install / Version Management (폴리싱 #2b+c — ADR-018) ───────────
  // trust-boundary 깃발: 엔진 설치·버전관리 게이트.
  //   installEngine: version=untrusted → main 이 strict semver 검증. 응답 ok/error만.
  //   onEngineInstallProgress: line=main 이 시크릿 마스킹한 npm 출력만.
  //   setActiveEngine: version=untrusted → main 이 installed 목록 검증. 응답 ok만.
  //   getEngineVersionState: 응답 EngineVersionState 버전 문자열/목록/패키지명만 — 시크릿 0.
  //   **기존 getEngineState(EngineState)와 완전히 별개** — 혼동 금지.
  // 구현(핸들러): main-process engine-versions.ts 담당.
  // 소비: renderer EngineGate 설치/버전 전환 UI.

  /**
   * 엔진 버전 설치.
   * version 은 untrusted — main 이 strict semver 검증 후 npm 설치 실행.
   * 검증 실패 또는 설치 오류 시 ok:false, error 반환.
   * 설치 진행 스트림은 onEngineInstallProgress 구독으로 수신.
   *
   * CRITICAL(신뢰경계): 응답 EngineInstallResult 에 토큰·API 키·시크릿 필드 없음.
   * npm 실행은 main 프로세스 단독 — renderer 는 이 채널 invoke 만 가능.
   */
  installEngine: (version: string): Promise<EngineInstallResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENGINE_INSTALL, { version } satisfies EngineInstallRequest),

  /**
   * 활성 엔진 버전 전환.
   * version 은 untrusted — main 이 installed 목록 포함 여부 검증.
   * 미설치 버전 지정 시 ok:false 반환.
   *
   * CRITICAL(신뢰경계): 응답 {ok} boolean 만 — 토큰·시크릿 0.
   */
  setActiveEngine: (version: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENGINE_SET_ACTIVE, { version } satisfies EngineSetActiveRequest),

  /**
   * 설치/활성 버전 상태 조회.
   * 인자 없음 — main 이 엔진 버전 목록(package·bundled·active·installed)을 반환.
   *
   * CRITICAL(신뢰경계):
   *   - 응답 EngineVersionState 에 authed·token·apiKey·시크릿 필드 없음.
   *   - **기존 getEngineState()(EngineState.authed 불리언)와 완전히 별개** — 혼동 금지.
   *     이 채널은 멀티버전 설치 관리 상태(버전 문자열·목록)만 반환한다.
   */
  getEngineVersionState: (): Promise<EngineVersionState> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENGINE_VERSION_STATE),

  /**
   * main → renderer 엔진 설치 진행 이벤트 구독.
   *
   * onAgentEvent 패턴과 동일: ipcRenderer.on + removeListener 반환.
   *
   * 사용법:
   *   const unsub = window.api.onEngineInstallProgress((p) => { ... })
   *   // 언마운트 시:
   *   unsub()
   *
   * CRITICAL(신뢰경계): p.line 은 main 이 시크릿 마스킹한 npm 출력만.
   * 토큰·API 키·환경변수 값이 npm 출력에 포함되면 main 이 제거 후 전달한다.
   *
   * @returns 구독 해제 함수 (호출하면 해당 리스너만 제거)
   */
  onEngineInstallProgress: (
    cb: (p: EngineInstallProgress) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      p: EngineInstallProgress
    ): void => {
      cb(p)
    }
    ipcRenderer.on(IPC_CHANNELS.ENGINE_INSTALL_PROGRESS, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ENGINE_INSTALL_PROGRESS, handler)
    }
  },

  // ── Settings: Skill (P5a — Settings Skill 탭 실데이터·토글) ─────────────────
  // trust-boundary 깃발: name/description/scope/enabled만 — 시크릿 0.
  // 토글 요청은 boolean-only(SkillSetEnabledReq.enabled). path·토큰 필드 없음.
  // 구현(핸들러): main-process settings/skills.ts 담당.
  // 소비: renderer SettingsModal SkillView.

  /**
   * 스킬 목록 조회.
   * 인자 없음 — main이 현재 등록된 전체 스킬 목록을 SkillInfo[] 로 반환한다.
   *
   * CRITICAL(신뢰경계): 응답 SkillInfo[]는 name/description/scope/enabled만.
   * path·시크릿·API 키 포함 불가 — 스킬 식별자와 표시 정보·활성화 상태만 전달.
   */
  listSkills: (): Promise<SkillInfo[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_LIST),

  /**
   * 스킬 활성화/비활성화 토글.
   * 요청 SkillSetEnabledReq(name + enabled). 응답 { ok: boolean }.
   *
   * CRITICAL(신뢰경계): enabled는 boolean-only — 문자열·숫자 전달 불가.
   * name은 스킬 식별자만(경로 탈출 불가 — main이 검증).
   * 시크릿 0 — 토글 상태(true/false)만 전송.
   */
  setSkillEnabled: (req: SkillSetEnabledReq): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_SET_ENABLED, req),

  // ── Slash commands (P10 — Composer 슬래시 자동완성 팔레트) ──────────────────
  // trust-boundary 깃발: SlashCommandInfo 는 name/description/argHint/scope 만 노출.
  //   .md 본문(커맨드 실행 프롬프트)·파일 경로·환경변수·시크릿 0 — 표시 정보만.
  //   name 은 슬래시 제외 식별자 — 경로 탈출 불가, main이 안전 문자열만 추출.
  // 구현(핸들러): main-process settings/commands.ts 담당.
  // 소비: renderer Composer 슬래시 팔레트.

  /**
   * 슬래시 커맨드 목록 조회.
   * 인자 없음 — main이 SDK 빌트인 + .claude/commands 스캔 결과를 SlashCommandInfo[] 로 반환.
   *
   * CRITICAL(신뢰경계): 응답 SlashCommandInfo[] 는 name/description/argHint/scope 만 포함.
   *   - .md 본문·파일 경로·환경변수·시크릿 운반 필드(path/content/body/env) 0.
   *   - name 은 슬래시 제외 안전 식별자 — main이 경로 탈출·슬래시 접두사를 제거 후 전달.
   * 소비: renderer Composer — '/' 입력 후 invoke, 결과로 팔레트 name 기준 필터링.
   */
  listSlashCommands: (): Promise<SlashCommandInfo[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.COMMAND_LIST),

  // ── Settings: MCP (P5b — Settings MCP 탭 실데이터·토글) ─────────────────────
  // trust-boundary 깃발: detail=main이 마스킹한 안전 문자열 — 시크릿 0.
  //   stdio: command basename 만 · http/sse: host 만 · env/args/토큰 절대 미포함.
  // 토글 요청은 boolean-only(McpSetEnabledReq.enabled). 시크릿 운반 필드 없음.
  // 구현(핸들러): main-process settings/mcp.ts 담당.
  // 소비: renderer SettingsModal McpView.

  /**
   * MCP 서버 목록 조회.
   * 인자 없음 — main이 전체 MCP 서버 목록을 McpServerInfo[] 로 반환한다.
   *
   * CRITICAL(신뢰경계): 응답 McpServerInfo[] 는 name/scope/origin/transport/detail/enabled 만.
   * detail = main(settings/mcp.ts)이 화이트리스트 마스킹한 안전 문자열만 —
   *   stdio: command basename 만 · http/sse: host 만 · env/args/토큰/URL 전체 절대 미포함.
   * env/args/url/command/headers 같은 시크릿 운반 필드 0.
   */
  listMcpServers: (): Promise<McpServerInfo[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_LIST),

  /**
   * MCP 서버 활성화/비활성화 토글.
   * 요청 McpSetEnabledReq(name + enabled). 응답 { ok: boolean }.
   *
   * CRITICAL(신뢰경계): enabled는 boolean-only — 문자열·숫자 전달 불가.
   * name은 MCP 서버 식별자(mcpServers map 키)만 — main이 검증.
   * 시크릿 0 — 토글 상태(true/false)만 전송. detail/env/args/url 필드 없음.
   */
  setMcpEnabled: (req: McpSetEnabledReq): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_SET_ENABLED, req),

  // ── Dialog (P15 — 멀티 패널별 cwd 폴더 선택) ──────────────────────────────
  // trust-boundary 깃발: OS 폴더 다이얼로그 노출.
  //   요청 인자 없음 — renderer 가 경로를 주입할 수 없다.
  //   응답 path 는 main 이 절대경로 검증 후 반환 · 취소/실패 시 null.
  //   전역 워크스페이스(_currentWorkspaceRoot) 미변경 — workspace.open 과 명백히 구분.
  // 구현(핸들러): main-process ipc/index.ts 담당.
  // 소비: renderer MultiWorkspace 패널 폴더 선택 버튼.

  /**
   * OS 폴더 선택 다이얼로그를 띄우고 선택한 폴더의 절대경로를 반환.
   * 인자 없음 — main 이 다이얼로그로 선택(renderer 경로 주입 불가).
   * 취소 또는 실패 시 path: null.
   *
   * trust-boundary 깃발: 경로만 반환 · 전역 워크스페이스 미변경.
   * workspace.open 과 달리 전역 _currentWorkspaceRoot 를 변경하지 않는다.
   */
  pickFolder: (): Promise<PickFolderResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_PICK_FOLDER),

  // ── Multi Session (M3 — 멀티 세션 영속) ────────────────────────────────────
  // trust-boundary 깃발: 로드 시 main이 cwd 재검증. 쓰기는 명령 5종(MULTI_CMD_*)만 —
  // 통짜 blob SAVE 채널은 ADR-031(RMW1-P05)로 제거됨(단일 기록자 원칙 위반 소지 차단).
  // panel.cwd는 main이 isAbsolute+existsSync+isDirectory로 재검증 — 임의 경로 통과 0.
  // 구현(핸들러): main-process multiStore.ts + ipc/index.ts 담당.
  // 소비: renderer MultiWorkspace — 마운트 복원.

  /**
   * 멀티 에이전트 세션 상태 로드.
   * 인자 없음 — main이 고정 경로(userData/multi-agent.json)에서 읽는다.
   * 파일 없음/손상/version 불일치 → state:null (graceful).
   *
   * trust-boundary 깃발: 반환 전 각 panel.cwd를 main이 isAbsolute+existsSync+isDirectory 재검증.
   * 검증 실패 cwd → undefined drop (임의 경로 무확인 통과 0).
   */
  multiSessionLoad: (): Promise<MultiSessionLoadResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.MULTI_SESSION_LOAD),

  // ── Multi Session 의도 명령 5종 (ADR-031, RMW1-P02) ─────────────────────────
  // trust-boundary 깃발: main이 read→merge→write를 단일 원자 블록으로 실행(단일 기록자).
  // 명령별 최소 시그니처만 노출 — 범용 invoke 노출 금지. 모든 응답은 병합 후 권위
  // PersistedMultiState를 포함 — renderer는 이 값으로 Zustand 미러를 동기화한다.
  // 구현(핸들러): main-process multiStore.ts + 00_ipc/handlers/multi.ts (RMW1-P03 구현).
  // 소비: renderer slices/multiSession.ts · hooks/useMultiPersist.ts (RMW1-P04에서 재배선).

  /**
   * 활성 세션 스냅샷 upsert(id 일치 시 교체, 미지 id는 no-op + ok:false — stale upsert
   * 부활 차단). title은 요청에 포함하지 않는다 — main이 기존 title을 보존(rename 전용).
   */
  multiCmdUpsert: (session: MultiCmdUpsertRequest['session']): Promise<MultiCmdUpsertResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.MULTI_CMD_UPSERT, { session }),

  /**
   * 새 멀티세션 생성 + 즉시 활성화. 인자 없음 — id는 main이 생성.
   * 응답 state.activeSessionId로 신규 세션 id 확인.
   */
  multiCmdCreate: (): Promise<MultiCmdCreateResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.MULTI_CMD_CREATE),

  /**
   * 세션 영구 삭제. 활성 세션 삭제 시 main이 활성 재계산(남은 첫 세션 활성화,
   * 없으면 새 세션 자동 생성) 후 병합 결과를 반환.
   */
  multiCmdDelete: (id: MultiCmdDeleteRequest['id']): Promise<MultiCmdDeleteResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.MULTI_CMD_DELETE, { id }),

  /**
   * 세션 제목 변경. title은 untrusted 입력 — main이 trim+cap(200자) 검증 후 반영.
   */
  multiCmdRename: (
    id: MultiCmdRenameRequest['id'],
    title: MultiCmdRenameRequest['title'],
  ): Promise<MultiCmdRenameResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.MULTI_CMD_RENAME, { id, title }),

  /**
   * 활성 세션 전환.
   */
  multiCmdSelect: (id: MultiCmdSelectRequest['id']): Promise<MultiCmdSelectResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.MULTI_CMD_SELECT, { id }),
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
