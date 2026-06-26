/**
 * engine-versions.ts — 엔진 멀티버전 설치·관리·동적 로드
 *
 * 원본 C:/Dev/AgentCodeGUI/src/main/engine/versions.ts 를 AgentDeck 환경에 적응.
 *
 * 설계 원칙:
 *   1. **PACKAGE 격리** — '@anthropic-ai/claude-agent-sdk' 상수는 이 파일 내부만.
 *      ADR-003: 엔진 고유 식별자를 IPC 핸들러·UI에 노출 금지.
 *   2. **주입형 deps(userData)** — app.getPath('userData')는 테스트에서 주입 가능.
 *      electron 미초기화 시 try/catch로 graceful fallback.
 *   3. **신뢰경계(ADR-008)** — env 화이트리스트·시크릿 마스킹·semver 검증·경로 containment.
 *   4. **동적 로드 폴백** — 실패 시 항상 null 반환(번들 버전 폴백 보장).
 *
 * 신뢰경계 체크리스트:
 *   [v] semver strict 검증 (설치 전 최선방어)
 *   [v] 경로 containment 2단 방어 (enginesDir+sep startsWith)
 *   [v] env 화이트리스트 (ANTHROPIC_API_KEY 등 앱 시크릿 미주입)
 *   [v] 시크릿 마스킹 (_authToken·Bearer·URL creds)
 *   [v] sdkCache 무효화 (setActive 시 null)
 *   [v] major 호환 가드 (active.major !== bundled.major → null)
 *
 * 구현 위치: src/main/engine-versions.ts (src/main/ 직속, 폴더 신설 없음)
 * IPC 등록: src/main/00_ipc/index.ts (ENGINE_INSTALL·ENGINE_SET_ACTIVE·ENGINE_VERSION_STATE)
 * 소비: renderer EngineGate + agent-backend Worker(단방향 import: agent-backend→engine-versions)
 */

import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { app } from 'electron'
import type { EngineVersionState, EngineInstallProgress } from '../shared/ipc-contract'

// ── 내부 전용 상수 ────────────────────────────────────────────────────────────

/**
 * 엔진 npm 패키지명 — 이 파일 내부에만 격리 (ADR-003).
 * IPC 계약·렌더러·기타 모듈에 문자열 직접 노출 금지.
 */
const PACKAGE = '@anthropic-ai/claude-agent-sdk'

/**
 * strict semver 정규식.
 * 허용: 1.2.3 / 1.2.3-beta.1 / 1.2.3-rc.0
 * 거부: 1.2 / ^1.2.3 / latest / 1.0.0; rm / ../evil 등
 *
 * 보안 근거(auditor 🔴): version은 untrusted(renderer에서 옴).
 *   npm install ${PACKAGE}@${version} —— version 미검증 시 셸 주입 가능.
 *   semver 정규식 통과만 npm 인자화 허용.
 */
const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.]+)?$/

// ── userData 경로 — electron 주입형 ──────────────────────────────────────────

/**
 * userData 절대경로 조회.
 *
 * 테스트: 주입 매개변수로 대체 가능 → app.getPath 없이 Vitest 직접 테스트.
 * 프로덕션: app.getPath('userData') — electron ready 이후에만 유효.
 * electron 미초기화(테스트·standalone): try/catch → '/tmp/agentdeck-dev' 폴백.
 *
 * CRITICAL: app.getPath('userData') 직접 모듈 최상위 호출 금지 — 초기화 전 throw.
 */
function getUserDataPath(overrideUserData?: string): string {
  if (overrideUserData) return overrideUserData
  try {
    return app.getPath('userData')
  } catch {
    // electron 미초기화 또는 테스트 환경
    return path.join(os.homedir(), '.agentdeck-dev')
  }
}

// ── 내부 유틸 ─────────────────────────────────────────────────────────────────

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

/** 설치된 버전의 실제 version 문자열 읽기 (없으면 null) */
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

/** semver 내림차순 비교 */
function compareDesc(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0)
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** 유효 설치 목록 (최신순) */
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

/** 번들 버전 읽기 — app.getAppPath()의 package.json.dependencies 에서 추출 */
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

/** semver major 추출 (실패 시 -1) */
function major(version: string | null): number {
  if (!version) return -1
  const m = version.match(/^(\d+)/)
  return m ? parseInt(m[1], 10) : -1
}

/** exports 필드에서 엔트리 경로 해석 (원본 resolveEntry 미러) */
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

// ── 시크릿 마스킹 ─────────────────────────────────────────────────────────────

