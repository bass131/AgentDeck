import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const h = vi.hoisted(() => {
  const base = (process.env.TMPDIR || process.env.TEMP || process.env.TMP || '/tmp').replace(
    /[\\/]+$/,
    ''
  )
  const root = `${base}/agentdeck-ev-${process.pid}-${Date.now()}`
  return {
    root,
    userData: { value: `${root}/_fallback-userdata` },
    appDir: { value: `${root}/_app` },
    spawn: vi.fn(),
  }
})

vi.mock('electron', () => {
  const app = {
    getPath: (_name: string): string => h.userData.value,
    getAppPath: (): string => h.appDir.value,
  }
  return { app, default: { app } }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawn: h.spawn,
    default: { ...(actual as unknown as { default: object }).default, spawn: h.spawn },
  }
})

const HOME_CONFIG = path.join(os.homedir(), '.agentdeck-dev', 'engine-config.json')

interface HomeSnapshot {
  exists: boolean
  mtimeMs: number | null
  content: string | null
}

function snapshotHomeConfig(): HomeSnapshot {
  try {
    const st = fs.statSync(HOME_CONFIG)
    return { exists: true, mtimeMs: st.mtimeMs, content: fs.readFileSync(HOME_CONFIG, 'utf8') }
  } catch {
    return { exists: false, mtimeMs: null, content: null }
  }
}

let homeBefore: HomeSnapshot

const DEFAULT_APP_DIR = h.appDir.value

function newUserData(): string {
  return fs.mkdtempSync(path.join(h.root, 'ud-'))
}

function installFixture(
  userData: string,
  version: string,
  extraPkg: Record<string, unknown> = {}
): string {
  const dir = path.join(
    userData,
    'engines',
    version,
    'node_modules',
    '@anthropic-ai',
    'claude-agent-sdk'
  )
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: '@anthropic-ai/claude-agent-sdk', version, ...extraPkg }, null, 2)
  )
  return dir
}

function writeConfigFixture(userData: string, activeVersion: string | null): void {
  fs.mkdirSync(userData, { recursive: true })
  fs.writeFileSync(
    path.join(userData, 'engine-config.json'),
    JSON.stringify({ activeVersion }, null, 2)
  )
}

function makeAppFixture(bundled: string | null): string {
  const dir = fs.mkdtempSync(path.join(h.root, 'app-'))
  const deps = bundled ? { '@anthropic-ai/claude-agent-sdk': bundled } : {}
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'agentdeck-fixture', dependencies: deps }, null, 2)
  )
  return dir
}

beforeAll(() => {
  homeBefore = snapshotHomeConfig()
  fs.mkdirSync(h.root, { recursive: true })
  fs.mkdirSync(h.appDir.value, { recursive: true })
  fs.writeFileSync(
    path.join(h.appDir.value, 'package.json'),
    JSON.stringify({ dependencies: { '@anthropic-ai/claude-agent-sdk': '1.2.3' } }, null, 2)
  )
})

afterAll(() => {
  const homeAfter = snapshotHomeConfig()
  const fallbackUsed = fs.existsSync(h.userData.value)
  fs.rmSync(h.root, { recursive: true, force: true })

  expect(homeAfter.exists).toBe(homeBefore.exists)
  expect(homeAfter.mtimeMs).toBe(homeBefore.mtimeMs)
  expect(homeAfter.content).toBe(homeBefore.content)
  expect(fallbackUsed).toBe(false)
})

beforeEach(() => {
  h.spawn.mockClear()
  h.spawn.mockReturnValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  h.appDir.value = DEFAULT_APP_DIR
})

