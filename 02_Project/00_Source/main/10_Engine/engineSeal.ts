// 봉인이 없거나 다르면 그 엔진 대신 번들 엔진(앱과 함께 온 코드)을 쓴다.
// 앱 세션에서는 봉인 파일과 엔진 폴더가 잠겨 있어(enginePathLock.ts), 이 봉인은 CLI 세션이나 다른 프로그램이 고친 경우를 잡는다.
// 봉인 파일까지 함께 고치면 통과한다(L1 보호).
// 설치본은 파일 약 8천 개라 목록 걷기가 0.4~0.8초다. 그래서 상태 칸은 동기 빠른 검사(quickSeal)를, 로드는 비동기
// 전체 검사(fullSeal, 파일 목록 포함)를 쓴다. 상태 칸의 파일 목록 판정은 마지막 전체 검사(또는 앱의 선택)의 결과다.
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { readInstalledSdkVersion, SDK_VERSION_FALLBACK } from './sdkVersion'
import { writeFileAtomicSync } from '@main/05_Loop/realPorts/atomicWrite'
import type { EngineSealStatus } from '../../shared/10_Engine/engine'

const PACKAGE = '@anthropic-ai/claude-agent-sdk'
const SEAL_FILE = 'engine-seal.json'
// 앱 영역 안의 위쪽 node_modules. 그 위(사용자 홈 등)는 앱 밖이라 다른 프로그램이 정당하게 둘 수 있어 보지 않는다
const UPPER_MODULES = [['engines', 'node_modules'], ['node_modules']] as const

// 칸의 뜻은 shared/10_Engine/engine.ts의 EngineSealStatus 주석에 둔다
type SealStatus = EngineSealStatus

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

function entryHash(userData: string, version: string): string {
  const pkgDir = packageDir(userData, version)
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as Record<string, unknown>
  const entryPath = path.join(pkgDir, resolveEntry(pkg) ?? 'index.js')
  // 진입 파일이 없는 엔진은 봉인은 되지만 로드에서 실패해 번들로 물러난다(기존 동작)
  return fs.existsSync(entryPath) ? sha256(fs.readFileSync(entryPath)) : 'absent'
}

// 내용 대신 파일 목록(상대 경로·크기·수정 시각·바뀜 시각)을 해시한다. 실측: 설치본 7968개·402MB의 내용 해시는
// 6.3~16.6초, 목록만은 0.15초였다. 수정 시각은 utimes로 되돌릴 수 있지만 ctime은 못 되돌려 함께 싣는다.
function row(root: string, full: string, st: fs.Stats): string {
  return `${path.relative(root, full).replace(/\\/g, '/')}|${st.size}|${Math.floor(st.mtimeMs)}|${st.ctimeMs}`
}

function manifestHashSync(root: string): string {
  const rows: string[] = []
  const walk = (dir: string): void => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, d.name)
      if (d.isDirectory()) walk(full)
      else rows.push(row(root, full, fs.statSync(full)))
    }
  }
  walk(root)
  return sha256(rows.sort().join('\n'))
}

async function manifestHashAsync(root: string): Promise<string> {
  const rows: string[] = []
  const walk = async (dir: string): Promise<void> => {
    const entries = await fsp.readdir(dir, { withFileTypes: true })
    await Promise.all(
      entries.map(async (d) => {
        const full = path.join(dir, d.name)
        if (d.isDirectory()) await walk(full)
        else rows.push(row(root, full, await fsp.stat(full)))
      })
    )
  }
  await walk(root)
  return sha256(rows.sort().join('\n'))
}

// 앱의 선택 때 한 번 동기로 계산한다(사람이 누른 한 번이라 걷기 비용을 감수한다).
export function computeSeal(userData: string, version: string): Seal {
  return { version, entryHash: entryHash(userData, version), manifestHash: manifestHashSync(versionDir(userData, version)) }
}

export function writeSeal(userData: string, seal: Seal): void {
  fs.mkdirSync(userData, { recursive: true })
  writeFileAtomicSync(sealPath(userData), JSON.stringify(seal, null, 2))
  lastFull.set(userData, { seal: sealKey(seal), status: 'ok' })
}

