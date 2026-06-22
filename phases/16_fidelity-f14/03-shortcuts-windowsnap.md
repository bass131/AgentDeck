# Phase 03: shortcuts-windowsnap

## 목표
**전역 단축키 골격**(renderer keydown 훅) + **창 스냅 존**(main geometry 순수함수 + 최소 wiring).

## 담당 도메인 / 에이전트
renderer(단축키) + main-process(스냅 geometry). 등급: 보통. **두 도메인 — 단축키=renderer Worker, 스냅=main-process Worker.**

## 의존 Phase
F14-02.

## 위험 깃발
**trust-boundary** (창 스냅이 main/window/geometry.ts·controls.ts 터치). 단 **순수함수 + 기존 main 패턴, 새 IPC 0**.

## 변경 대상 (이 경계 밖 금지)
### 단축키 (renderer)
- `src/renderer/src/lib/useGlobalShortcuts.ts`(신규) — document keydown 훅: Ctrl/⌘+N(새 채팅)·O(폴더)·F(검색)·`백쿼트`(사이드바 토글 — **신규 배선**, Shell sidebarOpen setter 전달)·Shift+Tab(모드 순환)·↑↓(히스토리)·Esc(중지). **입력 필드 포커스 시 텍스트 단축키 무시 + 모달 오픈 시 Esc는 모달 우선(전역 Esc 무조건 preventDefault 금지 — 기존 AskModal/Prompt/Git/ImageViewer 등 모달 Esc 회귀 0)**. 콜백 골격(미연결 시 no-op, 동작=M4). preventDefault는 처리한 키만.
- `src/renderer/src/layout/Shell.tsx` — useGlobalShortcuts 연결(사이드바 접기·설정 등 기존 핸들러 전달). 배치 최소.
### 창 스냅 (main)
- `src/main/window/geometry.ts` — `computeSnapZone(cursor, workArea, threshold)→'left'|'right'|'maximize'|'tl'|'tr'|'bl'|'br'|null` + `snapBounds(zone, workArea)→WindowBounds` **순수함수**(electron-free, 단위 테스트 가능). 기존 computeDragBounds/computeResizeBounds 패턴.
- `src/main/window/controls.ts` — 드래그 릴리스 시 커서가 스냅 존이면 snapBounds 적용(기존 커서추종 setBounds 패턴 확장). **새 IPC 0**. 고스트 프리뷰는 단순화(생략 또는 최소 — 범위 외).
- `tests/main/window-geometry.test.ts`(기존 확장) — computeSnapZone/snapBounds golden 케이스.

## 작업 단계
1. (renderer) useGlobalShortcuts + Shell 연결.
2. (main) geometry computeSnapZone/snapBounds 순수함수 + golden 테스트 + controls 릴리스 스냅.
3. 단위 테스트.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck`(main+web) green.
- [ ] 테스트: useGlobalShortcuts(백쿼트→사이드바 토글·Esc→콜백·입력 포커스 시 텍스트 단축키 무시·**모달 오픈 시 Esc 모달 우선 회귀 0**) · computeSnapZone(좌/우/모서리/maximize/null golden) · snapBounds(workArea 반/모서리). PASS.
- [ ] **신뢰경계**: 스냅=순수함수+controls(기존 패턴), 새 IPC 0. reviewer 신뢰경계 점검.
- [ ] scope grep: 단축키 골격 미연결 동작=no-op(M4) · window.api 신규 0.
- [ ] `npm run test`·`test:e2e` 회귀 0.

## 참조
원본 Chat.tsx/App.tsx 단축키 · window/(SnapZone) · 기존 geometry.ts · REPLICA_GAP F14.
