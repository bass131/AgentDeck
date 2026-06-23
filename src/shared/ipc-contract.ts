/**
 * ipc-contract.ts — IPC 채널명 상수 + 요청/응답 타입 (단일 진실 공급원)
 *
 * CRITICAL (헌법): 채널명 문자열은 이 파일에만 존재.
 * main(ipcMain.handle) · renderer(api.*) 모두 여기서 import.
 *
 * 채널 종류:
 *   invoke형 — renderer가 main에 요청, main이 응답 (ipcRenderer.invoke).
 *   event형  — main이 renderer로 단방향 push (ipcMain.emit → ipcRenderer.on).
 *
 * 구현 위치: src/main/ipc/ (Phase 04, main-process 에이전트 담당).
 * 이 파일은 *정의*만 — 핸들러 로직 없음.
 */

import type { AgentEvent } from './agent-events'

/**
 * 코딩 엔진 백엔드 식별자 (단일 공급원).
 * registry(Phase 03)·IPC 계약·DB 레코드가 공유 → 엔진 추가 시 여기 한 곳만 확장.
 * Track 1은 'claude-code'만 실동작, 'codex'는 Track 2(stub).
 */
export type BackendId = 'claude-code' | 'codex'

// ═══════════════════════════════════════════════════════════════════════════════
// 채널명 상수
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 워크스페이스 루트의 고정 등록 ID.
 *
 * main 레지스트리에서 ID → 실제 경로 매핑을 관리한다.
 * - 워크스페이스 루트는 항상 이 상수 ID를 가진다.
 * - 레퍼런스 폴더는 main이 'ref-1', 'ref-2'… 형식으로 발급한다(발급 로직은 main 담당).
 *
 * CRITICAL(보안): FsReadRequest.root 는 이 ID 또는 reference.add 가 발급한 ID여야 한다.
 * renderer가 임의 경로 문자열을 root로 주입할 수 없다 — main 레지스트리에 미등록 ID면 not-found.
 */
export const WORKSPACE_ROOT_ID = 'workspace' as const

/**
 * IPC 채널명 상수.
 * preload · main 핸들러 · (필요 시) 테스트가 이 객체에서 import.
 * 문자열 리터럴 직접 사용 금지 — 오타 방지 + 리팩터 안전.
 */
