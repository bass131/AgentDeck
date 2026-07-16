// .claude/hooks/_lib/hook-exit.test.mjs — .sh 글루 exit code 회귀 테스트 (BL1 P06).
// 배경: 훅 차단(exit 2)/통과(exit 0) 경로가 라이브 프로브로만 커버되던 공백(HR1 P06 reviewer minor 3)
// + shell-policy.mjs 크래시 시 fail-open이던 경로의 fail-closed 회귀 방어 (minor 2)
// + emit_system_message 실패가 set -e로 원장 기록을 죽이던 경로 (minor 1).
// GAP1 유지보수 창(2026-07-13): 봉인 판정이 앵커 기반(classifyHarnessPath)으로 바뀌어
// 봉인 케이스는 CLAUDE_PROJECT_DIR(샌드박스 루트) 하위 경로를 쓴다. 다른 저장소 통과·
// 홈 plans 허용·홈 config 봉인·`..` 재진입 봉인 회귀 4건 추가.
// 방식: 훅+_lib을 os.tmpdir 소유 샌드박스로 복사해 실행(실 하네스 무접촉 — H1 doctor 샌드박스 관례),
//       크래시 주입은 샌드박스 사본의 _lib 파일을 구문 오류로 덮어써 재현.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOKS_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function makeSandbox() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agentdeck-hook-exit-'))
  const hooks = path.join(root, '.claude', 'hooks')
  mkdirSync(path.join(root, '.claude', 'state'), { recursive: true })
  cpSync(HOOKS_DIR, hooks, {
    recursive: true,
    filter: (src) => !/node_modules/.test(src),
  })
  return { root, hooks }
}

function runHook(sandbox, hook, payload, env = {}) {
  const result = spawnSync('bash', [path.join(sandbox.hooks, hook)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: sandbox.root, ...env },
  })
  return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

const bashPayload = (command, extra = {}) => ({
  tool_name: 'Bash', hook_event_name: 'PreToolUse', tool_input: { command }, ...extra,
})
const editPayload = (filePath, extra = {}) => ({
  tool_name: 'Edit', hook_event_name: 'PreToolUse', tool_input: { file_path: filePath }, ...extra,
})

function breakLib(sandbox, libFile) {
  writeFileSync(path.join(sandbox.hooks, '_lib', libFile), 'syntax error this is not js (\n')
}

let sandbox
before(() => { sandbox = makeSandbox() })
after(() => { rmSync(sandbox.root, { recursive: true, force: true }) })

// ── 정상 경로: 차단(exit 2) / 통과(exit 0) ───────────────────────────────────

test('dangerous-cmd-guard: git reset --hard → exit 2 차단', () => {
  const r = runHook(sandbox, 'dangerous-cmd-guard.sh', bashPayload('git reset --hard HEAD'))
  assert.equal(r.code, 2)
  assert.match(r.stderr, /차단/)
})

test('dangerous-cmd-guard: git status → exit 0 통과', () => {
  const r = runHook(sandbox, 'dangerous-cmd-guard.sh', bashPayload('git status'))
  assert.equal(r.code, 0)
})

test('supervisor-guard: 하네스 Edit(메인) → exit 2 봉인 차단', () => {
  const r = runHook(sandbox, 'supervisor-guard.sh',
    editPayload(path.join(sandbox.root, '.claude', 'hooks', 'x.sh')))
  assert.equal(r.code, 2)
  assert.match(r.stderr, /봉인/)
})

test('supervisor-guard: 하네스 Edit(서브에이전트도) → exit 2 (agent_type 무관 봉인)', () => {
  const r = runHook(sandbox, 'supervisor-guard.sh',
    editPayload(path.join(sandbox.root, '.claude', 'settings.json'), { agent_type: 'renderer' }))
  assert.equal(r.code, 2)
})

test('supervisor-guard: 다른 저장소 .claude Edit → exit 0 (앵커 밖 — 부분일치 폐기)', () => {
  const r = runHook(sandbox, 'supervisor-guard.sh', editPayload('C:\\proj\\.claude\\hooks\\x.sh'))
  assert.equal(r.code, 0, `다른 저장소 하네스는 이 훅 보호 범위 밖이어야 함 (실측 exit ${r.code})`)
})

test('supervisor-guard: `..` 재진입 표기 Edit → exit 2 (2026-07-13 우회 실증 봉합)', () => {
  const rootBase = path.basename(sandbox.root)
  const reentry = path.join(sandbox.root, '.claude', 'hooks', '..', '..', '..', rootBase, '.claude', 'settings.json')
  const r = runHook(sandbox, 'supervisor-guard.sh', editPayload(reentry))
  assert.equal(r.code, 2, `탈출 후 재진입 표기가 봉인을 우회하면 안 됨 (실측 exit ${r.code})`)
})

test('supervisor-guard: 홈 ~/.claude/plans Edit → exit 0 (plan 모드 저장 허용)', () => {
  const r = runHook(sandbox, 'supervisor-guard.sh',
    editPayload(path.join(os.homedir(), '.claude', 'plans', 'gap1-probe.md')))
  assert.equal(r.code, 0, `plan 모드 초안 저장이 차단되면 안 됨 (실측 exit ${r.code})`)
})

