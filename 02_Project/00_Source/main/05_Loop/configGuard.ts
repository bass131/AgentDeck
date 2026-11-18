// M09 G2 검수 차단 1 — 실행기 git 설정 대조. 실행기 git·gh는 자격 있는 환경으로 돈다. 작업 노드 세션이 로컬 설정
// (core.fsmonitor, filter.*.clean + .gitattributes, core.pager 등)이나 전역 ~/.gitconfig(credential.helper 등)를 심으면
// 실행기의 다음 git 호출이 그 코드를 자격과 함께 돌린다. 그래서:
//   - 열 때 `git config --list --show-origin --includes -z`(로컬·전역·시스템·include 전부)의 스냅숏과, 전역 설정 파일 후보들의
//     sha256을 앱 영역(<appData>/git-config/<repoKey>.json)에 적는다.
//   - 실행기의 모든 git 호출 직전(gitPort의 guard)과 gh 호출 직전(ghPort의 guard)에 다시 떠서 대조한다. 다르면 그 호출을 돌리지 않고
//     던진다. 실행기(loopRunner)는 단계 앞뒤로 check()를 보고, 바뀌었으면 위조 래치를 걸고 사람을 부른다.
//   - 실행기 hooksPath(앱 영역, 만들지 않는 경로)에 무엇이 생겨도 바뀐 것으로 본다.
//   - 한 번 바뀌면 메모리에 남는다 — 되돌려도 계속 사유를 돌려준다.
//   - 열 때 지난 실행이 적은 스냅숏과 다르면 열지 않는다. 사람이 확인하고 그 파일을 지우면 다시 연다.
// 대조에서 빼는 것: branch.<이름>.remote·merge·rebase·description — 명령을 실행하지 않고, `git checkout -b x origin/y` 같은
// 평범한 로컬 작업이 쓴다. remote.<이름>.gh-resolved — gh가 기본 저장소를 고를 때 쓸 수 있는 키다(실측하지 않았다, 명령을 실행하지 않는다).
// 한계(겹): 대조와 그 git 호출 사이의 틈(같은 순간 세션이 쓰면), 설정 밖에서 git이 읽는 것(.gitattributes 단독은 설정 없이 명령을
// 실행하지 않는다), 환경 변수로 들어오는 설정(실행기 환경은 세션이 바꾸지 못한다).
import { createHash } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { ConfigCheck } from './ports'
import { writeFileAtomic } from './realPorts/atomicWrite'
import { runProcess } from './realPorts/exec'

export interface ConfigGuardOptions {
  cwd: string
  // 실행기 환경(자격 있음)
  env: NodeJS.ProcessEnv
  // 앱 영역의 스냅숏 파일
  snapshotFile: string
  // 실행기 git의 hooksPath — 비어 있거나 없어야 한다
  hooksPath: string
}

export interface ConfigGuard extends ConfigCheck {
  // 바뀌었으면 사유로 던진다(git·gh 포트가 호출 직전에 부른다).
  assert(): Promise<void>
}

export type ConfigGuardResult = { ok: true; guard: ConfigGuard } | { ok: false; reason: string }

interface Snapshot { entries: string[]; files: Record<string, string> }

export const CONFIG_CHANGED = '실행기 git 설정이 실행기 밖에서 바뀌었다'
const IGNORED = /^(?:branch\..+\.(?:remote|merge|rebase|description)|remote\..+\.gh-resolved)$/i

// 실행기 git·gh 환경 — 자격 묻는 창을 띄우지 않는다(무인 루프가 멈추지 않게, 세션이 심은 프롬프트가 뜨지 않게).
export function executorGitEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...base, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }
}

const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')

function lookup(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const key = Object.keys(env).find((k) => k.toUpperCase() === name)
  return key === undefined ? undefined : env[key]
}

// 전역 설정 파일 후보 — GIT_CONFIG_GLOBAL이 있으면 그것만, 없으면 ~/.gitconfig와 XDG 설정. 그리고 목록에 나온 전역 출처들.
function globalCandidates(env: NodeJS.ProcessEnv): string[] {
  const explicit = lookup(env, 'GIT_CONFIG_GLOBAL')
  if (explicit) return [explicit]
  const home = lookup(env, 'HOME') ?? lookup(env, 'USERPROFILE')
  const xdg = lookup(env, 'XDG_CONFIG_HOME') ?? (home ? path.join(home, '.config') : undefined)
  return [...(home ? [path.join(home, '.gitconfig')] : []), ...(xdg ? [path.join(xdg, 'git', 'config')] : [])]
}

async function hashFile(file: string): Promise<string> {
  try { return sha256(await fsp.readFile(file)) } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return 'absent'
    return `unreadable:${(e as NodeJS.ErrnoException).code ?? 'error'}`
  }
}

