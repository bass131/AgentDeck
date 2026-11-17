// M07 G4 엔진 봉인 — 앱이 고른 엔진만 불러오고, 앱 밖에서 바뀌면 번들 엔진으로 물러난다.
// 임시 userData에 가짜 엔진(진입 파일 index.mjs)을 두고 공개 경로(setActive·loadActiveQuery·getSealStatus)로만 본다.
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'

const h = vi.hoisted(() => {
  const base = (process.env.TMPDIR || process.env.TEMP || process.env.TMP || '/tmp').replace(/[\\/]+$/, '')
  const root = `${base}/agentdeck-seal-${process.pid}-${Date.now()}`
  return { root, userData: { value: `${root}/_ud` }, appDir: { value: `${root}/_app` } }
})

vi.mock('electron', () => {
  const app = { getPath: (): string => h.userData.value, getAppPath: (): string => h.appDir.value }
  return { app, default: { app } }
})

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

function installEngine(ud: string, version: string): string {
  const dir = pkgDir(ud, version)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@anthropic-ai/claude-agent-sdk', version, main: 'index.mjs' }))
  fs.writeFileSync(path.join(dir, 'index.mjs'), `export const query = () => 'engine-${version}'\n`)
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
})

const quiet = (): ReturnType<typeof vi.spyOn> => vi.spyOn(console, 'warn').mockImplementation(() => {})

