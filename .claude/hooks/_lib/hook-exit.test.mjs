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

// ── HR2 P05: OpenGate 글루 + 파서 단일 실패점 (유지보수 창 2026-07-25) ────────
// ⚠️ OpenGate 회귀는 .sh 글루 동작이라 shell-policy.test.mjs가 아니라 여기가 소관이다.

function writeGateFlag(sb, epochSeconds, folder = '98.Management') {
  mkdirSync(path.join(sb.root, folder, 'Harness_OpenGate'), { recursive: true })
  writeFileSync(path.join(sb.root, folder, 'Harness_OpenGate', 'gate-open.flag'), `${epochSeconds}\n`)
}
const nowSec = () => Math.floor(Date.now() / 1000)
// TTL은 supervisor-guard.sh가 정본이다 — 테스트가 값을 복제하면 상수를 바꾼 순간
// 만료 케이스가 "신선"으로 넘어가 조용히 거짓 통과한다(4h→7h 확장에서 실제로 밟았다).
const GATE_TTL_SEC = Number(
  /^GATE_TTL_SEC=(\d+)/m.exec(readFileSync(path.join(HOOKS_DIR, 'supervisor-guard.sh'), 'utf8'))?.[1],
)
const sealedEdit = (sb) => editPayload(path.join(sb.root, '.claude', 'settings.json'))

test('OpenGate: 신선한 flag → 봉인 통과 exit 0 + open-gate 원장 (ADR-038 사후 감사 계약)', () => {
  const sb = makeSandbox()
  try {
    writeGateFlag(sb, nowSec() - 60)
    const r = runHook(sb, 'supervisor-guard.sh', sealedEdit(sb))
    assert.equal(r.code, 0, `개방 창에서는 전체 통과가 설계 의도 (실측 exit ${r.code})`)
    const ledger = path.join(sb.root, '.claude', 'state', 'guard-blocks.log')
    assert.match(readFileSync(ledger, 'utf8'), / \| open-gate \| /,
      'ADR-038이 위협모델 완화의 대가로 내세운 사후 감사 라벨이 남아야 함')
  } finally { rmSync(sb.root, { recursive: true, force: true }) }
})

test('OpenGate: TTL 만료 flag → 봉인 복귀 exit 2', () => {
  assert.ok(Number.isFinite(GATE_TTL_SEC) && GATE_TTL_SEC > 0,
    'supervisor-guard.sh에서 GATE_TTL_SEC을 읽지 못하면 이 테스트는 의미가 없다')
  const sb = makeSandbox()
  try {
    writeGateFlag(sb, nowSec() - (GATE_TTL_SEC + 1))
    assert.equal(runHook(sb, 'supervisor-guard.sh', sealedEdit(sb)).code, 2)
  } finally { rmSync(sb.root, { recursive: true, force: true }) }
})

test('OpenGate: 비정상 자릿수 flag → 산술 오버플로우가 신선 구간으로 wrap하지 않는다', () => {
  // reviewer 미검증 #6. `tr -cd '0-9'`는 자릿수를 제한하지 않아 초장문 숫자가 그대로
  // `$((now - ts))`에 들어간다 — bash는 오버플로우로 wrap하고, 그 결과가 우연히
  // 0~TTL 구간에 떨어지면 창이 열린 것으로 판정된다. 자릿수 상한으로 원천 차단한다.
  const sb = makeSandbox()
  try {
    for (const value of ['9'.repeat(60), '1'.repeat(20), '0'.repeat(30)]) {
      writeGateFlag(sb, value)
      assert.equal(runHook(sb, 'supervisor-guard.sh', sealedEdit(sb)).code, 2,
        `비정상 flag 값(${value.length}자리)이 개방으로 읽히면 안 된다`)
    }
  } finally { rmSync(sb.root, { recursive: true, force: true }) }
})

