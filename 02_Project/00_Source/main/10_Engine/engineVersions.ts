import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { app } from 'electron'
import { getUserDataDir } from '@main/02_Common/userData'
import type { EngineVersionState, EngineInstallProgress } from '../../shared/ipcContract'
import type { EngineSealStatus } from '../../shared/10_Engine/engine'
import { computeSeal, fullSeal, quickSeal, readSeal, removeSeal, resolveEntry, sealKey, writeSeal } from './engineSeal'
import { cmpVer } from './engineCheckUpdate'

const PACKAGE = '@anthropic-ai/claude-agent-sdk'

const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.]+)?$/

function getUserDataPath(overrideUserData?: string): string {
  if (overrideUserData) return overrideUserData
  try {
    return getUserDataDir()
  } catch {
    throw new Error(
      'engineVersions: electron userData 경로를 가져올 수 없습니다(app.getPath 실패 — ' +
        'electron 미초기화). 테스트·standalone 실행에서는 overrideUserData 매개변수로 ' +
        '경로를 직접 주입하세요.'
    )
  }
}

type QueryFn = (arg: unknown) => unknown

interface Config {
  activeVersion: string | null
}

function enginesDir(userData: string): string {
  return path.join(userData, 'engines')
}

function configPath(userData: string): string {
  return path.join(userData, 'engine-config.json')
}

function readConfig(userData: string): Config {
  try {
    const raw = fs.readFileSync(configPath(userData), 'utf8')
    const c = JSON.parse(raw)
    return { activeVersion: typeof c.activeVersion === 'string' ? c.activeVersion : null }
  } catch {
    return { activeVersion: null }
  }
}

function writeConfig(userData: string, c: Config): void {
  fs.mkdirSync(userData, { recursive: true })
  fs.writeFileSync(configPath(userData), JSON.stringify(c, null, 2))
}

function packageDir(userData: string, version: string): string {
  return path.join(enginesDir(userData), version, 'node_modules', ...PACKAGE.split('/'))
}

function installedVersionAt(userData: string, version: string): string | null {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(packageDir(userData, version), 'package.json'), 'utf8')
    )
    return typeof pkg.version === 'string' ? pkg.version : null
  } catch {
    return null
  }
}

function listInstalled(userData: string): string[] {
  let names: string[] = []
  try {
    names = fs
      .readdirSync(enginesDir(userData), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name)
  } catch {
    return []
  }
  return names.filter((v) => installedVersionAt(userData, v) != null).sort((a, b) => cmpVer(b, a))
}

function bundledVersion(): string | null {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8')
    )
    const spec = String(pkg?.dependencies?.[PACKAGE] ?? '')
    const ver = spec.replace(/^[\^~>=<\s]+/, '')
    return ver || null
  } catch {
    return null
  }
}

function major(version: string | null): number {
  if (!version) return -1
  const m = version.match(/^(\d+)/)
  return m ? parseInt(m[1], 10) : -1
}

export function maskSecrets(line: string): string {
  return line
    .replace(/(_authToken|:_password|_auth)=\S+/g, '$1=***')
    .replace(/Bearer\s+\S+/g, 'Bearer ***')
    .replace(/\/\/[^/\s:]+:[^@\s]+@/g, '//***:***@')
}

let sdkCache: { userData: string; version: string; seal: string; query: QueryFn } | null = null

// 이 프로세스가 불러온 엔진의 봉인. 같은 URL의 import()는 이미 불러온 모듈을 돌려주므로(Node ESM 캐시),
// 같은 버전이 다른 내용으로 다시 봉인되면 재시작 전까지 그 엔진을 쓰지 않는다 (G4 검수 사소 2).
const loadedSeals = new Map<string, string>()

function needsRestart(userData: string, version: string): boolean {
  const loaded = loadedSeals.get(`${userData}|${version}`)
  const saved = readSeal(userData)
  return loaded !== undefined && saved !== null && loaded !== sealKey(saved)
}

function withRestart(userData: string, active: string | null, s: EngineSealStatus): EngineSealStatus {
  return s === 'ok' && active && needsRestart(userData, active) ? 'restart' : s
}

export function getVersionState(overrideUserData?: string): EngineVersionState {
  const userData = getUserDataPath(overrideUserData)
  const installed = listInstalled(userData)
  let active = readConfig(userData).activeVersion
  if (active && !installed.includes(active)) active = null
  const bundled = bundledVersion()
  const pkgVersion = active ? installedVersionAt(userData, active) : null
  const seal = withRestart(userData, active, quickSeal(userData, active, pkgVersion, bundled))
  return { package: PACKAGE, bundled, active, installed, seal }
}

