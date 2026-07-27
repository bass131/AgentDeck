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
  // ⚠️ circuit-breaker의 *총량 축*은 변이 도구(Edit|Write)만 감시한다 — Bash로 테스트하면
  //    언제나 조기 exit 0이라 "발화 0"이 거짓 통과가 된다(이 테스트를 쓰다 실제로 밟은 함정).
  // ⚠️ 그래서 음성만으로 판정하지 않고 **양성 대조**를 함께 둔다. 검출 패턴이 죽으면
  //    음성 단독 단언은 조용히 통과하기 때문이다 — 이 파일의 존재 이유가 그것이다.
  // ⚠️ 2026-07-26 픽스처 정정 — **대상을 파일마다 흩는다.** 원래는 같은 파일을 반복했는데,
  //    그날 신설한 *대상 축*(같은 주체·도구·대상 10회/5분)이 그 픽스처에 발화해 이 테스트가
  //    red가 됐다. 이 테스트가 검증하는 것은 **등급 추출 로직**이지 "같은 파일 11회가
  //    정상이다"가 아니고, 대상을 흩어도 총량 축 검증은 그대로 성립한다. 즉 판정기를
  //    느슨하게 한 것이 아니라 픽스처를 의도에 맞춘 것이다(대상 축 자체의 회귀는
  //    `circuit-breaker.test.mjs`가 소유).
  const burst = (pin, times) => {
    let notices = 0
    withSandbox((sb) => {
      writePin(sb, pin)
      for (let i = 0; i < times; i += 1) {
        const out = runHook(sb, 'circuit-breaker.sh', editPayload(`02.Source/renderer/src/App${i}.tsx`)).stdout
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

// ── HR2 P07: 폴더 개명 선행 — advisory 훅 4종의 경로 glob (ADR-028 개정 1) ─────
//
// ⚠️ ADR-028 `:20`이 이미 한 번 남긴 경고의 2회차다: *"`*src/*` glob·`$PROJ/tests` lookup은
// rename에 안 안전 → 동반 갱신. tdd-guard 테스트 lookup·reviewer-auto-trigger 경계 glob 2건은
// **에이전트 자동매핑이 놓쳐 직접 정독으로 포착**"*. advisory 훅은 죽어도 아무도 모르므로
// (exit 0 = 조용한 침묵) 새 이름 케이스를 명시 등재해 3회차를 막는다.

test('risk-detector: 새 이름(02_Source)에서도 깃발이 선다 (HR2 P07 개명 선행)', () => {
  withSandbox((sb) => {
    const flagsFor = (fp) => runHook(sb, 'risk-detector.sh', editPayload(fp)).stdout
    assert.match(flagsFor('02_Source/preload/index.ts'), /trust-boundary/)
    assert.match(flagsFor('02_Source/main/01_agents/ClaudeCodeBackend.ts'), /backend-contract/)
    assert.match(flagsFor('02_Source/shared/ipc-contract.ts'), /shared-contract/)
    // 옛 이름 회귀 없음 + 무관 경로는 여전히 조용하다
    assert.match(flagsFor('02.Source/preload/index.ts'), /trust-boundary/)
    assert.equal(flagsFor('02_Source/renderer/src/App.tsx').includes('risk-detector'), false)
  })
})

// ── NC P03: 명명 가드 신설 — advisory 티어, 신규 생성물 한정 (ADR-039) ────────
//
// ⭐ 규칙 하나당 **통과/위반 픽스처 쌍**을 의무화한다. 위반만 걸면 "전부 경고"하는
// 가드도 통과하고, 통과만 걸면 "아무것도 안 하는" 가드도 통과한다. 쌍이어야 계약이다.

test('naming guard: 신규 생성물의 규범 위반만 경고한다 — 불변식 4개 (NC P03, ADR-039)', () => {
  withSandbox((sb) => {
    const out = (rel) => runHook(sb, 'convention-size-guard.sh', editPayload(rel)).stdout
    const warns = (rel) => out(rel).includes('naming')

    // ① 새 최상위 폴더 = NN_PascalCase
    assert.equal(warns('tools/helper.md'), true, '소문자 최상위 폴더는 경고')
    assert.equal(warns('03_tools/helper.md'), true, '번호가 있어도 소문자면 경고 — §1은 PascalCase다')
    assert.equal(warns('03_Tools/helper.md'), false, 'NN_PascalCase 는 통과')

    // ② 00_Documents 직속 하위 폴더 = NN_PascalCase
    assert.equal(warns('00_Documents/specs/x.md'), true, '소문자 하위 폴더는 경고')
    assert.equal(warns('00_Documents/06_specs/x.md'), true, '번호가 있어도 소문자면 경고')
    assert.equal(warns('00_Documents/06_Specs/x.md'), false, 'NN_PascalCase 는 통과')
    assert.equal(warns('00_Documents/ROOT_LAYOUT.md'), false, '루트 .md 는 무번호가 규칙이다')

    // ③ 새 02_Source/*.ts = camelCase
    assert.equal(warns('02_Source/shared/ipc-contract.ts'), true, 'kebab 은 경고')
    assert.equal(warns('02_Source/shared/model_effort.ts'), true, 'snake 도 경고')
    assert.equal(warns('02_Source/shared/IpcContract.ts'), true, '대문자 시작은 타입 신호라 경고')
    assert.equal(warns('02_Source/shared/ipcContract.ts'), false, 'camel 은 통과')
    assert.equal(warns('02_Source/shared/git.ts'), false, '단일어 소문자도 통과')
    assert.equal(warns('02_Source/shared/index.ts'), false, '배럴도 통과')
    // 파생 확장자는 대상 밖 — 도구 관례가 이름을 정한다
    assert.equal(warns('02_Source/shared/ipc-contract.test.ts'), false)
    assert.equal(warns('02_Source/shared/env.d.ts'), false)
    assert.equal(warns('02_Source/shared/vite-env.config.ts'), false)

    // ⚠️ `.tsx` 는 기계 강제하지 않는다 — 케이스 판정이 "주 export 가 컴포넌트인가"라는
    // 내용 기반이라 파일명만으로 결정 불가다. 강제하면 합법적인 훅·모음·진입점에 오경고가 뜬다.
    assert.equal(warns('02_Source/renderer/src/zoom.tsx'), false, '훅 파일의 camel 은 합법')
    assert.equal(warns('02_Source/renderer/src/icons.tsx'), false, '모음 파일의 camel 은 합법')
    assert.equal(warns('02_Source/renderer/src/main.tsx'), false, 'Vite 진입점 계약')
    assert.equal(warns('02_Source/renderer/src/ChatPanel.tsx'), false, '컴포넌트 Pascal 도 통과')

    // ④ 파일명 공백 금지
    assert.equal(warns('02_Source/shared/my file.ts'), true)
    assert.equal(warns('00_Documents/06_Specs/설계 노트.md'), true)

    // ❄️ 동결 예외 — 도구가 이름을 정하는 구역에는 뜨지 않는다
    for (const frozen of [
      'artifacts/run.json', 'out/main/index.js', 'test-results/x.png',
      '.claude/state/current-pin.txt', '.codex/state/x.json', '.agents/skills/x.md',
      'node_modules/pkg/index.js',
    ]) {
      assert.equal(warns(frozen), false, frozen)
    }

    // 차단이 아니라 조기 경고다 — advisory 티어는 언제나 exit 0
    assert.equal(runHook(sb, 'convention-size-guard.sh', editPayload('tools/x.md')).code, 0)
  })
})

// ⭐ 한 훅이 systemMessage JSON 을 **두 번** 내면 stdout 이 유효한 JSON 이 아니게 되어
// **두 메시지가 다 유실된다**(hook-common.sh 자신이 "stdout 에 JSON 외 텍스트를 섞지 말라"고
// 경고한다). 명명 가드가 붙으면서 크기 가드와 동시 발화하는 경로가 생겼으므로 계약으로 고정한다.
test('naming + size 동시 발화 — systemMessage JSON 은 하나다 (NC P03 reviewer 🟡-1)', () => {
  withSandbox((sb) => {
    const rel = '02_Source/shared/ipc-contract.ts'      // ① 명명 위반(kebab) + 미추적 신규
    const abs = path.join(sb.root, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, 'x\n'.repeat(900))               // ② 크기 임계(800) 초과
    const out = runHook(sb, 'convention-size-guard.sh', editPayload(rel)).stdout
    assert.match(out, /naming/, '명명 경고가 들어 있어야 한다')
    assert.match(out, /convention-size/, '크기 경고도 같은 메시지에 들어 있어야 한다')
    assert.doesNotThrow(() => JSON.parse(out.trim()),
      'stdout 은 단일 JSON 이어야 한다 — 두 번 emit 하면 둘 다 조용히 유실된다')
  })
})

// ⭐ 소급 스캔 금지를 **예외 목록이 아니라 git 추적 여부**로 판정한다. 목록은 낡는 순간
// 동결 파일에 상시 경고가 뜨고, 노이즈는 승인 피로를 거쳐 우회 습관이 된다. git 이 이미
// 추적 중인 파일은 정의상 기존 파일이므로, 이 판정은 소급 스캔을 **구조적으로 불가능**하게
// 만든다 — 관리할 목록이 없다.
test('naming guard: 이미 추적 중인 파일에는 침묵한다 — 소급 스캔 금지 (NC P03)', () => {
  withSandbox((sb) => {
    const git = (...args) => spawnSync('git', ['-C', sb.root, ...args], { encoding: 'utf8' })
    const seed = (rel) => {
      const abs = path.join(sb.root, rel)
      mkdirSync(path.dirname(abs), { recursive: true })
      writeFileSync(abs, 'export const x = 1\n')
      return rel
    }
    git('init', '-q')
    const tracked = seed('02_Source/shared/ipc-contract.ts')   // 규범 위반이지만 기존 파일
    git('add', tracked)
    const fresh = seed('02_Source/shared/model-effort.ts')     // 같은 위반, 미추적

    const warns = (rel) => runHook(sb, 'convention-size-guard.sh', editPayload(rel)).stdout.includes('naming')
    assert.equal(warns(tracked), false, '동결 파일에 상시 경고가 뜨면 이 가드가 스스로 노이즈가 된다')
    assert.equal(warns(fresh), true, '같은 저장소의 신규 파일에는 여전히 경고해야 한다')
  })
})

// ── NC P03: 개명 선행 — 파일 스템 camelCase 병행 수용 (ADR-039) ──────────────
//
// ⚠️ 여기 걸린 것은 폴더가 아니라 **파일명 리터럴**이다. `risk-detector.sh:26`·`:30`이
// `agent-events`·`ipc-contract` 를 문자열로 알고 있는데, P07이 바로 그 두 파일을
// `agentEvents.ts`·`ipcContract.ts` 로 개명한다. 고치지 않으면 backend-contract·
// shared-contract 깃발이 **조용히 죽는다**(advisory 훅은 exit 0 = 침묵).
//
// ⭐ 이 픽스처가 P03에 있는 이유: `.claude/hooks/**` 는 CORE-11 봉인이라 **창 없이는
// 못 고친다.** P07은 창 0회로 계획돼 있어, 여기서 미리 안 고치면 "개명은 됐는데
// 훅은 못 고치는" 상태로 갇힌다 — 창을 한 번 더 여는 비용이 그때 발생한다.

test('risk-detector: NC 신 파일명(agentEvents·ipcContract)에서도 깃발이 선다 (NC P03 개명 선행)', () => {
  withSandbox((sb) => {
    const flagsFor = (fp) => runHook(sb, 'risk-detector.sh', editPayload(fp)).stdout
    // 신 이름 — P07 개명 후 실재할 파일
    assert.match(flagsFor('02_Source/shared/agentEvents.ts'), /backend-contract/)
    assert.match(flagsFor('02_Source/shared/ipcContract.ts'), /shared-contract/)
    // 구 이름 회귀 0 — 개명 전에는 이쪽이 실재한다
    assert.match(flagsFor('02_Source/shared/agent-events.ts'), /backend-contract/)
    assert.match(flagsFor('02_Source/shared/ipc-contract.ts'), /shared-contract/)
    // 파생 테스트 파일도 같은 깃발 (스템 접두 매칭)
    assert.match(flagsFor('02_Source/shared/agentEvents.test.ts'), /backend-contract/)
    // ❄️ 경계는 넓어지지 않는다 — 무관한 shared 파일은 여전히 조용하다
    assert.equal(flagsFor('02_Source/shared/diffTypes.ts').includes('shared-contract'), false)
    assert.equal(flagsFor('02_Source/renderer/src/App.tsx').includes('risk-detector'), false)
  })
})

test('reviewer-auto-trigger: 새 이름(02_Source) 계약 경로도 트리거한다 (HR2 P07 개명 선행)', () => {
  withSandbox((sb) => {
    const out = (fp) => runHook(sb, 'reviewer-auto-trigger.sh', editPayload(fp)).stdout
    assert.match(out('02_Source/shared/ipc-contract.ts'), /reviewer-auto-trigger/)
    assert.match(out('02_Source/preload/index.ts'), /reviewer-auto-trigger/)
    assert.match(out('02_Source/main/01_agents/CodexBackend.ts'), /reviewer-auto-trigger/)
    assert.match(out('02.Source/shared/ipc-contract.ts'), /reviewer-auto-trigger/)
    // 제외 경계도 새 이름에서 동일
    assert.equal(out('02_Source/shared/ipc-contract.test.ts').includes('reviewer-auto-trigger'), false)
    assert.equal(out('99_Others/tests/unit/x.ts').includes('reviewer-auto-trigger'), false)
  })
})

test('convention-size-guard: 새 이름(02_Source)의 초과 파일도 경고한다 (HR2 P07 개명 선행)', () => {
  withSandbox((sb) => {
    const write = (rel, lines) => {
      const abs = path.join(sb.root, rel)
      mkdirSync(path.dirname(abs), { recursive: true })
      writeFileSync(abs, 'x\n'.repeat(lines))
      return rel
    }
    const out = (fp) => runHook(sb, 'convention-size-guard.sh', editPayload(fp)).stdout
    assert.match(out(write('02_Source/renderer/src/Huge.ts', 900)), /convention-size/)
    assert.match(out(write('02.Source/renderer/src/Huge.ts', 900)), /convention-size/)
    assert.equal(out(write('02_Source/renderer/src/Small.ts', 100)).includes('convention-size'), false)
  })
})

// ⚠️ tdd-guard는 **대상 판정(:27,:30)과 테스트 탐색(:39-40)을 짝으로** 고쳐야 한다.
// `:30`만 고치면 대응 테스트를 영영 못 찾아 전 파일 과차단(fail-closed)이고,
// 탐색만 고치면 여전히 fail-open이다. 부분 수정이 가장 나쁘므로 양방향을 함께 단언한다.
test('tdd-guard: 새 이름(02_Source/99_Others)에서 대상 판정과 테스트 탐색이 짝으로 동작한다 (HR2 P07)', () => {
  withSandbox((sb) => {
    writeFileSync(path.join(sb.root, '.claude', 'state', 'tdd-enforce'), '')
    const write = (rel, body = 'x\n') => {
      const abs = path.join(sb.root, rel)
      mkdirSync(path.dirname(abs), { recursive: true })
      writeFileSync(abs, body)
      return rel
    }
    const run = (fp) => runHook(sb, 'tdd-guard.sh', editPayload(fp))

    // ① 대상 판정 — 대응 테스트가 없으면 차단(fail-open이면 exit 0으로 새어 나간다)
    const bare = write('02_Source/main/BareFeature.ts')
    assert.equal(run(bare).code, 2, '새 이름 구현 파일이 TDD 대상에서 빠지면 안 된다(fail-open)')

    // ② 테스트 탐색 — 새 테스트 루트에 대응 테스트가 있으면 통과(짝을 안 고치면 과차단)
    write('02_Source/main/CoveredFeature.ts')
    write('99_Others/tests/main/CoveredFeature.test.ts', 'test\n')
    assert.equal(run('02_Source/main/CoveredFeature.ts').code, 0,
      '탐색 경로를 짝으로 안 고치면 대응 테스트가 있어도 전 파일 과차단이 된다')

    // ③ 옛 이름 회귀 없음 (개명 전이므로 양쪽 다 살아 있어야 한다)
    write('02.Source/main/OldCovered.ts')
    write('99.Others/tests/main/OldCovered.test.ts', 'test\n')
    assert.equal(run('02.Source/main/OldCovered.ts').code, 0)
    assert.equal(run(write('02.Source/main/OldBare.ts')).code, 2)

    // ④ 면제 경계도 새 이름에서 동일 (shared = 순수 타입/계약)
    assert.equal(run(write('02_Source/shared/ipc-contract.ts')).code, 0)
  })
})
