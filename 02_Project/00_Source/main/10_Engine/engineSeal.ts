// 엔진 봉인 (M07 G4) — G8 설계 `30_노드-구조.md` 「보호」 4(바뀜 감지)의 엔진 몫과 5(엔진 교체 확인).
// 앱의 엔진 선택(engineVersions.setActive)이 봉인을 적고, 엔진 로드(loadActiveQuery)가 실행마다 봉인을 검사한다.
// 봉인이 없거나 다르면 그 엔진 대신 번들 엔진을 쓴다(G4 결정 대장 — 번들은 앱과 함께 온 코드다).
// 봉인 파일과 엔진 폴더는 앱 세션에서 잠겨 있다(04_Claude/permission/enginePathLock.ts). CLI 세션이나 다른 프로그램이
// 고친 경우를 이 봉인이 잡는다. 봉인 파일 자체를 함께 고치면 통과한다 — L1 보호다(설계 「보호」 끝 문단).
import path from 'node:path'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { app } from 'electron'
import { getUserDataDir } from '@main/02_Common/userData'
import type { EngineSealStatus } from '../../shared/10_Engine/engine'

const PACKAGE = '@anthropic-ai/claude-agent-sdk'
const SEAL_FILE = 'engine-seal.json'

// 칸의 뜻은 shared/10_Engine/engine.ts의 EngineSealStatus 주석에 둔다 (컨트롤 패널 goal이 화면에서 읽는다)
export type SealStatus = EngineSealStatus

interface Seal {
  version: string
  entryHash: string
  manifestHash: string
}

function sealPath(userData: string): string {
  return path.join(userData, SEAL_FILE)
}

function versionDir(userData: string, version: string): string {
  return path.join(userData, 'engines', version)
}

function packageDir(userData: string, version: string): string {
  return path.join(versionDir(userData, version), 'node_modules', ...PACKAGE.split('/'))
}

export function resolveEntry(pkg: Record<string, unknown>): string | null {
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

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

// 진입 파일은 내용 해시, 버전 폴더 전체는 파일 목록(상대 경로·크기·수정 시각)의 해시.
// CLI 바이너리(수백 MB)를 실행마다 해시하지 않으려고 목록으로 본다(G4 「하지 않을 것」).
function manifestHash(root: string): string {
  const rows: string[] = []
  const walk = (dir: string): void => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, d.name)
      if (d.isDirectory()) walk(full)
      else {
        const st = fs.statSync(full)
        rows.push(`${path.relative(root, full).replace(/\\/g, '/')}|${st.size}|${Math.floor(st.mtimeMs)}`)
      }
    }
  }
  walk(root)
  return sha256(rows.sort().join('\n'))
}

function computeSeal(userData: string, version: string): Seal {
  const pkgDir = packageDir(userData, version)
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as Record<string, unknown>
  const entry = resolveEntry(pkg) ?? 'index.js'
  const entryPath = path.join(pkgDir, entry)
  return {
    version,
    // 진입 파일이 없는 엔진은 봉인은 되지만 로드에서 실패해 번들로 물러난다(기존 동작)
    entryHash: fs.existsSync(entryPath) ? sha256(fs.readFileSync(entryPath)) : 'absent',
    manifestHash: manifestHash(versionDir(userData, version)),
  }
}

export function writeSeal(userData: string, version: string): void {
  fs.writeFileSync(sealPath(userData), JSON.stringify(computeSeal(userData, version), null, 2))
}

export function removeSeal(userData: string): void {
  fs.rmSync(sealPath(userData), { force: true })
}

function parseSemver(v: string | null): [number, number, number] | null {
  const m = v?.match(/^(\d+)\.(\d+)\.(\d+)/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

export function isBelowFloor(version: string, bundled: string | null): boolean {
  const a = parseSemver(version)
  const b = parseSemver(bundled)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i]
  return false
}

export function bundledEngineVersion(): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8'))
    const spec = String(pkg?.dependencies?.[PACKAGE] ?? '').replace(/^[\^~>=<\s]+/, '')
    return spec || null
  } catch {
    return null
  }
}

// active는 부르는 쪽이 설치 목록과 대조한 활성 버전이다(없으면 null).
export function checkSeal(userData: string, active: string | null, bundled: string | null): SealStatus {
  if (!active) return 'none'
  if (isBelowFloor(active, bundled)) return 'below-floor'
  if (!fs.existsSync(sealPath(userData))) return 'missing'
  try {
    const saved = JSON.parse(fs.readFileSync(sealPath(userData), 'utf8')) as Partial<Seal>
    const now = computeSeal(userData, active)
    return saved.version === now.version && saved.entryHash === now.entryHash && saved.manifestHash === now.manifestHash
      ? 'ok'
      : 'mismatch'
  } catch {
    return 'mismatch'
  }
}

function readActive(userData: string): string | null {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(userData, 'engine-config.json'), 'utf8'))
    const v = typeof c.activeVersion === 'string' ? c.activeVersion : null
    return v && fs.existsSync(packageDir(userData, v)) ? v : null
  } catch {
    return null
  }
}

// 컨트롤 패널 goal의 「바뀜 경고」가 읽는다. 앱이 보이는 엔진 버전도 이것이 ok일 때만 활성 버전을 쓴다.
export function getSealStatus(overrideUserData?: string): SealStatus {
  const userData = overrideUserData ?? getUserDataDir()
  return checkSeal(userData, readActive(userData), bundledEngineVersion())
}