// `origin\0key\nvalue\0`의 줄들 → `origin\tkey\tvalue`(정렬). 출처는 file: 접두를 뗀 경로다.
function parseList(out: string): { entries: string[]; globals: string[] } {
  const parts = out.split('\0')
  const entries: string[] = []
  const globals: string[] = []
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const origin = parts[i]
    const nl = parts[i + 1].indexOf('\n')
    const key = (nl < 0 ? parts[i + 1] : parts[i + 1].slice(0, nl)).toLowerCase()
    const value = nl < 0 ? '' : parts[i + 1].slice(nl + 1)
    if (!origin && !key) continue
    if (IGNORED.test(key)) continue
    entries.push(`${origin}\t${key}\t${value}`)
  }
  return { entries: entries.sort(), globals }
}

async function take(opts: ConfigGuardOptions): Promise<Snapshot> {
  const run = (args: string[]): Promise<{ code: number; stdout: string; stderr: string }> =>
    runProcess('git', args, { cwd: opts.cwd, env: opts.env, timeoutMs: 30_000 })
  const all = await run(['config', '--list', '--show-origin', '--includes', '-z'])
  if (all.code !== 0) throw new Error(`git 설정을 읽지 못했다 — ${all.stderr.trim() || `exit ${all.code}`}`)
  const { entries } = parseList(all.stdout)
  const globalList = await run(['config', '--global', '--list', '--show-origin', '-z'])
  const origins = globalList.code === 0
    ? globalList.stdout.split('\0').filter((_, i) => i % 2 === 0).filter((o) => o.startsWith('file:')).map((o) => o.slice(5))
    : []
  const files: Record<string, string> = {}
  for (const f of new Set([...globalCandidates(opts.env), ...origins].map((p) => path.resolve(opts.cwd, p)))) files[f] = await hashFile(f)
  return { entries, files }
}

function keyOf(entry: string): string { return entry.split('\t')[1] ?? '' }

function diff(a: Snapshot, b: Snapshot): string[] {
  const changed = new Set<string>()
  const group = (s: Snapshot): Map<string, string> => {
    const m = new Map<string, string[]>()
    for (const e of s.entries) m.set(keyOf(e), [...(m.get(keyOf(e)) ?? []), e])
    return new Map([...m].map(([k, v]) => [k, v.join('\n')]))
  }
  const ga = group(a)
  const gb = group(b)
  for (const k of new Set([...ga.keys(), ...gb.keys()])) if (ga.get(k) !== gb.get(k)) changed.add(k)
  for (const f of new Set([...Object.keys(a.files), ...Object.keys(b.files)])) if (a.files[f] !== b.files[f]) changed.add(f)
  return [...changed].sort()
}

const list = (keys: string[]): string => (keys.length > 6 ? `${keys.slice(0, 6).join(', ')} 외 ${keys.length - 6}개` : keys.join(', '))

async function hooksReason(hooksPath: string): Promise<string | null> {
  try {
    const names = await fsp.readdir(hooksPath)
    return names.length === 0 ? null : `${CONFIG_CHANGED} — 실행기 hooksPath(${hooksPath})에 파일이 생겼다: ${list(names)}`
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    return `${CONFIG_CHANGED} — 실행기 hooksPath(${hooksPath})를 확인하지 못했다`
  }
}

async function readStored(file: string): Promise<Snapshot | null> {
  try {
    const raw = JSON.parse(await fsp.readFile(file, 'utf8')) as Partial<Snapshot>
    return Array.isArray(raw.entries) && raw.files && typeof raw.files === 'object' ? { entries: raw.entries, files: raw.files } : { entries: [], files: {} }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    return { entries: [], files: {} }
  }
}

export async function createConfigGuard(opts: ConfigGuardOptions): Promise<ConfigGuardResult> {
  const base = await take(opts)
  const stored = await readStored(opts.snapshotFile)
  if (stored !== null) {
    const keys = diff(stored, base)
    if (keys.length > 0) {
      return {
        ok: false,
        reason: `실행기 git 설정이 지난 실행이 적은 스냅숏과 다르다 — 바뀐 키: ${list(keys)}. 사람이 확인했으면 ${opts.snapshotFile}을 지우고 다시 연다`,
      }
    }
  }
  const early = await hooksReason(opts.hooksPath)
  if (early) return { ok: false, reason: early }
  await fsp.mkdir(path.dirname(opts.snapshotFile), { recursive: true })
  await writeFileAtomic(opts.snapshotFile, `${JSON.stringify(base, null, 2)}\n`)

  let tripped: string | null = null
  const check = async (): Promise<string | null> => {
    if (tripped) return tripped
    const hooks = await hooksReason(opts.hooksPath)
    if (hooks) return (tripped = hooks)
    let now: Snapshot
    try { now = await take(opts) } catch (e) { return (tripped = `${CONFIG_CHANGED} — 설정을 다시 읽지 못했다(${(e as Error).message})`) }
    const keys = diff(base, now)
    if (keys.length > 0) tripped = `${CONFIG_CHANGED} — 바뀐 키: ${list(keys)}`
    return tripped
  }
  return {
    ok: true,
    guard: {
      check,
      assert: async () => {
        const reason = await check()
        if (reason) throw new Error(reason)
      },
    },
  }
}
