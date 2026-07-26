---
owner: 영호
milestone: LR3
phase: 07
title: 멀티패널 전환-연속성 수리 — 완료 보고 (-DONE)
status: done (reviewer·라이브 1회는 사람 게이트 — 미실행)
grade: 복잡
date: 2026-07-04
summary: 패널 세션 상태·이벤트 구독을 컴포넌트 훅 수명(usePanelSession) → 앱 수명 모듈 스코프 매니저(usePanelSlot)로 승격(단일채팅 P3b bgRuns 패턴 미러). 역방향 유령(단일챗 subscribeAgentEvents가 Conversation.tsx 마운트에 묶여 멀티 체류 중 자기 run의 done을 놓침)을 착수 서두 RED로 재현 확정 후 Shell.tsx 승격으로 GREEN 수리. 스트림 증발·고스트run·역방향 유령 3종 모두 RED→GREEN 실측(mock unsubscribe 무효화 보강 후 재확인). 회귀 0(165 files/2256 tests) · typecheck 0 · lint 0.
---

# LR3 Phase 07 — 멀티패널 전환-연속성 수리 완료 보고

> 브랜치 `fix/switch-continuity` · renderer Worker 단독(coordinator 미경유, 사용자 직접 위임) · `02.Source/renderer/**` + `99.Others/tests/**`만 변경(계약/preload/main 불가침 준수).

## ① 무엇을 / 왜

멀티패널에서 다른 화면/대화로 전환했다 돌아와도 각 패널의 진행 중 run이 계속 쌓이고
이어져 보여야 한다 — 단일채팅이 P3a/P3b/P3c로 확보한 전환-연속성과 대칭(야간2 진단
63526a5, `01.Phases/switch-continuity/_diagnosis.md` §멀티패널). 확정 증상 2종(스트림
영구증발·고스트run)에 더해 "역방향 유령"(추정)을 착수 서두에 재현 확정하는 것이 선행 조건.

**역방향 유령 재현 판정: 성공(재현 확정) → 게이트 편입 → GREEN 수리 완료.**

메커니즘: `Conversation.tsx`의 마운트 `useEffect`가 `subscribeAgentEvents()`(단일챗 자신의
전역 이벤트 구독)를 호출했는데, `Shell.tsx`는 `workspaceMode==='multi'`일 때 이 컴포넌트를
언마운트한다(원본 조건 렌더). 그 결과 단일챗 자신의 활성 run이 멀티 체류 중 도착하는
`done`/`session` 이벤트를 영구히 놓쳐 `isRunning`/`currentRunId`가 고착됐다 — 원인은
"멀티패널이 단일챗을 오염시킨다"가 아니라 "**단일챗 자신의 구독이 멀티 체류 중 끊긴다**"였다
(이름의 유래 — 오염 방향이 진단 가설과 반대).

