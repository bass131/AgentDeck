import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  codexRuntimePaths,
  dangerousCommandReason,
  doneReportGateResult,
  doneReportIssues,
  harnessMaintenanceEnabled,
  harnessShellWriteReason,
  isHarnessPath,
  isImplementationPath,
  isSecretPathReference,
  parsePatchPaths,
  promptClarityContext,
  riskFlagsFor,
  secretAccessReason,
  secretPathCandidates,
  tddPatchViolation,
} from './agentdeck-hook.mjs'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const HOOKS_DIR = fileURLToPath(new URL('./', import.meta.url))
const HOOK_SCRIPT = fileURLToPath(new URL('./agentdeck-hook.mjs', import.meta.url))
const HOOKS_CONFIG = JSON.parse(fs.readFileSync(new URL('../hooks.json', import.meta.url), 'utf8'))

const WINDOWS_HOOK_PAYLOADS = {
  UserPromptSubmit: {
    hook_event_name: 'UserPromptSubmit',
    prompt: 'launcher probe',
  },
  SubagentStart: {
    hook_event_name: 'SubagentStart',
    agent_type: 'secretary',
  },
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

const STRICT_DONE = `---
summary: Hook gate를 엄격하게 검증한다.
phase: 13-hook-gate
status: done
grade: 복잡
owner: youngho
gate_version: 1
report_html: 00.Documents/reports/M13-hook-gate.html
---

# Phase 13 완료

## TL;DR
Hook gate를 검증했다.

## 5단계 보고
- 🎯 **무엇을 만들었나** — 엄격한 완료 게이트를 만들었다.
- 🤔 **왜 필요한가** — 불완전한 완료 보고를 막는다.
- 🛠️ **어떻게 만들었나** — 두 엔진을 독립 구현했다.
- 🧪 **테스트 결과** — 모든 테스트가 통과했다.
- ➡️ **다음 스텝** — Hook을 다시 신뢰한다.

## AC 검증 결과
\`\`\`text
$ node --test .codex/hooks/agentdeck-hook.test.mjs
tests 10, pass 10, fail 0
\`\`\`

## 학습 일지 후보 키워드
- Codex hooks
`

const STRICT_HTML = `<!doctype html>
<h2>무엇을 만들었나</h2>
<h2>왜 필요한가</h2>
<h2>어떻게 만들었나</h2>
<h2>테스트 결과</h2>
<h2>다음 스텝</h2>`

test('Codex apply_patch에서 모든 변경 경로를 추출한다', () => {
  const patch = `*** Begin Patch
*** Update File: 02.Source/main/index.ts
*** Move to: 02.Source/main/app.ts
*** Add File: 99.Others/tests/app.test.ts
*** Delete File: old.ts
*** End Patch`
  assert.deepEqual(parsePatchPaths(patch), [
    '02.Source/main/index.ts',
    '99.Others/tests/app.test.ts',
    'old.ts',
    '02.Source/main/app.ts',
  ])
})

test('Windows commandWindows는 PowerShell에서 네 Hook 이벤트를 실행한다', {
  skip: process.platform !== 'win32',
}, () => {
  for (const [event, payload] of Object.entries(WINDOWS_HOOK_PAYLOADS)) {
    const command = HOOKS_CONFIG.hooks[event][0].hooks[0].commandWindows
    const result = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-Command', command], {
      cwd: HOOKS_DIR,
      input: JSON.stringify({
        session_id: 'launcher-probe',
        cwd: HOOKS_DIR,
        ...payload,
      }),
      encoding: 'utf8',
      timeout: 10_000,
    })

    assert.equal(result.status, 0, [
      `${event} commandWindows failed`,
      `stdout: ${result.stdout}`,
      `stderr: ${result.stderr}`,
    ].join('\n'))
    if (event === 'SubagentStart') assert.match(result.stdout, /custom agent role: secretary/)
    if (event === 'UserPromptSubmit') assert.match(result.stdout, /<input-clarity>/)
  }
})

