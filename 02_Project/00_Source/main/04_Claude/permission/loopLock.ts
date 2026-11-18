// 루프 잠금 노드 (M09 G2) — 앱 안 마일스톤 루프의 작업 노드 세션에만 붙는 PreToolUse 잠금. 일반 앱 세션에는 붙지 않는다
// (sdkOptions.ts — 실행 입력의 loopLock이 있을 때만 넣는다. IPC 요청은 그 칸을 옮기지 않는다).
// 노드 세션은 앱 「자동」 모드로 돈다. 훅은 권한 평가의 맨 앞이라(공식 permissions 문서: 훅 → 규칙 → 모드 → canUseTool)
// 자동 모드의 허용보다 먼저, 질문 없이 거부한다. 거부하는 것:
//   ① 원격 쓰기 — git push(전역 옵션·경로로 부른 git·git-push 실행 파일 포함)·send-pack·subtree push·원격 바꾸기,
//      값으로 받은 명령(rebase -x, bisect run, submodule foreach)의 다시 판독, 명령을 실행하는 `-c` 키,
//      gh는 읽기 하위 명령(허용 목록) 밖 전부, gh api는 쓰기 메서드나 본문 옵션(-f·-F·--input)이 있으면.
//   ② 자격 꺼내기·환경 되돌리기 — gh auth, git credential*, credential-manager, 자격 없는 환경 변수의 재설정·해제(env -i 포함).
//   ③ 설정·훅 심기 — git config 쓰기(읽기 꼴만 허용), `.git/` 안 전체 쓰기.
//   ④ 실행기 몫 파일 — .agentdeck/run-state.json·verification.md와 앱 영역(userData의 loop 폴더) 쓰기, git clean -x.
//   ⑤ Claude 설정 — `.claude/`·`.mcp.json` 쓰기, 그리고 mcp__ 도구 전부(자기 자격으로 원격에 닿는다).
//   ⑥ 작업 저장소 밖 쓰기 — OS 임시 폴더와 널 장치만 빼고 거부한다(전역 ~/.gitconfig·~/.claude가 실행기와 앱에 닿는다).
//   ⑦ 셸 위치 — 잠금은 셸의 현재 위치를 모른다. cd 꼴이 보호 폴더·저장소 밖을 가리키거나 보호 이름과 함께 보이면 거부하고,
//      맨 이름 run-state.json·verification.md 쓰기는 위치와 관계없이 거부한다. 경로는 `.git`·`.claude`·`.agentdeck`가
//      어디에 있든 그 이름으로 본다(어느 저장소의 것이든).
// 노드 문서(.agentdeck/milestone-spec.md·goals/*.md·decisions.md)와 일반 소스 편집, 읽기 명령은 막지 않는다.
//
// 명령 글자 판정은 겹이다 — 보증이 아니다. 실측으로 확인한 싼 구멍만 한 줄 규칙으로 막았고, 다음은 남는다:
// 스크립트 파일, 인터프리터(node -e·python -c·perl -e), 변수 간접 참조(판독 못 한 변수는 쓰기 대상이면 거부), git apply·worktree·
// clone 같은 간접 쓰기, 패키지 관리자의 전역 쓰기. 상태 위조는 앱 쪽 다이제스트와 위조 래치(05_Loop), 실행기 git 설정은
// 실행기의 설정 대조(05_Loop/configGuard.ts)가 따로 본다. 원격 쓰기의 구조적 보증은 사용자가 범위를 좁힌 토큰이다(이 goal 밖).
// 셸 판독은 병합 거부 노드(mergeDeny.ts)의 함수를 같이 쓴다.
import os from 'node:os'
import type { ControlNodeInfo } from './controlNodes'
import {
  RE_SHELL_C,
  SHELLS,
  commandsOf,
  ghWords,
  splitSegments,
  stripHeredocBodies,
  substitutions,
  tokenize,
  windowsShellScripts,
  type Cmd,
} from './mergeDeny'

export interface LoopLockScope {
  // 작업 저장소 뿌리 — 상대 경로를 여기에 붙여 본다
  repoRoot: string
  // 앱 영역(실물은 userData의 loop 폴더) — 다이제스트·잠금·설정 스냅숏·빈 훅 폴더가 산다
  appLoopDir: string
  // 저장소 밖이어도 쓰기를 허용하는 폴더. 기본은 os.tmpdir(). `/tmp`는 늘 허용한다(Git Bash의 임시 폴더)
  tempDirs?: string[]
  // 경로 변수(APPDATA·HOME·USERPROFILE·TEMP 등) 펼치기에 쓰는 값. 기본은 이 프로세스의 환경
  vars?: Record<string, string | undefined>
}

