/**
 * engineVersions.test.ts — 02_Source/main/engineVersions.ts 단위 테스트
 *
 * 테스트 커버리지:
 *   1. maskSecrets 헬퍼: _authToken·Bearer·URL 자격증명 마스킹 확인
 *   2. installVersion: strict semver 검증(정상·불통과), 경로 containment 위반 거부
 *   3. installVersion: spawn mock — 거부 케이스에서 spawn 호출 0 을 *실제로* 단언
 *   4. setActive → loadActiveQuery 캐시 무효화
 *   5. loadActiveQuery: active 없음→null, major 불일치→null, 동적 로드 실패→null
 *   6. getVersionState: bundled/active/installed 반환 구조
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 격리 설계 (2026-07-27 회귀 수리 — 이 주석이 이 파일의 안전 계약이다)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 이전 버전은 `vi.mock('node:fs', ...)` 로 파일시스템을 가짜로 만들었다고 믿었지만
 * **실제 사용자 홈(`~/.agentdeck-dev/engine-config.json`)을 덮어썼고, 그러면서 green 이었다.**
 * 원인 두 가지:
 *
 *   (원인 1 — 치명) 팩토리가 `{ ...actual }` 로 원본 네임스페이스를 펼쳤는데, 그 안에는
 *     `default`(진짜 fs 객체)가 들어 있다. 앱 코드는 `import fs from 'node:fs'`(default import)
 *     이므로 **모킹된 named export 는 한 번도 조회되지 않고 진짜 fs 가 그대로 쓰였다.**
 *     즉 모킹은 "적용은 됐지만 앱이 보는 문(default)이 아닌 다른 문(named)에만" 걸려 있었다.
 *
 *   (원인 2) `vi.mock` 은 어디에 쓰든 파일 최상단으로 호이스팅된다. `it()` 안에 7개를 두면
 *     테스트별로 갈리는 게 아니라 **마지막 하나가 파일 전체를 지배**한다. 테스트별 fs 시나리오는
 *     처음부터 허구였다.
 *
 * 수리 방식: **fs 모킹을 폐기하고, 실제 파일시스템 + per-test 임시 userData 주입**으로 바꿨다.
 *   - `setActive/getVersionState/loadActiveQuery/installVersion` 은 이미 `overrideUserData`
 *     주입 매개변수를 갖고 있다 → **앱 코드 변경 0**.
 *   - 근거: 이번 결함의 본질은 "모킹이 조용히 빗나가도 테스트는 통과한다"였다. 다시 모킹으로
 *     고치면 같은 부류의 실패가 그대로 남는다. 실 경로를 쓰되 그 경로를 샌드박스로 못 박으면
 *     '빗나감'이라는 상태 자체가 존재할 수 없다. (trade-off: 실 디스크 I/O 수 ms 발생,
 *     fs 오류(EPERM 등) 시뮬레이션 불가 — 이 파일은 그런 케이스를 필요로 하지 않는다.)
 *
 * 2중 방어:
 *   [1] 모든 호출에 임시 userData 를 **명시 주입**한다.
 *   [2] `electron.app.getPath('userData')` 를 모킹해 **폴백 경로마저 샌드박스**로 보낸다.
 *       앱 코드의 폴백은 `os.homedir()/.agentdeck-dev` 이므로, 주입을 깜빡한 호출이 하나라도
 *       생기면 예전처럼 홈을 때린다. 그 가능성을 구조적으로 없앤다.
 *   [3] 카나리아: 실제 홈 config 의 존재·mtime·내용을 beforeAll 에 찍고 afterAll 에 대조한다.
 *       회귀가 재발하면 **조용히 통과하지 않고 이 파일이 실패**한다.
 *
 * CRITICAL(신뢰경계):
 *   - spawn mock: 실 npm 미호출 — 네트워크 0. 거부 케이스는 `toHaveBeenCalledTimes(0)` 로 단언.
 *   - 시크릿 마스킹 헬퍼 직접 테스트 — progress 라인 유출 방지.
 *   - major 호환 가드: active major !== bundled major → loadActiveQuery null.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

// ══════════════════════════════════════════════════════════════════════════════
// 0. 샌드박스 · 모킹 (파일 최상단 — vi.mock 호이스팅과 정합)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * vi.mock 팩토리는 import 보다 먼저 실행되므로, 팩토리가 참조할 상태는 vi.hoisted 로 만든다.
 * 이 블록 안에서는 상단 import(path/os/fs)를 쓸 수 없다(TDZ) → 전역 `process` 만 사용해
 * **경로 문자열**만 계산하고, 실제 디렉토리 생성은 beforeAll 로 미룬다.
 */
