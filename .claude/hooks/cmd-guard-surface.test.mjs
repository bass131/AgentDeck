#!/usr/bin/env node
// 위험 명령 가드 — 수리 표면 테스트 (M02 Phase 2 Step 2·3·6).
//
// 이 파일이 겨누는 것은 셋이다.
//   ① Moodie 초과 표면 (Backlog 9) — `git.exe`·대문자 `Git` 머리 토큰, `git branch` 삭제+강제 동치 전건,
//      `git stash drop`·`clear`, `git checkout .`. 원본도 못 잡던 표면이라 「동등 이상」의 초과분이다.
//   ② heredoc pipeline 하류 소비자 판별 (Step 3) — 양방향 픽스처 일곱(ⓐ~ⓖ).
//      면제는 실행되지 않는 소비자뿐이다(`git commit -F -`·operand 없는 `cat`·operand 없는 `tee`).
//      파일 sink(리다이렉트·`tee FILE`·`dd of=`·`sponge`)는 데이터 소비자가 아니라 판별 불가로 보고 스캔을 유지한다 —
//      본문이 파일로 남으면 뒤이은 `bash run.sh`에는 위험 원문이 없어 가드가 잡을 자리가 사라진다 (fail-closed).
//   ③ 읽기 전용 오탐 (Backlog 10) — `git config --global --get` 류는 통과해야 한다.
//
// 격리 — 가드 spawn은 공통 헬퍼(_lib/guard-spawn.mjs)만 쓴다. 직접 spawn 금지 규칙의 검사는
//   dangerous-cmd-guard.test.mjs가 소유한다.
import { createRunner } from './_lib/runner.mjs'
import { createGuardHarness } from './_lib/guard-spawn.mjs'

// ── ① Moodie 초과 표면 ────────────────────────────────────────────────────────
const SURFACE = [
  // 머리 토큰 — 실행 파일명·대소문자
  { id: 'SX-01', cmd: 'git.exe reset --hard', expect: 'deny', note: '실행 파일명 머리 토큰' },
  { id: 'SX-02', cmd: 'Git reset --hard', expect: 'deny', note: '대문자 머리 토큰' },
  { id: 'SX-03', cmd: 'GIT.EXE reset --hard', expect: 'deny', note: '대문자 + 실행 파일명' },
  { id: 'SX-04', cmd: 'git.exe push origin main', expect: 'ask', note: '초과 표면도 비가역 축을 탄다' },
  { id: 'SX-05', cmd: 'gitk --all', expect: 'allow', note: 'git 접두 다른 명령 — 오탐 금지' },
  // git branch — 삭제 플래그와 강제 플래그의 동치 전건
  { id: 'SX-06', cmd: 'git branch --delete --force feature', expect: 'deny', note: '긴 플래그 동치' },
  { id: 'SX-07', cmd: 'git branch --force --delete feature', expect: 'deny', note: '긴 플래그 순서 역전' },
  { id: 'SX-08', cmd: 'git branch -d -f feature', expect: 'deny', note: '분리 동치' },
  { id: 'SX-09', cmd: 'git branch -f -d feature', expect: 'deny', note: '분리 순서 역전' },
  { id: 'SX-10', cmd: 'git branch -df feature', expect: 'deny', note: '소문자 결합 동치' },
  { id: 'SX-11', cmd: 'git branch -fd feature', expect: 'deny', note: '소문자 결합 순서 역전' },
  { id: 'SX-12', cmd: 'git branch -D feature', expect: 'deny', note: '대문자 D 회귀 불변식' },
  { id: 'SX-13', cmd: 'git branch -d merged', expect: 'allow', note: '안전 삭제 — 오탐 금지' },
  { id: 'SX-14', cmd: 'git branch --delete merged', expect: 'allow', note: '안전 삭제 긴 플래그 — 오탐 금지' },
  { id: 'SX-15', cmd: 'git branch --list', expect: 'allow', note: '읽기 — 오탐 금지' },
  // git stash — 폐기 축
  { id: 'SX-16', cmd: 'git stash drop', expect: 'deny', note: '스태시 폐기' },
  { id: 'SX-17', cmd: 'git stash drop stash@{0}', expect: 'deny', note: '대상 지정 폐기' },
  { id: 'SX-18', cmd: 'git stash clear', expect: 'deny', note: '스태시 전량 폐기' },
  { id: 'SX-19', cmd: 'git stash list', expect: 'allow', note: '읽기 — 오탐 금지' },
  { id: 'SX-20', cmd: 'git stash push -m wip', expect: 'allow', note: '보존 방향 — 오탐 금지' },
  // git checkout — 점 경로
  { id: 'SX-21', cmd: 'git checkout .', expect: 'deny', note: '점 경로 전량 복원' },
  { id: 'SX-22', cmd: 'git checkout --', expect: 'deny', note: '경로 없는 `--`' },
  { id: 'SX-23', cmd: 'git checkout main', expect: 'allow', note: '브랜치 전환 — 오탐 금지' },
  { id: 'SX-24', cmd: 'git checkout -b feature', expect: 'allow', note: '브랜치 생성 — 오탐 금지' },
  // 명령 위치 판정 — 머리 토큰 밖의 래퍼는 살리고, 인용문 속 같은 낱말은 잡지 않는다
  { id: 'SX-25', cmd: 'sudo rm -rf /tmp/x', expect: 'deny', note: '래퍼 뒤도 명령 위치다' },
  { id: 'SX-26', cmd: 'find . -name x -exec rm -rf {} ;', expect: 'deny', note: 'find -exec 뒤도 명령 위치다' },
  { id: 'SX-27', cmd: 'git commit -m "sudo rm -rf 얘기"', expect: 'allow', note: '인용문 속 래퍼 — 오탐 금지' },
  { id: 'SX-28', cmd: 'git commit -m "-exec rm -rf 얘기"', expect: 'allow', note: 'find 밖의 -exec — 오탐 금지' },
]

