import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const read = (repoPath) => fs.readFileSync(path.join(ROOT, repoPath), 'utf8')

// Sol adversarial(2026-07-12) 차단 #2 봉합: UNENFORCED 판정은 baseline 튜플에 묶인다.
// CLI 버전이 실측 기록과 다르면 — 결과가 같아 보여도 — exit 3(REVALIDATION_REQUIRED)으로
// 재실측을 강제한다. 읽기 deny가 강제되기 시작하는 "좋은 드리프트"도 계약 재검토 대상.
// baseline은 '측정값 기록'이므로 봉인 밖 00.Documents/harness/codex-baseline.json이 소유
// (재실측·갱신에 봉인 해제 불필요 — 2026-07-13 패치 churn 대처), 판정 규칙은 본 파일이 소유한다.
function loadBaseline() {
  try {
    const baseline = JSON.parse(read('00.Documents/harness/codex-baseline.json'))
    for (const key of ['cli', 'platform', 'rootProfile']) {
      if (typeof baseline[key] !== 'string' || !baseline[key]) throw new Error(`필드 누락: ${key}`)
    }
    return baseline
  } catch (error) {
    process.stdout.write(`BASELINE: FAIL — codex-baseline.json 읽기 실패 (${error.message})\n`)
    process.exit(1)
  }
}
const BASELINE = loadBaseline()

// 전담 보조 계약(ADR-033 개정): 점검 subagent 2종만 잔존.
const EXPECTED_AGENTS = {
  'plan-auditor': { model: 'gpt-5.6-sol', permissions: 'agentdeck-readonly' },
  reviewer: { model: 'gpt-5.6-sol', permissions: 'agentdeck-readonly' },
}

const EXPECTED_SKILLS = ['agentdeck-review', 'harness-review']

const REQUIRED_CONFIG_MARKERS = [
  'default_permissions = "agentdeck-assistant"',
  '[permissions.agentdeck-assistant]',
  '[permissions.agentdeck-rescue]',
  '[permissions.agentdeck-readonly]',
  '"**/.env" = "deny"',
  '"**/secrets/**" = "deny"',
]

// 풀 드라이버 전제 프로필의 부활 감시 (P05 원자 전환의 역행 방지).
const FORBIDDEN_CONFIG_MARKERS = [
  'default_permissions = ":danger-full-access"',
  '[permissions.agentdeck-worker-base]',
  '[permissions.agentdeck-main-process]',
  '[permissions.agentdeck-agent-backend]',
  '[permissions.agentdeck-renderer]',
  '[permissions.agentdeck-shared-ipc]',
  '[permissions.agentdeck-qa]',
  '[permissions.agentdeck-operations]',
]

function tomlString(content, key) {
  return content.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'))?.[1] ?? null
}

function collectStaticIssues() {
  const issues = []
  const expectedRoles = Object.keys(EXPECTED_AGENTS).sort()
  const codexRoles = fs.readdirSync(path.join(ROOT, '.codex', 'agents'))
    .filter((name) => name.endsWith('.toml'))
    .map((name) => name.slice(0, -'.toml'.length))
    .sort()
  if (JSON.stringify(codexRoles) !== JSON.stringify(expectedRoles)) {
    issues.push(`Codex 역할 불일치(기대 ${expectedRoles.join(', ')}): ${codexRoles.join(', ')}`)
  }

  for (const [role, expected] of Object.entries(EXPECTED_AGENTS)) {
    const profile = read(`.codex/agents/${role}.toml`)
    if (tomlString(profile, 'name') !== role) issues.push(`${role}: name 불일치`)
    if (tomlString(profile, 'model') !== expected.model) issues.push(`${role}: model 불일치`)
    if (!tomlString(profile, 'model_reasoning_effort')) issues.push(`${role}: reasoning effort 누락`)
    if (tomlString(profile, 'default_permissions') !== expected.permissions) {
      issues.push(`${role}: permissions 불일치`)
    }
    if (/^sandbox_mode\s*=/m.test(profile)) issues.push(`${role}: sandbox_mode 혼용`)
    if (!fs.existsSync(path.join(ROOT, '.claude', 'agents', `${role}.md`))) {
      issues.push(`${role}: Claude 정본 역할 파일 부재`)
    }
  }

  const config = read('.codex/config.toml')
  for (const marker of REQUIRED_CONFIG_MARKERS) {
    if (!config.includes(marker)) issues.push(`config 누락: ${marker}`)
  }
  for (const marker of FORBIDDEN_CONFIG_MARKERS) {
    if (config.includes(marker)) issues.push(`풀 드라이버 프로필 잔존: ${marker}`)
  }

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

  const actualSkills = fs.readdirSync(path.join(ROOT, '.agents', 'skills'))
    .filter((name) => fs.existsSync(path.join(ROOT, '.agents', 'skills', name, 'SKILL.md')))
    .sort()
  if (JSON.stringify(actualSkills) !== JSON.stringify([...EXPECTED_SKILLS].sort())) {
    issues.push(`skill bridge 불일치(기대 ${EXPECTED_SKILLS.join(', ')}): ${actualSkills.join(', ')}`)
  }

  return { issues, digest, roleCount: expectedRoles.length, skillCount: EXPECTED_SKILLS.length }
}

