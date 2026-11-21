// 임시 userData에 가짜 엔진(진입 파일 index.mjs)을 두고 프로덕션 경로(setActive·loadActiveQuery·getVersionState)로만 본다.
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'

const h = vi.hoisted(() => {
  const base = (process.env.TMPDIR || process.env.TEMP || process.env.TMP || '/tmp').replace(/[\\/]+$/, '')
  const root = `${base}/agentdeck-seal-${process.pid}-${Date.now()}`
  return { root, userData: { value: `${root}/_ud` }, appDir: { value: `${root}/_app` }, installedBundled: { value: null as string | null } }
})

vi.mock('electron', () => {
  const app = { getPath: (): string => h.userData.value, getAppPath: (): string => h.appDir.value }
  return { app, default: { app } }
})

// 하한은 설치된 번들 SDK 버전을 먼저 본다. 시험은 그 값을 주입한다(null이면 앱 package.json의 의존 명세).
vi.mock('@main/10_Engine/sdkVersion', async (orig) => ({
  ...(await orig<typeof import('@main/10_Engine/sdkVersion')>()),
  readInstalledSdkVersion: (): string | null => h.installedBundled.value,
}))

function setBundled(version: string): void {
  fs.mkdirSync(h.appDir.value, { recursive: true })
  fs.writeFileSync(path.join(h.appDir.value, 'package.json'), JSON.stringify({ dependencies: { '@anthropic-ai/claude-agent-sdk': version } }))
}

function newUserData(): string {
  return fs.mkdtempSync(path.join(h.root, 'ud-'))
}

function pkgDir(ud: string, version: string): string {
  return path.join(ud, 'engines', version, 'node_modules', '@anthropic-ai', 'claude-agent-sdk')
}

function installEngine(ud: string, version: string, pkgVersion = version): string {
  const dir = pkgDir(ud, version)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@anthropic-ai/claude-agent-sdk', version: pkgVersion, main: 'index.mjs' }))
  fs.writeFileSync(path.join(dir, 'index.mjs'), `export const query = () => 'engine-${version}'\n`)
  fs.writeFileSync(path.join(dir, 'core.mjs'), 'export const x = 1\n')
  return dir
}

beforeAll(() => {
  fs.mkdirSync(h.root, { recursive: true })
  setBundled('1.2.3')
})

afterAll(() => {
  fs.rmSync(h.root, { recursive: true, force: true })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  setBundled('1.2.3')
  h.installedBundled.value = null
})

const quiet = (): ReturnType<typeof vi.spyOn> => vi.spyOn(console, 'warn').mockImplementation(() => {})
const engine = async (): Promise<typeof import('@main/10_Engine/engineVersions')> => import('@main/10_Engine/engineVersions')
const run = async (ud: string): Promise<string | null> => {
  const q = (await (await engine()).loadActiveQuery(ud)) as (() => string) | null
  return q ? q() : null
}

