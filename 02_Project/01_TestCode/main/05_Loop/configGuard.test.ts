// M09 G2 검수 차단 1 — 실행기 git(자격 있음)이 세션이 심은 설정 코드를 돌리지 않는다.
// 열 때 git 설정 스냅숏과 전역 설정 파일 해시를 앱 영역에 적고, 실행기의 모든 git 호출 직전에 대조해 다르면 멈춘다.
// 비교군: 대조가 없는 실물 git 포트는 심은 filter.clean을 실제로 돌린다(표지 파일이 생긴다).
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createConfigGuard, executorGitEnv, type ConfigGuard } from '@main/05_Loop/configGuard'
import { runProcess, type ProcessResult } from '@main/05_Loop/realPorts/exec'
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
    expect(await guard.check()).toBeNull()
    // 같은 remote 절이라도 원격 주소는 뺄 수 없다
    repos.git(['config', 'remote.origin.pushurl', 'https://example.invalid/x.git'])
    expect(await guard.check()).toContain('remote.origin.pushurl')
  })

  // G2 재검수 중요 B — gh는 remote.<이름>.gh-resolved로 기본 저장소를 고른다(실측: octocat/Hello-World를 넣으면 gh pr list가 그 저장소를
  // 읽는다). 실행기 gh는 -R로 저장소를 고정하지만, 키 자체도 대조한다.
  it('remote.*.gh-resolved도 대조한다 — 실행기 gh를 다른 저장소로 돌리는 키다', async () => {
    const guard = await open()
    repos.git(['config', 'remote.origin.gh-resolved', 'octocat/Hello-World'])
    expect(await guard.check()).toContain('remote.origin.gh-resolved')
  })

  // G2 재검수 중요 D — 스냅숏을 지우고 다시 열면 심은 설정이 새 기준선이 됐다. 이제 위험 키는 기준선과 관계없이 열기를 거부한다.
  it('지난 스냅숏과 다르면 열지 않고 안내는 「그 키를 지운 뒤 다시 연다」다 — 되돌리면 다시 열린다', async () => {
    await open()
    repos.git(['config', 'user.name', 'Someone Else'])
    const again = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })
    expect(again.ok).toBe(false)
    expect(!again.ok && again.reason).toContain('user.name')
    expect(!again.ok && again.reason).toContain('그 키를 지운')
    repos.git(['config', 'user.name', 'Loop Test'])
    expect((await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })).ok).toBe(true)
  })

  // M09 G4 — 사람의 「확인하고 풀기」. 열기 거부는 바뀐 키 목록을 구조로 돌려주고, 그 목록과 정확히 같은 차이만 새 기준선으로 받는다.
  it('지난 스냅숏과의 차이를 목록으로 돌려주고, 사람이 그 목록을 받으면 새 기준선으로 연다 — 목록이 다르면 여전히 거부한다', async () => {
    await open()
    repos.git(['config', 'user.name', 'Someone Else'])
    const refused = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })
    const seen = !refused.ok ? refused.changed ?? [] : []
    // G4 검수 차단 B1 — 목록은 키 이름에 값(옛 값 → 새 값)과 출처 파일을 함께 보인다
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatch(/^user\.name: "Loop Test" .*→ "Someone Else"/)
    expect(seen[0]).toContain(path.join('.git', 'config').replace(/\\/g, '/'))
    const wrong = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath, acceptChanged: ['user.name'] })
    expect(wrong.ok).toBe(false)
    const accepted = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath, acceptChanged: seen })
    expect(accepted.ok).toBe(true)
    // 새 기준선이 적혔다 — 받기 없이 다시 열어도 열린다
    expect((await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })).ok).toBe(true)
  })

  // G4 검수 차단 B1 — 받기는 사람이 본 값에 묶인다. 본 뒤 값이 또 바뀌면 같은 키라도 받지 않는다
  it('사람이 본 뒤 값이 바뀌면 받지 않는다 — 새로 본 목록으로만 받는다', async () => {
    await open()
    repos.git(['config', 'user.name', 'Someone Else'])
    const first = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })
    const seen = !first.ok ? first.changed ?? [] : []
    repos.git(['config', 'user.name', 'Third Person'])
    expect((await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath, acceptChanged: seen })).ok).toBe(false)
    const second = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })
    const now = !second.ok ? second.changed ?? [] : []
    expect(now).not.toEqual(seen)
    expect((await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath, acceptChanged: now })).ok).toBe(true)
  })

  // G4 검수 차단 B1 — 프로브 guard.ts의 꼴. 전역 설정에 심은 위험 키는 풀기로 받지 않는다(무해한 전역 키는 받는다, 전역 파일 경로를 보인다)
  it('전역 설정 파일에 credential.helper·core.sshCommand를 심으면 풀기가 거부된다 — 무해한 전역 키 변경은 파일 경로와 함께 받는다', async () => {
    const globalCfg = repos.env.GIT_CONFIG_GLOBAL as string
    const guard = await open()
    fs.appendFileSync(globalCfg, '[credential]\n\thelper = "!f() { echo pwned >&2; }; f"\n[core]\n\tsshCommand = evil-ssh\n')
    expect(await guard.check()).toContain('credential.helper')
    const seen = guard.changes()
    expect(seen.some((c) => c.startsWith('credential.helper:'))).toBe(true)
    expect(seen.some((c) => c.includes(path.resolve(globalCfg)))).toBe(true)
    const refused = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath, acceptChanged: seen })
    expect(refused.ok).toBe(false)
    expect(!refused.ok && refused.reason).toContain('credential.helper')
    expect(!refused.ok && refused.reason).toContain('core.sshcommand')
    // 받을 수 없는 차이는 받기 목록으로 주지 않는다(화면이 풀기 카드를 보이지 않는다)
    expect(!refused.ok && refused.changed).toBeUndefined()
    // 사람이 직접 되돌리고 무해한 전역 키만 바꾸면 받는다
    fs.writeFileSync(globalCfg, '[user]\n\temail = other@example.invalid\n')
    const plain = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })
    const plainSeen = !plain.ok ? plain.changed ?? [] : []
    expect(plainSeen.some((c) => c.includes(path.resolve(globalCfg)))).toBe(true)
    expect((await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath, acceptChanged: plainSeen })).ok).toBe(true)
  })

  it('보이는 값은 자격을 가리고, 가렸거나 긴 값은 전체 값의 해시를 붙인다', async () => {
    await open()
    repos.git(['config', 'user.name', 'https://someone:s3cret@example.invalid/'])
    const r = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })
    const seen = !r.ok ? r.changed ?? [] : []
    expect(seen.join('\n')).not.toContain('s3cret')
    expect(seen[0]).toMatch(/\(sha256 [0-9a-f]{12}\)/)
  })

  it('remote.*.url·pushurl 변경은 풀기로 받지 않는다', async () => {
    await open()
    repos.git(['config', 'remote.origin.url', 'https://example.invalid/other.git'])
    const r = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toContain('remote.origin.url')
    expect(!r.ok && r.changed).toBeUndefined()
    // pushurl은 로컬 위험 키라 받기 이전에 거부된다
    repos.git(['config', 'remote.origin.pushurl', 'https://example.invalid/other.git'])
    const p = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })
    expect(!p.ok && p.reason).toContain('remote.origin.pushurl')
    expect(!p.ok && p.changed).toBeUndefined()
  })

  // G4 확인 검수 — 프로브 guard2.ts의 꼴. 실행기 git의 작업 위치(core.worktree·bare)나 원격 요청(http.extraHeader·cookieFile·proxy)을
  // 바꾸는 키는 remote url처럼 풀기로 받지 않는다 — 받기 목록을 주지 않고, 열린 실행기가 본 목록으로 받으려 해도 거부한다
  describe('작업 위치·원격 요청을 바꾸는 키는 풀기로 받지 않는다', () => {
    const toSlash = (p: string): string => p.replace(/\\/g, '/')
    const cases: [string, string, () => void][] = [
      ['로컬 core.worktree', 'core.worktree', () => { repos.git(['config', 'core.worktree', toSlash(repos.work)]) }],
      ['전역 core.bare', 'core.bare', () => { fs.appendFileSync(repos.env.GIT_CONFIG_GLOBAL as string, '[core]\n\tbare = false\n') }],
      ['전역 http.extraHeader', 'http.extraheader', () => { fs.appendFileSync(repos.env.GIT_CONFIG_GLOBAL as string, '[http]\n\textraHeader = X-Probe: y\n') }],
      ['전역 http.<주소>.extraHeader', 'http.https://github.com/.extraheader', () => {
        fs.appendFileSync(repos.env.GIT_CONFIG_GLOBAL as string, '[http "https://github.com/"]\n\textraHeader = Authorization: Bearer x\n')
      }],
      ['전역 http.cookieFile', 'http.cookiefile', () => { fs.appendFileSync(repos.env.GIT_CONFIG_GLOBAL as string, '[http]\n\tcookieFile = C:/probe-cookies\n') }],
      ['로컬 http.<주소>.cookieFile', 'http.https://github.com/.cookiefile', () => { repos.git(['config', 'http.https://github.com/.cookieFile', 'C:/probe-cookies']) }],
      ['전역 http.proxy', 'http.proxy', () => { fs.appendFileSync(repos.env.GIT_CONFIG_GLOBAL as string, '[http]\n\tproxy = http://127.0.0.1:9\n') }],
      ['전역 http.<주소>.proxy', 'http.https://github.com/.proxy', () => {
        fs.appendFileSync(repos.env.GIT_CONFIG_GLOBAL as string, '[http "https://github.com/"]\n\tproxy = http://127.0.0.1:9\n')
      }],
    ]
    for (const [name, key, plantKey] of cases) {
      it(`${name} — 받기 목록을 주지 않고, 열린 뒤 본 목록으로 받으려 해도 거부한다`, async () => {
        const guard = await open()
        plantKey()
        expect(await guard.check()).toContain(key)
        const seen = guard.changes()
        expect(seen.some((c) => c.startsWith(`${key}:`))).toBe(true)
        const offered = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })
        expect(offered.ok).toBe(false)
        expect(!offered.ok && offered.reason).toContain(key)
        expect(!offered.ok && offered.reason).toContain('작업 위치나 원격 요청')
        expect(!offered.ok && offered.reason).toContain('사람이 직접 되돌린 뒤 다시 연다')
        expect(!offered.ok && offered.changed).toBeUndefined()
        const accepted = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath, acceptChanged: seen })
        expect(accepted.ok).toBe(false)
      })
    }
  })

  it('받기 목록이 있어도 위험 키는 여전히 거부한다', async () => {
    await open()
    repos.git(['config', 'core.pager', 'less'])
    const r = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath, acceptChanged: ['core.pager'] })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toContain('core.pager')
    expect(!r.ok && r.changed).toBeUndefined()
  })

  it('열린 뒤 바뀐 키 목록을 changes()로 읽는다(래치를 푸는 화면이 보인다)', async () => {
    const guard = await open()
    expect(guard.changes()).toEqual([])
    repos.git(['config', 'user.name', 'Someone Else'])
    expect(await guard.check()).toContain('user.name')
    expect(guard.changes()).toHaveLength(1)
    expect(guard.changes()[0]).toMatch(/^user\.name: "Loop Test" .*→ "Someone Else"/)
  })

  it('위험 키가 로컬 설정에 있으면 스냅숏이 없어도, 스냅숏을 지워도 열지 않는다 — 그 키를 지우면 열린다', async () => {
    await open()
    repos.git(['config', 'core.pager', 'less'])
    fs.rmSync(snapshotFile)
    const again = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })
    expect(again.ok).toBe(false)
    expect(!again.ok && again.reason).toContain('core.pager')
    expect(!again.ok && again.reason).toContain('그 키를 지운 뒤 다시 연다')
    // 거부는 스냅숏을 새로 적지 않는다(심은 설정이 기준선이 되지 않는다)
    expect(fs.existsSync(snapshotFile)).toBe(false)
    repos.git(['config', '--unset', 'core.pager'])
    expect((await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })).ok).toBe(true)
  })

  const DANGER: [string, string][] = [
    ['core.fsmonitor', 'sh -c "echo x"'],
    ['filter.x.clean', 'cat'],
    ['filter.x.process', 'x'],
    ['diff.x.textconv', 'cat'],
    ['diff.external', 'x'],
    ['merge.x.driver', 'x %O %A %B'],
    ['credential.helper', 'store'],
    ['credential.https://github.com.helper', 'store'],
    ['core.sshCommand', 'ssh -i x'],
    ['core.askPass', 'x'],
    ['core.gitProxy', 'x'],
    ['core.hooksPath', '.husky'],
    ['core.pager', 'less'],
    ['core.editor', 'vim'],
    ['sequence.editor', 'x'],
    ['pager.log', 'x'],
    ['gpg.program', 'x'],
    ['gpg.ssh.program', 'x'],
    ['commit.gpgSign', 'true'],
    ['remote.origin.uploadpack', 'x'],
    ['remote.origin.receivepack', 'x'],
    ['remote.origin.vcs', 'x'],
    ['url.ext::sh -c x.insteadOf', 'https://github.com/'],
    ['protocol.ext.allow', 'always'],
    ['core.alternateRefsCommand', 'x'],
    ['include.path', 'nothing.cfg'],
    ['includeIf.onbranch:main.path', 'nothing.cfg'],
    // G2 3차 검수 사소 — 네트워크로 자격이 새는 키(프록시·인증서 검증 끄기·다른 CA·다른 push 주소)
    ['http.proxy', 'http://evil.invalid:8080'],
    ['http.sslVerify', 'false'],
    ['http.sslCAInfo', 'evil.pem'],
    ['http.sslCAPath', 'evil-ca'],
    ['http.https://github.com/.proxy', 'http://evil.invalid:8080'],
    ['http.https://github.com/.sslVerify', 'false'],
    ['http.https://github.com/.sslCAInfo', 'evil.pem'],
    ['remote.origin.pushurl', 'https://evil.invalid/x.git'],
    ['remote.origin.proxy', 'http://evil.invalid:8080'],
  ]
  for (const [key, value] of DANGER) {
    it(`위험 키 ${key} — 처음 여는 것도 거부한다`, async () => {
      repos.git(['config', key, value])
      const r = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })
      expect(r.ok).toBe(false)
      expect(!r.ok && r.reason).toContain(key.toLowerCase())
      expect(fs.existsSync(snapshotFile)).toBe(false)
    })
  }

  it('include로 들어온 위험 키도 거부한다(그 파일 이름과 함께)', async () => {
    const extra = path.join(repos.root, 'extra.cfg')
    fs.writeFileSync(extra, '[filter "y"]\n\tclean = evil\n')
    repos.git(['config', 'include.path', extra.replace(/\\/g, '/')])
    const r = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toContain('filter.y.clean')
  })

  it('명령이 아닌 값은 거부하지 않는다 — core.fsmonitor 참·거짓, 표준 git-lfs 필터, commit.gpgSign=false', async () => {
    repos.git(['config', 'core.fsmonitor', 'false'])
    repos.git(['config', 'filter.lfs.clean', 'git-lfs clean -- %f'])
    repos.git(['config', 'filter.lfs.smudge', 'git-lfs smudge -- %f'])
    repos.git(['config', 'filter.lfs.process', 'git-lfs filter-process'])
    repos.git(['config', 'filter.lfs.required', 'true'])
    repos.git(['config', 'http.sslVerify', 'true'])
    repos.git(['config', 'http.proxy', ''])
    repos.git(['config', 'remote.origin.proxy', ''])
    expect((await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })).ok).toBe(true)
  })

  // G2 3차 검수 — origin이 ssh면 실행기 git의 ssh가 ~/.ssh/config(ProxyCommand·Match exec)를 자격과 함께 읽는다.
  // 실행기 환경의 GIT_SSH_COMMAND는 고정하지 않는다(사용자 IdentityFile 등이 깨진다). 대신 그 파일과 Include를 해시로 대조한다.
  describe('ssh 설정 대조', () => {
    let home: string
    let env: NodeJS.ProcessEnv
    beforeEach(() => {
      home = path.join(repos.root, 'home')
      fs.mkdirSync(path.join(home, '.ssh'), { recursive: true })
      env = { ...repos.env, HOME: home, USERPROFILE: home }
    })
    const openWith = async (): Promise<ConfigGuard> => {
      const r = await createConfigGuard({ cwd: repos.work, env, snapshotFile, hooksPath })
      if (!r.ok) throw new Error(r.reason)
      return r.guard
    }

    it('~/.ssh/config가 바뀌면 멈춘다 — 없던 파일이 생겨도 멈춘다', async () => {
      const guard = await openWith()
      expect(await guard.check()).toBeNull()
      const snap = JSON.parse(fs.readFileSync(snapshotFile, 'utf8')) as { files: Record<string, string> }
      expect(snap.files[path.resolve(home, '.ssh', 'config')]).toBe('absent')
      fs.writeFileSync(path.join(home, '.ssh', 'config'), 'Host *\n  ProxyCommand sh -c "cat >> leak"\n')
      expect(await guard.check()).toContain(path.join(home, '.ssh', 'config'))
    })

    it('Include가 가리키는 파일(상대·~·와일드카드)이 바뀌거나 새로 생겨도 멈춘다', async () => {
      fs.writeFileSync(path.join(home, '.ssh', 'config'), 'Include extra.conf\nHost x\n  Include "~/.ssh/conf.d/*.conf"\n')
      fs.writeFileSync(path.join(home, '.ssh', 'extra.conf'), 'Host y\n')
      fs.mkdirSync(path.join(home, '.ssh', 'conf.d'))
      const g1 = await openWith()
      fs.appendFileSync(path.join(home, '.ssh', 'extra.conf'), '  Match exec "sh -c x"\n')
      expect(await g1.check()).toContain('extra.conf')
      fs.rmSync(snapshotFile)
      fs.writeFileSync(path.join(home, '.ssh', 'extra.conf'), 'Host y\n')
      const g2 = await openWith()
      fs.writeFileSync(path.join(home, '.ssh', 'conf.d', 'evil.conf'), 'Host *\n  ProxyCommand x\n')
      expect(await g2.check()).toContain('conf.d')
    })

    it('와일드카드에 맞는 폴더는 건너뛰고(읽지 못한 파일로 보지 않는다), ${변수}·%d를 펼친 Include도 따라간다', async () => {
      const extra = path.join(repos.root, 'sshx')
      fs.mkdirSync(extra)
      fs.writeFileSync(path.join(extra, 'x.conf'), 'Host z\n')
      fs.mkdirSync(path.join(home, '.ssh', 'conf.d', 'sub.conf'), { recursive: true })
      fs.writeFileSync(path.join(home, '.ssh', 'config'), 'Include conf.d/*\nInclude ${SSHX}/x.conf\nInclude %d/.ssh/d.conf\n')
      env = { ...env, SSHX: extra.replace(/\\/g, '/') }
      const guard = await openWith()
      const snap = JSON.parse(fs.readFileSync(snapshotFile, 'utf8')) as { files: Record<string, string> }
      expect(Object.values(snap.files).some((h) => h.startsWith('unreadable:'))).toBe(false)
      expect(snap.files[path.resolve(home, '.ssh', 'd.conf')]).toBe('absent')
      expect(await guard.check()).toBeNull()
      fs.appendFileSync(path.join(extra, 'x.conf'), '  ProxyCommand x\n')
      expect(await guard.check()).toContain('x.conf')
    })

    // G4 검수 차단 B1 — ssh 설정 파일의 변경은 풀기로 받지 않는다. 사람이 직접 되돌린다
    it('ssh 설정 파일이 바뀌었으면 풀기로 받지 않고 직접 되돌리라고 한다', async () => {
      const guard = await openWith()
      fs.writeFileSync(path.join(home, '.ssh', 'config'), 'Host *\n  ProxyCommand sh -c "cat >> leak"\n')
      expect(await guard.check()).toContain('config')
      const r = await createConfigGuard({ cwd: repos.work, env, snapshotFile, hooksPath, acceptChanged: guard.changes() })
      expect(r.ok).toBe(false)
      expect(!r.ok && r.reason).toContain('직접 되돌')
      expect(!r.ok && r.reason).toContain(path.join(home, '.ssh', 'config'))
      expect(!r.ok && r.changed).toBeUndefined()
    })
  })

  // G2 4차 검수 — 실행기 gh는 사용자 gh 설정 폴더를 그대로 쓴다. config.yml의 http_unix_socket이면 gh가 인증 머리를 평문으로
  // 그 소켓에 보낸다(검수자 실측). 그 폴더의 config.yml·hosts.yml을 해시로 대조하고, 열 때 소켓이 정해져 있으면 거부한다.
  describe('gh 설정 대조', () => {
    let ghDir: string
    let env: NodeJS.ProcessEnv
    beforeEach(() => {
      ghDir = path.join(repos.root, 'gh-config')
      fs.mkdirSync(ghDir, { recursive: true })
      env = { ...repos.env, GH_CONFIG_DIR: ghDir }
    })

    it('열린 뒤 config.yml에 http_unix_socket을 심으면 멈추고, hosts.yml이 바뀌어도 멈춘다', async () => {
      const r = await createConfigGuard({ cwd: repos.work, env, snapshotFile, hooksPath })
      if (!r.ok) throw new Error(r.reason)
      const snap = JSON.parse(fs.readFileSync(snapshotFile, 'utf8')) as { files: Record<string, string> }
      expect(snap.files[path.resolve(ghDir, 'config.yml')]).toBe('absent')
      expect(snap.files[path.resolve(ghDir, 'hosts.yml')]).toBe('absent')
      expect(await r.guard.check()).toBeNull()
      fs.writeFileSync(path.join(ghDir, 'config.yml'), 'http_unix_socket: /tmp/evil.sock\n')
      expect(await r.guard.check()).toContain('config.yml')
      const r2 = await createConfigGuard({ cwd: repos.work, env, snapshotFile: `${snapshotFile}.2`, hooksPath })
      expect(r2.ok).toBe(false)
      fs.rmSync(path.join(ghDir, 'config.yml'))
      const r3 = await createConfigGuard({ cwd: repos.work, env, snapshotFile: `${snapshotFile}.3`, hooksPath })
      if (!r3.ok) throw new Error(r3.reason)
      fs.writeFileSync(path.join(ghDir, 'hosts.yml'), 'github.com:\n  user: x\n')
      expect(await r3.guard.check()).toContain('hosts.yml')
    })

    it('열 때 실행기 gh가 읽을 config.yml에 http_unix_socket이 있으면 열지 않는다 — 빈 값은 연다', async () => {
      fs.writeFileSync(path.join(ghDir, 'config.yml'), 'git_protocol: https\nhttp_unix_socket: "/tmp/evil.sock"\n')
      const refused = await createConfigGuard({ cwd: repos.work, env, snapshotFile, hooksPath })
      expect(refused.ok).toBe(false)
      expect(!refused.ok && refused.reason).toContain('http_unix_socket')
      expect(fs.existsSync(snapshotFile)).toBe(false)
      fs.writeFileSync(path.join(ghDir, 'config.yml'), 'git_protocol: https\nhttp_unix_socket: ""\n')
      expect((await createConfigGuard({ cwd: repos.work, env, snapshotFile, hooksPath })).ok).toBe(true)
    })

    it('GH_CONFIG_DIR가 없으면 XDG_CONFIG_HOME/gh, Windows는 %APPDATA%\\GitHub CLI를 본다', async () => {
      const xdg = path.join(repos.root, 'xdg')
      fs.mkdirSync(path.join(xdg, 'gh'), { recursive: true })
      fs.writeFileSync(path.join(xdg, 'gh', 'config.yml'), 'http_unix_socket: /tmp/evil.sock\n')
      const noDir: NodeJS.ProcessEnv = { ...repos.env, XDG_CONFIG_HOME: xdg, APPDATA: path.join(repos.root, 'appdata') }
      delete noDir.GH_CONFIG_DIR
      const r = await createConfigGuard({ cwd: repos.work, env: noDir, snapshotFile, hooksPath })
      expect(r.ok).toBe(false)
      fs.rmSync(path.join(xdg, 'gh', 'config.yml'))
      const ok = await createConfigGuard({ cwd: repos.work, env: noDir, snapshotFile, hooksPath })
      if (!ok.ok) throw new Error(ok.reason)
      const snap = JSON.parse(fs.readFileSync(snapshotFile, 'utf8')) as { files: Record<string, string> }
      expect(Object.keys(snap.files)).toContain(path.resolve(xdg, 'gh', 'hosts.yml'))
      if (process.platform === 'win32') expect(Object.keys(snap.files)).toContain(path.resolve(repos.root, 'appdata', 'GitHub CLI', 'config.yml'))
    })

    // G4 검수 차단 B1 — gh config.yml·hosts.yml의 변경은 풀기로 받지 않는다. 사람이 직접 되돌린다
    it('gh hosts.yml이 바뀌었으면 풀기로 받지 않고 직접 되돌리라고 한다', async () => {
      const r = await createConfigGuard({ cwd: repos.work, env, snapshotFile, hooksPath })
      if (!r.ok) throw new Error(r.reason)
      fs.writeFileSync(path.join(ghDir, 'hosts.yml'), 'github.com:\n  user: x\n')
      expect(await r.guard.check()).toContain('hosts.yml')
      const again = await createConfigGuard({ cwd: repos.work, env, snapshotFile, hooksPath, acceptChanged: r.guard.changes() })
      expect(again.ok).toBe(false)
      expect(!again.ok && again.reason).toContain('직접 되돌')
      expect(!again.ok && again.reason).toContain('hosts.yml')
    })
  })

  // G2 3차 검수 사소 — .git/info/grafts는 GIT_NO_REPLACE_OBJECTS로 꺼지지 않는다(실측). 있으면 열지 않고, 열린 뒤 생기면 멈춘다.
  it('grafts 파일이 있으면 열지 않고, 열린 뒤 생기면 실행기 git을 돌리지 않는다', async () => {
    const grafts = path.join(repos.work, '.git', 'info', 'grafts')
    fs.mkdirSync(path.dirname(grafts), { recursive: true })
    fs.writeFileSync(grafts, `${repos.git(['rev-parse', 'HEAD'])}\n`)
    const refused = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })
    expect(refused.ok).toBe(false)
    expect(!refused.ok && refused.reason).toContain('grafts')
    fs.rmSync(grafts)
    const guard = await open()
    const git = createGitPort({ cwd: repos.work, env: repos.env, guard })
    fs.writeFileSync(grafts, `${repos.git(['rev-parse', 'HEAD'])}\n`)
    expect(await guard.check()).toContain('grafts')
    await expect(git.headSha('master')).rejects.toThrow(/grafts/)
    // 지워도 멈춘 채다(메모리 래치)
    fs.rmSync(grafts)
    expect(await guard.check()).toContain('grafts')
  })

  // 이 기계처럼 전역·시스템에 credential.helper·filter.lfs·core.pager가 있는 것은 정상이다 — 로컬(·include)만 본다
  it('전역 설정의 위험 키는 열기를 막지 않는다(사용자 자신의 설정)', async () => {
    fs.appendFileSync(repos.env.GIT_CONFIG_GLOBAL as string,
      '[credential]\n\thelper = manager\n[filter "lfs"]\n\tclean = git-lfs clean -- %f\n[core]\n\tpager = less\n\teditor = code --wait\n')
    expect((await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath })).ok).toBe(true)
  })
})