function runPowerShell(command, { cwd = ROOT, input = '' } = {}) {
  const options = { cwd, input, encoding: 'utf8', timeout: 20_000 }
  let result = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-Command', command], options)
  if (result.error?.code === 'EPERM') {
    result = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-Command', command], options)
  }
  return result
}

function childProcessFailure(result) {
  for (const value of [result.stderr, result.stdout]) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  if (result.error) return `실행기 시작 실패: ${result.error.message}`
  if (result.signal) return `signal ${result.signal}`
  return `exit ${result.status ?? 'unknown'}`
}

function psLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function runPermissionSandbox(profile, { workspaceRoot, shellCommand } = {}) {
  const override = workspaceRoot
    ? ` -c ${psLiteral(`permissions.${profile}.workspace_roots={ "${workspaceRoot.replaceAll('\\', '/')}" = true }`)}`
    : ''
  const cwd = workspaceRoot ?? ROOT
  const body = shellCommand ?? 'ver'
  const command = `codex sandbox${override} -P ${profile} -C ${psLiteral(cwd)} cmd.exe /d /c ${body}; exit $LASTEXITCODE`
  return runPowerShell(command)
}

function makeCanaryRoot(prefix, subdirs = []) {
  const root = fs.mkdtempSync(path.join(path.dirname(ROOT), prefix))
  for (const dir of subdirs) fs.mkdirSync(path.join(root, dir), { recursive: true })
  return root
}

function removeCanaryRoot(root, prefix) {
  const resolved = path.resolve(root)
  const parent = `${path.resolve(path.dirname(ROOT))}${path.sep}`
  if (!resolved.startsWith(parent) || !path.basename(resolved).startsWith(prefix)) {
    throw new Error(`unsafe canary cleanup path: ${resolved}`)
  }
  fs.rmSync(resolved, { recursive: true, force: true })
}

function codexCliVersion() {
  const result = runPowerShell('codex --version; exit $LASTEXITCODE')
  if (result.status !== 0) return { error: childProcessFailure(result) }
  const version = (result.stdout || '').match(/(\d+\.\d+\.\d+)/)?.[1]
  return version ? { version } : { error: `버전 파싱 실패: ${(result.stdout || '').trim()}` }
}

function hookGuardCanaries() {
  const hookConfig = JSON.parse(read('.codex/hooks.json'))
  const command = hookConfig.hooks.PreToolUse[0].hooks[0].commandWindows
  const cases = [
    ['Bash 시크릿 읽기', { tool_name: 'Bash', tool_input: { command: 'type .env' } }, 2],
    ['Edit 시크릿 경로', { tool_name: 'Edit', tool_input: { file_path: '.env' } }, 2],
    ['Bash 정상 명령', { tool_name: 'Bash', tool_input: { command: 'git status --short' } }, 0],
  ]
  const issues = []
  let passed = 0
  for (const [label, payload, expected] of cases) {
    const result = runPowerShell(command, {
      cwd: path.join(ROOT, '.codex', 'hooks'),
      input: JSON.stringify({ session_id: 'doctor-live', cwd: ROOT, hook_event_name: 'PreToolUse', ...payload }),
    })
    if (result.status === expected) passed += 1
    else issues.push(`HOOK-GUARD ${label}: 기대 exit ${expected}, 실측 ${result.status} (${childProcessFailure(result)})`)
  }
  return { issues, passed, total: cases.length }
}

