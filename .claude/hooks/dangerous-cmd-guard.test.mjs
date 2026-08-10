#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'dangerous-cmd-guard.mjs')

function run(payload) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8'
  })
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } })

let failed = 0
function check(label, actual, expected) {
  const ok = actual === expected
  if (!ok) { failed++; console.error(`  FAIL ${label}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`) }
  else console.log(`  ok   ${label}`)
}

console.log('축① 파괴 → exit 2')
for (const cmd of [
  'rm -rf dist',
  'rm -fr node_modules',
  'git reset --hard origin/main',
  'git clean -fd',
  'git push --force origin main',
  'git push -f origin main',
  'git branch -D feature',
  'git checkout -- 02_Project/00_Source/main/index.ts',
  'Remove-Item -Recurse -Force dist',
  'npm test && rm -rf dist'
]) check(cmd, run(bash(cmd)).code, 2)

console.log('축② 비가역 → exit 0 + ask JSON')
for (const cmd of [
  'git push origin main',
  'gh pr create --fill',
  'gh pr merge 12',
  'gh release create v1',
  'npm publish',
  'npm run package'
]) {
  const r = run(bash(cmd))
  check(`${cmd} (code)`, r.code, 0)
  let decision = null
  try { decision = JSON.parse(r.stdout).hookSpecificOutput.permissionDecision } catch { }
  check(`${cmd} (decision)`, decision, 'ask')
}

console.log('축① 우선 — force push는 물어보지 않고 차단한다')
check('git push --force (ask 아님)', run(bash('git push --force')).stdout, '')

console.log('--force-with-lease → 차단 아님, 축② ask')
{
  const r = run(bash('git push --force-with-lease origin main'))
  check('code', r.code, 0)
  check('decision', JSON.parse(r.stdout || '{}')?.hookSpecificOutput?.permissionDecision, 'ask')
}

console.log('통과해야 하는 명령 → exit 0 + 무출력')
for (const cmd of [
  'npm test',
  'npm run typecheck:node',
  'git status',
  'git commit -m "a && rm -rf /"',
  "git commit -m 'reset --hard 얘기'"
]) {
  const r = run(bash(cmd))
  check(`${cmd} (code)`, r.code, 0)
  check(`${cmd} (무출력)`, r.stdout, '')
}

console.log('Moodie 대조 결손 다섯 건 → exit 2')
// 근거: Moodie 32_cmd-guard.cjs matchSegment()
//   결손① git-restore            (L50)
//   결손② del-s                  (L53)
//   결손③ rmdir-s                (L54)
//   결손④ remove-item-recurse    (L55, -Force 없이 -Recurse 단독도 차단)
//   결손⑤ git-config-global      (L63)
for (const cmd of [
  'git restore 02_Project/00_Source/main/index.ts',
  'git restore --staged .',
  'del /s /q dist',
  'rmdir /s /q dist',
  'Remove-Item -Recurse dist',
  'git config --global user.name "someone"'
]) check(cmd, run(bash(cmd)).code, 2)

console.log('머리 토큰 판정 — 명령 위치가 아닌 곳의 git 단어는 오탐하지 않는다')
for (const cmd of [
  // 커밋 메시지 본문에 "git push"가 든 heredoc 커밋 — 개행 세그먼트가 명령으로 오인되면 안 된다
  "git commit -F - <<'EOF'\nfix: git push 재시도 로직 보강\nEOF",
  'echo git push',
  'echo git reset --hard',
  'grep -r git push 02_Project'
]) {
  const r = run(bash(cmd))
  check(`${cmd.replace(/\n/g, '\\n')} (code)`, r.code, 0)
  check(`${cmd.replace(/\n/g, '\\n')} (무출력)`, r.stdout, '')
}

console.log('머리 토큰 판정 — git 전역 옵션이 앞에 붙어도 하위 명령을 놓치지 않는다')
check('git -C repo reset --hard', run(bash('git -C repo reset --hard')).code, 2)
check('git --git-dir=.git restore .', run(bash('git --git-dir=.git restore .')).code, 2)

console.log('fail-closed — 판정 불가는 통과가 아니라 차단')
check('빈 stdin', run('').code, 2)
check('깨진 JSON', run('{not json').code, 2)

console.log('판정 대상 없음 → 조용히 통과')
check('command 없는 payload', run({ tool_name: 'Read', tool_input: { file_path: 'a.ts' } }).code, 0)

if (failed > 0) {
  console.error(`\n${failed}건 실패`)
  process.exit(1)
}
console.log('\n전부 통과')
