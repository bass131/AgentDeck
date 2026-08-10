#!/usr/bin/env node
// 위험 명령 가드 동등성 기준표 — 표 구동 테스트 (M02 Phase 1 Step 9·11).
//
// 사람용 정본은 01_Milestones/M02_Hardening/02_동등성-기준표.md다. 이 파일은 그 표의 기계 배선이고,
// 두 표면의 id·기대 판정은 같아야 한다.
//
// 판정 축 세 값 — deny(exit 2) · ask(승인 질의 JSON + exit 0) · allow(exit 0 + 무출력).
//   push·publish 축의 ask는 차단과 동등으로 읽는다 (M01 결정 대장 [USER] 2026-08-09).
// 기대 판정의 원칙은 「Moodie 원본 동등 이상」이다 — 원본이 잡던 표면은 반드시 잡고,
//   하류 실행 소비자가 없는 언급·인용문은 잡지 않는다(오탐 금지).
// flag: true 는 현행 구현이 기대와 어긋남이 확인된 표면이다 — 기대-실패 플래그로 등재해
//   하드 게이트를 유지하면서 Red를 관측한다. Phase 1이 18건을 등재했고 Phase 2가 전건을 수리해
//   지금은 잔여 0건이다 — 남은 flag: false 행들의 note에 그 표면이 무엇이었는지가 근거로 남아 있다.
// 공통 한계 3종(변수 확장·`$()` 명령 치환·`cmd /c` 접두)은 [USER] 2026-08-10(안건 2) 기각 판정으로
//   이 배선에서 제외한다 — 방어 담당은 Claude Code 내장 권한 분류기다. 기준표 「공통 한계」 구획 참조.
//
// 격리 — 가드 spawn은 전부 공통 헬퍼(_lib/guard-spawn.mjs)를 쓴다. mkdtemp 미러 + CLAUDE_PROJECT_DIR
//   주입 + 합성 session_id·agent_id이며, live hook-log에 합성 줄이 0건임을 이 러너가 스스로 검사한다.
//
// 선택 모드 — `--report`는 행별 실측을 표로 찍고, `--moodie`는 Moodie 원본 가드를 같은 미러에서
//   교차 구동해 moodie 열을 실측 대조한다(원본 저장소가 없으면 건너뛴다). 둘 다 test:hooks 기본 경로 밖이다.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRunner } from './_lib/runner.mjs'
import { createGuardHarness, REPO_ROOT, SYNTHETIC } from './_lib/guard-spawn.mjs'

const MOODIE_GUARD = 'C:/Dev/Moodie_Agent_Workflow/.claude/hooks/32_cmd-guard.cjs'