describe('maskSecrets()', () => {
  it('export 존재 확인', async () => {
    const mod = await import('../../../02_Source/main/07_engine/engineVersions')
    expect(typeof mod.maskSecrets).toBe('function')
  })

  it('_authToken=abc → 마스킹', async () => {
    const { maskSecrets } = await import('../../../02_Source/main/07_engine/engineVersions')
    const result = maskSecrets('//registry.npmjs.org/:_authToken=abc123secret')
    expect(result).not.toContain('abc123secret')
    expect(result).toContain('***')
  })

  it('Bearer xyz → 마스킹', async () => {
    const { maskSecrets } = await import('../../../02_Source/main/07_engine/engineVersions')
    const result = maskSecrets('Authorization: Bearer xyz-secret-token')
    expect(result).not.toContain('xyz-secret-token')
    expect(result).toContain('***')
  })

  it('URL 자격증명 https://user:pass@host → 마스킹', async () => {
    const { maskSecrets } = await import('../../../02_Source/main/07_engine/engineVersions')
    const result = maskSecrets('fetching https://user:pass@registry.npmjs.org/pkg')
    expect(result).not.toContain('user:pass')
    expect(result).toContain('***')
  })

  it(':_password=secret → 마스킹', async () => {
    const { maskSecrets } = await import('../../../02_Source/main/07_engine/engineVersions')
    const result = maskSecrets('//registry.npmjs.org/:_password=mysecretpwd')
    expect(result).not.toContain('mysecretpwd')
    expect(result).toContain('***')
  })

  it('_auth=base64val → 마스킹', async () => {
    const { maskSecrets } = await import('../../../02_Source/main/07_engine/engineVersions')
    const result = maskSecrets('//registry.npmjs.org/:_auth=bXl1c2VyOm15cGFzcw==')
    expect(result).not.toContain('bXl1c2VyOm15cGFzcw==')
    expect(result).toContain('***')
  })

  it('일반 npm 출력 — 마스킹 없음', async () => {
    const { maskSecrets } = await import('../../../02_Source/main/07_engine/engineVersions')
    const line = 'npm http fetch GET 200 https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk'
    expect(maskSecrets(line)).toBe(line)
  })
})

describe('installVersion() — semver 검증 (spawn 미호출 보장)', () => {
  const rejected = [
    ['1.2', /invalid|semver|version/i],
    ['../evil', /invalid|semver|version/i],
    ['1.0.0; rm -rf /', /invalid|semver|version/i],
    ['', /invalid|semver|version/i],
    ['^1.2.3', /invalid|semver|version/i],
    ['latest', /invalid|semver|version/i],
    ['not-a-version', /invalid|semver|version/i],
  ] as const

  for (const [version, errRe] of rejected) {
    it(`버전 ${JSON.stringify(version)} → 즉시 거부, spawn 0`, async () => {
      const { installVersion } = await import('../../../02_Source/main/07_engine/engineVersions')
      const ud = newUserData()
      const progress = vi.fn()
      const result = await installVersion(version, progress, ud)
      expect(result.ok).toBe(false)
      expect(result.error).toMatch(errRe)
      expect(h.spawn).toHaveBeenCalledTimes(0)
      expect(fs.existsSync(path.join(ud, 'engines'))).toBe(false)
      expect(progress).not.toHaveBeenCalled()
    })
  }

  it('"1.0.0-beta.1" pre-release → semver 통과(즉시 거부 아님) → spawn 단계 진입', async () => {
    const { installVersion } = await import('../../../02_Source/main/07_engine/engineVersions')
    const ud = newUserData()
    const progress = vi.fn()
    const result = await installVersion('1.0.0-beta.1', progress, ud)
    expect(result.ok).toBe(false)
    expect(result.error).not.toMatch(/invalid version.*strict semver/i)
    expect(result.error).toMatch(/spawn 실패|프로세스/i)
    expect(h.spawn).toHaveBeenCalledTimes(1)
    expect(fs.existsSync(path.join(ud, 'engines', '1.0.0-beta.1', 'package.json'))).toBe(true)
  })
})

describe('installVersion() — 경로 containment 2단 방어', () => {
  it('enginesDir 밖으로 탈출하는 version → 거부 (semver 단에서 선차단)', async () => {
    const { installVersion } = await import('../../../02_Source/main/07_engine/engineVersions')
    const ud = newUserData()
    const result = await installVersion('../outside', vi.fn(), ud)
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(h.spawn).toHaveBeenCalledTimes(0)
    expect(fs.existsSync(path.join(ud, '..', 'outside'))).toBe(false)
  })

  it('버전에 경로 구분자 포함("1.2.3/../../evil") → 거부', async () => {
    const { installVersion } = await import('../../../02_Source/main/07_engine/engineVersions')
    const ud = newUserData()
    const result = await installVersion('1.2.3/../../evil', vi.fn(), ud)
    expect(result.ok).toBe(false)
    expect(h.spawn).toHaveBeenCalledTimes(0)
    expect(fs.existsSync(path.join(ud, 'evil'))).toBe(false)
  })
})