function osReadBoundary() {
  // 실제 저장소 .env가 아니라 격리 workspace의 synthetic marker만 사용한다.
  const marker = 'AGENTDECK_SYNTHETIC_CANARY=not-a-real-secret'
  const ws = makeCanaryRoot('agentdeck-read-canary-')
  try {
    fs.writeFileSync(path.join(ws, '.env'), `${marker}\n`)
    const result = runPermissionSandbox(BASELINE.rootProfile, { workspaceRoot: ws, shellCommand: 'type .env' })
    if (result.error) return { verdict: 'INDETERMINATE', detail: childProcessFailure(result) }
    const leaked = result.status === 0 && (result.stdout || '').includes(marker)
    if (leaked) return { verdict: 'UNENFORCED' }
    return { verdict: 'ENFORCED_DRIFT', detail: `읽기가 차단됨(exit ${result.status}) — baseline과 다름, 계약 재검토 필요` }
  } finally {
    removeCanaryRoot(ws, 'agentdeck-read-canary-')
  }
}

// canary 파일 처분 규칙 (Codex Sol 리뷰 P2) — 순수 함수로 분리해 회귀 테스트로 고정한다.
export function canaryRelative(dir, token) {
  return `${dir ? dir + '\\' : ''}.agentdeck-doctor-canary-${token}.tmp`
}
// '이번 실행이 새로 만든 파일'만 삭제한다 — 우연히 같은 경로에 있던 사용자 파일은 보존.
export function canaryShouldRemove(preexisted, existsAfter) {
  return !preexisted && existsAfter
}

function writeBoundaries() {
  const issues = []
  let passed = 0
  const total = 5

  // 오버라이드(-c workspace_roots)는 프로필의 쓰기 패턴 구성을 무력화한다(2026-07-13 실측:
  // rescue 허용 쓰기가 오버라이드에서만 거부됨). 따라서 쓰기 경계는 오버라이드 없이
  // 실제 저장소를 대상으로, self-cleaning canary 파일로 검사한다.
  //
  // canary 파일명에 실행별 고유 토큰을 넣어 동시 doctor 실행 간 충돌을 없애고(서로의 canary
  // 삭제 방지), 아래 attempt()는 '이번 실행이 새로 만든 파일'만 삭제해 우연히 같은 경로에
  // 있던 사용자 파일을 보존한다 (Codex Sol 리뷰 P2).
  const runToken = `${process.pid}-${Date.now().toString(36)}`
  const canaryRel = (dir) => canaryRelative(dir, runToken)

  // 1) assistant :tmpdir 쓰기 허용.
  const tmpCanary = `agentdeck-doctor-canary-${runToken}.txt`
  const tmp = runPermissionSandbox('agentdeck-assistant', {
    shellCommand: `"echo x > %TEMP%\\${tmpCanary} && del %TEMP%\\${tmpCanary}"`,
  })
  if (tmp.status === 0) passed += 1
  else issues.push(`assistant :tmpdir 쓰기 실패: ${childProcessFailure(tmp)}`)

  // 2~5) 저장소 상대 경로에 프로필별 허용/차단 (허용 케이스도 즉시 삭제).
  const attempt = (profile, relative) => {
    const target = path.join(ROOT, relative)
    const preexisting = fs.existsSync(target)
    const result = runPermissionSandbox(profile, {
      shellCommand: `"copy /y NUL ${relative}"`,
    })
    const created = canaryShouldRemove(preexisting, fs.existsSync(target))
    if (created) fs.rmSync(target, { force: true }) // 우리가 만든 것만 삭제 — 사용자 파일 보존
    return { result, wrote: created }
  }

  const rescueAllow = attempt('agentdeck-rescue', canaryRel('02.Source'))
  if (rescueAllow.result.status === 0 && rescueAllow.wrote) passed += 1
  else issues.push(`rescue 02.Source 쓰기 실패: ${childProcessFailure(rescueAllow.result)}`)

  const rescueDeny = attempt('agentdeck-rescue', canaryRel('00.Documents'))
  if (rescueDeny.result.status !== 0 && !rescueDeny.wrote) passed += 1
  else issues.push('rescue 범위 밖(00.Documents) 쓰기 차단 실패')

  const assistantDeny = attempt('agentdeck-assistant', canaryRel(''))
  if (assistantDeny.result.status !== 0 && !assistantDeny.wrote) passed += 1
  else issues.push('assistant workspace 쓰기 차단 실패')

  const readonlyDeny = attempt('agentdeck-readonly', canaryRel(''))
  if (readonlyDeny.result.status !== 0 && !readonlyDeny.wrote) passed += 1
  else issues.push('readonly 쓰기 차단 실패')

  return { issues, passed, total }
}

