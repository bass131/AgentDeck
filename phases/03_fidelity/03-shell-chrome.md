# Phase 03: shell-chrome

## 목표
renderer가 투명창 위 **16px inset 둥근 플로팅 카드**(`.win`, 데스크톱 투과) + 커스텀 타이틀바(42px, mousedown→IPC 드래그 + min/max/close) + 리사이즈 핸들(엣지/모서리, mousedown→IPC resize)을 렌더한다. custom-maximize 시 카드가 창을 가득 채운다(`.win.max`).

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 복잡.

## 의존 Phase
01 (window-control API), 02 (투명창·수동 drag/resize 실동작).

## 위험 깃발
**trust-boundary** (드래그/리사이즈 트리거 표면 — 윈도우 조작은 preload API 경유만, renderer 직접 부수효과 X) → reviewer 무조건.

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/index.html` — body 배경 투명(데스크톱 투과) 확인/조정
- `src/renderer/src/layout/Shell.tsx` — 최상위를 `.win` 카드로 래핑 + `.win.max` 토글(onWindowState 구독)
- `src/renderer/src/layout/shell.css` — `.win`(inset 16px, radius, `--shadow-win`, overflow hidden, flex column), `.win.max`(inset 0, radius 0, no shadow)
- `src/renderer/src/components/TitleBar.tsx` (신규) + CSS — `.titlebar` 42px, 컨트롤 버튼
- `src/renderer/src/components/ResizeHandles.tsx` (신규) + CSS — 8 엣지/모서리 핸들
- `src/renderer/src/lib/useWindowState.ts` (신규) — onWindowState 구독 + 초기 isMaximized 훅

## 작업 단계
1. `.win` 카드: 투명 body 위 inset 16px, `border-radius:var(--radius)`, `box-shadow:var(--shadow-win)`, `overflow:hidden`, flex column. 내부 = 타이틀바(42px) + 본문(1fr). (데스크톱이 둥근 모서리 바깥으로 비침.)
2. TitleBar: 좌측 워크스페이스명, 우측 컨트롤 3버튼(min/max/close — 벡터 아이콘, 이모지 금지). **드래그는 `-webkit-app-region` 미사용**(원본이 버림 — 클릭 삼킴) → 바 영역 mousedown(임계값 초과 시)→`window.api.windowDragStart()`, mouseup/leave→`windowDragEnd()`. 버튼 onClick→`windowMinimize/MaximizeToggle/Close`(드래그와 분리).
3. ResizeHandles: 8 핸들(n/s/e/w/ne/nw/se/sw), `position:absolute`(또는 fixed) + 엣지별 커서. mousedown→`window.api.windowResizeStart(edge)`, mouseup→`windowResizeEnd()`. (실제 bounds 변경은 main이 커서 추종 — Phase 02.)
4. maximize 상태: `useWindowState`(onWindowState 구독 + 초기 windowIsMaximized) → `.win`에 `.max` 토글. max 버튼 아이콘 상태 반영(maximize↔restore).
5. 인라인 색상 0 — 전부 토큰. 애니메이션 ≤150ms. window 조작은 preload API로만(직접 ipcRenderer/Node 0).

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 컴포넌트 테스트: TitleBar 3버튼이 각 window.api helper 호출(모킹); 타이틀바 mousedown→windowDragStart, ResizeHandles mousedown(edge)→windowResizeStart(edge) 호출. PASS.
- [ ] `.win` 카드가 `--shadow-win`/`var(--radius)`/inset 16px 사용(인라인 색상·하드코딩 0 — grep). `.win.max` inset 0.
- [ ] 시각검증(`npm run test:e2e:visual`): 둥근 플로팅 카드 + **16px 마진 데스크톱 투과(단색 채움 아님)** + 타이틀바·컨트롤이 다크 테마로 렌더(스크린샷 육안 확인).
- [ ] renderer가 window 조작을 preload API로만 수행(직접 ipcRenderer/Node 접근 0 — grep).

## 참조
docs/UI_FIDELITY.md(`.win` inset16/radius/shadow-win, 타이틀바 42px, resize-layer) · docs/UI_GUIDE.md(안티슬롭·벡터아이콘) · CLAUDE.md(renderer untrusted CRITICAL) · 레퍼런스 `C:/Dev/AgentCodeGUI` App.tsx·TitleBar.tsx(mousedown→IPC drag)·ResizeHandles.tsx·styles.css(.win/.win.max/resize-layer).