// G2 재검수 사소 — 설정 읽기 한 번의 일시 실패(시간 초과·EBUSY)로 곧바로 래치하지 않는다. 바뀐 값은 다시 읽지 않고 바로 멈춘다.
describe('설정 다시 읽기의 일시 실패', () => {
  // 열 때는 그대로 읽고, arm() 뒤의 git 호출부터 failures번 시간 초과로 실패한다
  function flaky(failures: number): { run: (args: string[]) => Promise<ProcessResult>; arm: () => void; failed: () => number } {
    let left = failures
    let failed = 0
    let armed = false
    return {
      run: async (args) => {
        if (armed && left > 0) { left--; failed++; return { code: 124, stdout: '', stderr: '시간 제한을 넘었다', timedOut: true } }
        return runProcess('git', args, { cwd: repos.work, env: repos.env, timeoutMs: 30_000 })
      },
      arm: () => { armed = true },
      failed: () => failed,
    }
  }

  it('한 번 실패하면 짧게 다시 읽고, 같으면 멈추지 않는다', async () => {
    const f = flaky(1)
    const r = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath, runGit: f.run, retryDelayMs: 1 })
    if (!r.ok) throw new Error(r.reason)
    f.arm()
    expect(await r.guard.check()).toBeNull()
    expect(f.failed()).toBe(1)
  })

  it('다시 읽어도 계속 실패하면 멈춘다', async () => {
    const f = flaky(100)
    const r = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath, runGit: f.run, retryDelayMs: 1 })
    if (!r.ok) throw new Error(r.reason)
    f.arm()
    expect(await r.guard.check()).toContain('다시 읽지 못했다')
  })

  it('바뀐 값은 다시 읽어 기다리지 않고 바로 멈춘다', async () => {
    const f = flaky(0)
    const r = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath, runGit: f.run, retryDelayMs: 10_000 })
    if (!r.ok) throw new Error(r.reason)
    repos.git(['config', 'user.name', 'X'])
    const t0 = Date.now()
    expect(await r.guard.check()).toContain('user.name')
    expect(Date.now() - t0).toBeLessThan(5_000)
  })
})