function liveChecks() {
  const issues = []
  let profiles = 0
  for (const profile of ['agentdeck-assistant', 'agentdeck-rescue', 'agentdeck-readonly']) {
    const result = runPermissionSandbox(profile)
    if (result.status === 0) profiles += 1
    else issues.push(`${profile} sandbox 초기화 실패: ${childProcessFailure(result)}`)
  }

  const hookConfig = JSON.parse(read('.codex/hooks.json'))
  const benignPayloads = {
    UserPromptSubmit: { hook_event_name: 'UserPromptSubmit', prompt: 'doctor live probe' },
    SubagentStart: { hook_event_name: 'SubagentStart', agent_type: 'reviewer' },
    PreToolUse: { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git status --short' } },
    PostToolUse: {
      hook_event_name: 'PostToolUse', tool_name: 'Bash',
      tool_input: { command: 'git status --short' }, tool_response: { exit_code: 0 },
    },
  }
  let hooks = 0
  for (const [event, payload] of Object.entries(benignPayloads)) {
    const command = hookConfig.hooks[event][0].hooks[0].commandWindows
    const result = runPowerShell(command, {
      cwd: path.join(ROOT, '.codex', 'hooks'),
      input: JSON.stringify({ session_id: 'doctor-live', cwd: ROOT, ...payload }),
    })
    if (result.status === 0) hooks += 1
    else issues.push(`${event} launcher 실패: ${childProcessFailure(result)}`)
  }

  let models = 0
  const modelResult = runPowerShell('codex debug models; exit $LASTEXITCODE')
  if (modelResult.status !== 0) {
    issues.push(`model catalog 실패: ${childProcessFailure(modelResult)}`)
  } else {
    try {
      const slugs = new Set(JSON.parse(modelResult.stdout).models.map((model) => model.slug))
      if (slugs.has('gpt-5.6-sol')) models += 1
      else issues.push('model catalog 누락: gpt-5.6-sol')
    } catch (error) {
      issues.push(`model catalog JSON 파싱 실패: ${error.message}`)
    }
  }

  return { issues, profiles, hooks, models }
}

// CLI로 직접 실행할 때만 진단을 수행한다(부작용: stdout·process.exit). 테스트가 위 순수
// 헬퍼를 import할 때는 이 블록이 돌지 않아야 loadBaseline의 exit이 테스트를 죽이지 않는다.
const isMain = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) runDoctor()