재현 검증 1차 시도(`multi-isolation-guard.test.tsx` 회귀 가드 E)는 mock의 `unsubscribe`가
단순 `vi.fn()` 스파이라 "구독 해제됨" 상태에서도 캡처해둔 콜백 참조를 테스트가 수동으로
재호출할 수 있어 **구코드에서도 통과하는 착시 GREEN**이 나왔다. 실 `window.api.onAgentEvent`의
unsubscribe는 ipcRenderer 리스너를 실제로 제거해 그 뒤론 콜백이 다시 불리지 않는다는 점을
mock이 흉내내지 못한 것 — mock에 `liveHandler` 무효화(실제 unsubscribe 시 콜백 참조를
`null`로 되돌림)를 보강한 뒤 재실행하니 **구코드(stash)에서 `expected true to be false`로
정확히 RED**, 수리 코드 복원 후 GREEN을 확인했다(`git stash`/`pop`으로 실측 — "수정은
실측으로 검증" 원칙 적용).

## ② 어떻게 (승격 설계 + 변경 파일)

**핵심 설계**: `usePanelSession()`(컴포넌트 소유 `useReducer`, 기존 15+ 호출처) 자체는
**한 글자도 건드리지 않았다**. 그 옆에 완전히 새로운 앱 수명 매니저와 훅
`usePanelSlot(sessionKey, slot)`을 추가해 `MultiWorkspace.tsx`만 갈아탔다 — 회귀 표면을
최소화(레거시 호출처 15+ 파일이 전부 영향 0).

| 승격됨(앱 수명, 모듈 스코프) | 컴포넌트에 남음(로컬) |
|---|---|
| 패널 상태(`panelManagerStates: Map<key, PanelSessionState>`) | 없음 — `usePanelSlot`은 `useSyncExternalStore`로 구독만 |
| `runId → key` 라우팅 테이블(`runIdToPanelKey`) | — |
| `window.api.onAgentEvent` 구독(지연·멱등 1회, `ensurePanelManagerSubscribed`) | — |
| send/abort 로직(`performManagedSend`/`performManagedAbort`) | 컴포넌트는 훅이 반환하는 `send`/`abort` 콜백만 호출 |
| 단일챗 `subscribeAgentEvents()` 호출 — `Conversation.tsx` → `Shell.tsx` 마운트 effect로 승격 | Conversation은 `loadProjectFiles`/`loadUsage`만 유지 |

`key = makePanelSlotKey(sessionId, slot) = "${sessionId}::${slot}"` — (활성 멀티세션ID, 슬롯
번호) 조합이 상태 신원이다. `MultiWorkspace.tsx`가 6개 고정 훅(`usePanelSlot(activeMultiSessionId,
0..5)`)을 항상 호출하는 React 훅 규칙은 무변경(Shell이 `key={activeMultiSessionId}`로
MultiWorkspace를 리마운트하므로 `activeMultiSessionId`는 한 인스턴스 생애 동안 불변 —
조건부 훅 호출 없이 안전).

**변경 파일**:
- `02.Source/renderer/src/store/panelSession.ts` — 앱 수명 매니저 신설(`panelManagerStates`/
  `panelManagerListeners`/`runIdToPanelKey` Map, `ensurePanelManagerSubscribed`(지연·멱등
  전역 구독 1개), `usePanelSlot` 훅, `disposePanelManagerSession(s)ByPrefix`, LRU
  `PANEL_MANAGER_CAP=32`, 테스트 전용 `__resetPanelSessionManagerForTests`). 레거시
  `usePanelSession()` 무변경.
- `02.Source/renderer/src/components/00_shell/MultiWorkspace.tsx` — `usePanelSession` →
  `usePanelSlot(activeMultiSessionId, slot)` 6개로 교체.
- `02.Source/renderer/src/hooks/useMultiPersist.ts` — 마운트 복원 루프에 `hasLiveProgress`
  가드 추가: 매니저에 이미 라이브 상태(`thread.length>0 || isRunning || currentRunId!==null`)가
  있으면 디스크 스냅샷으로 덮어쓰지 않는다(동일 세션 리마운트 시 진행 보존). 앱 완전
  재시작(매니저가 비어있는 진짜 첫 마운트)에는 영향 없음 — 기존 M3 부팅 복원 그대로.
- `02.Source/renderer/src/store/slices/multiSession.ts` — `deleteMultiSession(id)`에
  `disposePanelManagerSessionsByPrefix(panelSlotKeyPrefix(id))` 추가(고스트 정리, ③ 참조).
- `02.Source/renderer/src/components/01_conversation/Conversation.tsx` — 마운트 effect에서
  `subscribeAgentEvents()` 호출 제거(Shell로 이동).
- `02.Source/renderer/src/layout/Shell.tsx` — 마운트 effect로 `subscribeAgentEvents()` 승격
  (모드 무관 항상 라이브).
- 테스트: `99.Others/tests/renderer/multi-concurrent.test.tsx`(모듈 스코프 매니저 격리를 위한
  `__resetPanelSessionManagerForTests` beforeEach 추가 + "6훅 개별구독" 옛 단언 → "전역 구독
  1개 공유" 단언으로 재작성), `multi-isolation-guard.test.tsx`(구독 수명 계약이 반전됐으므로
  가드 B/C 단언 반전 + 신규 가드 E, mock unsubscribe 무효화 보강), 신규
  `lr3-p07-multipanel-continuity.test.tsx`(5 tests — 아래 ③), 신규
  `99.Others/tests/e2e/lr3-p07-multipanel-continuity.e2e.ts`(LIVE_SDK 옵트인 라이브 probe,
  switch-continuity-seamless.e2e.ts 패턴 미러 — **작성만, 실행은 사람/메인 게이트**).

## ③ 검증 (기계 게이트)

- `npm run typecheck` 0(node+web) · `npm run lint` 0.
- 전체 renderer 유닛: **165 files / 2256 tests green**(신규 파일 포함, 회귀 0).
- 신규 `lr3-p07-multipanel-continuity.test.tsx`(5 tests, 전부 GREEN):
  1. 스트림 증발 재현·수리 — 패널0 전송 중 unmount(모드 전환 시뮬) → 이벤트 도착 →
     같은 세션 remount → thread에 반영됨.
  2. 멀티세션 전환 시 교차오염 0 — 세션A 슬롯0 진행 중 텍스트가 세션B 슬롯0에 새지 않고,
     A로 복귀 시 A 진행이 그대로 보임(작업 중 `useMultiPersist.ts`의 기존·범위밖 디스크
     복원 폴백 레이스를 발견 — ④ 참조, 이 테스트에선 디스크 사전시딩으로 회피).
  3. 고스트 run 정리 — `deleteMultiSession(id)` → 진행 중이던 패널 runId로 `agentAbort`
     호출 + 이후 이벤트는 무시.
  4. AUTO idle-close → resume 연속(P02 재검증) — done으로 idle 된 뒤 화면을 벗어났다
     돌아와도 sessionId가 보존돼 다음 send가 `resumeSessionId`로 주입.
  5. `makePanelSlotKey` 키 스킴 계약(세션·슬롯 다르면 다른 키).
- **RED→GREEN 실측**(자기보고가 아닌 `git stash`/`pop`으로 확인, "수정은 실측으로 검증" 준수):
  - 신규 테스트 파일 5개 전체를 구코드(소스 6개 파일 stash)에 대해 실행 → 전부 RED
    (`__resetPanelSessionManagerForTests is not a function` — 매니저 자체가 존재하지 않음,
    가장 강한 형태의 RED).
  - `multi-isolation-guard.test.tsx` 가드 E(역방향 유령)를 mock 보강 후 구코드에 대해
    단독 실행 → `expected true to be false`로 RED(=isRunning 고착 재현). 수리 코드
    `stash pop` 복원 후 GREEN 재확인.
- reviewer 통과·라이브 1회 확인은 사람 게이트(완료 조건에 명시) — 이 작업 범위 밖, 미실행.

## ④ 트레이드오프 / 미해결

**고스트 정리 정책**:
1. 단순 화면 이탈(모드 토글·다른 세션으로 전환)은 폐기가 아니다 — 상태·구독이 앱 수명으로
   상주하는 것 자체가 이번 수리의 목적이므로 의도적으로 살아있다.
2. 진짜 영구 폐기는 `deleteMultiSession(id)`뿐 — 그 세션의 6슬롯 중 진행 중이던 것은
   `agentAbort`로 중단 후 매니저·라우팅 테이블에서 제거한다("돌아올 수 없는" 지점이므로
   화면 이탈과 달리 명시적으로 청소).
3. `PANEL_MANAGER_CAP=32` — 삭제 없이 방문·실행만 한 세션이 장시간 앱 사용 중 누적되는
   것에 대한 2차 방어선. 단일챗 `BG_RUNS_CAP` 패턴 미러. **[reviewer 🟡 봉합, 2026-07-03]**
   최초 구현의 보존 가드(`currentRunId !== null`)는 "완료 포함 한 번이라도 실행한" 슬롯을
   전부 보존해 CAP이 사실상 무력했음 — **실행 중(isRunning)·마운트 중(리스너 존재)만 보존**
   으로 정정(완료 슬롯 회수, 복귀는 디스크 복원이 커버). 같은 봉합에서 `runIdToPanelKey`
   slow leak(run당 엔트리 영구 잔존)도 SET_RUN_ID 교체-정리 + 축출/폐기 시 일소로 수리.
   회귀 가드 = `lr3-p07-…test.tsx` "Phase 07 (5)" 2건(RED 실측 후 GREEN).

**usePanelSession 레거시 보존 이유**: 새 매니저를 기존 훅에 조건부로 얹지 않고 별도
`usePanelSlot`으로 분리한 것은 React 훅 규칙(`react-hooks/rules-of-hooks`) 때문만이 아니라
— 15개 이상 기존 테스트/호출처의 회귀 표면을 0으로 유지하기 위한 의도적 선택이다. 트레이드
오프: 코드 중복(두 개의 유사한 send/abort 로직)이 생겼지만, 리팩터링해서 하나로 합치는
비용·리스크가 이 Phase 범위를 넘어선다고 판단해 보류.

**범위 밖 발견(수정하지 않음)**: `useMultiPersist.ts`의 마운트 복원 effect가 디스크에서
자신의 세션 id를 못 찾으면 `res.state.activeSessionId`로 폴백하는데, 신규(디스크에 한 번도
저장 안 된) 세션이 이 폴백 시점에 다른 세션의 언마운트-플러시 저장과 경합하면 잘못된
세션의 스냅샷을 상속할 수 있는 레이스가 있다. Phase 07의 명령(패널 상태·구독 승격)과
무관한 기존 버그라 "범위 밖 발견 시 보고 후 중단" 원칙에 따라 고치지 않고, 재현 테스트에서만
디스크 사전시딩으로 우회했다 — 별도 Phase 후보로 보고.

## ⑤ 다음

- 사람 게이트: reviewer 통과, 라이브 1회 확인(패널 run 진행 중 전환→복귀 → 응답 이어짐).
- (선택) `useMultiPersist.ts`의 `activeSessionId` 폴백 레이스 — 별도 Phase로 분리 검토.
- (선택) `usePanelSession`/`usePanelSlot`의 send/abort 로직 중복 정리 — 안정화 후 리팩터링 후보.

## 🎓 배운 것

1. **mock의 "해제" 동작을 실제 IPC 해제 semantics와 일치시키지 않으면 착시 GREEN이 난다.**
   `vi.fn()` 스파이는 "호출됐다"만 기록할 뿐 "그 뒤로 콜백이 죽는다"를 흉내내지 않는다 —
   회귀 가드가 방어하려는 실제 시스템 동작(리스너 제거)을 mock이 재현하지 못하면 버그가
   있어도 테스트가 통과한다.
2. **"진행중인데 화면을 벗어난다"는 두 계층에서 동시에 일어날 수 있다** — 패널 자신의
   상태(이번 Phase 대상)와, 그 패널을 감싼 상위 화면 자신의 구독(역방향 유령, 단일챗
   Conversation.tsx). 한쪽만 승격하면 다른 쪽이 새 유령으로 남는다.
3. **RED→GREEN을 자기보고로 끝내지 말고 `git stash`로 실측** — 코드 경로 분석만으로
   "고쳐졌다"고 결론 내리는 것과, 실제로 구코드에서 실패하는 걸 보는 것 사이엔 신뢰
   격차가 있다(이번에 mock 결함까지 잡아낸 것이 그 증거).

## 산출물
- 소스: `panelSession.ts` · `MultiWorkspace.tsx` · `useMultiPersist.ts` · `slices/multiSession.ts` ·
  `Conversation.tsx` · `layout/Shell.tsx`.
- 테스트: `multi-concurrent.test.tsx`(갱신) · `multi-isolation-guard.test.tsx`(갱신) ·
  `lr3-p07-multipanel-continuity.test.tsx`(신규, 5 tests) ·
  `e2e/lr3-p07-multipanel-continuity.e2e.ts`(신규, LIVE_SDK 옵트인 — 미실행).
