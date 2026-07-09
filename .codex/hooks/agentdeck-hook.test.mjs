import assert from 'node:assert/strict'
import test from 'node:test'

import {
  codexRuntimePaths,
  dangerousCommandReason,
  harnessShellWriteReason,
  isHarnessPath,
  isImplementationPath,
  parsePatchPaths,
  riskFlagsFor,
  tddPatchViolation,
} from './agentdeck-hook.mjs'

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
  assert.equal(harnessShellWriteReason("Set-Content .codex/state/current-pin.txt 'x'"), null)
  assert.equal(harnessShellWriteReason('Get-Content .codex/config.toml'), null)
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
  assert.deepEqual(riskFlagsFor('02.Source/main/01_agents/CodexBackend.ts'), ['backend-contract'])
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