const TAIL = ' 원격은 실행기 코드만 만지고, 작업 노드는 로컬 커밋까지만 합니다.'
const REMOTE = 'push·원격 바꾸기·PR·저장소 설정 같은 원격 쓰기는 작업 노드 세션에서 막습니다.' + TAIL
const GIT_EXEC = '명령을 실행하는 git 설정 키(-c)와 값으로 받은 명령은 작업 노드 세션에서 막습니다 — 원격 쓰기를 숨길 수 있습니다.' + TAIL
const CREDENTIAL = '원격 자격을 꺼내거나 자격 없는 환경(GH_TOKEN·GH_CONFIG_DIR·GIT_CONFIG_*·GCM_* 등)을 되돌리는 명령은 작업 노드 세션에서 막습니다.' + TAIL
const CONFIG = 'git 설정·훅·저장소 내부(.git/)는 작업 노드 세션이 바꾸지 않습니다 — 실행기의 git 동작이 그것을 읽습니다.' + TAIL
const EXECUTOR = '실행 상태(.agentdeck/run-state.json)·검증 기록(.agentdeck/verification.md)·앱 영역은 실행기만 씁니다. 노드 문서(milestone-spec.md, goals/*.md, decisions.md)는 써도 됩니다.' + TAIL
const CLAUDE = 'Claude 설정(.claude/, .mcp.json)은 작업 노드 세션이 바꾸지 않습니다 — 다음 세션의 권한·훅·MCP가 바뀝니다.' + TAIL
const OUTSIDE = '작업 저장소 밖(OS 임시 폴더 제외)에 쓰는 것은 작업 노드 세션에서 막습니다 — 전역 git·Claude 설정이 실행기와 앱에 닿습니다.' + TAIL
const UNREADABLE = '판독하지 못한 경로(모르는 변수·8.3 짧은 이름)에 쓰는 것은 작업 노드 세션에서 막습니다.' + TAIL
const CWD = '셸 위치를 보호 폴더(.git·.agentdeck·.claude·앱 영역)나 저장소 밖으로 옮기는 꼴은 작업 노드 세션에서 막습니다 — 잠금은 셸의 현재 위치를 모릅니다.' + TAIL
const MCP = 'MCP 도구는 작업 노드 세션에서 쓰지 않습니다 — 자기 자격으로 원격에 닿을 수 있습니다.' + TAIL
const TOO_DEEP = '중첩이 깊어 판독하지 못한 명령은 작업 노드 세션에서 막습니다.' + TAIL

// ── 경로 ─────────────────────────────────────────────────────────────────
interface Resolved { root: string; app: string; temps: string[]; vars: Record<string, string> }

const VAR_NAMES = ['APPDATA', 'LOCALAPPDATA', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'TMPDIR']

function lookup(env: Record<string, string | undefined>, name: string): string | undefined {
  const key = Object.keys(env).find((k) => k.toUpperCase() === name)
  return key === undefined ? undefined : env[key]
}

function resolveScope(scope: LoopLockScope): Resolved {
  const env = scope.vars ?? process.env
  const vars: Record<string, string> = {}
  for (const n of VAR_NAMES) { const v = lookup(env, n); if (v) vars[n] = v }
  vars.HOME ??= vars.USERPROFILE ?? ''
  vars.USERPROFILE ??= vars.HOME
  vars.TMPDIR ??= vars.TEMP ?? vars.TMP ?? ''
  vars.PWD = scope.repoRoot
  for (const k of Object.keys(vars)) if (!vars[k]) delete vars[k]
  const root = normalize(scope.repoRoot, scope.repoRoot)
  return {
    root,
    app: normalize(scope.appLoopDir, scope.repoRoot),
    temps: [...(scope.tempDirs ?? [os.tmpdir()]), '/tmp'].map((t) => normalize(t, scope.repoRoot)),
    vars,
  }
}

