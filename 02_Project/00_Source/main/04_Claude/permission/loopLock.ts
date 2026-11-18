// 루프 잠금 노드 (M09 G2) — 앱 안 마일스톤 루프의 작업 노드 세션에만 붙는 PreToolUse 잠금. 일반 앱 세션에는 붙지 않는다
// (sdkOptions.ts — 실행 입력의 loopLock이 있을 때만 넣는다. IPC 요청은 그 칸을 옮기지 않는다).
// 노드 세션은 앱 「자동」 모드로 돈다. 훅은 권한 평가의 맨 앞이라(공식 permissions 문서: 훅 → 규칙 → 모드 → canUseTool)
// 자동 모드의 허용보다 먼저, 질문 없이 거부한다. 거부하는 것:
//   ① 원격 쓰기 — git push(전역 옵션 -C·-c·--git-dir, 경로로 부른 git, git-push 실행 파일 포함)·send-pack·원격 바꾸기,
//      gh는 읽기 하위 명령(허용 목록) 밖 전부, gh api는 쓰기 메서드나 본문 옵션(-f·-F·--input)이 있으면.
//   ② 자격 꺼내기·환경 되돌리기 — gh auth, git credential*, credential-manager, 자격 없는 환경 변수의 재설정·해제(env -i 포함).
//   ③ 설정·훅 심기 — git config 쓰기(읽기 꼴만 허용), .git/config·.git/hooks/·.git/info/ 쓰기.
//   ④ 실행기 몫 파일 — .agentdeck/run-state.json·verification.md와 앱 영역(userData의 loop 폴더) 쓰기, git clean -x.
// 노드 문서(.agentdeck/milestone-spec.md·goals/*.md·decisions.md)와 일반 소스 편집, 읽기 명령은 막지 않는다.
//
// 명령 글자 판정은 겹이다 — 보증이 아니다. 스크립트 파일, 인터프리터(node -e·python -c), 변수 간접 참조, 저장소 밖에서 심은
// 별칭으로 피해 갈 수 있다. 상태 위조의 보증은 앱 쪽 다이제스트(05_Loop/loopRunner.ts)가 지고, 원격 쓰기의 구조적 보증은
// 사용자가 범위를 좁힌 토큰이다(이 goal 밖). 셸 판독은 병합 거부 노드(mergeDeny.ts)의 함수를 같이 쓴다.
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
  // 앱 영역(실물은 userData의 loop 폴더) — 다이제스트·잠금·빈 훅 폴더가 산다
  appLoopDir: string
}

const TAIL = ' 원격은 실행기 코드만 만지고, 작업 노드는 로컬 커밋까지만 합니다.'
const REMOTE = 'push·원격 바꾸기·PR·저장소 설정 같은 원격 쓰기는 작업 노드 세션에서 막습니다.' + TAIL
const CREDENTIAL = '원격 자격을 꺼내거나 자격 없는 환경(GH_TOKEN·GH_CONFIG_DIR·GIT_CONFIG_*·GCM_* 등)을 되돌리는 명령은 작업 노드 세션에서 막습니다.' + TAIL
const CONFIG = 'git 설정·훅(.git/config, .git/hooks/, .git/info/)은 작업 노드 세션이 바꾸지 않습니다 — 실행기의 git 동작이 그 설정을 읽습니다.' + TAIL
const EXECUTOR = '실행 상태(.agentdeck/run-state.json)·검증 기록(.agentdeck/verification.md)·앱 영역은 실행기만 씁니다. 노드 문서(milestone-spec.md, goals/*.md, decisions.md)는 써도 됩니다.' + TAIL
const TOO_DEEP = '중첩이 깊어 판독하지 못한 명령은 작업 노드 세션에서 막습니다.' + TAIL

// ── 경로 ─────────────────────────────────────────────────────────────────
// 판정용 정규형: 역슬래시→슬래시, msys 드라이브(`/c/…`)→`c:/…`, 상대는 저장소 뿌리에 붙이고 `.`·`..`를 푼 뒤 소문자.
// Windows는 이름 끝의 점·공백을 버리므로(`run-state.json.`) 마지막 마디의 끝 점·공백도 지운다.
function canonical(raw: string, repoRoot: string): string {
  const slash = (p: string): string => p.replace(/\\/g, '/').replace(/\/{2,}/g, '/')
  const p = slash(raw.trim()).replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:')
  const abs = /^[a-zA-Z]:/.test(p) || p.startsWith('/')
  const joined = abs ? p : `${slash(repoRoot).replace(/\/+$/, '')}/${p}`
  const out: string[] = []
  joined.split('/').forEach((s, i) => {
    if ((s === '' && i > 0) || s === '.') return
    if (s === '..') { if (out.length > 1) out.pop(); return }
    out.push(s)
  })
  return out.join('/').replace(/([^/.])[. ]+$/, '$1').toLowerCase()
}

