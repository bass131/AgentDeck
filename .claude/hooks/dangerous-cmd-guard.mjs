#!/usr/bin/env node
// 위험 명령 가드 (PreToolUse: Bash) — 트립와이어. 무상태·CLI 모드 없음.
// 판정은 넷이다 — heredoc 본문 면제(실행되지 않는 소비자뿐일 때만 본문을 뺀다), 따옴표 밖 구분자로 세그먼트 분할,
// 따옴표 문자를 벗기는 토큰화(`"rm" -rf` 류 인용 우회를 잡는다), 머리 토큰에만 규칙을 거는 명령 위치 판정(인용문·커밋 본문 오탐 방어).
// 세그먼트는 원문 읽기, bash식 논리 줄 판독(`logicalLines`), 이음 지운 원문 읽기(`joinedReading`)의 합집합이다.
// 변수 확장(`c=push; git $c`)·`$()` 명령 치환·`cmd /c` 접두는 못 잡는다 — 그 방어는 Claude Code 내장 권한 분류기 몫이다.
// 원문 읽기에 전처리를 넣은 시도는 `reset --hard` 판정을 회귀시키고 정상 heredoc 커밋에 질의를 만들어 되돌렸다.
// 이 판독이 못 읽는 꼴의 작업 브랜치 강제 push는 감수 위험이다. payload가 없거나 파싱 불가면 차단이고(fail-closed), 로그는 fail-open이다.

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const GATE_DIR = join(ROOT, '98_Management', '01_GateState')
const LOG_FILE = join(GATE_DIR, 'hook-log.jsonl')

function ts() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0')
  const o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-', a = Math.abs(o)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${s}${p(Math.floor(a / 60))}:${p(a % 60)}`
}

// 다른 훅과 같은 스키마의 독립 로거다 — 경로가 CLAUDE_PROJECT_DIR 기준이라 격리 미러 안에서 나고 죽는다.
const ctx = { session: null, agentId: null, event: 'PreToolUse', cmd: '' }
function log(verdict, rule, reason) {
  try {
    mkdirSync(GATE_DIR, { recursive: true })
    appendFileSync(LOG_FILE, JSON.stringify({
      ts: ts(), hook: 'cmd-guard', event: ctx.event, session: ctx.session, agent_id: ctx.agentId,
      verdict, rule, reason, cmd: ctx.cmd.slice(0, 160),
    }) + '\n')
  } catch { /* 로그 기록 실패도 판정을 막지 않는다 */ }
}

function block(rule, reason, hint) {
  log('deny', rule, reason)
  process.stderr.write(`dangerous-cmd-guard 차단: ${reason}\n`)
  if (hint) process.stderr.write(`   ${hint}\n`)
  process.exit(2)
}
function ask(rule, reason) {
  log('ask', rule, reason)
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: `비가역 작업 — ${reason}. 승인하면 실행되고, 거부하면 실행되지 않습니다.`,
    },
  }))
  process.exit(0)
}
function allow(reason) {
  log('allow', null, reason)
  process.exit(0)
}

const low = (t) => String(t).toLowerCase()

// 백슬래시 이스케이프는 따옴표 상태를 바꾸는 꼴만 읽는다. 작은따옴표 안에서는 이스케이프가 아니다.
//   큰따옴표 안은 `\"`·`\\`·`\$`·`` \` ``만 이스케이프다 — 모르면 `sh -c "sh -c \"git push\""`의 안쪽 스크립트가 조각난다.
//   인용부 밖의 `\"`·`\'`는 인용을 열지 않는다 — 모르면 `echo \"hello\" && rm -rf dist`의 가짜 인용이 뒤 명령을 숨긴다. `\\`도 짝으로 읽는다.
//   그 밖의 `\X`는 두 글자 그대로다 — 넓히면 `C:\Tools\Git\bin\git.exe` 류 basename 판정이 깨진다.
const DQ_ESCAPABLE = new Set(['"', '\\', '$', '`'])
const BARE_ESCAPABLE = new Set(['"', "'", '\\'])
const isEscape = (quote, ch, next) => ch === '\\'
  && (quote === '"' ? DQ_ESCAPABLE.has(next) : quote === null && BARE_ESCAPABLE.has(next))

function splitSegments(text) {
  const segments = []
  let cur = ''
  let quote = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (isEscape(quote, ch, text[i + 1])) { cur += ch + text[++i]; continue }
    if (quote) { cur += ch; if (ch === quote) quote = null; continue }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue }
    if (ch === ';' || ch === '\n' || ch === '|' || ch === '&') { segments.push(cur); cur = ''; continue }
    cur += ch
  }
  segments.push(cur)
  return segments.map((s) => s.trim()).filter(Boolean)
}

// 구분자는 인용부 밖의 공백뿐이다 — `bash -c "rm -rf dist"`의 인자를 토큰 하나로 지킨다. 인용 문자는 값에서 벗긴다.
// 이스케이프는 다음 문자 하나를 값으로 남긴다 — 중첩 `sh -c`의 안쪽 따옴표가 산다.
function tokenize(segment) {
  const out = []
  let cur = ''
  let quote = null
  const s = String(segment)
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (isEscape(quote, ch, s[i + 1])) { cur += s[++i]; continue }
    if (quote) { if (ch === quote) quote = null; else cur += ch; continue }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { if (cur) out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur) out.push(cur)
  return out
}

