// M09 G2 검수 차단 1 — 실행기 git 설정 대조. 실행기 git·gh는 자격 있는 환경으로 돈다. 작업 노드 세션이 로컬 설정
// (core.fsmonitor, filter.*.clean + .gitattributes, core.pager 등)이나 전역 ~/.gitconfig(credential.helper 등)를 심으면
// 실행기의 다음 git 호출이 그 코드를 자격과 함께 돌린다. 그래서:
//   - 열 때 `git config --list --show-origin --includes -z`(로컬·전역·시스템·include 전부)의 스냅숏과, 전역 설정 파일 후보들의
//     sha256을 앱 영역(<appData>/git-config/<repoKey>.json)에 적는다.
//   - 실행기의 모든 git 호출 직전(gitPort의 guard)과 gh 호출 직전(ghPort의 guard)에 다시 떠서 대조한다. 다르면 그 호출을 돌리지 않고
//     던진다. 실행기(loopRunner)는 단계 앞뒤로 check()를 보고, 바뀌었으면 위조 래치를 걸고 사람을 부른다.
//   - 실행기 hooksPath(앱 영역, 만들지 않는 경로)에 무엇이 생겨도 바뀐 것으로 본다.
//   - 한 번 바뀌면 메모리에 남는다 — 되돌려도 계속 사유를 돌려준다.
//   - 열 때 지난 실행이 적은 스냅숏과 다르면 열지 않는다. 사람이 확인하고 그 키를 지운(되돌린) 뒤 다시 연다.
// G2 재검수 중요 D — 스냅숏 파일을 지우고 다시 열면 심은 설정이 새 기준선이 됐다. 그래서 열 때(스냅숏이 있든 없든) 기준선과
//   관계없이, 실행기 git이 명령으로 돌릴 수 있는 위험 키(DANGER_KEY)가 로컬 설정(include로 들어온 것 포함)에 있으면 열지 않는다.
//   전역·시스템 설정은 사용자 자신의 것이라 이 검사에서 뺀다(전역 파일은 열린 뒤의 해시 대조가 본다).
// G2 재검수 사소 — 다시 읽기의 일시 실패(시간 초과·EBUSY·읽지 못한 파일)는 짧게 다시 읽은 뒤에만 멈춤으로 본다. 바뀐 값은
//   다시 읽지 않고 바로 멈춘다(되돌릴 틈을 주지 않는다).
// 대조에서 빼는 것: branch.<이름>.remote·merge·rebase·description — 명령을 실행하지 않고, `git checkout -b x origin/y` 같은
// 평범한 로컬 작업이 쓴다. remote.<이름>.gh-resolved는 빼지 않는다 — gh가 기본 저장소를 고르는 키라 실행기 gh를 다른 저장소로
// 돌린다(G2 재검수 중요 B 실측: octocat/Hello-World를 넣으면 gh pr list가 그 저장소를 읽었다). 실행기 gh는 -R로도 고정한다(ghPort).
// 한계(겹): 대조와 그 git 호출 사이의 틈(같은 순간 세션이 쓰면), 설정 밖에서 git이 읽는 것(.gitattributes 단독은 설정 없이 명령을
// 실행하지 않는다), 환경 변수로 들어오는 설정(실행기 환경은 세션이 바꾸지 못한다).
import { createHash } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { ConfigCheck } from './ports'
import { writeFileAtomic } from './realPorts/atomicWrite'
import { runProcess, type ProcessResult } from './realPorts/exec'

export interface ConfigGuardOptions {
  cwd: string
  // 실행기 환경(자격 있음)
  env: NodeJS.ProcessEnv
  // 앱 영역의 스냅숏 파일
  snapshotFile: string
  // 실행기 git의 hooksPath — 비어 있거나 없어야 한다
  hooksPath: string
  // 설정 읽기 git(시험이 일시 실패를 흉내 낸다). 기본은 cwd·env로 git을 돈다.
  runGit?: (args: string[]) => Promise<ProcessResult>
  // 일시 실패 뒤 다시 읽기까지의 간격(기본 200ms). 다시 읽기는 모두 READ_ATTEMPTS번이다.
  retryDelayMs?: number
}

