# Phase 02: transparent-window

## 목표
BrowserWindow가 **투명 frameless**(`frame:false` + `transparent:true` + `backgroundColor:'#00000000'`)로 열려 데스크톱이 16px 마진으로 비치고, 윈도우 컨트롤(min/custom-maximize/close) + 수동 drag/resize + maximize 상태 broadcast가 동작한다.

## 담당 도메인 / 에이전트
main-process (src/main). 등급: 복잡(수동 drag/resize는 커서 추종 + DPI 처리).

## 의존 Phase
01 (window-control 계약).

## 위험 깃발
**trust-boundary** (transparent frameless + 윈도우 조작 핸들러). 핸들러는 sender 자신의 창에만 작용 → reviewer 무조건.

## 변경 대상 (이 경계 밖 금지)
- `src/main/index.ts` — BrowserWindow 옵션(frame:false, transparent:true, backgroundColor #00000000) + maximize/unmaximize·custom-maximize 상태 → WINDOW_STATE broadcast
- `src/main/ipc/index.ts` (또는 신규 `src/main/window/controls.ts`) — 윈도우 컨트롤·drag·resize 핸들러 등록

## 작업 단계
1. `createWindow`: `frame:false` + `transparent:true` + `backgroundColor:'#00000000'`. 현 `backgroundColor:'#0e0f12'` 제거. minWidth/minHeight·FHD 클램프·`resizable` 유지. (투명창 OS 네이티브 maximize 애니메이션 부재는 custom-maximize로 우회.)
2. 컨트롤 핸들러(전부 `BrowserWindow.fromWebContents(event.sender)`로 대상 창 해석 — 저장된 win 참조 의존 X): minimize→`win.minimize()`; **custom maximize toggle**→현재 maximized 추적 상태에 따라 `win.setBounds(작업영역 bounds)` ↔ 직전 일반 bounds 복원, `{maximized}` 반환; close→`win.close()`; isMaximized→상태 반환; getBounds/setBounds→해당 창.
3. **수동 drag**: `dragStart`에서 grab 시점 커서-창 오프셋 + *의도 크기* 잠금 → main이 커서 추종 루프(`screen.getCursorScreenPoint()`)로 `setBounds`(setPosition 아님 — 투명창 DPI 안전), `dragEnd`에서 정지. (mousemove를 IPC로 흘리지 않음.)
4. **수동 resize**: `resizeStart(edge)`에서 엣지 + 시작 bounds 잠금 → main이 커서 추종으로 엣지별 `setBounds`, `resizeEnd` 정지. minWidth/minHeight 클램프.
5. maximize 상태 broadcast: custom-maximize 토글 및 OS maximize/unmaximize 시 `win.webContents.send(WINDOW_STATE,{maximized})`.
6. registerIpc 핸들러 카운트 주석 갱신.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] main 핸들러 단위 테스트: min/maximizeToggle/close/getBounds/setBounds/dragStart·End/resizeStart·End가 `fromWebContents(event.sender)` 경유 동작(모킹), 창 ID 인자 미사용. PASS.
- [ ] **수동 drag/resize 실동작 통합 단언**(안전망): `screen.getCursorScreenPoint` 모킹 → `dragStart` 후 커서 이동 시 `win.setBounds`가 추종 좌표로 호출됨(setPosition 아님), `dragEnd` 후 정지. resize도 1 엣지 동일 패턴. PASS. (e2e는 창 이동이 비결정적이라 이 게이트를 main-side 통합 테스트로 닫는다.)
- [ ] custom-maximize 토글 시 WINDOW_STATE가 해당 창 webContents로만 전송(테스트).
- [ ] `npm run test:e2e` 기존 8개 회귀 없음(투명 frameless로 셸 렌더 정상).

## 참조
docs/ARCHITECTURE.md(신뢰경계 표) · docs/UI_FIDELITY.md(투명창·셸) · CLAUDE.md(main 단독 권한 CRITICAL) · ADR-007 · 레퍼런스 `C:/Dev/AgentCodeGUI/src/main/index.ts`(transparent 옵션·custom maximize·win drag/resize 핸들러) · phases/03_fidelity/01-window-control-contract.md.
