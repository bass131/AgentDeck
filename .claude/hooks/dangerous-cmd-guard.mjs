#!/usr/bin/env node
// 위험 명령 가드 (PreToolUse: Bash) — 트립와이어. 무상태(상태 파일 없음)·CLI 모드 없음.
//
// 판정 파이프라인은 넷이다 (M02 Phase 2 Step 3~6에서 수리).
//   ① heredoc 본문 면제 — 본문이 흘러가는 pipeline 전수 소비자를 보고, 실행되지 않는 소비자뿐일 때만 본문을 판정에서 뺀다.
//   ② 세그먼트 분할 — `&&`·`||`·`;`·`|`·`&`·개행으로 나누되 따옴표 안에서는 나누지 않는다.
//   ③ 토큰화 — 토큰에서 따옴표 문자를 벗긴다. `"rm" -rf`·`git reset "--hard"` 류 인용 우회가 여기서 잡힌다.
//   ④ 명령 위치 판정 — 규칙은 세그먼트의 머리 토큰(과 래퍼 뒤 토큰)에만 적용한다.
//      인용문·커밋 메시지 본문에 든 `rm -rf`·`git push`를 명령으로 읽지 않기 위한 오탐 방어다.
//
// 확정된 한계 (M02 결정 대장 [USER] 2026-08-10 안건 2 — 기각, 방어 담당은 Claude Code 내장 권한 분류기):
//   변수 확장(`c=push; git $c`)·`$()` 명령 치환·`cmd /c` 접두는 두 구현 모두 못 잡는다.
// fail-closed: payload가 없거나 파싱 불가면 통과가 아니라 차단이다 (Moodie 원본과 갈리는 축).
// 로그는 fail-open이다 — 기록에 실패해도 판정을 막지 않는다.

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const GATE_DIR = join(ROOT, '98_Management', '01_GateState')
const LOG_FILE = join(GATE_DIR, 'hook-log.jsonl')

function ts() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0')
  const o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-', a = Math.abs(o)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${s}${p(Math.floor(a / 60))}:${p(a % 60)}`
}

// 판정 로그 (M02 Phase 2 Step 8, Backlog 10) — 필드는 hook·event·session·agent_id·verdict·rule이다.
// 기존 훅과 같은 스키마의 독립 로거이며, 경로는 CLAUDE_PROJECT_DIR 기준이라 격리 미러 안에서 나고 죽는다.
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

// ── ② 세그먼트 분할 · ③ 토큰화 ───────────────────────────────────────────────
const low = (t) => String(t).toLowerCase()

// 백슬래시 이스케이프 — 따옴표 상태를 바꾸는 꼴만 읽는다. 작은따옴표 안에서는 백슬래시가 이스케이프가 아니다.
//   큰따옴표 안: POSIX 셸은 `\"`·`\\`·`\$`·`` \` ``만 이스케이프로 읽는다 (M03 Phase 4 Step 10 · Backlog 17 갈래 ③).
//     이것을 모르면 `sh -c "sh -c \"git push\""`의 `\"`가 바깥 인용을 닫는 것으로 읽혀 안쪽 스크립트가 조각난다.
//   인용부 밖: `\"`·`\'`는 문자 그대로의 따옴표이고 인용을 열지 않는다 (M03 Phase 4 Step 13 · 재검수 FAIL 08:25:11).
//     이것을 모르면 `echo \"hello\" && rm -rf dist`의 `\"`가 연 가짜 인용이 뒤의 구분자와 명령을 숨긴다.
//     `\\`도 짝으로 읽는다 — `echo \\"a" && …`의 `"`는 이스케이프되지 않고 인용을 연다(EQ-08).
//     그 밖의 `\X`는 종전대로 두 글자 그대로다 — 넓히면 `C:\Tools\Git\bin\git.exe` 류 basename 판정(GR-06)이 깨진다.
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

