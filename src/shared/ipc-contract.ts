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

import type { AgentEvent, TokenUsage } from './agent-events'
import type { DiffLine } from './diff-types'

// DiffLine 하위 호환 re-export — 기존 소비처(main/renderer)가 ipc-contract에서
// import하는 경로를 변경하지 않아도 된다.
export type { DiffLine }

/**
 * 코딩 엔진 백엔드 식별자 (단일 공급원).
 * registry(Phase 03)·IPC 계약·DB 레코드가 공유 → 엔진 추가 시 여기 한 곳만 확장.
 * Track 1은 'claude-code'만 실동작, 'codex'는 Track 2(stub).
 */
export type BackendId = 'claude-code' | 'codex'

/**
 * 백엔드 표시 이름(단일 공급원) — 프로바이더 상태 패널 등 UI 라벨.
 * id→라벨 매핑은 분기 로직이 아닌 표시 메타데이터라 shared 단일 정의.
 * 엔진 추가 시 BackendId 와 함께 여기 한 곳만 확장.
 */
export const BACKEND_LABELS: Record<BackendId, string> = {
  'claude-code': 'Claude Code',
  'codex': 'Codex'
}

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
  /** 진행 중인 에이전트 실행 중단 — 세션 종료 (invoke) */
  AGENT_ABORT: 'agent.abort',
  /** 현재 turn만 중단 — 세션 유지 (REPL 지속세션 정지, invoke) */
  AGENT_INTERRUPT: 'agent.interrupt',
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
   * 탐색기 lazy 폴더 열기 — 1폴더 1레벨만 반환 (invoke).
   * 요청: FsListDirRequest{rootId?, relDir}. 응답: FsListDirResponse{entries}.
   *
   * CRITICAL(신뢰경계):
   *   - rootId 는 **레지스트리 ID만** (WORKSPACE_ROOT_ID 또는 reference.add 발급 ID).
   *     임의 절대경로 문자열 금지 — main 이 _roots.get(rootId) 조회, 미등록 → [].
   *   - rootId 미지정 → _currentWorkspaceRoot 폴백.
   *   - relDir 은 renderer 에서 온 untrusted 상대경로 — main 이 resolveSafe 로
   *     containment 검증(탈출 시 [] 반환). 절대경로/'..' 탈출 차단.
   *   - 응답 entries 는 shallow(name/path/kind — children 없음).
   *
   * 원본 mirroring: AgentCodeGUI/src/main/files.ts listDir(L64-81).
   * 용도: FileExplorer 폴더 expand 시 1레벨씩 lazy 로드 (Phase 35 M7).
   */
  FS_LIST_DIR: 'fs.listDir',
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

  // ── Slash Commands (P10 — Composer 슬래시 자동완성 팔레트) ───────────────────
  /**
   * 슬래시 커맨드 목록 조회 (invoke).
   * 인자 없음. 응답 SlashCommandInfo[].
   *
   * 유래: SDK supportedCommands/init.slash_commands(빌트인) +
   *       커스텀 .claude/commands/*.md 스캔(사용자·프로젝트).
   * 용도: Composer에서 '/' 입력 시 슬래시 자동완성 팔레트가 이 채널로 목록을 조회한다.
   *
   * CRITICAL(신뢰경계): 응답 SlashCommandInfo 는 name/description/argHint/scope 만 포함.
   *   - .md 본문(커맨드 실행 프롬프트)·파일 경로·환경변수·시크릿은 절대 미포함.
   *   - name 은 슬래시 제외 식별자(예: 'compact', 'deploy') — 경로 탈출 불가.
   *   - main이 검증 후 표시 정보만 추출하여 반환한다.
   *
   * 구현: main-process `settings/commands.ts` (SDK 빌트인 목록 + .claude/commands 디렉토리 스캔).
   * 소비: renderer Composer 슬래시 팔레트 — '/' 입력 후 이 채널 invoke, 결과로 팔레트 필터링.
   */
  COMMAND_LIST: 'command.list',

  // ── Settings: MCP (P5b — Settings MCP 탭 실데이터·토글) ─────────────────────
  /**
   * MCP 서버 목록 조회 (invoke).
   * 인자 없음. 응답 McpServerInfo[].
   *
   * 유래: 원본 AgentCodeGUI protocol.ts L379 McpServerInfo 미러.
   * 용도: Settings MCP 탭에서 실데이터를 렌더링하고 활성/비활성 상태를 반영한다.
   *
   * CRITICAL(신뢰경계): 응답 McpServerInfo 는 name/scope/origin/transport/detail/enabled 만 포함.
   *   - detail 은 main(settings/mcp.ts)이 화이트리스트 마스킹한 안전 문자열만 전달 —
   *     stdio 서버: command basename 만(예: 'npx', 'node') · args/env 절대 미포함.
   *     http/sse 서버: host 만(예: 'api.example.com') · URL 토큰·Authorization 헤더 미포함.
   *   - env/args/url/command/headers 같은 시크릿 운반 필드는 이 타입에 절대 추가 금지.
   * 구현: main-process `settings/mcp.ts`.
   * 소비: renderer SettingsModal McpView.
   */
  MCP_LIST: 'mcp.list',
  /**
   * MCP 서버 활성화/비활성화 토글 (invoke).
   * 요청 McpSetEnabledReq. 응답 { ok: boolean }.
   *
   * 유래: 원본 AgentCodeGUI protocol.ts L379 McpServerInfo 미러(toggle 조작 파생).
   * 용도: Settings MCP 탭 토글 스위치가 조작될 때 renderer가 이 채널로 main에 전달한다.
   *
   * CRITICAL(신뢰경계): 요청에는 name(서버 식별자)과 enabled(boolean)만 포함.
   *   - env/args/url/command/headers 같은 시크릿 운반 필드 0 — boolean-only 토글.
   *   - name 은 서버 식별자(mcpServers map 키)만 — 경로 문자 포함 금지(main이 검증).
   * 구현: main-process `settings/mcp.ts`.
   * 소비: renderer SettingsModal McpView 토글 핸들러.
   */
  MCP_SET_ENABLED: 'mcp.setEnabled',

  // ── Settings: Skill (P5a — Settings Skill 탭 실데이터·토글) ─────────────────
  /**
   * 스킬 목록 조회 (invoke).
   * 인자 없음. 응답 SkillInfo[].
   *
   * 유래: 원본 AgentCodeGUI protocol.ts L392 SkillInfo 미러.
   * 용도: Settings Skill 탭에서 실데이터를 렌더링하고 토글 상태를 반영한다.
   *
   * CRITICAL(신뢰경계): 응답 SkillInfo 는 name/description/scope/enabled만 포함.
   * path·시크릿·API 키 필드 없음 — 스킬 식별자(name)와 표시 정보(description/scope)
   * + 활성화 불리언(enabled)만 전달한다.
   * 구현: main-process `settings/skills.ts`.
   * 소비: renderer SettingsModal SkillView.
   */
  SKILL_LIST: 'skill.list',
  /**
   * 스킬 활성화/비활성화 토글 (invoke).
   * 요청 SkillSetEnabledReq. 응답 { ok: boolean }.
   *
   * 유래: 원본 AgentCodeGUI protocol.ts L392 SkillInfo 미러.
   * 용도: Settings Skill 탭의 토글 스위치가 사용자 조작 후 이 채널을 통해 main에 전달한다.
   *
   * CRITICAL(신뢰경계): 요청에는 name(스킬 식별자)과 enabled(boolean)만 포함.
   * path·시크릿·인증 정보 없음. boolean-only 토글 — 문자열 값 전달 불가.
   * 구현: main-process `settings/skills.ts`.
   * 소비: renderer SettingsModal SkillView 토글 핸들러.
   */
  SKILL_SET_ENABLED: 'skill.setEnabled',

  // ── App (P4 — 앱 메타 정보) ──────────────────────────────────────────────────
  /**
   * Electron 앱 버전 조회 (invoke).
   * 인자 없음. 응답 string (예: "0.1.0").
   *
   * 원본 AgentCodeGUI `window.api.app.getVersion()` 미러.
   * 유래: electron `app.getVersion()` — package.json version 반환.
   *
   * 용도: WhatsNew/UpdateNotes 자동 트리거가 seen-key(ui-prefs)와 비교해
   * 첫실행/업데이트 판정 시 현재 앱 버전을 기준값으로 사용한다.
   *
   * CRITICAL(신뢰경계): 시크릿 0 — 앱 버전 문자열만(package.json의 공개 값).
   * 구현: main-process 담당 (ipcMain.handle(APP_VERSION, () => app.getVersion())).
   * 소비: renderer WhatsNew/UpdateNotes — getAppVersion() + getPref(seen-key) 비교.
   */
  APP_VERSION: 'app.getVersion',

  // ── Engine Install / Version Management (폴리싱 #2b+c — ADR-018) ─────────────
  /**
   * 엔진 버전 설치 (invoke).
   * 요청 EngineInstallRequest{version} → 응답 EngineInstallResult{ok, error?}.
   *
   * CRITICAL(신뢰경계, ADR-008):
   *   - version 은 **untrusted** — main 이 strict semver(^\\d+\\.\\d+\\.\\d+) 검증.
   *     검증 실패 시 ok:false, error:'invalid version' 반환.
   *   - 응답 EngineInstallResult 는 ok·error 2개 필드만 — 토큰·API 키·시크릿 0.
   *   - npm 설치 실행은 main 프로세스 단독 — renderer는 이 채널 invoke 만 가능.
   *
   * 구현: main-process engine-versions.ts (핸들러 담당).
   * 소비: renderer EngineGate 설치 버튼.
   */
  ENGINE_INSTALL: 'engine.install',

  /**
   * 엔진 설치 진행 이벤트 — main → renderer push (event형, ipcRenderer.on).
   * 페이로드 EngineInstallProgress.
   *
   * CRITICAL(신뢰경계, ADR-008):
   *   - progress.line 은 **main 이 시크릿 마스킹한 npm stdout/stderr 한 줄만**.
   *     토큰·API 키·환경변수 값·자격증명이 출력에 포함되면 main 이 제거 후 전달한다.
   *   - done=true 라인에는 line 이 없을 수 있다 — ok·error 로 종료 판정.
   *   - renderer 는 이 채널을 onEngineInstallProgress helper 를 통해서만 구독한다.
   *
   * 구현: main-process engine-versions.ts (spawn 후 stdout/stderr pipe → 마스킹 → push).
   * 소비: renderer EngineGate 설치 진행 UI (onEngineInstallProgress 구독).
   */
  ENGINE_INSTALL_PROGRESS: 'engine.installProgress',

  /**
   * 활성 엔진 버전 전환 (invoke).
   * 요청 EngineSetActiveRequest{version} → 응답 {ok: boolean}.
   *
   * CRITICAL(신뢰경계):
   *   - version 은 untrusted — main 이 installed 목록에 포함된 버전인지 검증.
   *     미설치 버전 지정 시 ok:false 반환.
   *   - 응답 {ok} boolean 만 — 토큰·시크릿 0.
   *
   * 구현: main-process engine-versions.ts.
   * 소비: renderer EngineGate 버전 선택 UI.
   */
  ENGINE_SET_ACTIVE: 'engine.setActive',

  /**
   * 설치/활성 버전 상태 조회 (invoke).
   * 인자 없음 → 응답 EngineVersionState.
   *
   * CRITICAL(신뢰경계):
   *   - 응답 EngineVersionState 는 버전 문자열·목록·패키지명만 — 토큰·API 키·시크릿 0.
   *   - **기존 EngineState(authed 불리언 전용)와 별개 개념** — 혼동 금지.
   *     EngineState: SDK 가용/인증 여부(available·authed·version).
   *     EngineVersionState: 멀티버전 설치 관리(package·bundled·active·installed).
   *
   * 구현: main-process engine-versions.ts.
   * 소비: renderer EngineGate 버전 목록 표시.
   */
  ENGINE_VERSION_STATE: 'engine.versionState',

  // ── Engine State (P3 — SDK 가용 + 인증 상태 탐지) ───────────────────────────
  /**
   * 코딩 엔진 상태 조회 (invoke).
   * 인자 없음. 응답 EngineState.
   *
   * CRITICAL(신뢰경계): `authed` 는 **불리언만** — OAuth 토큰·API 키·시크릿
   * 값은 절대 포함하지 않는다. renderer는 authed 여부로 EngineGate UI를
   * 분기할 뿐 자격증명 자체에 접근하지 않는다.
   *
   * 구현: main-process engine-state.ts (ClaudeCodeBackend.isAvailable() +
   * ~/.claude/.credentials.json accessToken 존재 OR env ANTHROPIC_API_KEY).
   * 소비: renderer AppGate(profile 완료 후 engine.state 체크 → 미authed 시
   * EngineGate 안내 표시).
   */
  ENGINE_STATE: 'engine.state',

  /**
   * 엔진 버전 업데이트 체크 (invoke).
   * 인자 없음. 응답 EngineUpdateInfo.
   *
   * 현재 번들 SDK 버전과 npm registry 최신 stable 버전을 비교하여 결과를 반환한다.
   * 유래: 원본 AgentCodeGUI EngineGate.tsx `engine.listAvailable().latest` + `cmpVer` 미러.
   * 단, 이 채널은 (a) 단계 — **체크 + 알림만** (멀티버전 설치는 이 채널 범위 외).
   *
   * CRITICAL(신뢰경계, ADR-008):
   *   - 응답 EngineUpdateInfo 는 **버전 문자열·boolean 3개 필드만** — OAuth 토큰·API 키·시크릿 0.
   *   - npm registry fetch 는 **main 프로세스(어댑터) 단독** 수행.
   *     renderer 는 이 IPC 채널만 호출 가능 — renderer 측 임의 fetch 금지.
   *   - 실패(오프라인·탐지 불가) 시 current/latest 를 null 로 반환 — 에러 throw 아님.
   *
   * 구현: main-process engine-state.ts 담당 (핸들러 등록).
   * 소비: renderer 엔진 업데이트 알림 배너/아이콘 (UI Worker 담당).
   */
  ENGINE_CHECK_UPDATE: 'engine.checkUpdate',

  /**
   * 등록된 코딩 엔진(백엔드) 상태 목록 조회 (invoke). 인자 없음. 응답 BackendStatus[].
   *
   * 듀얼 프로바이더 상태 패널(B1)용 — registry.listBackends() 순회로 각 백엔드의
   * 가용/버전/최신버전/인증을 한 번에 조회한다. 기존 ENGINE_STATE(claude 단일·authed 전용)와
   * 별개: 여러 백엔드(claude-code·codex …)의 요약을 배열로 반환.
   *
   * CRITICAL(신뢰경계, ADR-008): 응답 BackendStatus 는 **문자열/boolean 필드만** —
   *   OAuth 토큰·API 키·시크릿·자격증명 0. authed 는 불리언만. version/latestVersion 은
   *   문자열만(없으면 null). 탐지/버전조회/인증판정은 **main 프로세스 단독**(어댑터·engine-state).
   * 구현: main-process `src/main/backend-status.ts`(순수) + ipc/index.ts 핸들러 등록.
   * 소비: renderer ProviderStatusPanel(SettingsModal "프로바이더" 섹션).
   */
  BACKEND_LIST: 'backend.list',

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

  // ── Multi Session (M3 — 멀티 세션 영속, maStore.ts 미러) ─────────────────────
  /**
   * 멀티 에이전트 세션 상태 저장 (invoke).
   * 요청 PersistedMultiState. 응답 { ok: boolean }.
   *
   * CRITICAL(신뢰경계): state는 untrusted(renderer 입력) — main이 blob을 best-effort 저장.
   * 저장 시 검증 최소 — 읽기(LOAD) 시 cwd 재검증으로 보호(B2).
   * 구현: main-process multiStore.ts (userData/multi-agent.json 쓰기 + IPC 핸들러).
   * 소비: renderer MultiWorkspace 디바운스 저장.
   */
  MULTI_SESSION_SAVE: 'multi.save',
  /**
   * 멀티 에이전트 세션 상태 로드 (invoke).
   * 인자 없음. 응답 PersistedMultiState | null.
   *
   * CRITICAL(신뢰경계): 반환 전 각 panel.cwd를 isAbsolute+existsSync+isDirectory로
   * 재검증 — 실패 시 undefined drop(임의 경로 무확인 통과 0). 손상/version 불일치 → null.
   * 구현: main-process multiStore.ts (userData/multi-agent.json 읽기 + cwd 재검증).
   * 소비: renderer MultiWorkspace 마운트 복원.
   */
  MULTI_SESSION_LOAD: 'multi.load',

  // ── Dialog (P15 — 멀티 패널별 cwd 폴더 선택) ──────────────────────────────
  /**
   * OS 폴더 선택 다이얼로그를 띄우고 선택한 폴더의 절대경로를 반환 (invoke).
   *
   * 유래: 멀티 에이전트 모드에서 각 패널이 독립 작업 폴더(cwd)를 갖도록,
   *   전역 워크스페이스를 바꾸지 않고 폴더만 선택해 경로를 돌려받는 경량 picker.
   *   기존 workspace.open 은 전역 _currentWorkspaceRoot 를 변경하므로 멀티 패널에 부적합.
   * 용도: MultiWorkspace 패널 폴더 선택 — 패널별 cwd 설정.
   *
   * CRITICAL(신뢰경계):
   *   - 요청 인자 없음 — renderer 가 경로를 주입할 수 없다. main 이 OS 폴더 다이얼로그로 선택.
   *   - 응답 PickFolderResponse.path 는 main 이 절대경로 검증 후 반환 · 취소/실패 시 null.
   *   - 경로 외 정보(트리·시크릿·파일 목록) 0 — path 필드만.
   *   - 전역 워크스페이스(_currentWorkspaceRoot) 미변경 — workspace.open 과 명백히 구분.
   *
   * 구현 위치: main-process `ipc/index.ts` (ipcMain.handle 핸들러).
   * 소비처: renderer MultiWorkspace 패널 폴더 선택 버튼.
   */
  DIALOG_PICK_FOLDER: 'dialog.pickFolder',

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
  /**
   * 패널/채팅별 커스텀 시스템 프롬프트 (Phase 30 M2 — 원본 AgentCodeGUI sysPrompt 미러).
   *
   * CRITICAL(신뢰경계): renderer untrusted 입력.
   *   - IPC 계약에서는 **string만 운반** — SDK 고유 형상(preset/append)은 backend 내부에만.
   *   - main 핸들러가 trim → 빈 체크 → 길이 cap(16000자) 정규화 수행.
   *   - 로그·DB·응답에 내용을 평문으로 출력하지 않는다.
   *   - 모델 컨텍스트(SDK systemPrompt.append)로만 주입 — CLI 인자/파일경로/셸 누수 금지.
   *
   * 미전달 또는 빈문자열/공백만 → backend가 기존 preset({type:'preset',preset:'claude_code'}) 그대로.
   * 유효 string → backend가 append 필드로 추가: {type:'preset',preset:'claude_code',append:value}.
   */
  systemPrompt?: string
  /**
   * 멀티에이전트 오케스트레이션 모드 토글 (Phase 37 #4a).
   * 사용자가 채팅 입력창 토글을 켜면 그 run에서만 오케스트레이션 도구 사용을 허용한다.
   *
   * 엔진별 매핑(어떤 SDK 옵션·플래그로 변환되는지)은 backend 내부에서만 결정한다.
   *
   * CRITICAL(신뢰경계): renderer untrusted boolean 입력.
   *   main 핸들러가 `=== true` 로 정규화 후 backend에 전달한다.
   */
  orchestration?: boolean
  /**
   * 턴 간 맥락 복구용 세션 ID (Phase 1, REPL_TRANSITION).
   *
   * 같은 대화의 직전 턴이 emit한 `session` 이벤트(AgentEvent type:'session')의 sessionId를
   * renderer가 대화/패널별로 저장했다가 다음 agentRun에 되돌려 보낸다. backend가 이 값으로
   * 엔진 세션을 resume해 직전 대화 맥락을 복원한다.
   *
   * CRITICAL(신뢰경계·ADR-003): renderer untrusted 불투명 토큰(string)만 운반. `resume`
   *   옵션으로의 매핑은 backend(ClaudeCodeBackend) 내부에만. 미전달/빈 → resume 없이 새 세션.
   */
  resumeSessionId?: string
  /**
   * 지속세션(REPL, ADR-024) 옵트인 — 대화별 held-open 세션 모드. (Phase 2)
   *
   * true → backend가 held-open 세션을 열고 메시지를 입력 스트림에 push(매 턴 새 query 아님).
   *   내장 `/loop`·크론 자기제어 가능. false/미전달 → 기존 단발 query()-per-message(회귀 0).
   *
   * CRITICAL(신뢰경계): renderer untrusted boolean. main 핸들러가 `=== true` 정규화.
   *   엔진별 매핑(streamInput 등)은 backend 내부에만(ADR-003).
   */
  persistent?: boolean
  /**
   * 지속세션 식별 키(persistent와 함께, 보통 conversationId). (Phase 2)
   *
   * 같은 sessionKey의 후속 agentRun은 기존 held-open 세션에 push된다(새 세션 아님).
   * CRITICAL(신뢰경계): renderer untrusted string. 미전달 시 persistent여도 단발 degrade(회귀 0).
   */
  sessionKey?: string
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

