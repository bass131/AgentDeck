/**
 * git-contract.test.ts — M3 Git 서브웨이브 3a TDD: 실패 → 통과 순서.
 *
 * electron 의존 없이 순수 계약(타입+상수)만 검증 → node 환경 OK.
 * preload는 Electron contextBridge 의존이므로 노출 형태 단언은 타입 레벨 컴파일 검사.
 */

import { describe, it, expect } from 'vitest'
import { IPC_CHANNELS } from '../../../02.Source/shared/ipc-contract'
import type {
  GitFileStatus,
  GitChange,
  GitStatus,
  GitCommit,
  GitFileAt,
  GitOpResult,
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
  DiffLine,
} from '../../../02.Source/shared/ipc-contract'

// ── 9채널 존재 + 문자열 정합 ────────────────────────────────────────────────

describe('git IPC_CHANNELS 9채널', () => {
  it('GIT_ROOT 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.GIT_ROOT).toBe('git.root')
  })

  it('GIT_STATUS 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.GIT_STATUS).toBe('git.status')
  })

  it('GIT_LOG 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.GIT_LOG).toBe('git.log')
  })

  it('GIT_COMMIT_DETAIL 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.GIT_COMMIT_DETAIL).toBe('git.commitDetail')
  })

  it('GIT_FILE_AT 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.GIT_FILE_AT).toBe('git.fileAt')
  })

  it('GIT_WORKING_FILE 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.GIT_WORKING_FILE).toBe('git.workingFile')
  })

  it('GIT_COMMIT 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.GIT_COMMIT).toBe('git.commit')
  })

  it('GIT_PUSH 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.GIT_PUSH).toBe('git.push')
  })

  it('GIT_PULL 채널이 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.GIT_PULL).toBe('git.pull')
  })

  it('git 9채널 모두 전체 채널 목록에 포함된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(values).toContain('git.root')
    expect(values).toContain('git.status')
    expect(values).toContain('git.log')
    expect(values).toContain('git.commitDetail')
    expect(values).toContain('git.fileAt')
    expect(values).toContain('git.workingFile')
    expect(values).toContain('git.commit')
    expect(values).toContain('git.push')
    expect(values).toContain('git.pull')
  })

  it('git 채널 추가 후에도 전체 채널명이 유니크하다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('git 채널명이 dot-namespaced camelCase 규칙을 따른다', () => {
    const gitChannels = [
      IPC_CHANNELS.GIT_ROOT,
      IPC_CHANNELS.GIT_STATUS,
      IPC_CHANNELS.GIT_LOG,
      IPC_CHANNELS.GIT_COMMIT_DETAIL,
      IPC_CHANNELS.GIT_FILE_AT,
      IPC_CHANNELS.GIT_WORKING_FILE,
      IPC_CHANNELS.GIT_COMMIT,
      IPC_CHANNELS.GIT_PUSH,
      IPC_CHANNELS.GIT_PULL,
    ]
    for (const ch of gitChannels) {
      expect(ch).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/)
    }
  })
})

// ── 공유 타입 구조 단언 (컴파일+런타임) ─────────────────────────────────────

describe('GitFileStatus 타입', () => {
  it('4가지 상태 값을 타입으로 받아들인다 (런타임 샘플)', () => {
    // GitFileStatus = 'M' | 'A' | 'D' | 'R'
    const statuses: GitFileStatus[] = ['M', 'A', 'D', 'R']
    expect(statuses).toHaveLength(4)
  })
})

describe('GitChange 구조', () => {
  it('필수 필드를 가진 GitChange 객체를 생성할 수 있다', () => {
    const change: GitChange = {
      path: '02.Source/main/index.ts',
      status: 'M',
      add: 10,
      del: 3,
    }
    expect(change.path).toBe('02.Source/main/index.ts')
    expect(change.status).toBe('M')
    expect(change.add).toBe(10)
    expect(change.del).toBe(3)
  })

  it('바이너리 파일의 add/del은 null이 될 수 있다', () => {
    const change: GitChange = {
      path: 'assets/image.png',
      status: 'A',
      add: null,
      del: null,
    }
    expect(change.add).toBeNull()
    expect(change.del).toBeNull()
  })
})