export const IPC_CHANNELS = {
  // ── Workspace ──────────────────────────────────────────────────────────────
  /** 워크스페이스 폴더를 열고 파일 트리를 반환 (invoke) */
  WORKSPACE_OPEN: 'workspace.open',
  /** 현재 열린 워크스페이스의 파일 트리를 반환 (invoke) */
  WORKSPACE_TREE: 'workspace.tree',

  // ── Agent ──────────────────────────────────────────────────────────────────
  /** 에이전트 대화 실행 시작 (invoke — 실행 ID 반환, 이벤트는 AGENT_EVENT로) */
  AGENT_RUN: 'agent.run',
  /** 진행 중인 에이전트 실행 중단 (invoke) */
  AGENT_ABORT: 'agent.abort',
  /**
   * main → renderer 스트리밍 이벤트 (event형 — ipcRenderer.on).
   * 구독은 preload의 onAgentEvent helper를 통해서만.
   */
  AGENT_EVENT: 'agent.event',

  // ── FileSystem ─────────────────────────────────────────────────────────────
  /** 파일 경로를 받아 워크 트리 vs 스냅샷 diff를 반환 (invoke) */
  FS_DIFF: 'fs.diff',
  /** 파일 내용 읽기 — 텍스트(하이라이팅) 또는 바이너리(이미지 data URL). 단일 채널(M2) (invoke) */
  FS_READ: 'fs.read',
  /**
   * 현재 워크스페이스의 프로젝트 파일 목록(플랫, 상대 POSIX 경로) 반환 — @멘션 팔레트용 (invoke).
   * CRITICAL(신뢰경계): **경로 인자 없음** — main이 현재 등록된 워크스페이스 루트만 열거한다
   * (renderer가 임의 경로를 주입할 수 없음 — WORKSPACE_TREE와 동일 패턴). (M4-2)
   */
  LIST_FILES: 'fs.listFiles',
  /**
   * 붙여넣기/드롭된 이미지 raw 바이트를 앱 attachments 디렉토리에 저장하고 절대 경로 반환 (invoke).
   * CRITICAL(신뢰경계): renderer는 **경로를 지정하지 않는다** — main이 파일명(paste-{uuid}.{ext})을
   * 생성하고 앱 전용 attachments 디렉토리에만 기록한다(경로 이탈 불가). ext는 이미지 화이트리스트로
   * 검증(미지 ext → png). 디스크 파일은 이 채널 불요(preload webUtils.getPathForFile로 경로 직득). (M4-2)
   */
  SAVE_IMAGE_DATA: 'image.saveData',

  // ── Conversation ───────────────────────────────────────────────────────────
  /** 대화 히스토리 로드 (invoke) */
  CONVERSATION_LOAD: 'conversation.load',
  /** 대화 히스토리 저장 (invoke) */
  CONVERSATION_SAVE: 'conversation.save',
  /** 대화 삭제 (invoke — id로 영구 삭제). 세션 CRUD(M4-3) */
  CONVERSATION_DELETE: 'conversation.delete',
  /**
   * 대화 제목 변경 (invoke). 사용자 지정 제목은 이후 자동 재제목이 덮지 않는다
   * (store가 custom-title로 보존). 세션 CRUD(M4-3)
   */
  CONVERSATION_RENAME: 'conversation.rename',

  // ── Reference Folder (M2-03) ───────────────────────────────────────────────
  /**
   * 레퍼런스 폴더를 워크스페이스 밖 읽기전용 보조 루트로 등록 (invoke).
   * main이 고유 ID('ref-1', 'ref-2'…)를 발급하고 레지스트리에 저장.
   */
  REFERENCE_ADD: 'reference.add',
  /** 등록된 레퍼런스 폴더 목록 반환 (invoke) */
  REFERENCE_LIST: 'reference.list',
  /**
   * 특정 레퍼런스 루트의 파일 트리 반환 (invoke).
   * 요청의 id는 reference.add 가 발급한 등록 루트 ID여야 한다.
   */
  REFERENCE_TREE: 'reference.tree',

  // ── Git (탐색기 Git 카드 — 읽기 + 커밋/푸시/풀) ───────────────────────────
  /** cwd → 레포 최상위(.git 상위 탐색 포함), 없으면 null (invoke) */
  GIT_ROOT: 'git.root',
  /** 브랜치·ahead/behind·작업 트리 변경·브랜치/원격/태그 목록 (invoke) */
  GIT_STATUS: 'git.status',
  /** 커밋 목록 (푸시 여부 포함) (invoke) */
  GIT_LOG: 'git.log',
  /** 한 커밋의 변경 파일 + 증감 (invoke) */
  GIT_COMMIT_DETAIL: 'git.commitDetail',
  /** 커밋 시점 파일 내용 + 부모→커밋 diff (뷰어 마킹용) (invoke) */
  GIT_FILE_AT: 'git.fileAt',
  /** 작업 트리 파일의 HEAD→디스크 diff (뷰어 마킹용) (invoke) */
  GIT_WORKING_FILE: 'git.workingFile',
  /** add -A + commit (invoke) */
  GIT_COMMIT: 'git.commit',
  /** git push (invoke) */
  GIT_PUSH: 'git.push',
  /** git pull --ff-only (invoke) */
  GIT_PULL: 'git.pull',

  // ── LSP (M2-LSP — 27a 계약) ───────────────────────────────────────────────────
  /**
   * LSP 서버 상태 조회 (invoke).
   * 요청: LspDocReq (rootId + relPath). 응답: LspStatus.
   *
   * CRITICAL(신뢰경계): rootId 는 등록 루트 ID(WORKSPACE_ROOT_ID 또는 reference.add 발급).
   * main이 roots.ts 게이트로 rootId→실경로 조회, workspace.ts resolveSafe로 relPath 해석.
   * 미등록 rootId·경로 탈출('..'/절대경로) → 'unsupported' 응답.
   */
  LSP_STATUS: 'lsp.status',
  /**
   * LSP 호버 정보 조회 (invoke).
   * 요청: LspPosReq (rootId + relPath + pos). 응답: LspHoverResult | null.
   *
   * CRITICAL(신뢰경계): relPath 는 rootId 게이트 + resolveSafe 검증(절대경로/탈출 차단).
   * renderer가 cwd/절대경로를 주입할 수 없다 — rootId + 상대경로만 허용.
   */
  LSP_HOVER: 'lsp.hover',
  /**
   * LSP 정의 이동 조회 (invoke).
   * 요청: LspPosReq. 응답: LspLocation[] (워크스페이스 상대경로만 — 밖 결과 제외).
   *
   * CRITICAL(신뢰경계): LspLocation.relPath 는 절대경로 아님 — 워크스페이스 내부만.
   * main이 LSP 서버 반환 절대경로를 역변환하여 워크스페이스 밖이면 결과에서 제외한다.
   */
  LSP_DEFINITION: 'lsp.definition',
  /**
   * LSP 시맨틱 토큰 요청 (invoke, 라이브 분석).
   * 요청: LspDocReq. 응답: LspSemanticTokens | null.
   */
  LSP_SEMANTIC_TOKENS: 'lsp.semanticTokens',
  /**
   * LSP 시맨틱 토큰 캐시 조회 (invoke, 인메모리 캐시 즉시 반환).
   * 요청: LspDocReq. 응답: LspSemanticTokens | null (캐시 없으면 null).
   * renderer가 파일 오픈 직후 캐시를 즉시 색칠하고, ready 후 라이브 갱신하는 패턴.
   */
  LSP_CACHED_TOKENS: 'lsp.cachedTokens',

  // ── Profile (P2 — 로컬 사용자 개인화, profile.json 영속) ─────────────────────
  /**
   * 저장된 로컬 프로필 읽기 (invoke).
   * 인자 없음. 응답 Profile | null (null = 미설정/첫실행).
   *
   * CRITICAL(신뢰경계·개인화 전용): 닉네임·아바타 색만 — 토큰·시크릿·API 키 0.
   * null 응답 = 첫 실행 판정 → renderer가 온보딩 화면 진입.
   * 구현: main-process profile.ts (userData/profile.json 읽기 + IPC 핸들러).
   * 소비: renderer 부트 3단계 게이트(boot→login→MainApp) + Profile 온보딩 실저장.
   */
  PROFILE_GET: 'profile.get',
  /**
   * 로컬 프로필 저장 (invoke).
   * 요청 Profile. 응답 { ok: boolean }.
   *
   * CRITICAL(신뢰경계·개인화 전용): 저장되는 값은 nickname·color만.
   * 이 채널로 토큰·시크릿·API 키를 전달하면 안 된다 — 호출부 책임.
   * 구현: main-process profile.ts (userData/profile.json 쓰기 + IPC 핸들러).
   * 소비: renderer Profile 컴포넌트 onEnter 콜백(입장하기 제출 시).
   */
  PROFILE_SET: 'profile.set',

  // ── UI Prefs (P1 — 원본 lib/prefs.ts 미러, ui-prefs.json 영속) ──────────────
  /**
   * UI 환경설정 전체 읽기 (invoke).
   * 인자 없음. 응답 UiPrefs(키-값 blob).
   *
   * CRITICAL(신뢰경계): 이 채널은 UI 표시 설정(패널 크기·줌·테마·플래그 등)만
   * 영속한다. API 키·OAuth 토큰·시크릿 등 민감 자격증명을 이 blob에 저장하면
   * 안 된다 — 호출부(renderer lib/prefs.ts) 책임이며 main도 값을 검증하지 않으므로
   * 계약 수준에서 명시(UIPrefs blob은 무해 설정 전용).
   */
  UI_PREFS_GET: 'ui.getPrefs',
  /**
   * UI 환경설정 단일 키 쓰기 (invoke).
   * 요청 UiPrefsSetReq. 응답 { ok: boolean }.
   *
   * CRITICAL(신뢰경계): value는 JSON 직렬화 가능 무해 설정값만 허용.
   * 민감 자격증명(토큰·시크릿·키)을 value로 전달하면 안 된다 — 호출부 책임.
   */
  UI_PREFS_SET: 'ui.setPref',

  // ── Usage (OAuth 레이트리밋 게이지 — B8) ─────────────────────────────────────
  /**
   * OAuth 레이트리밋 게이지 조회 (invoke).
   * 인자 없음. 응답 UsageInfo.
   *
   * CRITICAL(신뢰경계): 토큰/시크릿 미포함 — pct(사용률)·resetsAt(리셋 unix seconds)
   * 파생값만 반환. renderer는 원본 레이트리밋 헤더나 API 키를 직접 받지 않는다.
   * 구현은 main-process(getUsage 핸들러)가 담당.
   */
  USAGE_GET: 'usage.get',

  // ── Agent 응답 (renderer → main, 양방향 M4-4) ─────────────────────────────
  /**
   * 권한 요청에 대한 사용자 응답 전송 (invoke).
   * renderer가 PermissionModal 선택 후 호출 → main이 대기 중인 에이전트에 응답을 전달.
   * 응답: { ok: boolean }.
   */
  PERMISSION_RESPOND: 'agent.permissionRespond',
  /**
   * 질문 요청에 대한 사용자 응답 전송 (invoke).
   * renderer가 QuestionModal 응답/dismiss 후 호출 → main이 대기 중인 에이전트에 응답을 전달.
   * 응답: { ok: boolean }.
   */
  QUESTION_RESPOND: 'agent.questionRespond',

  // ── Window Control (F1-b — 투명 frameless 셸) ──────────────────────────────
  // CRITICAL(신뢰경계): 아래 채널은 **창 식별자 인자를 받지 않는다**. main이
  // BrowserWindow.fromWebContents(event.sender)로 *요청을 보낸 창*만 조작한다
  // (renderer가 임의 창 ID/핸들을 주입할 수 없음). drag/resize는 start/end
  // 브래킷만 renderer가 트리거하고, 커서 추종 setBounds는 main이 수행한다.
  /** 현재 창 최소화 (invoke) */
  WINDOW_MINIMIZE: 'window.minimize',
  /** 최대화 토글 — 투명창은 OS 네이티브 maximize 부재 → main custom maximize (invoke, {maximized} 반환) */
  WINDOW_MAXIMIZE_TOGGLE: 'window.maximizeToggle',
  /** 현재 창 닫기 (invoke) */
  WINDOW_CLOSE: 'window.close',
  /** 현재 창의 최대화 상태 조회 (invoke, {maximized} 반환) */
  WINDOW_IS_MAXIMIZED: 'window.isMaximized',
  /** 현재 창 bounds 조회 (invoke, WindowBounds 반환) */
  WINDOW_GET_BOUNDS: 'window.getBounds',
  /** 현재 창 bounds 설정 (invoke) */
  WINDOW_SET_BOUNDS: 'window.setBounds',
  /** 수동 드래그 시작 — main이 grab점 잠금 후 커서 추종 setBounds 개시 (invoke) */
  WINDOW_DRAG_START: 'window.dragStart',
  /** 수동 드래그 종료 — 커서 추종 정지 (invoke) */
  WINDOW_DRAG_END: 'window.dragEnd',
  /** 수동 리사이즈 시작 — 엣지 지정, main이 커서 추종 setBounds 개시 (invoke) */
  WINDOW_RESIZE_START: 'window.resizeStart',
  /** 수동 리사이즈 종료 (invoke) */
  WINDOW_RESIZE_END: 'window.resizeEnd',
  /** main → renderer 최대화 상태 변경 push (event형 — .win.max 토글용) */
  WINDOW_STATE: 'window.state',
} as const

