#!/usr/bin/env node
// 스폰하지 않고 직접 고치는 경로에도 헌법 7조의 기계 집행 자리를 둔다 — 판정 ①(계획 규격)·②(실패 카운터)·③(결정 대장 주도권)을
// 편집 경로에 건다. 판정부는 _lib/plan-verdict.cjs 한 모듈을 공유한다.
// 계약 —
//   ① 저장소 안이고 `01_Milestones` 밖인 대상은 계획 ①②③을 통과해야 편집이 열린다.
//   ② `01_Milestones` 안의 대상은 계획 상태와 무관하게 열린다 — 계획을 쓰는 편집을 막으면 교착이다.
//   ③ 저장소 밖의 대상은 관할이 아니다.
//   ④ 판정 ④(라우팅)는 분업 규격이라 거부 사유에서 빼고 로그 필드로만 남긴다.
//   ⑤ 판정할 수 없으면 거부다 — 포인터 결손·planPath 형식 오류·대상 경로 없음. 단 ②③의 표면 판정이 먼저다.
// 역할 신호(agent_id·agent_type)는 읽지 않는다 — fork도 메인도 같은 판정이다. 판정 근거는 미러 hook-log 줄과 stdout뿐이다.
import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRunner } from './_lib/runner.mjs'
import { createGateHarness, REPO_ROOT } from './_lib/gate-harness.mjs'

const r = createRunner('편집 경로 계획 게이트 (31_edit-plan-gate)')
const H = createGateHarness()
const HOOK = '31_edit-plan-gate.cjs'
const PIN = '.claude/hooks/fixtures/work-pin-fresh.md'
const SESSION = 'edit-plan-gate-probe'
const SOURCE_TARGET = ['02_Project', '00_Source', 'main', 'index.ts']

// 한 케이스 = planPath 설정 + 편집 PreToolUse 1건. 판정은 추가된 edit-plan-gate 줄과 stdout뿐이다.
function judge(planPath, targetAbs, payloadExtra = {}) {
  H.setConfig({ planPath, workPinPath: PIN })
  const res = H.run(HOOK, {
    session_id: SESSION, hook_event_name: 'PreToolUse', tool_name: 'Edit',
    tool_input: { file_path: targetAbs, old_string: 'a', new_string: 'b' },
    ...payloadExtra,
  })
  const mine = res.of('edit-plan-gate')
  let reason = null
  try { reason = JSON.parse(res.stdout).hookSpecificOutput.permissionDecisionReason } catch { /* allow는 무출력 */ }
  return {
    verdict: mine.map((l) => `${l.verdict}/${l.rule}`).join(', ') || '무발화',
    lines: mine.length,
    reason: reason || '',
    evidence: mine[0]?.evidence ?? null,
    line: mine[0] ?? null,
  }
}

// 판정 ①②③을 통과하는 파일 구획 — 실계획을 픽스처로 쓰면 그 계획이 닫히거나 FAIL이 쌓일 때 이 시험이 함께 빨개진다.
function writeValidPartition() {
  const dir = '.claude/hooks/fixtures/partition-valid-probe'
  mkdirSync(H.path(...dir.split('/')), { recursive: true })
  writeFileSync(H.path(...dir.split('/'), '_MilestonePreview.md'), [
    '# 픽스처 — 유효한 파일 구획', '', '- 상태: 실행 중', '',
    '## 사람용 개요', '', '- 편집 게이트 통과 경로의 표적.', '',
    '## 개요', '', '- **목표**: 판정 ①②③을 통과한다.', '',
    '## 결정 대장', '', '- [USER] 픽스처 (2026-11-21)', '',
  ].join('\n'))
  writeFileSync(H.path(...dir.split('/'), '01_Phase_1.md'), [
    '## Phase 1 — 픽스처 · 태그: `hooks` · 의존: 없음', '', '검증 기록', '', '- (기록 없음)', '',
  ].join('\n'))
  return `${dir}/_MilestonePreview.md`
}