export interface ConfigGuard extends ConfigCheck {
  // 바뀌었으면 사유로 던진다(git·gh 포트가 호출 직전에 부른다).
  assert(): Promise<void>
}

export type ConfigGuardResult = { ok: true; guard: ConfigGuard } | { ok: false; reason: string }

interface Snapshot { entries: string[]; files: Record<string, string> }

export const CONFIG_CHANGED = '실행기 git 설정이 실행기 밖에서 바뀌었다'
const IGNORED = /^branch\..+\.(?:remote|merge|rebase|description)$/i
const READ_ATTEMPTS = 3
const DEFAULT_RETRY_DELAY_MS = 200

// 실행기 git·gh 환경 — 자격 묻는 창을 띄우지 않는다(무인 루프가 멈추지 않게, 세션이 심은 프롬프트가 뜨지 않게).
// 교체 객체(refs/replace)도 따르지 않는다 — gh가 부르는 git과 설정 읽기도 같다(G2 재검수 차단 A, gitPort.NO_REPLACE_ENV와 같은 값).
export function executorGitEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...base, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_NO_REPLACE_OBJECTS: '1' }
}

// ── 위험 키 (G2 재검수 중요 D) ──────────────────────────────────────────────
// 로컬 설정에 있으면 열지 않는 키 — 실행기 git(자격 있음)이 명령으로 돌릴 수 있는 것. 근거는 git-config(1)과 실행기가 쓰는 git 명령이다.
//   core.fsmonitor           status·add·diff가 훅 명령으로 돌린다(hasChanges·commitAll·diffStat). 참·거짓은 내장 데몬이라 뺀다(아래).
//   filter.<드라이버>.*       add(clean)·checkout(smudge)·process가 돌린다(commitAll·diffStat·checkout). 표준 git-lfs 값만 뺀다(아래).
//   diff.external, diff.<드라이버>.textconv·command   diff가 돌린다(diffStat의 diff --cached).
//   merge.<드라이버>.driver   .gitattributes의 merge=로 merge가 돌린다(mergeNoFf).
//   credential.*(로컬)       push·fetch·ls-remote가 자격 도우미를 돌린다. 전역의 도우미는 사용자 자신의 것이라 보지 않는다.
//   core.sshCommand·askPass·gitProxy, remote.<이름>.uploadpack·receivepack·vcs, url.<주소>.insteadOf·pushInsteadOf,
//   protocol.*.allow         원격 명령(push·fetch·ls-remote)이 그 명령·전송(ext::, 원격 도우미)을 돌린다.
//   core.alternateRefsCommand  push·receive 쪽에서 돈다.
//   include.*·includeIf.*    다른 설정 파일을 끌어온다(끌어온 키도 아래 목록으로 본다 — --includes).
//   core.hooksPath           훅 폴더. 실행기는 명령줄로 앱 영역 값을 주지만(gitPort), 로컬에 둔 값도 거부한다.
//   core.pager·editor, pager.<명령>, sequence.editor, interactive.diffFilter   명령 키다(실행기는 터미널 없이 돌고 --no-edit를 주지만 거부한다).
//   gpg.program·gpg.<형식>.program·gpg.ssh.defaultKeyCommand, commit·tag·push.gpgSign(참)   서명 때 PATH의 프로그램을 돌린다.
//   trailer.<이름>.command·cmd, submodule.<이름>.update(!명령)   커밋 트레일러·서브모듈 갱신이 돌린다.
// G2 3차 검수 사소 — 명령은 아니지만 네트워크로 자격이 새는 키:
//   http.proxy·http.<주소>.proxy(빈 값 제외)   push·fetch의 요청(인증 머리 포함)이 그 프록시를 지난다.
//   http.sslVerify·http.<주소>.sslVerify(거짓)   인증서 검증을 끈다 — 가로채기 쪽에 자격을 넘긴다.
//   http.sslCAInfo·sslCAPath(·<주소>.)   다른 CA를 믿게 한다. sslCAPath는 sslCAInfo와 같은 부류라 더했다.
//   remote.<이름>.pushurl   실행기 push(자격 있음)가 다른 주소로 간다.
//   remote.<이름>.proxy(빈 값 제외)   그 원격의 http 요청 프록시다(git-config(1)) — http.proxy와 같은 부류라 더했다.
// alias.*는 빼었다 — 실행기는 별칭을 부르지 않고, git은 내장 명령 이름의 별칭을 무시한다.
const HTTP_PROXY = /^(?:http\.(?:.+\.)?|remote\..+\.)proxy$/
const HTTP_SSL_VERIFY = /^http\.(?:.+\.)?sslverify$/
const DANGER_KEY = new RegExp([
  '^http\\.(?:.+\\.)?(?:sslcainfo|sslcapath)$', '^remote\\..+\\.pushurl$',
  '^core\\.(?:fsmonitor|sshcommand|askpass|gitproxy|alternaterefscommand|hookspath|pager|editor)$',
  '^filter\\.', '^diff\\.external$', '^diff\\..+\\.(?:textconv|command)$', '^merge\\..+\\.driver$',
  '^credential\\.', '^remote\\..+\\.(?:uploadpack|receivepack|vcs)$', '^url\\..+\\.(?:insteadof|pushinsteadof)$', '^protocol\\.',
  '^include\\.', '^includeif\\.', '^pager\\.', '^sequence\\.editor$', '^interactive\\.difffilter$',
  '^gpg\\.(?:.+\\.)?program$', '^gpg\\.ssh\\.defaultkeycommand$', '^(?:commit|tag|push)\\.gpgsign$',
  '^trailer\\..+\\.(?:command|cmd)$', '^submodule\\..+\\.update$',
].join('|'))
// `git lfs install`이 적는 표준 값 — git-lfs를 돌리지만 사용자가 그 저장소에 고른 도구다. 값이 조금이라도 다르면 위험 키다.
const LFS_STANDARD: Readonly<Record<string, string>> = {
  'filter.lfs.clean': 'git-lfs clean -- %f',
  'filter.lfs.smudge': 'git-lfs smudge -- %f',
  'filter.lfs.process': 'git-lfs filter-process',
  'filter.lfs.required': 'true',
}
const BOOL = /^(?:true|false|yes|no|on|off|1|0)?$/i
const FALSE = /^(?:false|no|off|0)$/i

