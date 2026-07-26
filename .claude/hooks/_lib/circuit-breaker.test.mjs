// .claude/hooks/_lib/circuit-breaker.test.mjs
// 폭주 감지의 판정 축을 "도구 총량"에서 "(주체, 도구, 대상) 반복"으로 넓힌 회귀 테스트
// (2026-07-26, 영호 결정 — maxTurns 폐기의 짝).
//
// 왜 축을 바꾸는가 — 실측 근거:
//   같은 날 정상 작업이 5분 안에 Edit 15회를 찍었다(에이전트 정의 10개 일괄 수정).
//   폭주가 아니라 정당한 작업인데, 도구 총량만 세는 판정으로는 폭주와 구분되지 않는다.
//   같은 15회를 **대상별로** 쪼개면 파일당 1~2회라 전혀 이상하지 않다.
//   ⇒ 폭주의 신호는 "얼마나 많이 했나"가 아니라 **"진전이 있나"** 이고,
//      진전 없음은 *같은 대상을 반복하는 것*으로 나타난다.
//
// 부수 효과: 읽기 도구 면제(`Bash|Read|Grep|Glob|Task` 즉시 통과)의 근거였던
//   "비파괴 도구는 정당한 대량 반복이라 제외"가 대상 축에서는 성립하지 않는다 —
//   같은 파일을 10번 읽는 것은 정당한 반복이 아니다. 그래서 읽기 도구도 대상 축에서는 감시한다.
//   이것이 중요한 이유: 읽기 전용 역할(chief-tech-operator·reviewer·plan-auditor·coordinator)은
//   도구 목록이 정확히 그 면제 목록이라 **지금까지 폭주 감지가 0이었다**.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, appendFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOKS_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

/** 등급별 총량 임계: 단순 5 / 보통 10 / 복잡 15 / 대규모 20. 대상 축 임계는 등급 무관 10. */
function makeSandbox(grade = '대규모') {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agentdeck-cb-'))
  mkdirSync(path.join(root, '.claude', 'state'), { recursive: true })
  cpSync(HOOKS_DIR, path.join(root, '.claude', 'hooks'), {
    recursive: true,
    filter: (src) => !/node_modules/.test(src),
  })
  writeFileSync(
    path.join(root, '.claude', 'state', 'current-pin.txt'),
    `PHASE: 테스트 / 등급: ${grade} / 깃발: none\n`,
  )
  return root
}

function fire(root, payload) {
  const r = spawnSync('bash', [path.join(root, '.claude', 'hooks', 'circuit-breaker.sh')], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  })
  return { code: r.status, stdout: r.stdout ?? '' }
}

const editOn = (file, agent) => ({
  tool_name: 'Edit', hook_event_name: 'PostToolUse', tool_input: { file_path: file }, agent_type: agent,
})
const bashOn = (cmd, agent) => ({
  tool_name: 'Bash', hook_event_name: 'PostToolUse', tool_input: { command: cmd }, agent_type: agent,
})
const readOn = (file, agent) => ({
  tool_name: 'Read', hook_event_name: 'PostToolUse', tool_input: { file_path: file }, agent_type: agent,
})

/** N회 발사하고 마지막 stdout을 돌려준다. */
function fireTimes(root, payloadAt, times) {
  let last = ''
  for (let i = 0; i < times; i += 1) last = fire(root, payloadAt(i)).stdout
  return last
}

/**
 * 로그를 N줄 부풀린다 — 누적 축(임계 100)을 실제 발사 100회로 채우면 bash 스폰만
 * 50초가 든다. 회귀 게이트가 그만큼 무거워지면 사람이 게이트를 덜 돌리게 되고,
 * 그게 게이트를 죽이는 가장 흔한 경로다.
 *
 * ⚠️ **포맷을 테스트가 베끼지 않는다.** 훅이 방금 쓴 마지막 줄을 읽어 템플릿으로 삼고,
 *    마지막 필드(대상키)만 흩는다 — 대상을 흩지 않으면 대상 축이 먼저 발화해 누적 축을
 *    가린다. 로그 포맷이 바뀌면 이 부풀리기가 무효가 되어 카운트가 차지 않고 테스트가
 *    red가 되므로, 상수·포맷을 복제해 조용히 어긋나는 함정(ADR-038 개정 2의 교훈)에
 *    걸리지 않는다.
 */
function inflateLog(root, times) {
  const p = path.join(root, '.claude', 'state', 'circuit-breaker.log')
  const lines = readFileSync(p, 'utf8').trim().split('\n')
  const tpl = lines[lines.length - 1].split(' ')
  const extra = []
  for (let i = 0; i < times; i += 1) {
    const f = [...tpl]
    f[f.length - 1] = `seed${i}`
    extra.push(f.join(' '))
  }
  appendFileSync(p, `${extra.join('\n')}\n`)
}

