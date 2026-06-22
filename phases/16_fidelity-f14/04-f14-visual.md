# Phase 04: f14-visual

## 목표
F14 폴리시 시각 검증(ZoomBadge 라이브 e2e 가능 시 + 권한/질문 모달·채팅 폴리시=단위). 디자인 트랙 마무리.

## 담당 도메인 / 에이전트
qa (tests/). 등급: 보통.

## 의존 Phase
F14-03.

## 위험 깃발
없음 (테스트만).

## 변경 대상 (이 경계 밖 금지)
- `tests/e2e/visual-viewer.e2e.ts`(또는 shell.e2e) — 라이브 가능한 것: ZoomBadge(채팅 스크롤 Ctrl+휠 → zoom-badge 표시 — playwright keyboard down Ctrl + mouse.wheel) 또는 단위 전담. 권한/질문 모달=단위(F14-01) 전담(M4 트리거). 라이프사이클 미표시 단정 유지.

## 작업 단계
1. ZoomBadge 라이브 시도(Ctrl+wheel → .zoom-badge.on) — 불가 시 단위 전담 명시.
2. 권한/질문 모달·채팅 폴리시는 단위(F14-01/02) 시각 전담.
3. 상태 정리.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run test:e2e` 전체 PASS(회귀 0).
- [ ] **권한/질문 모달·thinking/notice·선택툴바 = 단위(F14-01/02) 전담**(라이브 트리거=M4, e2e 비대상). 약속-구현 간극 없음.
- [ ] 전체 게이트 green: typecheck·test·test:e2e·lint.

## 참조
REPLICA_GAP F14 · 기존 e2e 패턴.