// id · 명령 · Moodie 판정 · 기대 판정 · 플래그 · 근거
const ROWS = [
  // ── 삭제류: rm 재귀 (Moodie matchSegment L44~45 — rm 뒤 어느 토큰이든 -[A-Za-z]*[rR]·--recursive)
  { id: 'RM-01', cmd: 'rm -rf dist', moodie: 'deny', expect: 'deny', flag: false, note: '재귀 삭제 기본형' },
  { id: 'RM-02', cmd: 'rm -fr node_modules', moodie: 'deny', expect: 'deny', flag: false, note: '플래그 순서 역전' },
  { id: 'RM-03', cmd: 'rm -R build', moodie: 'deny', expect: 'deny', flag: false, note: '대문자 재귀 — Moodie 회귀 (Backlog 9)' },
  { id: 'RM-04', cmd: 'rm --recursive build', moodie: 'deny', expect: 'deny', flag: false, note: '긴 플래그 — Moodie 회귀 (Backlog 9)' },
  { id: 'RM-05', cmd: 'rm dist -rf', moodie: 'deny', expect: 'deny', flag: false, note: '후치 플래그 — Moodie 회귀 (Backlog 9)' },
  { id: 'RM-06', cmd: 'rm -r dist', moodie: 'deny', expect: 'deny', flag: false, note: '재귀 단독' },
  { id: 'RM-07', cmd: 'rm -f notes.txt', moodie: 'allow', expect: 'deny', flag: false, note: '비재귀 강제 — AgentDeck이 원본보다 넓다(동등 이상)' },
  { id: 'RM-08', cmd: '"rm" -rf dist', moodie: 'deny', expect: 'deny', flag: false, note: '명령 인용 — 인용부 드롭 회귀 (Backlog 3·9)' },
  // ── 삭제류: git reset --hard (Moodie L47)
  { id: 'GR-01', cmd: 'git reset --hard origin/main', moodie: 'deny', expect: 'deny', flag: false, note: '작업 손실 기본형' },
  { id: 'GR-02', cmd: 'git reset "--hard"', moodie: 'deny', expect: 'deny', flag: false, note: '플래그 인용 — Moodie 회귀 (Backlog 9)' },
  { id: 'GR-03', cmd: 'git -C repo reset --hard', moodie: 'deny', expect: 'deny', flag: false, note: 'git 전역 옵션 접두' },
  { id: 'GR-04', cmd: 'git.exe reset --hard', moodie: 'allow', expect: 'deny', flag: false, note: '실행 파일명 머리 토큰 — 신규 표면 (Backlog 9)' },
  { id: 'GR-05', cmd: 'Git reset --hard', moodie: 'allow', expect: 'deny', flag: false, note: '대문자 머리 토큰 — 신규 표면 (Backlog 9)' },
  // ── 삭제류: git clean (Moodie L48 — 소문자 f·--force만)
  { id: 'GC-01', cmd: 'git clean -fd', moodie: 'deny', expect: 'deny', flag: false, note: '미추적 파일 손실' },
  { id: 'GC-02', cmd: 'git clean -d', moodie: 'allow', expect: 'deny', flag: false, note: '-d 단독 — AgentDeck이 원본보다 넓다(동등 이상)' },
  { id: 'GC-03', cmd: 'git clean --force', moodie: 'deny', expect: 'deny', flag: false, note: '긴 플래그' },
  // ── 삭제류: 로컬 편집 폐기 (Moodie L49~50)
  { id: 'CO-01', cmd: 'git checkout -- 02_Project/00_Source/main/index.ts', moodie: 'deny', expect: 'deny', flag: false, note: '경로 복원' },
  { id: 'CO-02', cmd: 'git checkout --', moodie: 'deny', expect: 'deny', flag: false, note: '경로 없는 `--` — Moodie 회귀 (경로 개수 조건 차이)' },
  { id: 'CO-03', cmd: 'git checkout .', moodie: 'allow', expect: 'deny', flag: false, note: '점 경로 — 신규 표면 (Backlog 9)' },
  { id: 'RS-01', cmd: 'git restore 02_Project/00_Source/main/index.ts', moodie: 'deny', expect: 'deny', flag: false, note: '편집 폐기' },
  { id: 'RS-02', cmd: 'git restore --staged .', moodie: 'deny', expect: 'deny', flag: false, note: '색인 복원' },
  // ── 삭제류: git branch 강제 삭제 (Moodie L51 — 대문자 D만)
  { id: 'BR-01', cmd: 'git branch -D feature', moodie: 'deny', expect: 'deny', flag: false, note: '강제 삭제 기본형' },
  { id: 'BR-02', cmd: 'git branch -Df feature', moodie: 'deny', expect: 'deny', flag: false, note: '플래그 결합' },
  { id: 'BR-03', cmd: 'git branch -fD feature', moodie: 'deny', expect: 'deny', flag: false, note: '결합 순서 역전' },
  { id: 'BR-04', cmd: 'git branch -d -f feature', moodie: 'allow', expect: 'deny', flag: false, note: '분리 동치 — 신규 표면 (Backlog 9)' },
  { id: 'BR-05', cmd: 'git branch -df feature', moodie: 'allow', expect: 'deny', flag: false, note: '소문자 결합 동치 — 신규 표면 (Backlog 9)' },
  { id: 'BR-06', cmd: 'git branch --delete --force feature', moodie: 'allow', expect: 'deny', flag: false, note: '긴 플래그 동치 — 신규 표면 (Backlog 9)' },
  { id: 'BR-07', cmd: 'git branch -d merged', moodie: 'allow', expect: 'allow', flag: false, note: '안전 삭제 — 오탐 회귀 불변식' },
  // ── 삭제류: git stash (Moodie 무규칙)
  { id: 'ST-01', cmd: 'git stash drop', moodie: 'allow', expect: 'deny', flag: false, note: '스태시 폐기 — 신규 표면 (Backlog 9)' },
  { id: 'ST-02', cmd: 'git stash clear', moodie: 'allow', expect: 'deny', flag: false, note: '스태시 전량 폐기 — 신규 표면 (Backlog 9)' },
  // ── 삭제류: Windows·PowerShell (Moodie L53~55)
  { id: 'WD-01', cmd: 'del /s /q dist', moodie: 'deny', expect: 'deny', flag: false, note: '하위 폴더까지' },
  { id: 'WD-02', cmd: 'rmdir /s /q dist', moodie: 'deny', expect: 'deny', flag: false, note: '하위 폴더까지' },
  { id: 'WD-03', cmd: 'Remove-Item -Recurse dist', moodie: 'deny', expect: 'deny', flag: false, note: '-Force 없이 -Recurse 단독' },
  { id: 'WD-04', cmd: 'Remove-Item -Recurse -Force dist', moodie: 'deny', expect: 'deny', flag: false, note: '강제 결합' },
  // ── 공개류: push (Moodie L58 · ask=차단 동등)
  { id: 'PU-01', cmd: 'git push origin main', moodie: 'deny', expect: 'ask', flag: false, note: '원격 반영 — ask는 차단 동등' },
  { id: 'PU-02', cmd: 'git push --force origin main', moodie: 'deny', expect: 'deny', flag: false, note: '이력 손실은 질의 없이 차단' },
  { id: 'PU-03', cmd: 'git push --force-with-lease origin main', moodie: 'deny', expect: 'ask', flag: false, note: '안전 강제 — 차단 아니고 질의' },
  { id: 'PU-04', cmd: 'git -C repo push', moodie: 'deny', expect: 'ask', flag: false, note: '전역 옵션 접두' },
  // ── 공개류: npm publish (Moodie L59~60) · gh (Moodie 무규칙)
  { id: 'NP-01', cmd: 'npm publish', moodie: 'deny', expect: 'ask', flag: false, note: '레지스트리 공개' },
  { id: 'NP-02', cmd: 'npm publish --access public', moodie: 'deny', expect: 'ask', flag: false, note: '플래그 부착' },
  { id: 'NP-03', cmd: 'echo npm publish', moodie: 'deny', expect: 'allow', flag: false, note: '언급 오탐 — 머리 토큰 판정 미적용 (Backlog 1)' },
  { id: 'GH-01', cmd: 'gh pr create --fill', moodie: 'allow', expect: 'ask', flag: false, note: 'AgentDeck 고유 축(동등 이상)' },
  { id: 'GH-02', cmd: 'gh release create v1', moodie: 'allow', expect: 'ask', flag: false, note: 'AgentDeck 고유 축(동등 이상)' },
  { id: 'GH-03', cmd: 'echo gh pr create', moodie: 'allow', expect: 'allow', flag: false, note: '언급 오탐 — 정규식 잔존 (Backlog 1)' },
  // ── 영속 (Moodie L63)
  { id: 'CF-01', cmd: 'git config --global user.name x', moodie: 'deny', expect: 'deny', flag: false, note: '전역 설정 영속 변경' },
  { id: 'CF-02', cmd: 'git config --global --get user.name', moodie: 'deny', expect: 'allow', flag: false, note: '읽기 전용 오탐 (Backlog 10)' },
  // ── heredoc pipeline (한 항목 = pipeline 전체 · 기대 판정 근거는 하류 소비자·sink)
  { id: 'HD-01', cmd: "git commit -F - <<'EOF'\nfix: git push 재시도 로직 보강\nEOF", moodie: 'allow', expect: 'allow', flag: false, note: '소비자=커밋 메시지 · 실행 소비자 없음 · 파일 sink 없음' },
  { id: 'HD-02', cmd: "git commit -F - <<'EOF'\nrm -rf dist 회귀 수정\nEOF", moodie: 'deny', expect: 'allow', flag: false, note: '소비자=커밋 메시지 · 실행 소비자 없음 → 본문 오인 (Backlog 14, Phase 2 수리)' },
  { id: 'HD-03', cmd: "bash <<'EOF'\nrm -rf dist\nEOF", moodie: 'deny', expect: 'deny', flag: false, note: '실행 소비자 있음(bash)' },
  { id: 'HD-04', cmd: "cat > cleanup.sh <<'EOF'\nrm -rf /\nEOF", moodie: 'deny', expect: 'deny', flag: false, note: '파일 sink 있음(실행 스크립트 생성)' },
  // ── 오탐 회귀 불변식 (통과해야 하는 명령)
  { id: 'OK-01', cmd: 'npm test', moodie: 'allow', expect: 'allow', flag: false, note: '정상 테스트' },
  { id: 'OK-02', cmd: 'git status', moodie: 'allow', expect: 'allow', flag: false, note: '읽기' },
  { id: 'OK-03', cmd: 'git commit -m "a && rm -rf /"', moodie: 'deny', expect: 'allow', flag: false, note: '인용 본문 — Moodie는 오탐, AgentDeck은 통과' },
  { id: 'OK-04', cmd: "git commit -m 'reset --hard 얘기'", moodie: 'deny', expect: 'allow', flag: false, note: '인용 본문 — Moodie는 오탐, AgentDeck은 통과' },
  { id: 'OK-05', cmd: 'echo git reset --hard', moodie: 'allow', expect: 'allow', flag: false, note: '머리 토큰 판정' },
  { id: 'OK-06', cmd: 'grep -r "git push" 02_Project', moodie: 'allow', expect: 'allow', flag: false, note: '검색 인자' },
]

