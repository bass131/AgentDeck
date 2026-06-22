# Phase 04: f2-visual-regression

## 목표
F2(파일타입 아이콘·탐색기 개편·사이드바 비주얼)가 실제 런타임에서 검증되고, 스크린샷으로 충실도가 육안 확인되며, 기존 e2e/단위 회귀가 0이다.

## 담당 도메인 / 에이전트
qa (tests). 통합/점검 = reviewer 조건부. 앱 코드 R only.

## 의존 Phase
01, 02, 03.

## 위험 깃발
없음 (테스트 전용).

## 변경 대상 (이 경계 밖 금지)
- `tests/e2e/visual-viewer.e2e.ts` 또는 `tests/e2e/shell.e2e.ts` — 탐색기 파일타입 아이콘/검색/접기 + 사이드바 구조 단언 + 스크린샷
- `tests/renderer/**` — FileExplorer/Sidebar 회귀 보강(필요 시)

## 작업 단계
1. e2e: 탐색기에 파일배지(.ftbadge 또는 fileType 클래스) 존재 + 디렉토리 접기 토글 동작 + 검색 입력 필터 + 사이드바 브랜딩/풋 DOM 단언.
2. 시각검증: 다크/라이트 양 테마 탐색기+사이드바 스크린샷(explorer-dark/light) → 원본 대조. Claude 육안.
3. 기존 e2e(8~14) + 단위 전체 회귀 PASS.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run test:e2e` 전체 PASS(기존 + F2 신규).
- [ ] `npm run test:e2e:visual` 스크린샷 + 육안 충실도(파일타입 컬러 아이콘·검색·접이식 트리·사이드바 브랜딩/풋).
- [ ] `npm test` 전체 단위 PASS(회귀 0).
- [ ] reviewer 위반 0 — 안티슬롭(벡터아이콘·인라인색상0)·동작보존 점검.

## 참조
docs/UI_FIDELITY.md(F2 타깃) · 메모리 시각검증 정식화 · phases/03_fidelity/06-shell-integration-visual.md(패턴).