export function setActive(version: string | null, overrideUserData?: string): void {
  if (version !== null && !SEMVER_RE.test(version)) {
    throw new Error(`invalid version: "${version}" — strict semver(X.Y.Z) 형식만 허용됩니다.`)
  }
  const userData = getUserDataPath(overrideUserData)
  if (version) {
    const pkgVersion = installedVersionAt(userData, version)
    if (pkgVersion == null) throw new Error(`버전 ${version}이(가) 설치되어 있지 않습니다.`)
    if (pkgVersion !== version) throw new Error(`폴더 ${version}에 설치된 패키지 버전이 ${pkgVersion}입니다.`)
  }
  // 앱의 엔진 선택이 곧 사람 확인이다 — 고른 엔진을 봉인하고, 지우면 봉인도 지운다 (M07 G4)
  // 봉인을 먼저 계산하고 쓴다. 실패하면 설정은 그대로라 이전 선택이 남는다(봉인이 어긋나면 번들로 물러난다).
  if (version) {
    writeSeal(userData, computeSeal(userData, version))
    writeConfig(userData, { activeVersion: version })
  } else {
    writeConfig(userData, { activeVersion: null })
    removeSeal(userData)
  }
  sdkCache = null
}

type InstallResult = { ok: boolean; error?: string }

