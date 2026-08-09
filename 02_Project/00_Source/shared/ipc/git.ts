import type { DiffLine } from '../diffTypes'

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
} as const

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

export interface GitOpResult {
  ok: boolean
  error?: string
}

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
