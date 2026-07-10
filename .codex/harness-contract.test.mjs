import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const read = (repoPath) => fs.readFileSync(path.join(ROOT, repoPath), 'utf8')

const MODEL_TIERS = {
  'agent-backend': ['gpt-5.6-terra', 'high', 'agentdeck-workspace'],
  coordinator: ['gpt-5.6-sol', 'high', 'agentdeck-readonly'],
  'main-process': ['gpt-5.6-terra', 'medium', 'agentdeck-workspace'],
  'plan-auditor': ['gpt-5.6-sol', 'high', 'agentdeck-readonly'],
  qa: ['gpt-5.6-terra', 'medium', 'agentdeck-workspace'],
  renderer: ['gpt-5.6-terra', 'medium', 'agentdeck-workspace'],
  reviewer: ['gpt-5.6-sol', 'high', 'agentdeck-readonly'],
  secretary: ['gpt-5.6-luna', 'low', 'agentdeck-operations'],
  'shared-ipc': ['gpt-5.6-terra', 'high', 'agentdeck-workspace'],
}

function tomlString(content, key) {
  return content.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'))?.[1] ?? null
}

test('Claude 역할과 Codex custom agent 9개가 정확히 대응한다', () => {
  const claude = fs.readdirSync(path.join(ROOT, '.claude', 'agents'))
    .filter((name) => !name.startsWith('_') && name.endsWith('.md'))
    .map((name) => name.replace(/\.md$/, ''))
    .sort()
  const codex = fs.readdirSync(path.join(ROOT, '.codex', 'agents'))
    .filter((name) => name.endsWith('.toml'))
    .map((name) => name.replace(/\.toml$/, ''))
    .sort()
  assert.deepEqual(codex, Object.keys(MODEL_TIERS).sort())
  assert.deepEqual(codex, claude)
})

test('각 custom agent가 비용 계층과 permission profile을 명시한다', () => {
  for (const [role, [model, effort, permissions]] of Object.entries(MODEL_TIERS)) {
    const content = read(`.codex/agents/${role}.toml`)
    assert.equal(tomlString(content, 'name'), role, role)
    assert.equal(tomlString(content, 'model'), model, `${role} model`)
    assert.equal(tomlString(content, 'model_reasoning_effort'), effort, `${role} effort`)
    assert.equal(tomlString(content, 'default_permissions'), permissions, `${role} permissions`)
    assert.doesNotMatch(content, /^sandbox_mode\s*=/m, `${role} mixes sandbox_mode with permissions`)
  }
})

test('root는 Full Access이고 custom agent는 secret deny-read profile을 명시한다', () => {
  const config = read('.codex/config.toml')
  assert.match(config, /^default_permissions\s*=\s*":danger-full-access"/m)
  for (const profile of ['agentdeck-readonly', 'agentdeck-workspace', 'agentdeck-operations']) {
    assert.match(config, new RegExp(`^\\[permissions\\.${profile}\\]`, 'm'), profile)
  }
  assert.match(config, /"\*\*\/\.env"\s*=\s*"deny"/)
  assert.match(config, /"\*\*\/\.env\.\*"\s*=\s*"deny"/)
  assert.match(config, /"\*\*\/secrets\/\*\*"\s*=\s*"deny"/)
  assert.doesNotMatch(config, /"\.codex\/state\/\*\*"\s*=\s*"write"/)
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
    '.claude/agents/_routing.md',
    '.claude/policies/grade-and-risk.md',
    '.claude/policies/INDEX.md',
    '.claude/policies/subagent-routing.md',
    '.claude/skills/work-plan/SKILL.md',
    '.claude/commands/harness-review.md',
    '.claude/commands/harness.md',
    '.claude/policies/pin-and-done.md',
    '.agents/skills/session-review/SKILL.md',
  ].map((file) => `${file}\n${read(file)}`).join('\n')

  assert.doesNotMatch(corpus, /02\.Source\/main\/agents\//)
  assert.doesNotMatch(corpus, /99\.Others\/99\.Others\/tests/)
  assert.doesNotMatch(corpus, /(?:SubAgent )?풀 8/)
  assert.doesNotMatch(corpus, /\(work\/plan\.md\)/)
  assert.doesNotMatch(corpus, /\/work:plan 호출/)
  assert.match(read('.agents/skills/session-review/SKILL.md'), /깊은 학습.*pull session/i)
})

test('harness doctor는 static PASS와 새 세션 live PENDING을 구분한다', () => {
  const result = spawnSync(process.execPath, ['.codex/harness-doctor.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /STATIC:\s+PASS/)
  assert.match(result.stdout, /LIVE:\s+PENDING/)
  assert.match(result.stdout, /secretary.*gpt-5\.6-luna/i)
  assert.match(result.stdout, /\/hooks.*재신뢰/)
})

test('harness doctor --live는 Windows profile과 Hook launcher를 검증한다', {
  skip: process.platform !== 'win32',
}, () => {
  const result = spawnSync(process.execPath, ['.codex/harness-doctor.mjs', '--live'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /LIVE-CANARY:\s+PASS/)
  assert.match(result.stdout, /permissions 3\/3/)
  assert.match(result.stdout, /hooks 4\/4/)
  assert.match(result.stdout, /models 3\/3/)
})

test('harness doctor --live는 child process 생성 실패를 진단 결과로 반환한다', {
  skip: process.platform !== 'win32',
}, () => {
  const result = spawnSync(process.execPath, ['.codex/harness-doctor.mjs', '--live'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, PATH: '' },
    timeout: 30_000,
  })
  assert.equal(result.status, 1)
  assert.match(result.stdout, /LIVE-CANARY:\s+FAIL/)
  assert.match(result.stdout, /실행기 시작 실패|spawn pwsh\.exe ENOENT/i)
  assert.doesNotMatch(result.stderr, /TypeError/)
})
