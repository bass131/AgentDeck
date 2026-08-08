import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { app } from 'electron'
import type { EngineVersionState, EngineInstallProgress } from '../../shared/ipcContract'

const PACKAGE = '@anthropic-ai/claude-agent-sdk'

const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.]+)?$/

function getUserDataPath(overrideUserData?: string): string {
  if (overrideUserData) return overrideUserData
  try {
    return app.getPath('userData')
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

function compareDesc(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0)
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function listInstalled(userData: string): string[] {
  let names: string[] = []
  try {
    names = fs
      .readdirSync(enginesDir(userData), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }
  return names.filter((v) => installedVersionAt(userData, v) != null).sort(compareDesc)
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

function resolveEntry(pkg: Record<string, unknown>): string | null {
  const exp = pkg.exports as unknown
  const dot = exp && typeof exp === 'object' ? (exp as Record<string, unknown>)['.'] ?? exp : exp
  if (typeof dot === 'string') return dot
  if (dot && typeof dot === 'object') {
    const o = dot as Record<string, unknown>
    for (const key of ['import', 'module', 'node', 'default']) {
      if (typeof o[key] === 'string') return o[key] as string
    }
  }
  if (typeof pkg.module === 'string') return pkg.module
  if (typeof pkg.main === 'string') return pkg.main
  return 'index.js'
}

export function maskSecrets(line: string): string {
  return line
    .replace(/(_authToken|:_password|_auth)=\S+/g, '$1=***')
    .replace(/Bearer\s+\S+/g, 'Bearer ***')
    .replace(/\/\/[^/\s:]+:[^@\s]+@/g, '//***:***@')
}

let sdkCache: { version: string; query: QueryFn } | null = null

export function getVersionState(overrideUserData?: string): EngineVersionState {
  const userData = getUserDataPath(overrideUserData)
  const installed = listInstalled(userData)
  let active = readConfig(userData).activeVersion
  if (active && !installed.includes(active)) active = null
  return { package: PACKAGE, bundled: bundledVersion(), active, installed }
}

export function setActive(version: string | null, overrideUserData?: string): void {
  if (version !== null && !SEMVER_RE.test(version)) {
    throw new Error(`invalid version: "${version}" — strict semver(X.Y.Z) 형식만 허용됩니다.`)
  }
  const userData = getUserDataPath(overrideUserData)
  if (version && installedVersionAt(userData, version) == null) {
    throw new Error(`버전 ${version}이(가) 설치되어 있지 않습니다.`)
  }
  writeConfig(userData, { activeVersion: version })
  sdkCache = null
}

export async function installVersion(
  version: string,
  onProgress: (p: EngineInstallProgress) => void,
  overrideUserData?: string
): Promise<{ ok: boolean; error?: string }> {
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

  try {
    await fsp.mkdir(dir, { recursive: true })
    await fsp.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify(
        { name: `agentdeck-engine-${version}`, version: '0.0.0', private: true },
        null,
        2
      )
    )
  } catch (e) {
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
    '--prefix', dir,
    '--no-audit',
    '--no-fund',
    '--loglevel=http',
  ]

  onProgress({ version, line: `$ npm install ${PACKAGE}@${version}` })

  return await new Promise((resolve) => {
    const spawnArgs = isWin ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args
    let child: ReturnType<typeof spawn> | undefined
    try {
      child = spawn(npmCmd, spawnArgs, {
        cwd: dir,
        env,
        windowsHide: true,
        shell: isWin,
      })
    } catch (e) {
      const error = `npm spawn 실패: ${(e as Error).message}`
      onProgress({ version, done: true, ok: false, error })
      resolve({ ok: false, error })
      return
    }

    if (!child) {
      const error = 'npm spawn 실패: 프로세스를 시작할 수 없습니다.'
      onProgress({ version, done: true, ok: false, error })
      resolve({ ok: false, error })
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

    child.on('error', (e) => {
      const error = `npm 실행 실패: ${e.message}. npm(Node.js)이 설치돼 있고 PATH에 있는지 확인하세요.`
      onProgress({ version, done: true, ok: false, error })
      resolve({ ok: false, error })
    })

    child.on('close', (code) => {
      const installed = installedVersionAt(userData, version)
      if (code === 0 && installed) {
        try {
          fs.writeFileSync(path.join(dir, '.installed'), installed)
          fs.writeFileSync(
            path.join(dir, 'manifest.json'),
            JSON.stringify(
              { package: PACKAGE, version: installed, installedAt: new Date().toISOString() },
              null,
              2
            )
          )
        } catch {
        }
        onProgress({ version, done: true, ok: true })
        resolve({ ok: true })
      } else {
        const error = `설치 실패 (npm 종료 코드 ${code})`
        onProgress({ version, done: true, ok: false, error })
        resolve({ ok: false, error })
      }
    })
  })
}

export async function loadActiveQuery(overrideUserData?: string): Promise<QueryFn | null> {
  const state = getVersionState(overrideUserData)
  const { active } = state

  if (!active) return null

  if (sdkCache?.version === active) return sdkCache.query

  const activeMajor = major(active)
  const bundledMajor = major(state.bundled)
  if (bundledMajor !== -1 && activeMajor !== -1 && activeMajor !== bundledMajor) {
    console.warn(
      `[engine-versions] major 불일치: active=${active}(major ${activeMajor}) !== ` +
      `bundled major ${bundledMajor} — 동적 로드 거부, 번들 폴백.`
    )
    return null
  }

  try {
    const userData = getUserDataPath(overrideUserData)
    const pkgDir = packageDir(userData, active)
    const pkg = JSON.parse(await fsp.readFile(path.join(pkgDir, 'package.json'), 'utf8'))
    const entry = resolveEntry(pkg)
    if (!entry) return null
    const url = pathToFileURL(path.join(pkgDir, entry)).href
    const mod = await import(/* @vite-ignore */ url)
    const query = (mod.query ?? mod.default?.query) as QueryFn | undefined
    if (typeof query !== 'function') return null
    sdkCache = { version: active, query }
    return query
  } catch {
    return null
  }
}