const EXECUTOR_FILE = /\/\.agentdeck\/(?:run-state\.json|verification\.md)$/
const GIT_CONFIG_FILE = /\/\.git\/config$/
const GIT_DIRS = /\/\.git\/(?:hooks|info)(?:\/|$)/

type PathKind = 'executor' | 'config'

function kindOf(c: string, scope: LoopLockScope, destructive: boolean): PathKind | null {
  const app = canonical(scope.appLoopDir, scope.repoRoot)
  if (EXECUTOR_FILE.test(c) || c === app || c.startsWith(app + '/')) return 'executor'
  if (GIT_CONFIG_FILE.test(c) || GIT_DIRS.test(c)) return 'config'
  // 지우기·옮기기는 보호 파일을 담은 폴더째도 막는다(`rm -rf .agentdeck`, `mv .git x`)
  if (destructive) {
    const root = canonical(scope.repoRoot, scope.repoRoot)
    if (c === `${root}/.agentdeck`) return 'executor'
    if (c === `${root}/.git`) return 'config'
  }
  return null
}

// 와일드카드 꼴(`.agentdeck/*`, `.git/hook*/*`)은 보호 경로의 대표 이름에 맞춰 본다. 마디 첫 `*`·`?`는 점 파일에 맞지 않는다(bash 기본).
function globKind(c: string, scope: LoopLockScope, destructive: boolean): PathKind | null {
  let re = ''
  for (let i = 0; i < c.length; i++) {
    const ch = c[i]
    const segStart = i === 0 || c[i - 1] === '/'
    if (ch === '*' || ch === '?') re += (segStart ? '(?!\\.)' : '') + (ch === '*' ? '[^/]*' : '[^/]')
    else if (ch === '[') { const end = c.indexOf(']', i + 2); re += '[^/]'; i = end < 0 ? c.length : end }
    else re += ch.replace(/[.+^${}()|\\]/g, '\\$&')
  }
  const rx = new RegExp(`^${re}$`)
  const root = canonical(scope.repoRoot, scope.repoRoot)
  const app = canonical(scope.appLoopDir, scope.repoRoot)
  const samples = [
    `${root}/.agentdeck/run-state.json`, `${root}/.agentdeck/verification.md`, `${root}/.git/config`,
    `${root}/.git/hooks/pre-push`, `${root}/.git/info/exclude`, app, `${app}/digests`,
    ...(destructive ? [`${root}/.agentdeck`, `${root}/.git`] : []),
  ]
  const hit = samples.find((s) => rx.test(s))
  return hit === undefined ? null : kindOf(hit, scope, destructive)
}

