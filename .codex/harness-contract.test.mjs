import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { canaryRelative } from './harness-doctor.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const read = (repoPath) => fs.readFileSync(path.join(ROOT, repoPath), 'utf8')

// 전담 보조 계약(ADR-033 개정, 2026-07-12): 점검 subagent 2종만 잔존.
const EXPECTED_AGENTS = {
  'plan-auditor': ['gpt-5.6-sol', 'xhigh', 'agentdeck-readonly'],
  reviewer: ['gpt-5.6-sol', 'xhigh', 'agentdeck-readonly'],
}

const EXPECTED_SKILLS = ['agentdeck-review', 'harness-review']

const REMOVED_FULL_DRIVER_PROFILES = [
  'agentdeck-worker-base',
  'agentdeck-main-process',
  'agentdeck-agent-backend',
  'agentdeck-renderer',
  'agentdeck-shared-ipc',
  'agentdeck-qa',
  'agentdeck-operations',
]

function tomlString(content, key) {
  return content.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'))?.[1] ?? null
}

function tomlSection(content, header) {
  const marker = `[${header}]`
  const start = content.indexOf(marker)
  if (start < 0) return ''
  const bodyStart = start + marker.length
  const next = content.indexOf('\n[', bodyStart)
  return content.slice(bodyStart, next < 0 ? content.length : next)
}

test('Codex custom agent는 점검 2종만 잔존하고 Claude 정본 역할과 대응한다', () => {
  const codex = fs.readdirSync(path.join(ROOT, '.codex', 'agents'))
    .filter((name) => name.endsWith('.toml'))
    .map((name) => name.replace(/\.toml$/, ''))
    .sort()
  assert.deepEqual(codex, Object.keys(EXPECTED_AGENTS).sort())
  for (const [role, [model, effort, permissions]] of Object.entries(EXPECTED_AGENTS)) {
    const content = read(`.codex/agents/${role}.toml`)
    assert.equal(tomlString(content, 'name'), role, role)
    assert.equal(tomlString(content, 'model'), model, `${role} model`)
    assert.equal(tomlString(content, 'model_reasoning_effort'), effort, `${role} effort`)
    assert.equal(tomlString(content, 'default_permissions'), permissions, `${role} permissions`)
    assert.doesNotMatch(content, /^sandbox_mode\s*=/m, `${role} mixes sandbox_mode`)
    assert.ok(fs.existsSync(path.join(ROOT, '.claude', 'agents', `${role}.md`)), `${role} Claude 정본`)
  }
})