/**
 * npm stdout/stderr 라인에서 자격증명 패턴을 마스킹한다.
 *
 * 마스킹 대상 (auditor 🟡):
 *   - `_authToken=<value>` — npmrc registry 인증 토큰
 *   - `:_password=<value>` — legacy npmrc 비밀번호
 *   - `_auth=<value>` — base64 인코딩 자격증명
 *   - `Bearer <token>` — Authorization 헤더 토큰
 *   - `//host:port:user@host` 또는 `https://user:pass@host` URL 자격증명
 *
 * CRITICAL(ADR-008): 마스킹 후에도 npm 설치 진행 정보를 전달해야 함.
 *   완전 제거가 아닌 `***`로 치환하여 디버깅 가능성 유지.
 *
 * export: 테스트에서 직접 검증 가능.
 */
export function maskSecrets(line: string): string {
  return line
    // _authToken=value, :_password=value, _auth=value
    .replace(/(_authToken|:_password|_auth)=\S+/g, '$1=***')
    // Bearer <token>
    .replace(/Bearer\s+\S+/g, 'Bearer ***')
    // URL 자격증명: //user:pass@host 또는 https://user:pass@host
    .replace(/\/\/[^/\s:]+:[^@\s]+@/g, '//***:***@')
}

// ── sdkCache (동적 로드 캐시) ─────────────────────────────────────────────────

/** 동적 로드 캐시 — setActive 시 반드시 null로 무효화 (auditor 🔴) */
let sdkCache: { version: string; query: QueryFn } | null = null

// ── 공개 API ──────────────────────────────────────────────────────────────────

/**
 * 버전 상태 조회.
 *
 * 반환: { package, bundled, active, installed }
 *   - package: 엔진 패키지명 (항상 PACKAGE 상수)
 *   - bundled: 앱 번들 SDK 버전 (탐지 불가 시 null)
 *   - active: 현재 활성 설치 버전 (null=번들 사용)
 *   - installed: 설치 목록 (최신순)
 *
 * CRITICAL: 반환값에 토큰·시크릿 0 (ADR-008).
 *
 * @param overrideUserData 테스트용 userData 경로 주입 (생략 시 실 app.getPath)
 */
export function getVersionState(overrideUserData?: string): EngineVersionState {
  const userData = getUserDataPath(overrideUserData)
  const installed = listInstalled(userData)
  let active = readConfig(userData).activeVersion
  // 설정된 버전이 실제 미설치 → null 폴백 (silent)
  if (active && !installed.includes(active)) active = null
  return { package: PACKAGE, bundled: bundledVersion(), active, installed }
}

/**
 * 활성 버전 전환.
 *
 * CRITICAL:
 *   - version 비null이면 installed 목록에 있는지 검증.
 *   - sdkCache를 null로 무효화 → loadActiveQuery가 다음 호출에 재로드 (auditor 🔴).
 *
 * @param version 활성화할 버전 (null=번들로 복귀)
 * @param overrideUserData 테스트용 userData 경로 주입
 * @throws Error 미설치 버전 지정 시
 */
export function setActive(version: string | null, overrideUserData?: string): void {
  // 심층 방어(reviewer 🟡): installVersion과 일관되게 strict semver 가드를 **진입부**에서.
  // fs/electron 접근(getUserDataPath) 전에 형식부터 거부 — installedVersionAt 실존 검증보다 앞.
  if (version !== null && !SEMVER_RE.test(version)) {
    throw new Error(`invalid version: "${version}" — strict semver(X.Y.Z) 형식만 허용됩니다.`)
  }
  const userData = getUserDataPath(overrideUserData)
  if (version && installedVersionAt(userData, version) == null) {
    throw new Error(`버전 ${version}이(가) 설치되어 있지 않습니다.`)
  }
  writeConfig(userData, { activeVersion: version })
  // CRITICAL: sdkCache 무효화 — 다음 loadActiveQuery 호출이 새 버전을 로드하도록
  sdkCache = null
}

/**
 * 엔진 버전 설치.
 *
 * 보안 체계 (auditor 🔴/🟡):
 *   1. strict semver 검증 → 불통과 시 즉시 {ok:false} (spawn 미호출)
 *   2. 경로 containment 2단 방어 → enginesDir 외부면 거부
 *   3. env 화이트리스트 → ANTHROPIC_API_KEY 등 앱 시크릿 미주입
 *   4. 시크릿 마스킹 → progress 라인 전달 전 maskSecrets 적용
 *   5. Windows .cmd + shell:true + 공백 인용 (CVE-2024-27980 미러)
 *
 * @param version 설치할 버전 (untrusted — strict semver 검증)
 * @param onProgress 진행 콜백 (마스킹된 npm 출력)
 * @param overrideUserData 테스트용 userData 경로 주입
 */