describe('GitStatus 구조', () => {
  it('필수 필드를 가진 GitStatus 객체를 생성할 수 있다', () => {
    const status: GitStatus = {
      root: '/home/user/project',
      branch: 'main',
      ahead: 0,
      behind: 0,
      changes: [],
      branches: [{ name: 'main', current: true }],
      remotes: ['origin'],
      tags: ['v1.0.0'],
    }
    expect(status.root).toBe('/home/user/project')
    expect(status.branch).toBe('main')
    expect(status.ahead).toBe(0)
    expect(status.behind).toBe(0)
    expect(status.branches[0].current).toBe(true)
    // repoName 필드 없음 — renderer가 root basename에서 파생
    expect('repoName' in status).toBe(false)
  })
})

describe('GitCommit 구조', () => {
  it('필수 필드를 가진 GitCommit 객체를 생성할 수 있다', () => {
    const commit: GitCommit = {
      hash: 'abc123def456abc123def456abc123def456abc1',
      shortHash: 'abc123d',
      subject: 'feat: add git IPC contract',
      body: 'Detailed description',
      author: 'Dev User',
      date: 1700000000000,
      tags: [],
      pushed: true,
    }
    expect(commit.hash).toHaveLength(40)
    expect(commit.shortHash).toHaveLength(7)
    expect(typeof commit.date).toBe('number') // unix ms
    expect(Array.isArray(commit.tags)).toBe(true)
    expect(typeof commit.pushed).toBe('boolean')
  })
})

describe('GitFileAt 구조', () => {
  it('content + diff(DiffLine[]) + 선택적 error를 갖는다', () => {
    // diff 타입 = DiffLine[] (우리 기존 fs.diff shape 재사용)
    const diffLines: DiffLine[] = [
      { kind: 'context', content: 'unchanged line' },
      { kind: 'add', content: '+ new line', lineNew: 5 },
      { kind: 'remove', content: '- old line', lineOld: 4 },
    ]
    const fileAt: GitFileAt = {
      content: 'file content here',
      diff: diffLines,
    }
    expect(fileAt.content).toBe('file content here')
    expect(Array.isArray(fileAt.diff)).toBe(true)
    expect(fileAt.diff![0].kind).toBe('context')
    expect(fileAt.error).toBeUndefined()
  })

  it('바이너리/삭제 파일은 content/diff가 null이다', () => {
    const fileAt: GitFileAt = {
      content: null,
      diff: null,
      error: '바이너리 파일',
    }
    expect(fileAt.content).toBeNull()
    expect(fileAt.diff).toBeNull()
    expect(fileAt.error).toBe('바이너리 파일')
  })
})

