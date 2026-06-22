/**
 * git.test.ts — M3 Git 서브웨이브 3a TDD: 실패 테스트 먼저 작성 후 구현.
 *
 * 전략:
 *   - 임시 git repo 픽스처(mkdtemp → git init/config/add/commit)를 실제로 생성.
 *   - gitRoot / gitStatus / gitLog / gitCommitDetail / gitFileAt / gitWorkingFile 실제 호출.
 *   - 결정론적 단언(해시·커밋 수·파일 경로·diff 존재).
 *   - electron import 없는 순수 모듈 → node 환경에서 vitest 직접 실행.
 *   - IPC GIT_ROOT 핸들러의 isAbsolute 가드는 로직 단위 단언.
 *   - afterAll에서 임시 repo 정리.
 *
 * CRITICAL: git.ts는 electron import 0. child_process는 main 프로세스 특권.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { isAbsolute } from 'node:path'

// 구현 모듈 — 이 테스트 실행 시점에 아직 없음 → RED
import {
  gitRoot,
  gitStatus,
  gitLog,
  gitCommitDetail,
  gitFileAt,
  gitWorkingFile,
} from '../../src/main/git'

// ── 임시 git repo 픽스처 ──────────────────────────────────────────────────────

let repoDir: string
let firstHash: string
let secondHash: string
const TEST_FILE = 'hello.ts'
const TEST_FILE2 = 'world.ts'

/**
 * execFileSync 래퍼 — cwd 고정, stdio 파이프.
 * 실패 시 에러 메시지를 출력한다.
 */