export async function installVersion(
  version: string,
  onProgress: (p: EngineInstallProgress) => void,
  overrideUserData?: string
): Promise<{ ok: boolean; error?: string }> {
  // ── 1. strict semver 검증 (auditor 🔴) ──────────────────────────────────────
  if (!SEMVER_RE.test(version)) {
    const error = `invalid version: "${version}" — strict semver(X.Y.Z) 형식만 허용됩니다.`
    return { ok: false, error }
  }

  const userData = getUserDataPath(overrideUserData)
  // 심층 방어(reviewer 🟡): eDir도 resolve로 정규화해 dir과 동일 기준으로 비교.
  const eDir = path.resolve(enginesDir(userData))
  const sep = path.sep

  // ── 2. 경로 containment 2단 방어 (auditor 🔴) ─────────────────────────────────
  const dir = path.resolve(eDir, version)
  // resolve 후 enginesDir 내부인지 재확인 (version에 '/' 포함 시 탈출 방지)
  if (!dir.startsWith(eDir + sep) && dir !== eDir) {
    const error = `containment 위반: "${dir}" 는 engines 디렉토리 밖입니다.`
    return { ok: false, error }
  }

  // ── 디렉토리 준비 ────────────────────────────────────────────────────────────
  try {
    await fsp.mkdir(dir, { recursive: true })
    // 독립 package.json — npm이 상위 package.json으로 걸어올라가지 않도록
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

  // ── 3. env 화이트리스트 (auditor 🟡) ──────────────────────────────────────────
  // process.env 전체 주입 금지 — 앱 시크릿(ANTHROPIC_API_KEY 등) 미포함
  // 시스템 필수 변수만 화이트리스트로 선택 전달
  const env: Record<string, string> = {}
  const allowedKeys = [
    'PATH', 'Path', 'PATHEXT',      // 실행 경로
    'SystemRoot', 'windir',          // Windows 시스템
    'APPDATA', 'LOCALAPPDATA',       // Windows 앱 데이터
    'USERPROFILE', 'HOME',           // 홈 디렉토리
    'TEMP', 'TMP',                   // 임시 디렉토리
    'ComSpec',                       // 셸 (Windows)
    'NODE_PATH',                     // Node.js 모듈 경로
    'npm_config_cache',              // npm 캐시 경로
    'npm_config_prefix',             // npm 전역 prefix
  ]
  for (const key of allowedKeys) {
    const val = process.env[key]
    if (typeof val === 'string') env[key] = val
  }

  // ── 4. npm spawn (Windows .cmd + shell:true, CVE-2024-27980 미러) ────────────
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

  // 초기 진행 라인 — 설치 시작 알림
  onProgress({ version, line: `$ npm install ${PACKAGE}@${version}` })

  return await new Promise((resolve) => {
    // Windows: 공백 포함 인자 인용 (CVE-2024-27980 패치 이후 shell:true 필요)
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

    // spawn이 undefined를 반환한 경우 방어 (mock/비정상 환경)
    if (!child) {
      const error = 'npm spawn 실패: 프로세스를 시작할 수 없습니다.'
      onProgress({ version, done: true, ok: false, error })
      resolve({ ok: false, error })
      return
    }

    // ── 5. 시크릿 마스킹 후 progress 전달 (auditor 🟡) ────────────────────────────
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
        // 성공 마커 기록 (best-effort)
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
          /* best-effort — 마커 실패는 설치 실패가 아님 */
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

/**
 * 활성 설치 버전에서 query 함수를 동적 로드.
 *
 * 반환 null 케이스:
 *   - active 없음 → 번들 폴백
 *   - major 호환 가드: active.major !== bundled.major → null (API shape 드리프트 방지, auditor 🟡)
 *   - dynamic import 실패 → null (번들 폴백 안전망)
 *   - query 함수 미존재 → null
 *
 * 캐시: sdkCache 히트 시 즉시 반환. setActive 시 null로 무효화됨.
 *
 * CRITICAL: ClaudeCodeBackend를 import하지 않음 (ADR-003 역방향 금지).
 *   agent-backend Worker가 engine-versions를 단방향 import한다.
 *
 * @param overrideUserData 테스트용 userData 경로 주입
 */
export async function loadActiveQuery(overrideUserData?: string): Promise<QueryFn | null> {
  const state = getVersionState(overrideUserData)
  const { active } = state

  if (!active) return null

  // 캐시 히트
  if (sdkCache?.version === active) return sdkCache.query

  // ── major 호환 가드 (auditor 🟡) ───────────────────────────────────────────────
  // active major !== bundled major → 동적 로드 거부 (API shape 드리프트 방지)
  const activeMajor = major(active)
  const bundledMajor = major(state.bundled)
  if (bundledMajor !== -1 && activeMajor !== -1 && activeMajor !== bundledMajor) {
    console.warn(
      `[engine-versions] major 불일치: active=${active}(major ${activeMajor}) !== ` +
      `bundled major ${bundledMajor} — 동적 로드 거부, 번들 폴백.`
    )
    return null
  }

  // ── 동적 로드 ─────────────────────────────────────────────────────────────────
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