// 명령 위치는 세그먼트의 머리 토큰에, 머리에서 이어진 래퍼 뒤 토큰(플래그·`VAR=값` 건너뜀)과 머리가 find일 때의 `-exec` 다음 토큰을 더한다.
// 셸의 `-c` 인자는 같은 파이프라인으로 다시 판정한다(contextsOf). 경로 접두를 벗긴 basename(`base`) 판정은 git·셸 계열에만 쓴다.
const WRAPPERS = new Set(['sudo', 'doas', 'env', 'nohup', 'time', 'nice', 'ionice', 'xargs', 'command', 'busybox'])
const SHELLS = new Set(['sh', 'bash', 'dash', 'zsh', 'ksh', 'ash', 'sh.exe', 'bash.exe', 'dash.exe', 'zsh.exe', 'ksh.exe', 'ash.exe'])
const FIND_EXEC = new Set(['-exec', '-execdir', '-ok', '-okdir'])
// 래퍼마다 값을 받는 옵션과 명령 앞 위치 인자 수(`timeout <시간>`)를 적는다 — 앱 잠금 노드 `main/04_Claude/permission/mergeDeny.ts`의 표와 같다.
// 위 WRAPPERS 집합은 heredoc 소비자 판독(stageHead)용이다.
const WRAPPER_SPECS = new Map([
  ['sudo', { valueOpts: ['-u', '-g', '-h', '-p', '-C', '-U', '-r', '-t', '-D', '-R', '-T', '--user', '--group', '--host', '--prompt', '--close-from', '--other-user', '--role', '--type', '--chdir', '--chroot', '--command-timeout'], positional: 0 }],
  ['doas', { valueOpts: ['-u', '-C'], positional: 0 }],
  ['env', { valueOpts: ['-u', '-C', '--unset', '--chdir'], positional: 0, split: { short: 'S', valueShort: 'uCa', long: { chdir: 'value', 'split-string': 'split', unset: 'value', argv0: 'value', 'ignore-environment': 'flag', null: 'flag', debug: 'flag', 'block-signal': 'flag', 'default-signal': 'flag', 'ignore-signal': 'flag', 'list-signal-handling': 'flag', help: 'flag', version: 'flag' } } }],
  ['nohup', { valueOpts: [], positional: 0 }],
  ['time', { valueOpts: ['-f', '-o', '--format', '--output'], positional: 0 }],
  ['nice', { valueOpts: ['-n', '--adjustment'], positional: 0 }],
  ['ionice', { valueOpts: ['-c', '-n', '-p', '-P', '-u', '--class', '--classdata', '--pid', '--pgid', '--uid'], positional: 0 }],
  ['xargs', { valueOpts: ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s', '--arg-file', '--delimiter', '--eof', '--replace', '--max-lines', '--max-args', '--max-procs', '--max-chars', '--process-slot-var'], positional: 0 }],
  ['command', { valueOpts: [], positional: 0 }],
  ['busybox', { valueOpts: [], positional: 0 }],
  ['exec', { valueOpts: ['-a'], positional: 0 }],
  ['timeout', { valueOpts: ['-s', '-k', '--signal', '--kill-after'], positional: 1 }],
  ['stdbuf', { valueOpts: ['-i', '-o', '-e', '--input', '--output', '--error'], positional: 0 }],
  ['watch', { valueOpts: ['-n', '--interval', '-q', '--equexit'], positional: 0 }],
])
const SHELL_HEAD_WORDS = new Set(['{', '}', '!', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', 'eval'])
// 옵션 낱말이 다음 낱말을 값으로 먹는가 — 붙여 쓴 값(`-oL`·`--signal=KILL`)은 먹지 않는다.
// 짧은 묶음(`-vs`)은 끝 글자가 값 옵션이면 먹고, `=` 없는 긴 옵션은 값 옵션의 접두(`--sig`)면 먹는다(getopt_long 축약).
function takesValue(spec, t) {
  if (spec.valueOpts.includes(t)) return true
  if (t.startsWith('--')) return !t.includes('=') && t.length > 3 && spec.valueOpts.some((o) => o.startsWith('--') && o.startsWith(t))
  return /^-[A-Za-z]{2,}$/.test(t) && spec.valueOpts.includes('-' + t.at(-1))
}
const RE_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/   // `FOO=1` 류 환경변수 할당 토큰
const RE_SHELL_C = /^-[A-Za-z]*c$/             // `-c`·`-lc`·`-ec` — 다음 토큰이 셸 스크립트 문자열

// `env -S`·`--split-string` — GNU env는 문자열을 낱말로 나눠 그 자리에 끼우고 옵션 읽기를 잇는다. 그래서 다시 읽을 글은
// `env <문자열> <뒤 낱말>`이다(`env -S "-i gh …"`의 `-i`도 옵션으로 읽힌다). 뒤 낱말은 작은따옴표로 감싸 낱말 하나로 남긴다.
// 옵션은 getopt처럼 읽는다(루프 잠금 loopLock.ts의 wrapperOpts와 같다) — 묶은 짧은 옵션은 값 옵션 글자에서 끝나고(`-vS`는 -S,
// `-uS`의 S는 -u의 값), 값은 붙여 쓰거나(`-S"…"`·`--split-string=…`) 다음 낱말이며, 긴 옵션은 표에서 유일한 접두면 줄여 쓴다(`--sp`).
// 앱 잠금 노드 mergeDeny.ts의 splitScriptOf와 같은 판독이다. 없으면 null.
const shQuote = (t) => `'${t.replace(/'/g, "'\\''")}'`
// 값 안의 주석 — env는 따옴표 밖 낱말 머리의 `#`부터 **값 끝까지만** 버리고 뒤 낱말은 그대로 돈다.
// 다시 읽을 글에서는 그 `#`가 뒤 낱말까지 주석으로 삼키므로, 잇기 전에 값에서 잘라 낸다. 따옴표 안의 `#`는 글자다.
function dropSplitComment(v) {
  let quote = null
  let wordStart = true
  for (let i = 0; i < v.length; i++) {
    const ch = v[i]
    const atStart = wordStart
    wordStart = false
    if (quote === "'") { if (ch === "'") quote = null; continue }
    if (ch === '\\') { i++; continue }
    if (quote === '"') { if (ch === '"') quote = null; continue }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (/\s/.test(ch)) { wordStart = true; continue }
    if (ch === '#' && atStart) return v.slice(0, i)
  }
  return v
}
function splitScriptOf(c) {
  const spec = WRAPPER_SPECS.get(c.base.replace(/\.exe$/, ''))?.split
  if (!spec) return null
  const args = c.args
  for (let i = 0; i < args.length; i++) {
    const t = args[i]
    let value
    if (t === '--') return null
    if (t === '-') continue
    if (t.startsWith('--')) {
      const eq = t.indexOf('=')
      const name = t.slice(2, eq < 0 ? undefined : eq)
      const hits = Object.keys(spec.long).filter((l) => l.startsWith(name))
      const kind = Object.hasOwn(spec.long, name) ? spec.long[name] : hits.length === 1 ? spec.long[hits[0]] : undefined
      if (kind === undefined || kind === 'flag') continue
      value = eq < 0 ? args[++i] : t.slice(eq + 1)
      if (kind !== 'split') continue
    } else if (t.startsWith('-')) {
      let k = 1
      while (k < t.length && t[k] !== spec.short && !spec.valueShort.includes(t[k])) k++
      if (k === t.length) continue
      value = k + 1 < t.length ? t.slice(k + 1) : args[++i]
      if (t[k] !== spec.short) continue
    } else if (RE_ASSIGN.test(t)) continue
    else return null
    if (value === undefined) return null
    return [c.base, dropSplitComment(value), ...args.slice(i + 1).map(shQuote)].join(' ')
  }
  return null
}

function baseName(token) {
  const s = String(token)
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
  return i < 0 ? s : s.slice(i + 1)
}

function commandsOf(rawTokens) {
  // 서브셸·그룹의 괄호를 벗긴다 — `(git push)`의 `(git`·`push)`가 명령과 하위 명령으로 읽히지 않게.
  const tokens = rawTokens.slice()
  if (tokens.length) tokens[0] = tokens[0].replace(/^[({]+/, '')
  if (tokens.length) tokens[tokens.length - 1] = tokens[tokens.length - 1].replace(/[)}]+$/, '')
  while (tokens.length && tokens[0] === '') tokens.shift()
  while (tokens.length && tokens[tokens.length - 1] === '') tokens.pop()
  if (!tokens.length) return []
  // 머리의 `VAR=값` 할당과 셸 문법 낱말(`then`·`!`·`{`·`eval` …, `mergeDeny.ts`의 표와 같다) 뒤가 명령 위치다.
  // `DIRS=(src rm -rf)` 같은 배열 할당은 건너뛰지 않는다 — 괄호 안 원소가 명령으로 읽힌다.
  let head = 0
  while (head < tokens.length - 1 && ((RE_ASSIGN.test(tokens[head]) && !tokens[head].includes('(')) || SHELL_HEAD_WORDS.has(tokens[head]))) head++
  const pos = new Set([head])
  let i = head
  while (i < tokens.length - 1) {
    const spec = WRAPPER_SPECS.get(low(baseName(tokens[i])).replace(/\.exe$/, ''))
    if (!spec) break
    let j = i + 1
    // 옵션(값을 받는 옵션은 그 값까지)과 `VAR=값`을 건너뛰고, 위치 인자(`timeout`의 시간)를 건너뛴다
    while (j < tokens.length && (tokens[j].startsWith('-') || RE_ASSIGN.test(tokens[j]))) j += takesValue(spec, tokens[j]) ? 2 : 1
    j += spec.positional
    if (j >= tokens.length) break
    pos.add(j)
    i = j
  }
  if (low(baseName(tokens[head])) === 'find') {
    for (let j = 1; j < tokens.length - 1; j++) if (FIND_EXEC.has(low(tokens[j]))) pos.add(j + 1)
  }
  return [...pos].sort((a, b) => a - b)
    .filter((p) => p < tokens.length)
    .map((p) => ({ name: low(tokens[p]), base: low(baseName(tokens[p])), args: tokens.slice(p + 1) }))
}

// git 전역 옵션 중 다음 토큰을 값으로 먹는 것들 (`-C <path>`, `-c <k=v>` …).
// `--git-dir=<path>`처럼 등호로 값을 붙이는 형태는 토큰 하나라 별도 처리가 필요 없다.
const GIT_VALUE_OPTS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path'])

// 머리 토큰이 git 계열인가 — `git.exe`·대문자 `Git`도 같은 명령이다.
const isGit = (name) => name === 'git' || name === 'git.exe'

function gitSub(args) {
  let i = 0
  while (i < args.length && args[i].startsWith('-')) {
    if (GIT_VALUE_OPTS.has(args[i])) i++
    i++
  }
  return args.slice(i)
}

const RE_RECURSE = /^(-[A-Za-z]*[rR]|--recursive)/   // rm 재귀 (Moodie RE_RECURSE 동등)
const RE_RM_FORCE = /^(-[A-Za-z]*f|--force)/          // rm 강제 — AgentDeck이 원본보다 넓은 축
const isForce = (t) => t === '--force' || (!t.startsWith('--') && /^-[A-Za-z]*f/.test(t))
const isCleanFlag = (t) => t === '--force' || (!t.startsWith('--') && /^-[A-Za-z]*[dfx]/.test(t))
const isBranchD = (t) => !t.startsWith('--') && /^-[A-Za-z]*D/.test(t)
const isBranchDelete = (t) => t === '--delete' || (!t.startsWith('--') && /^-[A-Za-z]*d/.test(t))
const isConfigRead = (t) => t === '--list' || t === '-l' || t.startsWith('--get')

// git push·fetch 옵션은 접두로 읽는다.
//   긴 옵션: 토큰이 규칙 이름으로 시작하면 센다(`--force>/dev/null`처럼 붙인 꼴도 잡힌다). git은 고유 접두 축약도 받아
//     (`--mir`는 `--mirror`) `=` 앞 이름이 규칙 이름의 접두여도 센다. 강제 축약은 `--for`부터다 — `--f`·`--fo`는
//     `--follow-tags`와 겹쳐 git이 거부한다. `--no-…` 꼴은 걸리지 않는다.
//   짧은 옵션: 묶음 머리(`-uf`·`-f>/dev/null`)를 접두로 읽되 값을 먹는 `-o`에서 멈춘다 — `-ofoo`는 강제 push가 아니다.
//   refspec은 첫 글자로 읽는다 — `+`는 강제 갱신, `:`는 원격 ref 삭제(`:` 단독은 같은 이름 전부 push), `*`는 일괄 push다.
const isLongOpt = (t, names, min = 1) => {
  if (!t.startsWith('--')) return false
  const body = t.slice(2)
  const name = body.split('=')[0]
  return names.some((full) => body.startsWith(full) || (name.length >= min && full.startsWith(name)))
}
const shortHas = (t, ch, stop = '') => {
  const m = /^-([A-Za-z0-9]+)/.exec(t)
  if (!m || t.startsWith('--')) return false
  for (const x of m[1]) {
    if (stop.includes(x)) return false
    if (x === ch) return true
  }
  return false
}
const PUSH_FORCE_LONG = ['force', 'force-with-lease', 'force-if-includes']
const PUSH_BULK_LONG = ['mirror', 'all', 'branches', 'tags', 'prune']   // `--branches`는 git 2.46부터의 `--all` 별칭
const isPushForce = (t) => isLongOpt(t, PUSH_FORCE_LONG, 3) || shortHas(t, 'f', 'o') || t.startsWith('+')
const isPushDelete = (t) => isLongOpt(t, ['delete']) || shortHas(t, 'd', 'o') || t.startsWith(':')
const isPushBulk = (t) => (isLongOpt(t, PUSH_BULK_LONG) && !t.startsWith('--prune-tags'))
  || (!t.startsWith('-') && t.includes('*'))
const pushArgs = (c) => (c.git?.[0] === 'push' ? c.git.slice(1) : null)

// 한 번 쓰는 git 설정 — 전역 옵션 `-c 키=값`과 세그먼트 머리의 `GIT_CONFIG_VALUE_N=값` 할당.
//   `remote.<원격>.push=+…`는 refspec 없는 `git push`를 강제 push로 만든다 — 강제 push로 막는다.
//   `alias.<이름>=…push…`는 하위 명령 자리에 별칭 이름만 남겨 push 판독이 닿지 않는다 — 묻는다.
function gitConfigValues(c) {
  const vals = []
  for (let i = 0; i < c.args.length && c.args[i].startsWith('-'); i++) {
    if (c.args[i] === '-c' && i + 1 < c.args.length) vals.push(c.args[++i])
    else if (GIT_VALUE_OPTS.has(c.args[i])) i++
  }
  return vals
}
const isConfigForcePush = (c) => pushArgs(c) !== null
  && (gitConfigValues(c).some((v) => /^remote\.[^=]*\.push=\s*\+/i.test(v))
    || (c.seg ?? []).some((t) => /^GIT_CONFIG_VALUE_\d+=\s*\+/.test(t)))
const isConfigPushAlias = (c) => isGit(c.base) && gitConfigValues(c).some((v) => /^alias\.[^=]+=.*\b(push|send-pack)\b/i.test(v))

// fetch가 로컬 ref를 덮어쓰는가 — 설정이 `git fetch*`를 질의 없이 연다.
// refspec은 저장소 다음의 operand다. `+`로 시작하거나 `:`가 든 refspec은 로컬 ref를 쓰고(`+`는 강제),
// `--prune`(`-p`)과 refspec이 함께 오면 refspec 범위의 로컬 추적 ref를 지운다. 저장소 이름·URL의 `:`는 보지 않는다.
// 판독은 리다이렉트·주석·옵션 값도 낱말로 넘기므로 refspec 후보에서 뺀다 — 빼지 않으면 `git fetch --prune origin 2>&1 | tail -3`,
// `git fetch -j 4 --prune origin`, `git fetch origin 2>C:/tmp/e.log`가 질의로 루프를 멈춘다.
const FETCH_VALUE_OPTS = new Set(['--depth', '--deepen', '--shallow-since', '--shallow-exclude', '-j', '--jobs',
  '--negotiation-tip', '-o', '--server-option', '--upload-pack', '--refmap', '--filter', '--recurse-submodules-default', '--submodule-prefix'])
const REDIRECT_WORD = /^(\d*>|\d*<|&>|<<<|>>|>&|\d+>&)/
function fetchOperands(args) {
  const out = []
  for (let i = 0; i < args.length; i++) {
    const t = args[i]
    if (t.startsWith('#')) break                                     // 주석 — 이후 낱말은 명령이 아니다
    if (REDIRECT_WORD.test(t)) { if (/[<>&]$/.test(t)) i++; continue } // `2>&1`·`>`(다음 낱말이 대상)·`2>file`
    if (t.startsWith('-')) { if (FETCH_VALUE_OPTS.has(t)) i++; continue }
    if (t.includes('>') || t.includes('<')) continue                 // 낱말에 붙은 리다이렉트 조각
    out.push(t)
  }
  return out
}
function fetchRewritesRefs(c) {
  if (c.git?.[0] !== 'fetch') return false
  const args = c.git.slice(1)
  const refspecs = fetchOperands(args).slice(1)
  if (refspecs.some((t) => t.startsWith('+') || t.includes(':'))) return true
  const prune = args.some((t) => (isLongOpt(t, ['prune'], 3) && !t.startsWith('--prune-tags')) || shortHas(t, 'p', 'jo'))
  return prune && refspecs.length > 0
}

const DESTRUCTIVE = [
  { id: 'rm-재귀·강제', why: 'rm -r / -f (파일 손실)', match: (c) => c.name === 'rm' && c.args.some((t) => RE_RECURSE.test(t) || RE_RM_FORCE.test(t)) },
  { id: 'git-reset-hard', why: 'git reset --hard (작업 손실)', match: (c) => c.git?.[0] === 'reset' && c.git.includes('--hard') },
  { id: 'git-clean-f', why: 'git clean -d/-f/-x (미추적 파일 손실)', match: (c) => c.git?.[0] === 'clean' && c.git.slice(1).some(isCleanFlag) },
  {
    // `--force-with-lease`·`--force-if-includes`·`+refspec`·`-c remote.*.push=+…`도 원격 이력을 덮어쓴다
    id: 'force-push',
    why: 'force push — --force / -f / --force-with-lease / --force-if-includes / +refspec (원격 이력 손실)',
    match: (c) => (pushArgs(c)?.some(isPushForce) ?? false) || isConfigForcePush(c),
  },
  {
    id: 'git-branch-강제삭제',
    why: 'git branch -D / --delete --force (병합 안 된 브랜치 삭제)',
    match: (c) => c.git?.[0] === 'branch' && (c.git.slice(1).some(isBranchD)
      || (c.git.slice(1).some(isBranchDelete) && c.git.slice(1).some(isForce))),
  },
  {
    // `switch -C`와 같은 종류다 — 기존 브랜치 포인터를 강제로 옮기거나 이름·사본으로 덮는다
    id: 'git-branch-강제이동',
    why: 'git branch -f / --force / -M / -C (브랜치 포인터 강제 이동·덮어쓰기)',
    match: (c) => c.git?.[0] === 'branch' && c.git.slice(1).some((t) => t === '--force' || (!t.startsWith('--') && /^-[A-Za-z]*[fMC]/.test(t))),
  },
  {
    id: 'git-checkout-경로복원',
    why: 'git checkout -- <path> / . (로컬 편집 폐기)',
    match: (c) => c.git?.[0] === 'checkout' && (c.git.includes('--') || c.git.includes('.')),
  },
  { id: 'git-restore', why: 'git restore (로컬 편집 폐기)', match: (c) => c.git?.[0] === 'restore' },
  {
    // 설정이 `git switch *`를 질의 없이 열어 두므로 작업을 버리는 꼴은 여기서 막는다.
    // `-C`·`--force-create`는 기존 브랜치 포인터를 강제로 옮겨 그 브랜치의 커밋을 잃게 한다.
    id: 'git-switch-폐기',
    why: 'git switch --discard-changes / -f / -C (로컬 편집·브랜치 포인터 폐기)',
    match: (c) => c.git?.[0] === 'switch' && c.git.slice(1).some((t) => isForce(t) || /^--(f|di)/.test(t)
      || (!t.startsWith('--') && /^-[A-Za-z]*C/.test(t))),
  },
  { id: 'git-stash-폐기', why: 'git stash drop / clear (스태시 폐기)', match: (c) => c.git?.[0] === 'stash' && (c.git[1] === 'drop' || c.git[1] === 'clear') },
  {
    id: 'git-config-global',
    why: 'git config --global (사용자 전역 설정 영속 변경)',
    match: (c) => c.git?.[0] === 'config' && c.git.includes('--global') && !c.git.some(isConfigRead),
  },
  { id: 'remove-item-recurse', why: 'Remove-Item -Recurse (파일 손실)', match: (c) => c.name === 'remove-item' && c.args.some((t) => low(t).startsWith('-recurse')) },
  { id: 'del-s', why: 'del /s (하위 폴더까지 삭제)', match: (c) => c.name === 'del' && c.args.some((t) => low(t) === '/s') },
  { id: 'rmdir-s', why: 'rmdir /s (하위 폴더까지 삭제)', match: (c) => c.name === 'rmdir' && c.args.some((t) => low(t) === '/s') },
  { id: '디스크-직접조작', why: '디스크 직접 조작', match: (c) => c.name === 'dd' || c.name === 'mkfs' || c.name.startsWith('mkfs.') },
]

// push 경계 (헌법 10조) — push는 허용하고 작업 브랜치 분리로 통제한다. `master`는 GitHub 서버 보호가 지킨다
// (PR 필수, 관리자 포함, 강제 push·삭제 금지). 그래서 일반 push는 무출력이고, 가드는 이중 안전장치다.
// 강제 push는 위 DESTRUCTIVE가 차단하고, 아래는 묻는다 — 원격 삭제, 여러 ref 일괄, 토큰 어디에든 `master`가 보이는 push,
//   `send-pack`, `-c alias.*`로 감싼 push, 로컬 ref를 덮어쓰는 fetch, 서버 보호를 바꿀 수 있는 `gh api`·`gh repo` 호출.
// 판독이 못 읽는 꼴(변수·설정·저장소 상태·리다이렉트로 가려진 push, 명령 치환의 실행 내용)은 무출력이다 —
//   `master`로 가면 서버가 거부하고, 작업 브랜치의 강제 갱신은 감수 위험이다.
// 가드는 어떤 명령에도 `permissionDecision: "allow"`를 내지 않는다 — 무출력이면 설정의 allow가 적용된다.
// push 목적지를 저장소 상태로 판정하는 설계는 버렸다 — 근거는 98_Management/00_ADR/ADR-004-push-서버-보호.md.
const isGh = (c) => c.base === 'gh' || c.base === 'gh.exe'

// gh의 하위 명령 낱말 둘(무리와 동사) — gh가 하위 명령을 찾는 규칙을 따른다 (gh 2.92 실측).
//   `=` 없는 `--긴옵션`과 정확히 두 글자인 `-x`는 다음 낱말을 값으로 먹는다 (`gh pr -b x merge 12`는 병합이다).
//   `--긴옵션=값`과 세 글자 이상의 `-xy` 묶음, `--help`·`-h`·`--version`은 값을 먹지 않는다.
// 동사 뒤의 낱말은 보지 않는다 — `gh pr create --title merge`의 `merge`는 병합이 아니다.
const GH_NO_VALUE = new Set(['--help', '-h', '--version'])
function ghWords(c) {
  const words = []
  for (let i = 0; i < c.args.length && words.length < 2; i++) {
    const t = c.args[i]
    if (!t.startsWith('-')) { words.push(t); continue }
    if (GH_NO_VALUE.has(t)) continue
    if (t.startsWith('--') ? !t.includes('=') : t.length === 2) i++
  }
  return words
}
const ghPr = (c, verb) => { const w = ghWords(c); return isGh(c) && w[0] === 'pr' && w[1] === verb }
// 낱말에 붙은 리다이렉트(`edit>/dev/null`)는 떼고 대조한다. `ghPr`는 떼지 않는다.
const ghWord = (w) => (typeof w === 'string' ? w.split(/[<>]/)[0] : w)
const ghIs = (c, group, verbs) => {
  const w = ghWords(c).map(ghWord)
  return isGh(c) && w[0] === group && (!verbs || verbs.includes(w[1]))
}

// `gh api`의 쓰기 판정 — gh 2.x pflag 규칙을 따른다.
//   메서드: `-X`·`--method` 값, `--method=X`, `-XPUT`·`-X=PUT` 붙여쓰기, `-iX PUT` 묶음. GET이 아니면 쓰기다.
//   필드: `-f`·`-F`·`--field`·`--raw-field`·`--input`이 있으면 gh는 기본 메서드를 POST로 바꾼다 — 쓰기로 본다.
//   짧은 옵션 묶음은 앞에서부터 읽고, 값을 먹는 글자(`H`·`p`·`q`·`t`)에서 멈춘다. 값이 빠진 `-X`는 묻는 쪽이다.
const GH_API_FIELD_LONG = ['--field', '--raw-field', '--input']
const GH_API_VALUE_SHORT = 'Hpqt'
const notGet = (v) => typeof v !== 'string' || v.toUpperCase() !== 'GET'
function ghApiWrites(args) {
  for (let i = 0; i < args.length; i++) {
    const t = args[i]
    if (t === '--') break
    if (t === '--method') { if (notGet(args[i + 1])) return true; i++; continue }
    if (t.startsWith('--method=')) { if (notGet(t.slice(9))) return true; continue }
    if (GH_API_FIELD_LONG.some((o) => t === o || t.startsWith(`${o}=`))) return true
    if (t.startsWith('--') || !/^-[A-Za-z]/.test(t)) continue
    for (let j = 1; j < t.length; j++) {
      const ch = t[j]
      if (ch === 'f' || ch === 'F') return true
      if (ch === 'X') {
        const rest = t.slice(j + 1).replace(/^=/, '')
        if (notGet(rest || args[i + 1])) return true
        if (!rest) i++
        break
      }
      if (GH_API_VALUE_SHORT.includes(ch)) break
    }
  }
  return false
}
const RE_GH_PROTECTION = /protection|rulesets/i
const ghApi = (c) => ghIs(c, 'api')

// 병합 차단 (헌법 10조) — `master`로 가는 병합은 사람의 버튼과 사용자가 직접 치는 한 줄로만 한다. goal의 로컬 `git merge --no-ff`는 밖이다.
// 가드는 읽을 수 있는 병합 호출 꼴을 대상 브랜치와 관계없이 묻지 않고 차단한다 — 권한 창을 생략하는 모드에서도 사람 없이 지나가지 않게.
// 사용자의 `!` 명령은 이 훅을 지나지 않는다.
// `gh api`는 끝점 낱말로 판정해 설정 `deny`의 글자 꼴보다 좁다 — 본문 글에 끝점 글자가 든 다른 호출과 같은 끝점의 GET은 막지 않는다.
// 차단은 루프를 멈추므로 오탐 비용이 묻기보다 크다. 읽지 못하는 꼴(변수·명령 치환·gh 별칭·`--input`·`-F query=@파일`·해석기 안 코드)은 쫓지 않는다.
const MERGE_HINT = '`master`로 가는 병합은 사람이 합니다 — 현황판 병합 카드, 앱 PR 카드, GitHub 웹, 또는 사용자가 직접 치는 `gh pr merge <번호> --merge --match-head-commit <SHA>`. 에이전트는 그 한 줄을 적어 줄 뿐 실행하지 않습니다. goal PR은 에이전트가 로컬 `git merge --no-ff`로 마일스톤 브랜치에 합치고 그 브랜치를 push합니다 — GitHub가 PR을 병합됨으로 닫습니다. `gh pr merge`·병합 API는 대상 브랜치와 관계없이 쓰지 않습니다(헌법 10조).'
// gh api에서 다음 낱말을 값으로 먹는 옵션 (gh 2.x `gh api --help`)
const GH_API_VALUE_OPTS = new Set(['-X', '--method', '-H', '--header', '-f', '--raw-field', '-F', '--field', '--input', '-p', '--preview', '-q', '--jq', '-t', '--template', '--cache', '--hostname'])
// `gh … api <끝점>`의 끝점 낱말 — `api` 낱말 뒤 첫 비옵션 낱말. 짧은 옵션 묶음(`-iX`)은 끝 글자가 값을 먹는 글자면 다음 낱말을 먹는다.
function ghApiEndpoint(c) {
  let i = 0, words = 0
  for (; i < c.args.length; i++) { // ghWords와 같은 규칙으로 `api` 낱말의 자리를 찾는다
    const t = c.args[i]
    if (!t.startsWith('-')) { if (++words === 1) break; continue }
    if (GH_NO_VALUE.has(t)) continue
    if (t.startsWith('--') ? !t.includes('=') : t.length === 2) i++
  }
  for (i++; i < c.args.length; i++) {
    const t = c.args[i]
    if (t === '--') return ghWord(c.args[i + 1] ?? '')
    // 리다이렉트 낱말(`>/dev/null`·`2>&1`·떨어진 `>` 뒤의 대상)은 끝점이 아니다
    if (/^(\d*|&)[<>]/.test(t)) { if (/^(\d*|&)[<>]{1,2}$/.test(t)) i++; continue }
    if (!t.startsWith('-')) return ghWord(t)
    if (GH_API_VALUE_OPTS.has(t)) { i++; continue }
    if (t.startsWith('--')) continue
    // 짧은 옵션 묶음은 앞에서부터 읽는다 — 값을 먹는 글자 뒤에 글이 붙어 있으면 그게 값이고, 끝 글자면 다음 낱말이 값이다
    for (let j = 1; j < t.length; j++) {
      if ('XHfFpqt'.includes(t[j])) { if (j === t.length - 1) i++; break }
    }
  }
  return ''
}
const RE_PULL_MERGE = /(^|\/)pulls\/[^/?#]+\/merge(-async)?\/?([?#].*)?$/i
const RE_GRAPHQL = /(^|\/)graphql\/?([?#].*)?$/i
const RE_GQL_MERGE = /mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest/i
const MERGE_BLOCK = [
  // 동사에 붙은 리다이렉트(`merge>/dev/null`)도 뗀다 — ghIs
  { id: 'gh-pr-merge', why: 'PR 병합 (master 진입)', match: (c) => ghIs(c, 'pr', ['merge']) },
  { id: 'gh-api-병합', why: 'gh api 병합 호출 (pulls/<번호>/merge 쓰기)', match: (c) => ghApi(c) && RE_PULL_MERGE.test(ghApiEndpoint(c)) && ghApiWrites(c.args) },
  { id: 'gh-graphql-병합', why: 'GraphQL 병합 변이 (mergePullRequest·enablePullRequestAutoMerge)', match: (c) => ghApi(c) && RE_GRAPHQL.test(ghApiEndpoint(c)) && c.args.some((t) => RE_GQL_MERGE.test(t)) },
]

// `master`가 글자로 보이는가 — 세그먼트의 모든 토큰(머리의 할당·래퍼·git 전역 옵션 포함)을 본다
const segShowsMaster = (c) => (c.seg ?? c.args).some((t) => low(t).includes('master'))

const IRREVERSIBLE = [
  { id: 'push-원격삭제', why: 'git push --delete / -d / :refspec (원격 ref 삭제)', match: (c) => pushArgs(c)?.some(isPushDelete) ?? false },
  { id: 'push-일괄', why: 'git push --mirror / --all / --tags / --prune / * refspec (여러 ref 일괄 변경)', match: (c) => pushArgs(c)?.some(isPushBulk) ?? false },
  { id: 'push-master', why: 'master가 보이는 git push (master 진입 시도)', match: (c) => pushArgs(c) !== null && segShowsMaster(c) },
  { id: 'git-send-pack', why: 'git send-pack (저수준 원격 반영)', match: (c) => c.git?.[0] === 'send-pack' },
  { id: 'git-별칭-push', why: 'git -c alias.<이름>=…push… (별칭으로 감싼 push)', match: isConfigPushAlias },
  { id: 'fetch-ref덮어쓰기', why: 'git fetch +refspec / src:dst / --prune refspec (로컬 ref 덮어쓰기·삭제)', match: fetchRewritesRefs },
  { id: 'gh-api-보호설정', why: 'gh api 보호 설정 경로 (branch protection·rulesets)', match: (c) => ghApi(c) && c.args.some((t) => RE_GH_PROTECTION.test(t)) },
  { id: 'gh-api-쓰기', why: 'gh api 쓰기 호출 (GitHub 상태 변경)', match: (c) => ghApi(c) && ghApiWrites(c.args) },
  { id: 'gh-repo-변경', why: 'gh repo edit / delete / rename / archive (저장소 설정 변경·삭제)', match: (c) => ghIs(c, 'repo', ['edit', 'delete', 'rename', 'archive']) },
  // 판독이 못 읽는 꼴(영속 별칭·셸 확장·다른 세그먼트의 설정)은 쫓지 않는다
  { id: 'gh-repo-sync-강제', why: 'gh repo sync --force (원격 브랜치 덮어쓰기)', match: (c) => ghIs(c, 'repo', ['sync']) && c.args.some((t) => t === '--force') },
  { id: 'gh-secret', why: 'gh secret set / delete (저장소 비밀 변경)', match: (c) => ghIs(c, 'secret', ['set', 'delete', 'remove']) },
  { id: 'gh-alias', why: 'gh alias set / import (명령을 감추는 별칭 심기)', match: (c) => ghIs(c, 'alias', ['set', 'import']) },
  {
    id: 'git-원격-실행옵션',
    why: 'git --receive-pack / --upload-pack / push --exec (원격 쪽 임의 명령)',
    match: (c) => (c.git?.slice(1).some((t) => isLongOpt(t, ['receive-pack', 'upload-pack'], 3)) ?? false)
      || (pushArgs(c)?.some((t) => t === '--exec' || t.startsWith('--exec=')) ?? false),
  },
  { id: 'git-branch-이름바꾸기', why: 'git branch -m / --move (브랜치 이름 바꾸기)', match: (c) => c.git?.[0] === 'branch' && c.git.slice(1).some((t) => t === '--move' || (!t.startsWith('--') && /^-[A-Za-z]*m/.test(t))) },
  // 설정의 `git log*`·`git diff*`·`git show*` 허용이 임의 경로 쓰기를 연다
  { id: 'git-출력파일', why: 'git --output (임의 경로에 파일 쓰기)', match: (c) => c.git?.slice(1).some((t) => t === '--output' || t.startsWith('--output=')) ?? false },
  {
    id: 'gh-pr-브랜치삭제',
    why: 'gh pr close --delete-branch (브랜치 삭제)',
    match: (c) => ghPr(c, 'close') && c.args.some((t) => t.startsWith('--delete') || (!t.startsWith('--') && /^-[A-Za-z]*d/.test(t))),
  },
  {
    id: 'git-branch-삭제',
    why: 'git branch -d / --delete (브랜치 삭제)',
    match: (c) => c.git?.[0] === 'branch' && c.git.slice(1).some((t) => isBranchDelete(t) || t.startsWith('--d')),
  },
  { id: 'git-update-ref-삭제', why: 'git update-ref -d (ref 직접 삭제)', match: (c) => c.git?.[0] === 'update-ref' && c.git.slice(1).some((t) => t === '-d' || t.startsWith('--d') || t === '--stdin') },
  { id: 'gh-release', why: 'GitHub release 발행', match: (c) => isGh(c) && ghWords(c)[0] === 'release' },
  { id: 'npm-publish', why: 'npm 레지스트리 공개', match: (c) => c.name === 'npm' && c.args.includes('publish') },
  { id: 'npm-package', why: '배포 산출물 빌드', match: (c) => c.name === 'npm' && c.args[0] === 'run' && c.args[1] === 'package' },
]

// heredoc 본문 면제 — 줄의 pipeline 전체를 소비자로 보고, 실행되지도 파일로 남지도 않는 소비자
// (`git commit -F -`, operand 없는 `cat`·`tee`)뿐일 때만 본문을 뺀다. 파일 sink(리다이렉트·`tee FILE`·`dd of=`·`sponge`)는
// 판별 불가다 — 본문이 파일로 남으면 뒤이은 `bash run.sh`에는 위험 원문이 없다. 판별 불가가 하나라도 있으면 본문을 판정한다.
const HEREDOC_WORD = /[A-Za-z0-9_.-]/

function heredocDelims(line) {
  const out = []
  for (let i = 0; i + 1 < line.length; i++) {
    if (line[i] !== '<' || line[i + 1] !== '<') continue
    if (line[i - 1] === '<' || line[i + 2] === '<') continue // here-string(`<<<`)은 heredoc이 아니다
    let j = i + 2
    const dash = line[j] === '-'
    if (dash) j++
    while (line[j] === ' ' || line[j] === '\t') j++
    const quote = line[j] === "'" || line[j] === '"' ? line[j] : null
    if (quote) j++
    let word = ''
    while (j < line.length && HEREDOC_WORD.test(line[j])) word += line[j++]
    if (quote && line[j] === quote) j++
    if (word) { out.push({ delim: word, dash, at: i }); i = j - 1 }
  }
  return out
}

const stripHeredocMarkers = (stage) => stage.replace(/<<-?\s*(?:'[^']*'|"[^"]*"|[A-Za-z0-9_.-]+)/g, ' ')

// 이스케이프는 세그먼트 분할과 같게 읽는다 — 인용부 밖 `\"`가 연 가짜 인용이 뒤의 `>`를 가리지 않게.
function hasOutputRedirect(stage) {
  let quote = null
  for (let i = 0; i < stage.length; i++) {
    const ch = stage[i]
    if (isEscape(quote, ch, stage[i + 1])) { i++; continue }
    if (quote) { if (ch === quote) quote = null; continue }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '>') return true
  }
  return false
}

function isExemptConsumer(stage) {
  if (hasOutputRedirect(stage)) return false
  const tokens = tokenize(stripHeredocMarkers(stage))
  if (!tokens.length) return false
  const name = low(tokens[0])
  const rest = tokens.slice(1)
  if (name === 'cat' || name === 'tee') return rest.every((t) => t.startsWith('-'))
  if (isGit(name)) {
    const sub = gitSub(rest)
    if (sub[0] !== 'commit') return false
    const fi = sub.findIndex((t) => t === '-F' || t === '--file')
    return fi >= 0 && sub[fi + 1] === '-'
  }
  return false
}

function allConsumersExempt(line) {
  const stages = splitSegments(line)
  return stages.length > 0 && stages.every(isExemptConsumer)
}
// heredoc 하나의 면제 — `<<`가 든 파이프라인만 소비자로 본다(논리 줄 판독 `logicalLines`와 같은 규칙).
// `git add -A && git commit -F - <<'EOF'`의 `git add`는 본문을 받지 않는다.
// 파이프라인 단위 면제는 그룹·서브셸·명령 치환이 없는 평평한 줄에서만 쓴다 — `{ echo; cat <<EOF; } | bash`처럼
// 묶음 밖의 소비자가 본문을 실행하는 꼴은 파이프라인 경계로 읽히지 않는다. 그 밖은 줄 전체 규칙 그대로다.
// 줄마다 한 번만 훑는다 — heredoc이 많은 줄에서 제곱 시간이 되지 않게.
function heredocExemptFor(line) {
  if (allConsumersExempt(line)) return () => true
  if (/[(){}`]/.test(line)) return () => false
  const ranges = pipelineRanges(line)
  const memo = new Map()
  const end = line.trimEnd().length
  return (at) => {
    const r = rangeAt(ranges, at)
    // heredoc이 든 파이프라인이 줄의 마지막일 때만 — 뒤에 이어지는 실행(`cat <<EOF && bash run.sh`, HD-17)은 줄 전체 규칙이다
    if (r[1] < end) return false
    const key = r[0] + ':' + r[1]
    if (!memo.has(key)) memo.set(key, allConsumersExempt(line.slice(r[0], r[1])))
    return memo.get(key)
  }
}

function stripExemptHeredocBodies(command) {
  const lines = command.split('\n')
  const kept = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i++]
    kept.push(line)
    const delims = heredocDelims(line)
    if (!delims.length) continue
    const exemptAt = heredocExemptFor(line)
    for (const d of delims) {
      const exempt = exemptAt(d.at)
      while (i < lines.length) {
        const raw = lines[i++]
        const probe = (d.dash ? raw.replace(/^[\t ]+/, '') : raw).replace(/\r$/, '').trim()
        if (probe === d.delim) break
        if (!exempt) kept.push(raw)
      }
    }
  }
  return kept.join('\n')
}

// 셸이 명령 위치에 섰을 때만 `-c` 인자 문자열을 같은 파이프라인으로 다시 판정한다 — 인용문·커밋 메시지에 든
// `bash -c "…"` 서술은 명령 위치가 아니라 다시 읽지 않는다. 깊이 상한은 무한 중첩 입력에서 스택을 보호한다.
const SHELL_DEPTH_LIMIT = 3

// 셸 실행 파일 인자에서 스크립트 문자열을 찾는다 — `sh [옵션…] -c [옵션…] [--] 스크립트`의 옵션 구간은 첫 operand나 `--`·`-`에서 끝난다.
//   `c`가 짧은 옵션 묶음의 어디에 있어도 -c 모드다(`-ce`·`-lc`, bash는 `+c`도). 스크립트는 옵션 구간 뒤의 첫 operand다.
//   `-o`·`-O`는 글자마다 값을 하나씩 먹고(`-coo a b`), `--rcfile`·`--init-file`도 값을 먹는다. 대시 하나 긴 옵션(`-login`)은 먹지 않는다.
// `-c` 꼴 토큰 바로 뒤의 토큰도 합집합으로 읽는다 — 재판정 표면을 줄이지 않는다. -c 모드가 아닌 operand는 파일 이름이다.
// 앱 mergeDeny.ts의 사본과 같다.
const SHELL_VALUE_LONG = new Set(['--rcfile', '--init-file'])
const SHELL_LONG_WORDS = new Set(['login', 'noprofile', 'norc', 'posix', 'restricted', 'verbose', 'version', 'help', 'debugger', 'noediting', 'dump-strings', 'dump-po-strings', 'pretty-print'])
const RE_SHELL_BUNDLE = /^[-+][A-Za-z]+$/

// 대시 하나 긴 옵션은 bash만 읽는다 — zsh·ksh·dash·ash에서 `-restricted`는 `c`가 든 짧은 묶음이다.
// sh는 bash일 수도 dash일 수도 있어 두 판독의 합집합이다. 셸을 모르면 합집합이다.
const LONG_WORD_SHELLS = new Set(['bash', 'bash.exe'])
const EITHER_SHELLS = new Set(['sh', 'sh.exe'])
function shellScriptStart(args, longWords) {
  let cMode = false
  let i = 0
  while (i < args.length) {
    const t = args[i]
    if (t === '--' || t === '-') { i++; break }
    if (t.startsWith('--')) { i += SHELL_VALUE_LONG.has(t) ? 2 : 1; continue }
    if (longWords && t[0] === '-' && SHELL_LONG_WORDS.has(t.slice(1))) { i++; continue }
    if (!RE_SHELL_BUNDLE.test(t)) break
    if (t.includes('c')) cMode = true
    i += 1 + (t.match(/[oO]/g)?.length ?? 0)
  }
  return cMode && i < args.length ? i : -1
}
function shellScriptsOf(args, shell) {
  const readings = LONG_WORD_SHELLS.has(shell) ? [true] : shell === undefined || EITHER_SHELLS.has(shell) ? [true, false] : [false]
  const at = new Set(readings.map((lw) => shellScriptStart(args, lw)).filter((j) => j >= 0))
  const k = args.findIndex((t) => RE_SHELL_C.test(t))
  if (k >= 0 && k + 1 < args.length) at.add(k + 1)
  return [...at].map((j) => args[j])
}

// 논리 줄 판독 — 원문 읽기는 물리 줄 단위라 `\`+개행 줄 이음을 모르고, 원문 전체를 이으면 bash가 잇지 않는 자리
// (주석 끝, 따옴표 친 heredoc 본문)까지 이어 뒤 명령이 사라진다. 그래서 bash처럼 한 번에 읽는 두 번째 판독을 둔다.
// 판정은 원문 읽기·이 판독·이음 지운 원문 읽기(`joinedReading`)의 합집합이라 원문 읽기보다 약해질 수 없다. 이 판독이 문맥을
// 잘못 짐작해 글을 잃어도(닫히지 않는 `((`, 묶음 밖 `| bash`) 이음 지운 원문 읽기가 따로 읽는다. 어느 판독도 다른 판독의 글을 지우지 않는다.
//   - 문맥 쌓기: 작은따옴표·`$'…'`·큰따옴표·백틱·`${ … }`·`$( … )`·산술(`$(( ))`·`(( ))`·`$[ ]`).
//     따옴표 밖과 큰따옴표 안의 `\`+LF·`\`+CRLF는 지운다. 그 밖의 `\X`는 두 글자 그대로 두되 X가 문맥을 바꾸지 않게 건너뛰고,
//     X는 낱말 경계로 치지 않는다(`a\ #b`). 백틱 안은 닫는 백틱까지 글자 그대로다.
//   - 주석: 낱말 경계 뒤의 `#`(따옴표·`${ }`·산술 밖)부터 줄 끝까지 버린다. 주석 안의 `\`는 줄을 잇지 않는다.
//     `)`·`}` 뒤의 `#`(`$(echo t)#tag`)는 낱말 가운데라 주석으로 보지 않는다.
//   - heredoc: `<<`·`<<-` 뒤 단어가 구분자다(따옴표나 `\`가 섞이면 따옴표 친 구분자). 본문은 연산자가 있는 줄의
//     개행 뒤에서 읽는다. 따옴표 친 구분자는 원문 줄 그대로, 없는 구분자는 줄 끝 홀수 `\`로 이은 줄로 종결자를 찾는다.
//   - 본문은 먹는 쪽이 면제 소비자(`cat`·`tee`, `git commit -F -`)뿐일 때만 버리고, 나머지는 명령으로 다시 읽는다
//     (셸 이름 목록은 닫히지 않는다). 먹는 쪽은 가장 안쪽 `$( … )` 안의 파이프라인으로 본다.
//     명령 자리의 `$( … )`(`bash -c "$(cat <<EOF …)"`의 스크립트)가 내는 글은 실행되므로 면제하지 않는다.
// 반환은 따옴표 밖 개행이 없는 논리 줄의 목록이다(`$( … )` 안의 개행은 남는다). 각 줄을 `splitSegments`로 나눈다.
// 한 번 훑기다 — 파이프라인 경계는 개행마다 heredoc의 문맥 머리별로 한 번 셈하고 보관하며, 줄 하나에 heredoc이
// HEREDOC_MANY개를 넘으면 경계를 세지 않고 본문을 모두 다시 읽는다(제곱 시간 방지).
const HEREDOC_WORD_END = new Set([' ', '\t', '\r', '\n', ';', '&', '|', '<', '>', '(', ')'])
const COMMENT_AFTER = new Set([' ', '\t', ';', '&', '|', '(', '\n'])
const ARITH = new Set(['$((', '((', '$[', '['])
const CMD_WORDS = new Set(['then', 'do', 'else', 'elif', 'if', 'while', 'until', 'eval', 'exec', '!', '{'])
const HEREDOC_DEPTH_LIMIT = 8

// `((`·`$((`가 산술인가 — j는 여는 괄호 둘 다음 위치다. 같은 물리 줄 안에서 괄호 깊이가 붙은 `))`로 0이 되면 산술이다.
// 닫히지 않으면(`[[ x =~ ((a|b)c) ]]`·`((cd .) || …)`) bash는 서브셸·묶음으로 읽는다 — 산술로 보면 heredoc 판독이 꺼져
// 커밋 본문을 명령으로 읽는다. 바깥 `(`의 짝이 안쪽 `(`의 짝 바로 뒤 `)`면 산술이다.
// 물리 줄마다 괄호 짝을 한 번만 세어 둔다 — `((`마다 줄을 다시 훑으면 개행 없는 `((` 반복에서 제곱 시간이다.
let arithMemo = null
function arithCloses(text, j) {
  const o = j - 2
  if (!arithMemo || arithMemo.text !== text || o < arithMemo.start || o >= arithMemo.end) {
    const start = o > 0 ? text.lastIndexOf('\n', o - 1) + 1 : 0
    let end = text.indexOf('\n', o)
    if (end < 0) end = text.length
    const match = new Map()
    const st = []
    for (let k = start; k < end; k++) {
      if (text[k] === '(') st.push(k)
      else if (text[k] === ')' && st.length) match.set(st.pop(), k)
    }
    arithMemo = { text, start, end, match }
  }
  const inner = arithMemo.match.get(o + 1)
  return inner !== undefined && arithMemo.match.get(o) === inner + 1
}

function readHeredocWord(text, j) {
  let delim = ''
  let quoted = false
  while (j < text.length && !HEREDOC_WORD_END.has(text[j])) {
    const ch = text[j]
    if (ch === '\\' && text[j + 1] === '\n') { j += 2; continue }
    if (ch === '\\' && text[j + 1] === '\r' && text[j + 2] === '\n') { j += 3; continue }
    if (ch === "'" || ch === '"') {
      quoted = true
      const end = text.indexOf(ch, j + 1)
      if (end < 0) { delim += text.slice(j + 1); j = text.length; break }
      delim += text.slice(j + 1, end)
      j = end + 1
      continue
    }
    if (ch === '\\' && j + 1 < text.length) { quoted = true; delim += text[j + 1]; j += 2; continue }
    delim += ch
    j++
  }
  return { delim, quoted, end: j }
}

const dropCR = (line) => (line.endsWith('\r') ? line.slice(0, -1) : line)
function trailingBackslashes(line) {
  const s = dropCR(line)
  let k = 0
  while (k < s.length && s[s.length - 1 - k] === '\\') k++
  return k
}
const endsWithContinuation = (line) => trailingBackslashes(line) % 2 === 1

// heredoc 본문 하나를 읽는다 — i는 본문 첫 글자. 종결자 줄 다음 글자의 위치와 본문을 돌려준다.
function readHeredocBody(text, i, h) {
  const lines = []
  while (i < text.length) {
    const nl = text.indexOf('\n', i)
    let line = nl < 0 ? text.slice(i) : text.slice(i, nl)
    let next = nl < 0 ? text.length : nl + 1
    // 따옴표 없는 구분자는 줄 끝 홀수 `\`로 줄을 잇는다. 조각을 모아 한 번에 붙인다 — 잇는 줄마다 전체를 복사하면
    // 줄마다 `\`인 본문에서 제곱 시간이 된다. 끝 `\` 개수는 새 조각이 모두 `\`일 때만 앞 조각과 이어 센다.
    if (!h.quoted && endsWithContinuation(line) && next < text.length) {
      const parts = [line]
      let tb = trailingBackslashes(line)
      while (tb % 2 === 1 && next < text.length) {
        parts[parts.length - 1] = dropCR(parts[parts.length - 1]).slice(0, -1)
        const nl2 = text.indexOf('\n', next)
        const piece = nl2 < 0 ? text.slice(next) : text.slice(next, nl2)
        const t = trailingBackslashes(piece)
        tb = t === dropCR(piece).length ? tb - 1 + t : t
        parts.push(piece)
        next = nl2 < 0 ? text.length : nl2 + 1
      }
      line = parts.join('')
    }
    i = next
    const probe = h.dash ? dropCR(line).replace(/^\t+/, '') : dropCR(line)
    if (probe === h.delim) return { body: unescapeBody(lines, h), next: i }
    lines.push(line)
  }
  return { body: unescapeBody(lines, h), next: i }
}
// 따옴표 없는 구분자의 본문은 셸이 `\\`·`\$`·`` \` ``를 풀어 넘긴다 — 본문을 명령으로 다시 읽을 때 그 글을 쓴다.
const unescapeBody = (lines, h) => (h.quoted ? lines.join('\n') : lines.join('\n').replace(/\\([\\$`])/g, '$1'))

// 파이프라인 경계 — `;`·`&&`·`||`·`&`·개행에서 끊고 `|`·`|&`·`&>`·`>&`에서는 끊지 않는다. [시작, 끝) 목록.
function pipelineRanges(text) {
  const out = []
  let start = 0
  let quote = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (isEscape(quote, ch, text[i + 1])) { i++; continue }
    if (quote) { if (ch === quote) quote = null; continue }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    let w = 0
    if (ch === ';' || ch === '\n') w = 1
    else if (ch === '|' && text[i + 1] === '|') w = 2
    else if (ch === '&') {
      if (text[i + 1] === '&') w = 2
      else if (text[i + 1] === '>' || text[i - 1] === '>' || text[i - 1] === '<' || text[i - 1] === '|') w = 0
      else w = 1
    }
    if (!w) continue
    out.push([start, i])
    start = i + w
    i += w - 1
  }
  out.push([start, text.length])
  return out
}
function rangeAt(ranges, pos) {
  let lo = 0
  let hi = ranges.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ranges[mid][0] <= pos) lo = mid
    else hi = mid - 1
  }
  return ranges[lo]
}

// `$(`가 명령 자리에 섰는가 — 그 앞이 비었거나 구분자·제어 구문 낱말이면 `$( … )`가 낸 글이 실행된다.
function atCommandPos(s) {
  let k = s.length - 1
  while (k >= 0 && (s[k] === ' ' || s[k] === '\t' || s[k] === '"')) k--
  if (k < 0 || ';&|(\n'.includes(s[k])) return true
  let w = k
  while (w >= 0 && /[A-Za-z!{]/.test(s[w])) w--
  return CMD_WORDS.has(s.slice(w + 1, k + 1)) && (w < 0 || ' \t;&|(\n'.includes(s[w]))
}
// `$(`가 셸 `-c`의 스크립트 자리에 섰는가 — `bash -c "$(cat <<EOF …)"`의 `$( … )`가 낸 글은 스크립트로 실행된다.
const RE_SHELL_C_ARG = /(?:^|[\s;&|(])(?:[^\s;&|(]*[/\\])?(?:sh|bash|dash|zsh|ksh|ash)(?:\.exe)?(?:\s+[-+][A-Za-z]+)*\s+-[A-Za-z]*c[A-Za-z]*(?:\s+[-+][A-Za-z]+)*\s+"?$/i
// here-string으로 셸에 먹이는 글(`bash <<< "$(cat <<EOF …)"`)도 스크립트로 실행된다.
const RE_SHELL_HERESTRING = /(?:^|[\s;&|(])(?:[^\s;&|(]*[/\\])?(?:sh|bash|dash|zsh|ksh|ash)(?:\.exe)?(?:\s+[-+][A-Za-z]+)*\s*<<<\s*"?$/i
const executesSubst = (tail) => atCommandPos(tail) || RE_SHELL_C_ARG.test(tail) || RE_SHELL_HERESTRING.test(tail)

// 버퍼는 둘이다 — `done`은 이 논리 줄에서 앞서 끝난 물리 줄들(따옴표 밖 개행이 `$( … )` 안에 남은 것), `cur`는 지금 물리 줄.
// 위치는 논리 줄 머리부터 센다(`base` = done 길이). 판독 중에는 `cur`의 글자를 다시 읽지 않고 끝 글자(`last`)와
// 짧은 꼬리(`tail`)만 따로 든다 — 긴 이어 붙인 문자열의 글자를 읽으면 V8이 매번 전체를 펴서 제곱 시간이 된다.
// 줄 하나에 heredoc이 HEREDOC_MANY개를 넘으면 면제를 따지지 않고 모두 다시 읽는다.
const HEREDOC_MANY = 8   // 경계 셈은 문맥 머리마다 줄 길이만큼 든다 — 줄이 길고 heredoc이 많으면(160만 자에 6초) 셈을 접는다
function logicalLines(text, depth = 0) {
  const units = []
  const stack = []
  let done = ''
  let base = 0
  let cur = ''
  let last = ''
  let tail = ''
  let arith = 0
  let dq = 0
  let pending = []
  let i = 0
  const n = text.length
  const grow = (s) => { tail += s; if (tail.length > 512) tail = tail.slice(-256) }
  const add = (s) => { if (!s) return; cur += s; last = s[s.length - 1]; grow(s) }
  const push = (t, len) => {
    const cmd = t === '$(' && executesSubst(tail)
    stack.push({ t, at: base + cur.length + len, cmd })
    if (ARITH.has(t)) arith++
    if (t === '"') dq++
  }
  const pop = () => { const e = stack.pop(); if (ARITH.has(e.t)) arith--; if (e.t === '"') dq-- }
  while (i < n) {
    const ch = text[i]
    const top = stack.length ? stack[stack.length - 1].t : undefined
    if (top === "'") { add(ch); i++; if (ch === "'") pop(); continue }
    if (top === "$'" || top === '`') {
      if (ch === '\\' && i + 1 < n) { add(ch + text[i + 1]); i += 2; continue }
      add(ch); i++
      if (ch === (top === '`' ? '`' : "'")) pop()
      continue
    }
    if (ch === '\\') {
      if (text[i + 1] === '\n') { i += 2; continue }
      if (text[i + 1] === '\r' && text[i + 2] === '\n') { i += 3; continue }
      add(text.slice(i, i + 2)); i += 2
      last = '\\'   // 이스케이프된 글자는 낱말 경계가 아니다 — `a\ #b`의 `#`는 주석이 아니다
      continue
    }
    if (ch === '$' && (text[i + 1] === '(' || text[i + 1] === '[' || text[i + 1] === '{')) {
      // `$((`가 같은 줄에서 `))`로 닫히지 않으면 bash는 명령 치환 안의 서브셸로 읽는다(`$((echo a) | cat)`)
      const t = text[i + 1] === '(' ? (text[i + 2] === '(' && arithCloses(text, i + 3) ? '$((' : '$(') : '$' + text[i + 1]
      push(t, t.length)
      add(t)
      i += t.length
      continue
    }
    if (ch === '`') { push('`', 1); add(ch); i++; continue }
    if (top === '"') { add(ch); i++; if (ch === '"') pop(); continue }
    if (top === '${') {
      if (ch === '}') pop()
      else if (ch === '"') push('"', 1)
      else if (ch === "'" && dq === 0) push("'", 1)
      add(ch); i++
      continue
    }
    if (ch === "'") { push("'", 1); add(ch); i++; continue }
    if (ch === '"') { push('"', 1); add(ch); i++; continue }
    if (ch === '$' && text[i + 1] === "'") { push("$'", 2); add("$'"); i += 2; continue }
    if ((top === '$((' || top === '((') && ch === ')' && text[i + 1] === ')') { pop(); add('))'); i += 2; continue }
    if ((top === '$[' || top === '[') && (ch === '[' || ch === ']')) {
      if (ch === '[') push('[', 1)
      else pop()
      add(ch); i++
      continue
    }
    const atWord = last === '' || COMMENT_AFTER.has(last)
    if (ch === '(' && text[i + 1] === '(' && atWord && top !== '$[' && top !== '[' && arithCloses(text, i + 2)) { push('((', 2); add('(('); i += 2; continue }
    if (top !== undefined && ch === '(') { push('(', 1); add(ch); i++; continue }
    if ((top === '$(' || top === '(') && ch === ')') { pop(); add(ch); i++; continue }
    if (ch === '#' && arith === 0 && atWord) {
      const nl = text.indexOf('\n', i)
      i = nl < 0 ? n : nl
      continue
    }
    if (ch === '<' && text[i + 1] === '<' && text[i + 2] !== '<' && last !== '<' && arith === 0) {
      let j = i + 2
      const dash = text[j] === '-'
      if (dash) j++
      while (text[j] === ' ' || text[j] === '\t') j++
      const w = readHeredocWord(text, j)
      if (w.delim) {
        let ctx = null
        for (let k = stack.length - 1; k >= 0; k--) if (stack[k].t === '$(' || stack[k].t === '(') { ctx = stack[k]; break }
        const from = Math.max(ctx ? ctx.at : 0, base) - base   // 지금 물리 줄 안의 위치
        pending.push({ delim: w.delim, quoted: w.quoted, dash, at: cur.length, from,
          exec: Boolean(ctx && ctx.t === '$(' && ctx.cmd) })
      }
      add(text.slice(i, w.end).replace(/\\\r?\n/g, ''))
      i = w.end
      continue
    }
    if (ch === '\n') {
      i++
      if (pending.length) {
        const line = cur
        const ranges = new Map()
        const exempt = new Map()
        const many = pending.length > HEREDOC_MANY
        for (const h of pending) {
          const { body, next } = readHeredocBody(text, i, h)
          i = next
          // 깊이 상한에서는 본문을 버리지 않고 글 그대로 낸다 — 판독을 멈춰도 글은 원문 읽기처럼 남는다
          if (depth >= HEREDOC_DEPTH_LIMIT) { units.push(body); continue }
          if (many) { for (const u of logicalLines(body, depth + 1)) units.push(u); continue }
          if (!ranges.has(h.from)) ranges.set(h.from, pipelineRanges(line.slice(h.from)))
          const r = rangeAt(ranges.get(h.from), h.at - h.from)
          const key = (h.from + r[0]) + ':' + (h.from + r[1])
          if (!exempt.has(key)) exempt.set(key, allConsumersExempt(line.slice(h.from + r[0], h.from + r[1])))
          if (h.exec || !exempt.get(key)) for (const u of logicalLines(body, depth + 1)) units.push(u)
        }
        pending = []
      }
      if (stack.length === 0) { units.push(done + cur); done = ''; base = 0; cur = ''; last = ''; tail = '' }
      else { done += cur + '\n'; base += cur.length + 1; cur = ''; last = '\n'; grow('\n') }
      continue
    }
    add(ch)
    i++
  }
  units.push(done + cur)
  return units.filter((u) => u.trim())
}

// 이음 지운 원문 읽기 — 세 번째 판독이다. 원문 읽기가 보는 글(면제 heredoc 본문을 지운 글) 전체를 원문 읽기의 따옴표 규칙으로
// 앞에서부터 한 번 훑으며 bash가 잇는 자리의 `\`+개행만 지우고, 그 글을 `splitSegments`에 넘긴다 — 한 줄 꼴에서 원문 읽기가
// 보는 글을 이어 쓴 꼴에서도 보게 한다. 문맥을 잘라 다시 짐작하지 않는다: 따옴표 상태는 글 머리부터 이어 세고
// (거슬러 보는 상한을 두면 긴 따옴표 인자에서 틀린다), 다른 판독의 면제 범위를 쓰지 않는다.
// 원문 읽기와 다른 판단은 셋이다 — 각각 bash가 잇지 않거나 실행하지 않는 자리다.
//   - 작은따옴표가 열린 채 줄 끝에 온 `\`(`'mas\⏎ter'`)는 잇지 않는다.
//   - 낱말 머리의 `#`(따옴표 밖)부터의 주석 안은 잇지 않는다. 이스케이프된 글자(`a\ #b`)와 줄 이음 뒤 글자(`feat\⏎#1`)는
//     낱말 경계가 아니다. 같은 줄 괄호 안이나 `|` 뒤의 `#`는 정규식·extglob 글자일 수 있어(`[[ x =~ (#) ]]`),
//     그 자리가 이음을 끊으면 주석 없이 이은 글도 더 읽는다 — 원문 읽기보다 덜 읽지 않게 한다.
//   - 글 인자 자리 heredoc(`dataArgHeredoc`)의 본문은 지운다.
// heredoc은 줄 이음을 먼저 이은 논리 줄에서 찾는다. 원문 읽기가 한 줄 꼴에서 놓치는 꼴(따옴표 규칙이 bash와 다른 자리)은
// 이 판독도 같이 놓친다 — 그 꼴은 논리 줄 판독이 읽는다.
const RUN_WORD_BREAK = new Set([' ', '\t', ';', '&', '|', '(', '<', '>', '\n'])

// 글 인자 자리의 heredoc — 논리 줄 머리부터 따옴표·`$( … )`를 세어, 첫 `<<`가 `$( … )` 한 겹 안에 있고 그 `$(`가 선
// 단계의 머리 낱말이 `git`·`gh`이며 `$(` 안이 면제 소비자뿐이면 본문은 글이다(`gh pr create --body "$(cat <<'EOF'`).
// 원문 읽기는 이 본문을 열린 큰따옴표 안으로 읽어 건너뛰지만, 본문에 짝 없는 `"`(`5" screen`)가 있으면 그 뒤를 명령으로
// 읽는다 — 이은 글에서 새 오탐이 되지 않게 이 판독만 본문을 뺀다. 줄 전체를 앞에서부터 세며 꼬리를 자르지 않는다.
// 셸 `-c` 스크립트 안(depth > 0)에서는 쓰지 않는다 — 바깥 셸이 `$( … )`를 먼저 펼쳐 본문이 스크립트가 된다.
function dataArgHeredoc(line) {
  const st = []
  let stageStart = 0
  for (let k = 0; k < line.length; k++) {
    const ch = line[k]
    const top = st.length ? st[st.length - 1].t : undefined
    if (top === "'") { if (ch === "'") st.pop(); continue }
    if (ch === '\\') { k++; continue }
    if (ch === '$' && line[k + 1] === '(') {
      if (line[k + 2] === '(') return false
      st.push({ t: '$(', at: k + 2, stage: stageStart }); k++; continue
    }
    if (ch === '`') return false
    if (top === '"') { if (ch === '"') st.pop(); continue }
    if (ch === '"' || ch === "'") { st.push({ t: ch }); continue }
    if (ch === '<' && line[k + 1] === '<') {
      if (line[k + 2] === '<') return false
      const opens = st.filter((e) => e.t === '$(')
      if (opens.length !== 1 || top !== '$(') return false
      return /^(?:git|gh)(?:\.exe)?$/.test(stageHead(line.slice(opens[0].stage, opens[0].at - 2)))
        && allConsumersExempt(line.slice(opens[0].at))
    }
    if (top === '$(' || top === '(') { if (ch === ')') st.pop(); else if (ch === '(') st.push({ t: '(' }); continue }
    if (st.length === 0 && ';&|('.includes(ch)) stageStart = k + 1
  }
  return false
}

// 단계 글의 명령 이름(소문자 basename) — 할당·제어 낱말(`if`·`then`·`!`·`{` …)과 래퍼(`sudo`·`env`·`command` …, 뒤의
// 플래그 포함)를 건너뛴다. `eval`·`exec`는 건너뛰지 않는다 — 그 뒤 글은 실행된다.
const STAGE_SKIP = new Set(['if', 'then', 'do', 'else', 'elif', 'while', 'until', '!', '{', 'time'])
function stageHead(stage) {
  const toks = tokenize(stage)
  let i = 0
  while (i < toks.length) {
    const t = toks[i]
    const b = low(baseName(t))
    if (RE_ASSIGN.test(t) || STAGE_SKIP.has(t)) { i++; continue }
    if (WRAPPERS.has(b)) { i++; while (i < toks.length && toks[i].startsWith('-')) i++; continue }
    return b
  }
  return ''
}

// 이음을 지운 글을 돌려준다. 지운 이음이 없으면 null — 원문 읽기와 같은 글이라 다시 읽지 않는다.
// bash처럼 줄 이음을 먼저 이어 논리 줄을 만든 뒤 그 논리 줄에서 heredoc을 찾고(`git commit \⏎ -F - <<'EOF'`, `cat <\⏎<'EOF'`),
// 본문은 `stripExemptHeredocBodies`의 규칙대로 면제면 지우고 아니면 줄로 남긴다. 본문 안의 이음은 본문 안에서만 잇는다.
// comments가 거짓이면 주석을 모르는 원문 읽기 그대로 잇는다. 주석 규칙은 `[[ x =~ (#) ]]`·extglob `@(#|y)` 안의 `#`를
// bash와 달리 주석으로 볼 수 있어, 주석이 이음을 끊은 자리가 있으면 주석 없이 이은 글도 함께 읽는다.
// 반환은 { text, commentCut } — text는 이음을 지운 글(지운 이음이 없으면 null), commentCut은 주석이 이음을 끊었는가.
function joinedReading(command, depth = 0, comments = true) {
  if (!command.includes('\\')) return { text: null, commentCut: false }
  const lines = command.split('\n')
  const parts = []
  let quote = null
  let prev = ''
  let joined = false
  let commentCut = false
  // 물리 줄 하나를 훑어 따옴표 상태를 옮기고, 줄 끝 `\`가 bash가 잇는 이음인지 돌려준다
  const scan = (s) => {
    let paren = 0   // 이 줄에서 열린 채인 괄호 — 그 안의 `#`는 정규식·extglob 글자일 수 있다
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]
      if (quote === "'") { if (ch === "'") quote = null; prev = ch; continue }
      if (ch === '\\') {
        if (i === s.length - 1) return true
        i++; prev = 'x'   // 이스케이프된 글자는 낱말 경계가 아니고 따옴표 상태를 바꾸지 않는다
        continue
      }
      if (quote === '"') { if (ch === '"') quote = null; prev = ch; continue }
      if (comments && ch === '#' && (prev === '' || RUN_WORD_BREAK.has(prev))) {   // 주석 — 이 줄 끝의 `\`는 잇지 않는다
        if ((paren > 0 || prev === '|') && endsWithContinuation(s)) commentCut = true
        return false
      }
      if (ch === '"' || ch === "'") quote = ch
      else if (ch === '(') paren++
      else if (ch === ')' && paren > 0) paren--
      prev = ch
    }
    return false
  }
  // 줄 묶음을 읽는다. top이면 논리 줄마다 heredoc을 찾고, 본문 줄 묶음은 heredoc을 찾지 않고 같은 규칙으로 잇는다.
  const run = (arr, top) => {
    let k = 0
    let logical = ''
    let startQuote = quote
    while (k < arr.length) {
      const raw = arr[k++]
      const s = dropCR(raw)
      if (scan(s) && k < arr.length) { parts.push(s.slice(0, -1)); logical += s.slice(0, -1); joined = true; continue }
      parts.push(raw, '\n')
      prev = '\n'
      logical += raw
      if (top) {
        const delims = heredocDelims(logical)
        if (delims.length) {
          const exempt = allConsumersExempt(logical)
            || (depth === 0 && startQuote === null && delims.length === 1 && dataArgHeredoc(dropCR(logical)))
          for (const d of delims) {
            const body = []
            while (k < arr.length) {
              const b = arr[k++]
              const probe = (d.dash ? b.replace(/^[\t ]+/, '') : b).replace(/\r$/, '').trim()
              if (probe === d.delim) break
              body.push(b)
            }
            if (!exempt) run(body, false)
          }
        }
      }
      logical = ''
      startQuote = quote
    }
  }
  run(lines, true)
  return { text: joined ? parts.join('') : null, commentCut }
}

function contextsOf(command, depth = 0) {
  // 문맥을 합칠 때 중복을 접지 않는다 — 옛 가드와 같은 문맥 수를 지나야 큰 입력에서도 판정이 옛 가드보다 약해지지 않는다.
  const segs = splitSegments(stripExemptHeredocBodies(command))
  for (const line of logicalLines(command)) for (const s of splitSegments(line)) segs.push(s)
  const joined = joinedReading(command, depth)
  if (joined.text !== null) for (const s of splitSegments(joined.text)) segs.push(s)
  if (joined.commentCut) {
    const bare = joinedReading(command, depth, false)
    if (bare.text !== null) for (const s of splitSegments(bare.text)) segs.push(s)
  }
  const out = []
  for (const seg of segs) {
    const toks = tokenize(seg)
    // 명령 자리의 `eval`은 인자를 이어 스크립트로 돌린다 — 인용한 꼴(`eval "gh pr merge 1"`)도 다시 읽는다
    const ev = toks.indexOf('eval')
    if (depth < SHELL_DEPTH_LIMIT && ev >= 0 && toks.slice(0, ev).every((t) => RE_ASSIGN.test(t) || SHELL_HEAD_WORDS.has(t))) {
      out.push(...contextsOf(toks.slice(ev + 1).join(' '), depth + 1))
    }
    for (const c of commandsOf(toks)) {
      // seg는 세그먼트의 토큰 전부다 — `master` 글자 판정이 머리의 할당(`GIT_CONFIG_VALUE_0=HEAD:master git push`)까지 보게 한다
      out.push({ ...c, seg: toks, segText: seg, git: isGit(c.base) ? gitSub(c.args) : null })
      if (depth >= SHELL_DEPTH_LIMIT) continue
      // `env -S` 문자열은 셸 `-c` 스크립트처럼 같은 파이프라인으로 다시 판정한다
      const split = splitScriptOf(c)
      if (split !== null) out.push(...contextsOf(split, depth + 1))
      const evaluated = evaluatedScriptOf(c)
      if (evaluated) out.push(...contextsOf(evaluated, depth + 1))
      if (!SHELLS.has(c.base)) continue
      for (const script of shellScriptsOf(c.args, c.base)) {
        if (typeof script === 'string' && script.trim()) out.push(...contextsOf(script, depth + 1))
      }
    }
  }
  return out
}

// 인자를 스크립트로 돌리는 PowerShell 명령 — `iex`·`Invoke-Expression`, `Start-Process`.
// 다시 읽을 글을 돌려준다. 앱 잠금 노드 mergeDeny.ts의 windowsShellScripts와 같다. 없으면 null.
const PS_EVAL = new Set(['iex', 'invoke-expression'])
const PS_START = new Set(['start-process', 'saps'])
const PS_START_SWITCH = new Set(['nonewwindow', 'passthru', 'wait', 'loaduserprofile', 'usenewenvironment'])
function evaluatedScriptOf(c) {
  if (PS_EVAL.has(c.base)) {
    const out = []
    for (let i = 0; i < c.args.length; i++) {
      const m = /^-c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?(?::(.*))?$/i.exec(c.args[i])
      if (!m) out.push(c.args[i])
      else if (m[1]) out.push(m[1])
    }
    return out.join(' ')
  }
  if (!PS_START.has(c.base)) return null
  let file
  const list = []
  const positional = []
  for (let i = 0; i < c.args.length; i++) {
    const t = c.args[i]
    if (!t.startsWith('-')) { positional.push(t); continue }
    const [rawName, ...attached] = t.slice(1).split(':')
    const name = low(rawName)
    const value = () => (attached.length ? attached.join(':') : c.args[++i])
    if (name === 'args' || (name.length > 0 && 'argumentlist'.startsWith(name))) {
      // 배열 꼴 — `"pr", "merge"`는 쉼표로 끝난 낱말이 이어지고, `@(…)`는 괄호로 감싼다
      let v = value()
      while (typeof v === 'string' && v.endsWith(',') && i + 1 < c.args.length) v += c.args[++i]
      list.push(v)
    }
    else if (name === 'path' || name === 'pspath' || (name.length > 0 && 'filepath'.startsWith(name))) file = value()
    else if (!PS_START_SWITCH.has(name)) value()
  }
  file ??= positional.shift()
  if (!list.length && positional.length) list.push(positional.shift())
  if (!file) return null
  return [file, ...list.filter((v) => typeof v === 'string').flatMap((v) => v.replace(/^@\(/, '').replace(/\)$/, '').split(','))].join(' ')
}

// 앱 데이터 폴더(Electron userData `agentdeck` — 엔진 코드 `engines/`·`engine-config.json`).
// 설정 deny `Edit(~/AppData/Roaming/agentdeck/**)`는 파일 도구에만 걸린다. 명령이 그 경로를 글로 들고 있고 읽기 명령만이 아니면 묻는다.
const RE_APP_DATA = /(?:appdata[\\/]+roaming|%appdata%|\$\{?appdata\}?|\$env:appdata)[\\/]+agentdeck(?=$|[\\/"'\s])/i
const READ_ONLY_BASES = new Set(['cat', 'ls', 'dir', 'head', 'tail', 'grep', 'rg', 'wc', 'stat', 'file', 'echo', 'cd', 'pushd', 'type', 'get-content', 'gc', 'get-childitem', 'gci'])
const READ_ONLY_GIT = new Set(['commit', 'log', 'show', 'diff', 'status', 'grep'])
// gh의 글만 싣는 명령 — 본문·제목에 경로가 적혀도 파일을 쓰지 않는다
const TEXT_ONLY_GH = new Set(['pr', 'issue'])
// 인용부 밖 `>`가 파일로 쓰는가 — `2>&1`(fd 복제)·`/dev/null`·`nul`은 쓰기가 아니다
function writesFile(stage) {
  let quote = null
  for (let i = 0; i < stage.length; i++) {
    const ch = stage[i]
    if (isEscape(quote, ch, stage[i + 1])) { i++; continue }
    if (quote) { if (ch === quote) quote = null; continue }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch !== '>') continue
    let j = i + 1
    if (stage[j] === '>' || stage[j] === '|') j++
    while (stage[j] === ' ' || stage[j] === '\t') j++
    if (stage[j] === '&') continue
    const target = /^[^\s;|&<>]*/.exec(stage.slice(j))[0]
    if (target && !/^(?:\/dev\/null|nul)$/i.test(target)) return true
  }
  return false
}
const readOnlyCtx = (c) => !writesFile(c.segText ?? '')
  && (READ_ONLY_BASES.has(c.base)
    || (READ_ONLY_GIT.has(c.git?.[0]) && !c.git.some((t) => t === '--output' || t.startsWith('--output=')))
    || (isGh(c) && TEXT_ONLY_GH.has(ghWords(c)[0])))
// 경로를 든 명령이 읽기 명령이 아니거나, 그 폴더로 옮긴(cd·pushd) 뒤 읽기 명령이 아닌 것이 돌면 묻는다
const showsAppData = (c) => c.seg.some((t) => RE_APP_DATA.test(t))
const appDataWrite = (contexts) => contexts.some((c) => showsAppData(c) && !readOnlyCtx(c))
  || (contexts.some((c) => showsAppData(c) && (c.base === 'cd' || c.base === 'pushd')) && contexts.some((c) => !readOnlyCtx(c)))

// 현재 브랜치 — 작업 폴더에서 위로 `.git`을 찾아 HEAD를 읽는다(worktree의 `.git` 파일은 gitdir를 따른다).
// 이 읽기는 질의를 더할 뿐 빼지 않는다 — 못 읽으면(저장소 밖·분리 머리·읽기 실패) 지금과 같은 판정이다. ADR-003의 상태 판독은
// 통과를 내는 설계라 상태가 틀리면 새었다. 여기서는 틀려도 질의 하나가 덜 뜰 뿐이고, `master`는 서버 보호가 받는다.
function currentBranch(cwd) {
  try {
    let dir = resolve(cwd)
    for (let n = 0; n < 64; n++) {
      const dotGit = join(dir, '.git')
      if (existsSync(dotGit)) {
        let gitDir = dotGit
        if (statSync(dotGit).isFile()) {
          const m = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(dotGit, 'utf8'))
          if (!m) return null
          gitDir = resolve(dir, m[1])
        }
        return /^ref:\s*refs\/heads\/(.+?)\s*$/.exec(readFileSync(join(gitDir, 'HEAD'), 'utf8'))?.[1] ?? null
      }
      const up = dirname(dir)
      if (up === dir) return null
      dir = up
    }
  } catch { /* 못 읽으면 판정을 바꾸지 않는다 */ }
  return null
}
const MASTER = 'master'
// 같은 명령 안에서 master로 옮기는 꼴 — `git switch master`, `git checkout -B master …`, `git rebase <위> master`.
// `git switch -c chore/y master`는 새 브랜치로 옮기므로 아니다.
const NEW_BRANCH_OPT = /^(?:-[cCbB]|--create|--force-create|--orphan)$/
function movesToMaster(c) {
  const sub = c.git?.[0]
  if (sub !== 'switch' && sub !== 'checkout' && sub !== 'rebase') return false
  const args = c.git.slice(1)
  const operands = []
  let track = false
  for (let i = 0; i < args.length; i++) {
    const t = args[i]
    if (t === '--') break
    if (sub !== 'rebase' && NEW_BRANCH_OPT.test(t)) return low(args[i + 1] ?? '') === MASTER
    if (sub !== 'rebase' && /^--(?:create|force-create|orphan)=/.test(t)) return low(t.slice(t.indexOf('=') + 1)) === MASTER
    // 이전 브랜치(`-`·`@{-N}`)는 대상을 못 읽는다 — 묻는 쪽으로 본다. 끝 `}`는 묶음 닫기로 떨어져 올 수 있다
    if (sub !== 'rebase' && (t === '-' || /^@\{-\d+\}?$/.test(t))) return true
    if (sub !== 'rebase' && (t === '--track' || t === '-t' || t.startsWith('--track='))) { track = true; continue }
    if (sub === 'rebase' && ['--onto', '-s', '--strategy', '-X', '--strategy-option', '-x', '--exec'].includes(t)) { i++; continue }
    if (!t.startsWith('-')) operands.push(low(t))
  }
  const target = sub === 'rebase' ? operands[1] : operands[0]
  // `--track <원격>/master`는 원격 이름을 뗀 로컬 master를 만들어 옮긴다
  return target === MASTER || (track && target?.slice(target.indexOf('/') + 1) === MASTER)
}
// master 위에서 묻는 꼴 — 병합 전부와 맨 push(refspec 없음, 원격만)·HEAD push. 다른 브랜치를 이름으로 밀면 master가 아니다.
const PUSH_VALUE_OPTS = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec'])
function pushesCurrent(c) {
  const args = pushArgs(c)
  if (args === null) return false
  const operands = []
  for (let i = 0; i < args.length; i++) {
    if (PUSH_VALUE_OPTS.has(args[i])) { i++; continue }
    if (!args[i].startsWith('-')) operands.push(args[i])
  }
  return operands.length <= 1 || operands.slice(1).some((t) => /^\+?(?:HEAD|@)(?::|$)/i.test(t))
}
const isPushOrMerge = (c) => pushesCurrent(c) || c.git?.[0] === 'merge'

function main() {
  const raw = (() => { try { return readFileSync(0, 'utf8') } catch { return '' } })()
  if (!raw.trim()) block('payload-없음', '훅 payload 없음', '판정할 수 없는 상태에서 통과시키면 게이트가 없는 것과 같습니다.')

  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    block('payload-파싱실패', '훅 payload 파싱 실패', '판정 불가 → fail-closed.')
  }

  ctx.session = payload?.session_id ?? null
  ctx.agentId = payload?.agent_id ?? null
  ctx.event = payload?.hook_event_name ?? 'PreToolUse'

  const command = payload?.tool_input?.command
  if (typeof command !== 'string' || command.trim() === '') allow('판정 대상 명령 없음')
  ctx.cmd = command

  const contexts = contextsOf(command)

  for (const c of contexts) {
    for (const { id, match, why } of DESTRUCTIVE) {
      if (match(c)) block(id, why, '정말 필요하면 외부 셸에서 직접 실행하세요.')
    }
  }
  for (const c of contexts) {
    for (const { id, match, why } of MERGE_BLOCK) {
      if (match(c)) block(id, why, MERGE_HINT)
    }
  }
  for (const c of contexts) {
    for (const { id, match, why } of IRREVERSIBLE) {
      if (match(c)) ask(id, why)
    }
  }
  if (appDataWrite(contexts)) ask('앱-데이터-폴더', '앱 데이터 폴더(엔진·engine-config) 경로를 든 명령 (앱이 import하는 코드·설정)')
  if (contexts.some(isPushOrMerge)
    && (contexts.some(movesToMaster) || currentBranch(typeof payload?.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd()) === MASTER)) {
    ask('master-위-push·병합', '현재 브랜치가 master인 push·병합 (master 진입 시도)')
  }

  allow('차단 규칙 미발동')
}

try {
  main()
} catch (err) {
  block('훅-내부오류', `훅 내부 오류(${err?.message ?? 'unknown'})`, '훅을 점검하세요.')
}
