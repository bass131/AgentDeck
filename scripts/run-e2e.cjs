/**
 * run-e2e.cjs — Electron e2e 오케스트레이터.
 *
 * 듀얼 ABI 관리: vitest는 node ABI, Electron 앱은 electron ABI로 better-sqlite3가 필요.
 * 이 스크립트가:
 *   1) build → 2) better-sqlite3 electron ABI rebuild → 3) playwright e2e
 *   → 4) **항상** node ABI로 복구(실패해도) → playwright 종료코드로 exit.
 * 덕분에 `npm run test`(vitest)는 e2e 후에도 그대로 동작한다.
 */
const { execSync } = require('node:child_process')

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' })
}

console.log('[e2e] 1/4 build...')
run('npm run build')

console.log('[e2e] 2/4 better-sqlite3 → Electron ABI...')
run('npm run rebuild:native')

let code = 0
try {
  console.log('[e2e] 3/4 playwright (Electron)...')
  run('npx playwright test')
} catch (e) {
  code = (e && typeof e.status === 'number' ? e.status : 1) || 1
}

console.log('[e2e] 4/4 better-sqlite3 → node ABI 복구...')
try {
  run('npm run rebuild:node')
} catch (e) {
  console.error('[e2e] node ABI 복구 실패 — `npm run rebuild:node` 수동 실행 필요:', e.message)
}

process.exit(code)