const h = vi.hoisted(() => {
  const base = (process.env.TMPDIR || process.env.TEMP || process.env.TMP || '/tmp').replace(
    /[\\/]+$/,
    ''
  )
  const root = `${base}/agentdeck-ev-${process.pid}-${Date.now()}`
  return {
    root,
    /** electron app.getPath('userData') 폴백 — 절대경로 샌드박스(홈 아님) */
    userData: { value: `${root}/_fallback-userdata` },
    /** electron app.getAppPath() — bundled 버전을 읽는 픽스처 앱 루트 */
    appDir: { value: `${root}/_app` },
    /** node:child_process.spawn 대역 — 기본 undefined 반환(= 프로세스 시작 실패 경로) */
    spawn: vi.fn(),
  }
})

// electron 모킹: 실 electron 은 vitest(node) 에서 app 이 undefined 라 getUserDataPath 가
// catch 로 떨어져 **홈 폴백**을 탄다. 그 폴백을 샌드박스로 돌린다.
vi.mock('electron', () => {
  const app = {
    getPath: (_name: string): string => h.userData.value,
    getAppPath: (): string => h.appDir.value,
  }
  return { app, default: { app } }
})

// child_process 모킹: 실 npm 실행·네트워크 0.
// ⚠️ named 와 default 를 **둘 다** 덮는다 — 이 파일이 겪었던 결함(원인 1)의 재발 방지.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawn: h.spawn,
    default: { ...(actual as unknown as { default: object }).default, spawn: h.spawn },
  }
})

// ⚠️ node:fs 는 모킹하지 않는다. 위 주석의 "수리 방식" 참조.

// ── 홈 카나리아 ───────────────────────────────────────────────────────────────

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

// ── 샌드박스 헬퍼 ─────────────────────────────────────────────────────────────

/** per-test userData 디렉토리 — 샌드박스 안, 테스트마다 독립 */
function newUserData(): string {
  return fs.mkdtempSync(path.join(h.root, 'ud-'))
}

/** engines/<version>/node_modules/@anthropic-ai/claude-agent-sdk 픽스처 생성 */
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

/** engine-config.json 픽스처 */
function writeConfigFixture(userData: string, activeVersion: string | null): void {
  fs.mkdirSync(userData, { recursive: true })
  fs.writeFileSync(
    path.join(userData, 'engine-config.json'),
    JSON.stringify({ activeVersion }, null, 2)
  )
}

/** 픽스처 앱 루트 — bundled 버전을 결정한다 */
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
  // 기본 bundled = 1.2.3 (실 package.json 에 의존하지 않는 고정값 — 결정론)
  fs.mkdirSync(h.appDir.value, { recursive: true })
  fs.writeFileSync(
    path.join(h.appDir.value, 'package.json'),
    JSON.stringify({ dependencies: { '@anthropic-ai/claude-agent-sdk': '1.2.3' } }, null, 2)
  )
})

afterAll(() => {
  // 정리 전에 증거를 확보한다(정리가 실패해도 단언은 돌도록).
  const homeAfter = snapshotHomeConfig()
  const fallbackUsed = fs.existsSync(h.userData.value)
  fs.rmSync(h.root, { recursive: true, force: true })

  // [카나리아] 실 사용자 홈 config 가 이 파일 실행으로 생성·수정되지 않았음.
  expect(homeAfter.exists).toBe(homeBefore.exists)
  expect(homeAfter.mtimeMs).toBe(homeBefore.mtimeMs)
  expect(homeAfter.content).toBe(homeBefore.content)
  // [2중 방어 검증] 폴백 userData 조차 *쓰이지 않았다* = 모든 호출이 명시 주입을 했다.
  expect(fallbackUsed).toBe(false)
})