// 따옴표를 아는 토크나이저 — 구분자는 인용부 **밖**의 공백뿐이고, 인용 문자 자체는 값에서 벗긴다.
// 전자는 `bash -c "rm -rf dist"`의 `-c` 인자를 토큰 하나로 보존하려는 것이고 (M03 Phase 2 Step 3),
// 후자는 `"rm" -rf`·`git reset "--hard"` 류 인용 우회를 잡으려는 것이다 (M02 Phase 2).
// 이스케이프(위 주석의 꼴)는 다음 문자 하나를 값으로 남긴다 — 중첩 `sh -c`의 안쪽 따옴표가 산다.
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

// ── ④ 명령 위치 판정 ─────────────────────────────────────────────────────────
// 명령 위치는 세그먼트의 머리 토큰이다. 여기에 셋을 더한다 —
//   래퍼(`sudo rm -rf`·`env FOO=1 rm -rf`)는 다음 토큰으로 명령 위치를 넘긴다. 머리에서 이어질 때만
//     이어지며, 래퍼 뒤의 플래그와 `VAR=값` 할당 토큰은 건너뛴다 (M03 Phase 2 — M02 Backlog 3·10).
//   `find`의 `-exec`류는 다음 토큰이 명령이다 — 머리가 find일 때만 인정해 인용문 오탐을 막는다.
//   셸 실행 파일의 `-c` 인자는 문자열 자체가 명령이라 같은 파이프라인으로 다시 판정한다 (contextsOf).
// 각 토큰의 판정 이름은 둘이다 — `name`은 토큰 원형(소문자), `base`는 경로 접두를 벗긴 basename이다.
// basename 판정은 git 계열과 셸 계열에만 쓴다 (M02 Backlog 2) — 규칙의 다른 이름 판정은 원형 그대로다.
const WRAPPERS = new Set(['sudo', 'doas', 'env', 'nohup', 'time', 'nice', 'ionice', 'xargs', 'command', 'busybox'])
const SHELLS = new Set(['sh', 'bash', 'dash', 'zsh', 'ksh', 'ash', 'sh.exe', 'bash.exe'])
const FIND_EXEC = new Set(['-exec', '-execdir', '-ok', '-okdir'])
const RE_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/   // `FOO=1` 류 환경변수 할당 토큰
const RE_SHELL_C = /^-[A-Za-z]*c$/             // `-c`·`-lc`·`-ec` — 다음 토큰이 셸 스크립트 문자열

function baseName(token) {
  const s = String(token)
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
  return i < 0 ? s : s.slice(i + 1)
}

function commandsOf(tokens) {
  if (!tokens.length) return []
  const pos = new Set([0])
  let i = 0
  while (i < tokens.length - 1 && WRAPPERS.has(low(baseName(tokens[i])))) {
    let j = i + 1
    while (j < tokens.length && (tokens[j].startsWith('-') || RE_ASSIGN.test(tokens[j]))) j++
    if (j >= tokens.length) break
    pos.add(j)
    i = j
  }
  if (low(baseName(tokens[0])) === 'find') {
    for (let j = 1; j < tokens.length - 1; j++) if (FIND_EXEC.has(low(tokens[j]))) pos.add(j + 1)
  }
  return [...pos].sort((a, b) => a - b)
    .filter((p) => p < tokens.length)
    .map((p) => ({ name: low(tokens[p]), base: low(baseName(tokens[p])), args: tokens.slice(p + 1) }))
}

// git 전역 옵션 중 다음 토큰을 값으로 먹는 것들 (`-C <path>`, `-c <k=v>` …).
// `--git-dir=<path>`처럼 등호로 값을 붙이는 형태는 토큰 하나라 별도 처리가 필요 없다.
const GIT_VALUE_OPTS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path'])

// 머리 토큰이 git 계열인가 — `git.exe`·대문자 `Git`도 같은 명령이다 (M02 Backlog 9 신규 표면).
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

