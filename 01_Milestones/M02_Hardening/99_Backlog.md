# Backlog — 나중에 고칠지 판단할 내역 (M02)

작업 중에 발견됐지만 그 자리에서 고치지 않기로 한 항목을 모아 두는 표면입니다.
근거는 Preview 제약 절의 「계획 밖 변경 금지 — 발견은 Backlog 보고」 규율입니다.
M01에서 이관된 검수 발견 1~15번의 정본은 `01_Milestones/M01_Bootstrap/99_Backlog.md`이고, 이 파일은 M02 실행 중에 새로 나온 것만 담습니다.

## 대기 항목

1. **collection-baseline 기준선과 Phase 1의 테스트 파일 증가** (Phase 1 관찰, 2026-08-10) — `02_Project/01_TestCode/collection-baseline.test.ts`의 `BASELINE_TEST_FILES`는 402이고 판정이 「이상」(`toBeGreaterThanOrEqual`)이라 Phase 1이 더한 vitest 파일 1건(`hooks/tdd-guard-hook-test-recognition.test.ts`)은 지금 통과에 영향이 없습니다. 다만 Phase 5가 이 판정을 정확값 등호로 전환할 때 기준선을 실측으로 다시 세어야 합니다 — 계획 문면의 402를 그대로 쓰면 등호가 어긋납니다.
