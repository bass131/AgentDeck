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
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs'
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
const readOn = (file, agent) => ({
  tool_name: 'Read', hook_event_name: 'PostToolUse', tool_input: { file_path: file }, agent_type: agent,
})

/** N회 발사하고 마지막 stdout을 돌려준다. */
function fireTimes(root, payloadAt, times) {
  let last = ''
  for (let i = 0; i < times; i += 1) last = fire(root, payloadAt(i)).stdout
  return last
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