const DESTRUCTIVE = [
  { id: 'rm-재귀·강제', why: 'rm -r / -f (파일 손실)', match: (c) => c.name === 'rm' && c.args.some((t) => RE_RECURSE.test(t) || RE_RM_FORCE.test(t)) },
  { id: 'git-reset-hard', why: 'git reset --hard (작업 손실)', match: (c) => c.git?.[0] === 'reset' && c.git.includes('--hard') },
  { id: 'git-clean-f', why: 'git clean -d/-f/-x (미추적 파일 손실)', match: (c) => c.git?.[0] === 'clean' && c.git.slice(1).some(isCleanFlag) },
  { id: 'force-push', why: 'force push (원격 이력 손실)', match: (c) => c.git?.[0] === 'push' && c.git.slice(1).some(isForce) },
  {
    id: 'git-branch-강제삭제',
    why: 'git branch -D / --delete --force (병합 안 된 브랜치 삭제)',
    match: (c) => c.git?.[0] === 'branch' && (c.git.slice(1).some(isBranchD)
      || (c.git.slice(1).some(isBranchDelete) && c.git.slice(1).some(isForce))),
  },
  {
    id: 'git-checkout-경로복원',
    why: 'git checkout -- <path> / . (로컬 편집 폐기)',
    match: (c) => c.git?.[0] === 'checkout' && (c.git.includes('--') || c.git.includes('.')),
  },
  { id: 'git-restore', why: 'git restore (로컬 편집 폐기)', match: (c) => c.git?.[0] === 'restore' },
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

const IRREVERSIBLE = [
  { id: 'git-push', why: 'git push (원격 반영)', match: (c) => c.git?.[0] === 'push' },
  { id: 'gh-pr', why: 'PR 생성/머지', match: (c) => c.name === 'gh' && c.args[0] === 'pr' && (c.args[1] === 'create' || c.args[1] === 'merge') },
  { id: 'gh-release', why: 'GitHub release 발행', match: (c) => c.name === 'gh' && c.args[0] === 'release' },
  { id: 'npm-publish', why: 'npm 레지스트리 공개', match: (c) => c.name === 'npm' && c.args.includes('publish') },
  { id: 'npm-package', why: '배포 산출물 빌드', match: (c) => c.name === 'npm' && c.args[0] === 'run' && c.args[1] === 'package' },
]

// ── ① heredoc 본문 면제 — pipeline 하류 전수 소비자 판별 ──────────────────────
// 계약: heredoc이 붙은 줄의 pipeline 전체를 소비자 집합으로 본다. 면제는 「실행되지도, 파일로 남지도
// 않는 소비자」뿐이다 — `git commit -F -`, operand 없는 `cat`, operand 없는 `tee` 셋이다.
// 파일 sink(리다이렉트·`tee FILE`·`dd of=`·`sponge`)는 데이터 소비자가 아니라 판별 불가로 본다 —
// 본문이 파일로 남으면 뒤이은 `bash run.sh`에는 위험 원문이 없어 가드가 잡을 자리가 사라진다.
// fail-closed: 판별 불가 소비자가 하나라도 있으면 본문 스캔을 유지한다.
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
    if (word) { out.push({ delim: word, dash }); i = j - 1 }
  }
  return out
}

