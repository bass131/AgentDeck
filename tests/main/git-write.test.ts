/**
 * git-write.test.ts — M3 Git 서브웨이브 3b TDD: write 3함수 테스트 (RED → GREEN).
 *
 * 전략:
 *   - 로컬 bare remote를 픽스처로 사용 — 실제 네트워크/origin 절대 금지.
 *     bare repo: git init --bare (refs만 있는 서버 역할)
 *     work repo: git clone <bare path> (일반 작업 디렉토리)
 *   - gitCommit / gitPush / gitPull 실제 호출 (electron import 0 유지).
 *   - 각 describe 블록이 독립 픽스처를 사용해 테스트 순서 의존성을 제거한다.
 *   - afterAll에서 임시 디렉토리 정리.
 *
 * CRITICAL:
 *   - 실제 네트워크/원격 push 없음 — 로컬 bare 경로만 사용.
 *   - bare repo 경로 = 로컬 절대경로 (file:// 없이도 git이 직접 인식).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

// 구현 모듈 — 3b write 함수 + 백로그#3 자격증명 마스킹
import { gitCommit, gitPush, gitPull } from '../../src/main/git'

// ── 헬퍼 ────────────────────────────────────────────────────────────────────────

/**
 * execFileSync 래퍼 — cwd 고정, stdio 파이프.
 * 실패 시 에러 스택이 포함된 메시지를 출력한다.
 */
