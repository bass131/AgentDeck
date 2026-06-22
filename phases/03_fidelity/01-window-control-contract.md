# Phase 01: window-control-contract

## 목표
투명 frameless 윈도우의 컨트롤(min/maximize-toggle/close) + 상태 조회(isMaximized/getBounds) + 수동 drag/resize 브래킷(dragStart/End, resizeStart(edge)/End) + setBounds + maximize 상태 변경(main→renderer) IPC 계약이 `src/shared`에 단일 정의되고, preload가 화이트리스트 helper만 노출한다. F1-b 셸의 토대.

## 담당 도메인 / 에이전트
shared-ipc (src/shared + src/preload). 등급: 보통.

## 의존 Phase
F1-a(완료). 마일스톤 02 IPC 계약 패턴 재사용.

## 위험 깃발
**trust-boundary** (윈도우 조작 IPC 노출) → reviewer 무조건.

## 변경 대상 (이 경계 밖 금지)
- `src/shared/ipc-contract.ts` — 채널명 상수 + 요청/응답·이벤트 타입 추가
- `src/preload/index.ts` — 화이트리스트 helper 추가

## 작업 단계
1. `IPC_CHANNELS`에 추가(원본 `win` 표면 일치 — 10 invoke + 1 event):
   `WINDOW_MINIMIZE 'window.minimize'`, `WINDOW_MAXIMIZE_TOGGLE 'window.maximizeToggle'`(custom maximize), `WINDOW_CLOSE 'window.close'`, `WINDOW_IS_MAXIMIZED 'window.isMaximized'`, `WINDOW_GET_BOUNDS 'window.getBounds'`, `WINDOW_SET_BOUNDS 'window.setBounds'`, `WINDOW_DRAG_START 'window.dragStart'`, `WINDOW_DRAG_END 'window.dragEnd'`, `WINDOW_RESIZE_START 'window.resizeStart'`, `WINDOW_RESIZE_END 'window.resizeEnd'`, `WINDOW_STATE 'window.state'`(event형 main→renderer).
2. 타입: 대부분 무인자. `WINDOW_MAXIMIZE_TOGGLE`/`WINDOW_IS_MAXIMIZED` 응답 `{maximized:boolean}`. `WINDOW_GET_BOUNDS` 응답 = `WindowBounds {x,y,width,height}`. `WINDOW_SET_BOUNDS` 요청 = `WindowBounds`. `WINDOW_RESIZE_START` 요청 = `{edge: 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw'}`. `WINDOW_STATE` 페이로드 = `WindowStatePayload {maximized:boolean}`.
3. **신뢰경계 명시 주석**: 계약에 *창 식별자 필드 없음* — main이 `event.sender`로 대상 창 해석(원본은 전역 win 참조; 우리는 sender 한정 강화). drag/resize는 start/end 브래킷만 정의(커서 추종 setBounds는 main 내부 수행, mousemove IPC 없음).
4. preload helper: `windowMinimize/MaximizeToggle/Close/IsMaximized/GetBounds/SetBounds/DragStart/DragEnd/ResizeStart(edge)/ResizeEnd` + `onWindowState(cb): ()=>void`(onAgentEvent 패턴). 채널명 문자열은 shared에만, ipcRenderer 통째 노출 금지.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green (main·renderer 양쪽).
- [ ] 신규 채널명 문자열이 `src/shared/ipc-contract.ts`에만 존재(grep 확인).
- [ ] `ipc-contract.test.ts`에 신규 채널 상수/형태 회귀 케이스 추가, PASS. 윈도우 요청 타입에 **창 ID/핸들 필드 없음** 단언.
- [ ] preload가 새 helper만 노출(ipcRenderer 미노출 유지 — grep).

## 참조
docs/ARCHITECTURE.md(신뢰경계) · docs/UI_FIDELITY.md(셸 크롬·타이틀바·resize) · CLAUDE.md(IPC 계약 단일화·신뢰경계 CRITICAL) · ADR-007 · 레퍼런스 `C:/Dev/AgentCodeGUI/src/preload/index.ts`(win 표면) · phases/01_mvp/02-ipc-contract.md(패턴).
