import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const read = (repoPath) => fs.readFileSync(path.join(ROOT, repoPath), 'utf8')
const listNames = (repoPath, extension) => fs.readdirSync(path.join(ROOT, repoPath))
  .filter((name) => !name.startsWith('_') && name.endsWith(extension))
  .map((name) => name.slice(0, -extension.length))
  .sort()

const EXPECTED_MODELS = {
  'agent-backend': 'gpt-5.6-terra',
  coordinator: 'gpt-5.6-sol',
  'main-process': 'gpt-5.6-terra',
  'plan-auditor': 'gpt-5.6-sol',
  qa: 'gpt-5.6-terra',
  renderer: 'gpt-5.6-terra',
  reviewer: 'gpt-5.6-sol',
  secretary: 'gpt-5.6-luna',
  'shared-ipc': 'gpt-5.6-terra',
}

const EXPECTED_PERMISSIONS = {
  'agent-backend': 'agentdeck-workspace',
  coordinator: 'agentdeck-readonly',
  'main-process': 'agentdeck-workspace',
  'plan-auditor': 'agentdeck-readonly',
  qa: 'agentdeck-workspace',
  renderer: 'agentdeck-workspace',
  reviewer: 'agentdeck-readonly',
  secretary: 'agentdeck-operations',
  'shared-ipc': 'agentdeck-workspace',
}

function tomlString(content, key) {
  return content.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'))?.[1] ?? null
}

function collectStaticIssues() {
  const issues = []
  const expectedRoles = Object.keys(EXPECTED_MODELS).sort()
  const claudeRoles = listNames('.claude/agents', '.md')
  const codexRoles = listNames('.codex/agents', '.toml')
  if (JSON.stringify(claudeRoles) !== JSON.stringify(expectedRoles)) {
    issues.push(`Claude 역할 불일치: ${claudeRoles.join(', ')}`)
  }
  if (JSON.stringify(codexRoles) !== JSON.stringify(expectedRoles)) {
    issues.push(`Codex 역할 불일치: ${codexRoles.join(', ')}`)
  }

  for (const [role, expectedModel] of Object.entries(EXPECTED_MODELS)) {
    const profile = read(`.codex/agents/${role}.toml`)
    if (tomlString(profile, 'name') !== role) issues.push(`${role}: name 불일치`)
    if (tomlString(profile, 'model') !== expectedModel) issues.push(`${role}: model 불일치`)
    if (!tomlString(profile, 'model_reasoning_effort')) issues.push(`${role}: reasoning effort 누락`)
    if (tomlString(profile, 'default_permissions') !== EXPECTED_PERMISSIONS[role]) {
      issues.push(`${role}: permissions 불일치`)
    }
    if (/^sandbox_mode\s*=/m.test(profile)) issues.push(`${role}: sandbox_mode 혼용`)
  }

  const config = read('.codex/config.toml')
  for (const marker of [
    'default_permissions = ":danger-full-access"',
    '[permissions.agentdeck-readonly]',
    '[permissions.agentdeck-workspace]',
    '[permissions.agentdeck-operations]',
    '"**/.env" = "deny"',
    '"**/secrets/**" = "deny"',
  ]) if (!config.includes(marker)) issues.push(`config 누락: ${marker}`)

  const hookPath = path.join(ROOT, '.codex', 'hooks', 'agentdeck-hook.mjs')
  const hookSource = fs.readFileSync(hookPath)
  const digest = createHash('sha256').update(hookSource).digest('hex')
  const hooks = read('.codex/hooks.json')
  if (!hooks.includes(digest)) issues.push('hooks.json SHA-256 cachebuster 불일치')
  if (hookSource.toString('utf8').includes('.claude/state')) {
    issues.push('Codex Hook이 Claude runtime state를 참조함')
  }

  if (!fs.existsSync(path.join(ROOT, '.codex', 'rules', 'agentdeck.rules'))) {
    issues.push('project execpolicy rules 누락')
  }

  const expectedSkills = [
    'agentdeck-review', 'harness-review', 'refactor-sweep', 'session-end',
    'session-review', 'session-start', 'work-plan', 'work-run',
  ]
  const actualSkills = fs.readdirSync(path.join(ROOT, '.agents', 'skills'))
    .filter((name) => fs.existsSync(path.join(ROOT, '.agents', 'skills', name, 'SKILL.md')))
    .sort()
  if (JSON.stringify(actualSkills) !== JSON.stringify(expectedSkills.sort())) {
    issues.push(`skill bridge 불일치: ${actualSkills.join(', ')}`)
  }

  return { issues, digest, roleCount: expectedRoles.length, skillCount: expectedSkills.length }
}

function runPowerShell(command, { cwd = ROOT, input = '' } = {}) {
  return spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-Command', command], {
    cwd,
    input,
    encoding: 'utf8',
    timeout: 15_000,
  })
}