function pathKind(raw: string, scope: LoopLockScope, destructive: boolean): PathKind | null {
  if (!raw) return null
  const c = canonical(raw, scope.repoRoot)
  return /[*?[]/.test(c) ? globKind(c, scope, destructive) : kindOf(c, scope, destructive)
}

const reasonOfKind = (k: PathKind | null): string | null => (k === 'executor' ? EXECUTOR : k === 'config' ? CONFIG : null)

// 편집 도구가 이 경로에 쓰면 사유를, 아니면 null을 돌려준다.
export function loopPathReason(filePath: string, scope: LoopLockScope): string | null {
  return reasonOfKind(pathKind(filePath, scope, false))
}

// ── 환경 변수 ────────────────────────────────────────────────────────────
// 자격 없는 환경(05_Loop/childEnv.ts)이 정한 변수들. Windows 환경 변수는 대소문자를 가리지 않는다.
const ENV_NAMES = 'GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN|GH_CONFIG_DIR|GIT_CONFIG(?:_[A-Z0-9_]+)?|GCM_[A-Z0-9_]+|GIT_ASKPASS|SSH_ASKPASS|GIT_SSH|GIT_SSH_COMMAND|SSH_AUTH_SOCK|GIT_TERMINAL_PROMPT'
const PROTECTED_ENV = new RegExp(`^(?:${ENV_NAMES})$`, 'i')
// PowerShell·.NET 꼴 — 명령 원문에서 찾는다
const PS_ENV_SET = new RegExp(`\\$env:(?:${ENV_NAMES})\\s*[+]?=`, 'i')
const PS_ENV_REMOVE = new RegExp(`(?:remove-item|clear-item|set-item|new-item|ri|rm|del|erase|ni)\\b[^;|\\n]*\\benv:[\\\\/]?(?:${ENV_NAMES})\\b`, 'i')
const DOTNET_ENV = new RegExp(`SetEnvironmentVariable\\s*\\(\\s*['"](?:${ENV_NAMES})['"]`, 'i')

const assignName = (t: string): string | null => /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(t)?.[1] ?? null
const protectedAssign = (t: string): boolean => { const n = assignName(t); return n !== null && PROTECTED_ENV.test(n) }

function envCmdReason(c: Cmd): string | null {
  const a = c.args
  switch (c.base.replace(/\.exe$/, '')) {
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

// `-c 키=값`·`--config-env 키=변수` — 별칭은 push를 숨길 수 있고, 자격 도우미·askpass·ssh 명령은 자격을 부른다
function configKeyReason(kv: string): string | null {
  const key = kv.split('=')[0].toLowerCase()
  if (key.startsWith('alias.')) return REMOTE
  if (key.startsWith('credential') || key === 'core.askpass' || key === 'core.sshcommand') return CREDENTIAL
  return null
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

const firstWord = (args: string[]): string | undefined => args.find((t) => !t.startsWith('-'))?.toLowerCase()

function gitReason(args: string[], recurse: (script: string) => string | null): string | null {
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
  if (sub === 'lfs' && firstWord(rest) === 'push') return REMOTE
  if (sub === 'remote') return REMOTE_MUTATE.has(firstWord(rest) ?? '') ? REMOTE : null
  if (sub === 'config') return configIsRead(rest) ? null : CONFIG
  if (sub.startsWith('credential')) return CREDENTIAL
  // 무시 목록의 파일까지 지우는 꼴 — `.agentdeck/`는 .git/info/exclude로 무시 목록에 있다
  if (sub === 'clean') return rest.some((t) => /^-[a-zA-Z]*[xX]/.test(t)) ? EXECUTOR : null
  if (sub === 'submodule') {
    const k = rest.indexOf('foreach')
    if (k >= 0) return recurse(rest.slice(k + 1).filter((t) => !t.startsWith('--')).join(' '))
  }
  return null
}

// ── gh ───────────────────────────────────────────────────────────────────
// 허용 목록 — 읽기 하위 명령만. 목록 밖(별칭·확장·설정 포함)은 원격 쓰기로 본다(fail-closed). auth는 자격 꺼내기다.
const GH_READ: Readonly<Record<string, readonly string[] | '*'>> = {
  pr: ['view', 'list', 'status', 'diff', 'checks', 'checkout'],
  issue: ['view', 'list', 'status'],
  repo: ['view', 'list', 'clone'],
  run: ['view', 'list', 'watch', 'download'],
  workflow: ['view', 'list'],
  label: ['list'],
  cache: ['list'],
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

// 도움말 꼴(`--help`·`-h`)도 따로 풀지 않는다 — `--body -h`처럼 값 자리의 `-h`가 통로가 된다(병합 거부 노드와 같다).
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
// 명백한 쓰기 꼴만 본다 — 인자 전부가 대상인 명령, 마지막 인자가 대상인 복사, 제자리 편집(sed·perl -i), dd of=.
const WRITE_ALL = new Set([
  'rm', 'rmdir', 'unlink', 'mv', 'touch', 'truncate', 'shred', 'ln', 'chmod', 'chown', 'tee', 'mklink',
  'del', 'erase', 'rd', 'move', 'ren', 'rename',
  'remove-item', 'ri', 'move-item', 'mi', 'rename-item', 'rni', 'new-item', 'ni',
  'set-content', 'sc', 'add-content', 'ac', 'clear-content', 'clc', 'out-file',
])
const DESTRUCTIVE = new Set(['rm', 'rmdir', 'unlink', 'mv', 'shred', 'del', 'erase', 'rd', 'move', 'ren', 'rename', 'remove-item', 'ri', 'move-item', 'mi', 'rename-item', 'rni'])
const WRITE_LAST = new Set(['cp', 'install', 'rsync', 'scp', 'copy', 'xcopy', 'copy-item', 'cpi'])

function writeTargets(c: Cmd): { paths: string[]; destructive: boolean } {
  const b = c.base.replace(/\.exe$/, '')
  const operands = c.args.filter((t) => !t.startsWith('-'))
  if (WRITE_ALL.has(b)) return { paths: operands, destructive: DESTRUCTIVE.has(b) }
  if (WRITE_LAST.has(b)) return { paths: operands.slice(-1), destructive: false }
  if ((b === 'sed' || b === 'perl') && c.args.some((t) => /^-[a-zA-Z]*i/.test(t) || t.startsWith('--in-place'))) {
    return { paths: operands, destructive: false }
  }
  if (b === 'dd') return { paths: c.args.filter((t) => t.startsWith('of=')).map((t) => t.slice(3)), destructive: false }
  return { paths: [], destructive: false }
}

// 따옴표 밖 `>`·`>>`·`>|`·`&>`의 대상 낱말. `>&2` 같은 파일 설명자 복제는 대상이 아니다.
function redirectTargets(seg: string): string[] {
  const out: string[] = []
  let quote: '"' | "'" | null = null
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i]
    if (quote) {
      if (ch === '\\' && quote === '"') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '\\') { i++; continue }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch !== '>') continue
    let j = i + 1
    if (seg[j] === '>' || seg[j] === '|') j++
    if (seg[j] === '&') { if (/[0-9-]/.test(seg[j + 1] ?? '')) { i = j + 1; continue } j++ }
    while (seg[j] === ' ' || seg[j] === '\t') j++
    let word = ''
    const q = seg[j]
    if (q === '"' || q === "'") {
      const end = seg.indexOf(q, j + 1)
      word = seg.slice(j + 1, end < 0 ? seg.length : end)
      j = end < 0 ? seg.length : end + 1
    } else {
      while (j < seg.length && !/[\s;&|<>()]/.test(seg[j])) word += seg[j++]
    }
    if (word) out.push(word)
    i = j - 1
  }
  return out
}

// ── 판독 ─────────────────────────────────────────────────────────────────
interface Segment { text: string; tokens: string[]; cmds: Cmd[] }

// 스크립트를 명령 마디로 편다 — 명령 치환(`$( )`·백틱), 셸 `-c`, Windows 셸(cmd /c·powershell -Command)의 안쪽까지.
function segmentsOf(script: string, depth: number, out: Segment[]): boolean {
  if (depth > 4) return false
  const text = stripHeredocBodies(script.replace(/\\\r?\n/g, ' '))
  let ok = true
  for (const sub of substitutions(text)) ok = segmentsOf(sub, depth + 1, out) && ok
  for (const seg of splitSegments(text)) {
    const tokens = tokenize(seg)
    const cmds = commandsOf(tokens)
    out.push({ text: seg, tokens, cmds })
    for (const c of cmds) {
      if (SHELLS.has(c.base)) {
        const k = c.args.findIndex((t) => RE_SHELL_C.test(t))
        if (k >= 0 && k + 1 < c.args.length) ok = segmentsOf(c.args[k + 1], depth + 1, out) && ok
        continue
      }
      for (const s of windowsShellScripts(c) ?? []) ok = segmentsOf(s, depth + 1, out) && ok
    }
  }
  return ok
}

function cmdReason(c: Cmd, scope: LoopLockScope, depth: number): string | null {
  const b = c.base.replace(/\.exe$/, '')
  const recurse = (s: string): string | null => scriptReason(s, scope, depth + 1)
  if (b === 'git') return gitReason(c.args, recurse)
  if (b.includes('credential-manager') || b.startsWith('git-credential')) return CREDENTIAL
  if (b.startsWith('git-')) return gitReason([b.slice(4), ...c.args], recurse)
  if (b === 'gh') return ghReason(c.args)
  const env = envCmdReason(c)
  if (env) return env
  const { paths, destructive } = writeTargets(c)
  for (const p of paths) {
    const r = reasonOfKind(pathKind(p, scope, destructive))
    if (r) return r
  }
  return null
}

function scriptReason(script: string, scope: LoopLockScope, depth: number): string | null {
  if (PS_ENV_SET.test(script) || PS_ENV_REMOVE.test(script) || DOTNET_ENV.test(script)) return CREDENTIAL
  const segments: Segment[] = []
  if (!segmentsOf(script, depth, segments)) return TOO_DEEP
  for (const seg of segments) {
    for (const t of seg.tokens) {
      if (assignName(t) === null) break
      if (protectedAssign(t)) return CREDENTIAL
    }
    for (const target of redirectTargets(seg.text)) {
      const r = reasonOfKind(pathKind(target, scope, false))
      if (r) return r
    }
    for (const c of seg.cmds) {
      const r = cmdReason(c, scope, depth)
      if (r) return r
    }
  }
  return null
}

// 셸 명령이 잠금에 걸리면 사유를, 아니면 null을 돌려준다.
export function loopCommandReason(command: string, scope: LoopLockScope): string | null {
  return scriptReason(command, scope, 0)
}

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

// 도구 호출 하나의 판정. `command` 입력을 가진 도구(Bash·PowerShell 등)는 명령으로, 편집 도구는 경로로 본다.
export function loopLockReason(toolName: string | undefined, toolInput: unknown, scope: LoopLockScope): string | null {
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
  name: '루프 작업 노드 세션의 원격 쓰기·자격·git 설정·실행기 몫 파일 잠금',
  point: 'preToolUse',
  judge: 'rule',
  results: Object.freeze(['deny'] as const),
  // 명령 글자를 바꾸면 피해 가므로 L3다 — 겹일 뿐이다. 끌 수 없다.
  protection: 'L3',
  locked: true,
  onFailure: 'block',
  timeoutMs: LOOP_LOCK_TIMEOUT_S * 1000,
})