const stripHeredocMarkers = (stage) => stage.replace(/<<-?\s*(?:'[^']*'|"[^"]*"|[A-Za-z0-9_.-]+)/g, ' ')

function hasOutputRedirect(stage) {
  let quote = null
  for (const ch of stage) {
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

function stripExemptHeredocBodies(command) {
  const lines = command.split('\n')
  const kept = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i++]
    kept.push(line)
    const delims = heredocDelims(line)
    if (!delims.length) continue
    const exempt = allConsumersExempt(line)
    for (const d of delims) {
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

// ── 판정 문맥 수집 — 셸 `-c` 인자를 같은 파이프라인으로 재귀 판정한다 ────────
// `bash -c "rm -rf dist"`·`sh -c "git push origin main"`은 Moodie 원본이 잡던 표면인데 현행 가드가
// 통과시켰다 (M02 Backlog 10의 회귀 2표면 중 하나와 동반 관측된 push 표면). 수리는 셸이 **명령 위치**에
// 섰을 때만 `-c` 인자 문자열을 다시 판정하는 것이다 — 인용문·커밋 메시지에 든 `bash -c "…"` 서술은
// 명령 위치가 아니라 재귀하지 않고, 오탐 방어가 유지된다 (OK-07·08·09 양방향 고정).
// 깊이 상한은 셸 안의 셸을 몇 겹까지 따라갈지다 — 무한 중첩 입력에서 스택을 보호한다 (fail-safe).
const SHELL_DEPTH_LIMIT = 3

// 셸 실행 파일 인자에서 스크립트 문자열을 찾는다 (M03 Phase 4 Step 10 · Backlog 17 갈래 ①②).
// `sh [옵션…] -c [옵션…] [--] 스크립트`의 옵션 구간을 읽는다 — 구간은 첫 operand나 `--`·`-`에서 끝난다.
//   ① `c`가 짧은 옵션 묶음의 어디에 있어도 -c 모드다 (`-ce`·`-cx`·`-lc`). `+` 묶음은 옵션 해제라 세지 않는다.
//   ② -c 모드의 스크립트는 옵션 구간 뒤의 첫 operand다 (`bash -c -x "…"`·`bash -c -- "…"`).
//   `-o`·`-O` 묶음과 `--rcfile`·`--init-file`은 다음 토큰을 값으로 먹는다 (`bash -o pipefail -c "…"`).
// 종전 판독(`-c` 꼴 토큰 바로 뒤의 토큰)은 합집합으로 남긴다 — 수리가 기존 재판정 표면을 줄이지 않게 한다.
// -c 모드가 아닌 operand(`bash -x run.sh`)는 파일 이름이라 다시 판정하지 않는다.
const SHELL_VALUE_LONG = new Set(['--rcfile', '--init-file'])
const RE_SHELL_BUNDLE = /^[-+][A-Za-z]+$/

function shellScriptsOf(args) {
  const at = new Set()
  let cMode = false
  let i = 0
  while (i < args.length) {
    const t = args[i]
    if (t === '--' || t === '-') { i++; break }
    if (t.startsWith('--')) { i += SHELL_VALUE_LONG.has(t) ? 2 : 1; continue }
    if (!RE_SHELL_BUNDLE.test(t)) break
    if (t[0] === '-' && t.includes('c')) cMode = true
    i += /[oO]/.test(t) ? 2 : 1
  }
  if (cMode && i < args.length) at.add(i)
  const k = args.findIndex((t) => RE_SHELL_C.test(t))
  if (k >= 0 && k + 1 < args.length) at.add(k + 1)
  return [...at].map((j) => args[j])
}

function contextsOf(command, depth = 0) {
  const out = []
  for (const seg of splitSegments(stripExemptHeredocBodies(command))) {
    for (const c of commandsOf(tokenize(seg))) {
      out.push({ ...c, git: isGit(c.base) ? gitSub(c.args) : null })
      if (depth >= SHELL_DEPTH_LIMIT || !SHELLS.has(c.base)) continue
      for (const script of shellScriptsOf(c.args)) {
        if (typeof script === 'string' && script.trim()) out.push(...contextsOf(script, depth + 1))
      }
    }
  }
  return out
}

// ── 본체 ─────────────────────────────────────────────────────────────────────
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
    for (const { id, match, why } of IRREVERSIBLE) {
      if (match(c)) ask(id, why)
    }
  }

  allow('차단 규칙 미발동')
}

try {
  main()
} catch (err) {
  block('훅-내부오류', `훅 내부 오류(${err?.message ?? 'unknown'})`, '훅을 점검하세요.')
}
