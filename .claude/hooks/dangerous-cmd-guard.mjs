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

function splitSegments(text) {
  const segments = []
  let cur = ''
  let quote = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) { cur += ch; if (ch === quote) quote = null; continue }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue }
    if (ch === ';' || ch === '\n' || ch === '|' || ch === '&') { segments.push(cur); cur = ''; continue }
    cur += ch
  }
  segments.push(cur)
  return segments.map((s) => s.trim()).filter(Boolean)
}

const tokenize = (segment) => segment.split(/\s+/).filter(Boolean).map((t) => t.replace(/["']/g, ''))

// ── ④ 명령 위치 판정 ─────────────────────────────────────────────────────────
// 명령 위치는 세그먼트의 머리 토큰이다. 여기에 둘을 더한다 —
//   래퍼(`sudo rm -rf`·`xargs rm -rf`)는 다음 토큰으로 명령 위치를 넘긴다 (머리에서 이어질 때만).
//   `find`의 `-exec`류는 다음 토큰이 명령이다 — 머리가 find일 때만 인정해 인용문 오탐을 막는다.
const WRAPPERS = new Set(['sudo', 'doas', 'env', 'nohup', 'time', 'nice', 'ionice', 'xargs', 'command', 'busybox'])
const FIND_EXEC = new Set(['-exec', '-execdir', '-ok', '-okdir'])

function commandsOf(tokens) {
  if (!tokens.length) return []
  const pos = new Set([0])
  for (let i = 0; i < tokens.length - 1 && pos.has(i) && WRAPPERS.has(low(tokens[i])); i++) pos.add(i + 1)
  if (low(tokens[0]) === 'find') {
    for (let j = 1; j < tokens.length - 1; j++) if (FIND_EXEC.has(low(tokens[j]))) pos.add(j + 1)
  }
  return [...pos].sort((a, b) => a - b)
    .filter((p) => p < tokens.length)
    .map((p) => ({ name: low(tokens[p]), args: tokens.slice(p + 1) }))
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

  const contexts = splitSegments(stripExemptHeredocBodies(command)).flatMap((seg) => {
    const tokens = tokenize(seg)
    return commandsOf(tokens).map((c) => ({ ...c, git: isGit(c.name) ? gitSub(c.args) : null }))
  })

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