function isDangerous(key: string, value: string): boolean {
  const v = value.trim()
  if (key in LFS_STANDARD) return v !== LFS_STANDARD[key]
  if (key === 'core.fsmonitor') return !BOOL.test(v)
  if (/^(?:commit|tag|push)\.gpgsign$/.test(key)) return !FALSE.test(v)
  if (/^submodule\..+\.update$/.test(key)) return v.startsWith('!')
  if (HTTP_PROXY.test(key)) return v !== ''
  if (HTTP_SSL_VERIFY.test(key)) return FALSE.test(v)
  return DANGER_KEY.test(key)
}

const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

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
function parseList(out: string): string[] {
  const parts = out.split('\0')
  const entries: string[] = []
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const origin = parts[i]
    const nl = parts[i + 1].indexOf('\n')
    const key = (nl < 0 ? parts[i + 1] : parts[i + 1].slice(0, nl)).toLowerCase()
    const value = nl < 0 ? '' : parts[i + 1].slice(nl + 1)
    if (!origin && !key) continue
    if (IGNORED.test(key)) continue
    entries.push(`${origin}\t${key}\t${value}`)
  }
  return entries.sort()
}

type Run = (args: string[]) => Promise<ProcessResult>

function runnerOf(opts: ConfigGuardOptions): Run {
  return opts.runGit ?? ((args) => runProcess('git', args, { cwd: opts.cwd, env: opts.env, timeoutMs: 30_000 }))
}

