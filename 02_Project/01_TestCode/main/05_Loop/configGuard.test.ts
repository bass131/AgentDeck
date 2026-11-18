// M09 G2 검수 차단 1 — 실행기 git(자격 있음)이 세션이 심은 설정 코드를 돌리지 않는다.
// 열 때 git 설정 스냅숏과 전역 설정 파일 해시를 앱 영역에 적고, 실행기의 모든 git 호출 직전에 대조해 다르면 멈춘다.
// 비교군: 대조가 없는 실물 git 포트는 심은 filter.clean을 실제로 돌린다(표지 파일이 생긴다).
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createConfigGuard, executorGitEnv, type ConfigGuard } from '@main/05_Loop/configGuard'
import { createGitPort } from '@main/05_Loop/realPorts/gitPort'
import { makeTempRepos, type TempRepos } from '../00_Helpers/tempGit'

let repos: TempRepos
let snapshotFile: string
let hooksPath: string

beforeEach(() => {
  repos = makeTempRepos('agentdeck-g2-guard-')
  snapshotFile = path.join(repos.root, 'app', 'git-config', 'k.json')
  hooksPath = path.join(repos.root, 'app', 'no-hooks')
})
afterEach(() => { repos.cleanup() })

async function open(): Promise<ConfigGuard> {
  const r = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })
  if (!r.ok) throw new Error(r.reason)
  return r.guard
}

const write = (rel: string, text: string): void => {
  const full = path.join(repos.work, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, text)
}

// 세션이 심는 filter — git add 때 돌며 표지 파일을 남긴다. 경로는 슬래시로 적는다(Git for Windows의 sh가 읽는다).
function plantFilter(marker: string): void {
  repos.git(['config', 'filter.x.clean', `sh -c 'echo ran > "${marker.replace(/\\/g, '/')}"; cat'`])
  write('.gitattributes', '* filter=x\n')
  write('a.txt', 'a\n')
}

