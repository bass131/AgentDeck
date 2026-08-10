#!/usr/bin/env node
// 위험 명령 가드 — 축별 회귀 테스트 (M01 신설 · M02 Phase 2 Step 7·9에서 격리 이관·본문 수리).
//
// 격리 (Step 7) — 종전에는 가드를 임시 뿌리 없이 수십 번 spawn하고 payload에 session·agent도 넣지
// 않아, 러너를 돌릴 때마다 실저장소의 hook-log에 판정 줄이 섞였다. 지금은 공통 격리 헬퍼
// (_lib/guard-spawn.mjs)만 쓴다 — mkdtemp 미러 + 별도 GateState + CLAUDE_PROJECT_DIR 주입 +
// 합성 session_id·agent_id이고, 미러는 종료 시 지운다.
// 이 파일 말미의 「헬퍼 미경유 spawn 금지」 검사가 그 규율 자체를 러너 차원에서 지킨다.
//
// heredoc 본문 (Step 9) — 면제 대상 heredoc의 본문 머리 줄에는 위험 명령 **원문**을 둔다.
// 종전 본문(`fix: git push 재시도 로직 보강`)은 머리 토큰이 `fix:`라 오탐 표면을 겨누지 못했다.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRunner } from './_lib/runner.mjs'
import { createGuardHarness, REPO_ROOT } from './_lib/guard-spawn.mjs'

const r = createRunner('dangerous-cmd-guard 축별 회귀')
const h = createGuardHarness('dangerous-cmd-guard.mjs')
const label = (cmd) => `\`${cmd.replace(/\n/g, '\\n')}\``
const judge = (cmd, expect) => r.judge(label(cmd), h.verdict(cmd), expect)

try {
  console.log('축① 파괴 → deny (exit 2)')
  for (const cmd of [
    'rm -rf dist',
    'rm -fr node_modules',
    'git reset --hard origin/main',
    'git clean -fd',
    'git push --force origin main',
    'git push -f origin main',
    'git branch -D feature',
    'git checkout -- 02_Project/00_Source/main/index.ts',
    'Remove-Item -Recurse -Force dist',
    'npm test && rm -rf dist',
  ]) judge(cmd, 'deny')

  console.log('축② 비가역 → ask (exit 0 + 승인 질의 JSON)')
  for (const cmd of [
    'git push origin main',
    'gh pr create --fill',
    'gh pr merge 12',
    'gh release create v1',
    'npm publish',
    'npm run package',
  ]) judge(cmd, 'ask')

  console.log('축① 우선 — force push는 물어보지 않고 차단한다')
  {
    const res = h.run('git push --force')
    r.check('`git push --force` → exit 2 · stdout 무출력 (ask 아님)', res.code === 2 && res.stdout === '',
      `exit ${res.code} · stdout ${JSON.stringify(res.stdout.slice(0, 60))}`)
  }
  judge('git push --force-with-lease origin main', 'ask')

  console.log('통과해야 하는 명령 → allow (exit 0 + 무출력)')
  for (const cmd of [
    'npm test',
    'npm run typecheck:node',
    'git status',
    'git commit -m "a && rm -rf /"',
    "git commit -m 'reset --hard 얘기'",
  ]) judge(cmd, 'allow')

  console.log('Moodie 대조 결손 다섯 건 → deny')
  // 근거: Moodie 32_cmd-guard.cjs matchSegment() — git-restore(L50)·del-s(L53)·rmdir-s(L54)
  //       ·remove-item-recurse(L55, -Force 없이 -Recurse 단독)·git-config-global(L63)
  for (const cmd of [
    'git restore 02_Project/00_Source/main/index.ts',
    'git restore --staged .',
    'del /s /q dist',
    'rmdir /s /q dist',
    'Remove-Item -Recurse dist',
    'git config --global user.name "someone"',
  ]) judge(cmd, 'deny')

  console.log('머리 토큰 판정 — 명령 위치가 아닌 곳의 git 단어는 오탐하지 않는다')
  // 면제 heredoc의 본문 머리 줄이 위험 명령 원문이다 — 이 줄이 세그먼트로 오인되면 deny가 난다
  for (const cmd of [
    "git commit -F - <<'EOF'\ngit push --force origin main\nrm -rf dist\nEOF",
    'echo git push',
    'echo git reset --hard',
    'grep -r git push 02_Project',
  ]) judge(cmd, 'allow')

  console.log('머리 토큰 판정 — git 전역 옵션이 앞에 붙어도 하위 명령을 놓치지 않는다')
  judge('git -C repo reset --hard', 'deny')
  judge('git --git-dir=.git restore .', 'deny')

  console.log('fail-closed — 판정 불가는 통과가 아니라 차단')
  r.judge('빈 stdin', h.verdictRaw(''), 'deny')
  r.judge('깨진 JSON', h.verdictRaw('{not json'), 'deny')

  console.log('판정 대상 없음 → 조용히 통과')
  r.judge('command 없는 payload', h.verdictPayload({ tool_name: 'Read', tool_input: { file_path: 'a.ts' } }), 'allow')

  // ── 헬퍼 미경유 spawn 금지 (Step 7 규율의 러너 차원 검사) ────────────────────
  // 가드를 spawn하는 어떤 테스트도 공통 격리 헬퍼를 거치지 않고 직접 spawn하지 않는다.
  // 판정: 가드 파일명을 언급하는 테스트 파일은 _lib/guard-spawn.mjs를 import해야 하고,
  //       자기 손으로 자식 프로세스를 띄우는 호출(spawnSync·execFile 류)을 갖지 않아야 한다.
  console.log('격리 규율 — 가드 spawn은 공통 헬퍼만 거친다')
  {
    const HOOKS = join(REPO_ROOT, '.claude', 'hooks')
    const files = readdirSync(HOOKS).filter((f) => f.endsWith('.test.mjs'))
    const offenders = []
    let guarded = 0
    for (const f of files) {
      const src = readFileSync(join(HOOKS, f), 'utf8')
      if (!src.includes('dangerous-cmd-guard.mjs')) continue
      guarded++
      const viaHelper = /_lib\/guard-spawn\.mjs/.test(src)
      const directSpawn = /\b(spawnSync|execFileSync|execFile|spawn)\s*\(/.test(src)
      if (!viaHelper || directSpawn) offenders.push(`${f}(헬퍼 ${viaHelper} · 직접spawn ${directSpawn})`)
    }
    r.check('가드를 언급하는 테스트 파일이 하나 이상이다', guarded > 0, `${guarded}개 / 전체 ${files.length}개`)
    r.check('가드 spawn 테스트 전건이 공통 헬퍼를 경유한다', offenders.length === 0, offenders.join(', ') || '위반 0건')
  }
} finally {
  h.cleanup()
}

process.exit(r.summary())
