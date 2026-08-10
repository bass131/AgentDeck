#!/usr/bin/env node
// 코어 훅 일곱 종 스모크 러너 (M01 Phase 4) — npm run test:hooks에 편입된다.
//
// 규율 하나: 이 러너는 실저장소의 98_Management/01_GateState/를 절대 건드리지 않는다.
// 시작할 때 OS 임시 폴더에 미러(훅 + fixtures + 계획 문서 + gate-config)를 만들고, 모든 훅을
// CLAUDE_PROJECT_DIR=<미러>로 구동한 뒤, 끝나면 미러를 통째로 지운다. 훅이 만드는 상태 파일과
// hook-log.jsonl은 전부 미러 안에서 나고 죽는다.
//
// 판정 근거는 두 가지뿐이다 — 훅의 stdout(차단 JSON)과 미러 hook-log.jsonl에 추가된 줄.
// 각 케이스는 「어떤 합성 입력에 어떤 판정 줄이 나와야 하는가」를 이름으로 말한다.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { mkdtempSync, mkdirSync, cpSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIRROR = mkdtempSync(join(tmpdir(), 'agentdeck-hook-smoke-'))
const GATE_DIR = join(MIRROR, '98_Management', '01_GateState')
const LOG_FILE = join(GATE_DIR, 'hook-log.jsonl')
const CONFIG_FILE = join(GATE_DIR, 'gate-config.json')
const FIX = join(MIRROR, '.claude', 'hooks', 'fixtures')
const hook = (n) => join(MIRROR, '.claude', 'hooks', n)

const REAL_PLAN = '01_Milestones/M01_Bootstrap/_MilestonePreview.md'
const REAL_PIN = '01_Milestones/M01_Bootstrap/01_Work_Pin.md'

// ---- 미러 구축 -------------------------------------------------------------
function buildMirror() {
  cpSync(join(REPO, '.claude', 'hooks'), join(MIRROR, '.claude', 'hooks'), { recursive: true })
  cpSync(join(REPO, '01_Milestones', 'M01_Bootstrap'), join(MIRROR, '01_Milestones', 'M01_Bootstrap'), { recursive: true })
  mkdirSync(GATE_DIR, { recursive: true })
  setConfig({ planPath: REAL_PLAN, workPinPath: REAL_PIN })
}
function setConfig(obj) { writeFileSync(CONFIG_FILE, JSON.stringify(obj, null, 2) + '\n') }

// ---- 판정 보조 -------------------------------------------------------------
let failed = 0
function check(label, ok, detail) {
  if (ok) console.log(`  ok   ${label}`)
  else { failed++; console.error(`  FAIL ${label}${detail ? ' — ' + detail : ''}`) }
}
function logLines() {
  try { return readFileSync(LOG_FILE, 'utf8').split('\n').filter(l => l.trim() !== '') }
  catch { return [] }
}
function run(script, payload, cliArgs) {
  const before = logLines().length
  const env = { ...process.env, CLAUDE_PROJECT_DIR: MIRROR }
  delete env.MOODIE_SESSION_ROLE // 역할 신호 오염 방지 — 합성 입력은 스스로 역할을 말해야 한다
  const r = spawnSync(process.execPath, [script, ...(cliArgs || [])], {
    input: payload === null ? '' : JSON.stringify(payload), cwd: MIRROR, env, encoding: 'utf8',
  })
  const added = logLines().slice(before).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', added }
}
// 훅 이름으로 거른 추가 줄 중 verdict·rule이 맞는 줄 하나를 요구한다
function expectLine(label, res, hookName, verdict, rule, extra) {
  const mine = res.added.filter(l => l.hook === hookName)
  const hit = mine.find(l => l.verdict === verdict && (rule === null || l.rule === rule) && (!extra || extra(l)))
  const seen = mine.map(l => `${l.verdict}/${l.rule}`).join(', ') || '무발화'
  check(label, res.code === 0 && !!hit, `기대 ${verdict}/${rule ?? '*'} · 실측 ${seen} · exit ${res.code}`)
  return hit
}
function expectSilent(label, res, hookName) {
  const mine = res.added.filter(l => l.hook === hookName)
  check(label, res.code === 0 && mine.length === 0 && res.stdout === '',
    `기대 무발화 · 실측 ${mine.map(l => `${l.verdict}/${l.rule}`).join(', ') || '없음'} · stdout ${JSON.stringify(res.stdout.slice(0, 60))}`)
}
function denyPayload(res) {
  try { return JSON.parse(res.stdout).hookSpecificOutput.permissionDecision } catch { return null }
}
function blockReason(res) {
  try { const o = JSON.parse(res.stdout); return o.decision === 'block' ? o.reason : null } catch { return null }
}