/** 채널명 리터럴 유니온 타입 (핸들러 등록 타입 안전 보조용) */
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

// ═══════════════════════════════════════════════════════════════════════════════
// Workspace 채널 타입
// ═══════════════════════════════════════════════════════════════════════════════

/** 파일/디렉토리 노드 (트리 재귀 구조) */
export interface FileTreeNode {
  /** 파일/디렉토리 이름 */
  name: string
  /** 워크스페이스 루트 기준 상대 경로 */
  path: string
  /** 노드 종류 */
  kind: 'file' | 'directory'
  /** 디렉토리일 때 자식 노드 목록 */
  children?: FileTreeNode[]
}

// workspace.open ──────────────────────────────────────────────────────────────

/** `workspace.open` 요청 */
export interface WorkspaceOpenRequest {
  /**
   * 열 폴더의 절대 경로.
   * undefined면 OS 폴더 선택 다이얼로그를 띄운다.
   */
  folderPath?: string
}

/** `workspace.open` 응답 */
export interface WorkspaceOpenResponse {
  /** 선택된 워크스페이스 절대 경로 (사용자가 취소하면 null) */
  rootPath: string | null
  /** 초기 파일 트리 (rootPath가 null이면 null) */
  tree: FileTreeNode | null
}

// workspace.tree ──────────────────────────────────────────────────────────────

/** `workspace.tree` 요청 (현재 열린 워크스페이스 기준이므로 인자 없음) */
export type WorkspaceTreeRequest = Record<string, never>

/** `workspace.tree` 응답 */
export interface WorkspaceTreeResponse {
  /** 현재 워크스페이스의 파일 트리 (열려 있지 않으면 null) */
  tree: FileTreeNode | null
}

// ═══════════════════════════════════════════════════════════════════════════════
// Agent 채널 타입
// ═══════════════════════════════════════════════════════════════════════════════

/** 대화 메시지 역할 */
export type MessageRole = 'user' | 'assistant'

/** 대화 메시지 단위 */
export interface ConversationMessage {
  role: MessageRole
  /** 텍스트 내용 */
  content: string
}

// agent.run ───────────────────────────────────────────────────────────────────

/** `agent.run` 요청 — 에이전트 대화 실행 시작 */
export interface AgentRunRequest {
  /**
   * 대화 히스토리.
   * 마지막 메시지가 현재 user 입력이어야 한다.
   */
  messages: ConversationMessage[]
  /**
   * 사용할 백엔드 엔진 ID.
   * undefined면 registry가 자동 선택.
   */
  backendId?: BackendId
  /** 워크스페이스 루트 절대 경로 (에이전트 CWD 설정용) */
  workspaceRoot?: string
  /**
   * 모델 picker id (pickerOptions MODELS: 'opus'|'sonnet'|'haiku'|'fable').
   * CRITICAL(신뢰경계): renderer untrusted — main(run-args)이 allowlist 검증 후에만
   * `--model` 인자화. 미전달/미지 id → CLI 기본값(플래그 생략). (M4-1)
   */
  model?: string
  /**
   * effort picker id ('max'|'xhigh'|'high'|'medium'|'low'|'minimal').
   * 모델 의존(haiku 미지원·sonnet xhigh→high 클램프·minimal 생략) — run-args가 처리. untrusted. (M4-1)
   */
  effort?: string
  /**
   * 권한 모드 picker id ('normal'|'plan'|'acceptEdits'|'auto'|'bypass') → `--permission-mode`.
   * untrusted — run-args allowlist 검증. (M4-1)
   */
  mode?: string
}