// 경로 변수와 `~`를 펼친다. 모르는 변수·명령 치환이 남으면 null(판독 못 함).
const VAR_RE = /\$env:([A-Za-z_][A-Za-z0-9_]*)|\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)|%([A-Za-z_][A-Za-z0-9_]*)%/gi
function expandVars(raw: string, vars: Record<string, string>): string | null {
  let s = raw.replace(/^~(?=$|[\\/])/, () => vars.HOME ?? '~')
  s = s.replace(VAR_RE, (m, a?: string, b?: string, c?: string, d?: string) => vars[(a ?? b ?? c ?? d ?? '').toUpperCase()] ?? m)
  return /\$[A-Za-z_{(]|%[A-Za-z_][A-Za-z0-9_]*%|`|^~/.test(s) ? null : s
}

// 판정용 정규형: `\\?\`·`\\.\` 접두를 떼고, 역슬래시→슬래시, msys 드라이브(`/c/…`)→`c:/…`, 상대는 저장소 뿌리에 붙이고,
// 마디마다 Windows가 버리는 꼬리(대체 데이터 흐름 `:…`, 끝 점·공백)를 떼고 `.`·`..`를 푼 뒤 소문자.
function normalize(raw: string, repoRoot: string): string {
  const slash = (p: string): string => p.replace(/^[\\/]{2}[?.][\\/]/, '').replace(/\\/g, '/').replace(/\/{2,}/g, '/')
  const p = slash(raw.trim()).replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:')
  const abs = /^[a-zA-Z]:/.test(p) || p.startsWith('/')
  const joined = abs ? p : `${slash(repoRoot).replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:').replace(/\/+$/, '')}/${p}`
  const out: string[] = []
  joined.split('/').forEach((seg, i) => {
    let s = seg
    if (!(i === 0 && /^[a-zA-Z]:$/.test(s))) s = s.replace(/:.*$/, '')
    if (s !== '.' && s !== '..') s = s.replace(/[. ]+$/, '')
    if ((s === '' && i > 0) || s === '.') return
    if (s === '..') { if (out.length > 1) out.pop(); return }
    out.push(s)
  })
  return out.join('/').toLowerCase()
}

type PathKind = 'executor' | 'config' | 'claude' | 'outside' | 'unreadable'

const EXECUTOR_FILE = /\/\.agentdeck\/(?:run-state\.json|verification\.md)$/
const GIT_DIR = /\/\.git(?:\/|$)/
const CLAUDE_PATH = /\/\.claude(?:\/|$)|\/\.mcp\.json$/
const BARE_EXECUTOR = /^(?:run-state\.json|verification\.md)[. ]*$/i
const SINKS = new Set(['/dev/null', '/dev/stdout', '/dev/stderr', '/dev/tty', 'nul', 'nul:', 'con', '$null'])

const under = (c: string, dir: string): boolean => c === dir || c.startsWith(dir + '/')

function kindOf(c: string, r: Resolved, destructive: boolean): PathKind | null {
  if (under(c, r.app)) return 'executor'
  if (EXECUTOR_FILE.test(c)) return 'executor'
  if (GIT_DIR.test(c)) return 'config'
  if (CLAUDE_PATH.test(c)) return 'claude'
  if (destructive && /\/\.agentdeck$/.test(c)) return 'executor'
  // 지우기·옮기기가 저장소 뿌리나 그 위를 가리키면 .git과 .agentdeck도 함께 간다
  if (destructive && under(r.root, c)) return 'config'
  if (under(c, r.root)) return c.slice(r.root.length).split('/').some((s) => /~\d/.test(s)) ? 'unreadable' : null
  return r.temps.some((t) => under(c, t)) ? null : 'outside'
}

// 와일드카드 꼴(`.agentdeck/*`, `.git/hook*/*`)은 보호 경로의 대표 이름에 맞춰 본다. 마디 첫 `*`·`?`는 점 파일에 맞지 않는다(bash 기본).
function globKind(c: string, r: Resolved, destructive: boolean): PathKind | null {
  let re = ''
  for (let i = 0; i < c.length; i++) {
    const ch = c[i]
    const segStart = i === 0 || c[i - 1] === '/'
    if (ch === '*' || ch === '?') re += (segStart ? '(?!\\.)' : '') + (ch === '*' ? '[^/]*' : '[^/]')
    else if (ch === '[') { const end = c.indexOf(']', i + 2); re += '[^/]'; i = end < 0 ? c.length : end }
    else re += ch.replace(/[.+^${}()|\\]/g, '\\$&')
  }
  const rx = new RegExp(`^${re}$`)
  const samples = [
    `${r.root}/.agentdeck/run-state.json`, `${r.root}/.agentdeck/verification.md`, `${r.root}/.git/config`, `${r.root}/.git/head`,
    `${r.root}/.git/hooks/pre-push`, `${r.root}/.git/info/exclude`, `${r.root}/.claude/settings.json`, `${r.root}/.mcp.json`,
    r.app, `${r.app}/digests`,
    ...(destructive ? [`${r.root}/.agentdeck`, `${r.root}/.git`, `${r.root}/.claude`] : []),
  ]
  const hit = samples.find((s) => rx.test(s))
  if (hit !== undefined) return kindOf(hit, r, destructive)
  const prefix = c.slice(0, c.search(/[*?[]/))
  const dir = prefix.slice(0, prefix.lastIndexOf('/'))
  return dir && kindOf(dir, r, false) === 'outside' ? 'outside' : null
}

function pathKind(raw: string, r: Resolved, destructive: boolean): PathKind | null {
  const t = raw.trim()
  if (!t || SINKS.has(t.replace(/\\/g, '/').toLowerCase())) return null
  const ex = expandVars(t, r.vars)
  if (ex === null) return 'unreadable'
  // 셸 위치를 모르므로 맨 이름의 실행기 몫 파일은 어디서든 거부한다
  if (!/[\\/]/.test(ex) && BARE_EXECUTOR.test(ex)) return 'executor'
  const c = normalize(ex, r.root)
  return /[*?[]/.test(c) ? globKind(c, r, destructive) : kindOf(c, r, destructive)
}

const REASON_OF: Record<PathKind, string> = { executor: EXECUTOR, config: CONFIG, claude: CLAUDE, outside: OUTSIDE, unreadable: UNREADABLE }
const reasonOfKind = (k: PathKind | null): string | null => (k === null ? null : REASON_OF[k])

// 편집 도구가 이 경로에 쓰면 사유를, 아니면 null을 돌려준다.
export function loopPathReason(filePath: string, scope: LoopLockScope): string | null {
  return reasonOfKind(pathKind(filePath, resolveScope(scope), false))
}

// ── 환경 변수 ────────────────────────────────────────────────────────────
// 자격 없는 환경(05_Loop/childEnv.ts)이 정한 변수들. Windows 환경 변수는 대소문자를 가리지 않는다.
const ENV_NAMES = 'GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN|GH_CONFIG_DIR|GIT_CONFIG(?:_[A-Z0-9_]+)?|GCM_[A-Z0-9_]+|GIT_ASKPASS|SSH_ASKPASS|GIT_SSH|GIT_SSH_COMMAND|SSH_AUTH_SOCK|GIT_TERMINAL_PROMPT'
const PROTECTED_ENV = new RegExp(`^(?:${ENV_NAMES})$`, 'i')
const PS_ENV_SET = new RegExp(`\\$env:(?:${ENV_NAMES})\\s*[+]?=`, 'i')
const PS_ENV_REMOVE = new RegExp(`(?:remove-item|clear-item|set-item|new-item|ri|rm|del|erase|ni)\\b[^;|\\n]*\\benv:[\\\\/]?(?:${ENV_NAMES})\\b`, 'i')
const DOTNET_ENV = new RegExp(`SetEnvironmentVariable\\s*\\(\\s*['"](?:${ENV_NAMES})['"]`, 'i')

const assignName = (t: string): string | null => /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(t)?.[1] ?? null
const protectedAssign = (t: string): boolean => { const n = assignName(t); return n !== null && PROTECTED_ENV.test(n) }

function envCmdReason(b: string, a: string[]): string | null {
  switch (b) {
    case 'env':
      for (let i = 0; i < a.length; i++) {
        const t = a[i]
        if (t === '-i' || t === '-' || t === '--ignore-environment' || protectedAssign(t)) return CREDENTIAL
        if ((t === '-u' || t === '--unset') && PROTECTED_ENV.test(a[i + 1] ?? '')) return CREDENTIAL
        if (/^-u./.test(t) && PROTECTED_ENV.test(t.slice(2))) return CREDENTIAL
        if (t.startsWith('--unset=') && PROTECTED_ENV.test(t.slice(8))) return CREDENTIAL
      }
      return null
    case 'export': case 'declare': case 'typeset': case 'local': case 'readonly': case 'set':
      return a.some(protectedAssign) ? CREDENTIAL : null
    case 'unset': case 'setx':
      return a.some((t) => PROTECTED_ENV.test(t)) ? CREDENTIAL : null
    default:
      return null
  }
}

// ── git ──────────────────────────────────────────────────────────────────
const GIT_VALUE_OPTS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env'])
const REMOTE_MUTATE = new Set(['add', 'rm', 'remove', 'rename', 'set-url', 'set-head', 'set-branches'])
const CONFIG_READ_FLAGS = new Set(['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--get-color', '--get-colorbool', '--list', '-l'])
const CONFIG_WRITE_FLAGS = new Set(['--add', '--unset', '--unset-all', '--replace-all', '--rename-section', '--remove-section', '--edit', '-e'])
const CONFIG_VALUE_OPTS = new Set(['-f', '--file', '--blob', '--type', '-t', '--default', '--comment', '--value'])
// 명령을 실행하거나 다른 설정 파일을 끌어오는 키 — 원격 쓰기·자격 꺼내기를 숨길 수 있다
const EXEC_KEY = /^(?:alias\.|filter\.|include\.|includeif\.|protocol\.|pager\.|core\.(?:pager|editor|fsmonitor|hookspath|gitproxy)$|sequence\.editor$|diff\.external$|.*\.textconv$|diff\..*\.command$|merge\..*\.driver$|gpg\.(?:.*\.)?program$|uploadpack\.packobjectshook$|remote\..*\.(?:uploadpack|receivepack)$)/

function configKeyReason(kv: string): string | null {
  const key = kv.split('=')[0].toLowerCase()
  if (key.startsWith('credential') || key === 'core.askpass' || key === 'core.sshcommand') return CREDENTIAL
  return EXEC_KEY.test(key) ? GIT_EXEC : null
}

// git config의 읽기 꼴만 허용한다 — 읽기 옵션, `get`·`list` 하위 명령, 키 하나. 나머지는 쓰기로 본다(fail-closed).
function configIsRead(rest: string[]): boolean {
  const positional: string[] = []
  let read = false
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i]
    if (CONFIG_WRITE_FLAGS.has(t)) return false
    if (CONFIG_READ_FLAGS.has(t)) { read = true; continue }
    if (CONFIG_VALUE_OPTS.has(t)) { i++; continue }
    if (t.startsWith('-')) continue
    positional.push(t.toLowerCase())
  }
  return read || positional[0] === 'get' || positional[0] === 'list' || positional.length === 1
}

const operandsOf = (args: string[]): string[] => args.filter((t) => !t.startsWith('-'))
const firstWord = (args: string[]): string | undefined => operandsOf(args)[0]?.toLowerCase()

interface Ctx { r: Resolved; depth: number }
type Check = (paths: string[], destructive: boolean) => string | null

function gitReason(args: string[], ctx: Ctx, check: Check): string | null {
  const recurse = (s: string): string | null => scriptReason(s, ctx.r, ctx.depth + 1)
  let i = 0
  for (; i < args.length; i++) {
    const t = args[i]
    if (!t.startsWith('-')) break
    if (t === '-c' || t === '--config-env') { const r = configKeyReason(args[i + 1] ?? ''); if (r) return r; i++; continue }
    if (t.startsWith('--config-env=')) { const r = configKeyReason(t.slice('--config-env='.length)); if (r) return r; continue }
    if (GIT_VALUE_OPTS.has(t)) i++
  }
  const sub = args[i]?.toLowerCase()
  const rest = args.slice(i + 1)
  if (sub === undefined) return null
  if (sub === 'push' || sub === 'send-pack' || sub === 'http-push') return REMOTE
  if ((sub === 'lfs' || sub === 'subtree') && firstWord(rest) === 'push') return REMOTE
  if (sub === 'remote') return REMOTE_MUTATE.has(firstWord(rest) ?? '') ? REMOTE : null
  if (sub === 'config') return configIsRead(rest) ? null : CONFIG
  if (sub.startsWith('credential')) return CREDENTIAL
  // 무시 목록의 파일까지 지우는 꼴 — `.agentdeck/`는 .git/info/exclude로 무시 목록에 있다. dry-run(-n)은 지우지 않는다
  if (sub === 'clean') {
    const flags = rest.filter((t) => /^-[a-zA-Z]+$/.test(t)).join('')
    if (/n/.test(flags) || rest.includes('--dry-run')) return null
    return /[xX]/.test(flags) ? EXECUTOR : null
  }
  if (sub === 'submodule') {
    const k = rest.indexOf('foreach')
    if (k >= 0) return recurse(rest.slice(k + 1).filter((t) => !t.startsWith('--')).join(' '))
  }
  if (sub === 'rebase') {
    for (let k = 0; k < rest.length; k++) {
      const t = rest[k]
      if (t === '-x' || t === '--exec') { const r = recurse(rest[k + 1] ?? ''); if (r) return r; k++; continue }
      if (t.startsWith('--exec=')) { const r = recurse(t.slice(7)); if (r) return r; continue }
      if (/^-x./.test(t)) { const r = recurse(t.slice(2)); if (r) return r }
    }
    return null
  }
  if (sub === 'bisect' && firstWord(rest) === 'run') return recurse(rest.slice(rest.findIndex((t) => t.toLowerCase() === 'run') + 1).join(' '))
  // 작업 트리 파일을 덮어쓰거나 옮기는 꼴 — 대상 경로를 본다(.claude/ 되돌리기 등)
  if (sub === 'checkout' || sub === 'restore' || sub === 'mv' || sub === 'rm') {
    const paths: string[] = []
    for (let k = 0; k < rest.length; k++) {
      const t = rest[k]
      if (t === '-s' || t === '--source' || t === '-b' || t === '-B') { k++; continue }
      if (!t.startsWith('-')) paths.push(t)
    }
    return check(paths, sub === 'mv' || sub === 'rm')
  }
  return null
}

// ── gh ───────────────────────────────────────────────────────────────────
// 허용 목록 — 읽기 하위 명령만. 목록 밖(별칭·확장·설정 쓰기 포함)은 원격 쓰기로 본다(fail-closed). auth는 자격 꺼내기다.
// 도움말 꼴(`--help`·`-h`)도 따로 풀지 않는다 — `--body -h`처럼 값 자리의 `-h`가 통로가 된다(병합 거부 노드와 같다).
const GH_READ: Readonly<Record<string, readonly string[] | '*'>> = {
  pr: ['view', 'list', 'status', 'diff', 'checks', 'checkout'],
  issue: ['view', 'list', 'status'],
  repo: ['view', 'list', 'clone'],
  run: ['view', 'list', 'watch', 'download'],
  workflow: ['view', 'list'],
  label: ['list'],
  cache: ['list'],
  config: ['get', 'list'],
  search: '*',
  status: '*',
  help: '*',
  version: '*',
}
const WRITE_METHOD = /^(?:POST|PUT|PATCH|DELETE)$/i
const API_BODY_OPTS = new Set(['-f', '-F', '--field', '--raw-field', '--input'])

function apiIsWrite(args: string[]): boolean {
  for (let i = 0; i < args.length; i++) {
    const t = args[i]
    if (t === '-X' || t === '--method') { if (WRITE_METHOD.test(args[i + 1] ?? '')) return true; i++; continue }
    if (/^-X./.test(t) && WRITE_METHOD.test(t.slice(2))) return true
    if (t.startsWith('--method=') && WRITE_METHOD.test(t.slice(9))) return true
    if (API_BODY_OPTS.has(t) || /^-[fF]./.test(t) || /^--(?:field|raw-field|input)=/.test(t)) return true
  }
  return false
}

function ghReason(args: string[]): string | null {
  const [group, verb] = ghWords(args).map((w) => w.toLowerCase())
  if (group === undefined) return null
  if (group === 'auth') return CREDENTIAL
  if (group === 'api') return apiIsWrite(args) ? REMOTE : null
  const allowed = GH_READ[group]
  if (allowed === '*') return null
  return allowed !== undefined && verb !== undefined && allowed.includes(verb) ? null : REMOTE
}

// ── 쓰기 명령 ────────────────────────────────────────────────────────────
// 명백한 쓰기 꼴만 본다 — 인자 전부가 대상인 명령, 마지막 인자(또는 -t·-Destination)가 대상인 복사, 제자리 편집(sed·perl -i),
// dd of=, 내려받기(curl -o·wget -O)와 풀기(tar -C·unzip -d). 복사·풀기 대상은 폴더일 수 있어 그 안 전체로 본다.
const WRITE_ALL = new Set([
  'rm', 'rmdir', 'unlink', 'mv', 'touch', 'truncate', 'shred', 'ln', 'chmod', 'chown', 'tee', 'mklink',
  'del', 'erase', 'rd', 'move', 'ren', 'rename',
  'remove-item', 'ri', 'move-item', 'mi', 'rename-item', 'rni', 'new-item', 'ni',
  'set-content', 'sc', 'add-content', 'ac', 'clear-content', 'clc', 'out-file',
])
const DESTRUCTIVE = new Set(['rm', 'rmdir', 'unlink', 'mv', 'shred', 'del', 'erase', 'rd', 'move', 'ren', 'rename', 'remove-item', 'ri', 'move-item', 'mi', 'rename-item', 'rni'])
const WRITE_LAST = new Set(['cp', 'install', 'rsync', 'scp', 'copy', 'xcopy', 'robocopy', 'copy-item', 'cpi'])
const CD = new Set(['cd', 'pushd', 'chdir', 'set-location', 'sl', 'push-location'])
// PowerShell 이름 인자 — `-Destination x`·`-Destination:x`
const PS_DEST = /^-(?:destination|dest|target)$/i
const PS_PATH = /^-(?:destination|dest|target|path|literalpath|lp|pspath|filepath)$/i
const PS_PATH_COLON = /^-(?:destination|dest|target|path|literalpath|lp|pspath|filepath):(.+)$/i

interface Target { path: string; destructive: boolean }

// 값 옵션 하나(`-o x`, `-ox`, `--output x`, `--output=x`)의 값들. short는 묶음 끝 글자로도 받는다(`-sSLo x`).
function optionValues(args: string[], short: string | null, long: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const t = args[i]
    if (long.includes(t)) { if (args[i + 1] !== undefined) out.push(args[++i]); continue }
    const eq = long.find((l) => t.startsWith(l + '='))
    if (eq) { out.push(t.slice(eq.length + 1)); continue }
    if (short === null || t.startsWith('--') || !t.startsWith('-')) continue
    if (t === `-${short}` || (new RegExp(`^-[a-zA-Z]+${short}$`).test(t))) { if (args[i + 1] !== undefined) out.push(args[++i]); continue }
    if (t.startsWith(`-${short}`) && t.length > 2) out.push(t.slice(2))
  }
  return out
}

function psValues(args: string[], re: RegExp): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const m = PS_PATH_COLON.exec(args[i])
    if (m && re.test(args[i].split(':')[0])) out.push(m[1])
    else if (re.test(args[i]) && args[i + 1] !== undefined) out.push(args[++i])
  }
  return out
}

