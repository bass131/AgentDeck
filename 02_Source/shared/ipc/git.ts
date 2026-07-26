/**
 * ipc/git.ts — Git 도메인 채널·타입 계약 (M3 — 원본 AgentCodeGUI protocol.ts shape 1:1 미러)
 *
 * 채널: GIT_ROOT · GIT_STATUS · GIT_LOG · GIT_COMMIT_DETAIL · GIT_FILE_AT
 *       GIT_WORKING_FILE · GIT_COMMIT · GIT_PUSH · GIT_PULL
 * 구현 위치: main-process 담당 (이 파일은 *정의*만 — 핸들러 로직 없음).
 */

import type { DiffLine } from '../diff-types'

// ── 채널명 상수 ──────────────────────────────────────────────────────────────

export const GIT_CHANNELS = {
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
} as const

// ── 공통 Git 타입 ────────────────────────────────────────────────────────────

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

// ── git.root ──────────────────────────────────────────────────────────────────

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

// ── git.status ────────────────────────────────────────────────────────────────

/** `git.status` 요청 */
export interface GitStatusRequest {
  /** 레포 최상위 절대 경로 */
  root: string
}

/**
 * `git.status` 응답 — GitStatus 스냅샷, 레포 없으면 null.
 */
export type GitStatusResponse = GitStatus | null

// ── git.log ───────────────────────────────────────────────────────────────────

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

// ── git.commitDetail ──────────────────────────────────────────────────────────

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

// ── git.fileAt ────────────────────────────────────────────────────────────────

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

// ── git.workingFile ───────────────────────────────────────────────────────────

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

// ── git.commit ────────────────────────────────────────────────────────────────

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

// ── git.push ──────────────────────────────────────────────────────────────────

/** `git.push` 요청 */
export interface GitPushRequest {
  /** 레포 최상위 절대 경로 */
  root: string
}

/**
 * `git.push` 응답.
 */
export type GitPushResponse = GitOpResult

// ── git.pull ──────────────────────────────────────────────────────────────────

/** `git.pull` 요청 (--ff-only) */
export interface GitPullRequest {
  /** 레포 최상위 절대 경로 */
  root: string
}

/**
 * `git.pull` 응답.
 */
export type GitPullResponse = GitOpResult
