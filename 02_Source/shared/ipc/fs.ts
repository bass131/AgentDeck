/**
 * ipc/fs.ts — 파일시스템·다이얼로그 도메인 채널·타입 계약
 *
 * 채널: FS_DIFF · FS_READ · LIST_FILES · FS_LIST_DIR · SAVE_IMAGE_DATA · DIALOG_PICK_FOLDER
 * 구현 위치: main-process 담당 (이 파일은 *정의*만 — 핸들러 로직 없음).
 */

import type { DiffLine } from '../diff-types'
import type { FileTreeNode } from './workspace'

// ── 채널명 상수 ──────────────────────────────────────────────────────────────

export const FS_CHANNELS = {
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
} as const

// ── fs.diff ───────────────────────────────────────────────────────────────────

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

// ── fs.read (텍스트 + 바이너리 통합 단일 채널 — M2) ───────────────────────────

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

// ── fs.listFiles (@멘션 팔레트 — 프로젝트 파일 플랫 목록, M4-2) ──────────────────

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

// ── fs.listDir (탐색기 lazy 폴더 열기 — Phase 35 M7) ────────────────────────────

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

// ── image.saveData (붙여넣기/드롭 이미지 → temp 파일 경로, M4-2) ─────────────────

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

// ── dialog.pickFolder (P15 — 멀티 패널별 cwd 폴더 선택) ──────────────────────────

/**
 * `dialog.pickFolder` 응답 — 사용자가 선택한 폴더의 절대경로.
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
