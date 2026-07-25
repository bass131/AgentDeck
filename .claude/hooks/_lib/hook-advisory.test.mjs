// .claude/hooks/_lib/hook-advisory.test.mjs — 무방비 훅 5종 + 공유 파서 2종 계약 회귀 (HR2 P05).
//
// 배경: 훅 9종 중 5종(pin-injector·risk-detector·circuit-breaker·reviewer-auto-trigger·
// convention-size-guard)과 공유 파서 2종(parse-payload.js·shell-tokens.js)에 테스트가
// 0건이었다. 이들은 advisory(차단 아님)라 조용히 죽어도 아무도 모른다 — 실제로 2회 죽었다:
//   ① 2026-07-04 python MS Store 스텁으로 전 payload 파싱 훅 무력화
//   ② 2026-07-17 circuit-breaker의 `grep '^등급:'`이 pin 포맷 변경에 죽어 임계 오동작
// 그래서 이 파일이 고정하는 것은 "동작"이 아니라 **검출 패턴의 계약**이다.
//
// 방식: hook-exit.test.mjs와 동일한 샌드박스 관례(os.tmpdir 사본 — 실 하네스 무접촉).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url))
const HOOKS_DIR = path.dirname(LIB_DIR)

function makeSandbox() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agentdeck-hook-advisory-'))
  const hooks = path.join(root, '.claude', 'hooks')
  mkdirSync(path.join(root, '.claude', 'state'), { recursive: true })
  cpSync(HOOKS_DIR, hooks, { recursive: true, filter: (src) => !/node_modules/.test(src) })
  return { root, hooks }
}

function runHook(sandbox, hook, payload, env = {}) {
  const result = spawnSync('bash', [path.join(sandbox.hooks, hook)], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: sandbox.root, ...env },
  })
  return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function runNode(script, input) {
  const result = spawnSync(process.execPath, [path.join(LIB_DIR, script)], { input, encoding: 'utf8' })
  return { code: result.status, stdout: result.stdout ?? '' }
}

const editPayload = (filePath, extra = {}) => ({
  tool_name: 'Edit', hook_event_name: 'PreToolUse', tool_input: { file_path: filePath }, ...extra,
})
const withSandbox = (fn) => {
  const sb = makeSandbox()
  try { fn(sb) } finally { rmSync(sb.root, { recursive: true, force: true }) }
}
const writePin = (sb, body) => writeFileSync(path.join(sb.root, '.claude', 'state', 'current-pin.txt'), body)

// ── 공유 파서 2종 ────────────────────────────────────────────────────────────

test('parse-payload: 정상 payload → 5개 셸 할당문 (키 부재는 빈 문자열)', () => {
  const { stdout } = runNode('parse-payload.js', JSON.stringify({
    tool_name: 'Bash', hook_event_name: 'PreToolUse', tool_input: { command: 'ls' }, agent_type: 'qa',
  }))
  const lines = stdout.trim().split('\n')
  assert.equal(lines.length, 5)
  assert.ok(lines.includes("TOOL_NAME='Bash'"))
  assert.ok(lines.includes("TOOL_INPUT_COMMAND='ls'"))
  assert.ok(lines.includes("AGENT_TYPE='qa'"))
  assert.ok(lines.includes("TOOL_INPUT_FILE_PATH=''"), '없는 키는 빈 문자열이어야 함')
})

test('parse-payload: JSON이 아니면 빈 출력 — 호출측이 실패를 감지하는 유일한 신호', () => {
  // ⚠️ 파서는 파싱 실패에도 exit 0을 낸다(종료코드로는 감지 불가). 항상 5줄을 내므로
  // 빈 출력이 곧 실패 신호이고, hook-common.sh의 fail-closed 판정이 여기 의존한다.
  const broken = runNode('parse-payload.js', 'not json')
  assert.equal(broken.stdout.trim(), '')
  assert.equal(broken.code, 0, '종료코드가 아니라 출력 유무가 신호다')
})