// ---- 합성 입력 -------------------------------------------------------------
const edit = (session, event, file, oldS, newS, extra) => ({
  session_id: session, hook_event_name: event, tool_name: 'Edit',
  tool_input: { file_path: file, old_string: oldS, new_string: newS }, ...extra,
})
const bashOut = (session, stdout) => ({
  session_id: session, hook_event_name: 'PostToolUse', tool_name: 'Bash', cwd: MIRROR,
  tool_input: { command: 'npm run test' }, tool_response: { stdout },
})
const GREEN_OUT = ' RUN  vitest\n\n Test Files  405 passed | 6 skipped (411)\n      Tests  5454 passed (5460)\n'
const RED_OUT = ' RUN  vitest\n\n Test Files  2 failed | 403 passed (405)\n      Tests  3 failed | 5451 passed\n'
const PASS_OLD = '- (기록 없음)'
const PASS_NEW = '- (기록 없음)\n- PASS 2026-08-10T00:00 — 스모크 모의 통과 (픽스처)'

// ============================================================================
try {
  buildMirror()
  console.log(`미러: ${MIRROR}`)

  // ---- 10_start-brief (SessionStart) --------------------------------------
  console.log('\n10_start-brief — 재개 프로토콜')
  {
    const H = hook('10_start-brief.cjs')
    let r = run(H, { session_id: 'smoke-10', source: 'startup' })
    const ctx = (() => { try { return JSON.parse(r.stdout).hookSpecificOutput.additionalContext } catch { return '' } })()
    expectLine('생존 문서 4종 실존 → allow', r, 'start-brief', 'allow', null)
    check('브리프에 결손 경고가 없다', !ctx.includes('⚠️ 결손'), ctx.slice(0, 120))
    check('브리프에 work-pin 전문이 재부착된다', ctx.includes('--- work-pin 전문 ---'))

    setConfig({ planPath: '01_Milestones/없는계획/_MilestonePreview.md', workPinPath: REAL_PIN })
    r = run(H, { session_id: 'smoke-10b', source: 'startup' })
    const ctx2 = (() => { try { return JSON.parse(r.stdout).hookSpecificOutput.additionalContext } catch { return '' } })()
    expectLine('계획 포인터 결손 → 결손 판정', r, 'start-brief', '결손', null)
    check('결손 경고 줄이 브리프에 실린다', ctx2.includes('⚠️ 결손'))

    setConfig({ planPath: REAL_PLAN, workPinPath: REAL_PIN })
    r = run(H, { session_id: 'smoke-10c', source: 'resume' })
    const ctx3 = (() => { try { return JSON.parse(r.stdout).hookSpecificOutput.additionalContext } catch { return '' } })()
    check('--resume 기동에 경고 줄이 주입된다', ctx3.includes('--resume'))
  }

  // ---- 20_plan-gate (PreToolUse: Task|Agent) ------------------------------
  console.log('\n20_plan-gate — 스폰 게이트 판정 4종')
  {
    const H = hook('20_plan-gate.cjs')
    const spawn = { session_id: 'smoke-20', hook_event_name: 'PreToolUse', tool_name: 'Task', tool_input: {} }
    setConfig({ planPath: REAL_PLAN, workPinPath: REAL_PIN })
    let r = run(H, spawn)
    expectLine('실계획(M01 파일 구획) → allow', r, 'plan-gate', 'allow', '통과')
    check('통과는 무출력이다 (일반 권한 흐름 유지)', r.stdout === '', JSON.stringify(r.stdout.slice(0, 80)))

    const denyCases = [
      ['plan-fail3.md — FAIL 3회 누적', '.claude/hooks/fixtures/plan-fail3.md', '실패-카운터'],
      ['plan-no-ledger.md — 결정 대장 부재', '.claude/hooks/fixtures/plan-no-ledger.md', '대장-부재'],
      ['plan-unverified.md — 검증 기록 절 부재', '.claude/hooks/fixtures/plan-unverified.md', '검증-미통과'],
      ['plan-ai-majority.md — [AI] 과반', '.claude/hooks/fixtures/plan-ai-majority.md', '주도권-문답분기'],
      ['partition-preview-only — 규격 불충족', '.claude/hooks/fixtures/partition-preview-only/_MilestonePreview.md', '검증-미통과'],
      ['partition-no-tag — 규격 불충족', '.claude/hooks/fixtures/partition-no-tag/_MilestonePreview.md', '검증-미통과'],
      ['partition-no-record — 규격 불충족', '.claude/hooks/fixtures/partition-no-record/_MilestonePreview.md', '검증-미통과'],
      ['partition-no-human-overview — 사람용 개요 부재', '.claude/hooks/fixtures/partition-no-human-overview/_MilestonePreview.md', '검증-미통과'],
    ]
    for (const [label, planPath, rule] of denyCases) {
      setConfig({ planPath, workPinPath: REAL_PIN })
      const res = run(H, spawn)
      expectLine(label, res, 'plan-gate', 'deny', rule)
      check(`${label} (deny JSON)`, denyPayload(res) === 'deny', JSON.stringify(res.stdout.slice(0, 80)))
    }
    // 사람용 개요 부재는 반려 사유까지 귀속돼야 한다 (블랙박스 방지 검사의 회귀)
    setConfig({ planPath: '.claude/hooks/fixtures/partition-no-human-overview/_MilestonePreview.md', workPinPath: REAL_PIN })
    const rh = run(H, spawn)
    check('사람용 개요 반려 사유가 명시된다', /사람용 개요/.test(rh.stdout), rh.stdout.slice(0, 120))

    setConfig({ planPath: '.claude/hooks/fixtures/plan-body-fail-narrative.md', workPinPath: REAL_PIN })
    r = run(H, spawn)
    expectLine('본문 FAIL 서술 3줄은 집계되지 않는다 → allow', r, 'plan-gate', 'allow', '통과')
  }

  // ---- 30_role-gate (PreToolUse: 편집 도구) --------------------------------
  console.log('\n30_role-gate — 실행 게이트 (분업 1)')
  {
    const H = hook('30_role-gate.cjs')
    const pre = (file, extra) => ({ session_id: 'smoke-30', hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: file === null ? {} : { file_path: file }, ...extra })
    let r = run(H, pre(join(MIRROR, '01_Milestones', 'M01_Bootstrap', '01_Work_Pin.md')))
    expectLine('메인 + 01_Milestones → allow (허용 표면)', r, 'role-gate', 'allow', '허용-표면')

    r = run(H, pre(join(MIRROR, '02_Project', '00_Source', 'main', 'index.ts')))
    expectLine('메인 + 소스 → deny (구현 차단)', r, 'role-gate', 'deny', '분업-1-구현-차단')
    check('메인 소스 편집 deny JSON', denyPayload(r) === 'deny')

    r = run(H, pre(join(MIRROR, '02_Project', '00_Source', 'main', 'index.ts'), { agent_id: 'agt_smoke', agent_type: 'general-purpose' }))
    expectLine('워커(agent_id) + 소스 → allow', r, 'role-gate', 'allow', '워커-허용')

    r = run(H, pre(null))
    expectLine('대상 경로 없음 → deny (fail-closed)', r, 'role-gate', 'deny', '대상-불명')

    r = run(H, pre(join(tmpdir(), 'smoke-outside-probe.txt')))
    expectLine('저장소 경계 밖 → allow (관할 밖)', r, 'role-gate', 'allow', '경계-밖')
  }

  // ---- 33_tdd-guard --------------------------------------------------------
  console.log('\n33_tdd-guard — 검증형 · 휴리스틱 · Green 채집')
  {
    const H = hook('33_tdd-guard.cjs')
    const SRC = join(FIX, 'tdd-phase-source.md')
    const HOOKS_MD = join(FIX, 'tdd-phase-hooks.md')
    const passEdit = (sid, ev, file) => edit(sid, ev, file, PASS_OLD, PASS_NEW)

    let r = run(H, passEdit('smoke-33a', 'PreToolUse', SRC))
    expectLine('source 태그 PASS 추기 + Green 없음 → deny', r, 'tdd-guard', 'deny', 'green-증거-부재')
    check('Green 부재 deny JSON', denyPayload(r) === 'deny')

    r = run(H, bashOut('smoke-33a', GREEN_OUT))
    expectLine('vitest Green 실측 → 증거 기록', r, 'tdd-guard', 'green-기록', 'vitest-green')

    r = run(H, passEdit('smoke-33a', 'PreToolUse', SRC))
    expectLine('Green 증거 유효 → allow', r, 'tdd-guard', 'allow', 'green-유효')

    r = run(H, passEdit('smoke-33a', 'PreToolUse', HOOKS_MD))
    expectLine('hooks 태그 Phase의 PASS 추기 → 관할 밖 allow', r, 'tdd-guard', 'allow', '비대상-태그')

    const SRC_TS = join(MIRROR, '02_Project', '00_Source', 'renderer', 'probe.ts')
    const TEST_TS = join(MIRROR, '02_Project', '01_TestCode', 'renderer', 'probe.test.ts')
    const srcEdit = (sid, ev) => edit(sid, ev, SRC_TS, 'const probe = 0;', 'const probe = 1;')
    r = run(H, srcEdit('smoke-33b', 'PostToolUse'))
    expectLine('테스트 미동반 소스 편집 1회 → 통과', r, 'tdd-guard', '통과', '연속-미달')
    r = run(H, srcEdit('smoke-33b', 'PostToolUse'))
    expectLine('테스트 미동반 소스 편집 2회 → 통과', r, 'tdd-guard', '통과', '연속-미달')
    r = run(H, srcEdit('smoke-33b', 'PreToolUse'))
    expectLine('3회째 시도 → deny (차단 승격)', r, 'tdd-guard', 'deny', '테스트-미동반-차단')

    r = run(H, edit('smoke-33b', 'PostToolUse', TEST_TS, 'a', 'b'))
    expectLine('02_Project/01_TestCode 편집 → 카운터 리셋 (이식 경로 회귀)', r, 'tdd-guard', '리셋', '테스트-편집')
    r = run(H, srcEdit('smoke-33b', 'PreToolUse'))
    expectSilent('리셋 뒤 소스 편집은 다시 열린다', r, 'tdd-guard')

    r = run(H, bashOut('smoke-33c', RED_OUT))
    expectLine('vitest Red → 무기록 (증거 아님)', r, 'tdd-guard', '무기록', 'vitest-red')
  }

  // ---- 40_pass-watcher -----------------------------------------------------
  console.log('\n40_pass-watcher — 자동 장전 (마감 게이트 단독)')
  {
    const H = hook('40_pass-watcher.cjs')
    const DIR = join(FIX, 'partition-auto-arm')
    const PHASE = join(DIR, '01_Phase_1.md')
    const BASE_LINE = '- PASS 2026-08-01T00:00 — 픽스처 기존 줄 (기준선)'
    const ADD_PASS = `${BASE_LINE}\n- PASS 2026-08-10T00:00 — 스모크 추기`
    const ADD_FAIL = `${BASE_LINE}\n- FAIL 2026-08-10T00:00 — 스모크 추기`
    const original = readFileSync(PHASE, 'utf8')
    setConfig({ planPath: '.claude/hooks/fixtures/partition-auto-arm/_MilestonePreview.md', workPinPath: REAL_PIN })
    const STOP_STATE = join(GATE_DIR, 'stop-gate.state.json')
    const RESET_STATE = join(GATE_DIR, 'reset-gate.state.json')

    writeFileSync(PHASE, original.replace(BASE_LINE, ADD_PASS))
    let r = run(H, edit('smoke-40', 'PostToolUse', PHASE, BASE_LINE, ADD_PASS))
    expectLine('검증 기록 PASS 추기 → 장전', r, 'pass-watcher', '장전', 'PASS-추기-감지', l => l.armedBy === 'auto')
    const stop = JSON.parse(readFileSync(STOP_STATE, 'utf8'))
    check('마감 게이트가 자기 세션 스코프에 장전된다', stop.schema === 2 && stop.sessions['smoke-40']?.armed === true, JSON.stringify(stop).slice(0, 120))
    check('리셋 상태 파일은 생기지 않는다 (이식 소거 회귀)', !existsSync(RESET_STATE))

    writeFileSync(PHASE, original.replace(BASE_LINE, ADD_FAIL))
    r = run(H, edit('smoke-40', 'PostToolUse', PHASE, BASE_LINE, ADD_FAIL))
    expectLine('검증 기록 FAIL 추기 → 무장전 (오장전 방어)', r, 'pass-watcher', '무장전', 'FAIL-추기')
    writeFileSync(PHASE, original)

    r = run(H, edit('smoke-40', 'PostToolUse', join(MIRROR, 'README.md'), 'a', 'b'))
    expectSilent('비계획 파일 편집 → 무발화 (관할 밖)', r, 'pass-watcher')

    const SINGLE = join(FIX, 'plan-auto-arm-single.md')
    const S_BASE = '- PASS 2026-08-01T00:00 — 픽스처 기존 줄 (기준선)'
    const S_ADD = `${S_BASE}\n- PASS 2026-08-10T00:00 — 스모크 추기`
    const sOriginal = readFileSync(SINGLE, 'utf8')
    setConfig({ planPath: '.claude/hooks/fixtures/plan-auto-arm-single.md', workPinPath: REAL_PIN })
    writeFileSync(SINGLE, sOriginal.replace(S_BASE, S_ADD))
    r = run(H, edit('smoke-40s', 'PostToolUse', SINGLE, S_BASE, S_ADD))
    expectLine('단일 파일 계획도 감지한다 (하위 호환)', r, 'pass-watcher', '장전', 'PASS-추기-감지')
    writeFileSync(SINGLE, sOriginal)
  }

  // ---- 41_line-limit -------------------------------------------------------
  console.log('\n41_line-limit — 250줄 상한 사후 피드백')
  {
    const H = hook('41_line-limit.cjs')
    const post = (file) => ({ session_id: 'smoke-41', hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: file } })
    let r = run(H, post(join(FIX, 'probe-251.md')))
    expectLine('251줄 산출물 → 발화', r, 'line-limit', '발화', null)
    check('발화는 decision:block으로 통보된다', /251줄/.test(blockReason(r) || ''), (blockReason(r) || '').slice(0, 100))

    r = run(H, post(join(FIX, 'tdd-phase-source.md')))
    expectLine('상한 이하 문서 → 통과', r, 'line-limit', '통과', null)

    r = run(H, post(join(MIRROR, '.claude', 'hooks', '41_line-limit.cjs')))
    expectSilent('.md가 아니면 판정 대상이 아니다', r, 'line-limit')
  }

  // ---- 50_stop-gate --------------------------------------------------------
  console.log('\n50_stop-gate — 마감 요약 게이트')
  {
    const H = hook('50_stop-gate.cjs')
    rmSync(join(GATE_DIR, 'stop-gate.state.json'), { force: true })
    setConfig({ planPath: REAL_PLAN, workPinPath: REAL_PIN })
    let r = run(H, { session_id: 'smoke-50', hook_event_name: 'Stop' })
    expectSilent('미장전 → 무로그 통과', r, 'stop-gate')

    r = run(H, null, ['arm', 'smoke'])
    check('수기 arm CLI가 돈다', r.code === 0 && /armed=true/.test(r.stdout), r.stdout.slice(0, 80))

    r = run(H, { session_id: 'smoke-50', hook_event_name: 'Stop' })
    expectLine('장전 + 낡은 스탬프 → block', r, 'stop-gate', 'block', '마감-요약-미실측')
    check('block 사유가 3줄 작성을 지시한다', /마감 요약/.test(blockReason(r) || ''), (blockReason(r) || '').slice(0, 100))

    setConfig({ planPath: REAL_PLAN, workPinPath: '.claude/hooks/fixtures/work-pin-fresh.md' })
    r = run(H, { session_id: 'smoke-50', hook_event_name: 'Stop' })
    expectLine('장전 + 새 스탬프 → allow + 자동 해제', r, 'stop-gate', 'allow', '마감-요약-실측')
    r = run(H, { session_id: 'smoke-50', hook_event_name: 'Stop' })
    expectSilent('자동 해제 후에는 다시 조용하다', r, 'stop-gate')
  }

  // ---- race-scoping 픽스처 러너 (33·40·50 세션 격리 회귀) -------------------
  console.log('\nrace-scoping — 동시 세션 격리 회귀')
  {
    const RUNNER = join(FIX, 'race-scoping', 'run.cjs')
    for (const mode of ['green', 'solo']) {
      const env = { ...process.env, CLAUDE_PROJECT_DIR: MIRROR }
      delete env.MOODIE_SESSION_ROLE
      const r = spawnSync(process.execPath, [RUNNER, mode], { cwd: MIRROR, env, encoding: 'utf8' })
      const tail = (r.stdout || '').split('\n').filter(l => l.trim()).slice(-1)[0] || ''
      check(`run.cjs ${mode} → exit 0`, r.status === 0, `exit ${r.status} · ${tail}`)
      if (r.status !== 0) console.error((r.stdout || '').split('\n').filter(l => l.startsWith('FAIL')).join('\n'))
    }
  }
} finally {
  rmSync(MIRROR, { recursive: true, force: true })
}

if (failed > 0) {
  console.error(`\n${failed}건 실패`)
  process.exit(1)
}
console.log('\n전부 통과')
