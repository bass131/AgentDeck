# Phase 03: f13-visual

## 목표
멀티 토글→그리드·패널·확장 모달 e2e + 스크린샷으로 F13 시각 1:1 검증.

## 담당 도메인 / 에이전트
qa (tests/). 등급: 보통.

## 의존 Phase
F13-02.

## 위험 깃발
없음 (테스트만).

## 변경 대상 (이 경계 밖 금지)
- `tests/e2e/visual-viewer.e2e.ts`(또는 shell.e2e) — 사이드바 멀티 토글 → `.multi`/`.ma-grid` 표시 + 패널 N + ma-head count 탭 + 스샷 + count 탭 변경 + 패널 「크게 보기」 → ma-expand-overlay + 스샷 + Esc + 단일 토글 복귀(상태 정리).

## 작업 단계
1. 사이드바 「멀티 에이전트」 토글 클릭 → `.ma-grid` 표시 + `.ma-panel` ≥2 + 스샷(multiagent-grid.png).
2. ma-count 6 클릭 → 패널 6 + 스샷(multiagent-6.png 선택).
3. 패널 「크게 보기」 → `.ma-expand-overlay` + 스샷(multiagent-expand.png) + Esc 닫기.
4. 「단일 에이전트」 토글 → 단일 셸 복귀(후속 e2e 비오염).

## 완료조건 (AC — 측정 가능)
- [ ] `npm run test:e2e` 전체 PASS(회귀 0 + F13 그리드 e2e).
- [ ] MultiWorkspace 그리드·확장 모달 스크린샷 생성 — 원본 대조.
- [ ] 단일 모드 복귀로 후속 e2e 비오염.
- [ ] 전체 게이트 green: typecheck·test·test:e2e·lint.

## 참조
원본 MultiAgent.tsx · REPLICA_GAP F13 · F8 사이드바 모드 토글.
