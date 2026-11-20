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
//   하드 게이트를 유지하면서 Red를 관측한다. M02 Phase 1이 18건을 등재했고 M02 Phase 2가 전건을
//   수리했다. M03 Phase 2가 래퍼·셸 연쇄와 경로 접두의 5건(GR-06·07·WR-01~03)을 새로 등재했다 —
//   잔여 건수는 러너 요약 줄이 찍고, 수리 뒤 flag: false로 돌린 행들의 note에 그 표면이 무엇이었는지가 근거로 남는다.
//   M03 Phase 4 Step 10이 셸 `-c` 세 갈래의 6건(WR-04~09)을 등재해 Red를 관측한 뒤 수리했다.
//   M03 Phase 4 Step 13이 그 수리의 회귀(인용부 밖 `\"`)와 같은 원인의 오탐 8건(EQ-01~04·06·07 · OK-18·19)을
//   등재해 Red를 관측한 뒤 수리했다.
//   M04 Goal Loop가 「병합만 승인」 경계로 두 행의 기대를 바꿨다 (결정 대장 [USER] 2026-11-13) — GH-01은 ask에서
//   allow로, BR-07은 allow에서 ask로.
//   M05 H1 push 서버 보호가 push 행을 바꿨다 (H1 결정 대장 [USER] 2026-11-13) — 일반 push는 무출력이고 `master`는
//   GitHub 서버 보호가 지킨다. PU-01·PU-04는 ask에서 allow로, PU-03(`--force-with-lease`)은 ask에서 deny로 바꿨다.
//   셸 판독을 겨누는 행(WR-03·04·07·08 · EQ-02~04)과 오탐 행(OK-09·10·12·20)은 대상을 `main`에서 `master`로
//   옮겨, 판독이 깨지면 질의가 사라지거나 생기는 신호를 유지한다. PU-05~07은 새 규칙의 대표 꼴이다.
//   push 꼴 전수는 dangerous-cmd-guard.test.mjs가 소유한다.
// 공통 한계 3종(변수 확장·`$()` 명령 치환·`cmd /c` 접두)은 [USER] 2026-08-10(안건 2) 기각 판정으로
//   이 배선에서 제외한다 — 방어 담당은 Claude Code 내장 권한 분류기다. 기준표 「공통 한계」 구획 참조.
//
// 격리 — 가드 spawn은 전부 공통 헬퍼(_lib/guard-spawn.mjs)를 쓴다. mkdtemp 미러 + CLAUDE_PROJECT_DIR
//   주입 + 합성 session_id·agent_id이며, live hook-log에 합성 줄이 0건임을 이 러너가 스스로 검사한다.
//
// 선택 모드 — `--report`는 행별 실측을 표로 찍고, `--moodie`는 Moodie 원본 가드를 같은 미러에서
//   교차 구동해 moodie 열을 실측 대조한다(원본 저장소가 없으면 건너뛴다). 둘 다 test:hooks 기본 경로 밖이다.
import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
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
  { id: 'GR-06', cmd: 'C:\\Tools\\Git\\bin\\git.exe reset --hard', moodie: 'allow', expect: 'deny', flag: false, note: '디렉터리 접두 실행 파일 — basename 판정 필요 (M02 Backlog 2)' },
  { id: 'GR-07', cmd: '/usr/bin/git reset --hard', moodie: 'allow', expect: 'deny', flag: false, note: 'POSIX 경로 접두 — basename 판정 필요 (M02 Backlog 2)' },
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
  { id: 'BR-07', cmd: 'git branch -d merged', moodie: 'allow', expect: 'ask', flag: false, note: '안전 삭제도 질의 — 브랜치 삭제는 승인 항목 (M04 헌법 10조 개정, 종전 allow)' },
  // ── 삭제류: git stash (Moodie 무규칙)
  { id: 'ST-01', cmd: 'git stash drop', moodie: 'allow', expect: 'deny', flag: false, note: '스태시 폐기 — 신규 표면 (Backlog 9)' },
  { id: 'ST-02', cmd: 'git stash clear', moodie: 'allow', expect: 'deny', flag: false, note: '스태시 전량 폐기 — 신규 표면 (Backlog 9)' },
  // ── 삭제류: Windows·PowerShell (Moodie L53~55)
  { id: 'WD-01', cmd: 'del /s /q dist', moodie: 'deny', expect: 'deny', flag: false, note: '하위 폴더까지' },
  { id: 'WD-02', cmd: 'rmdir /s /q dist', moodie: 'deny', expect: 'deny', flag: false, note: '하위 폴더까지' },
  { id: 'WD-03', cmd: 'Remove-Item -Recurse dist', moodie: 'deny', expect: 'deny', flag: false, note: '-Force 없이 -Recurse 단독' },
  { id: 'WD-04', cmd: 'Remove-Item -Recurse -Force dist', moodie: 'deny', expect: 'deny', flag: false, note: '강제 결합' },
  // ── 래퍼·셸 연쇄 (M03 Phase 2 — M02 Backlog 3·10의 회귀 2표면과 헌법 10조 push 표면)
  { id: 'WR-01', cmd: 'bash -c "rm -rf dist"', moodie: 'deny', expect: 'deny', flag: false, note: '셸 실행 파일의 -c 인자 — Moodie 대비 회귀 (M02 Backlog 10)' },
  { id: 'WR-02', cmd: 'env FOO=1 rm -rf dist', moodie: 'deny', expect: 'deny', flag: false, note: '래퍼 뒤 VAR=값 할당 — Moodie 대비 회귀 (M02 Backlog 3·10)' },
  { id: 'WR-03', cmd: 'sh -c "git push origin master"', moodie: 'allow', expect: 'ask', flag: false, note: '셸 경유 push — 헌법 10조 게이트가 훅만으로는 닫히지 않던 표면 (M02 Backlog 10 동반 관측)' },
  // 셸 `-c` 재판정의 세 갈래 (M03 Phase 4 Step 10 · M03 Backlog 17) — 유효한 셸 문법인데 한 글자 차이로 통과하던 표면
  // Red(flag: true)로 먼저 올려 실측 allow 6건을 관측한 뒤 수리하고 플래그를 내렸다. moodie 열은 --moodie 실측값이다.
  { id: 'WR-04', cmd: 'bash -ce "git push origin master"', moodie: 'allow', expect: 'ask', flag: false, note: '갈래 ① c가 묶음 끝이 아닌 플래그 (M03 Backlog 17)' },
  { id: 'WR-05', cmd: "sh -cx 'rm -rf dist'", moodie: 'deny', expect: 'deny', flag: false, note: '갈래 ① c가 묶음 끝이 아닌 플래그 (M03 Backlog 17)' },
  { id: 'WR-06', cmd: 'bash -c -x "rm -rf dist"', moodie: 'deny', expect: 'deny', flag: false, note: '갈래 ② -c 뒤에 옵션이 더 온다 (M03 Backlog 17)' },
  { id: 'WR-07', cmd: 'bash -c -- "git push origin master"', moodie: 'allow', expect: 'ask', flag: false, note: '갈래 ② -c 뒤에 옵션 끝 표지 `--` (M03 Backlog 17)' },
  { id: 'WR-08', cmd: 'sh -c "sh -c \\"git push origin master\\""', moodie: 'allow', expect: 'ask', flag: false, note: '갈래 ③ 이스케이프된 따옴표가 든 중첩 sh -c (M03 Backlog 17)' },
  { id: 'WR-09', cmd: 'bash -c "bash -c \\"rm -rf dist\\""', moodie: 'allow', expect: 'deny', flag: false, note: '갈래 ③ 이스케이프된 따옴표가 든 중첩 bash -c (M03 Backlog 17)' },
  { id: 'WR-10', cmd: 'bash -o pipefail -c "rm -rf dist"', moodie: 'deny', expect: 'deny', flag: false, note: '값 받는 옵션 뒤의 -c — 옵션 파서가 깨면 안 되는 회귀 불변식' },
  // ── 인용부 밖의 이스케이프된 따옴표 (M03 Phase 4 Step 13 · Step 10 수리분 재검수 FAIL 2026-11-11T08:25:11)
  // bash에서 인용부 밖의 `\"`·`\'`는 문자 그대로의 따옴표이고 인용을 열지 않는다. Step 10 수리가 큰따옴표 안의
  // `\"`만 이스케이프로 읽자, 인용부 밖 `\"`가 연 가짜 인용이 닫히지 않아 뒤의 구분자와 명령이 인용문으로 숨었다.
  // Red(flag: true)로 먼저 올려 실측 allow 6건(EQ-01~04·06·07)과 오탐 deny 2건(OK-18·19)을 관측한 뒤 수리하고
  // 플래그를 내렸다. EQ-05·08·09·OK-20은 수리가 깨면 안 되는 경계 불변식이다. moodie 열은 --moodie 실측값이다.
  { id: 'EQ-01', cmd: 'echo \\"hello\\" && rm -rf dist', moodie: 'deny', expect: 'deny', flag: false, note: '인용부 밖 `\\"` 뒤 `&&` — Step 10 회귀 (수리 전 deny)' },
  { id: 'EQ-02', cmd: 'echo \\"hello\\" ; git push origin master', moodie: 'deny', expect: 'ask', flag: false, note: '인용부 밖 `\\"` 뒤 `;` — Step 10 회귀 (수리 전 ask)' },
  { id: 'EQ-03', cmd: 'echo \\"start\\"\ngit push origin master', moodie: 'deny', expect: 'ask', flag: false, note: '인용부 밖 `\\"` 뒤 개행 — Step 10 회귀 (수리 전 ask)' },
  { id: 'EQ-04', cmd: 'npm test -- -t \\"guard\\" && git push origin master', moodie: 'deny', expect: 'ask', flag: false, note: '테스트 이름 필터의 `\\"` 뒤 `&&` — 재검수 실측 꼴 (수리 전 ask)' },
  { id: 'EQ-05', cmd: "echo \\'hello\\' && rm -rf dist", moodie: 'deny', expect: 'deny', flag: false, note: "경계 — 인용부 밖 `\\'` 뒤 `&&` (Step 10 뒤에도 deny였다 — 작은따옴표가 `hello\\'`에서 우연히 닫힘)" },
  { id: 'EQ-06', cmd: "bash <<'EOF'\necho \\\"a\\\" && rm -rf dist\nEOF", moodie: 'deny', expect: 'deny', flag: false, note: 'heredoc 본문(실행 소비자 bash)의 인용부 밖 `\\"` — Step 10 회귀 (수리 전 deny)' },
  { id: 'EQ-07', cmd: "cat > x.sh <<'EOF'\necho \\\"a\\\"\nrm -rf dist\nEOF", moodie: 'deny', expect: 'deny', flag: false, note: 'heredoc 본문(파일 sink)의 인용부 밖 `\\"` 뒤 개행 — Step 10 회귀 (수리 전 deny)' },
  { id: 'EQ-08', cmd: 'echo \\\\"a" && rm -rf dist', moodie: 'deny', expect: 'deny', flag: false, note: '경계 — `\\\\` 뒤의 `"`는 이스케이프가 아니라 인용을 연다 (닫힌 뒤 `&&`)' },
  { id: 'EQ-09', cmd: "echo 'a\\' && rm -rf dist", moodie: 'deny', expect: 'deny', flag: false, note: '경계 — 작은따옴표 안의 백슬래시는 이스케이프가 아니다 (`\'a\\\'`에서 닫힘)' },
  // ── 공개류: push (Moodie L58 · ask=차단 동등)
  { id: 'PU-01', cmd: 'git push origin main', moodie: 'deny', expect: 'allow', flag: false, note: '일반 push는 무출력 — master는 서버 보호가 지킨다 (M05 H1, 종전 ask)' },
  { id: 'PU-02', cmd: 'git push --force origin main', moodie: 'deny', expect: 'deny', flag: false, note: '이력 손실은 질의 없이 차단' },
  { id: 'PU-03', cmd: 'git push --force-with-lease origin main', moodie: 'deny', expect: 'deny', flag: false, note: '안전 강제도 원격 이력을 덮어쓴다 — 차단 (M05 H1, 종전 ask)' },
  { id: 'PU-04', cmd: 'git -C repo push', moodie: 'deny', expect: 'allow', flag: false, note: '전역 옵션 접두의 일반 push — 무출력 (M05 H1, 종전 ask)' },
  { id: 'PU-05', cmd: 'git -C repo push origin HEAD:master', moodie: 'deny', expect: 'ask', flag: false, note: 'master가 보이는 push는 질의 — 전역 옵션 접두 (M05 H1)' },
  { id: 'PU-06', cmd: 'git push origin --delete feature/x', moodie: 'deny', expect: 'ask', flag: false, note: '원격 삭제 push는 질의 (M05 H1)' },
  { id: 'PU-07', cmd: 'git push origin +feature/x', moodie: 'deny', expect: 'deny', flag: false, note: '+refspec은 강제 갱신 — 차단 (M05 H1)' },
  // ── 공개류: npm publish (Moodie L59~60) · gh (Moodie 무규칙)
  { id: 'NP-01', cmd: 'npm publish', moodie: 'deny', expect: 'ask', flag: false, note: '레지스트리 공개' },
  { id: 'NP-02', cmd: 'npm publish --access public', moodie: 'deny', expect: 'ask', flag: false, note: '플래그 부착' },
  { id: 'NP-03', cmd: 'echo npm publish', moodie: 'deny', expect: 'allow', flag: false, note: '언급 오탐 — 머리 토큰 판정 미적용 (Backlog 1)' },
  { id: 'GH-01', cmd: 'gh pr create --fill', moodie: 'allow', expect: 'allow', flag: false, note: 'PR 생성은 자율 — 병합만 승인 (M04 헌법 10조 개정, 종전 ask)' },
  { id: 'GH-04', cmd: 'gh pr merge 12', moodie: 'allow', expect: 'deny', flag: false, note: 'PR 병합은 사람의 버튼으로만 — 가드 차단 (M07 G12, 종전 M04 ask)' },
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
  // 래퍼·셸 연쇄를 넓힌 만큼의 오탐 표면을 양방향으로 고정한다 (M03 Phase 2 Step 2)
  { id: 'OK-07', cmd: 'git commit -m \'bash -c "rm -rf x" 회귀 수정\'', moodie: 'deny', expect: 'allow', flag: false, note: '커밋 메시지 안의 셸 연쇄 서술 — 명령으로 읽지 않는다' },
  { id: 'OK-08', cmd: 'echo \'env FOO=1 rm -rf x\'', moodie: 'deny', expect: 'allow', flag: false, note: 'echo 인용문 안의 래퍼 서술 — 명령으로 읽지 않는다' },
  { id: 'OK-09', cmd: 'echo \'sh -c "git push origin master"\'', moodie: 'allow', expect: 'allow', flag: false, note: 'echo 인용문 안의 push 서술 — 질의도 띄우지 않는다' },
  // 셸 `-c` 재판정을 넓힌 만큼의 오탐 표면 (M03 Phase 4 Step 10) — 인용문 안 서술과 무해한 셸 실행은 계속 통과한다
  { id: 'OK-10', cmd: 'git commit -m \'bash -ce "git push origin master" 회귀 수정\'', moodie: 'deny', expect: 'allow', flag: false, note: '커밋 메시지 안의 묶음 플래그 서술 — 명령으로 읽지 않는다' },
  { id: 'OK-11', cmd: 'echo \'bash -c -x "rm -rf x"\'', moodie: 'deny', expect: 'allow', flag: false, note: 'echo 인용문 안의 -c 뒤 옵션 서술 — 명령으로 읽지 않는다' },
  { id: 'OK-12', cmd: 'echo "sh -c \\"git push origin master\\""', moodie: 'allow', expect: 'allow', flag: false, note: 'echo 인용문 안의 이스케이프 중첩 서술 — 질의도 띄우지 않는다' },
  { id: 'OK-13', cmd: 'git commit -m "fix: sh -c \\"rm -rf x\\" 회귀"', moodie: 'allow', expect: 'allow', flag: false, note: '커밋 메시지 안의 이스케이프 따옴표 — 명령으로 읽지 않는다' },
  { id: 'OK-14', cmd: 'bash -c "git status"', moodie: 'allow', expect: 'allow', flag: false, note: '무해한 셸 실행 — 재판정해도 통과' },
  { id: 'OK-15', cmd: 'bash -ce "git status"', moodie: 'allow', expect: 'allow', flag: false, note: '묶음 플래그의 무해한 셸 실행 — 재판정해도 통과' },
  { id: 'OK-16', cmd: 'bash -c -- "npm test"', moodie: 'allow', expect: 'allow', flag: false, note: '`--` 뒤의 무해한 셸 실행 — 재판정해도 통과' },
  { id: 'OK-17', cmd: 'bash -x run.sh', moodie: 'allow', expect: 'allow', flag: false, note: '-c 없는 셸 실행 — 파일 operand는 스크립트 문자열이 아니다' },
  // 인용부 밖 `\"` 판독의 오탐 표면 (M03 Phase 4 Step 13) — 같은 원인으로 수리 전 allow가 deny로 바뀐 두 꼴과 경계 하나
  { id: 'OK-18', cmd: 'echo \\"note\\" && git commit -m "fix; rm -rf dist 회귀"', moodie: 'deny', expect: 'allow', flag: false, note: '인용부 밖 `\\"` 뒤의 커밋 메시지 서술 — Step 10 오탐 (수리 전 allow)' },
  { id: 'OK-19', cmd: 'echo \\"a\\" "; rm -rf dist ;"', moodie: 'deny', expect: 'allow', flag: false, note: '인용부 밖 `\\"` 뒤의 인용문 서술 — Step 10 오탐 (수리 전 allow)' },
  { id: 'OK-20', cmd: 'echo \\\\" && git push origin master "', moodie: 'deny', expect: 'allow', flag: false, note: '경계 — `\\\\` 뒤의 `"`가 연 인용 안의 서술 (echo만 실행된다)' },
]

