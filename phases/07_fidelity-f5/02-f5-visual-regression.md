# Phase 02: f5-visual-regression

## 목표
F5(모달 크롬 + 얇은 스크롤바 + 설정 모달)가 런타임에서 검증되고, 스크린샷으로 충실도 육안 확인, 회귀 0.

## 담당 도메인 / 에이전트
qa (tests). 점검 = reviewer. 앱 코드 R only.

## 의존 Phase
01.

## 위험 깃발
없음 (테스트 전용).

## 변경 대상 (이 경계 밖 금지)
- `tests/e2e/shell.e2e.ts` 또는 신규 — 설정 트리거 → 모달(`.modal-overlay`/`.modal-card`) DOM 단언 + 스크린샷
- `tests/renderer/**` — Modal/SettingsModal 회귀 보강

## 작업 단계
1. e2e: 설정 버튼 클릭 → `.modal-overlay` + `.modal-card` 헤더 표시, Esc/오버레이 닫기. DOM 단언.
2. 시각검증: 설정 모달(backdrop blur + 카드 + 좌nav) 다크/라이트 스크린샷 → 원본 04-settings 대조. Claude 육안.
3. 기존 e2e + 단위 전체 회귀 PASS.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run test:e2e` 전체 PASS(기존 + F5).
- [ ] `npm run test:e2e:visual` 모달 스크린샷 + 육안 충실도(backdrop·카드·좌nav).
- [ ] `npm test` 전체 단위 PASS(회귀 0).
- [ ] reviewer 위반 0 — 안티슬롭(모달 blur 허용)·scope(설정 콘텐츠 M5 placeholder)·신뢰경계 점검.

## 참조
docs/UI_FIDELITY.md(F5) · 라이브 04-settings.png · phases/06_fidelity-f4/02-f4-visual-regression.md(패턴).