test('파서 fail-closed 확장: 객체가 아닌 payload·빈 stdin도 판정 불가로 차단 (reviewer 🟡-1)', () => {
  const sb = makeSandbox()
  try {
    // `JSON.parse("5")`는 성공하지만 tool_input이 없어 5줄이 전부 빈 값으로 출력된다 —
    // 파서는 "성공"을 신호했고 훅은 TOOL_NAME이 비어 봉인 검사를 통째로 건너뛰었다.
    // (`null`만 우연히 TypeError로 걸려 차단됐던 것이지, 설계된 방어가 아니었다.)
    for (const payload of [5, 'plain string', [], true]) {
      assert.equal(runHook(sb, 'supervisor-guard.sh', payload).code, 2,
        `비객체 payload ${JSON.stringify(payload)}는 판정 불가여야 한다`)
    }
    // 빈 stdin = 검사할 대상 자체가 없다. 통과시키면 봉인이 없는 것과 같다.
    const empty = spawnSync('bash', [path.join(sb.hooks, 'supervisor-guard.sh')], {
      input: '', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: sb.root },
    })
    assert.equal(empty.status, 2, '빈 payload도 fail-closed')
  } finally { rmSync(sb.root, { recursive: true, force: true }) }
})

test('OpenGate: 미래 epoch flag → 무기한 개방이 아니라 봉인 exit 2 (P05 우선순위 3)', () => {
  const sb = makeSandbox()
  try {
    // age가 음수가 되면 `-lt TTL`이 언제나 참이라 창이 영원히 열린다.
    writeGateFlag(sb, nowSec() + 86400)
    assert.equal(runHook(sb, 'supervisor-guard.sh', sealedEdit(sb)).code, 2,
      '미래 타임스탬프가 무기한 개방을 만들면 안 됨')
  } finally { rmSync(sb.root, { recursive: true, force: true }) }
})

test('OpenGate: 언급·읽기 Bash는 통과, 실행·쓰기는 차단 (ADR-038 개정 1 — 방어 범위 축소)', () => {
  const sb = makeSandbox()
  try {
    // 언급·읽기는 방어 대상이 아니다 — Read/Glob이 열려 있어 Bash만 막는 건 미달성 방어였고,
    // 차단 메시지가 대체 경로를 안내해 방지턱이 아니라 표지판이 됐다.
    for (const command of [
      'ls 98.Management/Harness_OpenGate',
      'echo harness_opengate 창 상태를 확인한다',
      'cat 98.Management/Harness_OpenGate/README.md',
    ]) assert.equal(runHook(sb, 'supervisor-guard.sh', bashPayload(command)).code, 0, command)

    // 실행 벡터(자기 개방) + 쓰기 벡터(flag 직접 생성)는 차단 유지
    for (const command of [
      '98.Management/Harness_OpenGate/OPEN-GATE.bat',
      'cmd /c 98.Management\\Harness_OpenGate\\OPEN-GATE.bat',
      'echo 1 > 98.Management/Harness_OpenGate/gate-open.flag',
    ]) assert.equal(runHook(sb, 'supervisor-guard.sh', bashPayload(command)).code, 2, command)
  } finally { rmSync(sb.root, { recursive: true, force: true }) }
})

// ── HR2 P07: 부트스트랩 자물쇠 — GATE_FLAG는 신·구 두 경로를 OR로 본다 ────────
//
// ⚠️ 여기만은 "새 경로로 일원화"가 금지다. 개명(P08)은 봉인 대상 파일을 고치는 작업이라
// 창이 열려 있어야 하는데, GATE_FLAG를 새 경로로만 바꾸면 개명 **전**에는 flag를 못 찾아
// 즉시 봉인 복귀 → 남은 봉인 파일을 그 자리에서 못 고친다. P07이 막으려는 사고를 P07이
// 스스로 일으키는 셈이다. 다른 경로 매칭은 "차단이 늦게 걸릴 뿐" 회복 가능하지만
// GATE_FLAG는 **회복 경로 자체를 끊는다** — 이 비대칭이 OR 검사의 이유다.

test('OpenGate: 새 이름(98_Management) 폴더의 flag로도 창이 열린다 (HR2 P07 부트스트랩)', () => {
  const sb = makeSandbox()
  try {
    writeGateFlag(sb, nowSec() - 60, '98_Management')
    const r = runHook(sb, 'supervisor-guard.sh', sealedEdit(sb))
    assert.equal(r.code, 0, `개명 후에도 창이 열려야 한다 (실측 exit ${r.code})`)
    assert.match(readFileSync(path.join(sb.root, '.claude', 'state', 'guard-blocks.log'), 'utf8'),
      / \| open-gate \| /, '새 경로에서도 사후 감사 라벨이 남아야 함')
  } finally { rmSync(sb.root, { recursive: true, force: true }) }
})