function childProcessFailure(result) {
  for (const value of [result.stderr, result.stdout]) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  if (result.error) return `실행기 시작 실패: ${result.error.message}`
  if (result.signal) return `signal ${result.signal}`
  return `exit ${result.status ?? 'unknown'}`
}

function liveCanary() {
  if (process.platform !== 'win32') {
    return { skipped: true, issues: [], permissions: 0, hooks: 0, models: 0 }
  }

  const issues = []
  let permissions = 0
  for (const profile of ['agentdeck-readonly', 'agentdeck-workspace', 'agentdeck-operations']) {
    const command = `codex sandbox -P ${profile} -C '${ROOT.replaceAll("'", "''")}' cmd.exe /d /c ver; exit $LASTEXITCODE`
    const result = runPowerShell(command)
    if (result.status === 0) permissions += 1
    else issues.push(`${profile} sandbox 초기화 실패: ${childProcessFailure(result)}`)
  }

  const hookPayloads = {
    UserPromptSubmit: { hook_event_name: 'UserPromptSubmit', prompt: 'doctor live probe' },
    SubagentStart: { hook_event_name: 'SubagentStart', agent_type: 'secretary' },
    PreToolUse: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git status --short' },
    },
    PostToolUse: {
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git status --short' },
      tool_response: { exit_code: 0 },
    },
  }
  const hookConfig = JSON.parse(read('.codex/hooks.json'))
  let hooks = 0
  for (const [event, payload] of Object.entries(hookPayloads)) {
    const command = hookConfig.hooks[event][0].hooks[0].commandWindows
    const result = runPowerShell(command, {
      cwd: path.join(ROOT, '.codex', 'hooks'),
      input: JSON.stringify({ session_id: 'doctor-live', cwd: ROOT, ...payload }),
    })
    if (result.status === 0) hooks += 1
    else issues.push(`${event} launcher 실패: ${childProcessFailure(result)}`)
  }

  const modelResult = runPowerShell('codex debug models; exit $LASTEXITCODE')
  let models = 0
  if (modelResult.status !== 0) {
    issues.push(`model catalog 실패: ${childProcessFailure(modelResult)}`)
  } else {
    try {
      const slugs = new Set(JSON.parse(modelResult.stdout).models.map((model) => model.slug))
      for (const slug of ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']) {
        if (slugs.has(slug)) models += 1
        else issues.push(`model catalog 누락: ${slug}`)
      }
    } catch (error) {
      issues.push(`model catalog JSON 파싱 실패: ${error.message}`)
    }
  }

  return { skipped: false, issues, permissions, hooks, models }
}

const { issues, digest, roleCount, skillCount } = collectStaticIssues()
process.stdout.write('AgentDeck Codex Harness Doctor\n')
if (issues.length) {
  process.stdout.write(`STATIC: FAIL (${issues.length})\n`)
  for (const issue of issues) process.stdout.write(`- ${issue}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`STATIC: PASS — roles ${roleCount}/9, skills ${skillCount}/8, hook ${digest.slice(0, 12)}\n`)
}

if (process.argv.includes('--live')) {
  if (issues.length) {
    process.stdout.write('LIVE-CANARY: SKIP — STATIC FAIL을 먼저 해결하세요.\n')
  } else {
    const live = liveCanary()
    if (live.skipped) {
      process.stdout.write('LIVE-CANARY: SKIP — 현재 doctor live canary는 Windows 전용입니다.\n')
    } else if (live.issues.length) {
      process.stdout.write(`LIVE-CANARY: FAIL (${live.issues.length})\n`)
      for (const issue of live.issues) process.stdout.write(`- ${issue}\n`)
      process.exitCode = 1
    } else {
      process.stdout.write(`LIVE-CANARY: PASS — permissions ${live.permissions}/3, hooks ${live.hooks}/4, models ${live.models}/3\n`)
    }
  }
}

process.stdout.write('LIVE: PENDING — trusted new session에서 아래 항목을 확인하세요.\n')
process.stdout.write('- root 기본 permissions가 Full Access인지 /permissions에서 확인\n')
process.stdout.write('- /hooks에서 변경된 SHA-256 정의를 검토하고 재신뢰한 뒤 4개 이벤트를 다시 활성화\n')
process.stdout.write('- /skills에서 repo bridge 8개 표시 확인\n')
process.stdout.write('- custom agents 9개와 실제 model label 확인\n')
process.stdout.write('- secretary 예상 model: gpt-5.6-luna / permissions: agentdeck-operations\n')
process.stdout.write('- reviewer 예상 model: gpt-5.6-sol / read-only canary 확인\n')
process.stdout.write('- 현재 호출 표면이 custom profile을 우회하면 적용 완료로 표시하지 말고 degraded mode로 기록\n')
