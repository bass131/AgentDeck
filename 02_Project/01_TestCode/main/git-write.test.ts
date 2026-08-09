import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

import { gitCommit, gitPush, gitPull } from '../../../02_Project/00_Source/main/02_fs/git'

function sh(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

function makeLocalRemote(label: string): { bareDir: string; workDir: string; tmpBase: string } {
  const bareDir = mkdtempSync(join(tmpdir(), `agentdeck-bare-${label}-`))
  sh('git', ['init', '--bare'], bareDir)

  const tmpBase = mkdtempSync(join(tmpdir(), `agentdeck-wbase-${label}-`))
  sh('git', ['clone', bareDir, 'work'], tmpBase)
  const workDir = join(tmpBase, 'work')

  sh('git', ['config', 'user.email', 'test@agentdeck.test'], workDir)
  sh('git', ['config', 'user.name', 'AgentDeck Test'], workDir)

  writeFileSync(join(workDir, 'init.txt'), 'initial\n')
  sh('git', ['add', 'init.txt'], workDir)
  sh('git', ['commit', '-m', 'init: initial commit'], workDir)
  const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'], workDir).trim()
  sh('git', ['push', '-u', 'origin', branch], workDir)

  return { bareDir, workDir, tmpBase }
}

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
    try { rmSync(commitTmpBase, { recursive: true, force: true }) } catch { }
    try { rmSync(commitBareDir, { recursive: true, force: true }) } catch { }
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
    const result = await gitCommit(commitWorkDir, 'chore: empty commit attempt', '')

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
    try { rmSync(pushTmpBase, { recursive: true, force: true }) } catch { }
    try { rmSync(pushBareDir, { recursive: true, force: true }) } catch { }
  })

  it('로컬 bare remote로 push → ok:true, bare repo ref 갱신', async () => {
    writeFileSync(join(pushWorkDir, 'pushed.ts'), 'export const pushed = true\n')
    sh('git', ['add', 'pushed.ts'], pushWorkDir)
    sh('git', ['commit', '-m', 'feat: pushed.ts'], pushWorkDir)

    const localHead = sh('git', ['rev-parse', 'HEAD'], pushWorkDir).trim()

    const result = await gitPush(pushWorkDir)

    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()

    const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'], pushWorkDir).trim()
    const bareHead = sh('git', ['rev-parse', branch], pushBareDir).trim()
    expect(bareHead).toBe(localHead)
  })

  it('이미 최신 상태(nothing to push) → ok:true', async () => {
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

      const result = await gitPush(isolatedDir)

      expect(result.ok).toBe(false)
      expect(typeof result.error).toBe('string')
    } finally {
      rmSync(isolatedDir, { recursive: true, force: true })
    }
  })

  it('원격 URL에 임베드된 자격증명은 push 실패 error에서 마스킹된다 (#3)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentdeck-credmask-'))
    try {
      sh('git', ['init'], dir)
      sh('git', ['config', 'user.email', 'test@agentdeck.test'], dir)
      sh('git', ['config', 'user.name', 'AgentDeck Test'], dir)
      writeFileSync(join(dir, 'a.txt'), 'a\n')
      sh('git', ['add', 'a.txt'], dir)
      sh('git', ['commit', '-m', 'init'], dir)

      sh('git', ['remote', 'add', 'origin', 'https://user:SECRETTOKEN42@127.0.0.1:9/r.git'], dir)
      const br = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'], dir).trim()
      sh('git', ['config', `branch.${br}.remote`, 'origin'], dir)
      sh('git', ['config', `branch.${br}.merge`, `refs/heads/${br}`], dir)

      const result = await gitPush(dir)

      expect(result.ok).toBe(false)
      expect(typeof result.error).toBe('string')
      expect(result.error).not.toContain('SECRETTOKEN42')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('gitPull', () => {
  let pullBareDir: string
  let pullWorkDir: string
  let pullWork2Dir: string
  let pullTmpBase: string
  let pullTmpBase2: string

  beforeAll(() => {
    const fix = makeLocalRemote('pull')
    pullBareDir = fix.bareDir
    pullWorkDir = fix.workDir
    pullTmpBase = fix.tmpBase

    pullTmpBase2 = mkdtempSync(join(tmpdir(), 'agentdeck-wbase2-pull-'))
    sh('git', ['clone', pullBareDir, 'work2'], pullTmpBase2)
    pullWork2Dir = join(pullTmpBase2, 'work2')
    sh('git', ['config', 'user.email', 'test@agentdeck.test'], pullWork2Dir)
    sh('git', ['config', 'user.name', 'AgentDeck Test'], pullWork2Dir)
  })

  afterAll(() => {
    try { rmSync(pullTmpBase, { recursive: true, force: true }) } catch { }
    try { rmSync(pullTmpBase2, { recursive: true, force: true }) } catch { }
    try { rmSync(pullBareDir, { recursive: true, force: true }) } catch { }
  })

  it('다른 클론(B)이 push한 커밋을 ff-only pull로 A에 반영한다', async () => {
    writeFileSync(join(pullWork2Dir, 'from-b.ts'), 'export const b = 99\n')
    sh('git', ['add', 'from-b.ts'], pullWork2Dir)
    sh('git', ['commit', '-m', 'feat: from B'], pullWork2Dir)
    sh('git', ['push'], pullWork2Dir)

    const bHead = sh('git', ['rev-parse', 'HEAD'], pullWork2Dir).trim()

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
    writeFileSync(join(pullWorkDir, 'a-local.ts'), 'export const alocal = 1\n')
    sh('git', ['add', 'a-local.ts'], pullWorkDir)
    sh('git', ['commit', '-m', 'feat: A local only'], pullWorkDir)

    writeFileSync(join(pullWork2Dir, 'b-remote.ts'), 'export const bremote = 2\n')
    sh('git', ['add', 'b-remote.ts'], pullWork2Dir)
    sh('git', ['commit', '-m', 'feat: B remote only'], pullWork2Dir)
    sh('git', ['push'], pullWork2Dir)

    const result = await gitPull(pullWorkDir)

    expect(result.ok).toBe(false)
    expect(typeof result.error).toBe('string')

    sh('git', ['reset', '--hard', 'HEAD~1'], pullWorkDir)
    sh('git', ['pull', '--ff-only'], pullWorkDir)
  })
})