test('OpenGate: 새 이름 폴더의 만료 flag도 봉인으로 복귀한다 (OR 검사가 TTL을 우회하지 않는다)', () => {
  const sb = makeSandbox()
  try {
    writeGateFlag(sb, nowSec() - (GATE_TTL_SEC + 1), '98_Management')
    assert.equal(runHook(sb, 'supervisor-guard.sh', sealedEdit(sb)).code, 2,
      '두 경로를 OR로 보는 것이 "둘 중 하나라도 있으면 무조건 개방"을 뜻하면 안 된다')
  } finally { rmSync(sb.root, { recursive: true, force: true }) }
})

test('fail-closed: parse-payload 사망 시 supervisor-guard 하네스 Edit → exit 2 (P05 우선순위 2)', () => {
  const sb = makeSandbox()
  try {
    breakLib(sb, 'parse-payload.js')
    assert.equal(runHook(sb, 'supervisor-guard.sh', sealedEdit(sb)).code, 2,
      '전 훅이 공유하는 파서의 사망이 9종을 전면 통과시키면 안 됨')
  } finally { rmSync(sb.root, { recursive: true, force: true }) }
})

test('실행 경계 ②: 주석으로 감싼 git add/npm run도 차단된다 (shell-tokens fail-open 봉합)', () => {
  const sb = makeSandbox()
  try {
    // ②절은 `[ ${#TOKENS[@]} -eq 0 ] && exit 0`이라 토큰 0 = 통과였다. 주석 안의 짝 없는
    // 아포스트로피가 토큰을 0으로 만들면 실행 경계가 통째로 열린다 — bash는 # 이후를
    // 버리고 `git add .`를 정상 실행한다.
    for (const command of ['git add .', "git add . # it's fine", 'npm run test', "npm run lint # don't"]) {
      assert.equal(runHook(sb, 'supervisor-guard.sh', bashPayload(command)).code, 2, command)
    }
    // 서브에이전트는 ②절 면제 — 봉인(①절)과 달리 실행 경계는 메인 세션만 대상이다
    assert.equal(runHook(sb, 'supervisor-guard.sh', bashPayload('git add .', { agent_type: 'secretary' })).code, 0)
    // 무관 명령은 통과
    assert.equal(runHook(sb, 'supervisor-guard.sh', bashPayload('git status --short')).code, 0)
  } finally { rmSync(sb.root, { recursive: true, force: true }) }
})

test('fail-closed: JSON 아닌 payload도 차단한다 (파서가 exit 0 + 빈 출력을 내는 경로)', () => {
  const sb = makeSandbox()
  try {
    for (const hook of ['supervisor-guard.sh', 'dangerous-cmd-guard.sh']) {
      const r = spawnSync('bash', [path.join(sb.hooks, hook)], {
        input: 'not json at all',
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_PROJECT_DIR: sb.root },
      })
      assert.equal(r.status, 2, `${hook}: 판정 불가는 fail-closed (실측 exit ${r.status})`)
    }
    // ⚠️ 계약 반전(reviewer 🟡-1, 2026-07-25). 옛 단언은 *"빈 payload는 판정 대상이
    // 없으니 통과"* 였다. 그런데 이 호출은 `JSON.stringify('')` = `""` 라서 실제로는
    // **빈 stdin이 아니라 비객체 JSON**을 보내고 있었고, 그 경로가 정확히 무판정 통과의
    // 벡터였다(파서가 5줄을 빈 값으로 내보내 "성공"으로 읽혔다). 지금은 둘 다 fail-closed다
    // — 빈 stdin·비객체 전수는 위 「파서 fail-closed 확장」 테스트가 나눠서 커버한다.
    assert.equal(runHook(sb, 'supervisor-guard.sh', '').code, 2)
  } finally { rmSync(sb.root, { recursive: true, force: true }) }
})
