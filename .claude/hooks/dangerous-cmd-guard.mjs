#!/usr/bin/env node

import { readFileSync } from 'node:fs'

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

function block(reason, hint) {
  process.stderr.write(`dangerous-cmd-guard 차단: ${reason}\n`)
  if (hint) process.stderr.write(`   ${hint}\n`)
  process.exit(2)
}

function ask(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: `비가역 작업 — ${reason}. 승인하면 실행되고, 거부하면 실행되지 않습니다.`
    }
  }))
  process.exit(0)
}

function scanSegments(command) {
  const segments = []
  let cur = ''
  let quote = null
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (quote) {
      if (ch === quote) { quote = null; cur += ch }
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue }
    if (ch === ';' || ch === '\n' || ch === '|' || ch === '&') {
      segments.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  segments.push(cur)
  return segments.map((s) => s.trim()).filter(Boolean)
}

function tokenize(segment) {
  return segment.split(/\s+/).filter(Boolean).map((t) => t.replace(/["']/g, ''))
}

// git 전역 옵션 중 다음 토큰을 값으로 먹는 것들 (`-C <path>`, `-c <k=v>` …).
// `--git-dir=<path>`처럼 등호로 값을 붙이는 형태는 토큰 하나라 별도 처리가 필요 없다.
const GIT_VALUE_OPTS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path'])

// 세그먼트의 머리 토큰이 git일 때만 하위 명령 토큰열을 돌려준다.
// 머리 판정이라 커밋 메시지·인용문·다른 명령의 인자에 섞인 'git push'는 명령으로 보지 않는다.
function gitSubcommand(tokens) {
  if (tokens[0] !== 'git') return null
  let i = 1
  while (i < tokens.length && tokens[i].startsWith('-')) {
    if (GIT_VALUE_OPTS.has(tokens[i])) i++
    i++
  }
  return tokens.slice(i)
}

const isForce = (t) => t === '--force' || (!t.startsWith('--') && /^-[A-Za-z]*f/.test(t))
const isCleanFlag = (t) => t === '--force' || (!t.startsWith('--') && /^-[A-Za-z]*[dfx]/.test(t))
const isBranchD = (t) => !t.startsWith('--') && /^-[A-Za-z]*D/.test(t)

const has = (tokens, name) => tokens.some((t) => t.toLowerCase() === name)

const DESTRUCTIVE = [
  { why: 'rm -r / -f (파일 손실)', match: (c) => /\brm\s+(-\w*[rf]\w*\s+)+/.test(c.seg) },
  { why: 'git reset --hard (작업 손실)', match: (c) => c.git?.[0] === 'reset' && c.git.includes('--hard') },
  { why: 'git clean -d/-f/-x (미추적 파일 손실)', match: (c) => c.git?.[0] === 'clean' && c.git.slice(1).some(isCleanFlag) },
  { why: 'force push (원격 이력 손실)', match: (c) => c.git?.[0] === 'push' && c.git.slice(1).some(isForce) },
  { why: 'git branch -D (병합 안 된 브랜치 삭제)', match: (c) => c.git?.[0] === 'branch' && c.git.slice(1).some(isBranchD) },
  {
    why: 'git checkout -- <path> (로컬 편집 폐기)',
    match: (c) => c.git?.[0] === 'checkout' && c.git.indexOf('--') > 0 && c.git.length > c.git.indexOf('--') + 1
  },
  { why: 'git restore (로컬 편집 폐기)', match: (c) => c.git?.[0] === 'restore' },
  { why: 'git config --global (사용자 전역 설정 영속 변경)', match: (c) => c.git?.[0] === 'config' && c.git.includes('--global') },
  {
    why: 'Remove-Item -Recurse (파일 손실)',
    match: (c) => has(c.tokens, 'remove-item') && c.tokens.some((t) => t.toLowerCase().startsWith('-recurse'))
  },
  { why: 'del /s (하위 폴더까지 삭제)', match: (c) => has(c.tokens, 'del') && has(c.tokens, '/s') },
  { why: 'rmdir /s (하위 폴더까지 삭제)', match: (c) => has(c.tokens, 'rmdir') && has(c.tokens, '/s') },
  { why: '디스크 직접 조작', match: (c) => /\b(?:mkfs|dd)\s+/.test(c.seg) }
]

const IRREVERSIBLE = [
  { why: 'git push (원격 반영)', match: (c) => c.git?.[0] === 'push' },
  { why: 'PR 생성/머지', match: (c) => /\bgh\s+pr\s+(create|merge)\b/.test(c.seg) },
  { why: 'GitHub release 발행', match: (c) => /\bgh\s+release\b/.test(c.seg) },
  { why: 'npm 레지스트리 공개', match: (c) => /\bnpm\s+publish\b/.test(c.seg) },
  { why: '배포 산출물 빌드', match: (c) => /\bnpm\s+run\s+package\b/.test(c.seg) }
]

function main() {
  const raw = readStdin()
  if (!raw.trim()) block('훅 payload 없음', '판정할 수 없는 상태에서 통과시키면 게이트가 없는 것과 같습니다.')

  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    block('훅 payload 파싱 실패', '판정 불가 → fail-closed.')
  }

  const command = payload?.tool_input?.command
  if (typeof command !== 'string' || command.trim() === '') process.exit(0)

  const contexts = scanSegments(command).map((seg) => {
    const tokens = tokenize(seg)
    return { seg, tokens, git: gitSubcommand(tokens) }
  })

  for (const c of contexts) {
    for (const { match, why } of DESTRUCTIVE) {
      if (match(c)) {
        block(why, '정말 필요하면 외부 셸에서 직접 실행하세요.')
      }
    }
  }

  for (const c of contexts) {
    for (const { match, why } of IRREVERSIBLE) {
      if (match(c)) ask(why)
    }
  }

  process.exit(0)
}

try {
  main()
} catch (err) {
  block(`훅 내부 오류(${err?.message ?? 'unknown'})`, '훅을 점검하세요.')
}