// agent.interrupt ─────────────────────────────────────────────────────────────

/** `agent.interrupt` 요청 — 현재 turn만 중단(세션 유지, REPL ADR-024) */
export interface AgentInterruptRequest {
  /** turn을 중단할 실행 ID */
  runId: string
}

/** `agent.interrupt` 응답 */
export interface AgentInterruptResponse {
  /** 중단 요청 수락 여부 (미존재/완료 runId면 false) */
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

// fs.listDir (탐색기 lazy 폴더 열기 — Phase 35 M7) ───────────────────────────────

/**
 * `fs.listDir` 요청 — 1폴더 1레벨 lazy 열기.
 *
 * rootId: 레지스트리 등록 ID (WORKSPACE_ROOT_ID 또는 reference.add 발급 ID).
 *         미지정 → _currentWorkspaceRoot 폴백.
 *         임의 절대경로 문자열 금지 — main 이 레지스트리 조회, 미등록 → [].
 * relDir: 루트 기준 상대경로 (untrusted) — main 이 resolveSafe 로 containment 검증.
 *         '' = 루트 1레벨. 절대경로/'..' 탈출 → [] 반환.
 */
export interface FsListDirRequest {
  /** 등록 루트 ID (미지정 = 워크스페이스 폴백). 임의 절대경로 금지. */
  rootId?: string
  /** 루트 기준 상대 경로 (untrusted, resolveSafe 검증됨). '' = 루트. */
  relDir: string
}

/**
 * `fs.listDir` 응답 — shallow 1레벨 entries.
 *
 * entries: name/path/kind 만 포함. children 없음(lazy 설계).
 * path: 루트 기준 POSIX 상대경로 (relDir ? relDir+'/'+name : name).
 * 미등록 rootId / 경로 탈출 / 읽기 실패 → entries:[].
 */
export interface FsListDirResponse {
  /** 1레벨 shallow entries (name/path/kind). children 없음. */
  entries: FileTreeNode[]
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
  /**
   * 이 대화가 앵커된 작업 폴더(워크스페이스 절대경로). (ADR-020)
   * 대화 전환 시 이 폴더로 워크스페이스 복원(main이 재검증·실패 시 전역 유지 graceful).
   * 미설정(기존 대화/마이그레이션 전)이면 undefined → 전역 workspaceRoot 폴백.
   *
   * CRITICAL(신뢰경계): 경로 문자열(시크릿 아님). 자동복원은 workspace.open 핸들러
   *   재사용으로 isAbsolute+existsSync+isDirectory 재검증(임의 경로 무확인 open 금지).
   *   main이 검증 실패 시 전역 workspaceRoot를 유지하며 graceful하게 처리한다.
   *   renderer는 이 값을 표시 목적(현재 대화 작업폴더 안내)으로만 사용해야 한다.
   */
  cwd?: string
  /**
   * 엔진 세션 ID — 턴 간 맥락 복구용 (Phase 1.5, REPL_TRANSITION).
   * 대화의 마지막 session 이벤트(system/init의 session_id). 대화 로드 시 state.sessionId로
   * 복원 → 다음 메시지가 resumeSessionId로 되돌려 보내 **앱 재시작 후에도 맥락 resume**.
   *
   * CRITICAL(신뢰경계·ADR-003): 불투명 세션 토큰(string)만. 시크릿 아님(식별자) — 평문 영속 가능.
   *   `resume` 옵션 매핑은 backend 내부. 미설정(기존 대화) → undefined → 새 세션(회귀 0).
   */
  sessionId?: string
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

// ═══════════════════════════════════════════════════════════════════════════════
// Engine State 채널 타입 (P3 — SDK 가용 + OAuth/API키 인증 상태)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 코딩 엔진 상태 스냅샷 — `engine.state` 채널 응답 타입.
 *
 * 우리 엔진 모델(ADR-016): `@anthropic-ai/claude-agent-sdk` 하드 의존.
 * 원본 AgentCodeGUI의 `claude` CLI 설치 탐지와 의미가 다름 — 우리 적응판:
 *   - `available`: SDK 모듈 자체의 import·초기화 가능 여부(ClaudeCodeBackend.isAvailable()).
 *   - `authed`: OAuth 자격증명 존재(~/.claude/.credentials.json accessToken) 또는
 *               환경변수 ANTHROPIC_API_KEY 설정 여부. **불리언만 — 토큰/키 값 절대 미노출**.
 *   - `version`: SDK 패키지 버전 문자열(package.json version). SDK를 쓸 수 없으면 null.
 *
 * CRITICAL(신뢰경계 — 절대 규칙):
 *   - 이 타입에 토큰·API 키·시크릿 필드를 추가하면 **안 된다**.
 *   - `authed` 는 불리언으로만 인증 존재 여부를 전달 — 자격증명 값 전달 불가.
 *   - renderer는 authed 여부로 EngineGate UI를 분기할 뿐, 키/토큰 자체를 받지 않는다.
 *   - 필드: available·authed·version **3개만** — 이 계약 밖 필드 추가는 reviewer 필수.
 *
 * 구현 위치(main-process 담당 — 이 파일은 타입 정의만):
 *   - `src/main/engine-state.ts`: ClaudeCodeBackend.isAvailable() + 인증탐지 + 버전조회.
 *   - 인증탐지: ~/.claude/.credentials.json accessToken 존재 OR env ANTHROPIC_API_KEY 비어있지 않음.
 *
 * 소비처:
 *   - renderer AppGate: profile 완료(P2) 후 engine.state 조회 → authed=false 시 EngineGate 안내.
 *   - renderer EngineGate 컴포넌트: available/authed 조합으로 안내 메시지 분기.
 */
export interface EngineState {
  /**
   * SDK 사용 가능 여부.
   * `ClaudeCodeBackend.isAvailable()` — SDK 모듈 import·초기화 성공 시 true.
   * false면 authed 값에 관계없이 엔진을 쓸 수 없는 상태.
   */
  available: boolean
  /**
   * 인증 존재 여부 — **불리언만, 토큰·키 값 절대 미노출**.
   *
   * true: ~/.claude/.credentials.json 에 accessToken 존재
   *       OR 환경변수 ANTHROPIC_API_KEY 가 비어있지 않음.
   * false: 두 경로 모두 미인증 → renderer가 EngineGate 안내를 표시.
   *
   * CRITICAL(신뢰경계): 실제 토큰·API 키 문자열을 이 필드에 담거나,
   * 이 타입에 token/key/secret 필드를 추가하면 신뢰경계 위반.
   */
  authed: boolean
  /**
   * SDK 버전 문자열(예: '1.2.3').
   * `@anthropic-ai/claude-agent-sdk` package.json version.
   * available=false 또는 버전 조회 불가 시 null.
   */
  version: string | null
}

// ── Engine Update Check 타입 (폴리싱 #2a — 엔진 버전 업데이트 체크) ──────────

/**
 * 엔진 업데이트 체크 결과 — ENGINE_CHECK_UPDATE 채널 응답 타입.
 *
 * 현재 번들 SDK 버전과 npm registry 최신 stable 버전을 비교한 결과를 담는다.
 * 유래: 원본 AgentCodeGUI EngineGate.tsx `engine.listAvailable().latest` + `cmpVer` 미러.
 *
 * CRITICAL(신뢰경계, ADR-008):
 *   - **버전 문자열·boolean 3개 필드만** — OAuth 토큰·API 키·시크릿·자격증명 필드 0.
 *   - token / apiKey / secret / accessToken / credentials 등 민감 필드를 이 타입에
 *     추가하면 신뢰경계 위반 — reviewer 게이트 필수.
 *   - npm registry fetch 는 main 프로세스 단독 수행 — renderer는 이 결과만 수신.
 *
 * 구현 위치: main-process `src/main/engine-state.ts` (핸들러 담당).
 * 소비처: renderer 엔진 업데이트 알림 배너/아이콘 (UI Worker 담당).
 */
export interface EngineUpdateInfo {
  /**
   * 현재 사용 중인 엔진(SDK) 버전 문자열 (예: '1.2.3').
   * `@anthropic-ai/claude-agent-sdk` package.json version 에서 탐지.
   * 탐지 실패 시 null.
   */
  current: string | null
  /**
   * npm registry 최신 stable 버전 문자열 (예: '1.3.0').
   * main 프로세스가 npm registry fetch 후 반환.
   * 오프라인 또는 fetch 실패 시 null.
   */
  latest: string | null
  /**
   * 업데이트 가능 여부.
   * current < latest 이면 true.
   * current 또는 latest 가 한쪽이라도 null 이면 false.
   *
   * CRITICAL(신뢰경계): boolean 값만 — 토큰·시크릿 값 0.
   */
  updateAvailable: boolean
}

// ── Backend Status 타입 (B1 — 듀얼 프로바이더 상태 패널) ──────────────────────

/**
 * 단일 백엔드(코딩 엔진)의 상태 요약 — `backend.list` 채널 응답 BackendStatus[] 의 원소.
 *
 * registry.listBackends() 의 각 어댑터에 대해 main 프로세스가 가용/버전/최신버전/인증을
 * 조회·조합한다. claude-code 의 authed 는 engine-state(getEngineState().authed) 결합,
 * codex(stub) 등은 false.
 *
 * CRITICAL(신뢰경계 — ADR-008, 절대 규칙):
 *   - 필드는 **id·name·available·version·latestVersion·authed 6개만**.
 *   - OAuth 토큰·API 키·시크릿·자격증명·경로·URL·패키지명 등 민감/구체값 0.
 *   - authed 는 **불리언만**(인증 존재 여부) — 자격증명 값 전달 불가.
 *   - version/latestVersion 은 문자열만(없으면 null). 이 계약 밖 필드 추가는 reviewer 필수.
 */
export interface BackendStatus {
  /** 백엔드 식별자(BackendId). */
  id: BackendId
  /** 표시 이름(BACKEND_LABELS[id]). */
  name: string
  /**
   * 이 환경에서 사용 가능한지(AgentBackend.isAvailable()).
   * codex(stub)는 항상 false.
   */
  available: boolean
  /**
   * 설치/번들된 엔진 버전 문자열(AgentBackend.version()). 미설치·탐지 실패 시 null.
   * CRITICAL: 버전 문자열만 — 시크릿 0.
   */
  version: string | null
  /**
   * 최신 가용 버전 문자열(AgentBackend.latestVersion()). 오프라인·미지원 시 null.
   * version 과의 비교로 업데이트 가능 여부 표시.
   */
  latestVersion: string | null
  /**
   * 인증 존재 여부 — **불리언만, 토큰·키 값 절대 미노출**.
   * claude-code: getEngineState().authed(credentials/env 존재). codex 등: false.
   * CRITICAL(신뢰경계): 실제 토큰·키 문자열을 담거나 token/key/secret 필드 추가 금지.
   */
  authed: boolean
}

// ═══════════════════════════════════════════════════════════════════════════════
// Engine Install / Version Management 타입 (폴리싱 #2b+c — ADR-018)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * `engine.install` 요청 — 설치할 엔진 버전.
 *
 * CRITICAL(신뢰경계, ADR-008):
 *   - version 은 **untrusted** — main 이 strict semver(`^\d+\.\d+\.\d+`) 검증 후 npm 설치에만 사용.
 *   - 검증 실패 시 EngineInstallResult{ok:false, error:'invalid version'} 반환.
 *   - 이 타입에 토큰·API 키·시크릿 필드를 추가하면 **신뢰경계 위반** — reviewer 필수.
 *
 * 구현: main-process `src/main/engine-versions.ts` (semver 검증 → npm install → 결과 반환).
 * 소비: renderer EngineGate 설치 버튼.
 */
export interface EngineInstallRequest {
  /**
   * 설치할 버전 문자열 (예: '1.2.3').
   * **untrusted** — main 이 strict semver 검증(`^\d+\.\d+\.\d+`) 후에만 npm 인자화.
   * 검증 실패(빈 문자열·범위 표현·비semver 문자) 시 ok:false, error:'invalid version' 반환.
   */
  version: string
}

/**
 * `engine.install` 결과.
 *
 * CRITICAL(신뢰경계): ok·error 2개 필드만 — 토큰·API 키·시크릿·npm 전체 출력 0.
 * npm 출력은 ENGINE_INSTALL_PROGRESS 이벤트로 스트리밍(main 이 마스킹 후 전달).
 */
export interface EngineInstallResult {
  /** 설치 성공 여부 */
  ok: boolean
  /**
   * 실패 시 오류 메시지.
   * main 이 시크릿·자격증명 값을 제거한 안전 문자열만 포함한다.
   * 성공 시 undefined.
   */
  error?: string
}

/**
 * `engine.installProgress` 이벤트 페이로드 — npm 설치 진행(스트리밍).
 *
 * main 이 ipcRenderer.on('engine.installProgress') push, preload 의 onEngineInstallProgress helper 경유.
 *
 * CRITICAL(신뢰경계, ADR-008):
 *   - line 은 **main 이 시크릿 마스킹한 npm stdout/stderr 한 줄만**.
 *     토큰·API 키·환경변수 값·OAuth 자격증명이 npm 출력에 포함되면 main 이 제거/마스킹 후 전달.
 *   - done=true 라인에는 line 이 없을 수 있다 — ok·error 로 종료 판정.
 *   - env/args/url/command/headers 같은 시크릿 운반 필드를 추가하면 **신뢰경계 위반**.
 *
 * 구현: main-process engine-versions.ts (child_process stdout pipe → 마스킹 → webContents.send).
 * 소비: renderer EngineGate 설치 진행 UI (onEngineInstallProgress 구독).
 */
export interface EngineInstallProgress {
  /** 설치 중인 버전 문자열 */
  version: string
  /**
   * npm stdout/stderr 한 줄 (main 이 시크릿 마스킹 후 전달).
   * 마스킹 규칙: 토큰 패턴(Bearer .../sk-ant-...) → '[REDACTED]' 치환.
   * done 라인에는 없을 수 있다(undefined).
   */
  line?: string
  /**
   * 설치 종료 표지.
   * true 면 npm 프로세스가 종료(성공 또는 실패)되었음을 의미.
   * undefined(미지정) = 진행 중 이벤트.
   */
  done?: boolean
  /**
   * done 시 성공 여부.
   * done=true 일 때만 의미 있음 — 진행 중 이벤트에서는 undefined.
   */
  ok?: boolean
  /**
   * done 시 오류 메시지.
   * ok=false 일 때 main 이 시크릿 마스킹한 오류 설명. 성공/진행 중에는 undefined.
   */
  error?: string
}

/**
 * `engine.setActive` 요청 — 활성 엔진 버전 전환.
 *
 * CRITICAL(신뢰경계):
 *   - version 은 untrusted — main 이 installed 목록에 포함된 버전인지 검증.
 *     미설치 버전 지정 시 ok:false 반환.
 *   - version 필드 1개만 — 토큰·시크릿·자격증명 필드 0.
 *
 * 구현: main-process engine-versions.ts.
 * 소비: renderer EngineGate 버전 선택 UI.
 */
export interface EngineSetActiveRequest {
  /**
   * 활성화할 버전 문자열 (예: '1.2.3').
   * untrusted — main 이 installed 목록 포함 여부 검증.
   */
  version: string
}

/**
 * `engine.versionState` 응답 — 설치/활성 버전 상태.
 *
 * CRITICAL(신뢰경계, 혼동 방지):
 *   - **기존 EngineState(authed 전용: available·authed·version)와 완전히 별개 개념**.
 *     EngineState = SDK 가용/인증 여부(불리언).
 *     EngineVersionState = 멀티버전 설치 관리(버전 문자열·목록 — 시크릿 0).
 *   - 이 타입에 authed·available·token·apiKey·secret 필드를 추가하면 **신뢰경계 위반**.
 *   - 버전 문자열·목록·패키지명만 — 자격증명 필드 없음.
 *
 * 구현: main-process engine-versions.ts.
 * 소비: renderer EngineGate 버전 목록/활성 표시.
 */
export interface EngineVersionState {
  /**
   * 엔진 npm 패키지명 (표시용).
   * 예: '@anthropic-ai/claude-agent-sdk'.
   */
  package: string
  /**
   * 앱에 번들된 기준 버전.
   * 번들 버전 탐지 불가 시 null.
   */
  bundled: string | null
  /**
   * 현재 활성 설치 버전.
   * null = 추가 설치된 버전 없음 → 번들 버전을 그대로 사용.
   */
  active: string | null
  /**
   * 설치된 버전 목록(최신순).
   * 빈 배열 = 추가 설치 없음 (번들만 존재).
   */
  installed: string[]
}

// ═══════════════════════════════════════════════════════════════════════════════
// Settings: Skill 채널 타입 (P5a — Settings Skill 탭 실데이터·토글)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 스킬 레코드 — Settings Skill 탭 표시 단위.
 *
 * 유래: 원본 AgentCodeGUI `protocol.ts L392 SkillInfo` 미러.
 * 용도: Settings Skill 탭에서 스킬 목록 실데이터를 렌더링(SkillView)하고
 *       토글 스위치로 활성화/비활성화를 제어하는 데 사용한다.
 *
 * CRITICAL(신뢰경계):
 *   - name/description/scope/enabled **4개 필드만** — path·시크릿·API 키·토큰 없음.
 *   - name: 스킬 식별자(ASCII 안전 문자열) — 경로 구분자/..  포함 금지(main이 검증).
 *   - description: 표시용 설명 문자열 — 자격증명 절대 미포함, 호출부 책임.
 *   - scope: 'global'(모든 프로젝트) | 'local'(현재 워크스페이스 전용).
 *   - enabled: 활성화 여부 boolean — 문자열·숫자 아님.
 *
 * 구현 위치: main-process `src/main/settings/skills.ts` (IPC 핸들러 + 스킬 저장).
 * 소비처: renderer `SettingsModal SkillView` — skill.list 응답 SkillInfo[]를 렌더링.
 */
export interface SkillInfo {
  /** 스킬 식별자 — main이 토큰/경로 문자 검증. */
  name: string
  /** 스킬 표시 설명 — 자격증명 미포함, 표시 전용. */
  description: string
  /** 스킬 적용 범위: 'global'=모든 프로젝트 | 'local'=현재 워크스페이스 전용. */
  scope: 'global' | 'local'
  /** 활성화 여부 boolean — 문자열 아님, 토글 스위치 상태와 1:1 대응. */
  enabled: boolean
}

/**
 * `skill.setEnabled` 요청 — 스킬 활성화/비활성화 토글.
 *
 * 유래: 원본 AgentCodeGUI protocol.ts SkillInfo 미러(toggle 조작 파생).
 * 용도: Settings Skill 탭 토글 스위치가 조작될 때 renderer가 이 요청을 main으로 전송한다.
 *
 * CRITICAL(신뢰경계):
 *   - name·enabled **2개 필드만** — path·시크릿·토큰 없음.
 *   - enabled는 **boolean만** — 'true'/'false' 문자열 전달 불가, main이 타입 검증.
 *   - name은 스킬 식별자(ASCII) — 경로 탈출('..'/절대경로) main이 차단.
 *
 * 구현 위치: main-process `src/main/settings/skills.ts`.
 * 소비처: renderer SettingsModal SkillView 토글 onChange 핸들러.
 */
export interface SkillSetEnabledReq {
  /** 대상 스킬 식별자 — SkillInfo.name 과 대응. */
  name: string
  /** 활성화(true) / 비활성화(false) — boolean-only 토글. */
  enabled: boolean
}

// ═══════════════════════════════════════════════════════════════════════════════
// Settings: MCP 채널 타입 (P5b — Settings MCP 탭 실데이터·토글)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * MCP 서버 레코드 — Settings MCP 탭 표시 단위.
 *
 * 유래: 원본 AgentCodeGUI `protocol.ts L379 McpServerInfo` 1:1 미러.
 * 용도: Settings MCP 탭에서 MCP 서버 목록 실데이터를 렌더링(McpView)하고
 *       토글 스위치로 활성화/비활성화를 제어하는 데 사용한다.
 *
 * CRITICAL(신뢰경계 — 절대 규칙):
 *   - name/scope/origin/transport/detail/enabled **6개 필드만**.
 *   - env/args/url/command/headers 같은 시크릿 운반 필드를 이 타입에 추가하면
 *     **신뢰경계 붕괴** — 이 계약 밖 필드 추가는 reviewer 무조건 필수.
 *   - `detail` 은 main(settings/mcp.ts)이 화이트리스트 마스킹한 안전 문자열만:
 *       stdio → command basename 만(예: 'npx', 'node') — args/env 절대 미포함.
 *       http/sse → host 만(예: 'api.example.com') — URL 토큰·Authorization 미포함.
 *       unknown → 빈 문자열 또는 'unknown'.
 *   - server `name`·transport·scope·origin·enabled boolean만 renderer로 전달된다.
 *
 * 구현 위치: main-process `src/main/settings/mcp.ts` (IPC 핸들러 + MCP 서버 발견 + 마스킹).
 * 소비처: renderer `SettingsModal McpView` — mcp.list 응답 McpServerInfo[]를 렌더링.
 */
export interface McpServerInfo {
  /** 서버 이름 (mcpServers map 의 key — 동명 서버 구분자). */
  name: string
  /**
   * 서버 범위(탭 필터 기준).
   * 'global' = ~/.claude.json 사용자 서버 · 'local' = 프로젝트/로컬 서버.
   */
  scope: 'global' | 'local'
  /**
   * 설정 출처(행 배지 표시).
   * 'user'(~/.claude.json) · 'project'(.mcp.json) · 'local'(로컬 전용 설정).
   * 동명 서버가 여러 출처에 존재할 때 구분자로 사용.
   */
  origin: 'user' | 'project' | 'local'
  /**
   * 전송 프로토콜.
   * 'stdio'(command 기반) · 'http' · 'sse' · 'unknown'(파싱 불가 서버).
   */
  transport: 'stdio' | 'http' | 'sse' | 'unknown'
  /**
   * 서버 식별 정보 — main이 화이트리스트 마스킹한 안전 문자열만.
   *
   * CRITICAL(신뢰경계): 이 필드에는 시크릿·자격증명·전체 명령행·URL 전체가
   * 절대 포함되지 않는다. main(settings/mcp.ts)이 다음 규칙으로 마스킹 후 전달:
   *   - stdio: command 의 basename 만(예: 'npx', 'node', 'python') — args/env 제거.
   *   - http/sse: URL 의 host 만(예: 'api.example.com') — path·query·token 제거.
   *   - unknown: 빈 문자열 또는 'unknown'.
   * renderer 는 이 값을 표시 목적으로만 사용해야 한다.
   */
  detail: string
  /**
   * 활성화 여부.
   * false → 엔진에 deniedMcpServers 로 전달되어 해당 서버를 비활성화.
   * boolean-only — 문자열·숫자 아님.
   */
  enabled: boolean
}

/**
 * `mcp.setEnabled` 요청 — MCP 서버 활성화/비활성화 토글.
 *
 * 유래: 원본 AgentCodeGUI protocol.ts McpServerInfo 미러(toggle 조작 파생).
 * 용도: Settings MCP 탭 토글 스위치가 조작될 때 renderer가 이 요청을 main으로 전송한다.
 *
 * CRITICAL(신뢰경계):
 *   - name·enabled **2개 필드만** — env/args/url/command/headers·시크릿·토큰 없음.
 *   - enabled는 **boolean만** — 'true'/'false' 문자열 전달 불가, main이 타입 검증.
 *   - name 은 MCP 서버 식별자(mcpServers map 키) — 경로 탈출·임의 문자 main이 차단.
 *
 * 구현 위치: main-process `src/main/settings/mcp.ts`.
 * 소비처: renderer SettingsModal McpView 토글 onChange 핸들러.
 */
export interface McpSetEnabledReq {
  /** 대상 MCP 서버 식별자 — McpServerInfo.name 과 대응. */
  name: string
  /** 활성화(true) / 비활성화(false) — boolean-only 토글. */
  enabled: boolean
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slash Commands 채널 타입 (P10 — Composer 슬래시 자동완성 팔레트)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 슬래시 커맨드 레코드 — Composer 슬래시 팔레트 표시 단위.
 *
 * 유래: SDK supportedCommands / init.slash_commands(빌트인) +
 *       커스텀 .claude/commands/*.md 스캔(사용자 ~/ · 프로젝트 <ws>/.claude/commands).
 * 용도: Composer에서 '/' 입력 시 슬래시 자동완성 팔레트가 이 타입의 배열로 목록을 필터링한다.
 *       기존 SKILL_LIST 재사용 패턴 — Settings Skill 탭과 동일한 IPC 노출 최소화 방식.
 *
 * CRITICAL(신뢰경계 — 절대 규칙):
 *   - name/description/argHint/scope **4개 필드 최대** — 시크릿 0.
 *   - path(.md 파일 경로)·content(.md 본문)·body·env 같은 민감·실행 데이터를
 *     이 타입에 추가하면 **신뢰경계 붕괴** — 계약 밖 필드 추가는 reviewer 무조건 필수.
 *   - name: 슬래시 제외 순수 식별자(예: 'compact', 'deploy') — '/' 접두사 없음.
 *     경로 탈출('..'/절대경로/경로 구분자 포함 금지) — main이 검증 후 안전 문자열만 전달.
 *   - description: 표시용 설명 — frontmatter description 또는 빌트인 설명 문자열만.
 *     자격증명·시크릿 절대 미포함.
 *   - argHint: 선택 필드 — '[file] [format]' 등 인자 힌트 문자열. 없으면 생략(undefined).
 *   - scope: 출처 구분 리터럴 — 팔레트 UI의 배지/필터 기준.
 *
 * 구현 위치: main-process `src/main/settings/commands.ts`
 *   (SDK 빌트인 목록 + ~/.claude/commands 스캔 + <ws>/.claude/commands 스캔 → 병합 정렬).
 * 소비처: renderer Composer 슬래시 팔레트
 *   (command.list invoke → SlashCommandInfo[] 수신 → '/' 입력 후 name 기준 필터링).
 */
export interface SlashCommandInfo {
  /**
   * 슬래시 제외 커맨드 이름 (예: 'compact', 'deploy', 'review').
   * '/' 접두사 없음 — renderer가 표시 시 '/' + name 조합.
   * 경로 구분자·'..'·절대경로 포함 금지 — main이 검증 후 안전 문자열만 전달.
   */
  name: string
  /**
   * 커맨드 설명 문자열.
   * 빌트인: SDK가 제공하는 설명 문자열.
   * 커스텀: .claude/commands/*.md frontmatter description 필드 (없으면 파일명에서 파생).
   * 표시 전용 — 자격증명·시크릿 절대 미포함.
   */
  description: string
  /**
   * 인자 힌트 문자열 (선택).
   * 예: '[file] [format]', '[env]', '[template]'.
   * 없으면 생략(undefined) — 팔레트 UI가 조건부 표시.
   */
  argHint?: string
  /**
   * 커맨드 출처 구분.
   *
   * - 'builtin':  Claude Code SDK 내장 커맨드 (예: /compact, /init, /help, /clear).
   * - 'user':     사용자 커스텀 커맨드 (~/.claude/commands/*.md).
   * - 'project':  프로젝트 커스텀 커맨드 (<workspace>/.claude/commands/*.md).
   *
   * 팔레트 UI의 배지(scope 배지)·필터 기준으로 사용한다.
   */
  scope: 'builtin' | 'user' | 'project'
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dialog 채널 타입 (P15 — 멀티 패널별 cwd 폴더 선택)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * `dialog.pickFolder` 응답 — 사용자가 선택한 폴더의 절대경로.
 *
 * 유래: 멀티 에이전트 모드에서 각 패널이 독립 작업 폴더(cwd)를 갖도록,
 *   전역 워크스페이스를 바꾸지 않고 폴더만 선택해 경로를 돌려받는 경량 picker.
 *   기존 workspace.open 은 전역 _currentWorkspaceRoot 를 변경하므로 멀티 패널에 부적합.
 * 용도: MultiWorkspace 패널 폴더 선택 버튼 — 패널별 cwd 설정 목적.
 *
 * CRITICAL(신뢰경계 — 절대 규칙):
 *   - path 필드만 — 트리·파일목록·시크릿·전역 워크스페이스 정보 0.
 *   - path 는 main 이 OS 다이얼로그로 선택한 경로를 절대경로로 검증 후 반환.
 *     취소(사용자가 닫기) 또는 실패 시 null.
 *   - 요청 인자 없음(preload 시그니처: () => Promise<PickFolderResponse>) —
 *     renderer 가 임의 경로를 주입할 수 없다(신뢰경계 불가침).
 *   - 전역 워크스페이스(_currentWorkspaceRoot) 미변경 — workspace.open 과 명백히 구분.
 *
 * 구현 위치: main-process `ipc/index.ts` (ipcMain.handle 핸들러, dialog.showOpenDialog 사용).
 * 소비처: renderer MultiWorkspace 패널 — 폴더 선택 버튼 onClick 에서 invoke 후 패널별 cwd 갱신.
 */
export interface PickFolderResponse {
  /**
   * 선택된 폴더의 절대경로.
   * 사용자가 다이얼로그를 취소하거나 선택 실패 시 null.
   *
   * CRITICAL(신뢰경계): path 는 main 이 절대경로 검증 후 반환 — 경로 외 정보 없음.
   * 전역 워크스페이스를 변경하지 않는다(workspace.open 과 다름).
   */
  path: string | null
}

// ═══════════════════════════════════════════════════════════════════════════════
// Multi Session 채널 타입 (M3 — 멀티 세션 영속, maStore.ts 미러)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 영속용 메시지 레코드 — shared 자족 타입.
 *
 * CRITICAL(의존방향 B1): ThreadItem(renderer 타입) 대신 shared 자족 최소 타입.
 * 패널은 msg 버블만 렌더(MultiWorkspace L504 참조) — toolgroup/thinking은 영속/복원 불필요.
 * images: 첨부 이미지 data URL 또는 절대경로 배열(선택).
 */
export interface PersistedMsg {
  /** 메시지 고유 ID */
  id: string
  /** 메시지 역할 */
  role: 'user' | 'assistant'
  /** 메시지 텍스트 내용 */
  text: string
  /** 오류 메시지 여부 (선택) */
  error?: boolean
  /** 첨부 이미지 data URL 또는 절대경로 배열 (선택) */
  images?: string[]
}

/**
 * 영속용 Picker 상태 — shared 자족 타입.
 *
 * CRITICAL(의존방향 B1): PickerState(renderer 타입) 대신 shared 자족 직렬화용 타입.
 * model/effort/mode 세 필드만 — 렌더러 내부 파생값(컨텍스트 윈도우 등) 제외.
 */
export interface PersistedPicker {
  /** 모델 picker id (예: 'opus' | 'sonnet' | 'haiku' | 'fable') */
  model: string
  /** effort picker id (예: 'max' | 'high' | 'medium' | 'low') */
  effort: string
  /** 권한 모드 picker id (예: 'normal' | 'plan' | 'acceptEdits') */
  mode: string
}

/**
 * 패널 thread 스냅샷 — 영속 단위.
 *
 * messages: PersistedMsg[] — msg kind만 포함(toolgroup/thinking 제외).
 * seq: reducer seq 카운터 — 복원 시 id 충돌 방지를 위한 시드값.
 * lastUsage: 마지막 턴 토큰 사용량 (선택 — 표시용).
 * lastContextWindow: 마지막 컨텍스트 창 크기 (선택 — 게이지 표시용).
 *
 * TokenUsage는 src/shared/agent-events.ts에 이미 정의됨 — 재정의 금지.
 */
export interface PanelThreadSnapshot {
  /** 영속 메시지 목록 (msg kind만) */
  messages: PersistedMsg[]
  /** reducer seq 카운터 (복원 시 id 충돌 방지 시드) */
  seq: number
  /** 마지막 턴 토큰 사용량 (선택) */
  lastUsage?: TokenUsage
  /** 마지막 컨텍스트 창 크기 토큰 (선택) */
  lastContextWindow?: number
  /**
   * 엔진 세션 ID — 턴 간 맥락 복구용 (Phase 1.5 멀티 패널, REPL_TRANSITION).
   * 복원 시 send가 resumeSessionId로 되돌려 보내 **재시작 후에도 패널 맥락 resume**.
   * CRITICAL(신뢰경계·ADR-003): 불투명 세션 토큰(string)만. 시크릿 아님(식별자) — 평문 영속 가능.
   */
  sessionId?: string
}

/**
 * 단일 패널 영속 레코드.
 *
 * title: 패널 표시 제목.
 * cwd: 패널 작업 폴더 절대경로 (선택 — 재검증 필수).
 *   CRITICAL(신뢰경계): 복원 시 main이 isAbsolute+existsSync+isDirectory 재검증.
 *   실패 시 undefined drop → renderer가 전역 workspaceRoot 폴백.
 * picker: 모델/effort/모드 설정.
 * sysPrompt: 패널별 커스텀 시스템 프롬프트 (선택).
 * snapshot: 패널 thread 스냅샷 (선택 — 없으면 빈 초기상태).
 */
export interface PersistedPanel {
  /** 패널 표시 제목 */
  title: string
  /**
   * 패널 작업 폴더 절대경로 (선택).
   * CRITICAL(신뢰경계): main LOAD 핸들러가 isAbsolute+existsSync+isDirectory로 재검증.
   * 검증 실패 시 undefined → renderer 전역 workspaceRoot 폴백.
   */
  cwd?: string
  /** 모델/effort/모드 설정 */
  picker: PersistedPicker
  /** 패널별 커스텀 시스템 프롬프트 (선택) */
  sysPrompt?: string
  /** 패널 thread 스냅샷 (선택 — 없으면 빈 초기상태) */
  snapshot?: PanelThreadSnapshot
}

/**
 * 멀티 에이전트 세션 레코드 — sessions[] 봉투 항목.
 *
 * M3은 단일 활성 세션만 채움(sessions 길이 = 1).
 * sessions[] 봉투는 forward-compat — 후속 증분에서 여러 세션 지원 예정.
 */
export interface PersistedMultiSession {
  /** 세션 고유 ID */
  id: string
  /** 세션 표시 제목 (선택) */
  title?: string
  /** 패널 수 (2~6) */
  count: number
  /** 패널 레코드 목록 (count와 대응) */
  panels: PersistedPanel[]
}

/**
 * 멀티 에이전트 워크스페이스 전체 영속 상태.
 *
 * version: MULTI_VERSION = 2 고정 (S1 — 원본 maStore.ts MULTI_VERSION=2 미러).
 *   version≠2 blob → readMulti()가 null 반환 (graceful 무시).
 * activeSessionId: 현재 활성 세션 ID.
 * sessions: 세션 목록 (M3은 단일 활성 세션만 채움).
 *
 * CRITICAL(신뢰경계): 이 blob은 renderer가 보내는 untrusted 입력.
 *   - SAVE: main이 best-effort 기록 (검증 최소).
 *   - LOAD: main이 반환 전 각 panel.cwd를 isAbsolute+existsSync+isDirectory 재검증.
 *           실패 panel.cwd → undefined drop (임의 경로 무확인 통과 0).
 */
export interface PersistedMultiState {
  /** blob 버전 — MULTI_VERSION = 2 고정 */
  version: number
  /** 현재 활성 세션 ID */
  activeSessionId: string
  /** 세션 목록 (M3은 길이 1) */
  sessions: PersistedMultiSession[]
}

// multiSession.save ───────────────────────────────────────────────────────────

/**
 * `multiSession.save` 요청 — 멀티 에이전트 세션 상태 저장.
 *
 * CRITICAL(신뢰경계): state는 renderer untrusted 입력 — main이 best-effort 기록.
 * 저장 시 검증 최소. 읽기(LOAD) 시 cwd 재검증으로 보호.
 */
export interface MultiSessionSaveRequest {
  /** 저장할 멀티 세션 상태 */
  state: PersistedMultiState
}

/** `multiSession.save` 응답 */
export interface MultiSessionSaveResponse {
  /** 저장 성공 여부 (best-effort — 실패해도 크래시 0) */
  ok: boolean
}

// multiSession.load ───────────────────────────────────────────────────────────

/**
 * `multiSession.load` 요청 — 인자 없음.
 *
 * CRITICAL(신뢰경계): 요청 인자 없음 — renderer가 경로를 주입할 수 없다.
 * main이 고정 경로(userData/multi-agent.json)에서 읽어 cwd 재검증 후 반환.
 */
export type MultiSessionLoadRequest = Record<string, never>

/**
 * `multiSession.load` 응답 — PersistedMultiState 또는 null.
 *
 * CRITICAL(신뢰경계):
 *   - 반환 전 각 panel.cwd를 isAbsolute+existsSync+isDirectory 재검증.
 *   - 검증 실패 cwd → undefined drop (임의 경로 무확인 통과 0).
 *   - 손상 JSON / version≠2 → null (graceful).
 */
export interface MultiSessionLoadResponse {
  /** 복원된 멀티 세션 상태 (파일 없음/손상/version 불일치 → null) */
  state: PersistedMultiState | null
}