test('root는 최소권한 assistant이고 rescue는 제품 코드 한정 쓰기다', () => {
  const config = read('.codex/config.toml')
  assert.match(config, /^default_permissions\s*=\s*"agentdeck-assistant"/m)

  for (const profile of ['agentdeck-assistant', 'agentdeck-rescue', 'agentdeck-readonly']) {
    assert.match(config, new RegExp(`^\\[permissions\\.${profile}\\]`, 'm'), profile)
  }
  for (const profile of REMOVED_FULL_DRIVER_PROFILES) {
    assert.doesNotMatch(config, new RegExp(`^\\[permissions\\.${profile}\\]`, 'm'), `${profile} 잔존`)
  }

  const assistantFs = tomlSection(config, 'permissions.agentdeck-assistant.filesystem')
  assert.match(assistantFs, /^":tmpdir"\s*=\s*"write"/m)
  const assistantRoots = tomlSection(config, 'permissions.agentdeck-assistant.filesystem.":workspace_roots"')
  assert.match(assistantRoots, /"\*\*\/\.env"\s*=\s*"deny"/)
  assert.match(assistantRoots, /"\*\*\/\.env\.\*"\s*=\s*"deny"/)
  assert.match(assistantRoots, /"\*\*\/secrets\/\*\*"\s*=\s*"deny"/)

  const rescue = tomlSection(config, 'permissions.agentdeck-rescue')
  assert.match(rescue, /^\s*extends\s*=\s*"agentdeck-assistant"/m)
  const rescueRoots = tomlSection(config, 'permissions.agentdeck-rescue.filesystem.":workspace_roots"')
  assert.match(rescueRoots, /^"02\.Source"\s*=\s*"write"/m)
  assert.match(rescueRoots, /^"99\.Others\/tests"\s*=\s*"write"/m)
  assert.doesNotMatch(rescueRoots, /^"(?:00\.Documents|\.claude|\.codex|\.agents)/m)

  assert.doesNotMatch(config, /"\.codex\/state\/\*\*"\s*=\s*"write"/)
})

test('AGENTS.md는 전담 보조 계약이고 위임 조직론이 없다', () => {
  const agents = read('AGENTS.md')

  // 코어 참조 + 절대 규칙 존치
  assert.match(agents, /00\.Documents\/harness\/CORE\.md/)
  for (const clause of ['CORE-01', 'CORE-03', 'CORE-05', 'CORE-06', 'CORE-07', 'CORE-09', 'CORE-11', 'CORE-12', 'CORE-13']) {
    assert.ok(agents.includes(clause), `${clause} 참조 누락`)
  }
  assert.match(agents, /전담 보조/)
  assert.match(agents, /git add \.|git add -A/)

  // 풀 드라이버 조직론 부재
  assert.doesNotMatch(agents, /Supervisor/i)
  assert.doesNotMatch(agents, /coordinator|secretary|main-process|agent-backend|shared-ipc/)
  assert.doesNotMatch(agents, /위임 프롬프트|다섯 항목/)
  for (const removed of ['$work-plan', '$work-run', '$session-start', '$session-end', '$session-review', '$refactor-sweep']) {
    assert.equal(agents.includes(removed), false, `제거된 브리지 참조 잔존: ${removed}`)
  }
  for (const kept of ['$agentdeck-review', '$harness-review']) {
    assert.ok(agents.includes(kept), `잔존 브리지 매핑 누락: ${kept}`)
  }

  // Sol adversarial 차단 #1 봉합: 권한 진입 계약 명문화
  assert.ok(agents.includes('codex -c default_permissions="agentdeck-rescue"'), 'rescue 진입 명령 누락')
  assert.match(agents, /AGENTDECK_HARNESS_MAINTENANCE=1/)
  assert.ok(agents.includes('codex -c default_permissions=":danger-full-access"'), '유지보수 권한 전환 누락')

  // 시크릿 가드의 정직한 선언 (과장 금지)
  assert.match(agents, /부분 보장/)
  assert.match(agents, /읽기 deny는 강제하지 못/)
})

test('skill bridge는 잔존 2종뿐이고 정본 참조 래퍼다', () => {
  const actual = fs.readdirSync(path.join(ROOT, '.agents', 'skills'))
    .filter((name) => fs.existsSync(path.join(ROOT, '.agents', 'skills', name, 'SKILL.md')))
    .sort()
  assert.deepEqual(actual, [...EXPECTED_SKILLS].sort())
  assert.match(read('.agents/skills/agentdeck-review/SKILL.md'), /\.claude\/(?:commands|agents)\//)
  assert.match(read('.agents/skills/harness-review/SKILL.md'), /\.claude\/commands\/harness-review\.md/)
})

test('Claude coordinator만 Agent 위임 도구를 가지며 Worker 재귀 위임은 차단한다', () => {
  assert.match(read('.claude/agents/coordinator.md'), /^tools:.*\bAgent\b/m)
  for (const role of ['main-process', 'agent-backend', 'renderer', 'shared-ipc', 'qa']) {
    assert.doesNotMatch(read(`.claude/agents/${role}.md`), /^tools:.*\bAgent\b/m, role)
  }
})

test('Hook command definition은 현재 script SHA-256을 cachebuster로 포함한다', () => {
  const source = fs.readFileSync(path.join(ROOT, '.codex', 'hooks', 'agentdeck-hook.mjs'))
  const digest = createHash('sha256').update(source).digest('hex')
  const config = JSON.parse(read('.codex/hooks.json'))
  for (const groups of Object.values(config.hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) {
        assert.match(hook.command, new RegExp(`\\s${digest}$`))
        assert.match(hook.commandWindows, new RegExp(`\\s${digest};`))
      }
    }
  }
})

test('project-local execpolicy가 비가역 명령과 임의 다운로드를 분류한다', () => {
  const rules = read('.codex/rules/agentdeck.rules')
  for (const prefix of [
    '["git", "push"]',
    '["gh", "pr", "create"]',
    '["gh", "pr", "merge"]',
    '["gh", "release"]',
    '["npm", "run", "package"]',
    '["npm", "publish"]',
  ]) assert.ok(rules.includes(`pattern = ${prefix}`), prefix)
  assert.match(rules, /pattern\s*=\s*\["curl"\][\s\S]*?decision\s*=\s*"forbidden"/)
  assert.match(rules, /pattern\s*=\s*\["wget"\][\s\S]*?decision\s*=\s*"forbidden"/)
})

test('활성 정본과 bridge에 알려진 stale 계약이 없다', () => {
  const corpus = [
    'CLAUDE.md',
    'AGENTS.md',
    '.claude/agents/_routing.md',
    '.claude/policies/grade-and-risk.md',
    '.claude/policies/INDEX.md',
    '.claude/policies/subagent-routing.md',
    '.claude/skills/work-plan/SKILL.md',
    '.claude/commands/harness-review.md',
    '.claude/policies/pin-and-done.md',
    '.agents/skills/agentdeck-review/SKILL.md',
    '.agents/skills/harness-review/SKILL.md',
  ].map((file) => `${file}\n${read(file)}`).join('\n')

  assert.doesNotMatch(corpus, /02\.Source\/main\/agents\//)
  assert.doesNotMatch(corpus, /99\.Others\/99\.Others\/tests/)
  assert.doesNotMatch(corpus, /(?:SubAgent )?풀 8/)
  assert.doesNotMatch(corpus, /\(work\/plan\.md\)/)
  assert.doesNotMatch(corpus, /\/work:plan 호출/)
})

test('harness doctor는 static PASS와 새 세션 live PENDING을 구분한다', () => {
  const result = spawnSync(process.execPath, ['.codex/harness-doctor.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /STATIC:\s+PASS/)
  assert.match(result.stdout, /LIVE:\s+PENDING/)
  assert.match(result.stdout, /agentdeck-assistant/)
  assert.match(result.stdout, /\/hooks.*재신뢰/)
})

test('harness doctor --live는 3축(훅 가드·읽기 경계·쓰기 경계)을 정직하게 보고한다', {
  skip: process.platform !== 'win32',
}, () => {
  const result = spawnSync(process.execPath, ['.codex/harness-doctor.mjs', '--live'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120_000,
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /HOOK-GUARD:\s+PASS \(canaries 3\/3\)/)
  assert.match(result.stdout, /OS-READ-BOUNDARY:\s+UNENFORCED_EXPECTED/)
  assert.match(result.stdout, /WRITE-BOUNDARY:\s+PASS \(5\/5\)/)
  assert.match(result.stdout, /LIVE-CONFORMANCE:\s+ACCEPTED_WITH_LIMITATION/)
})

test('harness doctor --live는 child process 생성 실패를 진단 결과로 반환한다', {
  skip: process.platform !== 'win32',
}, () => {
  const result = spawnSync(process.execPath, ['.codex/harness-doctor.mjs', '--live'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, PATH: '' },
    timeout: 60_000,
  })
  assert.equal(result.status, 1)
  assert.match(result.stdout, /INDETERMINATE/)
  assert.doesNotMatch(result.stderr, /TypeError/)
})

test('doctor canary 경로는 실행별 고유 토큰을 담아 동시 실행 충돌·기존 파일 덮어쓰기를 막는다 (Sol P2)', () => {
  assert.notEqual(canaryRelative('02.Source', 'tokA'), canaryRelative('02.Source', 'tokB'))
  assert.match(canaryRelative('02.Source', 'tokA'), /02\.Source\\\.agentdeck-doctor-canary-tokA\.tmp/)
  assert.match(canaryRelative('', 'tokC'), /^\.agentdeck-doctor-canary-tokC\.tmp$/)
})