test('Windows commandWindows는 의도적 차단 종료 코드 2를 보존한다', {
  skip: process.platform !== 'win32',
}, () => {
  const command = HOOKS_CONFIG.hooks.PreToolUse[0].hooks[0].commandWindows
  const result = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-Command', command], {
    cwd: HOOKS_DIR,
    input: JSON.stringify({
      session_id: 'launcher-block-probe',
      cwd: REPO_ROOT,
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git reset --hard HEAD' },
    }),
    encoding: 'utf8',
    timeout: 10_000,
  })

  assert.equal(result.status, 2, result.stderr)
  assert.match(result.stderr, /git reset --hard/)
})

test('누락되거나 오래된 digest는 Hook 실패 소음 없이 조용히 비활성화한다', () => {
  const payload = JSON.stringify({
    session_id: 'stale-trust-probe',
    cwd: REPO_ROOT,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'git status --short' },
  })

  for (const args of [
    [HOOK_SCRIPT, 'pre-tool'],
    [HOOK_SCRIPT, 'pre-tool', '0'.repeat(64)],
  ]) {
    const result = spawnSync(process.execPath, args, {
      cwd: REPO_ROOT,
      input: payload,
      encoding: 'utf8',
      timeout: 10_000,
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr, '')
  }
})

test('파괴 명령을 차단하고 읽기 명령은 허용한다', () => {
  assert.match(dangerousCommandReason('git reset --hard HEAD'), /reset --hard/)
  assert.match(dangerousCommandReason('Remove-Item foo -Recurse -Force'), /재귀 강제 삭제/)
  assert.match(dangerousCommandReason('git push --force-with-lease'), /강제 push/)
  assert.match(dangerousCommandReason('rm -r -f build'), /재귀 강제 삭제/)
  assert.match(dangerousCommandReason('git -C . reset --hard HEAD'), /reset --hard/)
  assert.match(dangerousCommandReason('git clean -df'), /git clean/)
  assert.match(dangerousCommandReason('git push origin +main'), /강제 push/)
  assert.match(dangerousCommandReason('cmd /c rd /s /q build'), /재귀 무확인 삭제/)
  assert.equal(dangerousCommandReason('git status --short'), null)
  assert.equal(dangerousCommandReason("echo 'git reset --hard HEAD'"), null)
})

test('시크릿 직접 참조를 차단하고 유사 이름은 통과시킨다 (CORE-03)', () => {
  for (const command of [
    'type .env',
    'cat .env',
    'Get-Content .env',
    'type C:\\Dev\\AgentDeck\\.env',
    'cat .env.local',
    'cat .env.example',
    'echo FOO > .env',
    'node --env-file=.env app.mjs',
    'type secrets\\token.txt',
    'cat secrets/token.txt',
    'ls secrets/',
    'cp .env* backup/',
  ]) {
    assert.ok(secretAccessReason('Bash', { command }), `차단돼야 함: ${command}`)
  }
  for (const command of [
    'git status --short',
    'node -e "console.log(process.env.PATH)"',
    'pwsh -c "echo $env:PATH"',
    'cat some.env',
    'cat config.environment.json',
    'cat secrets-notes.md',
    'cat docs/secretsmanager.md',
    'npm run dev',
    'git commit -m "update .env docs"',
  ]) {
    assert.equal(secretAccessReason('Bash', { command }), null, `통과돼야 함: ${command}`)
  }
  assert.ok(secretAccessReason('Edit', { paths: ['.env'] }))
  assert.ok(secretAccessReason('Write', { paths: ['secrets/token.txt'] }))
  assert.ok(secretAccessReason('apply_patch', { paths: ['config/.env.production'] }))
  assert.equal(secretAccessReason('Edit', { paths: ['02.Source/main/env.ts'] }), null)
  assert.ok(isSecretPathReference('.env*'))
  assert.ok(isSecretPathReference('**/secrets/**'))
  assert.equal(isSecretPathReference('.envelope'), false)
  assert.ok(secretPathCandidates('node --env-file=.env app.mjs').includes('.env'))
})

