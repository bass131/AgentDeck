import { ipcMain } from 'electron'
import { isAbsolute } from 'node:path'
import { IPC_CHANNELS } from '../../../shared/ipcContract'
import type {
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
} from '../../../shared/ipcContract'
import * as gitApi from '../../02_fs/git'

export function registerGitHandlers(): void {

  ipcMain.handle(IPC_CHANNELS.GIT_ROOT, async (_e, req: GitRootRequest): Promise<GitRootResponse> => {
    if (!req?.cwd || typeof req.cwd !== 'string') {
      return null
    }
    if (!isAbsolute(req.cwd)) {
      return null
    }
    return gitApi.gitRoot(req.cwd, req.force === true)
  })

  ipcMain.handle(IPC_CHANNELS.GIT_STATUS, async (_e, req: GitStatusRequest): Promise<GitStatusResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return null
    }
    return gitApi.gitStatus(req.root)
  })

  ipcMain.handle(IPC_CHANNELS.GIT_LOG, async (_e, req: GitLogRequest): Promise<GitLogResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return []
    }
    const limit = typeof req.limit === 'number' && req.limit > 0 ? req.limit : undefined
    return gitApi.gitLog(req.root, limit)
  })

  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT_DETAIL, async (_e, req: GitCommitDetailRequest): Promise<GitCommitDetailResponse> => {
    if (!req?.root || typeof req.root !== 'string') return []
    if (!req?.hash || typeof req.hash !== 'string') return []
    return gitApi.gitCommitDetail(req.root, req.hash)
  })

  ipcMain.handle(IPC_CHANNELS.GIT_FILE_AT, async (_e, req: GitFileAtRequest): Promise<GitFileAtResponse> => {
    if (!req?.root || typeof req.root !== 'string') return { content: null, diff: null }
    if (!req?.hash || typeof req.hash !== 'string') return { content: null, diff: null }
    if (!req?.path || typeof req.path !== 'string') return { content: null, diff: null }
    return gitApi.gitFileAt(req.root, req.hash, req.path)
  })

  ipcMain.handle(IPC_CHANNELS.GIT_WORKING_FILE, async (_e, req: GitWorkingFileRequest): Promise<GitWorkingFileResponse> => {
    if (!req?.root || typeof req.root !== 'string') return { content: null, diff: null }
    if (!req?.path || typeof req.path !== 'string') return { content: null, diff: null }
    return gitApi.gitWorkingFile(req.root, req.path)
  })

  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT, async (_e, req: GitCommitRequest): Promise<GitCommitResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return { ok: false, error: 'git.commit: root 경로가 필요합니다' }
    }
    if (!isAbsolute(req.root)) {
      return { ok: false, error: 'git.commit: root는 절대 경로여야 합니다' }
    }
    if (!req?.subject || typeof req.subject !== 'string' || !req.subject.trim()) {
      return { ok: false, error: 'git.commit: subject(커밋 제목)가 필요합니다' }
    }
    const body = typeof req.body === 'string' ? req.body : ''
    return gitApi.gitCommit(req.root, req.subject, body)
  })

  ipcMain.handle(IPC_CHANNELS.GIT_PUSH, async (_e, req: GitPushRequest): Promise<GitPushResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return { ok: false, error: 'git.push: root 경로가 필요합니다' }
    }
    if (!isAbsolute(req.root)) {
      return { ok: false, error: 'git.push: root는 절대 경로여야 합니다' }
    }
    return gitApi.gitPush(req.root)
  })

  ipcMain.handle(IPC_CHANNELS.GIT_PULL, async (_e, req: GitPullRequest): Promise<GitPullResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return { ok: false, error: 'git.pull: root 경로가 필요합니다' }
    }
    if (!isAbsolute(req.root)) {
      return { ok: false, error: 'git.pull: root는 절대 경로여야 합니다' }
    }
    return gitApi.gitPull(req.root)
  })
}
