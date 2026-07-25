/**
 * handlers/git.ts — git 도메인 핸들러 등록
 *
 * 채널: GIT_ROOT · GIT_STATUS · GIT_LOG · GIT_COMMIT_DETAIL · GIT_FILE_AT
 *       GIT_WORKING_FILE · GIT_COMMIT · GIT_PUSH · GIT_PULL
 *
 * CRITICAL(신뢰경계):
 *   - GIT_ROOT: cwd는 untrusted — isAbsolute 검증 (절대경로 아님 → null).
 *   - GIT_COMMIT/PUSH/PULL: root는 untrusted — isAbsolute 검증 필수.
 *     git 명령에 임의 경로 전달 금지.
 *   - GIT_COMMIT/PUSH: 비가역 작업 — UI 레이어 확인 게이트는 renderer 책임.
 *     main 핸들러는 isAbsolute 검증 + gitApi 위임만.
 *   - 모든 오류는 { ok: false, error } 로 반환 (throw → UI 무응답 방지).
 *
 * ADR-015: git CLI execFile 직접 호출(라이브러리 0) — gitApi 모듈에 위임.
 */

import { ipcMain } from 'electron'
import { isAbsolute } from 'node:path'
import { IPC_CHANNELS } from '../../../shared/ipc-contract'
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
} from '../../../shared/ipc-contract'
import * as gitApi from '../../git'

// ── 핸들러 등록 ──────────────────────────────────────────────────────────────

/** git 도메인 IPC 핸들러를 등록한다. 의존성 없음 (gitApi는 순수 모듈). */
export function registerGitHandlers(): void {

  // ── git.root ───────────────────────────────────────────────────────────────
  // CRITICAL: cwd는 untrusted — isAbsolute 검증 실패 시 null 반환.

  ipcMain.handle(IPC_CHANNELS.GIT_ROOT, async (_e, req: GitRootRequest): Promise<GitRootResponse> => {
    if (!req?.cwd || typeof req.cwd !== 'string') {
      return null
    }
    if (!isAbsolute(req.cwd)) {
      return null
    }
    return gitApi.gitRoot(req.cwd, req.force === true)
  })

  // ── git.status ────────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.GIT_STATUS, async (_e, req: GitStatusRequest): Promise<GitStatusResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return null
    }
    return gitApi.gitStatus(req.root)
  })

  // ── git.log ───────────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.GIT_LOG, async (_e, req: GitLogRequest): Promise<GitLogResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return []
    }
    const limit = typeof req.limit === 'number' && req.limit > 0 ? req.limit : undefined
    return gitApi.gitLog(req.root, limit)
  })

  // ── git.commitDetail ──────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT_DETAIL, async (_e, req: GitCommitDetailRequest): Promise<GitCommitDetailResponse> => {
    if (!req?.root || typeof req.root !== 'string') return []
    if (!req?.hash || typeof req.hash !== 'string') return []
    return gitApi.gitCommitDetail(req.root, req.hash)
  })

  // ── git.fileAt ────────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.GIT_FILE_AT, async (_e, req: GitFileAtRequest): Promise<GitFileAtResponse> => {
    if (!req?.root || typeof req.root !== 'string') return { content: null, diff: null }
    if (!req?.hash || typeof req.hash !== 'string') return { content: null, diff: null }
    if (!req?.path || typeof req.path !== 'string') return { content: null, diff: null }
    return gitApi.gitFileAt(req.root, req.hash, req.path)
  })

  // ── git.workingFile ───────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.GIT_WORKING_FILE, async (_e, req: GitWorkingFileRequest): Promise<GitWorkingFileResponse> => {
    if (!req?.root || typeof req.root !== 'string') return { content: null, diff: null }
    if (!req?.path || typeof req.path !== 'string') return { content: null, diff: null }
    return gitApi.gitWorkingFile(req.root, req.path)
  })

  // ── git.commit ────────────────────────────────────────────────────────────
  // CRITICAL: root는 untrusted — isAbsolute 검증 필수. subject/body 타입 검증.

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

  // ── git.push ──────────────────────────────────────────────────────────────
  // CRITICAL: 비가역 작업 — root isAbsolute 검증. UI 확인 게이트는 renderer 책임.

  ipcMain.handle(IPC_CHANNELS.GIT_PUSH, async (_e, req: GitPushRequest): Promise<GitPushResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return { ok: false, error: 'git.push: root 경로가 필요합니다' }
    }
    if (!isAbsolute(req.root)) {
      return { ok: false, error: 'git.push: root는 절대 경로여야 합니다' }
    }
    return gitApi.gitPush(req.root)
  })

  // ── git.pull ──────────────────────────────────────────────────────────────
  // --ff-only: diverge된 브랜치는 실패 → ok:false + error.

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