describe('엔진 봉인 (M07 G4)', () => {
  it('앱이 고르면 봉인이 생기고, 그대로면 그 엔진을 불러온다', async () => {
    const { setActive, getVersionState } = await engine()
    const ud = newUserData()
    installEngine(ud, '1.4.0')
    setActive('1.4.0', ud)
    expect(fs.existsSync(path.join(ud, 'engine-seal.json'))).toBe(true)
    expect(getVersionState(ud).seal).toBe('ok')
    expect(await run(ud)).toBe('engine-1.4.0')
    expect(await run(ud)).toBe('engine-1.4.0')
  })

  it('진입 파일이 앱 밖에서 바뀌면 불러오지 않는다 — 이미 불러온 뒤(캐시)에도 다시 본다', async () => {
    const warn = quiet()
    const { setActive, getVersionState } = await engine()
    const ud = newUserData()
    const dir = installEngine(ud, '1.4.0')
    setActive('1.4.0', ud)
    expect(await run(ud)).toBe('engine-1.4.0')
    fs.writeFileSync(path.join(dir, 'index.mjs'), `export const query = () => 'tampered'\n`)
    expect(getVersionState(ud).seal).toBe('mismatch')
    expect(await run(ud)).toBeNull()
    // main 로그는 상태와 봉인을 다시 적는 자리(앱의 엔진 선택)를 함께 적는다
    expect(warn.mock.calls.some((c) => /봉인 mismatch.*엔진 선택/.test(String(c[0])))).toBe(true)
  })

  const listChanges: [string, (dir: string, ud: string) => void][] = [
    ['파일이 더해지면', (_d, ud) => fs.writeFileSync(path.join(ud, 'engines', '1.4.0', 'node_modules', 'extra.js'), 'x')],
    ['진입 파일이 아닌 파일의 내용이 바뀌면', (d) => fs.writeFileSync(path.join(d, 'core.mjs'), 'export const x = 22\n')],
    ['수정 시각만 바뀌면', (d) => fs.utimesSync(path.join(d, 'core.mjs'), new Date(2001, 1, 1), new Date(2001, 1, 1))],
    ['파일이 지워지면', (d) => fs.rmSync(path.join(d, 'core.mjs'))],
  ]
  for (const [what, change] of listChanges) {
    it(`엔진 폴더에서 ${what} 불러오지 않고, 그 판정이 상태 칸에 남는다`, async () => {
      quiet()
      const { setActive, getVersionState } = await engine()
      const ud = newUserData()
      const dir = installEngine(ud, '1.4.0')
      setActive('1.4.0', ud)
      expect(await run(ud)).toBe('engine-1.4.0')
      change(dir, ud)
      expect(await run(ud)).toBeNull()
      expect(getVersionState(ud).seal).toBe('mismatch')
    })
  }

  it('설정 파일만 앱 밖에서 다른 버전으로 바꾸면 불러오지 않는다', async () => {
    quiet()
    const { setActive, getVersionState } = await engine()
    const ud = newUserData()
    installEngine(ud, '1.4.0')
    installEngine(ud, '1.5.0')
    setActive('1.4.0', ud)
    fs.writeFileSync(path.join(ud, 'engine-config.json'), JSON.stringify({ activeVersion: '1.5.0' }))
    expect(getVersionState(ud).seal).toBe('mismatch')
    expect(await run(ud)).toBeNull()
  })

  it('봉인 없이 설정만 있으면(앱 밖에서 씀, 또는 봉인 도입 전) 불러오지 않는다', async () => {
    quiet()
    const { getVersionState } = await engine()
    const ud = newUserData()
    installEngine(ud, '1.4.0')
    fs.writeFileSync(path.join(ud, 'engine-config.json'), JSON.stringify({ activeVersion: '1.4.0' }))
    expect(getVersionState(ud).seal).toBe('missing')
    expect(await run(ud)).toBeNull()
  })

  it('봉인 파일이 깨져 있으면 missing이 아니라 mismatch다 (누가 건드렸다)', async () => {
    quiet()
    const { setActive, getVersionState } = await engine()
    const ud = newUserData()
    installEngine(ud, '1.4.0')
    setActive('1.4.0', ud)
    fs.writeFileSync(path.join(ud, 'engine-seal.json'), '{not json')
    expect(getVersionState(ud).seal).toBe('mismatch')
    expect(await run(ud)).toBeNull()
  })

  it('설정 파일이 지워져도 봉인이 남아 있으면 none이 아니라 mismatch다', async () => {
    const { setActive, getVersionState } = await engine()
    const ud = newUserData()
    installEngine(ud, '1.4.0')
    setActive('1.4.0', ud)
    fs.rmSync(path.join(ud, 'engine-config.json'))
    expect(getVersionState(ud).seal).toBe('mismatch')
  })

  it('번들보다 낮은 버전은 앱이 골라도 불러오지 않는다', async () => {
    quiet()
    const { setActive, getVersionState } = await engine()
    const ud = newUserData()
    installEngine(ud, '1.2.0')
    setActive('1.2.0', ud)
    expect(getVersionState(ud).seal).toBe('below-floor')
    expect(await run(ud)).toBeNull()
  })

  it('하한은 설치된 번들 버전을 먼저 본다 (의존 명세는 그다음)', async () => {
    quiet()
    h.installedBundled.value = '1.5.0'
    const { setActive, getVersionState } = await engine()
    const ud = newUserData()
    installEngine(ud, '1.4.0')
    setActive('1.4.0', ud)
    expect(getVersionState(ud).seal).toBe('below-floor')
  })

  it('하한 비교는 마디별 숫자이고, 같은 번호의 사전 배포판은 정식판보다 낮다', async () => {
    const { isBelowFloor } = await import('@main/10_Engine/engineSeal')
    expect(isBelowFloor('1.9.0', '1.10.0')).toBe(true)
    expect(isBelowFloor('1.10.0', '1.9.0')).toBe(false)
    expect(isBelowFloor('1.2.3-beta.1', '1.2.3')).toBe(true)
    expect(isBelowFloor('1.2.3', '1.2.3')).toBe(false)
  })

  it('폴더 이름과 설치된 패키지 버전이 다르면 고를 수 없고, 설정만 그렇게 되면 mismatch다', async () => {
    quiet()
    const { setActive, getVersionState } = await engine()
    const ud = newUserData()
    installEngine(ud, '1.9.0', '1.0.0')
    expect(() => setActive('1.9.0', ud)).toThrow(/버전/)
    fs.writeFileSync(path.join(ud, 'engine-config.json'), JSON.stringify({ activeVersion: '1.9.0' }))
    expect(getVersionState(ud).seal).toBe('mismatch')
  })

  it('선택을 지우면 봉인도 지우고, 상태는 none이다', async () => {
    const { setActive, getVersionState } = await engine()
    const ud = newUserData()
    installEngine(ud, '1.4.0')
    setActive('1.4.0', ud)
    setActive(null, ud)
    expect(fs.existsSync(path.join(ud, 'engine-seal.json'))).toBe(false)
    expect(getVersionState(ud).seal).toBe('none')
  })

  it('빈 userData(첫 실행·e2e)는 none이고 번들 엔진을 쓴다', async () => {
    const { getVersionState } = await engine()
    const ud = newUserData()
    expect(getVersionState(ud).seal).toBe('none')
    expect(await run(ud)).toBeNull()
  })

  it('바뀐 엔진을 앱에서 다시 고르면 다시 봉인되고, 그 내용을 불러온다', async () => {
    quiet()
    const { setActive, getVersionState } = await engine()
    const ud = newUserData()
    const dir = installEngine(ud, '1.4.0')
    setActive('1.4.0', ud)
    fs.writeFileSync(path.join(dir, 'index.mjs'), `export const query = () => 'approved-again'\n`)
    expect(getVersionState(ud).seal).toBe('mismatch')
    setActive('1.4.0', ud)
    expect(getVersionState(ud).seal).toBe('ok')
    expect(await run(ud)).toBe('approved-again')
  })

  it('이 프로세스가 이미 불러온 버전은 바뀐 뒤 다시 골라도 재시작 전까지 번들을 쓴다 (모듈 캐시)', async () => {
    const warn = quiet()
    const { setActive, getVersionState } = await engine()
    const ud = newUserData()
    const dir = installEngine(ud, '1.4.0')
    setActive('1.4.0', ud)
    expect(await run(ud)).toBe('engine-1.4.0')
    fs.writeFileSync(path.join(dir, 'index.mjs'), `export const query = () => 'approved-again'\n`)
    setActive('1.4.0', ud)
    expect(getVersionState(ud).seal).toBe('restart')
    expect(await run(ud)).toBeNull()
    expect(warn.mock.calls.some((c) => /봉인 restart.*재시작/.test(String(c[0])))).toBe(true)
  })

  it('다른 버전으로 고르면 봉인이 그 버전으로 바뀌고 그 엔진을 불러온다', async () => {
    const { setActive, getVersionState } = await engine()
    const ud = newUserData()
    installEngine(ud, '1.4.0')
    installEngine(ud, '1.5.0')
    setActive('1.4.0', ud)
    expect(await run(ud)).toBe('engine-1.4.0')
    setActive('1.5.0', ud)
    expect(JSON.parse(fs.readFileSync(path.join(ud, 'engine-seal.json'), 'utf8')).version).toBe('1.5.0')
    expect(getVersionState(ud).seal).toBe('ok')
    expect(await run(ud)).toBe('engine-1.5.0')
  })

  it('봉인을 쓰지 못하면 설정도 바꾸지 않는다 (봉인 먼저)', async () => {
    const { setActive } = await engine()
    const ud = newUserData()
    installEngine(ud, '1.4.0')
    installEngine(ud, '1.5.0')
    setActive('1.4.0', ud)
    fs.rmSync(path.join(ud, 'engine-seal.json'))
    fs.mkdirSync(path.join(ud, 'engine-seal.json'))
    expect(() => setActive('1.5.0', ud)).toThrow()
    expect(JSON.parse(fs.readFileSync(path.join(ud, 'engine-config.json'), 'utf8')).activeVersion).toBe('1.4.0')
  })

  it('앱이 보이는 엔진 버전은 봉인이 맞을 때만 활성 버전이다', async () => {
    quiet()
    const ud = newUserData()
    h.userData.value = ud
    const dir = installEngine(ud, '1.4.0')
    const { setActive } = await engine()
    setActive('1.4.0')
    const { ClaudeCodeBackend } = await import('@main/04_Claude/ClaudeCodeBackend')
    expect(await new ClaudeCodeBackend().version()).toBe('1.4.0')
    fs.writeFileSync(path.join(dir, 'index.mjs'), 'tampered')
    expect(await new ClaudeCodeBackend().version()).not.toBe('1.4.0')
  })

  it('재시작을 기다리는 엔진(restart)도 보이는 버전은 번들 쪽이다', async () => {
    quiet()
    const ud = newUserData()
    h.userData.value = ud
    const dir = installEngine(ud, '1.4.0')
    const { setActive } = await engine()
    setActive('1.4.0')
    expect(await run(ud)).toBe('engine-1.4.0')
    fs.writeFileSync(path.join(dir, 'index.mjs'), `export const query = () => 'approved-again'\n`)
    setActive('1.4.0')
    const { ClaudeCodeBackend } = await import('@main/04_Claude/ClaudeCodeBackend')
    expect(await new ClaudeCodeBackend().version()).not.toBe('1.4.0')
  })
})

