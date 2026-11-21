import type { Ack } from '../02_Common/common'
import type { DiffLine } from '../02_Common/diffTypes'

export const GIT_CHANNELS = {
  GIT_ROOT: 'git.root',
  GIT_STATUS: 'git.status',
  GIT_LOG: 'git.log',
  GIT_COMMIT_DETAIL: 'git.commitDetail',
  GIT_FILE_AT: 'git.fileAt',
  GIT_WORKING_FILE: 'git.workingFile',
  GIT_COMMIT: 'git.commit',
  GIT_PUSH: 'git.push',
  GIT_PULL: 'git.pull',
  // PR 카드는 사람이 누른 병합 버튼으로만 병합한다
  GIT_PR_READ: 'git.prRead',
  GIT_PR_MERGE: 'git.prMerge',
} as const

// 보인 머리 SHA의 check run·commit status에서 읽는다.
export type PrCheckResult = 'success' | 'pending' | 'failure' | 'missing'

// 카드에 보이는 값은 모두 main이 GitHub에서 읽은 값이다.
export interface PrView {
  owner: string
  repo: string
  number: number
  title: string
  url: string
  state: 'open' | 'closed'
  draft: boolean
  merged: boolean
  // GitHub가 아직 계산하지 않았으면 null이다
  mergeable: boolean | null
  baseRef: string
  headRef: string
  headSha: string
  // base 브랜치에 보호가 걸려 있는가(보호 API가 「Branch not protected」이고 룰셋 규칙도 없으면 false)
  protected: boolean
  // 고전 보호 없이 룰셋으로만 지키는가
  byRuleset?: boolean
  // 필수 검사 이름을 읽지 못한 사유 — 있으면 버튼이 꺼진다(닫힌 실패)
  requiredError?: string
  // 검사 결과를 읽지 못한 사유 — 있으면 버튼이 꺼진다
  checksError?: string
  checks: { name: string; result: PrCheckResult }[]
  canMerge: boolean
  // 버튼을 끄는 사유
  reasons: string[]
  // 막지 않는 안내(보호 없는 base 등)
  notes: string[]
}

// 번호 또는 PR URL로 읽는다. URL은 번호를 찾는 데만 쓰고, 저장소가 origin과 다르면 읽지 않는다.
export interface PrReadRequest {
  cwd: string
  number?: number
  url?: string
}

export type PrReadResponse =
  | { ok: true; pr: PrView }
  | { ok: false; error: string; otherRepo?: boolean }

// sha는 카드가 보인(main이 마지막으로 읽어 돌려준) 머리 SHA다. main은 다른 SHA를 거부한다.
export interface PrMergeRequest {
  cwd: string
  number: number
  sha: string
}

// merged: 병합 커밋 SHA가 mergeSha · enqueued: 병합 큐에 들어감 · refused: 보내지 않았거나 서버가 거부
// failed: 서버의 병합 실패·응답 이상 · timeout: 결과 대기 시간 초과
// unknown: 요청을 보낸 뒤 HTTP 상태 없이 끝남(시간 초과·네트워크) — 서버가 받았는지 모른다
export interface PrMergeResponse {
  status: 'merged' | 'enqueued' | 'refused' | 'failed' | 'timeout' | 'unknown'
  message: string
  mergeSha?: string
}

export type GitFileStatus = 'M' | 'A' | 'D' | 'R'

export interface GitChange {
  path: string
  status: GitFileStatus
  add: number | null
  del: number | null
}

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

export interface GitFileAt {
  content: string | null
  diff: DiffLine[] | null
  error?: string
}

export type GitOpResult = Ack

export interface GitRootRequest {
  cwd: string
  force?: boolean
}

export type GitRootResponse = string | null

export interface GitStatusRequest {
  root: string
}

export type GitStatusResponse = GitStatus | null

export interface GitLogRequest {
  root: string
  limit?: number
}

export type GitLogResponse = GitCommit[]

export interface GitCommitDetailRequest {
  root: string
  hash: string
}

export type GitCommitDetailResponse = GitChange[]

export interface GitFileAtRequest {
  root: string
  hash: string
  path: string
}

export type GitFileAtResponse = GitFileAt

export interface GitWorkingFileRequest {
  root: string
  path: string
}

export type GitWorkingFileResponse = GitFileAt

export interface GitCommitRequest {
  root: string
  subject: string
  body: string
}

export type GitCommitResponse = GitOpResult

export interface GitPushRequest {
  root: string
}

export type GitPushResponse = GitOpResult

export interface GitPullRequest {
  root: string
}

export type GitPullResponse = GitOpResult