/**
 * 모델 picker id → 컨텍스트 윈도우(토큰). 토큰 게이지(M4-1)의 분모.
 *
 * 키 = pickerOptions MODELS id (run-args KNOWN_MODELS와 동일 집합 — 드리프트 금지).
 * 권위 확인(claude-code-guide, 2026-06-23): Opus4.8/Sonnet4.6/Fable5=1M · Haiku4.5=200K.
 * picker의 display `ctx`는 별개 표시값 — 게이지는 이 권위 window를 사용.
 */
export const MODEL_CONTEXT_WINDOW: Record<string, number> = {
  opus: 1_000_000,
  sonnet: 1_000_000,
  fable: 1_000_000,
  haiku: 200_000
}

/** 토큰 게이지 fallback — model 미전달/미지 모델 시 사용(게이지 미파손). */
export const DEFAULT_CONTEXT_WINDOW = 1_000_000

/** `agent.run` 응답 — 실행 핸들 ID (abort·이벤트 매칭용) */
export interface AgentRunResponse {
  /** 실행 고유 ID. AGENT_EVENT 이벤트의 runId와 대응. */
  runId: string
}

// agent.abort ─────────────────────────────────────────────────────────────────

/** `agent.abort` 요청 */
export interface AgentAbortRequest {
  /** 중단할 실행 ID */
  runId: string
}

/** `agent.abort` 응답 */
export interface AgentAbortResponse {
  /** 중단 요청 수락 여부 (이미 완료된 runId면 false) */
  accepted: boolean
}

// agent.permissionRespond ─────────────────────────────────────────────────────

/**
 * `agent.permissionRespond` 요청 — 권한 요청에 대한 사용자 선택 전송.
 *
 * runId: 대상 에이전트 실행 ID.
 * requestId: 대응하는 AgentEventPermissionRequest.requestId.
 * behavior: 'allow'=이번만 허용 · 'allow_always'=항상 허용 · 'deny'=거부.
 */
export interface PermissionResponse {
  /** 대상 에이전트 실행 ID */
  runId: string
  /** 대응하는 permission_request 의 requestId */
  requestId: string
  /** 사용자 선택: 이번만 허용 · 항상 허용 · 거부 */
  behavior: 'allow' | 'allow_always' | 'deny'
}

// agent.questionRespond ───────────────────────────────────────────────────────

/**
 * `agent.questionRespond` 요청 — 질문 요청에 대한 사용자 답변 전송.
 *
 * runId: 대상 에이전트 실행 ID.
 * requestId: 대응하는 AgentEventQuestionRequest.requestId.
 * answers: 각 질문에 대한 선택 라벨 배열의 배열(질문 순서 대응).
 *          null=사용자가 건너뜀(dismiss).
 *
 * answers 구조: answers[i] = i번째 질문에 대해 선택된 옵션 라벨 목록.
 * 단일 선택 시 길이 1, 복수 선택(multiSelect) 시 길이 ≥ 0.
 */
export interface QuestionResponse {
  /** 대상 에이전트 실행 ID */
  runId: string
  /** 대응하는 question_request 의 requestId */
  requestId: string
  /**
   * 각 질문에 대한 선택 라벨 배열의 배열 (질문 순서 대응).
   * null = 사용자가 건너뜀(dismiss).
   */
  answers: string[][] | null
}

// agent.event (event형 — main → renderer push) ────────────────────────────────

/**
 * `agent.event` IPC 이벤트 페이로드.
 * main이 ipcRenderer.on('agent.event', handler)를 통해 push.
 * preload의 onAgentEvent helper가 이를 래핑하여 노출.
 */
export interface AgentEventPayload {
  /** 이벤트를 발생시킨 실행 ID */
  runId: string
  /** 에이전트 이벤트 본문 */
  event: AgentEvent
}

// ═══════════════════════════════════════════════════════════════════════════════
// FileSystem 채널 타입
// ═══════════════════════════════════════════════════════════════════════════════

// fs.diff ─────────────────────────────────────────────────────────────────────

/** `fs.diff` 요청 */
export interface FsDiffRequest {
  /** diff를 구할 파일의 절대(또는 워크스페이스 상대) 경로 */
  filePath: string
}

/** diff 변경 라인 단위 */
export interface DiffLine {
  /** 라인 종류 */
  kind: 'add' | 'remove' | 'context'
  /** 라인 내용 (줄바꿈 제외) */
  content: string
  /** 원본(스냅샷) 기준 라인 번호 (context/remove일 때) */
  lineOld?: number
  /** 변경 후(워크 트리) 기준 라인 번호 (context/add일 때) */
  lineNew?: number
}

/** `fs.diff` 응답 */
export interface FsDiffResponse {
  /** 요청한 파일 경로 */
  filePath: string
  /**
   * 통합 diff 라인 목록.
   * 파일이 존재하지 않거나 스냅샷이 없으면 빈 배열.
   */
  lines: DiffLine[]
}

// fs.read (텍스트 + 바이너리 통합 단일 채널 — M2) ──────────────────────────────

/** `fs.read` 요청 */
export interface FsReadRequest {
  /** 읽을 파일의 루트 기준 상대 경로 (untrusted) */
  path: string
  /**
   * **등록 루트 ID** (WORKSPACE_ROOT_ID 또는 reference.add 가 발급한 id).
   * 미지정이면 워크스페이스(WORKSPACE_ROOT_ID) 기준으로 동작.
   * **임의 경로 아님** — main이 레지스트리에서 ID로 실제 경로를 조회하며,
   * 미등록 ID는 not-found 응답으로 은닉(경로 탈출 방지).
   * renderer가 절대 경로 문자열을 이 필드에 주입해도 레지스트리 조회 실패로 차단된다.
   */
  root?: string
  /** true면 바이너리(이미지)로 읽어 data URL 반환 */
  asBinary?: boolean
}

/**
 * `fs.read` 응답 — discriminated union(`kind`).
 * 경로 탈출/미존재는 모두 `not-found`로 은닉(정보 누출 최소화).
 */
export type FsReadResponse =
  | { kind: 'text'; content: string; language: string }
  | { kind: 'binary'; dataUrl: string; mime: string }
  | { kind: 'too-large' }
  | { kind: 'binary-skipped' }
  | { kind: 'not-found' }

// fs.listFiles (@멘션 팔레트 — 프로젝트 파일 플랫 목록, M4-2) ─────────────────────

/**
 * `fs.listFiles` 요청 — 인자 없음.
 *
 * CRITICAL(신뢰경계): renderer는 경로/루트를 지정하지 않는다. main이 현재 열린
 * 워크스페이스 루트(WORKSPACE_ROOT 등록 경로)만 열거 — 임의 경로 주입 불가.
 * (WorkspaceTreeRequest와 동일한 argument-free 패턴.)
 */