describe('봉인의 남은 틈과 보이는 버전 (M11 G3)', () => {
  it('[M11-G3 M07-11] 형제 파일의 내용을 크기·수정 시각은 그대로 둔 채 바꾸면 그 엔진을 쓰지 않는다', async () => {
    quiet()
    const { setActive } = await engine()
    const ud = newUserData()
    const dir = installEngine(ud, '1.4.0')
    const core = path.join(dir, 'core.mjs')
    fs.utimesSync(core, 1_700_000_000, 1_700_000_000)
    setActive('1.4.0', ud)
    const st = fs.statSync(core)
    fs.writeFileSync(core, 'export const y = 2\n')
    fs.utimesSync(core, 1_700_000_000, 1_700_000_000)
    expect(fs.statSync(core).size).toBe(st.size)
    expect(await run(ud)).toBeNull()
  })

  it('[M11-G3 M07-11] 버전 폴더 위쪽(engines/node_modules)에 패키지가 생기면 그 엔진을 쓰지 않는다 — Node가 올라가며 찾는 길이다', async () => {
    quiet()
    const { setActive } = await engine()
    const ud = newUserData()
    installEngine(ud, '1.4.0')
    setActive('1.4.0', ud)
    const planted = path.join(ud, 'engines', 'node_modules', 'zod')
    fs.mkdirSync(planted, { recursive: true })
    fs.writeFileSync(path.join(planted, 'package.json'), JSON.stringify({ name: 'zod', version: '9.9.9', main: 'index.js' }))
    expect(await run(ud)).toBeNull()
  })

  it('[M11-G3 M07-11] 앱 데이터 폴더 바로 아래의 node_modules도 같은 길이다 — 생기면 그 엔진을 쓰지 않는다', async () => {
    quiet()
    const { setActive } = await engine()
    const ud = newUserData()
    installEngine(ud, '1.4.0')
    setActive('1.4.0', ud)
    expect(await run(ud)).toBe('engine-1.4.0')
    expect(fs.readdirSync(ud).filter((n) => n.endsWith('.tmp'))).toEqual([])
    fs.mkdirSync(path.join(ud, 'node_modules', 'zod'), { recursive: true })
    expect(await run(ud)).toBeNull()
  })

  it('[M11-G3 M07-12] major가 번들과 달라 번들이 돌면 보이는 버전도 번들 쪽이다', async () => {
    quiet()
    const ud = newUserData()
    h.userData.value = ud
    installEngine(ud, '2.0.0')
    const { setActive } = await engine()
    setActive('2.0.0')
    expect(await run(ud)).toBeNull()
    const { ClaudeCodeBackend } = await import('@main/04_Claude/ClaudeCodeBackend')
    expect(await new ClaudeCodeBackend(undefined, undefined, undefined, { resolvePackageVersion: () => '1.2.3' }).version()).toBe('1.2.3')
  })

  it('[M11-G3 M07-12] 봉인은 맞지만 불러오기에 실패해 번들이 돌면 보이는 버전도 번들 쪽이다', async () => {
    quiet()
    const ud = newUserData()
    h.userData.value = ud
    const dir = installEngine(ud, '1.4.0')
    fs.rmSync(path.join(dir, 'index.mjs'))
    const { setActive, getVersionState, activeInUse } = await engine()
    setActive('1.4.0')
    expect(await run(ud)).toBeNull()
    expect(getVersionState().seal).toBe('ok')
    expect(activeInUse(getVersionState())).toBeNull()
    const { ClaudeCodeBackend } = await import('@main/04_Claude/ClaudeCodeBackend')
    expect(await new ClaudeCodeBackend(undefined, undefined, undefined, { resolvePackageVersion: () => '1.2.3' }).version()).toBe('1.2.3')
  })
})