test('Claude와 Codex 하네스를 봉인하되 런타임 상태는 허용한다', () => {
  for (const file of [
    'AGENTS.md',
    'CLAUDE.md',
    '.gitattributes',
    '.claude/hooks/tdd-guard.sh',
    '.codex/hooks.json',
    '.agents/skills/work-run/SKILL.md',
  ]) assert.equal(isHarnessPath(file), true, file)

  assert.equal(isHarnessPath('.claude/state/current-pin.txt'), true)
  assert.equal(isHarnessPath('.codex/state/current-pin.txt'), false)
  assert.equal(isHarnessPath('.claude/CHANGELOG.md'), false)
  assert.match(harnessShellWriteReason("Set-Content .codex/config.toml 'x'"), /shell 우회 쓰기/)
  assert.match(harnessShellWriteReason("Set-Content .codex/state/../config.toml 'x'"), /shell 우회 쓰기/)
  assert.match(harnessShellWriteReason("Set-Content .claude/state/current-pin.txt 'x'"), /shell 우회 쓰기/)
  assert.match(harnessShellWriteReason('echo x>.codex/hooks.json'), /shell 우회 쓰기/)
  assert.match(harnessShellWriteReason("node -e \"require('fs').writeFileSync('.codex/config.toml','x')\""), /shell 우회 쓰기/)
  assert.match(harnessShellWriteReason("[IO.File]::WriteAllText('.codex/config.toml','x')"), /shell 우회 쓰기/)
  assert.equal(harnessShellWriteReason("Set-Content .codex/state/current-pin.txt 'x'"), null)
  assert.equal(harnessShellWriteReason('Get-Content .codex/config.toml'), null)
  assert.equal(harnessShellWriteReason('rg model .codex/config.toml 2>$null'), null)
})

test('Harness maintenance는 부모 세션의 명시적 환경 변수로만 열린다', () => {
  assert.equal(harnessMaintenanceEnabled({}), false)
  assert.equal(harnessMaintenanceEnabled({ AGENTDECK_HARNESS_MAINTENANCE: 'true' }), false)
  assert.equal(harnessMaintenanceEnabled({ AGENTDECK_HARNESS_MAINTENANCE: '1' }), true)
})

test('입력 명확성 context는 semantic 분기만 주입하고 prompt 원문은 기록하지 않는다', () => {
  const secretPrompt = '빈약하지만 비밀인 요청 원문'
  const context = promptClarityContext(secretPrompt)
  assert.match(context, /충분하면.*진행/)
  assert.match(context, /읽기 전용.*실측/)
  assert.match(context, /사용자 결정.*질문/)
  assert.doesNotMatch(context, new RegExp(secretPrompt))
  assert.equal(promptClarityContext('   '), '')
})