export type ListFilesRequest = Record<string, never>

/** `fs.listFiles` 응답 */
export interface ListFilesResponse {
  /**
   * 워크스페이스 루트 기준 상대 POSIX 경로의 플랫 목록 (breadth-first, 상한 적용).
   * 워크스페이스 미오픈 또는 열거 실패 시 빈 배열.
   * 팔레트는 이 목록을 클라이언트에서 browse/search 한다(원본 mentionEntries 미러).
   */
  files: string[]
}

// image.saveData (붙여넣기/드롭 이미지 → temp 파일 경로, M4-2) ─────────────────────

/** `image.saveData` 요청 — 이미지 raw 바이트 + 확장자 힌트 */
export interface SaveImageDataRequest {
  /** 이미지 raw 바이트 (structured clone으로 IPC 전송) */
  bytes: ArrayBuffer
  /**
   * 확장자 힌트('png'·'jpg'…). main이 이미지 화이트리스트로 검증 — 미지/위험 ext는 png로 대체.
   * CRITICAL: 경로 구분자/`..` 등은 main의 sanitize에서 제거(파일명 주입 차단).
   */
  ext: string
}

/** `image.saveData` 응답 */
export interface SaveImageDataResponse {
  /** 저장된 파일의 절대 경로(앱 attachments 디렉토리 내). 실패 시 빈 문자열. */
  path: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// Conversation 채널 타입
// ═══════════════════════════════════════════════════════════════════════════════

/** DB에 저장된 대화 레코드 */
export interface ConversationRecord {
  /** 대화 고유 ID */
  id: string
  /** 대화 제목 (자동 생성 또는 사용자 지정) */
  title: string
  /** 메시지 목록 */
  messages: ConversationMessage[]
  /** 사용된 백엔드 ID */
  backendId: BackendId
  /** 생성 시각 (ISO 8601) */
  createdAt: string
  /** 마지막 수정 시각 (ISO 8601) */
  updatedAt: string
}

// conversation.load ───────────────────────────────────────────────────────────

/** `conversation.load` 요청 */
export interface ConversationLoadRequest {
  /**
   * 불러올 대화 ID.
   * undefined면 최근 대화 목록을 반환 (limit 적용).
   */
  id?: string
  /** id 미지정 시 반환할 최대 개수 (default: 20) */
  limit?: number
}

/** `conversation.load` 응답 */
export interface ConversationLoadResponse {
  /**
   * 불러온 대화 목록.
   * id 지정 시 길이 0 또는 1.
   */
  conversations: ConversationRecord[]
}

// conversation.save ───────────────────────────────────────────────────────────

/** `conversation.save` 요청 */
export interface ConversationSaveRequest {
  /**
   * 저장할 대화.
   * id가 있으면 upsert(update or insert), 없으면 신규 생성.
   */
  conversation: Omit<ConversationRecord, 'createdAt' | 'updatedAt'> & {
    id?: string
  }
}

/** `conversation.save` 응답 */
export interface ConversationSaveResponse {
  /** 저장된 대화의 ID (신규 생성 시 생성된 ID) */
  id: string
}

// conversation.delete (세션 CRUD — M4-3) ──────────────────────────────────────

/** `conversation.delete` 요청 */
export interface ConversationDeleteRequest {
  /** 삭제할 대화 ID (untrusted — main이 타입·존재 검증) */
  id: string
}

/** `conversation.delete` 응답 */
export interface ConversationDeleteResponse {
  /** 삭제 성공 여부 (없는 id면 false) */
  ok: boolean
}

// conversation.rename (세션 CRUD — M4-3) ──────────────────────────────────────

/** `conversation.rename` 요청 */
export interface ConversationRenameRequest {
  /** 이름 변경할 대화 ID (untrusted) */
  id: string
  /** 새 제목 (untrusted — main이 타입 검증·trim). 사용자 지정으로 보존된다. */
  title: string
}

/** `conversation.rename` 응답 */
export interface ConversationRenameResponse {
  /** 변경 성공 여부 (없는 id면 false) */
  ok: boolean
}

// ═══════════════════════════════════════════════════════════════════════════════
// Reference Folder 채널 타입 (M2-03)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 등록된 레퍼런스 폴더 레코드.
 *
 * readOnly 는 리터럴 true — 쓰기 불가를 타입 수준에서 표현한다.
 * 워크스페이스 밖의 보조 루트이므로 fs.read 를 통한 읽기만 허용.
 *
 * id 형식: main이 'ref-1', 'ref-2'… 순서로 발급 (발급 로직은 main-process 담당).
 * rootPath: main이 절대경로 + 존재 + 디렉토리 여부를 검증한 실제 경로.
 *           renderer는 이 값을 표시 목적으로만 사용하고,
 *           파일 접근 시에는 반드시 id를 통해 요청해야 한다.
 */
export interface ReferenceFolder {
  /** main 레지스트리가 발급한 불투명 등록 루트 ID ('ref-1', 'ref-2'…) */
  id: string
  /** 사용자에게 보여줄 폴더 이름 (OS basename) */
  name: string
  /** 실제 절대 경로 (main이 검증 후 저장 — 표시 전용) */
  rootPath: string
  /** 항상 true — 레퍼런스 폴더는 읽기전용 (타입으로 불변식 표현) */
  readOnly: true
}

// reference.add ───────────────────────────────────────────────────────────────

/**
 * `reference.add` 요청 — 레퍼런스 폴더 등록.
 *
 * folderPath 주어지면: main이 절대경로 + 존재 + 디렉토리 여부를 검증 후 등록.
 * folderPath 미지정:   main이 OS 폴더 선택 다이얼로그(또는 e2e 환경변수
 *                      AGENTDECK_E2E_REFERENCE)를 사용해 경로를 획득.
 *
 * 보안 불변식: folderPath 는 참고용 힌트일 뿐, main이 항상 재검증한다.
 * 이후 파일 읽기는 reference.add 가 발급한 id 로만 요청 가능(임의 경로 주입 불가).
 */
export interface ReferenceAddRequest {
  /**
   * 등록할 폴더의 절대 경로.
   * undefined 면 main이 OS 다이얼로그(또는 e2e 환경변수)로 경로를 획득.
   * 지정해도 main에서 절대경로 + 존재 + 디렉토리 검증을 수행한다.
   */
  folderPath?: string
}

/** `reference.add` 응답 */
export interface ReferenceAddResponse {
  /**
   * 등록된 레퍼런스 폴더 레코드.
   * 사용자가 다이얼로그를 취소하거나 검증 실패 시 null.
   */
  reference: ReferenceFolder | null
}

// reference.list ──────────────────────────────────────────────────────────────

/** `reference.list` 요청 (인자 없음) */
export type ReferenceListRequest = Record<string, never>

/** `reference.list` 응답 */
export interface ReferenceListResponse {
  /** 현재 세션에 등록된 레퍼런스 폴더 목록 (등록 순서) */
  references: ReferenceFolder[]
}

// reference.tree ──────────────────────────────────────────────────────────────

/**
 * `reference.tree` 요청 — 특정 레퍼런스 루트의 파일 트리.
 *
 * id 는 reference.add 가 발급한 등록 루트 ID여야 한다.
 * 미등록 ID면 응답의 tree 가 null 로 반환된다(오류 은닉).
 */
export interface ReferenceTreeRequest {
  /** reference.add 가 발급한 등록 루트 ID */
  id: string
}

/** `reference.tree` 응답 */
export interface ReferenceTreeResponse {
  /**
   * 요청한 레퍼런스 루트의 파일 트리.
   * 미등록 ID이거나 트리 구성 실패 시 null.
   */
  tree: FileTreeNode | null
}

// ═══════════════════════════════════════════════════════════════════════════════
// Window Control 채널 타입 (F1-b — 투명 frameless 셸)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 창 bounds (스크린 좌표 px).
 * getBounds 응답 / setBounds 요청 공용.
 */
export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 리사이즈 핸들 방향 (8 엣지/모서리).
 * resizeStart 요청에 포함 — main이 해당 엣지를 커서 추종으로 늘린다.
 */
export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** `window.maximizeToggle` / `window.isMaximized` 응답 */
export interface WindowMaximizedResponse {
  /** 토글/조회 후 최대화 상태 */
  maximized: boolean
}

/** `window.resizeStart` 요청 */
export interface WindowResizeStartRequest {
  /** 늘릴 엣지/모서리 */
  edge: ResizeEdge
}

/**
 * `window.state` IPC 이벤트 페이로드 (main → renderer push).
 * 최대화/복원 시 main이 push → renderer가 `.win.max` 토글.
 */
export interface WindowStatePayload {
  /** 현재 최대화 여부 */
  maximized: boolean
}

// ═══════════════════════════════════════════════════════════════════════════════
// Git 채널 타입 (M3 — 원본 AgentCodeGUI protocol.ts shape 1:1 미러)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Git 파일 상태 코드 (git status porcelain).
 * M=Modified · A=Added · D=Deleted · R=Renamed.
 */
export type GitFileStatus = 'M' | 'A' | 'D' | 'R'

/**
 * 작업 트리 또는 커밋의 단일 파일 변경 항목.
 * path: 레포 루트 기준 posix 경로.
 * add/del: git numstat 증감 라인 수 (바이너리/미상 = null).
 */
export interface GitChange {
  path: string
  status: GitFileStatus
  add: number | null
  del: number | null
}

/**
 * 레포 상태 스냅샷.
 *
 * root: 레포 최상위 절대 경로.
 * NOTE: repoName 필드 없음 — renderer가 root basename에서 파생한다(원본 동일).
 * branches: {name, current} — 현재 브랜치 포함 전체 목록.
 * tags: 최신순, 최대 20개.
 */
export interface GitStatus {
  root: string
  branch: string
  ahead: number
  behind: number
  changes: GitChange[]
  branches: { name: string; current: boolean }[]
  remotes: string[]
  tags: string[]
}

/**
 * 커밋 요약 레코드.
 * date: unix milliseconds.
 * pushed: 업스트림에 반영됐는지 (업스트림 없으면 true).
 */
export interface GitCommit {
  hash: string
  shortHash: string
  subject: string
  body: string
  author: string
  date: number
  tags: string[]
  pushed: boolean
}

/**
 * 커밋 시점 파일 내용 + diff.
 *
 * content: 커밋 시점 파일 내용 (바이너리/너무 큼/삭제 = null).
 * diff: 부모→커밋 whole-file diff (뷰어 변경 마킹용), null이면 diff 없음.
 *
 * diff 타입 선택 근거: 원본 AgentCodeGUI의 FileDiff 대신 우리 프로젝트
 * 기존 fs.diff 채널의 DiffLine[] 을 재사용한다. DiffLine(kind/content/lineOld/lineNew)은
 * 이미 단일 진실 공급원으로 정의되어 있으며, main-process의 구현과
 * renderer의 소비가 동일 타입을 공유한다.
 */
export interface GitFileAt {
  content: string | null
  diff: DiffLine[] | null
  error?: string
}

/** Git 쓰기 작업(commit/push/pull) 결과 */
export interface GitOpResult {
  ok: boolean
  error?: string
}

// git.root ─────────────────────────────────────────────────────────────────────

/** `git.root` 요청 */
export interface GitRootRequest {
  /** git 루트 탐색 시작 경로 (cwd) */
  cwd: string
  /** true면 캐시를 무시하고 재탐색 */
  force?: boolean
}

/**
 * `git.root` 응답 — 레포 최상위 절대 경로, git 레포가 없으면 null.
 */
export type GitRootResponse = string | null

// git.status ──────────────────────────────────────────────────────────────────

/** `git.status` 요청 */
export interface GitStatusRequest {
  /** 레포 최상위 절대 경로 */
  root: string
}

/**
 * `git.status` 응답 — GitStatus 스냅샷, 레포 없으면 null.
 */
export type GitStatusResponse = GitStatus | null

// git.log ─────────────────────────────────────────────────────────────────────

/** `git.log` 요청 */
export interface GitLogRequest {
  /** 레포 최상위 절대 경로 */
  root: string
  /** 반환할 최대 커밋 수 (기본: 50) */
  limit?: number
}

/**
 * `git.log` 응답 — 커밋 목록 (최신순).
 */
export type GitLogResponse = GitCommit[]

// git.commitDetail ────────────────────────────────────────────────────────────

/** `git.commitDetail` 요청 */
export interface GitCommitDetailRequest {
  /** 레포 최상위 절대 경로 */
  root: string
  /** 조회할 커밋 해시 (full 또는 short) */
  hash: string
}

/**
 * `git.commitDetail` 응답 — 해당 커밋의 변경 파일 목록.
 */
export type GitCommitDetailResponse = GitChange[]

// git.fileAt ──────────────────────────────────────────────────────────────────

/** `git.fileAt` 요청 */
export interface GitFileAtRequest {
  /** 레포 최상위 절대 경로 */
  root: string
  /** 조회할 커밋 해시 */
  hash: string
  /** 레포 루트 기준 상대 경로 */
  path: string
}

/**
 * `git.fileAt` 응답 — 커밋 시점 파일 내용 + 부모→커밋 diff.
 */
export type GitFileAtResponse = GitFileAt

// git.workingFile ─────────────────────────────────────────────────────────────

/** `git.workingFile` 요청 */
export interface GitWorkingFileRequest {
  /** 레포 최상위 절대 경로 */
  root: string
  /** 레포 루트 기준 상대 경로 */
  path: string
}

/**
 * `git.workingFile` 응답 — 작업 트리 파일의 HEAD→디스크 diff.
 */
export type GitWorkingFileResponse = GitFileAt

// git.commit ──────────────────────────────────────────────────────────────────

/** `git.commit` 요청 — git add -A + commit */
export interface GitCommitRequest {
  /** 레포 최상위 절대 경로 */
  root: string
  /** 커밋 제목 (첫 줄) */
  subject: string
  /** 커밋 본문 (빈 문자열 허용) */
  body: string
}

/**
 * `git.commit` 응답.
 */
export type GitCommitResponse = GitOpResult

// git.push ────────────────────────────────────────────────────────────────────

/** `git.push` 요청 */
export interface GitPushRequest {
  /** 레포 최상위 절대 경로 */
  root: string
}

/**
 * `git.push` 응답.
 */
export type GitPushResponse = GitOpResult

// git.pull ────────────────────────────────────────────────────────────────────

/** `git.pull` 요청 (--ff-only) */
export interface GitPullRequest {
  /** 레포 최상위 절대 경로 */
  root: string
}

/**
 * `git.pull` 응답.
 */
export type GitPullResponse = GitOpResult

// ═══════════════════════════════════════════════════════════════════════════════
// Usage (OAuth 레이트리밋 게이지 — B8, 원본 protocol.ts L325~333 미러)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 단일 레이트리밋 윈도우(5시간 또는 주간)의 사용률 스냅샷.
 *
 * pct: 0~100 사용률 (100 = 한도 소진).
 * resetsAt: 윈도우 리셋 unix seconds. 정보 미제공 시 null.
 *
 * CRITICAL(신뢰경계): 토큰·API 키·시크릿 미포함.
 * main이 OAuth 레이트리밋 헤더에서 파생한 *비율·시각*만 전달한다.
 * renderer는 이 값을 표시 목적(게이지 UI)으로만 사용해야 한다.
 */
export interface UsageWindow {
  /** 0~100 사용률 (100 = 한도 소진) */
  pct: number
  /** 윈도우 리셋 unix seconds (정보 미제공 시 null) */
  resetsAt: number | null
}

// ═══════════════════════════════════════════════════════════════════════════════
// LSP 채널 타입 (M2-LSP — 27a 계약)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * LSP 서버 상태.
 *
 * - 'unsupported': 파일 확장자에 대응하는 LSP 서버가 없거나 rootId 미등록/탈출 검증 실패.
 * - 'starting':    서버 spawn 후 초기화(initialize/initialized) 진행 중.
 * - 'ready':       서버가 준비 완료 — hover/definition/semanticTokens 응답 가능.
 * - 'error':       spawn 실패 또는 서버 crash. main이 좀비 방지 후 killTree 처리.
 *
 * CRITICAL(신뢰경계): main이 rootId+relPath를 roots.ts/workspace.ts resolveSafe로 검증.
 * 미등록 rootId 또는 relPath 탈출('..'/절대경로) → 'unsupported' 응답(오류 은닉).
 */
export type LspStatus = 'unsupported' | 'starting' | 'ready' | 'error'

/**
 * LSP 문서 내 위치 (0-based line/character — LSP 프로토콜 표준).
 *
 * line:      0-based 라인 번호.
 * character: 0-based 열(UTF-16 code unit 오프셋 — LSP 표준).
 */
export interface LspPos {
  /** 0-based 라인 번호 */
  line: number
  /** 0-based 열(UTF-16 code unit 오프셋) */
  character: number
}

/**
 * LSP 호버 응답 — 마크다운 문자열.
 *
 * contents: 마크다운 형식의 심볼 정보 (타입·문서 주석 등).
 * renderer는 react-markdown으로 렌더링한다.
 *
 * CRITICAL(신뢰경계): LSP 서버가 반환한 raw 내용을 그대로 전달 — XSS 방지는 renderer 담당.
 */
export interface LspHoverResult {
  /** 마크다운 형식의 호버 내용 */
  contents: string
}

/**
 * LSP 정의 위치 — **워크스페이스 상대경로**만 포함.
 *
 * CRITICAL(신뢰경계): 절대경로 미포함. main이 LSP 서버 반환 절대경로를 역변환하여
 * 워크스페이스 내부(rootId 기준 resolveSafe 검증 통과) 파일만 포함한다.
 * 워크스페이스 밖(node_modules .d.ts 등)은 결과에서 제외(graceful no-op).
 *
 * relPath: rootId 기준 상대 POSIX 경로.
 * line/character: 0-based 정의 위치 (LspPos 동일 규약).
 */
export interface LspLocation {
  /** 워크스페이스(rootId) 기준 상대 경로 — 절대경로 아님 */
  relPath: string
  /** 0-based 라인 번호 */
  line: number
  /** 0-based 열 */
  character: number
}

/**
 * LSP 시맨틱 토큰 결과.
 *
 * data:  LSP 표준 시맨틱 토큰 인코딩 — 5개 숫자씩 [deltaLine,deltaStartChar,length,tokenType,tokenMods].
 * types: 토큰 타입 범례 (LSP 서버 capability SemanticTokensLegend.tokenTypes).
 * mods:  토큰 수정자 범례 (SemanticTokensLegend.tokenModifiers).
 *
 * renderer(CodeMirror)는 data를 디코딩해 types/mods로 CSS 클래스를 매핑한다.
 */
export interface LspSemanticTokens {
  /** LSP 인코딩 시맨틱 토큰 (5개 씩, deltaLine·deltaStartChar·length·tokenType·tokenMods) */
  data: number[]
  /** 토큰 타입 범례 (SemanticTokensLegend.tokenTypes 순서) */
  types: string[]
  /** 토큰 수정자 범례 (SemanticTokensLegend.tokenModifiers 순서) */
  mods: string[]
}

// lsp 요청 타입 ──────────────────────────────────────────────────────────────────

/**
 * LSP 문서 요청 기반 타입 (status·semanticTokens·cachedTokens 공용).
 *
 * CRITICAL(신뢰경계): rootId는 WORKSPACE_ROOT_ID('workspace') 또는 reference.add 발급 ID.
 * **cwd·절대경로 필드 없음** — rootId+relPath 조합만 허용.
 * main이 roots.ts 게이트로 rootId→실경로 조회, workspace.ts resolveSafe(rootEntry.path, relPath)로
 * 절대경로 해석. 미등록 rootId 또는 relPath가 루트 밖이면 요청 차단(status:'unsupported'/null 반환).
 * fs.read IPC(ipc/index.ts:371~387)와 동일 게이트 — 우회 경로 없음.
 */
export interface LspDocReq {
  /**
   * 등록 루트 ID (WORKSPACE_ROOT_ID 또는 reference.add 발급 id).
   * renderer가 임의 경로 문자열을 이 필드에 주입해도 레지스트리 조회 실패로 차단된다.
   */
  rootId: string
  /**
   * 루트 기준 상대 경로 (untrusted).
   * main이 resolveSafe로 검증 — '..'·절대경로 탈출은 null 반환으로 차단.
   */
  relPath: string
}

/**
 * LSP 위치 포함 요청 타입 (hover·definition 공용).
 * LspDocReq를 확장하여 문서 내 커서 위치(pos)를 추가한다.
 */
export type LspPosReq = LspDocReq & {
  /** 요청할 커서 위치 (0-based line/character) */
  pos: LspPos
}

/**
 * `usage.get` 응답 — 5시간·주간 레이트리밋 게이지 정보.
 *
 * fiveHour: 5시간 슬라이딩 윈도우 사용률. 정보 없으면 null.
 * weekly:   주간(7일) 윈도우 사용률. 정보 없으면 null.
 *
 * CRITICAL(신뢰경계): 모든 필드는 파생값(pct·resetsAt)만 — 토큰/시크릿 0.
 * 구현(getUsage 핸들러): main-process 담당.
 * 소비: renderer ContextStrip 3칩(5h 게이지·주간 게이지·리셋 타이머) 담당.
 */
export interface UsageInfo {
  /** 5시간 슬라이딩 윈도우 (정보 없으면 null) */
  fiveHour: UsageWindow | null
  /** 주간(7일) 윈도우 (정보 없으면 null) */
  weekly: UsageWindow | null
}

// ═══════════════════════════════════════════════════════════════════════════════
// Profile 채널 타입 (P2 — 로컬 사용자 개인화, 원본 AgentCodeGUI UserProfile 미러)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 로컬 사용자 프로필 — 닉네임 + 아바타 색 개인화 데이터.
 *
 * 원본 AgentCodeGUI `UserProfile` (protocol.ts L360~363)과 동형:
 *   `{ nickname: string; color: string }` (color = hex, AVATAR_PALETTE 선택값).
 * 우리 `Profile.tsx` 셸의 `UserProfile` interface와도 동형 — 타입명만 IPC 계약으로 상향.
 *
 * 용도: 닉네임 표시('무엇을 도와드릴까요, {닉}님?') · 아바타 색 · 첫실행 판정.
 *
 * CRITICAL(신뢰경계·개인화 전용):
 *   - nickname·color 필드만. 토큰·시크릿·API 키 0.
 *   - `color`는 AVATAR_PALETTE 색상 hex — 임의 CSS/XSS 값 주입은 renderer 책임으로 검증.
 *   - 영속 경로: main-process `userData/profile.json` (OS 사용자 디렉토리, git-ignored).
 *   - 실 인증 아님 — 로컬 개인화 전용(비밀번호·OAuth 토큰 없음).
 *
 * 다음 단계 소비처:
 *   - main-process: `src/main/profile.ts` (profile.json 읽기/쓰기 + IPC 핸들러) → main-process 담당.
 *   - renderer: 부트 3단계 게이트(boot→login→MainApp) + Profile 온보딩 실저장 → renderer 담당.
 */
export interface Profile {
  /** 표시 닉네임 — 최대 20자, 앞뒤 공백 trim 후 저장. */
  nickname: string
  /**
   * 아바타 색 hex (예: '#6366f1').
   * AVATAR_PALETTE(renderer/src/lib/avatarColor.ts) 12색 중 하나.
   * Conversation 빈화면 인사말 아바타 + Profile 미리보기에 사용.
   */
  color: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI Prefs 채널 타입 (P1 — 원본 AgentCodeGUI lib/prefs.ts 미러)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * UI 환경설정 키-값 blob.
 *
 * 용도: 패널 크기·줌·테마·workspace.mode·첫실행 seen 플래그 등 무해 표시 설정을
 * `userData/ui-prefs.json`에 영속한다. 원본 AgentCodeGUI lib/prefs.ts 1:1 미러.
 *
 * CRITICAL(신뢰경계·무해 설정 전용):
 *   - API 키·OAuth 토큰·시크릿 등 민감 자격증명을 이 blob에 저장하면 **안 된다**.
 *   - 값은 JSON 직렬화 가능한 무해 표시 설정(number·string·boolean·null·배열·객체)만 허용.
 *   - 호출부(renderer `lib/prefs.ts`)의 책임이며 main은 값 내용을 검증하지 않는다.
 *   - 민감 자격증명 영속은 OS 자격증명 스토어(ADR-008) 경유 별도 채널 사용.
 *
 * 구현:
 *   - main P1-main Worker: `src/main/prefs.ts` (`userData/ui-prefs.json` 읽기/쓰기 + IPC 핸들러).
 *   - renderer: `src/renderer/src/lib/prefs.ts` (boot loadPrefs + getPref/setPref 인메모리 캐시).
 */
export type UiPrefs = Record<string, unknown>

/**
 * `ui.setPref` 요청 — 단일 키-값 쓰기.
 *
 * key:   설정 키(예: 'theme', 'zoomFactor', 'panelSize', 'seenWhatsNew').
 * value: JSON 직렬화 가능 무해 설정값.
 *
 * CRITICAL(신뢰경계): value에 민감 자격증명(토큰·시크릿·키)을 전달하지 말 것.
 * 이 채널은 UI 표시 설정 전용 — 호출부 책임으로 명시.
 */
export interface UiPrefsSetReq {
  /** 저장할 설정 키 */
  key: string
  /**
   * 저장할 설정값 (JSON 직렬화 가능 무해 설정만).
   * 민감 자격증명(API 키·토큰·시크릿) 저장 금지 — 호출부 책임.
   */
  value: unknown
}
