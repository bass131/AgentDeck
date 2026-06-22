# Phase 03: f8-visual

## 목표
사이드바 세션/모드 토글/컨텍스트 메뉴/다이얼로그 e2e + 스크린샷으로 F8 시각 1:1 검증.

## 담당 도메인 / 에이전트
qa (tests/). 등급: 보통.

## 의존 Phase
F8-02.

## 위험 깃발
없음 (테스트만).

## 변경 대상 (이 경계 밖 금지)
- `tests/e2e/shell.e2e.ts` (또는 visual-viewer.e2e.ts) — 사이드바 검증: sb-mode 토글 2버튼 존재+클릭 전환 · 세션 행(sb-item) 표시 · more 버튼 클릭 → ctx-menu 표시 · 이름 변경 → 다이얼로그 표시 → 닫기 · 스크린샷(사이드바 + 메뉴/다이얼로그). 다크/라이트.

## 작업 단계
1. sb-mode 단일/멀티 토글 단언 + 클릭 시 .on 전환.
2. 세션 행 ≥1 표시. more 클릭 → .ctx-menu 표시(이름 변경/삭제 항목).
3. 이름 변경 클릭 → set-dialog + sd-input 표시 → Esc 닫기.
4. 사이드바 영역 스크린샷(메뉴 열림 1장 포함). 종료 시 상태 정리(메뉴/다이얼로그 닫힘).

## 완료조건 (AC — 측정 가능)
- [ ] `npm run test:e2e` 전체 PASS(회귀 0 + F8 테스트).
- [ ] 사이드바/메뉴/다이얼로그 스크린샷 생성 — 원본 대조(sb-mode·sb-item·ctx-menu·set-dialog 정합).
- [ ] 전체 게이트 green: typecheck·test·test:e2e·lint.

## 참조
원본 c-sidebar.png · REPLICA_GAP F8 · 기존 shell.e2e 패턴.
