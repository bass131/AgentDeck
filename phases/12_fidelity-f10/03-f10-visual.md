# Phase 03: f10-visual

## 목표
RecentFiles 탭바(라이브) + 패널 강화 e2e/단위 + 스크린샷으로 F10 시각 1:1 검증.

## 담당 도메인 / 에이전트
qa (tests/). 등급: 보통.

## 의존 Phase
F10-02.

## 위험 깃발
없음 (테스트만).

## 변경 대상 (이 경계 밖 금지)
- `tests/e2e/visual-viewer.e2e.ts` — RecentFiles 라이브 검증: 탐색기 파일 2개 클릭 → 코드 패널 위 `.chat-files .cf-tab` 2개 표시 + 활성 .on + 스샷. (todo/서브에이전트 populated는 라이브 데이터 없음=단위 전담.)
- (선택) `tests/renderer/` — AgentPanel populated(샘플 todos/subagents) 시각은 F10-02 단위에서 커버.

## 작업 단계
1. 탐색기에서 파일 2개 클릭(sample.ts, README.md) → `.chat-files .cf-tab` 2개 단언 + 활성 탭 .on + 스샷(recentfiles-tabs.png).
2. cf-x로 탭 1개 제거 → 1개 남음.
3. (단위) AgentPanel 샘플 주입 시각은 F10-02 단위 스냅샷/단언 — e2e 비대상(라이브 빈상태).

## 완료조건 (AC — 측정 가능)
- [ ] `npm run test:e2e` 전체 PASS(회귀 0 + RecentFiles 탭바 e2e).
- [ ] RecentFiles 탭바 스크린샷 생성 — 원본 대조(cf-tab badge/name/x/active).
- [ ] **패널 todo/서브에이전트 populated = 단위(F10-02) 전담**(라이브 데이터 M4 → e2e 비대상). 약속-구현 간극 없음.
- [ ] 전체 게이트 green: typecheck·test·test:e2e·lint.

## 참조
원본 RecentFiles/AgentPanel · REPLICA_GAP F10 · 기존 visual-viewer 패턴.