test('Codex runtime 경로는 .codex/state에만 둔다', () => {
  const paths = codexRuntimePaths('C:/repo')
  assert.deepEqual(Object.keys(paths).sort(), ['circuit', 'pin'])
  for (const value of Object.values(paths)) {
    assert.match(value.replaceAll('\\', '/'), /\/\.codex\/state\//)
    assert.doesNotMatch(value.replaceAll('\\', '/'), /\/\.claude\/state\//)
  }
})

test('TDD 대상과 제외 대상을 구분한다', () => {
  assert.equal(isImplementationPath('02.Source/main/service.ts'), true)
  assert.equal(isImplementationPath('02.Source/renderer/view.tsx'), true)
  assert.equal(isImplementationPath('02.Source/shared/ipc-contract.ts'), false)
  assert.equal(isImplementationPath('02.Source/main/index.ts'), false)
  assert.equal(isImplementationPath('99.Others/tests/service.test.ts'), false)
})

test('경계 파일의 위험 깃발을 계산한다', () => {
  assert.deepEqual(riskFlagsFor('02.Source/preload/index.ts'), ['trust-boundary'])
  assert.deepEqual(riskFlagsFor('02.Source/shared/ipc-contract.ts'), ['shared-contract'])
  assert.deepEqual(riskFlagsFor('02.Source/main/01_agents/AgentBackend.ts'), ['backend-contract'])
  assert.deepEqual(riskFlagsFor('02.Source/main/01_agents/CodexBackend.ts'), ['trust-boundary', 'backend-contract'])
  assert.deepEqual(riskFlagsFor('02.Source/shared/ipc/agent.ts'), ['shared-contract'])
})

test('새 테스트와 구현을 같은 patch에 넣어 TDD 순서를 우회할 수 없다', () => {
  const patch = `*** Begin Patch
*** Add File: 99.Others/tests/newService.test.ts
+test('new service', () => {})
*** Add File: 02.Source/main/newService.ts
+export const value = 1
*** End Patch`
  assert.deepEqual(parsePatchPaths(patch), [
    '99.Others/tests/newService.test.ts',
    '02.Source/main/newService.ts',
  ])
  assert.match(tddPatchViolation(patch), /테스트.*별도 patch/)
})

test('기존 테스트 Update와 구현 Update도 같은 patch에 넣을 수 없다', () => {
  const patch = `*** Begin Patch
*** Update File: 99.Others/tests/agents/claude-backend-sdk.test.ts
@@
-old
+new
*** Update File: 02.Source/main/01_agents/ClaudeCodeBackend.ts
@@
-old
+new
*** End Patch`
  assert.match(tddPatchViolation(patch), /테스트.*별도 patch/)
})

test('gate_version 1 완료 보고와 HTML 짝을 엄격 검증한다', () => {
  assert.deepEqual(doneReportIssues(STRICT_DONE, { htmlContent: STRICT_HTML }), [])
})

test('완료 보고 필드·섹션·AC·HTML 누락을 모두 탐지한다', () => {
  const incomplete = STRICT_DONE
    .replace('owner: youngho\n', '')
    .replace('## 학습 일지 후보 키워드', '## 학습 후보')
    .replace('$ node --test .codex/hooks/agentdeck-hook.test.mjs\ntests 10, pass 10, fail 0', '검증 예정')
  const issues = doneReportIssues(incomplete, { htmlContent: '<html></html>' })
  assert.ok(issues.some((issue) => /owner/.test(issue)))
  assert.ok(issues.some((issue) => /학습 일지 후보 키워드/.test(issue)))
  assert.ok(issues.some((issue) => /AC 검증 결과/.test(issue)))
  assert.ok(issues.some((issue) => /HTML.*5단계/.test(issue)))
})

test('완료 보고 placeholder와 done 아닌 status를 거부한다', () => {
  const templated = STRICT_DONE
    .replace('summary: Hook gate를 엄격하게 검증한다.', 'summary: <완료 요약>')
    .replace('status: done', 'status: pending')
  const issues = doneReportIssues(templated, { htmlContent: STRICT_HTML })
  assert.ok(issues.some((issue) => /summary.*placeholder/.test(issue)))
  assert.ok(issues.some((issue) => /status.*done/.test(issue)))
})

test('AC는 임의의 $ 명령과 별도 결과 줄을 요구한다', () => {
  const commandOnly = STRICT_DONE.replace(
    '$ node --test .codex/hooks/agentdeck-hook.test.mjs\ntests 10, pass 10, fail 0',
    '$ node --test .codex/hooks/agentdeck-hook.test.mjs',
  )
  assert.ok(doneReportIssues(commandOnly, { htmlContent: STRICT_HTML })
    .some((issue) => /AC 검증 결과/.test(issue)))

  const ghEvidence = STRICT_DONE.replace(
    '$ node --test .codex/hooks/agentdeck-hook.test.mjs\ntests 10, pass 10, fail 0',
    '$ gh pr list --state open\nPASS: open PR 0',
  )
  assert.equal(doneReportIssues(ghEvidence, { htmlContent: STRICT_HTML })
    .some((issue) => /AC 검증 결과/.test(issue)), false)
})

test('추적된 legacy DONE만 유예하고 새 문서는 strict 차단한다', () => {
  assert.equal(doneReportGateResult('# legacy', { tracked: true }).legacy, true)
  const fresh = doneReportGateResult('# new', { tracked: false })
  assert.equal(fresh.blocking, true)
  assert.ok(fresh.issues.some((issue) => /gate_version/.test(issue)))
})