function sh(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

/**
 * 로컬 bare + work 클론 한 쌍을 초기 커밋 + push 완료 상태로 생성한다.
 * Returns { bareDir, workDir, tmpBase }
 * 주의: tmpBase 및 bareDir 은 호출자가 afterAll에서 직접 정리해야 한다.
 */
function makeLocalRemote(label: string): { bareDir: string; workDir: string; tmpBase: string } {
  const bareDir = mkdtempSync(join(tmpdir(), `agentdeck-bare-${label}-`))
  sh('git', ['init', '--bare'], bareDir)

  const tmpBase = mkdtempSync(join(tmpdir(), `agentdeck-wbase-${label}-`))
  sh('git', ['clone', bareDir, 'work'], tmpBase)
  const workDir = join(tmpBase, 'work')

  sh('git', ['config', 'user.email', 'test@agentdeck.test'], workDir)
  sh('git', ['config', 'user.name', 'AgentDeck Test'], workDir)

  // 초기 커밋 + push — bare가 비어 있으면 첫 push는 -u 필요
  writeFileSync(join(workDir, 'init.txt'), 'initial\n')
  sh('git', ['add', 'init.txt'], workDir)
  sh('git', ['commit', '-m', 'init: initial commit'], workDir)
  const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'], workDir).trim()
  sh('git', ['push', '-u', 'origin', branch], workDir)

  return { bareDir, workDir, tmpBase }
}

// ── gitCommit ──────────────────────────────────────────────────────────────────

describe('gitCommit', () => {
  let commitWorkDir: string
  let commitTmpBase: string
  let commitBareDir: string

  beforeAll(() => {
    const fix = makeLocalRemote('commit')
    commitBareDir = fix.bareDir
    commitWorkDir = fix.workDir
    commitTmpBase = fix.tmpBase
  })

  afterAll(() => {
    try { rmSync(commitTmpBase, { recursive: true, force: true }) } catch { /* 무시 */ }
    try { rmSync(commitBareDir, { recursive: true, force: true }) } catch { /* 무시 */ }
  })

  it('파일 수정 후 gitCommit → ok:true, log에 새 커밋이 나타난다', async () => {
    writeFileSync(join(commitWorkDir, 'feature.ts'), 'export const a = 1\n')

    const result = await gitCommit(commitWorkDir, 'feat: add feature.ts', '')

    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()

    const log = sh('git', ['log', '--oneline', '-1'], commitWorkDir)
    expect(log).toContain('feat: add feature.ts')
  })

  it('subject + body가 모두 커밋 메시지에 기록된다', async () => {
    writeFileSync(join(commitWorkDir, 'withbody.ts'), 'export const b = 2\n')

    const result = await gitCommit(commitWorkDir, 'feat: with body', 'This is the body line.')

    expect(result.ok).toBe(true)

    const fullMsg = sh('git', ['log', '--format=%B', '-1'], commitWorkDir)
    expect(fullMsg).toContain('feat: with body')
    expect(fullMsg).toContain('This is the body line.')
  })

  it('body가 비어 있어도 정상 커밋된다', async () => {
    writeFileSync(join(commitWorkDir, 'nobody.ts'), 'export const c = 3\n')

    const result = await gitCommit(commitWorkDir, 'chore: nobody commit', '')

    expect(result.ok).toBe(true)
  })

  it('변경 없을 때(nothing to commit) ok:false + error 문자열을 반환한다', async () => {
    // 이전 테스트들에서 모든 변경이 커밋됨 → 작업트리 클린 상태
    const result = await gitCommit(commitWorkDir, 'chore: empty commit attempt', '')

    // git commit "nothing to commit" → exit code 1 → ok:false (단언 강화: ok===false)
    expect(result.ok).toBe(false)
    expect(typeof result.error).toBe('string')
  })

  it('git repo가 아닌 경로에서 gitCommit → ok:false + error 문자열', async () => {
    const isolated = mkdtempSync(join(tmpdir(), 'agentdeck-nogit-write-'))
    try {
      const result = await gitCommit(isolated, 'test', '')
      expect(result.ok).toBe(false)
      expect(typeof result.error).toBe('string')
    } finally {
      rmSync(isolated, { recursive: true, force: true })
    }
  })
})

// ── gitPush ────────────────────────────────────────────────────────────────────

describe('gitPush', () => {
  let pushBareDir: string
  let pushWorkDir: string
  let pushTmpBase: string

  beforeAll(() => {
    const fix = makeLocalRemote('push')
    pushBareDir = fix.bareDir
    pushWorkDir = fix.workDir
    pushTmpBase = fix.tmpBase
  })

  afterAll(() => {
    try { rmSync(pushTmpBase, { recursive: true, force: true }) } catch { /* 무시 */ }
    try { rmSync(pushBareDir, { recursive: true, force: true }) } catch { /* 무시 */ }
  })

  it('로컬 bare remote로 push → ok:true, bare repo ref 갱신', async () => {
    // 새 커밋 추가 (아직 push 안 된 상태)
    writeFileSync(join(pushWorkDir, 'pushed.ts'), 'export const pushed = true\n')
    sh('git', ['add', 'pushed.ts'], pushWorkDir)
    sh('git', ['commit', '-m', 'feat: pushed.ts'], pushWorkDir)

    const localHead = sh('git', ['rev-parse', 'HEAD'], pushWorkDir).trim()

    const result = await gitPush(pushWorkDir)

    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()

    // bare repo의 ref가 갱신되었는지 확인
    const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'], pushWorkDir).trim()
    const bareHead = sh('git', ['rev-parse', branch], pushBareDir).trim()
    expect(bareHead).toBe(localHead)
  })

  it('이미 최신 상태(nothing to push) → ok:true', async () => {
    // 추가 커밋 없이 재push
    const result = await gitPush(pushWorkDir)
    expect(result.ok).toBe(true)
  })

  it('upstream 미설정 레포에서 gitPush → ok:false + error 메시지', async () => {
    const isolatedDir = mkdtempSync(join(tmpdir(), 'agentdeck-noremote-'))
    try {
      sh('git', ['init'], isolatedDir)
      sh('git', ['config', 'user.email', 'test@agentdeck.test'], isolatedDir)
      sh('git', ['config', 'user.name', 'AgentDeck Test'], isolatedDir)
      writeFileSync(join(isolatedDir, 'a.txt'), 'a\n')
      sh('git', ['add', 'a.txt'], isolatedDir)
      sh('git', ['commit', '-m', 'init'], isolatedDir)

      // remote 없음 → push 실패, -u origin <branch>도 실패
      const result = await gitPush(isolatedDir)

      expect(result.ok).toBe(false)
      expect(typeof result.error).toBe('string')
    } finally {
      rmSync(isolatedDir, { recursive: true, force: true })
    }
  })

  it('원격 URL에 임베드된 자격증명은 push 실패 error에서 마스킹된다 (#3)', async () => {
    // 자격증명을 URL에 임베드한 origin + 닫힌 포트(127.0.0.1:9)로 push 실패를 유도.
    // git의 "fatal: unable to access '<url>'" stderr에 토큰이 그대로 노출되는 것을 막는지 검증.
    const dir = mkdtempSync(join(tmpdir(), 'agentdeck-credmask-'))
    try {
      sh('git', ['init'], dir)
      sh('git', ['config', 'user.email', 'test@agentdeck.test'], dir)
      sh('git', ['config', 'user.name', 'AgentDeck Test'], dir)
      writeFileSync(join(dir, 'a.txt'), 'a\n')
      sh('git', ['add', 'a.txt'], dir)
      sh('git', ['commit', '-m', 'init'], dir)

      // origin: 자격증명 임베드 + 닫힌 포트 → 연결 거부(빠른 실패)
      sh('git', ['remote', 'add', 'origin', 'https://user:SECRETTOKEN42@127.0.0.1:9/r.git'], dir)
      // upstream config 설정(실제 push 없이 config만) — push(인자 없음)이 origin으로 향하게
      const br = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'], dir).trim()
      sh('git', ['config', `branch.${br}.remote`, 'origin'], dir)
      sh('git', ['config', `branch.${br}.merge`, `refs/heads/${br}`], dir)

      const result = await gitPush(dir)

      expect(result.ok).toBe(false)
      expect(typeof result.error).toBe('string')
      // 핵심: 토큰이 error 메시지에 평문 노출되지 않아야 한다
      expect(result.error).not.toContain('SECRETTOKEN42')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── gitPull ────────────────────────────────────────────────────────────────────

describe('gitPull', () => {
  /**
   * pull 픽스처는 work(A) + work2(B) 두 클론을 사용한다.
   * B가 push한 커밋을 A가 pull하는 시나리오.
   * 각 테스트는 고유 파일명을 사용해 충돌을 방지한다.
   */
  let pullBareDir: string
  let pullWorkDir: string   // 클라이언트 A — gitPull을 검증
  let pullWork2Dir: string  // 클라이언트 B — push 전담
  let pullTmpBase: string
  let pullTmpBase2: string

  beforeAll(() => {
    // A 픽스처 (기본 초기 커밋 포함)
    const fix = makeLocalRemote('pull')
    pullBareDir = fix.bareDir
    pullWorkDir = fix.workDir
    pullTmpBase = fix.tmpBase

    // B 클론: 같은 bare를 origin으로 클론
    pullTmpBase2 = mkdtempSync(join(tmpdir(), 'agentdeck-wbase2-pull-'))
    sh('git', ['clone', pullBareDir, 'work2'], pullTmpBase2)
    pullWork2Dir = join(pullTmpBase2, 'work2')
    sh('git', ['config', 'user.email', 'test@agentdeck.test'], pullWork2Dir)
    sh('git', ['config', 'user.name', 'AgentDeck Test'], pullWork2Dir)
  })

  afterAll(() => {
    try { rmSync(pullTmpBase, { recursive: true, force: true }) } catch { /* 무시 */ }
    try { rmSync(pullTmpBase2, { recursive: true, force: true }) } catch { /* 무시 */ }
    try { rmSync(pullBareDir, { recursive: true, force: true }) } catch { /* 무시 */ }
  })

  it('다른 클론(B)이 push한 커밋을 ff-only pull로 A에 반영한다', async () => {
    // B에서 새 커밋 push
    writeFileSync(join(pullWork2Dir, 'from-b.ts'), 'export const b = 99\n')
    sh('git', ['add', 'from-b.ts'], pullWork2Dir)
    sh('git', ['commit', '-m', 'feat: from B'], pullWork2Dir)
    sh('git', ['push'], pullWork2Dir)

    const bHead = sh('git', ['rev-parse', 'HEAD'], pullWork2Dir).trim()

    // A에서 pull
    const result = await gitPull(pullWorkDir)

    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()

    const aHead = sh('git', ['rev-parse', 'HEAD'], pullWorkDir).trim()
    expect(aHead).toBe(bHead)
  })

  it('이미 최신 상태(already up-to-date) → ok:true', async () => {
    const result = await gitPull(pullWorkDir)
    expect(result.ok).toBe(true)
  })

  it('ff-only 불가 상황(분기된 커밋) → ok:false + error 메시지', async () => {
    // A에서 로컬 커밋 (push 안 함)
    writeFileSync(join(pullWorkDir, 'a-local.ts'), 'export const alocal = 1\n')
    sh('git', ['add', 'a-local.ts'], pullWorkDir)
    sh('git', ['commit', '-m', 'feat: A local only'], pullWorkDir)

    // B에서도 다른 커밋 push — A와 분기 발생
    writeFileSync(join(pullWork2Dir, 'b-remote.ts'), 'export const bremote = 2\n')
    sh('git', ['add', 'b-remote.ts'], pullWork2Dir)
    sh('git', ['commit', '-m', 'feat: B remote only'], pullWork2Dir)
    sh('git', ['push'], pullWork2Dir)

    // A에서 --ff-only pull → 분기로 실패해야 함
    const result = await gitPull(pullWorkDir)

    expect(result.ok).toBe(false)
    expect(typeof result.error).toBe('string')

    // 정리: A의 로컬 커밋을 되돌리고 재동기화 (이후 테스트 영향 방지)
    sh('git', ['reset', '--hard', 'HEAD~1'], pullWorkDir)
    sh('git', ['pull', '--ff-only'], pullWorkDir)
  })
})
