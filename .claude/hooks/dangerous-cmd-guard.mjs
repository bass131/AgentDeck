#!/usr/bin/env node
/**
 * dangerous-cmd-guard.mjs — PreToolUse(Bash) 게이트. 2축 판정.
 *
 *   ① 파괴  — 되돌릴 수 없는 *손실*(rm -rf, reset --hard, clean -fd, force push …) → exit 2로 차단.
 *   ② 비가역 — 되돌릴 수 없는 *공개*(push, PR 생성/머지, release, publish, package) → 사람 승인
 *              다이얼로그 강제. 사용자가 거부하면 실행되지 않는다.
 *
 * 왜 이 훅이 남았는가(모델이 좋아져도 값이 안 떨어지는 종류):
 *   훅의 값은 "모델이 잊지 않게 돕는다"가 아니라 "항상 발화한다"다. 능력 보정 지시는 모델이
 *   좋아지면 필요가 줄지만, 파괴/공개 게이트의 필요는 줄지 않는다 — 판단이 아무리 좋아도 실수는
 *   0이 되지 않고, 이 두 축은 실수 1회의 비용이 복구 불가다.
 *
 * 왜 permissions.ask만으로 부족한가:
 *   세션 권한 모드(bypass 등)가 권한 계층을 건너뛰면 `ask` 층이 통째로 죽는다. PreToolUse 훅은
 *   그 모드에서도 발화하므로, 비가역 축은 훅 층에 두어야 실제로 물어진다.
 *
 * 판정 실패 시 처분: **차단**(fail-closed). 판정할 수 없는 상태에서 통과시키면 게이트가 없는
 *   것과 같다. 축①/축② 중복 명령(force push)은 축①이 먼저 평가된다 — 순서가 뒤집히면 파괴
 *   명령이 "승인하면 실행"으로 강등된다.
 *
 * 자족성: 외부 lib 없음. 이 파일 하나로 payload 파싱·토큰화·판정·처분을 다 한다.
 */

import { readFileSync } from 'node:fs'

/** stdin 전체를 동기로 읽는다(훅은 짧게 살고 죽는 프로세스라 스트림 조립이 불필요). */
function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

/** exit 2 + stderr — stderr가 모델에게 돌아가는 피드백 채널이다. */
function block(reason, hint) {
  process.stderr.write(`dangerous-cmd-guard 차단: ${reason}\n`)
  if (hint) process.stderr.write(`   ${hint}\n`)
  process.exit(2)
}

/**
 * exit 0 + permissionDecision:'ask' — 권한 계층과 독립적으로 승인 다이얼로그를 띄운다.
 * 승인은 파일 flag가 아니라 사람의 실시간 응답이므로 에이전트가 위조할 표면이 없다.
 */
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

/**
 * 셸 명령을 판정 가능한 조각으로 나누면서, 각 조각의 **따옴표 내용을 비운다**.
 *
 * 두 가지를 동시에 해야 하는 이유:
 *  - 구분자 분할: `npm test && rm -rf dist` 는 두 명령이다. 나누지 않으면 뒷 조각을 놓친다.
 *  - 따옴표 내용 비우기: `git commit -m "a && rm -rf /"` 의 `&&`와 `rm -rf`는 커밋 메시지의
 *    일부일 뿐 실행되지 않는다. 비우지 않으면 정상 커밋이 차단된다(오발화).
 *  - 비워도 `rm -rf "$dir"` 는 `rm -rf ""` 로 남아 여전히 잡힌다 — 잡아야 하는 토큰은
 *    따옴표 **밖**에 있기 때문이다.
 *
 * 한계(정직하게): `bash -c "rm -rf /"` 나 `eval`·base64 같은 간접 실행은 이 게이트가 못 잡는다.
 * 문자열 패턴 매칭으로 커버할 수 있는 종류가 아니다 — 여기서 막는 건 "직접 쓴 파괴 명령"이고,
 * 간접 실행은 남은 위험으로 인지하고 둔다(막는 척하는 것보다 낫다).
 */
function scanSegments(command) {
  const segments = []
  let cur = ''
  let quote = null
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (quote) {
      if (ch === quote) { quote = null; cur += ch } // 내용은 버리고 닫는 따옴표만 남긴다
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

/** 축① 파괴 — 정규식은 segment 하나에 대해 평가한다(체인 우회 차단). */
const DESTRUCTIVE = [
  { re: /\brm\s+(-\w*[rf]\w*\s+)+/, why: 'rm -r / -f (파일 손실)' },
  { re: /\bgit\s+(?:-\S+\s+)*reset\s+.*--hard/, why: 'git reset --hard (작업 손실)' },
  { re: /\bgit\s+(?:-\S+\s+)*clean\s+.*-\w*[dfx]/, why: 'git clean -d/-f/-x (미추적 파일 손실)' },
  // 플래그가 `push` 뒤 어디에 오든 잡으려면 소비가 아니라 lookahead로 봐야 한다.
  // `push\s+.*(\s-f)` 형태는 `\s+`가 공백을 이미 먹어버려 `git push -f`를 놓친다(실측 후 수정).
  // `--force-with-lease`는 원격이 움직였으면 거부하므로 파괴 축이 아니다 — 축②(push)가 받는다.
  {
    re: /\bgit\s+(?:-\S+\s+)*push\b(?=.*(?:--force\b(?!-with-lease)|\s-f(?:\s|$)))/,
    why: 'force push (원격 이력 손실)'
  },
  { re: /\bgit\s+(?:-\S+\s+)*branch\s+.*-D/, why: 'git branch -D (병합 안 된 브랜치 삭제)' },
  { re: /\bgit\s+(?:-\S+\s+)*checkout\s+.*--\s+\S/, why: 'git checkout -- <path> (로컬 편집 폐기)' },
  { re: /\bRemove-Item\b.*-Recurse.*-Force|\bRemove-Item\b.*-Force.*-Recurse/i, why: 'Remove-Item -Recurse -Force (파일 손실)' },
  { re: /\b(?:mkfs|dd)\s+/, why: '디스크 직접 조작' }
]

/** 축② 비가역 — 되돌릴 수 없는 공개/배포. */
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
  if (typeof command !== 'string' || command.trim() === '') process.exit(0) // Bash 아님/빈 명령 → 판정 대상 없음

  const segments = scanSegments(command)

  // 축① 먼저. force push처럼 두 축에 다 걸리는 명령은 더 강한 처분(차단)이 소유해야 한다.
  for (const seg of segments) {
    for (const { re, why } of DESTRUCTIVE) {
      if (re.test(seg)) {
        block(why, '정말 필요하면 외부 셸에서 직접 실행하세요.')
      }
    }
  }

  for (const seg of segments) {
    for (const { re, why } of IRREVERSIBLE) {
      if (re.test(seg)) ask(why) // 여기서 프로세스가 끝난다(첫 비가역 조각으로 물음).
    }
  }

  process.exit(0)
}

try {
  main()
} catch (err) {
  // 훅 자체의 버그도 fail-closed로 처리한다. 보안 게이트의 기본값은 열림이 아니라 닫힘이다.
  block(`훅 내부 오류(${err?.message ?? 'unknown'})`, '훅을 점검하세요.')
}