describe('실행기 git 환경', () => {
  it('묻는 창을 띄우지 않는다 — GIT_TERMINAL_PROMPT=0, GCM_INTERACTIVE=never', () => {
    const env = executorGitEnv({ PATH: 'x', GIT_TERMINAL_PROMPT: '1' })
    expect(env.GIT_TERMINAL_PROMPT).toBe('0')
    expect(env.GCM_INTERACTIVE).toBe('never')
    expect(env.PATH).toBe('x')
  })

  it('교체 객체를 따르지 않는다 — GIT_NO_REPLACE_OBJECTS=1 (G2 재검수 차단 A)', () => {
    expect(executorGitEnv({ GIT_NO_REPLACE_OBJECTS: '' }).GIT_NO_REPLACE_OBJECTS).toBe('1')
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
      () => git.verifyMerge('HEAD', 'master', 'master'),
    ]) await expect(run()).rejects.toThrow('바뀌었다')
    await expect(git.headSha('master')).rejects.toThrow('바뀌었다')
    expect(repos.git(['branch', '--list', 'x'])).toBe('')
  })
})

describe('실행기 환경과 설정 대조의 남은 틈 (M11 G3)', () => {
  it('[M11-G3 M09-4] 실행기 환경의 PATH에서 사용자가 쓸 수 있는 폴더(%APPDATA%\\npm 등)를 뺀다', () => {
    const user = 'C:\\Users\\u'
    const npm = `${user}\\AppData\\Roaming\\npm`
    const env = executorGitEnv({ PATH: ['C:\\Windows\\system32', 'C:\\Program Files\\Git\\cmd', npm].join(';'), APPDATA: `${user}\\AppData\\Roaming`, USERPROFILE: user })
    const parts = (env.PATH ?? '').split(';')
    expect(parts).toContain('C:\\Windows\\system32')
    expect(parts).not.toContain(npm)
    // Windows 환경은 키가 Path일 수 있다 — 그 키를 고치고 PATH를 따로 만들지 않는다. 대소문자·끝 역슬래시·LOCALAPPDATA·HOME도 본다
    const win = executorGitEnv({
      Path: ['C:\\Program Files\\GitHub CLI', 'c:\\users\\U\\appdata\\local\\Microsoft\\WindowsApps\\', 'D:\\home\\bin', 'C:\\Users\\uu\\bin'].join(';'),
      LOCALAPPDATA: `${user}\\AppData\\Local`, USERPROFILE: user, HOME: 'D:\\home',
    })
    expect(win.PATH).toBeUndefined()
    expect(win.Path).toBe('C:\\Program Files\\GitHub CLI;C:\\Users\\uu\\bin')
  })

  it('[M11-G3 M09-5] 풀기로 받지 않는 차이의 거부 안내는 바뀐 파일의 옛 값 → 새 값과 복구 절차(자기 변경이면 스냅숏 파일을 지운 뒤 다시 연다)를 적는다', async () => {
    const ghDir = path.join(repos.root, 'gh-config')
    fs.mkdirSync(ghDir, { recursive: true })
    const env = { ...repos.env, GH_CONFIG_DIR: ghDir }
    const r = await createConfigGuard({ cwd: repos.work, env, snapshotFile, hooksPath })
    if (!r.ok) throw new Error(r.reason)
    const hosts = path.join(ghDir, 'hosts.yml')
    fs.writeFileSync(hosts, 'github.com:\n  user: x\n')
    const again = await createConfigGuard({ cwd: repos.work, env, snapshotFile, hooksPath })
    if (again.ok) throw new Error('열렸다')
    expect(again.reason).toContain(`${hosts}: `)
    expect(again.reason).toContain(snapshotFile)
    expect(again.reason).toMatch(/지우|지운|삭제/)
  })

  const requestKeys: [string, string, () => void][] = [
    ['로컬 remote.origin.proxy 빈 값', 'remote.origin.proxy', () => { repos.git(['config', 'remote.origin.proxy', '']) }],
    ['로컬 http.curloptResolve', 'http.curloptresolve', () => { repos.git(['config', 'http.curloptResolve', 'github.com:443:127.0.0.1']) }],
  ]
  for (const [name, key, plant] of requestKeys) {
    it(`[M11-G3 M09-9] ${name} — 원격 요청을 바꾸는 키라 열린 뒤 본 목록으로도 풀기로 받지 않는다`, async () => {
      const guard = await open()
      plant()
      expect(await guard.check()).toContain(key)
      const accepted = await createConfigGuard({ cwd: repos.work, env: repos.env, snapshotFile, hooksPath, acceptChanged: guard.changes() })
      expect(accepted.ok).toBe(false)
    })
  }
})
