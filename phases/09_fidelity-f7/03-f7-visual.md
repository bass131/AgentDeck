# Phase 03: f7-visual

## 목표
설정 5탭 전환 e2e + 각 탭 스크린샷으로 F7 시각 1:1 검증.

## 담당 도메인 / 에이전트
qa (tests/). 등급: 보통.

## 의존 Phase
F7-02.

## 위험 깃발
없음 (테스트만).

## 변경 대상 (이 경계 밖 금지)
- `tests/e2e/shell.e2e.ts` — 설정 모달 테스트 확장: 설정 열기 → nav 5탭 존재 단언 → 각 탭 클릭(Claude Code/MCP/Skill/Code/Theme) → 해당 set-h1 표시 + 핵심 요소(vpick/scope 탭/ext-list/FileBadge) 단언 + 탭별 스크린샷. 다크 복원.
- (선택) `tests/renderer/settings-tabs.test.tsx` — 01/02 단위에서 커버 시 생략.

## 작업 단계
1. 설정 열기 → `.set-nav` nav-item 5개(Claude Code/MCP/Skill/Code/Theme) 단언.
2. 각 탭 클릭 → set-h1 텍스트 단언 + 탭 고유 요소(version=vpick, mcp/skill=skill-tabs+ext-item, code=ext-item FileBadge, theme=테마 옵션).
3. 탭별 스크린샷(artifacts/screenshots/settings-{tab}.png). 라이트/다크 1세트 이상.
4. 종료 시 다크 복원 + 모달 닫기 → 후속 e2e 비오염.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run test:e2e` 전체 PASS(회귀 0 + F7 탭 테스트).
- [ ] 5탭 스크린샷 생성 — 육안 원본 대조(set-h1·vpick·scope 탭·토글·FileBadge 정합).
- [ ] 전체 게이트 green: typecheck·test·test:e2e·lint.

## 노트
- 기존 `settings-modal.png`는 5탭 nav 반영으로 자연 갱신(픽셀비교 아님, 단순 저장 — 시각 회귀 아님). 육안 재대조.
- **install-card/set-dialog(진행/확인) 생략 시**: REPLICA_GAP F7 Code 탭 "진행 카드" 항목은 미충족 잔여 → F7 완료 처리 시 해당 항목만 🟡(install-card 후속=M5/LSP)로 표기, 나머지 ✅.

## 참조
원본 04-settings.png · REPLICA_GAP F7 · 기존 shell.e2e F6 토글 패턴.
