const { execSync } = require('node:child_process')

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' })
}

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