test('parse-payload: 값의 작은따옴표를 이스케이프해 eval 주입을 막는다', () => {
  const { stdout } = runNode('parse-payload.js', JSON.stringify({
    tool_name: 'Bash', tool_input: { command: "x'; touch /tmp/pwned; echo '" },
  }))
  const line = stdout.split('\n').find((l) => l.startsWith('TOOL_INPUT_COMMAND='))
  // shlex.quote 동등: 값 전체가 단일따옴표로 감싸이고 내부 '는 '\'' 로 치환된다
  assert.equal(line, "TOOL_INPUT_COMMAND='x'\\''; touch /tmp/pwned; echo '\\'''")
  // 실제로 eval 해도 명령이 실행되지 않고 문자열로만 들어가는지 확인
  const evaled = spawnSync('bash', ['-c', `${line}; printf '%s' "$TOOL_INPUT_COMMAND"`], { encoding: 'utf8' })
  assert.equal(evaled.stdout, "x'; touch /tmp/pwned; echo '")
})

test('shell-tokens: 기본 분해와 따옴표 처리', () => {
  assert.deepEqual(runNode('shell-tokens.js', 'npm run test').stdout.trim().split('\n'), ['npm', 'run', 'test'])
  assert.deepEqual(runNode('shell-tokens.js', "git commit -m 'a b'").stdout.trim().split('\n'),
    ['git', 'commit', '-m', 'a b'])
})

test('shell-tokens: 따옴표 불균형이 실행 경계를 열지 않는다 (P05 우선순위 1 — 동일 결함 2번째 지점)', () => {
  // ⚠️ 계획 열거 밖에서 발견: shell-policy.mjs와 같은 fail-open이 여기에도 있었다.
  // supervisor-guard.sh ②절은 `[ ${#TOKENS[@]} -eq 0 ] && exit 0`이라 토큰 0 = 통과다.
  // bash는 # 이후를 주석 처리하므로 아래 명령은 `git add .`로 정상 실행된다.
  assert.deepEqual(runNode('shell-tokens.js', "git add . # it's fine").stdout.trim().split('\n'),
    ['git', 'add', '.'])
  // 주석을 걷어낸 뒤에도 불균형이면 best-effort 토큰화(fail-closed)
  assert.deepEqual(runNode('shell-tokens.js', 'npm run "test').stdout.trim().split('\n'),
    ['npm', 'run', 'test'])
  // 따옴표 안의 #은 주석이 아니다
  assert.deepEqual(runNode('shell-tokens.js', "git commit -m 'a # b'").stdout.trim().split('\n'),
    ['git', 'commit', '-m', 'a # b'])
})

// ── pin-injector ─────────────────────────────────────────────────────────────

