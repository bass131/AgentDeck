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

const DESTRUCTIVE = [
  { re: /\brm\s+(-\w*[rf]\w*\s+)+/, why: 'rm -r / -f (파일 손실)' },
  { re: /\bgit\s+(?:-\S+\s+)*reset\s+.*--hard/, why: 'git reset --hard (작업 손실)' },
  { re: /\bgit\s+(?:-\S+\s+)*clean\s+.*-\w*[dfx]/, why: 'git clean -d/-f/-x (미추적 파일 손실)' },
  {
    re: /\bgit\s+(?:-\S+\s+)*push\b(?=.*(?:--force\b(?!-with-lease)|\s-f(?:\s|$)))/,
    why: 'force push (원격 이력 손실)'
  },
  { re: /\bgit\s+(?:-\S+\s+)*branch\s+.*-D/, why: 'git branch -D (병합 안 된 브랜치 삭제)' },
  { re: /\bgit\s+(?:-\S+\s+)*checkout\s+.*--\s+\S/, why: 'git checkout -- <path> (로컬 편집 폐기)' },
  { re: /\bRemove-Item\b.*-Recurse.*-Force|\bRemove-Item\b.*-Force.*-Recurse/i, why: 'Remove-Item -Recurse -Force (파일 손실)' },
  { re: /\b(?:mkfs|dd)\s+/, why: '디스크 직접 조작' }
]

const IRREVERSIBLE = [
  { re: /\bgit\s+(?:-\S+\s+)*push\b/, why: 'git push (원격 반영)' },
  { re: /\bgh\s+pr\s+(create|merge)\b/, why: 'PR 생성/머지' },
  { re: /\bgh\s+release\b/, why: 'GitHub release 발행' },
  { re: /\bnpm\s+publish\b/, why: 'npm 레지스트리 공개' },
  { re: /\bnpm\s+run\s+package\b/, why: '배포 산출물 빌드' }
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

  const segments = scanSegments(command)

  for (const seg of segments) {
    for (const { re, why } of DESTRUCTIVE) {
      if (re.test(seg)) {
        block(why, '정말 필요하면 외부 셸에서 직접 실행하세요.')
      }
    }
  }

  for (const seg of segments) {
    for (const { re, why } of IRREVERSIBLE) {
      if (re.test(seg)) ask(why)
    }
  }

  process.exit(0)
}

try {
  main()
} catch (err) {
  block(`훅 내부 오류(${err?.message ?? 'unknown'})`, '훅을 점검하세요.')
}
