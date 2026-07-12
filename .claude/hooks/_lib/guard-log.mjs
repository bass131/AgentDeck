// .claude/hooks/_lib/guard-log.mjs — guard-blocks.log 원장 append (HR1 P04).
// 형식: `ISO시각 | 훅명 | notify/block | 요지` — 구조화 allowlist 필드만.
// 호출측(훅)은 짧은 요지만 넘긴다(원시 payload·명령 인자 전체 금지) + 본 모듈이
// redaction·개행 제거·길이 상한으로 이중 방어한다.
// 동시성: 라인 단위 appendFileSync(O_APPEND) — 프로세스 병행 append에 안전.
// 로테이션: 상한 초과 시 rename(log → log.1) — 경쟁 시 rename은 한쪽만 성공, 패배측 무시.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const MAX_LOG_BYTES = 512 * 1024
export const MAX_DETAIL_CHARS = 300

const SECRET_PATTERNS = [
  /(?:api[-_]?key|token|secret|password|passwd|bearer|authorization|credential)[\s=:]+\S+/gi,
  /\b(?:sk|pk|ghp|gho|ghu|xox[bap])[-_][A-Za-z0-9_-]{8,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_.-]+)?\b/g,
]

export function redact(text = '') {
  let out = String(text)
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, '[redacted]')
  return out
}

export function formatLine({ hook, action, detail = '', at = new Date() }) {
  const clean = redact(detail).replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_DETAIL_CHARS)
  const normalized = action === 'block' ? 'block' : 'notify'
  return `${at.toISOString()} | ${hook} | ${normalized} | ${clean}\n`
}

const STALE_LOCK_MS = 10_000

// 로테이션 배타 처리 (Sol 리뷰 [P2] 2026-07-12): 락 없는 rename 경쟁은 승자가 방금 아카이브한
// 512KB 원장을 패자가 신생(1줄) 파일로 덮어써 유실시킬 수 있다. mkdir 원자성으로 락을 잡고,
// 락 *안에서* 크기를 재확인해 "작은 파일 회전"을 구조적으로 차단한다. 락 획득 실패 = 회전 생략
// (append는 계속 — 다음 append가 회전). 크래시 잔재 락은 STALE_LOCK_MS 경과 시 정리.
function rotateIfOversized(logFile) {
  const lockDir = `${logFile}.rotate-lock`
  try {
    fs.mkdirSync(lockDir)
  } catch {
    try {
      if (Date.now() - fs.statSync(lockDir).mtimeMs > STALE_LOCK_MS) fs.rmdirSync(lockDir)
    } catch { /* 락이 그 사이 사라짐 — 정상 */ }
    return
  }
  try {
    if (fs.statSync(logFile).size >= MAX_LOG_BYTES) fs.renameSync(logFile, `${logFile}.1`)
  } catch { /* 로그 파일 아직 없음 — 회전 불필요 */ }
  finally {
    try { fs.rmdirSync(lockDir) } catch { /* 이미 제거됨 */ }
  }
}

export function appendGuardEvent({ hook, action, detail, logFile }) {
  const line = formatLine({ hook, action, detail })
  fs.mkdirSync(path.dirname(logFile), { recursive: true })
  rotateIfOversized(logFile)
  fs.appendFileSync(logFile, line)
}

// CLI: node guard-log.mjs <hook> <notify|block> <detail>
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [hook, action, detail = ''] = process.argv.slice(2)
  if (hook && action) {
    const proj = process.env.CLAUDE_PROJECT_DIR || process.cwd()
    appendGuardEvent({ hook, action, detail, logFile: path.join(proj, '.claude', 'state', 'guard-blocks.log') })
  }
}