// ── ssh 설정 (G2 3차 검수) ───────────────────────────────────────────────────
// origin이 ssh면 실행기 git의 ssh가 ~/.ssh/config(ProxyCommand·Match exec·LocalCommand)를 자격과 함께 읽는다. 실행기 환경의
// GIT_SSH_COMMAND로 설정을 끄지 않는다(사용자 IdentityFile·Host 별칭이 깨진다). 대신 그 파일과 Include가 가리키는 파일을 해시로 대조한다.
// Include는 ~/.ssh 기준 상대 경로·`~`·이름 자리 와일드카드를 따라간다(깊이 4). 폴더 자리 와일드카드는 따라가지 못해 고정 표지만 남긴다(겹).
// 시스템 설정(/etc/ssh/ssh_config, %ProgramData%\ssh)은 사용자 자신의 것이라 보지 않는다. HOME과 USERPROFILE을 둘 다 본다
// (Git for Windows의 ssh는 HOME, Windows OpenSSH는 USERPROFILE).
const SSH_GLOB = /[*?[]/
const SSH_INCLUDE_DEPTH = 4

function sshWords(rest: string): string[] {
  const out: string[] = []
  for (const m of rest.matchAll(/"([^"]*)"|(\S+)/g)) out.push(m[1] ?? m[2])
  return out
}

function sshIncludes(text: string): string[] {
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*include(?:\s*=\s*|\s+)(.+)$/i.exec(line)
    if (m) out.push(...sshWords(m[1]))
  }
  return out
}

