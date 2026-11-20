#!/usr/bin/env node
// tdd-guard Green 증거 강도 (M02 Phase 3 Step 2 · M01 Backlog 11번 잔여 + 7번).
//
// 겨누는 결함 두 가지 —
//   ① 전체 Green 오채집(fail-open): 채집 조건이 「명령에 vitest·npm test가 들어 있고 출력에 Test Files
//      … passed가 있다」뿐이라, 단건 파일 실행이나 -t 필터 실행의 통과도 「전체 Green」 증거로 기록된다.
//      그 증거 하나로 source 태그 Phase의 PASS 추기가 열린다 — 전체 회귀를 보지 않은 통과다.
//      출력이 파이프로 잘린 실행도 같은 이유로 위험하다 — 잘린 꼬리에 실패 표기가 있었을 수 있다.
//   ② 증거 오염: lastGreen.evidence에 vitest 색상 제어 문자(ANSI)가 그대로 박힌다.
//
// 판정 근거는 미러 hook-log 줄과 미러 상태 파일뿐이다 (실저장소는 건드리지 않는다).
import { join } from 'node:path'
import { createRunner } from './_lib/runner.mjs'
import { createGateHarness, VITEST_FULL_GREEN, VITEST_FULL_RED, VITEST_SINGLE_GREEN } from './_lib/gate-harness.mjs'

const r = createRunner('tdd-guard Green 증거 강도')
const H = createGateHarness()
const HOOK = '33_tdd-guard.cjs'
const STATE = join(H.gateDir, 'tdd-guard.state.json')
const ESC = String.fromCharCode(27)

// ANSI 색상이 섞인 실제 vitest 출력 모사 — 요약 줄 좌우와 숫자 앞뒤에 제어 문자가 낀다
const ANSI_GREEN = ` RUN  vitest\n\n ${ESC}[1mTest Files${ESC}[22m  ${ESC}[1m${ESC}[32m411 passed${ESC}[39m${ESC}[22m | 6 skipped ${ESC}[90m(417)${ESC}[39m\n      Tests  5465 passed (5477)\n`

const bash = (session, command, stdout) => ({
  session_id: session, hook_event_name: 'PostToolUse', tool_name: 'Bash', cwd: H.mirror,
  tool_input: { command }, tool_response: { stdout },
})

// 한 케이스 = 상태 초기화 후 Bash PostToolUse 1건 — 추가된 tdd-guard 줄의 verdict/rule을 돌려준다
function collect(session, command, stdout) {
  try { H.write(STATE, JSON.stringify({ schema: 2, global: null, sessions: {} }, null, 2) + '\n') } catch { /* 없어도 무방 */ }
  const res = H.run(HOOK, bash(session, command, stdout))
  const mine = res.of('tdd-guard')
  return { res, mine, verdict: mine.map((l) => `${l.verdict}/${l.rule}`).join(', ') || '무발화' }
}
function lastGreen() {
  try { return H.readJson(STATE).sessions?.['ge']?.lastGreen ?? null } catch { return null }
}

