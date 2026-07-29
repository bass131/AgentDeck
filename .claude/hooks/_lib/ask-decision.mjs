// .claude/hooks/_lib/ask-decision.mjs — PreToolUse permissionDecision:"ask" JSON 직렬화 (CORE-06 v3).
// 근거: HR1 P04 실측(2026-07-12) — exit 0 + hookSpecificOutput.permissionDecision 경로가
// PreToolUse에서 유효(당시 "deny"로 프로브, 채택 보류). v3(2026-07-29)가 그 경로를 "ask"로
// 채택 — 훅이 권한 계층과 독립적으로 사람 승인 다이얼로그를 강제한다.
// 주의: stdout에 JSON 단독만 — 호출 훅은 다른 stdout 출력을 섞으면 안 된다(system-message.mjs와 동일 계약).
import { pathToFileURL } from 'node:url'

export function askDecisionJson(reason = '') {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: String(reason),
    },
  })
}

// CLI: stdin 전체를 사유로 받아 stdout에 JSON 단독 출력
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => { input += chunk })
  process.stdin.on('end', () => { process.stdout.write(askDecisionJson(input)) })
}
