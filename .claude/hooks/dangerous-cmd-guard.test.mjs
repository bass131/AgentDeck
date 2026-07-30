#!/usr/bin/env node
/**
 * dangerous-cmd-guard.test.mjs — 게이트 훅 자체의 테스트.
 *
 * 왜 훅에 테스트가 붙는가: 이 훅은 "항상 발화한다"가 유일한 값이다. 조용히 통과하기 시작하면
 * 아무 신호도 안 나므로(차단이 안 걸린 게 정상인지 고장인지 구분되지 않는다) 발화 여부를
 * 외부에서 재는 수단이 필요하다.
 *
 * 실행: node .claude/hooks/dangerous-cmd-guard.test.mjs
 * 종료코드 0 = 전부 통과. 의존성 0(vitest 불필요 — 훅은 앱 빌드와 독립이어야 한다).
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'dangerous-cmd-guard.mjs')

/** 훅을 한 번 돌리고 {code, stdout, stderr}를 준다. */
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
  'git checkout -- 02_Source/main/index.ts',
  'Remove-Item -Recurse -Force dist',
  'npm test && rm -rf dist' // 체인 뒷 조각도 잡힌다
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
  try { decision = JSON.parse(r.stdout).hookSpecificOutput.permissionDecision } catch { /* 아래에서 실패 처리 */ }
  check(`${cmd} (decision)`, decision, 'ask')
}

console.log('축① 우선 — force push는 물어보지 않고 차단한다')
check('git push --force (ask 아님)', run(bash('git push --force')).stdout, '')

// --force-with-lease는 축①(파괴)이 아니라 축②(비가역 공개)로 내려간다 — 원격이 움직였으면
// 거부하므로 이력을 잃지 않지만, 성공하면 공개는 되돌릴 수 없다.
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
  'git commit -m "a && rm -rf /"', // 따옴표 안 문자열은 실행되지 않는다 → 오발화 금지
  "git commit -m 'reset --hard 얘기'"
]) {
  const r = run(bash(cmd))
  check(`${cmd} (code)`, r.code, 0)
  check(`${cmd} (무출력)`, r.stdout, '')
}

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
