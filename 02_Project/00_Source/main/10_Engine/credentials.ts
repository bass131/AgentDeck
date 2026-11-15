import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// Claude credentials 파일 읽기의 한 곳 (M05 G11) — engineState(로그인 여부)와 usage(사용량 조회)가 함께 쓴다.
// 파일 원문만 돌려준다. 토큰 추출 규칙은 소비처마다 달라서 각자 둔다.
export function readClaudeCredentials(): string | null {
  try {
    return readFileSync(join(homedir(), '.claude', '.credentials.json'), 'utf8')
  } catch {
    return null
  }
}