// payload 축 — 명령 문자열이 아니라 입력 자체를 겨눈다 (Moodie는 fail-open, AgentDeck은 fail-closed)
const PAYLOAD_ROWS = [
  { id: 'FC-01', raw: '', moodie: 'allow', expect: 'deny', flag: false, note: '빈 stdin — 판정 불능은 차단' },
  { id: 'FC-02', raw: '{not json', moodie: 'allow', expect: 'deny', flag: false, note: '파손 JSON — 판정 불능은 차단' },
  { id: 'FC-03', payload: { tool_name: 'Read', tool_input: { file_path: 'a.ts' } }, moodie: 'allow', expect: 'allow', flag: false, note: '판정 대상 없음 — 조용히 통과' },
]

const report = process.argv.includes('--report')
const crossMoodie = process.argv.includes('--moodie')
const r = createRunner('cmd-guard 동등성 기준표')
const h = createGuardHarness('dangerous-cmd-guard.mjs')
const label = (row) => `${row.id} \`${String(row.cmd ?? row.raw ?? 'payload').replace(/\n/g, '\\n')}\``

try {
  for (const row of ROWS) {
    const actual = h.verdict(row.cmd)
    if (report) console.log(`${row.id}\t실측 ${actual}\t기대 ${row.expect}\tflag ${row.flag}\tMoodie ${row.moodie}`)
    r.judge(label(row), actual, row.expect, { expectFail: row.flag, note: row.note })
  }
  for (const row of PAYLOAD_ROWS) {
    const actual = 'raw' in row ? h.verdictRaw(row.raw) : h.verdictPayload(row.payload)
    if (report) console.log(`${row.id}\t실측 ${actual}\t기대 ${row.expect}\tflag ${row.flag}\tMoodie ${row.moodie}`)
    r.judge(label(row), actual, row.expect, { expectFail: row.flag, note: row.note })
  }

  // ── 격리 규율 자체를 판정한다 (Phase 1 DoD) ────────────────────────────────
  r.check('격리 — 미러가 실저장소 밖이다', !h.mirror.startsWith(REPO_ROOT), h.mirror)
  // 판정은 파싱한 `session`·`agent_id` **필드**의 동등 비교다 — 문자열 포함 검사가 아니다.
  // 이유: Phase 2가 신설한 가드 판정 로그는 실행된 명령 원문을 `cmd` 필드에 싣는다. 그래서 감사자가
  // `grep synthetic-cmd-guard-p1 hook-log`를 한 번 돌리기만 해도 그 명령 원문이 live 로그 줄로 들어가,
  // 포함 검사는 합성 세션이 전혀 없는데도 영구히 1건 이상을 센다 (실제 발생 — live 로그 576·579행,
  // 두 줄의 session은 live 세션 675d6d46이다). 필드 동등 비교는 그 오염을 세지 않는다.
  // 줄 수·byte 차분은 판정에 쓰지 않는다 — 외부 test:hooks 호출 자체가 줄을 남겨 안정된 표면이 아니다.
  // 근거: M02 Phase 2 코디네이터 재정 2026-08-10(① 승인 · cmd 필드 유지).
  const liveLog = join(REPO_ROOT, '98_Management', '01_GateState', 'hook-log.jsonl')
  const liveHits = existsSync(liveLog)
    ? readFileSync(liveLog, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter((l) => l && (l.session === SYNTHETIC.session || l.agent_id === SYNTHETIC.agentId)).length
    : 0
  r.check('격리 — live hook-log에 합성 session·agent_id 줄이 0건이다', liveHits === 0, `${liveHits}건`)

  // ── 선택: Moodie 원본 교차 구동으로 moodie 열을 실측 대조한다 ──────────────
  if (crossMoodie) {
    if (!existsSync(MOODIE_GUARD)) console.log(`\n[--moodie] 원본 가드 부재 — 교차 대조를 건너뛴다 (${MOODIE_GUARD})`)
    else {
      const m = createGuardHarness(MOODIE_GUARD)
      let mismatch = 0
      try {
        for (const row of ROWS) {
          const got = m.verdict(row.cmd)
          if (got !== row.moodie) { mismatch++; console.error(`  [--moodie] ${row.id} 선언 ${row.moodie} ≠ 실측 ${got}`) }
        }
      } finally { m.cleanup() }
      console.log(`\n[--moodie] 원본 교차 대조 — 선언 불일치 ${mismatch}건 / ${ROWS.length}행`)
    }
  }
} finally {
  h.cleanup()
}

process.exit(r.summary())