test('pin-injector: pin 본문을 work-pin 블록으로 주입하고, 헤더는 훅이 단독으로 넣는다', () => {
  withSandbox((sb) => {
    writePin(sb, 'PHASE: **P05** / 등급: 대규모\n현재 작업: 훅 봉합\n')
    const r = runHook(sb, 'pin-injector.sh', { hook_event_name: 'UserPromptSubmit' })
    assert.equal(r.code, 0)
    assert.match(r.stdout, /<work-pin source="\.claude\/state\/current-pin\.txt">/)
    assert.match(r.stdout, /현재 작업: 훅 봉합/)
    // 계약: 헤더는 훅의 heredoc이 단독 주입한다. pin 파일이 같은 헤더를 갖고 있으면
    // 매 턴 2회 노출된다(2026-07-17 점검 🟡-13 실측) — 주입 횟수를 고정한다.
    assert.equal((r.stdout.match(/\[자동 주입/g) ?? []).length, 1)
  })
})

test('pin-injector: pin이 없거나 비면 아무것도 주입하지 않는다', () => {
  withSandbox((sb) => {
    assert.equal(runHook(sb, 'pin-injector.sh', { hook_event_name: 'UserPromptSubmit' }).stdout.includes('<work-pin'), false)
    writePin(sb, '')
    assert.equal(runHook(sb, 'pin-injector.sh', { hook_event_name: 'UserPromptSubmit' }).stdout.includes('<work-pin'), false)
  })
})

// ── circuit-breaker ──────────────────────────────────────────────────────────

test('circuit-breaker: 등급을 PHASE 줄 *중간*에서 추출해 임계를 가른다 (2026-07-17 조용한 사망 회귀)', () => {
  // ⚠️ circuit-breaker는 변이 도구(Edit|Write)만 감시한다 — Bash로 테스트하면 언제나
  //    조기 exit 0이라 "발화 0"이 거짓 통과가 된다(이 테스트를 쓰다 실제로 밟은 함정).
  // ⚠️ 그래서 음성만으로 판정하지 않고 **양성 대조**를 함께 둔다. 검출 패턴이 죽으면
  //    음성 단독 단언은 조용히 통과하기 때문이다 — 이 파일의 존재 이유가 그것이다.
  const burst = (pin, times) => {
    let notices = 0
    withSandbox((sb) => {
      writePin(sb, pin)
      for (let i = 0; i < times; i += 1) {
        const out = runHook(sb, 'circuit-breaker.sh', editPayload('02.Source/renderer/src/App.tsx')).stdout
        if (out.includes('circuit-breaker')) notices += 1
      }
    })
    return notices
  }
  const 대규모 = 'PHASE: **P05 착수** / 등급: 대규모 / 깃발: harness\n'

  assert.ok(burst('PHASE: 등급 표기 없음\n', 11) > 0, '등급 미기재 → 기본 임계 10 초과 시 발화')
  assert.equal(burst(대규모, 11), 0,
    '등급이 줄 중간에 있어도 추출돼 임계 20이 적용돼야 함 — 줄머리 앵커(`grep ^등급:`)면 여기서 기본 10으로 발화한다')
  assert.ok(burst(대규모, 21) > 0, '양성 대조 — 임계 20을 실제로 넘기면 발화한다')
})

// ── risk-detector ────────────────────────────────────────────────────────────

test('risk-detector: 경로별 깃발을 정확히 세운다 (SSOT = grade-and-risk.md)', () => {
  withSandbox((sb) => {
    const flagsFor = (fp) => runHook(sb, 'risk-detector.sh', editPayload(fp)).stdout
    assert.match(flagsFor('02.Source/preload/index.ts'), /trust-boundary/)
    assert.match(flagsFor('02.Source/main/01_agents/ClaudeCodeBackend.ts'), /backend-contract/)
    assert.match(flagsFor('02.Source/shared/ipc-contract.ts'), /shared-contract/)
    assert.match(flagsFor('CLAUDE.md'), /harness/)
    assert.match(flagsFor('.claude/hooks/x.sh'), /harness/)
    // 무관 경로는 조용하다
    assert.equal(flagsFor('02.Source/renderer/src/App.tsx').includes('risk-detector'), false)
  })
})

// ── reviewer-auto-trigger ────────────────────────────────────────────────────

test('reviewer-auto-trigger: 계약 경로만 트리거하고 테스트 변경은 제외한다', () => {
  withSandbox((sb) => {
    const out = (fp) => runHook(sb, 'reviewer-auto-trigger.sh', editPayload(fp)).stdout
    assert.match(out('02.Source/shared/ipc-contract.ts'), /reviewer-auto-trigger/)
    assert.match(out('02.Source/preload/index.ts'), /reviewer-auto-trigger/)
    assert.match(out('02.Source/main/01_agents/CodexBackend.ts'), /reviewer-auto-trigger/)
    assert.equal(out('02.Source/shared/ipc-contract.test.ts').includes('reviewer-auto-trigger'), false)
    assert.equal(out('99.Others/tests/unit/x.ts').includes('reviewer-auto-trigger'), false)
    assert.equal(out('02.Source/renderer/src/App.tsx').includes('reviewer-auto-trigger'), false)
  })
})

// ── convention-size-guard ────────────────────────────────────────────────────

test('convention-size-guard: 800줄 초과 02.Source 파일만 경고한다', () => {
  withSandbox((sb) => {
    const write = (rel, lines) => {
      const abs = path.join(sb.root, rel)
      mkdirSync(path.dirname(abs), { recursive: true })
      writeFileSync(abs, 'x\n'.repeat(lines))
      return rel
    }
    const big = write('02.Source/renderer/src/Huge.ts', 900)
    const small = write('02.Source/renderer/src/Small.ts', 100)
    const bigTest = write('02.Source/renderer/src/Huge.test.ts', 900)
    const bigDecl = write('02.Source/renderer/src/Huge.d.ts', 900)
    const out = (fp) => runHook(sb, 'convention-size-guard.sh', editPayload(fp)).stdout
    assert.match(out(big), /convention-size/)
    assert.equal(out(small).includes('convention-size'), false)
    assert.equal(out(bigTest).includes('convention-size'), false, '테스트는 임계 대상 아님')
    assert.equal(out(bigDecl).includes('convention-size'), false, '.d.ts는 임계 대상 아님')
  })
})
