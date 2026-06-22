# Milestone 03 — 충실도 트랙 / F1 셸 토대 (Fidelity)

> 목표: 원본 AgentCodeGUI의 **시각/구조를 1:1 재현**(ADR-014). 이 마일스톤은 충실도 트랙의 **토대(F1)** = 디자인시스템 + **투명 frameless 플로팅카드 4컬럼 셸**. 이후 F2~F6(사이드바·컴포저·툴카드·우측패널·뷰어/모달·라이트테마)은 M3/M4/M5 기능과 병합되어 진행된다.
>
> 권위 스펙 = `docs/UI_FIDELITY.md` · 레퍼런스 클론 = `C:/Dev/AgentCodeGUI`(읽기전용).

## 스택 전제 (완료)
- **스택 마이그레이션 ✅**(ADR-013, 커밋 2184b45): React19·Electron42·Vite7·TS6 등 원본 일치. 검증 전부 green.

## F1-a 디자인시스템 토대 (완료)
- **✅ 커밋 0cf8557**: `theme/tokens.css` OKLCH 듀얼테마 + 옛 토큰명 호환 alias + `lib/theme.ts`. theme 24 + 전체 311 단위 green, 시각검증 완료. (별도 Phase 파일 없이 선행 완료 — 본 _INDEX에 기록.)

## ⭐ 윈도우 방식 결정 (2026-06-22 사용자) — 원본 1:1 (투명창 + 수동 제어)
원본은 `frame:false` **+ `transparent:true` + `backgroundColor:'#00000000'`** + `body{background:transparent}`(소스 검증: index.ts:376-378, styles.css:152). 16px inset 마진으로 **실제 데스크톱 배경이 비치고** 둥근 카드가 바탕화면 위에 떠 보인다. 투명창은 OS 네이티브 maximize 애니메이션·엣지 리사이즈가 없어 **main 프로세스 수동 구현**: custom-maximize(workArea로 setBounds) + 수동 drag(grab점 잠금 후 커서 추종 setBounds) + 수동 resize(엣지별 setBounds). 타이틀바 드래그는 `-webkit-app-region:drag` **미사용**(원본이 명시적으로 버림 — 클릭/더블클릭 삼킴) → mousedown→IPC `dragStart`. (사용자가 "단순 불투명+OS-native" 대신 **전면 1:1**을 택함.)

## F1-b 셸 골격 — Phase 분해 (6개 — 도메인 경계 × 의존성 순서)

| NN | Phase | 도메인 | 깃발 | 의존 |
|---|---|---|---|---|
| 01 | window-control-contract | shared-ipc (shared+preload) | **trust-boundary** (윈도우 조작 IPC 10채널) | F1-a |
| 02 | transparent-window | main-process | **trust-boundary** (transparent frameless + 수동 drag/resize/maximize) | 01 |
| 03 | shell-chrome | renderer | **trust-boundary** (드래그/리사이즈 트리거 표면) | 01, 02 |
| 04 | four-column-skeleton | renderer | 없음 | 03 |
| 05 | component-placement | renderer | 없음 | 04 |
| 06 | shell-integration-visual | qa (통합) | 없음 | 02, 03, 04, 05 |

## 충실도 타깃 (이 마일스톤)
- 원본 셸: **투명 frameless 윈도우** + 16px inset **둥근 플로팅 카드**(`--shadow-win`, 데스크톱 투과) + 커스텀 타이틀바(42px, mousedown→IPC 드래그 + min/max/close) + 리사이즈 핸들(엣지/모서리, mousedown→IPC resize) + custom-maximize(`.win.max` inset 0) + **4컬럼**(사이드바 248 / 탐색기 236 / 대화 1fr / 에이전트 392, 접힘 rail 30px).
- **골격 단계 placeholder**: 사이드바(채팅 세션 목록)·에이전트 서브에이전트 패널은 M4 → 컨테이너/스텁만. 탐색기=기존 FileExplorer, 대화=기존 Conversation+뷰어 탭, 에이전트=기존 AgentPanel.

## 신뢰경계 불변식 (이 마일스톤 핵심)
- 윈도우 컨트롤·drag·resize·bounds IPC는 **sender 자신의 창에만** 작용 — main이 `BrowserWindow.fromWebContents(event.sender)`로 대상 창 해석(renderer가 창 ID/핸들 주입 X). **원본은 전역 `mainWindow` 참조를 쓰지만(단일창 가정), 우리는 sender 한정으로 강화**(헌법 신뢰경계 — 내부구조 강화라 1:1 충실도 무관, PRD 설계메모). 이 차이는 reviewer가 원본 대조 시 오탐하지 않도록 01에 명시.
- preload는 윈도우 helper만 노출(ipcRenderer 통째 X). drag/resize는 start/end 브래킷만 renderer가 트리거하고, 커서 추종 setBounds는 **main이 수행**(mousemove를 IPC로 흘리지 않음 — 지연 회피 + 권한 최소).

## 실행
수동: Phase별 coordinator/Worker 위임(01·02·03 trust-boundary → reviewer 무조건). 자동: `python scripts/execute.py 03_fidelity`.
검증: 단위(계약·main 핸들러) + e2e(`npm run test:e2e` — 윈도우 컨트롤·셸 구조) + 시각검증(`npm run test:e2e:visual` — 양 테마 + **데스크톱 투과/컬럼폭 측정** 단언).

## 이 마일스톤에서 안 하는 것 (영구 제외 아님)
- 사이드바 채팅 세션 목록 실동작 → M4. · 서브에이전트 패널 → M4. · 컬럼 드래그-리사이즈(폭 가변) → 후속(골격은 고정폭 + 접힘 토글). · 라이트테마 기본화/폴리시 → F6. · Git/설정/LSP 모달 → M3/M5/M2-LSP.