test('같은 대상을 반복하면 발화한다 — 진전 없음의 신호', () => {
  const root = makeSandbox()
  try {
    const out = fireTimes(root, () => editOn('C:/proj/02_Source/a.ts', 'renderer'), 10)
    assert.match(out, /같은 대상/, '같은 파일 10회 편집은 진전 없는 반복이므로 알려야 한다')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('⭐ 대상이 흩어져 있으면 발화하지 않는다 — 2026-07-26 정상 작업 실측의 회귀 고정', () => {
  const root = makeSandbox() // 대규모 = 총량 임계 20
  try {
    const out = fireTimes(root, (i) => editOn(`C:/proj/02_Source/f${i}.ts`, 'renderer'), 12)
    assert.doesNotMatch(out, /circuit-breaker/,
      '서로 다른 12개 파일을 고치는 것은 폭주가 아니다 — 여기서 발화하면 경보 피로가 생겨 진짜 신호를 무시하게 된다')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('읽기 도구도 대상 축에서는 감시한다 — 읽기 전용 역할의 감지 공백을 메운다', () => {
  const root = makeSandbox()
  try {
    const out = fireTimes(root, () => readOn('C:/proj/00_Documents/ADR.md', 'chief-tech-operator'), 10)
    assert.match(out, /같은 대상/,
      '같은 파일을 10번 읽는 것은 정당한 반복이 아니다. 이 경로가 막혀 있어서 읽기 전용 역할엔 폭주 감지가 0이었다')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('주체가 다르면 카운터가 섞이지 않는다 — 병렬 서브에이전트 오탐 방지', () => {
  const root = makeSandbox()
  try {
    fireTimes(root, () => editOn('C:/proj/02_Source/a.ts', 'renderer'), 6)
    const out = fireTimes(root, () => editOn('C:/proj/02_Source/a.ts', 'main-process'), 6)
    assert.doesNotMatch(out, /circuit-breaker/,
      '서로 다른 두 에이전트가 각각 6회씩 한 것을 12회로 합산하면 정상 병렬 작업이 폭주로 잡힌다')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ── [C] 누적 체크포인트 축 (2026-07-26 CTO 검토 R1 봉합) ──────────────────────
// 발견: 앞의 두 축에는 Bash 크기의 구멍이 있다. Bash의 대상 키는 **명령 문자열 전체**의
// 체크섬이라 명령이 한 글자만 달라도 카운터가 갈라지고(대상 축 무력), 총량 축은 Bash를
// 아예 면제한다. 그래서 "매번 조금씩 다른 명령을 시도하는 진전 없는 루프"는 두 축 어디에도
// 안 걸린다. 위협 모델이 악의가 아니라 성실한 드리프트라 해도, 드리프트의 가장 흔한 형태가
// 정확히 이것이다.
//
// ⭐ 왜 "진전 판정"이 아니라 **체크포인트**인가:
//   총량으로 진전을 판정하려는 시도가 바로 `maxTurns`가 실패한 방식이다. 그래서 이 축은
//   판정하지 않는다 — 누적이 일정 단위에 닿을 때마다 **상황을 알리고 판단을 사람과
//   에이전트 자신에게 넘긴다.** 임계가 다소 틀려도 피해는 경보 피로뿐이고, 알림을 받은
//   에이전트가 "슬슬 정리해 보고하자"고 자기 조절할 여지가 생긴다.
//
// 임계 100의 근거(2026-07-26 실측 — `.claude/state/circuit-breaker.log`):
//   정상 장기 작업인 `chief-tech-operator`의 마일스톤 검토가 16분에 53회, 메인 세션이
//   60분에 49회였다. 100은 그 약 2배라 CTO급 작업이 한 번 받을까 말까 한 빈도다.
test('⭐ 매번 다른 Bash 명령은 누적 축에서만 잡힌다 — CTO 검토 R1이 지목한 구멍', () => {
  const root = makeSandbox()
  try {
    // 1회 실제 발사로 로그 템플릿을 만들고 97줄을 부풀려 98회분을 쌓는다.
    fire(root, bashOn('git log --oneline -1', 'renderer'))
    inflateLog(root, 97)

    // 99회째 — 임계 미달이라 조용해야 한다. 두 축 어디에도 안 걸리는 이 구간이 바로 그 구멍이다.
    const quiet = fire(root, bashOn('git status -sb', 'renderer')).stdout
    assert.doesNotMatch(quiet, /circuit-breaker/, '99회는 임계 미달이므로 조용해야 한다')

    // 100회째 — 여기서 울리지 않으면, 명령이 매번 다른 진전 없는 루프는 영원히 안 잡힌다.
    const out = fire(root, bashOn('git diff --stat', 'renderer')).stdout
    assert.match(out, /누적/,
      '명령이 매번 달라 대상 축이 갈라지고 Bash는 총량 축 면제라, 누적 축이 없으면 이 루프는 어디에도 안 걸린다')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('누적 축도 주체별로 센다 — 병렬 서브에이전트를 합산하지 않는다', () => {
  const root = makeSandbox()
  try {
    fire(root, bashOn('npm run probe -- --seed=0', 'qa'))
    inflateLog(root, 58) // qa 59회
    fire(root, bashOn('npm run probe -- --seed=0', 'reviewer'))
    inflateLog(root, 58) // reviewer 59회 (템플릿 = 방금 쓴 reviewer 줄)

    const out = fire(root, bashOn('npm run probe -- --seed=99', 'reviewer')).stdout
    assert.doesNotMatch(out, /누적/,
      '서로 다른 두 에이전트의 59+60을 119로 합산하면 정상 병렬 작업이 임계를 넘긴다')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('기존 총량 판정은 회귀 없이 남는다 — 두 축은 서로 다른 폭주를 잡는다', () => {
  const root = makeSandbox('단순') // 총량 임계 5
  try {
    const out = fireTimes(root, (i) => editOn(`C:/proj/02_Source/g${i}.ts`, 'renderer'), 5)
    assert.match(out, /circuit-breaker/,
      '대상이 흩어져 있어도 총량이 등급 임계를 넘으면 기존 판정이 발화해야 한다')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
