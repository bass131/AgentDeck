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
    r.judge('GE-02 단건 파일 실행 통과', c.verdict, '무기록/전체-실행-아님',
      { note: '단건 통과는 전체 회귀 증거가 아니다' })
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
} finally {
  H.cleanup()
}

process.exit(r.summary())