const baseOf = (p: string): string => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? p

function writeTargets(b: string, a: string[]): Target[] {
  const operands = operandsOf(a)
  if (WRITE_ALL.has(b)) {
    const destructive = DESTRUCTIVE.has(b)
    return [...operands, ...psValues(a, PS_PATH)].map((path) => ({ path, destructive }))
  }
  if (WRITE_LAST.has(b)) {
    const named = [...psValues(a, PS_DEST), ...optionValues(a, 't', ['--target-directory'])]
    const dest = named[0] ?? operands[operands.length - 1]
    if (dest === undefined) return []
    const sources = [...operands, ...psValues(a, /^-(?:path|literalpath|lp)$/i)].filter((s) => s !== dest)
    return [{ path: dest, destructive: true }, ...sources.map((s) => ({ path: `${dest}/${baseOf(s)}`, destructive: false }))]
  }
  if ((b === 'sed' || b === 'perl') && a.some((t) => /^-[a-zA-Z]*i/.test(t) || t.startsWith('--in-place'))) {
    return operands.map((path) => ({ path, destructive: false }))
  }
  if (b === 'dd') return a.filter((t) => t.startsWith('of=')).map((t) => ({ path: t.slice(3), destructive: false }))
  if (b === 'curl') return optionValues(a, 'o', ['--output']).map((path) => ({ path, destructive: false }))
  if (b === 'wget') {
    return [
      ...optionValues(a, 'O', ['--output-document']).map((path) => ({ path, destructive: false })),
      ...optionValues(a, 'P', ['--directory-prefix']).map((path) => ({ path, destructive: true })),
    ]
  }
  if (b === 'tar') {
    return [
      ...optionValues(a, 'C', ['--directory']).map((path) => ({ path, destructive: true })),
      ...optionValues(a, 'f', ['--file']).map((path) => ({ path, destructive: false })),
    ]
  }
  if (b === 'unzip') return optionValues(a, 'd', []).map((path) => ({ path, destructive: true }))
  return []
}