export function removeSeal(userData: string): void {
  fs.rmSync(sealPath(userData), { force: true })
  lastFull.delete(userData)
}

export function readSeal(userData: string): Seal | null {
  try {
    const s = JSON.parse(fs.readFileSync(sealPath(userData), 'utf8')) as Partial<Seal>
    return typeof s.version === 'string' && typeof s.entryHash === 'string' && typeof s.manifestHash === 'string'
      ? { version: s.version, entryHash: s.entryHash, manifestHash: s.manifestHash }
      : null
  } catch {
    return null
  }
}

export function sealKey(s: Seal): string {
  return `${s.version}|${s.entryHash}|${s.manifestHash}`
}

// 마지막 전체 검사의 판정. 봉인이 다시 적히면(키가 바뀌면) 버린다.
const lastFull = new Map<string, { seal: string; status: 'ok' | 'mismatch' }>()

function parseSemver(v: string | null): { n: [number, number, number]; pre: boolean } | null {
  const m = v?.match(/^(\d+)\.(\d+)\.(\d+)(-)?/)
  return m ? { n: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] === '-' } : null
}

export function isBelowFloor(version: string, floor: string | null): boolean {
  const a = parseSemver(version)
  const b = parseSemver(floor)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a.n[i] !== b.n[i]) return a.n[i] < b.n[i]
  return a.pre && !b.pre
}

// 하한은 실제로 설치된 번들 SDK 버전이다. 못 읽으면 앱 package.json의 의존 명세, 그것도 없으면 폴백 상수.
function floorVersion(bundledSpec: string | null): string {
  return readInstalledSdkVersion() ?? bundledSpec ?? SDK_VERSION_FALLBACK
}

// 목록을 뺀 검사. 'ok'면 봉인(saved)도 돌려준다.
// active는 설정의 활성 버전 가운데 설치 목록에 있는 것이고, installed는 그 폴더의 패키지 version이다.
function baseSeal(userData: string, active: string | null, installed: string | null, bundledSpec: string | null): { status: SealStatus; saved?: Seal } {
  const hasSeal = fs.existsSync(sealPath(userData))
  // 고른 엔진이 없는데 봉인이 남아 있으면 설정이나 폴더가 앱 밖에서 지워진 것이다
  if (!active) return { status: hasSeal ? 'mismatch' : 'none' }
  if (installed !== active) return { status: 'mismatch' }
  // 버전 폴더 위쪽의 node_modules는 Node가 의존을 찾으며 올라가는 길이다 — 앱이 만들지 않으니 있으면 바뀜이다
  if (UPPER_MODULES.some((p) => fs.existsSync(path.join(userData, ...p)))) return { status: 'mismatch' }
  if (isBelowFloor(active, floorVersion(bundledSpec))) return { status: 'below-floor' }
  if (!hasSeal) return { status: 'missing' }
  const saved = readSeal(userData)
  if (!saved || saved.version !== active) return { status: 'mismatch' }
  try {
    if (saved.entryHash !== entryHash(userData, active)) return { status: 'mismatch' }
  } catch {
    return { status: 'mismatch' }
  }
  return { status: 'ok', saved }
}

export function quickSeal(userData: string, active: string | null, installed: string | null, bundledSpec: string | null): SealStatus {
  const { status, saved } = baseSeal(userData, active, installed, bundledSpec)
  if (status !== 'ok' || !saved) return status
  const last = lastFull.get(userData)
  return last && last.seal === sealKey(saved) ? last.status : 'ok'
}

export async function fullSeal(userData: string, active: string | null, installed: string | null, bundledSpec: string | null): Promise<SealStatus> {
  const { status, saved } = baseSeal(userData, active, installed, bundledSpec)
  if (status !== 'ok' || !saved || !active) return status
  let listed: 'ok' | 'mismatch'
  try {
    listed = saved.manifestHash === (await manifestHashAsync(versionDir(userData, active))) ? 'ok' : 'mismatch'
  } catch {
    listed = 'mismatch'
  }
  lastFull.set(userData, { seal: sealKey(saved), status: listed })
  return listed
}