beforeEach(() => {
  h.spawn.mockClear()
  h.spawn.mockReturnValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules() // 모듈 캐시 초기화로 sdkCache 상태 리셋
})

// ══════════════════════════════════════════════════════════════════════════════
// 1. maskSecrets 헬퍼 테스트
// ══════════════════════════════════════════════════════════════════════════════

describe('maskSecrets()', () => {
  it('export 존재 확인', async () => {
    const mod = await import('../../../02_Source/main/engineVersions')
    expect(typeof mod.maskSecrets).toBe('function')
  })

  it('_authToken=abc → 마스킹', async () => {
    const { maskSecrets } = await import('../../../02_Source/main/engineVersions')
    const result = maskSecrets('//registry.npmjs.org/:_authToken=abc123secret')
    expect(result).not.toContain('abc123secret')
    expect(result).toContain('***')
  })

  it('Bearer xyz → 마스킹', async () => {
    const { maskSecrets } = await import('../../../02_Source/main/engineVersions')
    const result = maskSecrets('Authorization: Bearer xyz-secret-token')
    expect(result).not.toContain('xyz-secret-token')
    expect(result).toContain('***')
  })

  it('URL 자격증명 https://user:pass@host → 마스킹', async () => {
    const { maskSecrets } = await import('../../../02_Source/main/engineVersions')
    const result = maskSecrets('fetching https://user:pass@registry.npmjs.org/pkg')
    expect(result).not.toContain('user:pass')
    expect(result).toContain('***')
  })

  it(':_password=secret → 마스킹', async () => {
    const { maskSecrets } = await import('../../../02_Source/main/engineVersions')
    const result = maskSecrets('//registry.npmjs.org/:_password=mysecretpwd')
    expect(result).not.toContain('mysecretpwd')
    expect(result).toContain('***')
  })

  it('_auth=base64val → 마스킹', async () => {
    const { maskSecrets } = await import('../../../02_Source/main/engineVersions')
    const result = maskSecrets('//registry.npmjs.org/:_auth=bXl1c2VyOm15cGFzcw==')
    expect(result).not.toContain('bXl1c2VyOm15cGFzcw==')
    expect(result).toContain('***')
  })

  it('일반 npm 출력 — 마스킹 없음', async () => {
    const { maskSecrets } = await import('../../../02_Source/main/engineVersions')
    const line = 'npm http fetch GET 200 https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk'
    expect(maskSecrets(line)).toBe(line)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. semver 검증 — installVersion: spawn 미호출 케이스
// ══════════════════════════════════════════════════════════════════════════════

describe('installVersion() — semver 검증 (spawn 미호출 보장)', () => {
  // 이전 버전은 "spawn 0" 을 주석으로만 주장했다. 이제 mock 핸들로 실제 단언한다.
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
      const { installVersion } = await import('../../../02_Source/main/engineVersions')
      const ud = newUserData()
      const progress = vi.fn()
      const result = await installVersion(version, progress, ud)
      expect(result.ok).toBe(false)
      expect(result.error).toMatch(errRe)
      // CRITICAL: 형식 거부는 spawn 이전이어야 한다.
      expect(h.spawn).toHaveBeenCalledTimes(0)
      // 거부된 버전으로 디렉토리가 만들어지지도 않아야 한다.
      expect(fs.existsSync(path.join(ud, 'engines'))).toBe(false)
      expect(progress).not.toHaveBeenCalled()
    })
  }

  it('"1.0.0-beta.1" pre-release → semver 통과(즉시 거부 아님) → spawn 단계 진입', async () => {
    // pre-release 는 SEMVER_RE 통과 → spawn 시도. mock 이 undefined 를 반환하므로
    // engineVersions.ts 의 child null guard 가 {ok:false, 'npm spawn 실패'} 를 만든다.
    const { installVersion } = await import('../../../02_Source/main/engineVersions')
    const ud = newUserData()
    const progress = vi.fn()
    const result = await installVersion('1.0.0-beta.1', progress, ud)
    expect(result.ok).toBe(false)
    expect(result.error).not.toMatch(/invalid version.*strict semver/i)
    expect(result.error).toMatch(/spawn 실패|프로세스/i)
    expect(h.spawn).toHaveBeenCalledTimes(1)
    // 준비 단계가 샌드박스 *안*에만 썼는지 확인 (경로 주입이 실제로 먹었다는 증거)
    expect(fs.existsSync(path.join(ud, 'engines', '1.0.0-beta.1', 'package.json'))).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. 경로 containment 2단 방어
// ══════════════════════════════════════════════════════════════════════════════

describe('installVersion() — 경로 containment 2단 방어', () => {
  it('enginesDir 밖으로 탈출하는 version → 거부 (semver 단에서 선차단)', async () => {
    // path.resolve(enginesDir, '../outside') 는 enginesDir 밖이지만,
    // 그 전에 semver 검증이 먼저 걸린다. 두 방어선이 모두 서 있음을 확인한다.
    const { installVersion } = await import('../../../02_Source/main/engineVersions')
    const ud = newUserData()
    const result = await installVersion('../outside', vi.fn(), ud)
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(h.spawn).toHaveBeenCalledTimes(0)
    // 상위 디렉토리에 아무것도 만들어지지 않았음
    expect(fs.existsSync(path.join(ud, '..', 'outside'))).toBe(false)
  })

  it('버전에 경로 구분자 포함("1.2.3/../../evil") → 거부', async () => {
    const { installVersion } = await import('../../../02_Source/main/engineVersions')
    const ud = newUserData()
    const result = await installVersion('1.2.3/../../evil', vi.fn(), ud)
    expect(result.ok).toBe(false)
    expect(h.spawn).toHaveBeenCalledTimes(0)
    expect(fs.existsSync(path.join(ud, 'evil'))).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. installVersion 정상 semver 경로 — spawn mock
// ══════════════════════════════════════════════════════════════════════════════

describe('installVersion() — 유효 semver 경로', () => {
  it('유효 semver → 디렉토리 준비 + progress 첫 라인 + spawn 1회 (실 npm 0)', async () => {
    const { installVersion } = await import('../../../02_Source/main/engineVersions')
    const ud = newUserData()
    const progress = vi.fn()
    const result = await installVersion('0.3.186', progress, ud)

    // spawn mock 이 undefined → child null guard → ok:false
    expect(result.ok).toBe(false)
    expect(result.error).not.toMatch(/invalid version.*strict semver/i)
    expect(h.spawn).toHaveBeenCalledTimes(1)

    // 실 npm 이 아니라 mock 이 불렸음 + 인자가 기대대로인지
    const [cmd, args] = h.spawn.mock.calls[0] as [string, string[]]
    expect(cmd).toMatch(/^npm(\.cmd)?$/)
    expect(args).toContain('install')
    expect(args.some((a) => a.includes('@anthropic-ai/claude-agent-sdk@0.3.186'))).toBe(true)

    // 첫 progress 라인 = 설치 시작 알림
    expect(progress).toHaveBeenCalled()
    expect(String((progress.mock.calls[0][0] as { line?: string }).line)).toContain('npm install')

    // 준비 파일은 전부 주입한 userData 안
    const dir = path.join(ud, 'engines', '0.3.186')
    expect(fs.existsSync(path.join(dir, 'package.json'))).toBe(true)
  })

  it('env 화이트리스트 — spawn env 에 ANTHROPIC_API_KEY 미주입 (ADR-008)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-should-not-leak'
    try {
      const { installVersion } = await import('../../../02_Source/main/engineVersions')
      await installVersion('0.3.186', vi.fn(), newUserData())
      const opts = h.spawn.mock.calls[0][2] as { env: Record<string, string> }
      expect(opts.env).toBeDefined()
      expect(Object.keys(opts.env)).not.toContain('ANTHROPIC_API_KEY')
      expect(JSON.stringify(opts.env)).not.toContain('sk-should-not-leak')
    } finally {
      delete process.env.ANTHROPIC_API_KEY
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 5. setActive → loadActiveQuery 캐시 무효화
// ══════════════════════════════════════════════════════════════════════════════

describe('setActive() → loadActiveQuery()', () => {
  it('setActive(null) → 주입된 userData 에만 기록 + loadActiveQuery() = null', async () => {
    const { setActive, loadActiveQuery } = await import('../../../02_Source/main/engineVersions')
    const ud = newUserData()

    setActive(null, ud)

    // ⭐ 회귀 핵심: 기록이 *주입한 경로 안*에서만 일어났는가
    const cfg = path.join(ud, 'engine-config.json')
    expect(fs.existsSync(cfg)).toBe(true)
    expect(JSON.parse(fs.readFileSync(cfg, 'utf8'))).toEqual({ activeVersion: null })

    const q = await loadActiveQuery(ud)
    expect(q).toBeNull()
  })

  it('setActive(설치된 버전) → config 기록 + getVersionState.active 반영', async () => {
    const { setActive, getVersionState } = await import('../../../02_Source/main/engineVersions')
    const ud = newUserData()
    installFixture(ud, '1.2.3')

    setActive('1.2.3', ud)

    const cfg = JSON.parse(fs.readFileSync(path.join(ud, 'engine-config.json'), 'utf8'))
    expect(cfg).toEqual({ activeVersion: '1.2.3' })
    expect(getVersionState(ud).active).toBe('1.2.3')
  })

  it('setActive(미설치 버전) → throw, config 미기록', async () => {
    const { setActive } = await import('../../../02_Source/main/engineVersions')
    const ud = newUserData()
    expect(() => setActive('9.9.9', ud)).toThrow(/설치/)
    expect(fs.existsSync(path.join(ud, 'engine-config.json'))).toBe(false)
  })

  // 심층 방어(reviewer 🟡): setActive 도 strict semver 거부 — installVersion 과 일관.
  // 가드가 진입부(getUserDataPath/fs 접근 전)라 형식 불통과는 즉시 throw.
  it('setActive(비semver) → throw (형식 단에서 거부, fs 접근 전)', async () => {
    const { setActive } = await import('../../../02_Source/main/engineVersions')
    const ud = newUserData()
    expect(() => setActive('../evil', ud)).toThrow()
    expect(() => setActive('1.2', ud)).toThrow()
    expect(() => setActive('latest', ud)).toThrow()
    // fs 접근 전 거부 = userData 에 아무것도 생기지 않음
    expect(fs.readdirSync(ud)).toEqual([])
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 6. loadActiveQuery
// ══════════════════════════════════════════════════════════════════════════════

describe('loadActiveQuery()', () => {
  it('active 없음(config activeVersion:null) → null 반환', async () => {
    const { loadActiveQuery } = await import('../../../02_Source/main/engineVersions')
    const ud = newUserData()
    writeConfigFixture(ud, null)
    expect(await loadActiveQuery(ud)).toBeNull()
  })

  it('major 불일치(active=2.0.0, bundled=1.2.3) → null + 경고 (API 드리프트 방지)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    h.appDir.value = makeAppFixture('^1.2.3') // bundled major = 1

    const { loadActiveQuery } = await import('../../../02_Source/main/engineVersions')
    const ud = newUserData()
    installFixture(ud, '2.0.0', { main: 'index.js' })
    writeConfigFixture(ud, '2.0.0')

    expect(await loadActiveQuery(ud)).toBeNull()
    // 동적 로드 실패가 아니라 *major 가드*가 잡았음을 확인
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0][0])).toMatch(/major 불일치/)
  })

  it('major 일치 + 동적 로드 실패(엔트리 파일 없음) → null 반환(번들 폴백)', async () => {
    h.appDir.value = makeAppFixture('1.2.3')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { loadActiveQuery } = await import('../../../02_Source/main/engineVersions')
    const ud = newUserData()
    installFixture(ud, '1.2.3', { main: 'index.js' }) // index.js 는 만들지 않음
    writeConfigFixture(ud, '1.2.3')

    expect(await loadActiveQuery(ud)).toBeNull()
    // major 가드가 아니라 동적 로드 실패로 null 이어야 한다
    expect(warn).not.toHaveBeenCalled()
  })

  it('config 의 active 가 미설치 → null (설치 목록 대조 폴백)', async () => {
    const { loadActiveQuery } = await import('../../../02_Source/main/engineVersions')
    const ud = newUserData()
    writeConfigFixture(ud, '9.9.9')
    expect(await loadActiveQuery(ud)).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 7. getVersionState 반환 구조
// ══════════════════════════════════════════════════════════════════════════════

describe('getVersionState()', () => {
  it('설치 없음 → installed=[], active=null', async () => {
    const { getVersionState } = await import('../../../02_Source/main/engineVersions')
    const state = getVersionState(newUserData())
    expect(state.package).toBe('@anthropic-ai/claude-agent-sdk')
    expect(state.installed).toEqual([])
    expect(state.active).toBeNull()
  })

  it('bundled 버전 — 앱 package.json dependencies 에서 추출', async () => {
    h.appDir.value = makeAppFixture('^4.5.6')
    const { getVersionState } = await import('../../../02_Source/main/engineVersions')
    const state = getVersionState(newUserData())
    expect(state.package).toBe('@anthropic-ai/claude-agent-sdk')
    expect(state.bundled).toBe('4.5.6') // 범위 접두사 제거
  })

  it('설치 목록 최신순 정렬', async () => {
    const { getVersionState } = await import('../../../02_Source/main/engineVersions')
    const ud = newUserData()
    installFixture(ud, '1.2.3')
    installFixture(ud, '1.10.0')
    installFixture(ud, '0.9.9')
    expect(getVersionState(ud).installed).toEqual(['1.10.0', '1.2.3', '0.9.9'])
  })

  it('active 버전이 installed 목록에 없으면 null 폴백', async () => {
    const { getVersionState } = await import('../../../02_Source/main/engineVersions')
    const ud = newUserData()
    writeConfigFixture(ud, '9.9.9') // 미설치 버전
    expect(getVersionState(ud).active).toBeNull()
  })

  it('신뢰경계: 반환 객체에 토큰·시크릿 필드 0', async () => {
    const { getVersionState } = await import('../../../02_Source/main/engineVersions')
    const ud = newUserData()
    installFixture(ud, '1.2.3')
    writeConfigFixture(ud, '1.2.3')
    const state = getVersionState(ud)
    expect(Object.keys(state).sort()).toEqual(['active', 'bundled', 'installed', 'package'])
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 8. IPC ENGINE_INSTALL e2e 스텁 플래그
// ══════════════════════════════════════════════════════════════════════════════

describe('IPC ENGINE_INSTALL — e2e 스텁 플래그', () => {
  afterEach(() => {
    delete process.env.AGENTDECK_E2E_ENGINE_INSTALL
  })

  it('AGENTDECK_E2E_ENGINE_INSTALL 환경변수 설정/해제가 테스트 간 누수 없음', () => {
    // 핸들러(00_ipc/index.ts) 직접 호출은 e2e(Playwright) 소관.
    // 여기서는 플래그가 이 파일 밖으로 새지 않는 것만 보증한다.
    expect(process.env.AGENTDECK_E2E_ENGINE_INSTALL).toBeUndefined()
    process.env.AGENTDECK_E2E_ENGINE_INSTALL = '1'
    expect(process.env.AGENTDECK_E2E_ENGINE_INSTALL).toBe('1')
  })
})