test('supervisor-guard: 홈 ~/.claude/settings.json Edit → exit 2 (전역 config fail-closed)', () => {
  const r = runHook(sandbox, 'supervisor-guard.sh',
    editPayload(path.join(os.homedir(), '.claude', 'settings.json')))
  assert.equal(r.code, 2, `전역 설정은 봉인 유지여야 함 (실측 exit ${r.code})`)
})

test('supervisor-guard: 메인의 02.Source Edit → exit 2 (Supervisor 전임)', () => {
  const r = runHook(sandbox, 'supervisor-guard.sh', editPayload('C:\\proj\\02.Source\\renderer\\src\\a.ts'))
  assert.equal(r.code, 2)
  assert.match(r.stderr, /Worker/)
})

test('supervisor-guard: 서브에이전트의 02.Source Edit → exit 0 (면제)', () => {
  const r = runHook(sandbox, 'supervisor-guard.sh',
    editPayload('C:\\proj\\02.Source\\renderer\\src\\a.ts', { agent_type: 'renderer' }))
  assert.equal(r.code, 0)
})

test('supervisor-guard: 하네스 무관 Bash(git status, 메인) → exit 0', () => {
  const r = runHook(sandbox, 'supervisor-guard.sh', bashPayload('git status'))
  assert.equal(r.code, 0)
})

test('tdd-guard: 경고 모드 — 대응 테스트 없는 구현 Edit → exit 0 + systemMessage + 원장', () => {
  const r = runHook(sandbox, 'tdd-guard.sh', editPayload('C:\\proj\\02.Source\\renderer\\src\\newFeature.ts'))
  assert.equal(r.code, 0)
  assert.match(r.stdout, /"systemMessage"/)
  const ledger = path.join(sandbox.root, '.claude', 'state', 'guard-blocks.log')
  assert.ok(existsSync(ledger), '경고 경로에서 guard-blocks.log 원장이 기록돼야 함')
  assert.match(readFileSync(ledger, 'utf8'), /tdd-guard/)
})

test('tdd-guard: 차단 모드(tdd-enforce) — 대응 테스트 없는 구현 Edit → exit 2', () => {
  writeFileSync(path.join(sandbox.root, '.claude', 'state', 'tdd-enforce'), '')
  const r = runHook(sandbox, 'tdd-guard.sh', editPayload('C:\\proj\\02.Source\\renderer\\src\\newFeature.ts'))
  rmSync(path.join(sandbox.root, '.claude', 'state', 'tdd-enforce'))
  assert.equal(r.code, 2)
})

// ── 크래시 주입: 판정기 사망 시 fail-closed(exit 2) ──────────────────────────
// 별도 샌드박스 — _lib 파손이 정상 경로 테스트를 오염하지 않게.

test('fail-closed: shell-policy 크래시 시 dangerous-cmd-guard → exit 2 (통과 명령이라도)', () => {
  const broken = makeSandbox()
  try {
    breakLib(broken, 'shell-policy.mjs')
    const r = runHook(broken, 'dangerous-cmd-guard.sh', bashPayload('git status'))
    assert.equal(r.code, 2, `판정기 사망 = 차단이어야 함 (실측 exit ${r.code})`)
    assert.match(r.stderr, /판정기|fail-closed/i)
  } finally { rmSync(broken.root, { recursive: true, force: true }) }
})

test('fail-closed: shell-policy 크래시 시 supervisor-guard 하네스 Edit → exit 2 (봉인 유지)', () => {
  const broken = makeSandbox()
  try {
    breakLib(broken, 'shell-policy.mjs')
    const r = runHook(broken, 'supervisor-guard.sh',
      editPayload(path.join(broken.root, '.claude', 'hooks', 'x.sh')))
    assert.equal(r.code, 2, `판정기 사망 시 봉인이 열리면 안 됨 (실측 exit ${r.code})`)
  } finally { rmSync(broken.root, { recursive: true, force: true }) }
})

test('fail-closed: shell-policy 크래시 시 supervisor-guard Bash → exit 2', () => {
  const broken = makeSandbox()
  try {
    breakLib(broken, 'shell-policy.mjs')
    const r = runHook(broken, 'supervisor-guard.sh', bashPayload('echo hello'))
    assert.equal(r.code, 2, `shell-write 판정 불가 = 차단이어야 함 (실측 exit ${r.code})`)
  } finally { rmSync(broken.root, { recursive: true, force: true }) }
})

// ── 알림 경로 견고성: emit_system_message 사망이 훅·원장을 죽이면 안 됨 ──────

test('robustness: system-message 크래시에도 tdd-guard 경고 경로 exit 0 + 원장 보존', () => {
  const broken = makeSandbox()
  try {
    breakLib(broken, 'system-message.mjs')
    const r = runHook(broken, 'tdd-guard.sh', editPayload('C:\\proj\\02.Source\\renderer\\src\\other.ts'))
    assert.equal(r.code, 0, `알림 실패가 경고 훅을 죽이면 안 됨 (실측 exit ${r.code})`)
    const ledger = path.join(broken.root, '.claude', 'state', 'guard-blocks.log')
    assert.ok(existsSync(ledger), 'emit 사망에도 원장 기록은 남아야 함')
    assert.match(readFileSync(ledger, 'utf8'), /tdd-guard/)
  } finally { rmSync(broken.root, { recursive: true, force: true }) }
})