describe('GitOpResult 구조', () => {
  it('성공 케이스: ok=true, error 미정의', () => {
    const result: GitOpResult = { ok: true }
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('실패 케이스: ok=false, error 문자열', () => {
    const result: GitOpResult = { ok: false, error: 'push rejected' }
    expect(result.ok).toBe(false)
    expect(result.error).toBe('push rejected')
  })
})

// ── Request/Response 타입 형태 단언 ─────────────────────────────────────────

describe('git 채널 Request/Response 타입', () => {
  it('GitRootRequest — cwd 필수, force 선택', () => {
    const req: GitRootRequest = { cwd: '/home/user/project' }
    expect(req.cwd).toBeDefined()
    const reqWithForce: GitRootRequest = { cwd: '/home/user/project', force: true }
    expect(reqWithForce.force).toBe(true)
  })

  it('GitRootResponse — string|null', () => {
    const res1: GitRootResponse = '/home/user/project'
    const res2: GitRootResponse = null
    expect(typeof res1 === 'string' || res1 === null).toBe(true)
    expect(res2).toBeNull()
  })

  it('GitStatusRequest — root 문자열', () => {
    const req: GitStatusRequest = { root: '/home/user/project' }
    expect(req.root).toBe('/home/user/project')
  })

  it('GitStatusResponse — GitStatus|null', () => {
    const res: GitStatusResponse = null
    expect(res).toBeNull()
  })

  it('GitLogRequest — root 필수, limit 선택', () => {
    const req: GitLogRequest = { root: '/home/user/project' }
    expect(req.root).toBeDefined()
    const reqWithLimit: GitLogRequest = { root: '/home/user/project', limit: 50 }
    expect(reqWithLimit.limit).toBe(50)
  })

  it('GitLogResponse — GitCommit[]', () => {
    const res: GitLogResponse = []
    expect(Array.isArray(res)).toBe(true)
  })

  it('GitCommitDetailRequest — root + hash', () => {
    const req: GitCommitDetailRequest = { root: '/home/user/project', hash: 'abc123' }
    expect(req.hash).toBe('abc123')
  })

  it('GitCommitDetailResponse — GitChange[]', () => {
    const res: GitCommitDetailResponse = []
    expect(Array.isArray(res)).toBe(true)
  })

  it('GitFileAtRequest — root + hash + path', () => {
    const req: GitFileAtRequest = {
      root: '/home/user/project',
      hash: 'abc123',
      path: 'src/index.ts',
    }
    expect(req.path).toBe('src/index.ts')
  })

  it('GitFileAtResponse — GitFileAt 형태', () => {
    const res: GitFileAtResponse = { content: null, diff: null }
    expect(res.content).toBeNull()
  })

  it('GitWorkingFileRequest — root + path', () => {
    const req: GitWorkingFileRequest = {
      root: '/home/user/project',
      path: 'src/index.ts',
    }
    expect(req.path).toBeDefined()
  })

  it('GitWorkingFileResponse — GitFileAt 형태', () => {
    const res: GitWorkingFileResponse = { content: 'hello', diff: null }
    expect(res.content).toBe('hello')
  })

  it('GitCommitRequest — root + subject + body', () => {
    const req: GitCommitRequest = {
      root: '/home/user/project',
      subject: 'feat: add feature',
      body: '',
    }
    expect(req.subject).toBeDefined()
  })

  it('GitCommitResponse — GitOpResult 형태', () => {
    const res: GitCommitResponse = { ok: true }
    expect(res.ok).toBe(true)
  })

  it('GitPushRequest — root 문자열', () => {
    const req: GitPushRequest = { root: '/home/user/project' }
    expect(req.root).toBeDefined()
  })

  it('GitPushResponse — GitOpResult 형태', () => {
    const res: GitPushResponse = { ok: false, error: 'rejected' }
    expect(res.ok).toBe(false)
  })

  it('GitPullRequest — root 문자열', () => {
    const req: GitPullRequest = { root: '/home/user/project' }
    expect(req.root).toBeDefined()
  })

  it('GitPullResponse — GitOpResult 형태', () => {
    const res: GitPullResponse = { ok: true }
    expect(res.ok).toBe(true)
  })
})

// ── DiffLine 재사용 확인 (GitFileAt.diff = DiffLine[]) ──────────────────────

describe('GitFileAt.diff — DiffLine[] 재사용', () => {
  it('DiffLine kind는 add|remove|context 이며 GitFileAt.diff에 사용된다', () => {
    const lines: DiffLine[] = [
      { kind: 'add', content: 'new', lineNew: 1 },
      { kind: 'remove', content: 'old', lineOld: 1 },
      { kind: 'context', content: 'ctx' },
    ]
    const fileAt: GitFileAt = { content: 'text', diff: lines }
    expect(fileAt.diff).toHaveLength(3)
    expect(fileAt.diff![0].kind).toBe('add')
    expect(fileAt.diff![1].kind).toBe('remove')
    expect(fileAt.diff![2].kind).toBe('context')
  })
})
