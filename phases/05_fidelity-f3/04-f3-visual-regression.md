# Phase 04: f3-visual-regression

## 목표
F3(빈채팅·메시지버블·리치컴포저·게이지·툴카드)가 실제 런타임에서 검증되고, 스크린샷으로 충실도가 육안 확인되며, 기존 e2e/단위 회귀가 0이다.

## 담당 도메인 / 에이전트
qa (tests). 점검 = reviewer 조건부. 앱 코드 R only.

## 의존 Phase
01, 02, 03.

## 위험 깃발
없음 (테스트 전용).

## 변경 대상 (이 경계 밖 금지)
- `tests/e2e/visual-viewer.e2e.ts` 또는 신규 — 빈채팅·컴포저·게이지·툴카드 DOM 단언 + 스크린샷
- `tests/renderer/**` — Conversation/Composer/ToolCallCard 회귀 보강

## 작업 단계
1. e2e: 빈 채팅 `.welcome`+`.wc-card`×4 + 컴포저 `.composer`+피커 3 + 게이지 3 DOM 단언. 대화 전송 후 user/assistant 버블 + 툴카드 `.t-row` 단언.
2. 시각검증: 다크/라이트 양 테마 채팅(빈상태) + 대화(메시지+툴) 스크린샷(chat-empty-dark/light, chat-msg) → 원본 대조. Claude 육안.
3. 기존 e2e + 단위 전체 회귀 PASS.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run test:e2e` 전체 PASS(기존 + F3 신규).
- [ ] `npm run test:e2e:visual` 스크린샷 + 육안 충실도(추천칩·메시지버블·컴포저 피커/게이지·툴카드 t-row).
- [ ] `npm test` 전체 단위 PASS(회귀 0).
- [ ] reviewer 위반 0 — 안티슬롭·신뢰경계·scope(피커/게이지 placeholder, M4 미침범) 점검.

## 참조
docs/UI_FIDELITY.md(F3 타깃) · phases/04_fidelity-f2/04-f2-visual-regression.md(패턴).