// 따옴표 밖 `>`·`>>`·`>|`·`&>`·`>&파일`의 대상 낱말. `>&2` 같은 파일 설명자 복제는 대상이 아니다.
// 마디 나누기 전의 원문에서 찾는다 — `|`·`&`에서 나누면 `>|`·`>&`의 대상이 떨어져 나간다.
function redirectTargets(text: string): string[] {
  const out: string[] = []
  let quote: '"' | "'" | null = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\' && quote === '"') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '\\') { i++; continue }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch !== '>') continue
    let j = i + 1
    if (text[j] === '>' || text[j] === '|') j++
    if (text[j] === '&') { if (/[0-9-]/.test(text[j + 1] ?? '')) { i = j + 1; continue } j++ }
    while (text[j] === ' ' || text[j] === '\t') j++
    let word = ''
    const q = text[j]
    if (q === '"' || q === "'") {
      const end = text.indexOf(q, j + 1)
      word = text.slice(j + 1, end < 0 ? text.length : end)
      j = end < 0 ? text.length : end + 1
    } else {
      while (j < text.length && !/[\s;&|<>()]/.test(text[j])) word += text[j++]
    }
    if (word) out.push(word)
    i = j - 1
  }
  return out
}

// ── 판독 ─────────────────────────────────────────────────────────────────
interface Segment { tokens: string[]; cmds: Cmd[] }
interface Parsed { scripts: string[]; segments: Segment[]; ok: boolean }