describe('실행기 git 설정 대조', () => {
  it('바뀌지 않았으면 null이고, 스냅숏을 앱 영역에 적는다', async () => {
    const guard = await open()
    expect(await guard.check()).toBeNull()
    await expect(guard.assert()).resolves.toBeUndefined()
    const snap = JSON.parse(fs.readFileSync(snapshotFile, 'utf8')) as { entries: string[]; files: Record<string, string> }
    expect(snap.entries.some((e) => e.includes('user.name'))).toBe(true)
    expect(Object.keys(snap.files)).toContain(path.resolve(repos.env.GIT_CONFIG_GLOBAL as string))
  })

  it('비교군 — 대조 없는 실물 git 포트는 세션이 심은 filter.clean을 돌린다', async () => {
    const marker = path.join(repos.root, 'filter-ran')
    plantFilter(marker)
    const plain = createGitPort({ cwd: repos.work, env: repos.env })
    await plain.commitAll('심은 필터')
    expect(fs.existsSync(marker)).toBe(true)
  })

  it('로컬 filter.clean을 심으면 대조가 멈추고, 대조를 단 git 포트는 그 호출을 돌리지 않는다', async () => {
    const guard = await open()
    const git = createGitPort({ cwd: repos.work, env: repos.env, guard })
    const marker = path.join(repos.root, 'filter-ran')
    plantFilter(marker)
    expect(await guard.check()).toContain('filter.x.clean')
    await expect(git.commitAll('심은 필터')).rejects.toThrow(/filter\.x\.clean/)
    await expect(git.hasChanges()).rejects.toThrow()
    await expect(git.diffStat('master')).resolves.toBeNull()
    expect(fs.existsSync(marker)).toBe(false)
  })

  it('core.fsmonitor를 심으면 멈추고, 되돌려도 멈춘 채다(메모리 래치)', async () => {
    const guard = await open()
    repos.git(['config', 'core.fsmonitor', 'sh -c "echo x"'])
    expect(await guard.check()).toContain('core.fsmonitor')
    repos.git(['config', '--unset', 'core.fsmonitor'])
    expect(await guard.check()).toContain('core.fsmonitor')
  })

  it('전역 설정 파일에 credential.helper를 쓰면 멈춘다(저장소 밖)', async () => {
    const guard = await open()
    fs.appendFileSync(repos.env.GIT_CONFIG_GLOBAL as string, '[credential]\n\thelper = "!f(){ cat >> leak; }; f"\n')
    const reason = await guard.check()
    expect(reason).toContain('credential.helper')
    expect(reason).toContain('실행기 밖에서 바뀌었다')
  })

  it('전역 설정의 값이 아닌 곳(주석)만 바뀌어도 파일 해시로 멈춘다', async () => {
    const guard = await open()
    fs.appendFileSync(repos.env.GIT_CONFIG_GLOBAL as string, '# 주석\n')
    expect(await guard.check()).toContain(path.resolve(repos.env.GIT_CONFIG_GLOBAL as string))
  })

  it('실행기 hooksPath에 무엇이 생기면 멈춘다', async () => {
    const guard = await open()
    fs.mkdirSync(hooksPath, { recursive: true })
    expect(await guard.check()).toBeNull()
    fs.writeFileSync(path.join(hooksPath, 'pre-push'), '#!/bin/sh\n')
    expect(await guard.check()).toContain('hooksPath')
  })

  it('브랜치 추적 키(branch.*.remote·merge)는 명령을 실행하지 않아 대조에서 뺀다', async () => {
    const guard = await open()
    repos.git(['config', 'branch.feature.remote', 'origin'])
    repos.git(['config', 'branch.feature.merge', 'refs/heads/feature'])
    // gh가 기본 저장소를 고를 때 쓰는 키도 명령을 실행하지 않는다
    repos.git(['config', 'remote.origin.gh-resolved', 'base'])
    expect(await guard.check()).toBeNull()
    // 같은 remote 절이라도 원격 주소는 뺄 수 없다
    repos.git(['config', 'remote.origin.pushurl', 'https://example.invalid/x.git'])
    expect(await guard.check()).toContain('remote.origin.pushurl')
  })

  it('지난 실행이 적은 스냅숏과 다르면 열지 않고, 사람이 그 파일을 지우면 다시 연다', async () => {
    await open()
    repos.git(['config', 'core.pager', 'less'])
    const again = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })
    expect(again.ok).toBe(false)
    expect(!again.ok && again.reason).toContain('core.pager')
    expect(!again.ok && again.reason).toContain(snapshotFile)
    fs.rmSync(snapshotFile)
    expect((await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })).ok).toBe(true)
  })
})

describe('실행기 git 환경', () => {
  it('묻는 창을 띄우지 않는다 — GIT_TERMINAL_PROMPT=0, GCM_INTERACTIVE=never', () => {
    const env = executorGitEnv({ PATH: 'x', GIT_TERMINAL_PROMPT: '1' })
    expect(env.GIT_TERMINAL_PROMPT).toBe('0')
    expect(env.GCM_INTERACTIVE).toBe('never')
    expect(env.PATH).toBe('x')
  })
})

describe('git 포트는 모든 호출 직전에 대조한다', () => {
  it('대조가 던지면 git을 부르지 않는다 — 메서드마다', async () => {
    let calls = 0
    let fail = false
    const guard = { assert: async () => { calls++; if (fail) throw new Error('바뀌었다') } }
    const git = createGitPort({ cwd: repos.work, env: repos.env, guard })
    await git.hasChanges()
    await git.headSha('master')
    expect(calls).toBeGreaterThanOrEqual(2)
    fail = true
    for (const run of [
      () => git.branchExists('x'), () => git.createBranch('x', 'master'), () => git.checkout('master'), () => git.hasChanges(),
      () => git.commitAll('m'), () => git.push('master'), () => git.syncToRemote('master'), () => git.remoteSha('master'),
      () => git.parents('HEAD'), () => git.mergeNoFf('HEAD', 'm'), () => git.isAncestor('HEAD', 'master'),
    ]) await expect(run()).rejects.toThrow('바뀌었다')
    await expect(git.headSha('master')).rejects.toThrow('바뀌었다')
    expect(repos.git(['branch', '--list', 'x'])).toBe('')
  })
})
