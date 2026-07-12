// .claude/hooks/_lib/system-message.mjs — 훅 stdout JSON systemMessage 직렬화 (HR1 P04).
// 근거(공식, 2026-07-12): PreToolUse/PostToolUse stderr(exit 0)는 debug 전용 — 사용자 UI 미표시.
// 사용자 표시 공식 채널 = stdout JSON의 systemMessage 필드(exit 0).
// 주의: stdout에 JSON 단독만 — 호출 훅은 다른 stdout 출력을 섞으면 안 된다.
import { pathToFileURL } from 'node:url'

export function systemMessageJson(message = '') {
  return JSON.stringify({ systemMessage: String(message) })
}

// CLI: stdin 전체를 메시지로 받아 stdout에 JSON 단독 출력
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => { input += chunk })
  process.stdin.on('end', () => { process.stdout.write(systemMessageJson(input)) })
}