describe('installVersion() — 유효 semver 경로', () => {
  it('유효 semver → 디렉토리 준비 + progress 첫 라인 + spawn 1회 (실 npm 0)', async () => {
    const { installVersion } = await import('../../../02_Source/main/07_engine/engineVersions')
    const ud = newUserData()
    const progress = vi.fn()
    const result = await installVersion('0.3.186', progress, ud)

    expect(result.ok).toBe(false)
    expect(result.error).not.toMatch(/invalid version.*strict semver/i)
    expect(h.spawn).toHaveBeenCalledTimes(1)

    const [cmd, args] = h.spawn.mock.calls[0] as [string, string[]]
    expect(cmd).toMatch(/^npm(\.cmd)?$/)
    expect(args).toContain('install')
    expect(args.some((a) => a.includes('@anthropic-ai/claude-agent-sdk@0.3.186'))).toBe(true)

    expect(progress).toHaveBeenCalled()
    expect(String((progress.mock.calls[0][0] as { line?: string }).line)).toContain('npm install')

    const dir = path.join(ud, 'engines', '0.3.186')
    expect(fs.existsSync(path.join(dir, 'package.json'))).toBe(true)
  })

  it('env 화이트리스트 — spawn env 에 ANTHROPIC_API_KEY 미주입 (ADR-008)', async () => {
    const saved = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'sk-should-not-leak'
    try {
      const { installVersion } = await import('../../../02_Source/main/07_engine/engineVersions')
      await installVersion('0.3.186', vi.fn(), newUserData())
      const opts = h.spawn.mock.calls[0][2] as { env: Record<string, string> }
      expect(opts.env).toBeDefined()
      expect(Object.keys(opts.env)).not.toContain('ANTHROPIC_API_KEY')
      expect(JSON.stringify(opts.env)).not.toContain('sk-should-not-leak')
    } finally {
      if (saved === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = saved
    }
  })
})

describe('setActive() → loadActiveQuery()', () => {
  it('setActive(null) → 주입된 userData 에만 기록 + loadActiveQuery() = null', async () => {
    const { setActive, loadActiveQuery } = await import('../../../02_Source/main/07_engine/engineVersions')
    const ud = newUserData()

    setActive(null, ud)

    const cfg = path.join(ud, 'engine-config.json')
    expect(fs.existsSync(cfg)).toBe(true)
    expect(JSON.parse(fs.readFileSync(cfg, 'utf8'))).toEqual({ activeVersion: null })

    const q = await loadActiveQuery(ud)
    expect(q).toBeNull()
  })

  it('setActive(설치된 버전) → config 기록 + getVersionState.active 반영', async () => {
    const { setActive, getVersionState } = await import('../../../02_Source/main/07_engine/engineVersions')
    const ud = newUserData()
    installFixture(ud, '1.2.3')

    setActive('1.2.3', ud)

    const cfg = JSON.parse(fs.readFileSync(path.join(ud, 'engine-config.json'), 'utf8'))
    expect(cfg).toEqual({ activeVersion: '1.2.3' })
    expect(getVersionState(ud).active).toBe('1.2.3')
  })

  it('setActive(미설치 버전) → throw, config 미기록', async () => {
    const { setActive } = await import('../../../02_Source/main/07_engine/engineVersions')
    const ud = newUserData()
    expect(() => setActive('9.9.9', ud)).toThrow(/설치/)
    expect(fs.existsSync(path.join(ud, 'engine-config.json'))).toBe(false)
  })

  it('setActive(비semver) → throw (형식 단에서 거부, fs 접근 전)', async () => {
    const { setActive } = await import('../../../02_Source/main/07_engine/engineVersions')
    const ud = newUserData()
    expect(() => setActive('../evil', ud)).toThrow()
    expect(() => setActive('1.2', ud)).toThrow()
    expect(() => setActive('latest', ud)).toThrow()
    expect(fs.readdirSync(ud)).toEqual([])
  })
})

describe('loadActiveQuery()', () => {
  it('active 없음(config activeVersion:null) → null 반환', async () => {
    const { loadActiveQuery } = await import('../../../02_Source/main/07_engine/engineVersions')
    const ud = newUserData()
    writeConfigFixture(ud, null)
    expect(await loadActiveQuery(ud)).toBeNull()
  })

  it('major 불일치(active=2.0.0, bundled=1.2.3) → null + 경고 (API 드리프트 방지)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    h.appDir.value = makeAppFixture('^1.2.3')

    const { loadActiveQuery } = await import('../../../02_Source/main/07_engine/engineVersions')
    const ud = newUserData()
    installFixture(ud, '2.0.0', { main: 'index.js' })
    writeConfigFixture(ud, '2.0.0')

    expect(await loadActiveQuery(ud)).toBeNull()
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0][0])).toMatch(/major 불일치/)
  })

  it('major 일치 + 동적 로드 실패(엔트리 파일 없음) → null 반환(번들 폴백)', async () => {
    h.appDir.value = makeAppFixture('1.2.3')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { loadActiveQuery } = await import('../../../02_Source/main/07_engine/engineVersions')
    const ud = newUserData()
    installFixture(ud, '1.2.3', { main: 'index.js' })
    writeConfigFixture(ud, '1.2.3')

    expect(await loadActiveQuery(ud)).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  it('config 의 active 가 미설치 → null (설치 목록 대조 폴백)', async () => {
    const { loadActiveQuery } = await import('../../../02_Source/main/07_engine/engineVersions')
    const ud = newUserData()
    writeConfigFixture(ud, '9.9.9')
    expect(await loadActiveQuery(ud)).toBeNull()
  })
})