function globRegex(name: string): RegExp {
  let re = ''
  for (const ch of name) re += ch === '*' ? '.*' : ch === '?' ? '.' : ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${re}$`, 'i')
}

async function sshFiles(env: NodeJS.ProcessEnv): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const homes = [...new Set([lookup(env, 'HOME'), lookup(env, 'USERPROFILE')].filter((h): h is string => !!h).map((h) => path.resolve(h)))]
  const queue = homes.map((home) => ({ file: path.join(home, '.ssh', 'config'), home, depth: 0 }))
  while (queue.length > 0) {
    const { file, home, depth } = queue.shift() as (typeof queue)[number]
    const key = path.resolve(file)
    if (key in out) continue
    out[key] = await hashFile(key)
    if (depth >= SSH_INCLUDE_DEPTH) continue
    let text: string
    try { text = await fsp.readFile(key, 'utf8') } catch { continue }
    for (const raw of sshIncludes(text)) {
      // `~`, ${환경 변수}, %d(홈)·%%를 펼친다. 그 밖의 % 토큰·모르는 변수는 따라가지 못해 고정 표지만 남긴다(겹)
      let unresolved = false
      const p = raw.replace(/^~(?=$|[\\/])/, home)
        .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, n: string) => { const v = lookup(env, n.toUpperCase()) ?? env[n]; if (v === undefined) unresolved = true; return v ?? m })
        .replace(/%(.)/g, (m, ch: string) => {
          if (ch === 'd') return home
          if (ch === '%') return '%'
          unresolved = true
          return m
        })
      const full = path.resolve(path.isAbsolute(p) ? p : path.join(home, '.ssh', p))
      if (unresolved) { out[full] = 'token-unresolved'; continue }
      const dir = path.dirname(full)
      const name = path.basename(full)
      if (SSH_GLOB.test(dir)) { out[full] = 'glob-unresolved'; continue }
      if (!SSH_GLOB.test(name)) { queue.push({ file: full, home, depth: depth + 1 }); continue }
      let names: string[] = []
      try {
        const entries = await fsp.readdir(dir, { withFileTypes: true })
        // 폴더는 ssh도 읽지 못한다 — 건너뛴다(읽지 못한 파일로 남기면 대조마다 다시 읽기를 기다린다)
        names = entries.filter((d) => !d.isDirectory() && globRegex(name).test(d.name)).map((d) => d.name).sort()
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') names = [`unreadable:${(e as NodeJS.ErrnoException).code ?? 'error'}`]
      }
      out[full] = sha256(names.join('\n'))
      for (const n of names) if (!n.startsWith('unreadable:')) queue.push({ file: path.join(dir, n), home, depth: depth + 1 })
    }
  }
  return out
}

async function take(opts: ConfigGuardOptions, run: Run): Promise<Snapshot> {
  const all = await run(['config', '--list', '--show-origin', '--includes', '-z'])
  if (all.code !== 0) throw new Error(`git 설정을 읽지 못했다 — ${all.stderr.trim() || `exit ${all.code}`}`)
  const entries = parseList(all.stdout)
  const globalList = await run(['config', '--global', '--list', '--show-origin', '-z'])
  const origins = globalList.code === 0
    ? globalList.stdout.split('\0').filter((_, i) => i % 2 === 0).filter((o) => o.startsWith('file:')).map((o) => o.slice(5))
    : []
  const files: Record<string, string> = {}
  for (const f of new Set([...globalCandidates(opts.env), ...origins].map((p) => path.resolve(opts.cwd, p)))) files[f] = await hashFile(f)
  Object.assign(files, await sshFiles(opts.env))
  return { entries, files }
}

// ── grafts (G2 3차 검수 사소) ───────────────────────────────────────────────
// .git/info/grafts는 커밋의 부모를 바꿔치기하고 GIT_NO_REPLACE_OBJECTS로 꺼지지 않는다(실측). 있으면 열지 않고, 열린 뒤 생기면 멈춘다.
// 작업 트리의 git 폴더와 공통 폴더(worktree), 실행기 환경의 GIT_GRAFT_FILE을 본다.
async function graftFiles(run: Run, opts: ConfigGuardOptions): Promise<string[]> {
  const r = await run(['rev-parse', '--git-dir', '--git-common-dir'])
  if (r.code !== 0) throw new Error(`git 폴더를 찾지 못했다 — ${r.stderr.trim() || `exit ${r.code}`}`)
  const dirs = r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((d) => path.resolve(opts.cwd, d))
  const explicit = lookup(opts.env, 'GIT_GRAFT_FILE')
  return [...new Set([...dirs.map((d) => path.join(d, 'info', 'grafts')), ...(explicit ? [path.resolve(opts.cwd, explicit)] : [])])]
}

// 있는 grafts 파일(확인하지 못한 것 포함). 읽기 오류(ENOENT 밖)는 짧게 다시 본다.
async function graftsPresent(files: string[], delay: number): Promise<string[]> {
  const found: string[] = []
  for (const f of files) {
    for (let i = 1; ; i++) {
      try { await fsp.stat(f); found.push(f); break } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') break
        if (i >= READ_ATTEMPTS) { found.push(`${f}(확인하지 못함)`); break }
      }
      await sleep(delay)
    }
  }
  return found
}

// 읽기 실패(던짐)와 읽지 못한 파일(unreadable:*)만 다시 읽는다. 마지막 시도의 결과를 그대로 쓴다(실패면 던지고, 읽지 못한 파일은 차이로 남는다).
async function takeSteady(opts: ConfigGuardOptions, run: Run): Promise<Snapshot> {
  const delay = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  for (let i = 1; ; i++) {
    try {
      const s = await take(opts, run)
      if (i >= READ_ATTEMPTS || !Object.values(s.files).some((h) => h.startsWith('unreadable:'))) return s
    } catch (e) {
      if (i >= READ_ATTEMPTS) throw e
    }
    await sleep(delay)
  }
}

// 로컬(·worktree) 설정과 그 include에서 온 위험 키. `scope\0origin\0key\nvalue\0` 꼴을 읽는다. 읽지 못하면 던진다.
async function dangerousLocal(run: Run): Promise<string[]> {
  const r = await run(['config', '--list', '--show-scope', '--show-origin', '--includes', '-z'])
  if (r.code !== 0) throw new Error(`git 설정을 읽지 못했다 — ${r.stderr.trim() || `exit ${r.code}`}`)
  const parts = r.stdout.split('\0')
  const found: string[] = []
  for (let i = 0; i + 2 < parts.length; i += 3) {
    const scope = parts[i]
    if (scope !== 'local' && scope !== 'worktree') continue
    const kv = parts[i + 2]
    const nl = kv.indexOf('\n')
    const key = (nl < 0 ? kv : kv.slice(0, nl)).toLowerCase()
    const value = nl < 0 ? '' : kv.slice(nl + 1)
    if (isDangerous(key, value)) found.push(`${key}(${parts[i + 1].replace(/^file:/, '')})`)
  }
  return [...new Set(found)].sort()
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

// 빈 폴더·없는 폴더면 null. 읽기 오류(ENOENT 밖)는 짧게 다시 본 뒤에만 사유로 낸다.
async function hooksReason(hooksPath: string, delay: number): Promise<string | null> {
  for (let i = 1; ; i++) {
    try {
      const names = await fsp.readdir(hooksPath)
      return names.length === 0 ? null : `${CONFIG_CHANGED} — 실행기 hooksPath(${hooksPath})에 파일이 생겼다: ${list(names)}`
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      if (i >= READ_ATTEMPTS) return `${CONFIG_CHANGED} — 실행기 hooksPath(${hooksPath})를 확인하지 못했다`
    }
    await sleep(delay)
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
  const run = runnerOf(opts)
  const delay = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  // 기준선과 관계없이 먼저 본다 — 스냅숏을 지워도 심은 위험 키가 새 기준선이 되지 않는다.
  const danger = await dangerousLocal(run)
  if (danger.length > 0) {
    return {
      ok: false,
      reason: `실행기 git이 명령으로 돌릴 수 있는 키가 작업 저장소의 로컬 설정(include 포함)에 있다 — ${list(danger)}. 사람이 확인하고 그 키를 지운 뒤 다시 연다`,
    }
  }
  const grafts = await graftFiles(run, opts)
  const planted = await graftsPresent(grafts, delay)
  if (planted.length > 0) {
    return {
      ok: false,
      reason: `작업 저장소에 grafts 파일이 있다 — ${list(planted)}. 실행기 git이 병합하는 커밋의 부모를 바꿔치기한다(교체 객체 끄기로 꺼지지 않는다). 사람이 확인하고 그 파일을 지운 뒤 다시 연다`,
    }
  }
  const base = await takeSteady(opts, run)
  const stored = await readStored(opts.snapshotFile)
  if (stored !== null) {
    const keys = diff(stored, base)
    if (keys.length > 0) {
      return {
        ok: false,
        reason: `실행기 git 설정이 지난 실행이 적은 스냅숏(${opts.snapshotFile})과 다르다 — 바뀐 키: ${list(keys)}. 사람이 확인하고 그 키를 지운(되돌린) 뒤 다시 연다`,
      }
    }
  }
  const early = await hooksReason(opts.hooksPath, delay)
  if (early) return { ok: false, reason: early }
  await fsp.mkdir(path.dirname(opts.snapshotFile), { recursive: true })
  await writeFileAtomic(opts.snapshotFile, `${JSON.stringify(base, null, 2)}\n`)

  let tripped: string | null = null
  const check = async (): Promise<string | null> => {
    if (tripped) return tripped
    const hooks = await hooksReason(opts.hooksPath, delay)
    if (hooks) return (tripped = hooks)
    const graftsNow = await graftsPresent(grafts, delay)
    if (graftsNow.length > 0) return (tripped = `${CONFIG_CHANGED} — grafts 파일이 생겼다: ${list(graftsNow)}`)
    let now: Snapshot
    try { now = await takeSteady(opts, run) } catch (e) { return (tripped = `${CONFIG_CHANGED} — 설정을 다시 읽지 못했다(${(e as Error).message})`) }
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
