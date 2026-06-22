# Phase 02: f4-visual-regression

## 목표
F4(에이전트 패널 헤더+pill+3섹션)가 런타임에서 검증되고, 스크린샷으로 충실도 육안 확인, 기존 회귀 0.

## 담당 도메인 / 에이전트
qa (tests). 점검 = reviewer 조건부. 앱 코드 R only.

## 의존 Phase
01.

## 위험 깃발
없음 (테스트 전용).

## 변경 대상 (이 경계 밖 금지)
- `tests/e2e/shell.e2e.ts` 또는 visual-viewer — 에이전트 패널 구조 DOM 단언 + 스크린샷
- `tests/renderer/**` — AgentPanel 회귀 보강

## 작업 단계
1. e2e: `.pane.agent .ag-head` + `.ag-pill` + `.ag-sec`×3(할일/서브에이전트/변경파일) DOM 단언.
2. 시각검증: 에이전트 패널(헤더·pill·3섹션) 다크/라이트 스크린샷 → 원본 c-agent 대조. Claude 육안.
3. 기존 e2e + 단위 전체 회귀 PASS.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run test:e2e` 전체 PASS(기존 + F4).
- [ ] `npm run test:e2e:visual` 스크린샷 + 육안 충실도(헤더·상태pill·3섹션).
- [ ] `npm test` 전체 단위 PASS(회귀 0).
- [ ] reviewer 위반 0 — 안티슬롭·scope(할일/서브에이전트 M4 placeholder) 점검.

## 참조
docs/UI_FIDELITY.md(F4) · phases/05_fidelity-f3/04-f3-visual-regression.md(패턴).
