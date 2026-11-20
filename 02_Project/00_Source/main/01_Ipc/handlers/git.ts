import { isAbsolute } from 'node:path'
import { handle } from '../handle'
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
  PrReadRequest,
  PrReadResponse,
  PrMergeRequest,
  PrMergeResponse,
} from '../../../shared/ipcContract'
import * as gitApi from '@main/08_Git/git'
import { prService } from '@main/08_Git/prMerge'

export function registerGitHandlers(): void {

  handle(IPC_CHANNELS.GIT_ROOT, async (_e, req: GitRootRequest): Promise<GitRootResponse> => {
    if (!req?.cwd || typeof req.cwd !== 'string') {
      return null
    }
    if (!isAbsolute(req.cwd)) {
      return null
    }
    return gitApi.gitRoot(req.cwd, req.force === true)
  })

  handle(IPC_CHANNELS.GIT_STATUS, async (_e, req: GitStatusRequest): Promise<GitStatusResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return null
    }
    return gitApi.gitStatus(req.root)
  })

  handle(IPC_CHANNELS.GIT_LOG, async (_e, req: GitLogRequest): Promise<GitLogResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return []
    }
    const limit = typeof req.limit === 'number' && req.limit > 0 ? req.limit : undefined
    return gitApi.gitLog(req.root, limit)
  })

  handle(IPC_CHANNELS.GIT_COMMIT_DETAIL, async (_e, req: GitCommitDetailRequest): Promise<GitCommitDetailResponse> => {
    if (!req?.root || typeof req.root !== 'string') return []
    if (!req?.hash || typeof req.hash !== 'string' || !gitApi.isSafeRev(req.hash)) return []
    return gitApi.gitCommitDetail(req.root, req.hash)
  })

  handle(IPC_CHANNELS.GIT_FILE_AT, async (_e, req: GitFileAtRequest): Promise<GitFileAtResponse> => {
    if (!req?.root || typeof req.root !== 'string') return { content: null, diff: null }
    if (!req?.hash || typeof req.hash !== 'string' || !gitApi.isSafeRev(req.hash)) return { content: null, diff: null }
    if (!req?.path || typeof req.path !== 'string') return { content: null, diff: null }
    return gitApi.gitFileAt(req.root, req.hash, req.path)
  })

  handle(IPC_CHANNELS.GIT_WORKING_FILE, async (_e, req: GitWorkingFileRequest): Promise<GitWorkingFileResponse> => {
    if (!req?.root || typeof req.root !== 'string') return { content: null, diff: null }
    if (!req?.path || typeof req.path !== 'string') return { content: null, diff: null }
    return gitApi.gitWorkingFile(req.root, req.path)
  })

  handle(IPC_CHANNELS.GIT_COMMIT, async (_e, req: GitCommitRequest): Promise<GitCommitResponse> => {
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

  handle(IPC_CHANNELS.GIT_PUSH, async (_e, req: GitPushRequest): Promise<GitPushResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return { ok: false, error: 'git.push: root 경로가 필요합니다' }
    }
    if (!isAbsolute(req.root)) {
      return { ok: false, error: 'git.push: root는 절대 경로여야 합니다' }
    }
    return gitApi.gitPush(req.root)
  })

  // PR 카드 (M07 G8) — 값은 main이 GitHub에서 읽고, 병합은 main이 마지막으로 읽어 보인 SHA로만 한다(prMerge.ts).
  handle(IPC_CHANNELS.GIT_PR_READ, async (_e, req: PrReadRequest): Promise<PrReadResponse> => {
    if (!req?.cwd || typeof req.cwd !== 'string' || !isAbsolute(req.cwd)) {
      return { ok: false, error: 'git.prRead: cwd는 절대 경로여야 합니다' }
    }
    const url = typeof req.url === 'string' ? req.url : undefined
    const number = typeof req.number === 'number' ? req.number : undefined
    return prService().readPr(req.cwd, { url, number })
  })

  handle(IPC_CHANNELS.GIT_PR_MERGE, async (_e, req: PrMergeRequest): Promise<PrMergeResponse> => {
    if (!req?.cwd || typeof req.cwd !== 'string' || !isAbsolute(req.cwd)) {
      return { status: 'refused', message: 'git.prMerge: cwd는 절대 경로여야 합니다' }
    }
    return prService().mergePr(req.cwd, req.number, req.sha)
  })

  handle(IPC_CHANNELS.GIT_PULL, async (_e, req: GitPullRequest): Promise<GitPullResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return { ok: false, error: 'git.pull: root 경로가 필요합니다' }
    }
    if (!isAbsolute(req.root)) {
      return { ok: false, error: 'git.pull: root는 절대 경로여야 합니다' }
    }
    return gitApi.gitPull(req.root)
  })
}