try {
  // ---- 회귀 불변식 — 전체 실행은 지금도 증거다 -----------------------------
  {
    const c = collect('ge', 'npm run test', VITEST_FULL_GREEN)
    r.judge('GE-01 전체 실행(`npm run test`) + 전체 Green', c.verdict, 'green-기록/vitest-green',
      { note: '회귀 불변식 — 유일한 인정 경로' })
  }

  // ---- ① 전체 Green 오채집 (fail-open) ------------------------------------
  {
    const c = collect('ge', 'npx vitest run 02_Project/01_TestCode/hooks/probe.test.ts', VITEST_SINGLE_GREEN)
    r.judge('GE-02 단건 파일 실행 통과 — 카운터만 푼다', c.verdict, '리셋/vitest-green-좁힘',
      { note: '단건 통과는 전체 회귀 증거가 아니다 (M11 Backlog 40)' })
    r.check('GE-02b 좁힌 실행은 lastGreen을 쓰지 않는다', lastGreen() === null, JSON.stringify(lastGreen()))
  }
  {
    const c = collect('ge', 'npm test -- -t "가드 우회면"', VITEST_FULL_GREEN)
    r.judge('GE-03 이름 필터(-t) 실행 통과', c.verdict, '무기록/전체-실행-아님',
      { note: '필터가 걸린 실행은 전체가 아니다' })
  }
  {
    const c = collect('ge', 'npm test | tail -5', VITEST_FULL_GREEN)
    r.judge('GE-04 파이프로 잘린 출력', c.verdict, '무기록/판정-불능',
      { note: '잘린 꼬리에 실패 표기가 있었을 수 있다 — fail-closed' })
  }
  {
    const c = collect('ge', 'npm run test:hooks', VITEST_FULL_GREEN)
    r.judge('GE-05 다른 스크립트(test:hooks)', c.verdict, '무기록/전체-실행-아님',
      { note: 'vitest 전체 스위트가 아니다' })
  }
  {
    // 출력 형태만 바꾸는 인자는 전체 실행을 깨지 않는다 — `--` 구분자 자체는 필터가 아니다
    const c = collect('ge', 'npm test -- --reporter=dot', VITEST_FULL_GREEN)
    r.judge('GE-08 리포터 인자만 붙은 전체 실행', c.verdict, 'green-기록/vitest-green',
      { note: '대상·필터가 아니라 출력 형태 인자다' })
  }

  // ---- ② 증거 오염 (ANSI) --------------------------------------------------
  {
    const c = collect('ge', 'npm test', ANSI_GREEN)
    r.judge('GE-06 ANSI 섞인 전체 Green의 채집 판정', c.verdict, 'green-기록/vitest-green')
    const ev = lastGreen()?.evidence ?? null
    r.check('GE-06b lastGreen.evidence에 제어 문자가 없다', typeof ev === 'string' && !ev.includes(ESC),
      `실측 ${JSON.stringify(ev)}`)
    r.check('GE-06c lastGreen.evidence가 요약 줄 원문을 담는다', typeof ev === 'string' && /Test Files\s+411 passed/.test(ev),
      `실측 ${JSON.stringify(ev)}`)
  }

  // ---- 회귀 불변식 — Red은 증거가 아니다 -----------------------------------
  {
    const c = collect('ge', 'npm run test', VITEST_FULL_RED)
    r.judge('GE-07 전체 실행 Red', c.verdict, '무기록/vitest-red', { note: '회귀 불변식' })
  }

  // ---- 저장 파일로 넘어간 출력 (M03-3 · M05-12 · M07-4) -----------------------
  {
    const big = H.path('persisted-out.txt')
    const persisted = (session, command, fileText) => {
      H.write(big, fileText)
      return { ...bash(session, command, 'Output too large (140KB). Full output saved to file.'),
        tool_response: { stdout: 'Output too large (140KB). Full output saved to file.', stderr: '', interrupted: false, persistedOutputPath: big, persistedOutputSize: fileText.length } }
    }
    const runP = (payload) => {
      H.write(STATE, JSON.stringify({ schema: 2, global: null, sessions: {} }, null, 2) + '\n')
      return H.run(HOOK, payload).seen('tdd-guard')
    }
    const dots = '·'.repeat(5000) + '\n'
    r.judge('GE-09 persisted 출력의 전체 Green', runP(persisted('ge', 'npm test', dots + VITEST_FULL_GREEN)), 'green-기록/vitest-green')
    r.judge('GE-09b persisted 출력의 앞쪽 실패 표기', runP(persisted('ge', 'npm test', VITEST_FULL_RED + dots + VITEST_FULL_GREEN)), '무기록/vitest-red')
    r.judge('GE-09c persisted 파일이 없으면 판정 불능', runP({ ...persisted('ge', 'npm test', ''), tool_response: { stdout: 'x', persistedOutputPath: H.path('없는-파일.txt') } }), '무기록/판정-불능')
  }

  // ---- 좁힌 실행 (M11 Backlog 40) — 실패 0인 요약이면 카운터만 푼다 ----------------
  {
    const seed = (streak) => H.write(STATE, JSON.stringify({ schema: 2, global: null, sessions: { ge: { streak, at: Date.now() } } }, null, 2) + '\n')
    const streakOf = () => { try { return H.readJson(STATE).sessions?.ge?.streak ?? null } catch { return null } }
    const narrow = (command, stdout) => { seed(2); return H.run(HOOK, bash('ge', command, stdout)).seen('tdd-guard') }
    r.judge('GE-10 `npm test -- <경로>` 통과', narrow('npm test -- 02_Project/01_TestCode/main', VITEST_SINGLE_GREEN), '리셋/vitest-green-좁힘')
    r.check('GE-10b 카운터가 0이 되고 lastGreen은 없다', streakOf() === 0 && lastGreen() === null, `streak ${streakOf()} · ${JSON.stringify(lastGreen())}`)
    r.judge('GE-11 좁힌 실행 Red', narrow('npx vitest run 02_Project/01_TestCode/main', VITEST_FULL_RED), '무기록/vitest-red')
    r.check('GE-11b Red는 카운터를 풀지 않는다', streakOf() === 2, `streak ${streakOf()}`)
    r.judge('GE-12 파이프 붙은 좁힌 실행은 그대로 판정 불능', narrow('npx vitest run x.test.ts | tail -3', VITEST_SINGLE_GREEN), '무기록/판정-불능')
    const NODE_GREEN = '✔ a (1ms)\nℹ tests 3\nℹ suites 0\nℹ pass 3\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\n'
    const NODE_RED = '✖ a (1ms)\nℹ tests 3\nℹ pass 2\nℹ fail 1\nℹ cancelled 0\n'
    r.judge('GE-13 현황판 `node --test` 통과', narrow('node --test 99_Others/Dashboard/test/chime.test.mjs', NODE_GREEN), '리셋/node-test-green-좁힘')
    r.check('GE-13b 현황판 통과도 카운터를 푼다', streakOf() === 0, `streak ${streakOf()}`)
    r.judge('GE-13c 현황판 `node --test` 실패', narrow('node --test', NODE_RED), '무기록/node-test-red')
    r.judge('GE-13d 훅 시험(`node .claude/hooks/x.test.mjs`)은 채집 대상이 아니다', narrow('node .claude/hooks/smoke.test.mjs', NODE_GREEN), '무발화')
    // `--test`는 스크립트 앞의 node 옵션일 때만 시험 실행이다 — 요약 줄을 찍는 스크립트로 카운터를 풀지 못한다
    const FAKE = '# pass 1\n# fail 0\n'
    for (const [id, cmd, aim] of [
      ['GE-13e', 'node C:/scratch/fake.mjs --test', '스크립트 뒤의 --test'],
      ['GE-13f', 'node -e "x" --test', '-e 뒤의 --test'],
      ['GE-13g', 'node --test -e "x"', '--test 뒤의 -e'],
      ['GE-13h', 'node --test -p "x"', '--test 뒤의 -p'],
    ]) {
      const v = narrow(cmd, FAKE)
      r.check(`${id} ${aim}(\`${cmd}\`)은 카운터를 풀지 않는다`, !v.startsWith('리셋') && streakOf() === 2, `실측 ${v} · streak ${streakOf()}`)
    }
    r.judge('GE-13i 옵션이 앞선 `node --test-reporter=dot --test <경로>`는 시험 실행이다',
      narrow('node --test-reporter=dot --test 99_Others/Dashboard/test/chime.test.mjs', NODE_GREEN), '리셋/node-test-green-좁힘')
  }

  // ---- 상대 경로의 기준과 PASS 추기 대상의 표기 (M03-19) ----------------------
  {
    H.write(STATE, JSON.stringify({ schema: 2, global: null, sessions: {} }, null, 2) + '\n')
    const sub = H.run(HOOK, {
      session_id: 'cw', hook_event_name: 'PostToolUse', tool_name: 'Edit', cwd: H.path('02_Project'),
      tool_input: { file_path: join('..', '.claude', 'hooks', 'probe.cjs'), old_string: 'a', new_string: 'b' },
    })
    r.judge('CW-01 cwd 기준 상대 경로의 소스 편집을 센다', sub.seen('tdd-guard'), '통과/연속-미달', { note: '02_Project에서 ..\\.claude\\hooks\\probe.cjs' })
    const file = sub.of('tdd-guard')[0]?.evidence?.file ?? null
    r.check('CW-01b 그 대상은 .claude/hooks/probe.cjs로 읽힌다', file === '.claude/hooks/probe.cjs', JSON.stringify(file))
    if (process.platform === 'win32') {
      const fx = H.path('.claude', 'hooks', 'fixtures', 'tdd-phase-source.md')
      const msys = `/${fx[0].toLowerCase()}/${fx.slice(3).split('\\').join('/')}`
      const res = H.run(HOOK, {
        session_id: 'vg', hook_event_name: 'PreToolUse', tool_name: 'Edit', cwd: H.mirror,
        tool_input: { file_path: msys, old_string: '- (기록 없음)', new_string: '- (기록 없음)\n- PASS 2026-11-21T00:00 — 프로브' },
      })
      r.judge('VG-01 `/c/…` 꼴의 source Phase PASS 추기 — Green 없이는 막힌다', res.seen('tdd-guard'), 'deny/green-증거-부재', { note: msys })
    }
  }

  // ---- 하위 에이전트·작업 폴더·확장자 (M11 Backlog 8 · M07-33) --------------------
  {
    const edit = (ev, file, agent) => ({
      session_id: 'sc', hook_event_name: ev, tool_name: 'Edit', cwd: H.mirror,
      tool_input: { file_path: file, old_string: 'a', new_string: 'b' }, ...(agent ? { agent_id: agent, agent_type: 'worker' } : {}),
    })
    const narrowGreen = (agent) => ({ ...bash('sc', 'npx vitest run 02_Project/01_TestCode/x.test.ts', VITEST_SINGLE_GREEN), ...(agent ? { agent_id: agent } : {}) })
    const SRC = H.path('02_Project', '00_Source', 'main', 'probe.ts')
    const seen = (p) => H.run(HOOK, p).seen('tdd-guard')
    H.write(STATE, JSON.stringify({ schema: 2, global: null, sessions: {} }, null, 2) + '\n')
    seen(edit('PostToolUse', SRC, 'a1')); seen(edit('PostToolUse', SRC, 'a1'))
    r.judge('AG-01 워커 a1의 셋째 소스 편집은 막힌다', seen(edit('PreToolUse', SRC, 'a1')), 'deny/테스트-미동반-차단')
    r.judge('AG-02 같은 세션의 메인 편집은 a1의 카운터를 쓰지 않는다', seen(edit('PreToolUse', SRC, null)), '무발화')
    seen(narrowGreen('a2'))
    r.judge('AG-03 다른 워커 a2의 초록은 a1의 카운터를 풀지 않는다', seen(edit('PreToolUse', SRC, 'a1')), 'deny/테스트-미동반-차단')
    seen(narrowGreen('a1'))
    r.judge('AG-04 a1 자신의 초록은 a1의 카운터를 푼다', seen(edit('PreToolUse', SRC, 'a1')), '무발화')
    seen(edit('PostToolUse', SRC, 'a3')); seen(edit('PostToolUse', SRC, 'a3'))
    seen(edit('PostToolUse', H.path('02_Project', '01_TestCode', 'main', 'probe.test.ts'), 'a4'))
    r.judge('AG-05 다른 워커의 시험 편집은 a3의 카운터를 풀지 않는다', seen(edit('PreToolUse', SRC, 'a3')), 'deny/테스트-미동반-차단')

    const WT = (...p) => H.path('.claude', 'worktrees', 'w1', ...p)
    r.judge('WT-01 작업 폴더 아래 시험 편집은 시험이다', seen(edit('PostToolUse', WT('02_Project', '01_TestCode', 'main', 'x.test.ts'), 'w')), '리셋/테스트-편집')
    r.judge('WT-02 작업 폴더 아래 소스 편집은 소스다', seen(edit('PostToolUse', WT('02_Project', '00_Source', 'main', 'x.ts'), 'w')), '통과/연속-미달')
    r.judge('WT-03 작업 폴더 아래 훅 시험도 시험이다', seen(edit('PostToolUse', WT('.claude', 'hooks', 'x.test.mjs'), 'w')), '리셋/테스트-편집')
    r.judge('CS-01 CSS 편집은 소스로 세지 않는다', seen(edit('PostToolUse', H.path('99_Others', 'Dashboard', 'public', 'styles.css'), 'c')), '무발화')
    // 카운터에서만 빠진다 — 전체 Green 뒤의 CSS 편집은 여전히 PASS 추기 증거를 실효시킨다
    seen({ ...bash('sc', 'npm test', VITEST_FULL_GREEN) })
    seen(edit('PostToolUse', H.path('02_Project', '00_Source', 'renderer', 'x.css'), null))
    const passAdd = {
      session_id: 'sc', hook_event_name: 'PreToolUse', tool_name: 'Edit', cwd: H.mirror,
      tool_input: { file_path: H.path('.claude', 'hooks', 'fixtures', 'tdd-phase-source.md'), old_string: '- (기록 없음)', new_string: '- (기록 없음)\n- PASS 2026-11-21T00:00 — 프로브' },
    }
    r.judge('CS-02 전체 Green 뒤 CSS 편집 — PASS 추기 증거가 실효한다', seen(passAdd), 'deny/green-실효')
  }

  // ---- 차단 문구가 채집되는 실행 꼴과 시험 경로를 알려 준다 (M02-6 · M05-23 · M05-60) ----
  {
    const SRC = H.path('02_Project', '00_Source', 'main', 'probe.ts')
    H.write(STATE, JSON.stringify({ schema: 2, global: null, sessions: { msg: { streak: 2, at: Date.now() } } }, null, 2) + '\n')
    const res = H.run(HOOK, { session_id: 'msg', hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: SRC, old_string: 'a', new_string: 'b' } })
    let reason = ''
    try { reason = JSON.parse(res.stdout).hookSpecificOutput.permissionDecisionReason } catch { /* 아래에서 실패 */ }
    for (const [id, needle] of [
      ['MS-01', 'npm test -- --no-color --reporter=dot'], ['MS-02', 'npx vitest run'], ['MS-03', '파이프'],
      ['MS-04', '.claude/hooks/'], ['MS-05', '99_Others/Dashboard/test/'], ['MS-06', 'node --test'],
    ]) r.check(`${id} 차단 문구에 「${needle}」`, reason.includes(needle), reason)
  }
} finally {
  H.cleanup()
}

process.exit(r.summary())