// 9 Phase 단일 파일 계획 — 판정 ①②③은 통과하고 ④(Phase 수 상한 8)만 걸리는 픽스처다.
function writeOverflowPlan() {
  const rel = '.claude/hooks/fixtures/plan-phase-overflow.md'
  const phases = []
  for (let n = 1; n <= 9; n++) {
    phases.push([
      `## Phase ${n} — 넘침 픽스처 ${n} · 태그: \`hooks\` · 의존: 없음`, '',
      '**목표**: Phase 수 상한 초과만을 겨눈다.', '',
      '검증 기록', '',
      `- PASS 2026-11-11T06:00:00+09:00 — 픽스처 자체 점검 ${n}`, '',
    ].join('\n'))
  }
  const text = [
    '# M99 — 프로브 픽스처: Phase 9개 (라우팅 상한 초과)', '',
    '- 마일스톤: M99 (라우팅 판정 프로브) · 작성: 2026-11-11 · 상태: 실행 중', '',
    '## 개요', '',
    '- **목표**: 판정 ④만 걸리는 계획에서 편집 경로 게이트가 거부하지 않는지 실측한다.', '',
    phases.join('\n'),
    '## 결정 대장', '',
    '- [USER] 프로브: 이 픽스처는 Phase 9개 케이스다 (2026-11-11)', '',
  ].join('\n')
  writeFileSync(H.path(...rel.split('/')), text)
  return rel
}

