# 권한 UX 사전 조사 노트 (Phase 06 입력 자산)

> 2026-07-03 Explore 실측. Phase 06 Worker는 착수 전 필독 — 재조사 비용 절약용 스냅샷.
> 값이 어긋나면 코드가 이김(이 노트는 조사 시점 기준).

## 현행 구조

- **컴포넌트**: `02.Source/renderer/src/components/06_prompt/PermissionModal.tsx` + 같은 폴더 `.css`
  - `.q-overlay > .perm-modal[role=dialog] > (.perm-head + .perm-sum + .q-opts[버튼3] + .perm-foot)`
  - `PERM_CHOICES` = `allow` / `allow_always` / `deny`. 키보드: 숫자 1·2·3, Esc→deny (전역 window keydown).
  - `.q-overlay` = `position:absolute; inset:0; z-index:80; backdrop-filter:blur` — `.conversation` 전체를 덮는 풀오버레이.
  - ⚠️ `.q-overlay`/`.q-opts`/`.q-opt`/`.q-num` 클래스는 **QuestionModal.css와 공유**.
- **사용처**: `Conversation.tsx:662-667` — `.conversation` 첫 자식으로 렌더.

## 데이터 흐름 (그대로 재사용 — 프레젠테이션만 교체)

- main 발신: `01_agents/permissionCoordinator.ts` — `makeCanUseTool()` → `_requestPermission()` → `_waiters` Map(requestId→resolver) → `_push({type:'permission_request', requestId, toolName, summary})` → `onAgentEvent` IPC.
- renderer 수신: `slices/runtime.ts:220` 구독 → `reducer/permission.ts` `handlePermissionRequest()` → `state.pendingPermission`(단일 슬롯 — 새 요청이 이전 것 덮어씀). 셀렉터 `selectPendingPermission`(`slices/selector.ts:132`).
- renderer 회신: `slices/runtime.ts:336` `respondPermission(behavior)` → 슬롯 null → `window.api.permissionRespond` → 채널 `agent.permissionRespond`(`shared/ipc/agent.ts:31`) → `00_ipc/handlers/agent.ts:136-153` → `runManager.respond()` → coordinator resolve → SDK `PermissionResult`. `allow_always`는 session addRules 매핑.
- shared 타입: `AgentEventPermissionRequest`(`shared/agent-events.ts:342`) · `PermissionResponse`(`shared/ipc/agent.ts:197`) · `PendingPermission`(`reducer/types.ts:34`).

## 인라인 카드 삽입 자리

- `Conversation.tsx:871-875` LoopStatusBanner ~ `:878` Composer 사이 — 이미 존재하는 "컴포저 위 배너 슬롯".
- LoopStatusBanner(`components/07_notice/LoopStatusBanner.tsx`)가 "none이면 null 렌더" 한 자리 배너 패턴의 레퍼런스.
- ■(중단) 버튼: `ComposerBar.tsx:178-185` — `isRunning && !hasContent`일 때 `.send.stop`(`.send-stop-sq`). 현재는 z-index:80 오버레이에 가려 클릭 불가 → 인라인 전환 시 상시 노출(개선의 핵심).

## WorkingIndicator 공존 이슈

- `Conversation.tsx:827-841`: 렌더 조건 `isRunning && !pendingQuestion && !lastIsLiveAssistant` — **pendingPermission 미포함**(원본 App.tsx L820 미러). 지금은 오버레이가 덮어서 안 보였을 뿐. 인라인화하면 카드+인디케이터 세로 공존 → 억제 정책 재결정 필요(Phase 06 기본안: pendingQuestion과 동일 취급으로 억제).

## e2e/단위 셀렉터 계약 (이관 대상 9곳)

| 파일 | 위치 | 의존 |
|---|---|---|
| `e2e/a3-interleave.e2e.ts` | :53 | `.perm-modal` 보이면 항상 허용 |
| `e2e/bf2-interrupt-probe2.e2e.ts` | :50(상수)·:342 | `.perm-modal[role="dialog"]` — S2' "권한 중 ■ 클릭" 시나리오 |
| `e2e/live-test-project.e2e.ts` | :39 | visible 체크 |
| `e2e/lr3-p04-wakeup-banner.e2e.ts` | :42,47 | `.perm-modal` → 숫자키 1 |
| `e2e/m5-token-streaming.e2e.ts` | :110,331 | 2곳 |
| `e2e/orchestration-live.e2e.ts` | :140-141 | `toBeVisible` **강한 단언** |
| `e2e/visual-viewer.e2e.ts` | :293 | `.q-overlay, .perm-modal, …` count 0 (오버레이 부재 단언) |
| `renderer/m4-4-permission-conversation.test.tsx` | :96-98 | querySelector `.perm-modal` + `.q-overlay` 텍스트 |

## 동시성 / 멀티패널

- coordinator `_waiters`는 다중 대기 가능하나 renderer 슬롯은 단일 — 마지막 요청만 표시(기존 한계, 유지 — 범위 밖).
- 멀티패널: `panelSession.ts`가 패널별 `pendingPermission`을 격리 저장하지만 `PanelView`/`PanelComposer`는 권한 UI **미배선**(기존 격차 — 응답 수단이 없어 run이 대기에 갇힘). **2026-07-03 영호 "백로그 없이" 지시로 Phase 06 범위에 편입** — 인라인 카드를 PanelView에도 마운트.