// payload 축 — 명령 문자열이 아니라 입력 자체를 겨눈다 (Moodie는 fail-open, AgentDeck은 fail-closed)
const PAYLOAD_ROWS = [
  { id: 'FC-01', raw: '', moodie: 'allow', expect: 'deny', flag: false, note: '빈 stdin — 판정 불능은 차단' },
  { id: 'FC-02', raw: '{not json', moodie: 'allow', expect: 'deny', flag: false, note: '파손 JSON — 판정 불능은 차단' },
  { id: 'FC-03', payload: { tool_name: 'Read', tool_input: { file_path: 'a.ts' } }, moodie: 'allow', expect: 'allow', flag: false, note: '판정 대상 없음 — 조용히 통과' },
]

// 가드와 앱 잠금 노드(mergeDeny.ts)의 같음 (M09 G3) — 두 판정기의 래퍼 표는 주석상 같은 표다(가드 WRAPPER_SPECS, 앱 WRAPPERS).
//   이 구획은 M02 기준표(사람용 정본)의 행이 아니라 따로 둔다. Moodie 열이 없다.
//   ① 두 표의 행 글이 같다(env 행의 `-S` 판독 칸 포함). ② 같은 명령에 두 판정기가 같은 병합 판정을 낸다 — 가드는 spawn,
//   앱은 Node의 타입 지우기로 mergeDeny.ts를 직접 읽는다(로컬·CI 모두 Node 24). 병합 축만 비교한다 — 앱 노드는 병합만 본다.
const APP_MERGE_DENY = join(REPO_ROOT, '02_Project', '00_Source', 'main', '04_Claude', 'permission', 'mergeDeny.ts')
const GUARD_SOURCE = join(REPO_ROOT, '.claude', 'hooks', 'dangerous-cmd-guard.mjs')
const ENV_SPLIT_ROWS = [
  { id: 'ES-01', cmd: 'env -S "gh pr merge 1"', expect: 'deny' },
  { id: 'ES-02', cmd: 'env -S"gh pr merge 1"', expect: 'deny' },
  { id: 'ES-03', cmd: 'env -vS "gh pr merge 1"', expect: 'deny' },
  { id: 'ES-04', cmd: 'env --split-string="gh pr merge 1"', expect: 'deny' },
  { id: 'ES-05', cmd: 'env -S "gh api -X PUT repos/o/r/pulls/1/merge"', expect: 'deny' },
  { id: 'ES-06', cmd: 'env --split-string "gh pr merge 1"', expect: 'deny' },
  { id: 'ES-07', cmd: 'env --sp "gh pr merge 1"', expect: 'deny' },
  { id: 'ES-08', cmd: 'env -S "-i FOO=1 gh pr merge 1"', expect: 'deny' },
  { id: 'ES-09', cmd: 'env -S "bash -c" "gh pr merge 1"', expect: 'deny' },
  { id: 'ES-10', cmd: 'env -u X -S "gh pr merge 1"', expect: 'deny' },
  { id: 'ES-11', cmd: 'env -S "npm test"', expect: 'allow' },
  { id: 'ES-12', cmd: 'env FOO=1 npm test', expect: 'allow' },
  { id: 'ES-13', cmd: 'env -u X ls', expect: 'allow' },
  { id: 'ES-14', cmd: 'env -S "npm test" "a; gh pr merge 1"', expect: 'allow' },
  { id: 'ES-15', cmd: 'env -u S npm test', expect: 'allow' },
  { id: 'ES-16', cmd: 'echo \'env -S "gh pr merge 1"\'', expect: 'allow' },
  // G3 검수 반영 — 값 안의 낱말 머리 `#`는 값 끝까지만 주석이고(중요 1), `-a`는 값을 받는다(사소 2)
  { id: 'ES-17', cmd: 'env -S "#" gh pr merge 1', expect: 'deny' },
  { id: 'ES-18', cmd: 'env -S "gh pr #" merge 1', expect: 'deny' },
  { id: 'ES-19', cmd: 'env -S "gh api #" -X PUT repos/o/r/pulls/1/merge', expect: 'deny' },
  { id: 'ES-20', cmd: 'env -S \'FOO="a #b" gh pr merge 1\'', expect: 'deny' },
  { id: 'ES-21', cmd: 'env -S "x #" gh pr merge 1', expect: 'allow' },
  { id: 'ES-22', cmd: 'env -a x -S "gh pr merge 1"', expect: 'deny' },
]
// 세 판정기의 같음 (M11 goal 8 · Backlog 17) — 가드·앱 병합 잠금(mergeDeny)·앱 루프 잠금(loopLock)을 한 표에 돌린다.
//   가드 열은 병합 축이다 — 병합 규칙(MERGE_RULES)으로 차단했으면 deny다. 루프 잠금은 모든 원격 쓰기를 막으므로 push 꼴은 deny가 맞다.
//   note가 있는 행은 의도한 차이다 — 판정기마다 맡은 범위가 달라서 생긴다.
const MERGE_RULES = new Set(['gh-pr-merge', 'gh-api-병합', 'gh-graphql-병합'])
const APP_LOOP_LOCK = join(REPO_ROOT, '02_Project', '00_Source', 'main', '04_Claude', 'permission', 'loopLock.ts')
const LOOP_SCOPE = { repoRoot: 'C:\\work\\repo', appLoopDir: 'C:\\Users\\u\\AppData\\Roaming\\agentdeck\\loop', tempDirs: ['C:\\Users\\u\\AppData\\Local\\Temp'] }
const merged = (id, cmd) => ({ id, cmd, guard: 'deny', merge: 'deny', loop: 'deny' })
const clean = (id, cmd) => ({ id, cmd, guard: 'allow', merge: 'allow', loop: 'allow' })
const THREE_WAY_ROWS = [
  merged('TW-01', 'gh pr merge 1'),
  merged('TW-02', 'timeout -vs KILL 5 gh pr merge 1'),
  merged('TW-03', 'bash -ce "gh pr merge 1"'),
  merged('TW-04', 'bash -c -x "gh pr merge 1"'),
  merged('TW-05', 'eval gh pr merge 1'),
  merged('TW-06', 'eval "gh pr merge 1"'),
  merged('TW-07', 'find . -maxdepth 0 -exec gh pr merge 1 \\;'),
  merged('TW-08', 'iex "gh pr merge 1"'),
  merged('TW-09', 'Invoke-Expression -Command "gh pr merge 1"'),
  merged('TW-10', "Start-Process gh -ArgumentList 'pr merge 1'"),
  merged('TW-11', 'bash +c "gh pr merge 1"'),
  merged('TW-12', 'bash -login -ce "gh pr merge 1"'),
  merged('TW-13', 'zsh.exe -c "gh pr merge 1"'),
  merged('TW-14', 'env -S "gh pr merge 1"'),
  merged('TW-15', 'gh api -X PUT repos/o/r/pulls/1/merge'),
  merged('TW-16', 'Start-Process gh -ArgumentList "pr", "merge", "1"'),
  merged('TW-17', 'Start-Process gh -ArgumentList @("pr","merge","1")'),
  clean('TW-20', 'npm test'),
  clean('TW-21', 'git status'),
  clean('TW-22', 'iex "npm test"'),
  clean('TW-23', 'Start-Process notepad'),
  clean('TW-24', 'bash -login -c "npm test"'),
  clean('TW-25', 'echo gh pr merge 1'),
  clean('TW-26', 'git commit -m "gh pr merge 1 은 막힌다"'),
  { id: 'TW-30', cmd: 'git push origin x', guard: 'allow', merge: 'allow', loop: 'deny', note: '루프 잠금은 모든 push를 막는다' },
  { id: 'TW-31', cmd: 'timeout 5 git push origin x', guard: 'allow', merge: 'allow', loop: 'deny', note: '감싼 push — 루프 잠금만 막는다' },
  { id: 'TW-32', cmd: 'bash -ce "git push origin x"', guard: 'allow', merge: 'allow', loop: 'deny', note: '셸 -c push — 루프 잠금만 막는다' },
  { id: 'TW-33', cmd: 'iex "git push origin x"', guard: 'allow', merge: 'allow', loop: 'deny', note: 'iex push — 루프 잠금만 막는다' },
  { id: 'TW-34', cmd: "Start-Process git -ArgumentList 'push origin x'", guard: 'allow', merge: 'allow', loop: 'deny', note: 'Start-Process push — 루프 잠금만 막는다' },
  // 가드가 자기 판정을 내는 감싼 push — 가드 열은 병합 축이 아니라 날 판정(guardRaw)으로 본다. 가드가 감싼 꼴을 읽는지가 여기서 갈린다
  { id: 'TW-40', cmd: 'timeout 5 git push --force origin x', guard: 'allow', guardRaw: 'deny', merge: 'allow', loop: 'deny' },
  { id: 'TW-41', cmd: 'bash -ce "git push origin master"', guard: 'allow', guardRaw: 'ask', merge: 'allow', loop: 'deny' },
  { id: 'TW-42', cmd: 'iex "git push --force origin x"', guard: 'allow', guardRaw: 'deny', merge: 'allow', loop: 'deny' },
  { id: 'TW-43', cmd: "Start-Process git -ArgumentList 'push --force origin x'", guard: 'allow', guardRaw: 'deny', merge: 'allow', loop: 'deny' },
  { id: 'TW-44', cmd: 'bash -login -ce "git push origin master"', guard: 'allow', guardRaw: 'ask', merge: 'allow', loop: 'deny' },
  { id: 'TW-35', cmd: 'gh api repos/o/r/pulls/1/merge', guard: 'allow', merge: 'deny', loop: 'allow', note: '병합 끝점 읽기 — 가드·루프 잠금은 쓰기만 막고, 병합 잠금은 끝점이 보이면 막는다' },
  { id: 'TW-36', cmd: 'powershell -Command "gh pr merge 1"', guard: 'allow', merge: 'deny', loop: 'deny', note: 'powershell -Command — 가드는 읽지 않는다(M03-24 v2, 설정이 PowerShell 도구를 막는다)' },
]
// 표의 행 — `['이름', { valueOpts: … }]` 꼴의 줄을 글 그대로 모은다
const wrapperRows = (path) => readFileSync(path, 'utf8').split('\n').map((l) => l.trim()).filter((l) => /^\['[a-z]+', \{ valueOpts: /.test(l))

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

  // ── 가드와 앱 잠금 노드의 같음 (M09 G3) ─────────────────────────────────────
  {
    const guardRows = wrapperRows(GUARD_SOURCE)
    const appRows = wrapperRows(APP_MERGE_DENY)
    r.check('래퍼 표 — 가드와 앱 잠금 노드의 행 글이 같다', guardRows.length > 0 && JSON.stringify(guardRows) === JSON.stringify(appRows),
      `가드 ${guardRows.length}행 · 앱 ${appRows.length}행`)
    const envRow = guardRows.find((l) => l.startsWith("['env',"))
    r.check('래퍼 표 — env 행에 -S 판독 칸이 있다', /split: \{ short: 'S'/.test(envRow ?? ''), envRow ?? '(env 행 없음)')
    const { mergeDenyReason } = await import(pathToFileURL(APP_MERGE_DENY).href)
    for (const row of ENV_SPLIT_ROWS) {
      const guard = h.verdict(row.cmd)
      const app = mergeDenyReason(row.cmd) === null ? 'allow' : 'deny'
      if (report) console.log(`${row.id}\t가드 ${guard}\t앱 ${app}\t기대 ${row.expect}`)
      r.judge(`${label(row)} 가드`, guard, row.expect)
      r.judge(`${label(row)} 앱`, app, row.expect)
    }

    // 세 판정기 (M11 goal 8 · Backlog 17) — loopLock.ts는 확장자 없는 './mergeDeny'를 import하므로 해석 훅으로 `.ts`를 붙인다
    registerHooks({
      resolve(spec, ctx, next) {
        try { return next(spec, ctx) } catch (e) {
          if (/^\.\.?\//.test(spec) && !/\.[cm]?[jt]s$/.test(spec)) return next(`${spec}.ts`, ctx)
          throw e
        }
      },
    })
    const { loopCommandReason } = await import(pathToFileURL(APP_LOOP_LOCK).href)
    for (const row of THREE_WAY_ROWS) {
      const res = h.run(row.cmd)
      const last = h.logLines().at(-1)
      const guard = res.code === 2 && last?.verdict === 'deny' && MERGE_RULES.has(last?.rule) ? 'deny' : 'allow'
      const merge = mergeDenyReason(row.cmd) === null ? 'allow' : 'deny'
      const loop = loopCommandReason(row.cmd, LOOP_SCOPE) === null ? 'allow' : 'deny'
      if (report) console.log(`${row.id}\t가드 ${guard}\t병합잠금 ${merge}\t루프잠금 ${loop}`)
      r.judge(`${label(row)} 가드(병합 축)`, guard, row.guard, { note: row.note })
      if (row.guardRaw) {
        const raw = res.code === 2 ? 'deny' : /"permissionDecision"\s*:\s*"ask"/.test(res.stdout) ? 'ask' : 'allow'
        r.judge(`${label(row)} 가드(날 판정)`, raw, row.guardRaw)
      }
      r.judge(`${label(row)} 병합 잠금`, merge, row.merge, { note: row.note })
      r.judge(`${label(row)} 루프 잠금`, loop, row.loop, { note: row.note })
    }
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
