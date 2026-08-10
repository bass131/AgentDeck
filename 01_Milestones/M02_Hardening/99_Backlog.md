# Backlog — 나중에 고칠지 판단할 내역 (M02)

작업 중에 발견됐지만 그 자리에서 고치지 않기로 한 항목을 모아 두는 표면입니다.
근거는 Preview 제약 절의 「계획 밖 변경 금지 — 발견은 Backlog 보고」 규율입니다.
M01에서 이관된 검수 발견 1~15번의 정본은 `01_Milestones/M01_Bootstrap/99_Backlog.md`이고, 이 파일은 M02 실행 중에 새로 나온 것만 담습니다.

## 대기 항목

1. **collection-baseline 기준선과 Phase 1의 테스트 파일 증가** (Phase 1 관찰, 2026-08-10) — `02_Project/01_TestCode/collection-baseline.test.ts`의 `BASELINE_TEST_FILES`는 402이고 판정이 「이상」(`toBeGreaterThanOrEqual`)이라 Phase 1이 더한 vitest 파일 1건(`hooks/tdd-guard-hook-test-recognition.test.ts`)은 지금 통과에 영향이 없습니다. 다만 Phase 5가 이 판정을 정확값 등호로 전환할 때 기준선을 실측으로 다시 세어야 합니다 — 계획 문면의 402를 그대로 쓰면 등호가 어긋납니다.
2. **경로 접두 git 실행 파일은 머리 토큰 판정 밖** (Phase 2 관찰, 2026-08-10) — Step 2가 명시한 초과 표면은 `git.exe`와 대문자 `Git` 둘이라 그대로만 수리했습니다. `C:\Program Files\Git\bin\git.exe reset --hard`처럼 디렉터리 접두가 붙은 형태는 머리 토큰이 `git`도 `git.exe`도 아니어서 지금은 통과합니다. 수리는 basename 판정 한 줄이면 되지만 계획 밖 확대라 손대지 않았습니다.
3. **래퍼 뒤 환경변수 할당은 명령 위치 연쇄를 끊는다** (Phase 2 관찰, 2026-08-10) — 명령 위치는 머리 토큰에서 래퍼(`sudo`·`xargs` 류)를 따라 이어집니다. 그래서 `env FOO=1 rm -rf x`는 `env` 다음 토큰이 `FOO=1`이라 연쇄가 끊기고 `rm`이 명령 위치로 인정되지 않습니다. `env`의 `VAR=값` 토큰만 건너뛰면 되지만, 넓히는 만큼 인용문 오탐 표면도 같이 늘어나 판단이 필요합니다.
4. **`dd of=` heredoc sink 픽스처는 두 규칙이 함께 잡는다** (Phase 2 관찰, 2026-08-10) — `cmd-guard-surface.test.mjs`의 HD-14(`cat <<'EOF' | dd of=run.sh`)는 heredoc sink 판별로도, 기존 「디스크 직접 조작」 규칙으로도 deny입니다. 기대 판정은 맞지만 heredoc 판별만 따로 겨누지는 못하므로, sink 판별의 단독 증거는 HD-15(`sponge`)와 ⓕⓖ가 owns합니다.