// 스크립트를 명령 마디로 편다 — 명령 치환(`$( )`·백틱), 셸 `-c`, Windows 셸(cmd /c·powershell -Command)의 안쪽까지.
function parse(script: string, depth: number, out: Parsed): void {
  if (depth > 4) { out.ok = false; return }
  const text = stripHeredocBodies(script.replace(/\\\r?\n/g, ' '))
  out.scripts.push(text)
  for (const sub of substitutions(text)) parse(sub, depth + 1, out)
  for (const seg of splitSegments(text)) {
    const tokens = tokenize(seg)
    const cmds = commandsOf(tokens)
    out.segments.push({ tokens, cmds })
    for (const c of cmds) {
      if (SHELLS.has(c.base)) {
        const k = c.args.findIndex((t) => RE_SHELL_C.test(t))
        if (k >= 0 && k + 1 < c.args.length) parse(c.args[k + 1], depth + 1, out)
        continue
      }
      for (const s of windowsShellScripts(c) ?? []) parse(s, depth + 1, out)
    }
  }
}

// 보호 이름이 보이는가 — cd 꼴과 함께면 셸 위치가 그 안일 수 있다
const PROTECTED_NAME = /(?:^|[\s"'=/\\(:;&|])\.(?:git|agentdeck|claude)(?=$|[\s"'/\\;&|)])/i

function cmdReason(c: Cmd, ctx: Ctx): string | null {
  const b = c.base.replace(/\.exe$/, '')
  const check: Check = (paths, destructive) => {
    for (const p of paths) { const r = reasonOfKind(pathKind(p, ctx.r, destructive)); if (r) return r }
    return null
  }
  if (b === 'git') return gitReason(c.args, ctx, check)
  if (b.includes('credential-manager') || b.startsWith('git-credential')) return CREDENTIAL
  if (b.startsWith('git-')) return gitReason([b.slice(4), ...c.args], ctx, check)
  if (b === 'gh') return ghReason(c.args)
  if (CD.has(b)) {
    const target = operandsOf(c.args)[0] ?? psValues(c.args, PS_PATH)[0] ?? '~'
    return pathKind(target, ctx.r, false) === null ? null : CWD
  }
  const env = envCmdReason(b, c.args)
  if (env) return env
  for (const t of writeTargets(b, c.args)) {
    const r = reasonOfKind(pathKind(t.path, ctx.r, t.destructive))
    if (r) return r
  }
  return null
}

function scriptReason(script: string, r: Resolved, depth: number): string | null {
  if (PS_ENV_SET.test(script) || PS_ENV_REMOVE.test(script) || DOTNET_ENV.test(script)) return CREDENTIAL
  const parsed: Parsed = { scripts: [], segments: [], ok: true }
  parse(script, depth, parsed)
  if (!parsed.ok) return TOO_DEEP
  const ctx: Ctx = { r, depth }
  const hasCd = parsed.segments.some((s) => s.cmds.some((c) => CD.has(c.base.replace(/\.exe$/, ''))))
  if (hasCd && PROTECTED_NAME.test(script)) return CWD
  for (const text of parsed.scripts) {
    for (const target of redirectTargets(text)) {
      const reason = reasonOfKind(pathKind(target, r, false))
      if (reason) return reason
    }
  }
  for (const seg of parsed.segments) {
    for (const t of seg.tokens) {
      if (assignName(t) === null) break
      if (protectedAssign(t)) return CREDENTIAL
    }
    for (const c of seg.cmds) {
      const reason = cmdReason(c, ctx)
      if (reason) return reason
    }
  }
  return null
}

// 셸 명령이 잠금에 걸리면 사유를, 아니면 null을 돌려준다.
export function loopCommandReason(command: string, scope: LoopLockScope): string | null {
  return scriptReason(command, resolveScope(scope), 0)
}

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

// 도구 호출 하나의 판정. mcp__ 도구는 전부 거부, `command` 입력을 가진 도구(Bash·PowerShell 등)는 명령으로, 편집 도구는 경로로 본다.
export function loopLockReason(toolName: string | undefined, toolInput: unknown, scope: LoopLockScope): string | null {
  if (toolName !== undefined && toolName.toLowerCase().startsWith('mcp__')) return MCP
  const ti = toolInput && typeof toolInput === 'object' ? (toolInput as Record<string, unknown>) : {}
  const command = ti['command']
  if (typeof command === 'string') return loopCommandReason(command, scope)
  if (toolName !== undefined && EDIT_TOOLS.has(toolName)) {
    const p = typeof ti['file_path'] === 'string' ? ti['file_path'] : ti['notebook_path']
    if (typeof p === 'string') return loopPathReason(p, scope)
  }
  return null
}

// ── 훅과 노드 정보 ─────────────────────────────────────────────────────────
// 공개 타입 PreToolUseHookInput에서 이 노드가 읽는 칸만 적는다(mergeDeny.ts와 같은 모양).
interface PreToolUseInput {
  hook_event_name?: string
  tool_name?: string
  tool_input?: unknown
}

interface HookOutput {
  hookSpecificOutput?: { hookEventName: 'PreToolUse'; permissionDecision: 'deny'; permissionDecisionReason: string }
}

export interface LoopLockMatcher {
  matcher?: string
  hooks: ((input: PreToolUseInput, toolUseID: string | undefined, opts: { signal: AbortSignal }) => Promise<HookOutput>)[]
  timeout: number
  onFailure: 'block'
}

const LOOP_LOCK_TIMEOUT_S = 10

export function buildLoopLockHook(scope: LoopLockScope): LoopLockMatcher {
  return {
    hooks: [
      async (input) => {
        const reason = loopLockReason(input.tool_name, input.tool_input, scope)
        if (reason === null) return {}
        return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }
      },
    ],
    timeout: LOOP_LOCK_TIMEOUT_S,
    onFailure: 'block',
  }
}

// 앱 세션 등록부(listControlNodes)에는 넣지 않는다 — 컨트롤 패널은 앱 세션의 노드를 보인다. 루프 화면(G3)이 이 정보를 쓴다.
export const LOOP_LOCK_NODE: ControlNodeInfo = Object.freeze({
  id: 'loop-lock',
  name: '루프 작업 노드 세션의 원격 쓰기·자격·git 설정·Claude 설정·실행기 몫 파일·저장소 밖 쓰기 잠금',
  point: 'preToolUse',
  judge: 'rule',
  results: Object.freeze(['deny'] as const),
  // 명령 글자를 바꾸면 피해 가므로 L3다 — 겹일 뿐이다. 끌 수 없다.
  protection: 'L3',
  locked: true,
  onFailure: 'block',
  timeoutMs: LOOP_LOCK_TIMEOUT_S * 1000,
})
