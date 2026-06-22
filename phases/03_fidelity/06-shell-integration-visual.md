# Phase 06: shell-integration-visual

## 목표
F1-b 셸(투명 frameless 카드 + 윈도우 컨트롤 + 수동 drag/resize + 4컬럼)이 실제 Electron 런타임에서 검증되고, 양 테마 스크린샷으로 충실도가 육안 확인된다. 회귀 안전망 확정.

## 담당 도메인 / 에이전트
qa (tests). 통합 점검 = coordinator/reviewer 조건부. 앱 코드는 R only.

## 의존 Phase
02, 03, 04, 05.

## 위험 깃발
없음 (테스트 전용).

## 변경 대상 (이 경계 밖 금지)
- 신규 `tests/e2e/shell.e2e.ts` — 셸 구조/윈도우 컨트롤 e2e
- `tests/e2e/visual-viewer.e2e.ts` — 셸 스크린샷 케이스 보강(필요 시)
- `tests/renderer/**` — TitleBar/Shell/Sidebar 컴포넌트 회귀 보강(필요 시)

## 작업 단계
1. e2e: 셸 런치 → `.win` 카드 존재 + 타이틀바 컨트롤 3버튼 + 4컬럼(사이드바/탐색기/대화/에이전트) DOM 단언 + 접힘 rail 토글.
2. 윈도우 컨트롤: maximizeToggle 클릭 → `.win.max` 토글(또는 WINDOW_STATE 반영) 단언. minimize/close는 부작용 큰 만큼 호출-배선까지만(실제 close 회피). drag/resize는 핸들 mousedown→IPC 호출 배선 단언(실제 창 이동은 e2e 비결정 → 스킵).
3. 시각검증: 다크 + (setTheme로) 라이트 양 테마 스크린샷 `artifacts/screenshots/`(shell-dark.png, shell-light.png). Claude가 Read로 육안 확인.
4. 기존 8 e2e + 311+ 단위 전체 회귀 PASS 확인.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run test:e2e` 전체 PASS(기존 8 + 셸 신규).
- [ ] `npm run test:e2e:visual` 셸 스크린샷 생성 + 육안 충실도 확인: **둥근 카드 + 16px 마진 데스크톱 투과(단색 아님)** · 타이틀바 컨트롤 · **컬럼 폭 248/236/392 측정 일치** · 4컬럼.
- [ ] `npm test` 전체 단위 PASS(회귀 0).
- [ ] reviewer(통합) 위반 0 — trust-boundary(윈도우 컨트롤·drag/resize) 최종 점검.

## 참조
docs/UI_FIDELITY.md(충실도 타깃) · 메모리 시각검증 정식화 · phases/02_code-intelligence/04-integration.md(패턴).