describe('getVersionState()', () => {
  it('설치 없음 → installed=[], active=null', async () => {
    const { getVersionState } = await import('../../../02_Source/main/07_engine/engineVersions')
    const state = getVersionState(newUserData())
    expect(state.package).toBe('@anthropic-ai/claude-agent-sdk')
    expect(state.installed).toEqual([])
    expect(state.active).toBeNull()
  })

  it('bundled 버전 — 앱 package.json dependencies 에서 추출', async () => {
    h.appDir.value = makeAppFixture('^4.5.6')
    const { getVersionState } = await import('../../../02_Source/main/07_engine/engineVersions')
    const state = getVersionState(newUserData())
    expect(state.package).toBe('@anthropic-ai/claude-agent-sdk')
    expect(state.bundled).toBe('4.5.6')
  })

  it('설치 목록 최신순 정렬', async () => {
    const { getVersionState } = await import('../../../02_Source/main/07_engine/engineVersions')
    const ud = newUserData()
    installFixture(ud, '1.2.3')
    installFixture(ud, '1.10.0')
    installFixture(ud, '0.9.9')
    expect(getVersionState(ud).installed).toEqual(['1.10.0', '1.2.3', '0.9.9'])
  })

  it('active 버전이 installed 목록에 없으면 null 폴백', async () => {
    const { getVersionState } = await import('../../../02_Source/main/07_engine/engineVersions')
    const ud = newUserData()
    writeConfigFixture(ud, '9.9.9')
    expect(getVersionState(ud).active).toBeNull()
  })

  it('신뢰경계: 반환 객체에 토큰·시크릿 필드 0', async () => {
    const { getVersionState } = await import('../../../02_Source/main/07_engine/engineVersions')
    const ud = newUserData()
    installFixture(ud, '1.2.3')
    writeConfigFixture(ud, '1.2.3')
    const state = getVersionState(ud)
    expect(Object.keys(state).sort()).toEqual(['active', 'bundled', 'installed', 'package'])
  })
})

describe('IPC ENGINE_INSTALL — e2e 스텁 플래그', () => {
  afterEach(() => {
    delete process.env.AGENTDECK_E2E_ENGINE_INSTALL
  })

  it('AGENTDECK_E2E_ENGINE_INSTALL 환경변수 설정/해제가 테스트 간 누수 없음', () => {
    expect(process.env.AGENTDECK_E2E_ENGINE_INSTALL).toBeUndefined()
    process.env.AGENTDECK_E2E_ENGINE_INSTALL = '1'
    expect(process.env.AGENTDECK_E2E_ENGINE_INSTALL).toBe('1')
  })
})

describe('getUserDataPath() 폴백 — electron 미초기화 + override 없음 → throw', () => {
  afterAll(() => {
    vi.doMock('electron', () => {
      const app = {
        getPath: (_name: string): string => h.userData.value,
        getAppPath: (): string => h.appDir.value,
      }
      return { app, default: { app } }
    })
  })

  it('override 없음 + app.getPath 실패(electron 미초기화) → overrideUserData 안내 에러 throw', async () => {
    vi.doMock('electron', () => {
      const app = {
        getPath: (_name: string): string => {
          throw new Error('electron 미초기화(테스트 대역)')
        },
        getAppPath: (): string => h.appDir.value,
      }
      return { app, default: { app } }
    })

    const { getVersionState } = await import('../../../02_Source/main/07_engine/engineVersions')
    expect(() => getVersionState()).toThrow(/overrideUserData/)
  })

  it('에러 메시지에 실제 홈 경로 문자열을 찍지 않는다 (ADR-008 결)', async () => {
    vi.doMock('electron', () => {
      const app = {
        getPath: (_name: string): string => {
          throw new Error('electron 미초기화(테스트 대역)')
        },
        getAppPath: (): string => h.appDir.value,
      }
      return { app, default: { app } }
    })

    const { getVersionState } = await import('../../../02_Source/main/07_engine/engineVersions')
    try {
      getVersionState()
      throw new Error('getVersionState()가 throw하지 않음 — 테스트 전제 위반')
    } catch (e) {
      const msg = (e as Error).message
      expect(msg).not.toContain(os.homedir())
    }
  })
})