try {
  // 편집 대상 파일은 실존할 필요가 없다 — 이 게이트는 경로의 소속만 보고 대상 내용은 읽지 않는다.
  const src = H.path(...SOURCE_TARGET)

  // ① 거부 — 저장소 안 · 01_Milestones 밖 · 계획이 유효하지 않다
  for (const [id, planPath, expect, needle, aim] of [
    ['EP-01', '.claude/hooks/fixtures/plan-fail3.md', 'deny/실패-카운터', 'FAIL 3회', '판정 ② 실패 카운터'],
    ['EP-02', '.claude/hooks/fixtures/plan-ai-majority.md', 'deny/주도권-문답분기', '주도권 게이트 발동', '판정 ③ 결정 대장 주도권'],
    ['EP-03', '.claude/hooks/fixtures/plan-no-ledger.md', 'deny/대장-부재', '결정 대장 절이 없다', '판정 ③ 대장 부재'],
    ['EP-04', '.claude/hooks/fixtures/partition-preview-only/_MilestonePreview.md', 'deny/검증-미통과', 'Phase 구획이 없다', '판정 ① 계획 규격'],
    ['EP-05', '.claude/hooks/fixtures/plan-그런-파일-없음.md', 'deny/계획-문서-부재', '계획 문서를 읽을 수 없다', '판정 ① 계획 문서 부재'],
  ]) {
    const c = judge(planPath, src)
    r.judge(`${id} ${aim}`, c.verdict, expect, { note: '저장소 안 · 01_Milestones 밖 대상' })
    r.check(`${id}b ${aim}의 거부 사유가 판정을 지목한다`, c.reason.includes(needle),
      `기대 「${needle}」 포함 · 실측 ${JSON.stringify(c.reason.slice(0, 90))}`)
    r.check(`${id}c 판정 줄이 hook-log에 1건 남는다`, c.lines === 1, `실측 ${c.lines}건`)
    r.check(`${id}d 편집 거부 사유가 스폰을 말하지 않는다`, !c.reason.includes('스폰'), `실측 ${JSON.stringify(c.reason)}`)
  }

  // ② 허용 — 유효한 계획
  {
    const c = judge(writeValidPartition(), src)
    r.judge('EP-06 유효한 파일 구획 계획', c.verdict, 'allow/통과', { note: '판정 ①②③ 통과 — 편집을 연다' })
    r.check('EP-06b 통과 줄의 evidence에 라우팅 필드가 실린다', !!c.evidence?.routing?.route,
      `실측 ${JSON.stringify(c.evidence?.routing ?? null)}`)
  }

  // ② 허용 — 01_Milestones 안의 대상은 계획 상태와 무관하다
  {
    const plan = H.path('01_Milestones', 'M03_Harness_Refresh', '02_Phase_2.md')
    const c = judge('.claude/hooks/fixtures/plan-fail3.md', plan)
    r.judge('EP-07 01_Milestones 안의 대상 (FAIL 3회 계획)', c.verdict, 'allow/계획-표면',
      { note: '계획을 쓰는 편집을 계획 게이트가 막으면 교착이다' })
  }

  // ③ 허용 — 저장소 밖의 대상은 관할이 아니다
  {
    const outside = join(tmpdir(), 'edit-plan-gate-outside.txt')
    const c = judge('.claude/hooks/fixtures/plan-fail3.md', outside)
    r.judge('EP-08 저장소 밖의 대상 (FAIL 3회 계획)', c.verdict, 'allow/저장소-밖', { note: '관할 밖' })
  }

  // ④ 라우팅은 거부 사유가 아니다
  {
    const c = judge(writeOverflowPlan(), src)
    r.judge('EP-09 Phase 9개 (판정 ④만 걸리는 계획)', c.verdict, 'allow/라우팅-로그전용',
      { note: '라우팅은 분업 규격 — 거부 사유에서 빼고 로그로만 남긴다' })
    r.check('EP-09b 라우팅 권고가 evidence에 실린다', (c.evidence?.routingAdvisory ?? '').includes('Phase 수'),
      `실측 ${JSON.stringify(c.evidence?.routingAdvisory ?? null)}`)
  }

  // 역할 신호는 읽지 않는다
  {
    const asWorker = judge('.claude/hooks/fixtures/plan-fail3.md', src,
      { agent_id: 'edit-plan-gate-agent', agent_type: 'worker' })
    r.judge('EP-10 역할 신호(agent_id·agent_type)가 실린 같은 입력', asWorker.verdict, 'deny/실패-카운터',
      { note: 'fork도 메인도 워커도 같은 판정이다 — 역할은 읽지 않는다' })
    const keys = [...Object.keys(asWorker.line ?? {}), ...Object.keys(asWorker.evidence ?? {})]
    r.check('EP-10b 판정 줄과 evidence에 역할 필드가 없다',
      asWorker.line !== null && !keys.some((k) => ['role', 'agent_id', 'agent_type'].includes(k)),
      `실측 키 ${JSON.stringify(keys)}`)
  }

  // fail-open 세 경로 — 포인터 결손(종결된 M01 계획으로 떨어지는 길), 문자열이 아닌 planPath, 대상 경로 없음은 모두 거부여야 한다.
  // M01 계획 폴더를 미러에 둬 그 옛 기본값이 실제로 읽히는 상태를 만든다.
  cpSync(join(REPO_ROOT, '01_Milestones', 'M01_Bootstrap'), H.path('01_Milestones', 'M01_Bootstrap'), { recursive: true })
  const VALID = '.claude/hooks/fixtures/plan-body-fail-narrative.md' // 판정 ①②③ 통과 픽스처 (smoke와 같다)
  function judgeRaw(prepare, toolName, toolInput, hook = HOOK, hookTag = 'edit-plan-gate') {
    prepare()
    const payload = { session_id: SESSION, hook_event_name: 'PreToolUse', tool_name: toolName }
    if (toolInput !== undefined) payload.tool_input = toolInput
    const res = H.run(hook, payload)
    const mine = res.of(hookTag)
    let reason = ''
    try { reason = JSON.parse(res.stdout).hookSpecificOutput.permissionDecisionReason || '' } catch { /* allow는 무출력 */ }
    return { verdict: mine.map((l) => `${l.verdict}/${l.rule}`).join(', ') || '무발화', reason }
  }
  const noConfig = () => rmSync(H.configFile, { force: true })
  const config = (obj) => () => H.setConfig(obj)
  const brokenConfig = () => H.write(H.configFile, '{"planPath": ')
  const editAt = (p) => ({ file_path: p, old_string: 'a', new_string: 'b' })

  for (const [id, prepare, expect, needle, aim] of [
    ['EP-11', noConfig, 'deny/계획-포인터-결손', 'gate-config.json', 'gate-config.json 부재'],
    ['EP-12', brokenConfig, 'deny/계획-포인터-결손', 'JSON', 'gate-config.json 파손'],
    ['EP-13', config({ workPinPath: PIN }), 'deny/계획-포인터-결손', 'planPath', 'planPath 키 없음'],
    ['EP-13b', config({ planPath: '', workPinPath: PIN }), 'deny/계획-포인터-결손', 'planPath', 'planPath 빈 문자열'],
    ['EP-14', config({ planPath: 42, workPinPath: PIN }), 'deny/계획-포인터-형식', '문자열이 아니다', 'planPath가 숫자'],
  ]) {
    const c = judgeRaw(prepare, 'Edit', editAt(src))
    r.judge(`${id} ${aim}`, c.verdict, expect, { note: '종전: M01 계획으로 떨어지거나 내부 오류로 허용 (fail-open)' })
    r.check(`${id}x ${aim}의 거부 사유가 결손을 지목한다`, c.reason.includes(needle),
      `기대 「${needle}」 포함 · 실측 ${JSON.stringify(c.reason.slice(0, 90))}`)
  }
  for (const [id, tool, input, aim] of [
    ['EP-15', 'Edit', { old_string: 'a', new_string: 'b' }, 'Edit 입력에 file_path가 없다'],
    ['EP-15b', 'Write', undefined, 'tool_input 자체가 없다'],
    ['EP-15c', 'NotebookEdit', { new_source: 'x' }, 'NotebookEdit 입력에 notebook_path가 없다'],
    ['EP-15d', 'Edit', { file_path: '', old_string: 'a', new_string: 'b' }, 'file_path가 빈 문자열'],
  ]) {
    const c = judgeRaw(config({ planPath: VALID, workPinPath: PIN }), tool, input)
    r.judge(`${id} ${aim}`, c.verdict, 'deny/대상-없음', { note: '종전: 무대상 허용 (fail-open)' })
  }

  // 정상 경로 회귀 불변식 — 편집 도구 네 종의 실제 대상 필드를 대상으로 읽는다 (대상 없음 오판 금지)
  for (const [id, tool, input] of [
    ['EP-16', 'Edit', editAt(src)],
    ['EP-17', 'Write', { file_path: src, content: 'x' }],
    ['EP-18', 'MultiEdit', { file_path: src, edits: [{ old_string: 'a', new_string: 'b' }] }],
    ['EP-19', 'NotebookEdit', { notebook_path: H.path('02_Project', 'probe.ipynb'), new_source: 'x' }],
  ]) {
    const c = judgeRaw(config({ planPath: VALID, workPinPath: PIN }), tool, input)
    r.judge(`${id} ${tool}의 대상 필드 · 유효한 계획`, c.verdict, 'allow/통과', { note: '정상 편집은 열린다' })
  }
  {
    const inPlan = judgeRaw(noConfig, 'Edit', editAt(H.path('01_Milestones', 'M03_Harness_Refresh', '04_Phase_4.md')))
    r.judge('EP-20 포인터 부재 · 01_Milestones 안의 대상', inPlan.verdict, 'allow/계획-표면',
      { note: '포인터가 깨져도 계획·기록 표면은 열린다 — 복구 경로' })
    const outside = judgeRaw(noConfig, 'Edit', editAt(join(tmpdir(), 'edit-plan-gate-outside.txt')))
    r.judge('EP-21 포인터 부재 · 저장소 밖의 대상', outside.verdict, 'allow/저장소-밖', { note: '관할 밖' })
    const spawn = judgeRaw(noConfig, 'Task', {}, '20_plan-gate.cjs', 'plan-gate')
    r.judge('EP-22 포인터 부재 · 스폰 게이트(판정부 공유)', spawn.verdict, 'deny/계획-포인터-결손',
      { note: '판정부를 함께 쓰는 스폰 자리도 종결된 계획으로 떨어지지 않는다' })
  }

  // 주도권 판정 ③은 마일스톤 스펙 대장과 합쳐 센다 — 헌법 11조에서 사람의 합의는 마일스톤 스펙 대장에 모이고 goal 대장은 [AI] 위주다.
  // 계획 문서와 같은 폴더의 `00_마일스톤-스펙.md`(01_Milestones 안) 대장만 합친다 — 머리말의 경로 글자는 읽지 않는다
  // (다른 마일스톤 스펙을 가리켜 [USER]를 빌려 오는 길). 스펙이 없거나 밖이거나 대장 절이 없으면 goal 대장만 센다.
  // [AI·비가역]은 어느 대장에 있든 즉시 발동이다.
  {
    const SPEC = '00_마일스톤-스펙.md'
    const writeRel = (rel, text) => {
      mkdirSync(dirname(H.path(...rel.split('/'))), { recursive: true })
      writeFileSync(H.path(...rel.split('/')), text)
    }
    const spec = (dir, lines, heading = '## 결정 대장') =>
      writeRel(`${dir}/${SPEC}`, ['# M99 — 스펙 픽스처', '', heading, '', ...lines, ''].join('\n'))
    const goal = (dir, name, lines, headerSpec = `${dir}/${SPEC}`) => {
      const rel = `${dir}/${name}.md`
      writeRel(rel, [
        `# M99 — 프로브 픽스처: 주도권 합산 (${name})`, '',
        `- 마일스톤: M99 (마일스톤 스펙 \`${headerSpec}\`) · 작성: 2026-11-19 · 상태: 실행 중`, '',
        '## 목표', '', '- 주도권 판정이 마일스톤 스펙 대장을 합쳐 세는지 실측한다.', '',
        '## Phase 1 — 픽스처 · 태그: `hooks` · 의존: 없음', '',
        '검증 기록', '', '- PASS 2026-11-19T16:00:00+09:00 — 픽스처 자체 점검', '',
        '## 결정 대장', '', ...lines, '',
      ].join('\n'))
      return rel
    }
    const AI2 = ['- [AI] 프로브 결정 하나 (2026-11-19)', '- [AI] 프로브 결정 둘 (2026-11-19)']
    const USER2 = ['- [USER] 스펙 합의 (2026-11-19)', '- [USER·위임] 실주행 대행 (2026-11-19)']
    spec('01_Milestones/M99_Probe', USER2)

    const mergedRel = goal('01_Milestones/M99_Probe', '10_Goal-G1', AI2)
    const merged = judge(mergedRel, src)
    r.judge('EP-23 goal [AI] 2 · 같은 폴더 스펙 [USER] 2 — 합쳐 세면 통과', merged.verdict, 'allow/통과',
      { note: 'goal 대장만 세면 거부되던 꼴(M09 G6 [AI] 2 > [USER] 0)' })
    r.check('EP-23b 통과 줄 tally에 스펙 경로와 수가 실린다',
      merged.evidence?.tally?.spec?.path === `01_Milestones/M99_Probe/${SPEC}` && merged.evidence?.tally?.spec?.USER === 1 && merged.evidence?.tally?.spec?.['USER·위임'] === 1,
      `실측 ${JSON.stringify(merged.evidence?.tally?.spec ?? null)}`)

    const missing = judge(goal('01_Milestones/M97_Probe', '10_Goal-G1', AI2), src)
    r.judge('EP-24 같은 폴더에 스펙 없음 — goal 대장만 센다', missing.verdict, 'deny/주도권-문답분기', { note: '닫힌 쪽' })

    spec('.claude/hooks/fixtures/spec-outside', USER2)
    const outside = judge(goal('.claude/hooks/fixtures/spec-outside', 'goal', AI2), src)
    r.judge('EP-25 계획과 스펙이 01_Milestones 밖 — 세지 않는다', outside.verdict, 'deny/주도권-문답분기')

    const borrowed = judge(goal('01_Milestones/M96_Probe', '10_Goal-G1', AI2, `01_Milestones/M99_Probe/${SPEC}`), src)
    r.judge('EP-26 머리말이 다른 마일스톤 스펙을 가리켜도 빌려 오지 않는다', borrowed.verdict, 'deny/주도권-문답분기',
      { note: '이전 goal을 복사해 경로가 남은 꼴(독립 검수 중요 2)' })

    const irrev = judge(goal('01_Milestones/M99_Probe', '20_Goal-irrev', ['- [AI·비가역] 프로브 비가역 (2026-11-19)']), src)
    r.judge('EP-27 goal의 [AI·비가역]은 스펙 [USER]와 무관하게 즉시 발동', irrev.verdict, 'deny/주도권-즉시발동')

    spec('01_Milestones/M98_Probe', ['- [USER] 하나 (2026-11-19)', '- [AI] 스펙 쪽 AI 하나 (2026-11-19)', '- [AI] 스펙 쪽 AI 둘 (2026-11-19)'])
    const specAi = judge(goal('01_Milestones/M98_Probe', '10_Goal-G1', ['- [AI] 프로브 (2026-11-19)']), src)
    r.judge('EP-28 스펙의 [AI]도 함께 센다 — 합계 [AI] 3 > [USER] 1', specAi.verdict, 'deny/주도권-문답분기',
      { note: '원칙 2를 마일스톤 단위로 지킨다' })

    spec('01_Milestones/M95_Probe', [...USER2, '- [USER] 셋 (2026-11-19)', '- [AI·비가역] 스펙 쪽 비가역 (2026-11-19)'])
    const specIrrev = judge(goal('01_Milestones/M95_Probe', '10_Goal-G1', ['- [USER] goal 쪽 (2026-11-19)']), src)
    r.judge('EP-29 스펙 대장의 [AI·비가역]도 즉시 발동', specIrrev.verdict, 'deny/주도권-즉시발동',
      { note: '독립 검수 중요 1' })

    spec('01_Milestones/M94_Probe', USER2, '## 다른 절')
    const noLedger = judge(goal('01_Milestones/M94_Probe', '10_Goal-G1', AI2), src)
    r.judge('EP-30 스펙에 결정 대장 절이 없으면 세지 않는다', noLedger.verdict, 'deny/주도권-문답분기')

    const self = judge(goal('01_Milestones/M93_Probe', SPEC.replace(/\.md$/, ''), AI2), src)
    r.judge('EP-31 계획 자신이 스펙 이름이면 두 번 세지 않는다', self.verdict, 'deny/주도권-문답분기')

    const spawn = judgeRaw(config({ planPath: mergedRel, workPinPath: PIN }), 'Task', {}, '20_plan-gate.cjs', 'plan-gate')
    r.judge('EP-32 스폰 게이트(판정부 공유)도 스펙과 합쳐 센다', spawn.verdict, 'allow/통과')
  }

  // 포인터 전환 — planPath를 다른 goal 문서로 바꾸는 편집은 지나가고, 뒤 편집은 새 계획을 따른다
  // gate-config.json은 01_Milestones 밖이라 바꾸는 편집이 지금 계획으로 판정된다. goal을 닫은(상태: 종결) 뒤의
  // 전환도 지나가야 한다 — 막히면 다음 goal로 넘어가는 길이 잠긴다.
  {
    const writeRel = (rel, text) => {
      mkdirSync(dirname(H.path(...rel.split('/'))), { recursive: true })
      writeFileSync(H.path(...rel.split('/')), text)
    }
    const goalDoc = (rel, status) => {
      writeRel(rel, [
        '# M99 — 포인터 전환 픽스처', '',
        `- 마일스톤: M99 · 작성: 2026-11-21 · 상태: ${status}`, '',
        '## 목표', '', '- 포인터 전환이 지나가는지 본다.', '',
        '## Phase 1 — 픽스처 · 태그: `harness` · 의존: 없음', '',
        '검증 기록', '', '- (기록 없음)', '',
        '## 결정 대장', '', '- [USER] 프로브 (2026-11-21)', '',
      ].join('\n'))
      return rel
    }
    const A = goalDoc('01_Milestones/M99_Switch/10_Goal-A.md', '실행 중')
    const B = goalDoc('01_Milestones/M99_Switch/20_Goal-B.md', '실행 중')
    const A_DONE = goalDoc('01_Milestones/M99_Switch/30_Goal-A-done.md', '종결(goal PR 1, 로컬 병합 `0000000`, 2026-11-21)')
    const FAIL3 = '.claude/hooks/fixtures/plan-fail3.md'
    const cfgText = (planPath) => JSON.stringify({ planPath, workPinPath: PIN }, null, 2) + '\n'
    const switchBy = (tool, from, to) => {
      H.write(H.configFile, cfgText(from))
      const input = tool === 'Write'
        ? { file_path: H.configFile, content: cfgText(to) }
        : { file_path: H.configFile, old_string: `"planPath": "${from}"`, new_string: `"planPath": "${to}"` }
      const c = judgeRaw(() => {}, tool, input)
      H.write(H.configFile, cfgText(to)) // 편집 도구가 적용한 뒤의 디스크
      return c
    }
    const after = () => judgeRaw(() => {}, 'Edit', editAt(src))

    for (const [id, tool, from, to, aim] of [
      ['PS-01', 'Edit', A, B, '실행 중 goal → 다음 goal (Edit)'],
      ['PS-02', 'Write', A, B, '실행 중 goal → 다음 goal (Write)'],
      ['PS-03', 'Edit', A_DONE, B, '종결한 goal → 다음 goal (Edit)'],
      ['PS-04', 'Write', A_DONE, B, '종결한 goal → 다음 goal (Write)'],
    ]) {
      const c = switchBy(tool, from, to)
      r.check(`${id} ${aim} — 전환 편집이 지나간다`, c.verdict.startsWith('allow/'), `실측 ${c.verdict} · ${c.reason.slice(0, 90)}`)
      r.judge(`${id}b 전환 뒤 01_Milestones 밖 편집은 새 계획(유효)을 따른다`, after().verdict, 'allow/통과')
    }
    {
      const c = switchBy('Edit', A, FAIL3)
      r.check('PS-05 실행 중 goal → FAIL 3회 계획 — 전환 편집은 지나간다', c.verdict.startsWith('allow/'), `실측 ${c.verdict}`)
      r.judge('PS-05b 전환 뒤 01_Milestones 밖 편집은 새 계획의 거부를 따른다', after().verdict, 'deny/실패-카운터')
    }
    {
      const c = switchBy('Edit', FAIL3, B)
      r.judge('PS-06 FAIL 3회 계획에서의 전환은 풀리지 않는다', c.verdict, 'deny/실패-카운터',
        { note: '전환 예외는 종결 판정에만 — 실패 카운터를 포인터 편집으로 피하지 못한다' })
    }
    {
      const A_DONE2 = goalDoc('01_Milestones/M99_Switch/40_Goal-done2.md', '종결')
      const c = switchBy('Edit', A_DONE, A_DONE2)
      r.judge('PS-07 종결한 goal → 다른 종결 goal — 전환이 지나가지 않는다', c.verdict, 'deny/계획-종결')
      r.judge('PS-09 종결한 goal → 01_Milestones 밖의 유효한 픽스처 — 전환이 지나가지 않는다',
        switchBy('Edit', A_DONE, VALID).verdict, 'deny/포인터-전환-범위', { note: '닫힌 뒤의 예외는 다음 goal 문서로만 연다' })
      const outsidePlan = join(tmpdir(), 'edit-plan-gate-outside-plan.md').split('\\').join('/')
      r.judge('PS-10 종결한 goal → 저장소 밖 절대 경로 — 전환이 지나가지 않는다',
        switchBy('Write', A_DONE, outsidePlan).verdict, 'deny/포인터-전환-범위')
      r.check('PS-11 종결한 goal → 같은 저장소 01_Milestones의 절대 경로 — 지나간다',
        switchBy('Write', A_DONE, H.path(...B.split('/')).split('\\').join('/')).verdict.startsWith('allow/'), '')
      if (process.platform === 'win32') {
        // 범위 판정과 계획 읽기가 같은 정규화 경로를 본다 — `/c/…`를 `C:\c\…`로 읽으면 저장소 밖 문서가 판정한다
        const msysOf = (rel) => { const a = H.path(...rel.split('/')); return `/${a[0].toLowerCase()}/${a.slice(3).split('\\').join('/')}` }
        const c12 = switchBy('Write', A_DONE, msysOf(B))
        r.judge('PS-12 종결한 goal → `/c/…` 꼴의 다음 goal — 저장소 안 실문서로 판정해 지나간다', c12.verdict, 'allow/포인터-전환', { note: c12.reason.slice(0, 90) })
        r.judge('PS-12b `/c/…` 포인터 뒤의 01_Milestones 밖 편집은 그 실문서를 따른다', after().verdict, 'allow/통과')
        const F3_IN = '01_Milestones/M99_Switch/70_Goal-fail3.md'
        writeRel(F3_IN, readFileSync(H.path(...FAIL3.split('/')), 'utf8'))
        r.judge('PS-13 `/c/…` 꼴의 FAIL 3회 실문서 — 그 문서의 거부를 따른다', switchBy('Write', A_DONE, msysOf(F3_IN)).verdict, 'deny/실패-카운터')
        const c14 = switchBy('Write', A_DONE, msysOf('01_Milestones/M99_Switch/80_absent.md'))
        r.judge('PS-14 `/c/…` 꼴의 없는 문서 — 저장소 밖 동명 사본으로 열지 않는다', c14.verdict, 'deny/계획-문서-부재')
      }
      rmSync(H.configFile, { force: true })
      const broken = judgeRaw(() => {}, 'Write', { file_path: H.configFile, content: cfgText(B) })
      r.judge('PS-08 포인터 결손 중 gate-config 쓰기 — 사용자 복구(M03-26 닫음 판단)', broken.verdict, 'deny/계획-포인터-결손')
    }

    // 「상태: 종결」 계획 — 머리말의 상태만 읽는다
    {
      const done = judge(A_DONE, src)
      r.judge('EP-33 상태: 종결인 계획 — 01_Milestones 밖 편집 거부', done.verdict, 'deny/계획-종결')
      r.check('EP-33b 거부 사유가 종결과 다음 계획 전환을 말한다', done.reason.includes('종결') && done.reason.includes('planPath'),
        `실측 ${JSON.stringify(done.reason.slice(0, 120))}`)
      const spawn = judgeRaw(config({ planPath: A_DONE, workPinPath: PIN }), 'Task', {}, '20_plan-gate.cjs', 'plan-gate')
      r.judge('EP-33c 스폰 게이트(판정부 공유)도 종결 계획을 거부', spawn.verdict, 'deny/계획-종결')
      const inBody = goalDoc('01_Milestones/M99_Switch/50_Goal-body.md', '실행 중')
      writeFileSync(H.path(...inBody.split('/')), readFileSync(H.path(...inBody.split('/')), 'utf8')
        .replace('- (기록 없음)', '- (기록 없음)\n\n앞 goal의 상태: 종결 — 본문 서술은 머리말이 아니다'))
      r.judge('EP-33d 본문의 「상태: 종결」 서술은 읽지 않는다', judge(inBody, src).verdict, 'allow/통과')
      r.judge('EP-33e 승인 완료(M02 꼴)는 종결이 아니다', judge(goalDoc('01_Milestones/M99_Switch/60_Goal-ok.md', '승인 완료 (2026-08-10)'), src).verdict, 'allow/통과')
    }
  }

  // 포인터 BOM·충돌 표지
  {
    const VALID_JSON = JSON.stringify({ planPath: VALID, workPinPath: PIN }, null, 2) + '\n'
    const bom = judgeRaw(() => H.write(H.configFile, '\uFEFF' + VALID_JSON), 'Edit', editAt(src))
    r.judge('EP-34 BOM 붙은 gate-config — 내용이 맞으면 통과', bom.verdict, 'allow/통과', { note: 'PowerShell 5.1 UTF-8 저장은 BOM을 붙인다' })
    const conflicted = [
      '{', '<<<<<<< HEAD', `  "planPath": "${VALID}",`, '=======', '  "planPath": "01_Milestones/x.md",', '>>>>>>> other', `  "workPinPath": "${PIN}"`, '}', '',
    ].join('\n')
    const cf = judgeRaw(() => H.write(H.configFile, conflicted), 'Edit', editAt(src))
    r.judge('EP-35 충돌 표지가 든 gate-config — 충돌로 거부', cf.verdict, 'deny/계획-포인터-충돌')
    r.check('EP-35b 거부 사유가 merge 충돌과 푸는 길을 말한다', cf.reason.includes('충돌') && cf.reason.includes('git'),
      `실측 ${JSON.stringify(cf.reason.slice(0, 160))}`)
    const planRel = '.claude/hooks/fixtures/plan-conflict-probe.md'
    H.write(H.path(...planRel.split('/')), readFileSync(H.path(...VALID.split('/')), 'utf8')
      .replace('## 결정 대장', '<<<<<<< HEAD\n줄 하나\n=======\n줄 둘\n>>>>>>> other\n\n## 결정 대장'))
    const pc = judge(planRel, src)
    r.judge('EP-36 충돌 표지가 든 계획 문서 — 충돌로 거부', pc.verdict, 'deny/계획-충돌-표지')
  }

  // 경로 표기 정규화 — 표기만 바꾼 저장소 안 경로가 「저장소 밖」 허용으로 새지 않는다 ----
  {
    const FAIL3 = '.claude/hooks/fixtures/plan-fail3.md'
    const dotted = judge(FAIL3, H.path('..probe.ts'))
    r.judge('EP-37 `..`으로 시작하는 파일 이름은 저장소 안이다', dotted.verdict, 'deny/실패-카운터')
    const rel = judge(FAIL3, SOURCE_TARGET.join('/'))
    r.judge('EP-38 상대 경로는 저장소 뿌리 기준이다', rel.verdict, 'deny/실패-카운터')
    const fromSub = judge(FAIL3, join('..', '.claude', 'settings.json'), { cwd: H.path('02_Project') })
    r.judge('EP-38b 상대 경로는 훅 입력의 cwd 기준이다', fromSub.verdict, 'deny/실패-카운터', { note: '02_Project에서 ..\\.claude\\settings.json' })
    r.check('EP-38c 그 대상은 .claude/settings.json으로 읽힌다', fromSub.evidence?.file === '.claude/settings.json', JSON.stringify(fromSub.evidence?.file))
    if (process.platform === 'win32') {
      r.judge('EP-39 `\\\\?\\` 접두 경로', judge(FAIL3, `\\\\?\\${src}`).verdict, 'deny/실패-카운터')
      const msys = `/${src[0].toLowerCase()}/${src.slice(3).split('\\').join('/')}`
      r.judge('EP-40 `/c/…` 경로', judge(FAIL3, msys).verdict, 'deny/실패-카운터', { note: msys })
      let short = ''
      try { short = execSync(`cmd /d /c for %I in ("${H.mirror}") do @echo %~sI`, { encoding: 'utf8' }).trim() } catch { /* 아래에서 건너뜀 */ }
      if (short && short.toLowerCase() !== H.mirror.toLowerCase()) {
        r.judge('EP-41 8.3 짧은 이름 경로', judge(FAIL3, join(short, ...SOURCE_TARGET)).verdict, 'deny/실패-카운터', { note: short })
        r.judge('EP-41b 8.3 짧은 이름의 01_Milestones', judge(FAIL3, join(short, '01_Milestones', 'x.md')).verdict, 'allow/계획-표면')
      } else {
        console.log(`  skip EP-41 8.3 짧은 이름이 없는 볼륨 (${H.mirror})`)
      }
    }
    r.judge('EP-42 정말 저장소 밖은 여전히 관할 밖', judge(FAIL3, join(dirname(H.mirror), 'other-repo', 'x.ts')).verdict, 'allow/저장소-밖')
  }

  // 격리 — 미러 밖으로 새지 않는다
  r.check('격리 — 미러가 실저장소 밖이다', !H.mirror.startsWith(REPO_ROOT), H.mirror)
  const liveLog = join(REPO_ROOT, '98_Management', '01_GateState', 'hook-log.jsonl')
  const liveHits = existsSync(liveLog)
    ? readFileSync(liveLog, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter((l) => l && l.session === SESSION).length
    : 0
  r.check('격리 — live hook-log에 합성 세션 줄이 0건이다', liveHits === 0, `${liveHits}건`)
} finally {
  H.cleanup()
}

process.exit(r.summary())