describe('엔진 봉인 (M07 G4)', () => {
  it('앱이 고르면 봉인이 생기고, 그대로면 그 엔진을 불러온다', async () => {
    const { setActive, loadActiveQuery } = await import('@main/10_Engine/engineVersions')
    const { getSealStatus } = await import('@main/10_Engine/engineSeal')
    const ud = newUserData()
    installEngine(ud, '1.4.0')
    setActive('1.4.0', ud)
    expect(fs.existsSync(path.join(ud, 'engine-seal.json'))).toBe(true)
    expect(getSealStatus(ud)).toBe('ok')
    const { getVersionState } = await import('@main/10_Engine/engineVersions')
    expect(getVersionState(ud).seal).toBe('ok')
    const q = (await loadActiveQuery(ud)) as (() => string) | null
    expect(q?.()).toBe('engine-1.4.0')
  })

  it('진입 파일이 앱 밖에서 바뀌면 불러오지 않는다 — 이미 불러온 뒤(캐시)에도 다시 본다', async () => {
    const warn = quiet()
    const { setActive, loadActiveQuery } = await import('@main/10_Engine/engineVersions')
    const { getSealStatus } = await import('@main/10_Engine/engineSeal')
    const ud = newUserData()
    const dir = installEngine(ud, '1.4.0')
    setActive('1.4.0', ud)
    expect(await loadActiveQuery(ud)).not.toBeNull()
    fs.writeFileSync(path.join(dir, 'index.mjs'), `export const query = () => 'tampered'\n`)
    expect(getSealStatus(ud)).toBe('mismatch')
    expect(await loadActiveQuery(ud)).toBeNull()
    // main 로그는 상태와 되돌리는 길(엔진 화면에서 다시 고르기)을 함께 적는다
    expect(warn.mock.calls.some((c) => /봉인 mismatch.*엔진 화면/.test(String(c[0])))).toBe(true)
  })

  it('엔진 폴더에 파일이 더해지면 불러오지 않는다', async () => {
    quiet()
    const { setActive, loadActiveQuery } = await import('@main/10_Engine/engineVersions')
    const { getSealStatus } = await import('@main/10_Engine/engineSeal')
    const ud = newUserData()
    installEngine(ud, '1.4.0')
    setActive('1.4.0', ud)
    fs.writeFileSync(path.join(ud, 'engines', '1.4.0', 'node_modules', 'extra.js'), 'x')
    expect(getSealStatus(ud)).toBe('mismatch')
    expect(await loadActiveQuery(ud)).toBeNull()
  })

  it('설정 파일만 앱 밖에서 다른 버전으로 바꾸면 불러오지 않는다', async () => {
    quiet()
    const { setActive, loadActiveQuery } = await import('@main/10_Engine/engineVersions')
    const { getSealStatus } = await import('@main/10_Engine/engineSeal')
    const ud = newUserData()
    installEngine(ud, '1.4.0')
    installEngine(ud, '1.5.0')
    setActive('1.4.0', ud)
    fs.writeFileSync(path.join(ud, 'engine-config.json'), JSON.stringify({ activeVersion: '1.5.0' }))
    expect(getSealStatus(ud)).toBe('mismatch')
    expect(await loadActiveQuery(ud)).toBeNull()
  })

  it('봉인 없이 설정만 있으면(앱 밖에서 씀, 또는 봉인 도입 전) 불러오지 않는다', async () => {
    quiet()
    const { loadActiveQuery } = await import('@main/10_Engine/engineVersions')
    const { getSealStatus } = await import('@main/10_Engine/engineSeal')
    const ud = newUserData()
    installEngine(ud, '1.4.0')
    fs.writeFileSync(path.join(ud, 'engine-config.json'), JSON.stringify({ activeVersion: '1.4.0' }))
    expect(getSealStatus(ud)).toBe('missing')
    expect(await loadActiveQuery(ud)).toBeNull()
  })

  it('봉인 파일이 깨져 있으면 missing이 아니라 mismatch다 (누가 건드렸다)', async () => {
    const { setActive } = await import('@main/10_Engine/engineVersions')
    const { getSealStatus } = await import('@main/10_Engine/engineSeal')
    const ud = newUserData()
    installEngine(ud, '1.4.0')
    setActive('1.4.0', ud)
    fs.writeFileSync(path.join(ud, 'engine-seal.json'), '{not json')
    expect(getSealStatus(ud)).toBe('mismatch')
  })

  it('번들보다 낮은 버전은 앱이 골라도 불러오지 않는다', async () => {
    quiet()
    const { setActive, loadActiveQuery } = await import('@main/10_Engine/engineVersions')
    const { getSealStatus } = await import('@main/10_Engine/engineSeal')
    const ud = newUserData()
    installEngine(ud, '1.2.0')
    setActive('1.2.0', ud)
    expect(getSealStatus(ud)).toBe('below-floor')
    expect(await loadActiveQuery(ud)).toBeNull()
  })

  it('선택을 지우면 봉인도 지우고, 상태는 none이다', async () => {
    const { setActive } = await import('@main/10_Engine/engineVersions')
    const { getSealStatus } = await import('@main/10_Engine/engineSeal')
    const ud = newUserData()
    installEngine(ud, '1.4.0')
    setActive('1.4.0', ud)
    setActive(null, ud)
    expect(fs.existsSync(path.join(ud, 'engine-seal.json'))).toBe(false)
    expect(getSealStatus(ud)).toBe('none')
  })

  it('빈 userData(첫 실행·e2e)는 none이고 번들 엔진을 쓴다', async () => {
    const { loadActiveQuery } = await import('@main/10_Engine/engineVersions')
    const { getSealStatus } = await import('@main/10_Engine/engineSeal')
    const ud = newUserData()
    expect(getSealStatus(ud)).toBe('none')
    expect(await loadActiveQuery(ud)).toBeNull()
  })

  it('앱이 보이는 엔진 버전은 봉인이 맞을 때만 활성 버전이다', async () => {
    quiet()
    const ud = newUserData()
    h.userData.value = ud
    const dir = installEngine(ud, '1.4.0')
    const { setActive } = await import('@main/10_Engine/engineVersions')
    setActive('1.4.0')
    const { ClaudeCodeBackend } = await import('@main/04_Claude/ClaudeCodeBackend')
    expect(await new ClaudeCodeBackend().version()).toBe('1.4.0')
    fs.writeFileSync(path.join(dir, 'index.mjs'), 'tampered')
    expect(await new ClaudeCodeBackend().version()).not.toBe('1.4.0')
  })
})