function runDoctor() {
const { issues, digest, roleCount, skillCount } = collectStaticIssues()
process.stdout.write('AgentDeck Codex Harness Doctor (전담 보조 계약)\n')
if (issues.length) {
  process.stdout.write(`STATIC: FAIL (${issues.length})\n`)
  for (const issue of issues) process.stdout.write(`- ${issue}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`STATIC: PASS — agents ${roleCount}/2, skills ${skillCount}/2, hook ${digest.slice(0, 12)}\n`)
}

if (process.argv.includes('--live')) {
  if (issues.length) {
    process.stdout.write('LIVE-CANARY: SKIP — STATIC FAIL을 먼저 해결하세요.\n')
  } else if (process.platform !== BASELINE.platform) {
    process.stdout.write(`LIVE-CANARY: SKIP — live canary는 ${BASELINE.platform} 전용입니다.\n`)
  } else {
    const cli = codexCliVersion()
    if (cli.error) {
      process.stdout.write(`LIVE-CANARY: INDETERMINATE — codex CLI 확인 실패: ${cli.error}\n`)
      process.exitCode = 1
    } else if (cli.version !== BASELINE.cli) {
      process.stdout.write(`OS-READ-BOUNDARY: REVALIDATION_REQUIRED — codex-cli ${cli.version} ≠ baseline ${BASELINE.cli}. 읽기 deny 실태를 재실측하고 BASELINE·ADR-033을 갱신하세요.\n`)
      process.exitCode = 3
    } else {
      const guard = hookGuardCanaries()
      const readBoundary = osReadBoundary()
      const writes = writeBoundaries()
      const live = liveChecks()

      const liveIssues = [...guard.issues, ...writes.issues, ...live.issues]
      process.stdout.write(guard.issues.length
        ? `HOOK-GUARD: FAIL (${guard.passed}/${guard.total})\n`
        : `HOOK-GUARD: PASS (canaries ${guard.passed}/${guard.total})\n`)

      if (readBoundary.verdict === 'UNENFORCED') {
        process.stdout.write(`OS-READ-BOUNDARY: UNENFORCED_EXPECTED — codex-cli ${BASELINE.cli} baseline 일치 (읽기 deny 비강제, 훅이 보상 통제)\n`)
      } else if (readBoundary.verdict === 'ENFORCED_DRIFT') {
        process.stdout.write(`OS-READ-BOUNDARY: REVALIDATION_REQUIRED — ${readBoundary.detail}\n`)
        process.exitCode = 3
      } else {
        process.stdout.write(`OS-READ-BOUNDARY: INDETERMINATE — ${readBoundary.detail}\n`)
        process.exitCode = 1
      }

      process.stdout.write(writes.issues.length
        ? `WRITE-BOUNDARY: FAIL (${writes.passed}/${writes.total})\n`
        : `WRITE-BOUNDARY: PASS (${writes.passed}/${writes.total})\n`)

      if (liveIssues.length) {
        process.stdout.write(`LIVE-CONFORMANCE: FAIL (${liveIssues.length})\n`)
        for (const issue of liveIssues) process.stdout.write(`- ${issue}\n`)
        if (!process.exitCode) process.exitCode = 1
      } else if (readBoundary.verdict === 'UNENFORCED') {
        process.stdout.write(`LIVE-CONFORMANCE: ACCEPTED_WITH_LIMITATION — profiles ${live.profiles}/3, hooks ${live.hooks}/4, models ${live.models}/1 (시크릿 읽기 보증은 부분 보장 가드레일)\n`)
      }
    }
  }
}

process.stdout.write('LIVE: PENDING — trusted new session에서 아래 항목을 확인하세요.\n')
process.stdout.write(`- /permissions에서 root 기본이 ${BASELINE.rootProfile}인지 확인\n`)
process.stdout.write('- /hooks에서 변경된 SHA-256 정의를 검토하고 재신뢰한 뒤 4개 이벤트를 다시 활성화\n')
process.stdout.write('- /skills에서 repo bridge 2개(agentdeck-review, harness-review) 표시 확인\n')
process.stdout.write('- custom agents 2개(reviewer, plan-auditor)와 실제 model label(gpt-5.6-sol) 확인\n')
process.stdout.write('- 시크릿 차단 라이브 프로브: type .env 요청이 훅에 거부되는지 확인\n')
process.stdout.write('- 현재 호출 표면이 custom profile을 우회하면 적용 완료로 표시하지 말고 degraded mode로 기록\n')
}