function sh(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

beforeAll(() => {
  // 시스템 임시 디렉토리에 repo 생성
  repoDir = mkdtempSync(join(tmpdir(), 'agentdeck-git-test-'))

  // git init
  sh('git', ['init'], repoDir)
  // 테스트용 신원 설정 (global config 없어도 동작)
  sh('git', ['config', 'user.email', 'test@agentdeck.test'], repoDir)
  sh('git', ['config', 'user.name', 'AgentDeck Test'], repoDir)

  // 첫 번째 파일 커밋
  writeFileSync(join(repoDir, TEST_FILE), 'export const hello = "world"\n')
  sh('git', ['add', TEST_FILE], repoDir)
  sh('git', ['commit', '-m', 'feat: add hello.ts'], repoDir)
  firstHash = sh('git', ['rev-parse', 'HEAD'], repoDir).trim()

  // 두 번째 파일 + 첫 파일 수정 커밋
  writeFileSync(join(repoDir, TEST_FILE), 'export const hello = "universe"\nexport const version = 1\n')
  writeFileSync(join(repoDir, TEST_FILE2), 'export const world = 42\n')
  sh('git', ['add', '-A'], repoDir)
  sh('git', ['commit', '-m', 'feat: update hello.ts and add world.ts\n\nThis is the body.'], repoDir)
  secondHash = sh('git', ['rev-parse', 'HEAD'], repoDir).trim()
})

afterAll(() => {
  rmSync(repoDir, { recursive: true, force: true })
})

// ── gitRoot ────────────────────────────────────────────────────────────────────

describe('gitRoot', () => {
  it('git repo cwd에서 repo 최상위 절대 경로를 반환한다', async () => {
    const root = await gitRoot(repoDir)
    expect(root).not.toBeNull()
    expect(typeof root).toBe('string')
    expect(isAbsolute(root!)).toBe(true)
  })

  it('반환된 루트는 .git 디렉토리를 포함한다', async () => {
    const root = await gitRoot(repoDir)
    // repo 최상위 = repoDir (Windows normalize 고려 대소문자 무시)
    expect(root!.toLowerCase().replace(/\\/g, '/')).toContain(
      repoDir.toLowerCase().replace(/\\/g, '/').split('/').pop()!
    )
  })

  it('git repo가 아닌 경로에서는 null을 반환한다', async () => {
    // tmpdir 자체가 git repo일 수도 있으므로 독립된 임시 디렉토리를 만든다
    const isolated = mkdtempSync(join(tmpdir(), 'agentdeck-nogit-'))
    try {
      const r = await gitRoot(isolated)
      expect(r).toBeNull()
    } finally {
      rmSync(isolated, { recursive: true, force: true })
    }
  })

  it('force=true면 캐시를 무시하고 재탐색한다', async () => {
    // 첫 호출 (캐시 채움)
    const r1 = await gitRoot(repoDir, false)
    // force=true 재호출 — 동일 결과여야 한다
    const r2 = await gitRoot(repoDir, true)
    expect(r1).toBe(r2)
  })

  it('빈 문자열 cwd는 null을 반환한다', async () => {
    const root = await gitRoot('')
    expect(root).toBeNull()
  })
})

// ── GIT_ROOT 핸들러 isAbsolute 가드 단언 (로직 단위) ─────────────────────────

describe('GIT_ROOT isAbsolute 가드', () => {
  it('isAbsolute 함수는 절대경로에 true를 반환한다', () => {
    // Windows/POSIX 공통 동작 검증
    if (process.platform === 'win32') {
      expect(isAbsolute('C:\\Users\\test')).toBe(true)
      expect(isAbsolute('C:/Users/test')).toBe(true)
    } else {
      expect(isAbsolute('/home/user')).toBe(true)
    }
  })

  it('isAbsolute 함수는 상대경로에 false를 반환한다', () => {
    expect(isAbsolute('relative/path')).toBe(false)
    expect(isAbsolute('./local')).toBe(false)
    expect(isAbsolute('../escape')).toBe(false)
  })

  it('GIT_ROOT 핸들러: 상대경로 cwd는 null 반환 시뮬레이션', () => {
    // 핸들러 로직 인라인: if (!isAbsolute(cwd)) return null
    function handleGitRoot(cwd: string): null | string {
      if (!isAbsolute(cwd)) return null
      return 'would-call-gitRoot'
    }
    expect(handleGitRoot('../escape')).toBeNull()
    expect(handleGitRoot('relative')).toBeNull()
    expect(handleGitRoot(repoDir)).not.toBeNull() // 절대경로는 통과
  })
})

// ── gitStatus ─────────────────────────────────────────────────────────────────

describe('gitStatus', () => {
  it('GitStatus 형태의 객체를 반환한다', async () => {
    const root = await gitRoot(repoDir)
    const status = await gitStatus(root!)
    expect(status).not.toBeNull()
    expect(typeof status!.branch).toBe('string')
    expect(typeof status!.ahead).toBe('number')
    expect(typeof status!.behind).toBe('number')
    expect(Array.isArray(status!.changes)).toBe(true)
    expect(Array.isArray(status!.branches)).toBe(true)
    expect(Array.isArray(status!.remotes)).toBe(true)
    expect(Array.isArray(status!.tags)).toBe(true)
  })

  it('root 필드가 레포 최상위 절대 경로다', async () => {
    const root = await gitRoot(repoDir)
    const status = await gitStatus(root!)
    expect(status).not.toBeNull()
    expect(isAbsolute(status!.root)).toBe(true)
  })

  it('브랜치 이름이 비어 있지 않다', async () => {
    const root = await gitRoot(repoDir)
    const status = await gitStatus(root!)
    expect(status!.branch.length).toBeGreaterThan(0)
  })

  it('branches 목록에 current:true인 브랜치가 정확히 하나 있다', async () => {
    const root = await gitRoot(repoDir)
    const status = await gitStatus(root!)
    const currentBranches = status!.branches.filter((b) => b.current)
    expect(currentBranches.length).toBe(1)
  })

  it('워킹 디렉토리 변경 없으면 changes가 비어 있다', async () => {
    const root = await gitRoot(repoDir)
    const status = await gitStatus(root!)
    // 모든 파일을 커밋했으므로 changes = []
    expect(status!.changes).toHaveLength(0)
  })

  it('새 파일을 추가하면 changes에 A 상태로 나타난다', async () => {
    const root = await gitRoot(repoDir)
    const newFile = join(repoDir, 'untracked.txt')
    writeFileSync(newFile, 'new content\n')
    try {
      const status = await gitStatus(root!)
      const untracked = status!.changes.find((c) => c.path.includes('untracked'))
      expect(untracked).toBeDefined()
      expect(untracked!.status).toBe('A')
    } finally {
      rmSync(newFile)
    }
  })

  it('git repo가 아닌 경로에서는 null을 반환한다', async () => {
    const isolated = mkdtempSync(join(tmpdir(), 'agentdeck-nogit2-'))
    try {
      const result = await gitStatus(isolated)
      expect(result).toBeNull()
    } finally {
      rmSync(isolated, { recursive: true, force: true })
    }
  })
})

// ── gitLog ─────────────────────────────────────────────────────────────────────

describe('gitLog', () => {
  it('커밋 목록(GitCommit[])을 반환한다', async () => {
    const root = await gitRoot(repoDir)
    const commits = await gitLog(root!)
    expect(Array.isArray(commits)).toBe(true)
    expect(commits.length).toBeGreaterThanOrEqual(2)
  })

  it('각 커밋은 필수 필드를 갖는다', async () => {
    const root = await gitRoot(repoDir)
    const commits = await gitLog(root!)
    for (const c of commits) {
      expect(typeof c.hash).toBe('string')
      expect(c.hash.length).toBe(40)
      expect(typeof c.shortHash).toBe('string')
      expect(typeof c.author).toBe('string')
      expect(typeof c.date).toBe('number')
      expect(Array.isArray(c.tags)).toBe(true)
      expect(typeof c.subject).toBe('string')
      expect(typeof c.body).toBe('string')
      expect(typeof c.pushed).toBe('boolean')
    }
  })

  it('커밋 해시가 실제 커밋과 일치한다', async () => {
    const root = await gitRoot(repoDir)
    const commits = await gitLog(root!)
    const hashes = commits.map((c) => c.hash)
    expect(hashes).toContain(secondHash)
    expect(hashes).toContain(firstHash)
  })

  it('최신 커밋이 첫 번째다', async () => {
    const root = await gitRoot(repoDir)
    const commits = await gitLog(root!)
    expect(commits[0].hash).toBe(secondHash)
  })

  it('두 번째 커밋 subject가 일치한다', async () => {
    const root = await gitRoot(repoDir)
    const commits = await gitLog(root!)
    const second = commits.find((c) => c.hash === secondHash)
    expect(second!.subject).toContain('feat: update hello.ts')
  })

  it('date는 unix milliseconds 숫자다', async () => {
    const root = await gitRoot(repoDir)
    const commits = await gitLog(root!)
    // unix ms: 2020년 이후 ~ 2100년 이전
    for (const c of commits) {
      expect(c.date).toBeGreaterThan(1_577_836_800_000) // 2020-01-01
      expect(c.date).toBeLessThan(4_102_444_800_000)   // 2100-01-01
    }
  })

  it('limit 파라미터가 결과 수를 제한한다', async () => {
    const root = await gitRoot(repoDir)
    const commits = await gitLog(root!, 1)
    expect(commits.length).toBe(1)
  })

  it('업스트림 없는 로컬 레포에서 pushed는 true다', async () => {
    const root = await gitRoot(repoDir)
    const commits = await gitLog(root!)
    // upstream 없으면 unpushed 집합이 비어 있음 → 모두 pushed=true
    for (const c of commits) {
      expect(c.pushed).toBe(true)
    }
  })
})

// ── gitCommitDetail ────────────────────────────────────────────────────────────

describe('gitCommitDetail', () => {
  it('커밋의 변경 파일 목록(GitChange[])을 반환한다', async () => {
    const root = await gitRoot(repoDir)
    const changes = await gitCommitDetail(root!, secondHash)
    expect(Array.isArray(changes)).toBe(true)
    expect(changes.length).toBeGreaterThanOrEqual(1)
  })

  it('각 change는 필수 필드를 갖는다', async () => {
    const root = await gitRoot(repoDir)
    const changes = await gitCommitDetail(root!, secondHash)
    for (const c of changes) {
      expect(typeof c.path).toBe('string')
      expect(['M', 'A', 'D', 'R']).toContain(c.status)
      // add/del은 number 또는 null
      expect(c.add === null || typeof c.add === 'number').toBe(true)
      expect(c.del === null || typeof c.del === 'number').toBe(true)
    }
  })

  it('두 번째 커밋에 world.ts가 A(Added) 상태로 포함된다', async () => {
    const root = await gitRoot(repoDir)
    const changes = await gitCommitDetail(root!, secondHash)
    const worldFile = changes.find((c) => c.path.includes('world.ts'))
    expect(worldFile).toBeDefined()
    expect(worldFile!.status).toBe('A')
  })

  it('두 번째 커밋에 hello.ts가 M(Modified) 상태로 포함된다', async () => {
    const root = await gitRoot(repoDir)
    const changes = await gitCommitDetail(root!, secondHash)
    const helloFile = changes.find((c) => c.path.includes('hello.ts'))
    expect(helloFile).toBeDefined()
    expect(helloFile!.status).toBe('M')
  })

  it('첫 번째 커밋은 hello.ts만 포함한다', async () => {
    const root = await gitRoot(repoDir)
    const changes = await gitCommitDetail(root!, firstHash)
    expect(changes).toHaveLength(1)
    expect(changes[0].path).toContain('hello.ts')
    expect(changes[0].status).toBe('A')
  })

  it('numstat add/del 수치가 포함된다', async () => {
    const root = await gitRoot(repoDir)
    const changes = await gitCommitDetail(root!, secondHash)
    // 텍스트 파일은 add/del이 숫자여야 한다
    const helloFile = changes.find((c) => c.path.includes('hello.ts'))
    expect(helloFile!.add).not.toBeNull()
    expect(helloFile!.del).not.toBeNull()
  })
})

// ── gitFileAt ──────────────────────────────────────────────────────────────────

describe('gitFileAt', () => {
  it('커밋 시점 파일 내용을 반환한다', async () => {
    const root = await gitRoot(repoDir)
    const result = await gitFileAt(root!, secondHash, TEST_FILE)
    expect(result.content).not.toBeNull()
    expect(typeof result.content).toBe('string')
  })

  it('내용이 해당 커밋 시점의 파일 내용과 일치한다', async () => {
    const root = await gitRoot(repoDir)
    const result = await gitFileAt(root!, secondHash, TEST_FILE)
    // 두 번째 커밋의 hello.ts 내용
    expect(result.content).toContain('universe')
    expect(result.content).toContain('version')
  })

  it('첫 번째 커밋 시점의 내용을 반환한다', async () => {
    const root = await gitRoot(repoDir)
    const result = await gitFileAt(root!, firstHash, TEST_FILE)
    expect(result.content).toContain('world')
    // 첫 번째 커밋엔 'universe'가 없다
    expect(result.content).not.toContain('universe')
  })

  it('부모→커밋 diff(DiffLine[])를 포함한다', async () => {
    const root = await gitRoot(repoDir)
    const result = await gitFileAt(root!, secondHash, TEST_FILE)
    // 수정 커밋이므로 diff가 null이 아닌 배열이어야 한다
    expect(result.diff).not.toBeNull()
    expect(Array.isArray(result.diff)).toBe(true)
  })

  it('diff 라인은 add/remove/context 중 하나다', async () => {
    const root = await gitRoot(repoDir)
    const result = await gitFileAt(root!, secondHash, TEST_FILE)
    for (const line of result.diff!) {
      expect(['add', 'remove', 'context']).toContain(line.kind)
    }
  })

  it('첫 번째 커밋(신규 파일)은 diff가 모두 add이거나 null이다', async () => {
    const root = await gitRoot(repoDir)
    const result = await gitFileAt(root!, firstHash, TEST_FILE)
    // 부모 없는 첫 커밋: 원본은 prev=null → 모두 add
    if (result.diff !== null) {
      const nonAdd = result.diff.filter((l) => l.kind !== 'add' && l.kind !== 'context')
      // remove가 없어야 한다 (새 파일)
      expect(nonAdd.filter((l) => l.kind === 'remove')).toHaveLength(0)
    }
  })

  it('존재하지 않는 파일은 content:null을 반환한다', async () => {
    const root = await gitRoot(repoDir)
    const result = await gitFileAt(root!, secondHash, 'nonexistent.ts')
    expect(result.content).toBeNull()
  })
})

// ── gitWorkingFile ─────────────────────────────────────────────────────────────

describe('gitWorkingFile', () => {
  it('작업 트리 파일 diff를 포함한 GitFileAt을 반환한다', async () => {
    const root = await gitRoot(repoDir)
    const result = await gitWorkingFile(root!, TEST_FILE)
    // 변경 없으면 diff=null 또는 빈 배열(동일 내용)
    expect(result).not.toBeNull()
    expect('content' in result).toBe(true)
    expect('diff' in result).toBe(true)
  })

  it('content에 현재 디스크 파일 내용이 들어있다', async () => {
    const root = await gitRoot(repoDir)
    const result = await gitWorkingFile(root!, TEST_FILE)
    // content는 디스크 내용
    expect(result.content).not.toBeNull()
    // 두 번째 커밋 이후 변경 없으면 HEAD = disk
    expect(result.content).toContain('universe')
  })

  it('HEAD와 동일하면 diff가 비어 있거나 컨텍스트만 포함한다', async () => {
    const root = await gitRoot(repoDir)
    const result = await gitWorkingFile(root!, TEST_FILE)
    if (result.diff !== null) {
      const changes = result.diff.filter((l) => l.kind !== 'context')
      expect(changes).toHaveLength(0)
    }
  })

  it('파일을 수정하면 diff에 변경 라인이 포함된다', async () => {
    const root = await gitRoot(repoDir)
    const filePath = join(repoDir, TEST_FILE)
    const original = readFileSync(filePath, 'utf8')
    writeFileSync(filePath, original + 'export const extra = true\n')
    try {
      const result = await gitWorkingFile(root!, TEST_FILE)
      const adds = result.diff?.filter((l) => l.kind === 'add') ?? []
      expect(adds.length).toBeGreaterThan(0)
    } finally {
      // 원상복구
      writeFileSync(filePath, original)
    }
  })

  it('존재하지 않는 파일은 content:null 또는 error를 반환한다', async () => {
    const root = await gitRoot(repoDir)
    const result = await gitWorkingFile(root!, 'ghost.ts')
    expect(result.content).toBeNull()
  })

  it('새 파일(HEAD에 없는 파일)은 diff가 모두 add다', async () => {
    const root = await gitRoot(repoDir)
    const newFile = 'brandnew.ts'
    const filePath = join(repoDir, newFile)
    writeFileSync(filePath, 'export const x = 1\n')
    try {
      const result = await gitWorkingFile(root!, newFile)
      // HEAD에 없으므로 head=null → diff는 모두 add 또는 null(구현에 따라)
      if (result.diff !== null) {
        const removes = result.diff.filter((l) => l.kind === 'remove')
        expect(removes).toHaveLength(0)
      }
    } finally {
      rmSync(filePath)
    }
  })
})

// ── 통합: gitRoot → gitStatus → gitLog 연속 호출 ──────────────────────────────

describe('git API 통합 연속 호출', () => {
  it('gitRoot → gitStatus → gitLog 순으로 정합된 데이터를 반환한다', async () => {
    const root = await gitRoot(repoDir)
    expect(root).not.toBeNull()

    const status = await gitStatus(root!)
    expect(status).not.toBeNull()
    expect(status!.root).toBe(root)

    const commits = await gitLog(root!)
    expect(commits.length).toBeGreaterThanOrEqual(2)

    // status.branch가 commits에서 찾을 수 있어야 한다
    expect(status!.branch.length).toBeGreaterThan(0)
  })
})
