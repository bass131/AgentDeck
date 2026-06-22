# Phase 02: f6-visual-final

## 목표
테마 토글 e2e(설정→테마→라이트 선택 → 실제 data-theme 전환 단언) + 양 테마 셸 스크린샷으로 충실도 트랙 F1~F6 시각 마감.

## 담당 도메인 / 에이전트
qa (tests/). 등급: 보통.

## 의존 Phase
F6-01(완료).

## 위험 깃발
없음 (테스트만).

## 변경 대상 (이 경계 밖 금지)
- `tests/e2e/shell.e2e.ts` — 설정 모달 테스트 확장(또는 신규 테스트): 설정 열기 → 테마 nav → 라이트 옵션 클릭 → `<html data-theme>`='light' 단언 + 라이트 스크린샷. 다크 복원 단언. 기존 `data-theme` 직접 set 캡처 대신 **실제 토글 경로** 검증.
- (선택) `tests/renderer/settings-theme.test.tsx` — F6-01에서 이미 단위 커버 시 생략 가능. 라이브 토글 e2e 우선.

## 작업 단계
1. shell.e2e: 설정 모달 열기 → 테마 nav 클릭 → 라이트 옵션 클릭 → `page.evaluate(() => document.documentElement.getAttribute('data-theme'))`='light' expect. 라이트 셸 스크린샷.
2. 다시 다크 옵션 클릭 → 'dark' 복원 단언 + 다크 스크린샷. **(필수)** 토글 테스트가 `setTheme`으로 localStorage 'agentdeck.theme'='light'를 영속하므로, 테스트 종료 전 반드시 다크 복원(+ localStorage 정리) — 후속 e2e가 라이트 상태 상속하지 않도록.
3. 스크린샷 육안 대조: 라이트=따뜻한 코랄 강조/밝은 표면, 다크=뉴트럴 그래파이트. 둘 다 .win 카드/4컬럼/모달 정합. **라이트 토큰 시각 결함 발견 시 = F1 디자인시스템 회귀로 보고(F6 범위 밖 — 큰 토큰 수정 금지).**

## 완료조건 (AC — 측정 가능)
- [ ] `npm run test:e2e` 전체 PASS(회귀 0 + 신규 토글 테스트).
- [ ] 토글 e2e가 직접 set이 아닌 **UI 클릭 경로**로 data-theme 전환을 단언.
- [ ] 테스트 종료 시 **다크 복원 + localStorage 정리**로 후속 e2e 상태 비오염(필수).
- [ ] 라이트/다크 스크린샷 생성(artifacts/screenshots) — 육안 충실도 OK.
- [ ] 전체 게이트 green: typecheck · test(단위) · test:e2e · lint.

## 참조
docs/UI_FIDELITY.md §6 · 기존 shell.e2e.ts '시각: 다크/라이트' 테스트(직접 set → 토글 경로로 승격).