// ── ② heredoc pipeline 양방향 픽스처 (ⓐ~ⓖ) ───────────────────────────────────
const BODY_PUSH = 'git push origin main'
const BODY_RESET = 'git reset --hard'
const heredoc = (head, body) => `${head}\n${body}\nEOF`
const HEREDOC = [
  { id: 'HDⓐ', cmd: heredoc("git commit -F - <<'EOF'", BODY_PUSH), expect: 'allow', note: '면제 — 커밋 메시지 소비자뿐' },
  { id: 'HDⓑ', cmd: heredoc("cat <<'EOF'", BODY_RESET), expect: 'allow', note: '면제 — operand 없는 cat(표준 출력)뿐' },
  { id: 'HDⓒ', cmd: heredoc("bash <<'EOF'", BODY_RESET), expect: 'deny', note: '차단 유지 — 실행 소비자 bash' },
  { id: 'HDⓓ', cmd: heredoc("cat <<'EOF' | bash", BODY_RESET), expect: 'deny', note: '차단 유지 — 하류 실행 소비자' },
  { id: 'HDⓔ', cmd: heredoc("cat <<'EOF' | grep -v x | sh", BODY_RESET), expect: 'deny', note: '차단 유지 — 전수 소비자 중 sh' },
  { id: 'HDⓕ', cmd: heredoc("cat <<'EOF' > run.sh", BODY_RESET), expect: 'deny', note: '차단 유지 — 리다이렉트 파일 sink' },
  { id: 'HDⓖ', cmd: heredoc("cat <<'EOF' | tee run.sh", BODY_RESET), expect: 'deny', note: '차단 유지 — tee FILE 파일 sink' },
  // 면제·비면제 경계를 더 좁힌다
  { id: 'HD-11', cmd: heredoc("cat <<'EOF' | tee", BODY_RESET), expect: 'allow', note: '면제 — operand 없는 tee' },
  { id: 'HD-12', cmd: heredoc("cat <<'EOF' | git commit -F -", BODY_RESET), expect: 'allow', note: '면제 — 전수 소비자가 둘 다 면제' },
  { id: 'HD-13', cmd: heredoc("cat <<'EOF' | node", BODY_RESET), expect: 'deny', note: '차단 유지 — 실행 소비자 node' },
  { id: 'HD-14', cmd: heredoc("cat <<'EOF' | dd of=run.sh", BODY_RESET), expect: 'deny', note: '차단 유지 — dd of= 파일 sink' },
  { id: 'HD-15', cmd: heredoc("cat <<'EOF' | sponge run.sh", BODY_RESET), expect: 'deny', note: '차단 유지 — 판별 불가 소비자' },
  { id: 'HD-16', cmd: heredoc("cat <<'EOF' >> run.sh", BODY_RESET), expect: 'deny', note: '차단 유지 — 덧붙임 리다이렉트' },
  { id: 'HD-17', cmd: heredoc("cat <<'EOF' && bash run.sh", BODY_RESET), expect: 'deny', note: '차단 유지 — 같은 줄의 후속 실행' },
  { id: 'HD-18', cmd: `${heredoc("cat <<'EOF'", BODY_RESET)}\ngit push origin main`, expect: 'ask', note: '종료 표지 뒤 명령은 계속 판정한다' },
  { id: 'HD-19', cmd: heredoc('cat <<EOF', BODY_RESET), expect: 'allow', note: '면제 — 따옴표 없는 종료 표지' },
  { id: 'HD-20', cmd: "cat <<-EOF\n\tgit reset --hard\n\tEOF", expect: 'allow', note: '면제 — `<<-` 들여쓰기 형태' },
]

// ── ③ 읽기 전용 오탐 (Backlog 10) ─────────────────────────────────────────────
const CONFIG = [
  { id: 'CFG-01', cmd: 'git config --global --get user.name', expect: 'allow', note: '읽기 전용 — 오탐 금지' },
  { id: 'CFG-02', cmd: 'git config --global --get-all user.email', expect: 'allow', note: '읽기 전용' },
  { id: 'CFG-03', cmd: 'git config --global --get-regexp ^user', expect: 'allow', note: '읽기 전용' },
  { id: 'CFG-04', cmd: 'git config --global --list', expect: 'allow', note: '읽기 전용' },
  { id: 'CFG-05', cmd: 'git config --global -l', expect: 'allow', note: '읽기 전용 축약' },
  { id: 'CFG-06', cmd: 'git config --global user.name x', expect: 'deny', note: '쓰기 — 회귀 불변식' },
  { id: 'CFG-07', cmd: 'git config --global --unset user.name', expect: 'deny', note: '쓰기 — 회귀 불변식' },
]

const r = createRunner('cmd-guard 수리 표면 (Phase 2 Step 2·3·6)')
const h = createGuardHarness('dangerous-cmd-guard.mjs')
const label = (row) => `${row.id} \`${row.cmd.replace(/\n/g, '\\n').replace(/\t/g, '\\t')}\``

try {
  for (const group of [SURFACE, HEREDOC, CONFIG]) {
    for (const row of group) r.judge(label(row), h.verdict(row.cmd), row.expect, { note: row.note })
  }
} finally {
  h.cleanup()
}

process.exit(r.summary())
