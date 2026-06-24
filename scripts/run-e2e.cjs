/**
 * run-e2e.cjs — Electron e2e 오케스트레이터.
 *
 * JSON fan-out 영속(M1) 이후 네이티브 모듈 없음 → ABI 댄스 제거.
 *   1) build → 2) playwright e2e
 */
const { execSync } = require('node:child_process')

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' })
}

// 선택 인자(특정 e2e 파일 경로 등)를 playwright로 전달.
// 예: node scripts/run-e2e.cjs tests/e2e/visual-viewer.e2e.ts
const passthru = process.argv.slice(2).join(' ')

console.log('[e2e] 1/2 build...')
run('npm run build')

let code = 0
try {
  console.log('[e2e] 2/2 playwright (Electron)...' + (passthru ? ' [' + passthru + ']' : ''))
  run('npx playwright test' + (passthru ? ' ' + passthru : ''))
} catch (e) {
  code = (e && typeof e.status === 'number' ? e.status : 1) || 1
}

process.exit(code)