export async function installVersion(
  version: string,
  onProgress: (p: EngineInstallProgress) => void,
  overrideUserData?: string
): Promise<InstallResult> {
  if (!SEMVER_RE.test(version)) {
    const error = `invalid version: "${version}" — strict semver(X.Y.Z) 형식만 허용됩니다.`
    return { ok: false, error }
  }

  const userData = getUserDataPath(overrideUserData)
  const eDir = path.resolve(enginesDir(userData))
  const sep = path.sep

  const dir = path.resolve(eDir, version)
  if (!dir.startsWith(eDir + sep) && dir !== eDir) {
    const error = `containment 위반: "${dir}" 는 engines 디렉토리 밖입니다.`
    return { ok: false, error }
  }

  // 빈 임시 형제 폴더에 설치하고 성공하면 바꿔 끼운다 — 미리 놓인 package-lock·node_modules를 npm이 쓰지 않고(M07-9),
  // 실패하면 기존 버전 폴더가 그대로 남는다(M11 G3 검수 — 활성 버전의 재설치 실패가 엔진을 지우지 않는다)
  const work = path.join(eDir, `.${version}.tmp-${process.pid}-${Date.now()}`)
  try {
    await fsp.mkdir(work, { recursive: true })
    await fsp.writeFile(
      path.join(work, 'package.json'),
      JSON.stringify(
        { name: `agentdeck-engine-${version}`, version: '0.0.0', private: true },
        null,
        2
      )
    )
  } catch (e) {
    await fsp.rm(work, { recursive: true, force: true }).catch(() => {})
    return { ok: false, error: `폴더 생성 실패: ${(e as Error).message}` }
  }

  const env: Record<string, string> = {}
  const allowedKeys = [
    'PATH', 'Path', 'PATHEXT',
    'SystemRoot', 'windir',
    'APPDATA', 'LOCALAPPDATA',
    'USERPROFILE', 'HOME',
    'TEMP', 'TMP',
    'ComSpec',
    'NODE_PATH',
    'npm_config_cache',
    'npm_config_prefix',
  ]
  for (const key of allowedKeys) {
    const val = process.env[key]
    if (typeof val === 'string') env[key] = val
  }

  const isWin = process.platform === 'win32'
  const npmCmd = isWin ? 'npm.cmd' : 'npm'
  const args = [
    'install',
    `${PACKAGE}@${version}`,
    '--prefix', work,
    '--no-audit',
    '--no-fund',
    '--loglevel=http',
  ]

  onProgress({ version, line: `$ npm install ${PACKAGE}@${version}` })

  const fail = async (error: string): Promise<InstallResult> => {
    await fsp.rm(work, { recursive: true, force: true }).catch(() => {})
    onProgress({ version, done: true, ok: false, error })
    return { ok: false, error }
  }

  // 새 설치본을 버전 폴더 자리에 끼운다 — 옛 폴더를 옆으로 옮긴 뒤 이름을 바꾸고, 끼우지 못하면 옛 폴더를 되돌린다
  const swapIn = async (): Promise<string | null> => {
    const old = path.join(eDir, `.${version}.old-${process.pid}-${Date.now()}`)
    const hadOld = fs.existsSync(dir)
    try {
      if (hadOld) await fsp.rename(dir, old)
    } catch (e) {
      return `기존 버전 폴더를 옮기지 못했습니다(사용 중일 수 있습니다): ${(e as Error).message}`
    }
    try {
      await fsp.rename(work, dir)
    } catch (e) {
      if (hadOld) await fsp.rename(old, dir).catch(() => {})
      return `새 설치본을 끼우지 못했습니다: ${(e as Error).message}`
    }
    if (hadOld) await fsp.rm(old, { recursive: true, force: true }).catch(() => {})
    return null
  }

  return await new Promise((resolve) => {
    const spawnArgs = isWin ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args
    let child: ReturnType<typeof spawn> | undefined
    try {
      child = spawn(npmCmd, spawnArgs, {
        cwd: work,
        env,
        windowsHide: true,
        shell: isWin,
      })
    } catch (e) {
      void fail(`npm spawn 실패: ${(e as Error).message}`).then(resolve)
      return
    }

    if (!child) {
      void fail('npm spawn 실패: 프로세스를 시작할 수 없습니다.').then(resolve)
      return
    }

    const onData = (buf: Buffer): void => {
      for (const line of buf.toString().split(/\r?\n/)) {
        const t = line.trim()
        if (t) onProgress({ version, line: maskSecrets(t) })
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)

    let settled = false
    const settle = (p: Promise<InstallResult>): void => {
      if (settled) return
      settled = true
      void p.then(resolve)
    }

    child.on('error', (e) => {
      settle(fail(`npm 실행 실패: ${e.message}. npm(Node.js)이 설치돼 있고 PATH에 있는지 확인하세요.`))
    })

    child.on('close', (code) => {
      const installed = installedVersionAt(userData, path.basename(work))
      if (code !== 0 || !installed) {
        settle(fail(`설치 실패 (npm 종료 코드 ${code})`))
        return
      }
      settle((async (): Promise<InstallResult> => {
        try {
          fs.writeFileSync(path.join(work, '.installed'), installed)
          fs.writeFileSync(
            path.join(work, 'manifest.json'),
            JSON.stringify(
              { package: PACKAGE, version: installed, installedAt: new Date().toISOString() },
              null,
              2
            )
          )
        } catch {
        }
        const swapError = await swapIn()
        if (swapError) return fail(swapError)
        onProgress({ version, done: true, ok: true })
        return { ok: true }
      })())
    })
  })
}

export async function loadActiveQuery(overrideUserData?: string): Promise<QueryFn | null> {
  const state = getVersionState(overrideUserData)
  const { active } = state

  if (!active) return null

  const activeMajor = major(active)
  const bundledMajor = major(state.bundled)
  if (bundledMajor !== -1 && activeMajor !== -1 && activeMajor !== bundledMajor) {
    console.warn(
      `[engine-versions] major 불일치: active=${active}(major ${activeMajor}) !== ` +
      `bundled major ${bundledMajor} — 동적 로드 거부, 번들 폴백.`
    )
    return null
  }

  // M07 G4: 봉인은 캐시보다 먼저, 실행마다 본다 — 앱 밖에서 바뀐 엔진은 이미 불러온 적이 있어도 쓰지 않는다.
  // 파일 목록까지 보는 전체 검사는 비동기라 main 스레드를 막지 않는다(실제 설치본 약 8천 개 파일).
  const userData = getUserDataPath(overrideUserData)
  const seal = state.seal === 'ok'
    ? withRestart(userData, active, await fullSeal(userData, active, installedVersionAt(userData, active), state.bundled))
    : state.seal
  if (seal !== 'ok') {
    const how = seal === 'restart'
      ? '다시 고른 내용은 앱을 재시작하면 쓰인다.'
      : '봉인은 앱의 엔진 선택(지금은 엔진 업데이트 알림)만 다시 적는다.'
    console.warn(`[engine-versions] 엔진 봉인 ${seal}: active=${active} — 동적 로드 거부, 번들 폴백. ${how}`)
    return null
  }

  const saved = readSeal(userData)
  if (!saved) return null
  const key = sealKey(saved)
  if (sdkCache?.userData === userData && sdkCache.version === active && sdkCache.seal === key) return sdkCache.query

  const failKey = `${userData}|${active}|${key}`
  try {
    const pkgDir = packageDir(userData, active)
    const pkg = JSON.parse(await fsp.readFile(path.join(pkgDir, 'package.json'), 'utf8'))
    const entry = resolveEntry(pkg)
    if (!entry) throw new Error('진입 파일 없음')
    const url = pathToFileURL(path.join(pkgDir, entry)).href
    const mod = await import(/* @vite-ignore */ url)
    loadedSeals.set(`${userData}|${active}`, key)
    const query = (mod.query ?? mod.default?.query) as QueryFn | undefined
    if (typeof query !== 'function') throw new Error('query 함수 없음')
    sdkCache = { userData, version: active, seal: key, query }
    loadFailed.delete(failKey)
    return query
  } catch {
    loadFailed.add(failKey)
    return null
  }
}

// 봉인은 맞지만 불러오기에 실패한 엔진(사용자 데이터·버전·봉인) — 그때 번들이 돈다(M11 G3, M07-12)
const loadFailed = new Set<string>()

// 실행이 실제로 쓰는 활성 엔진. 봉인이 맞고, major가 번들과 같고, 같은 봉인으로 불러오기에 실패한 적이 없을 때만. 아니면 null(번들이 돈다)
export function activeInUse(state: EngineVersionState, overrideUserData?: string): string | null {
  const { active, seal } = state
  if (seal !== 'ok' || !active) return null
  const bundledMajor = major(state.bundled)
  if (bundledMajor !== -1 && major(active) !== -1 && major(active) !== bundledMajor) return null
  const userData = getUserDataPath(overrideUserData)
  const saved = readSeal(userData)
  if (saved && loadFailed.has(`${userData}|${active}|${sealKey(saved)}`)) return null
  return active
}
