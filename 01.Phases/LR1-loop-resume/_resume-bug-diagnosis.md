---
owner: 영호 (AI 정적 진단 — 런타임 확정은 Phase01 RED 테스트)
milestone: LR1
phase: 01
title: resume 버그 원인 확정 노트 (정적 진단)
status: 진행중 (정적 진단 완료 · RED 테스트로 런타임 확정 대기)
date: 2026-07-01
summary: 후보 ②(held-open이 resumeSessionId 미사용) 반증. 체인은 완전 배선됨. 유력 원인=후보 ①의 정제형 "flush 내구성 갭"(앱 종료/PC 종료 시 renderer 영속 flush 트리거 부재).
---

# Phase 01 — resume 버그 원인 확정 (정적 진단)

> **성격**: 메인 세션 코드 정독 결과. 런타임 확정은 qa RED 테스트가 이어받음.
> **실측 기준**: 2026-07-01, feature/loop-resume (c4abe64).

---

## §1. 결론 요약 (3줄)

1. **후보 ② 반증** — held-open(`_runPersistentPump`)도 단발과 **공용 헬퍼**(`_prepareQuery`→`buildClaudeSdkOptions`)를 써서, `resumeSessionId`가 있으면 **resume을 SDK에 주입**한다. Explore의 "held-open이 resume 미사용"은 `sdkOptions.ts:189`를 단발 전용으로 오독한 것.
2. **체인은 완전 배선됨** — session이벤트→sessionId 세팅→디바운스/언마운트 flush→디스크→복원→send가 resumeSessionId 주입→resume. 설계상 끊긴 곳 없음.
3. **유력 원인 = 후보 ① 정제형: flush 내구성 갭** — `before-quit`(main/index.ts:93)가 renderer 영속을 flush하지 않고, renderer 영속은 500ms 디바운스 + React 언마운트에만 의존 → **PC 종료/절전(급작 kill)·일반 앱 종료에 최신 sessionId가 디스크에 안 남을 수 있음**.

---

## §2. 배선 체인 실측 (파일:line)

| 단계 | 위치 | 동작 |
|---|---|---|
| sessionId 세팅 | `store/reducer/lifecycle.ts:31` `handleSession` | `{...state, sessionId: event.sessionId}` — session 이벤트 도착 시 |
| 패널 적용 경로 | `panelSession.ts:376`(APPLY_EVENT)→`:286 panelApply`→공유 `applyAgentEvent` | 패널 이벤트가 공유 reducer 경유 → handleSession 도달 |
| 디스크 flush | `hooks/useMultiPersist.ts:261-293` | **500ms 디바운스** 저장 + **언마운트 flush**(pending 타이머 시). `snapshotForPersist`(sessionId 포함) → `performRmwSave` → `window.api.multiSessionSave` |
| 영속 직렬화 | `panelSession.ts:258` | `if (state.sessionId ...) snapshot.sessionId = state.sessionId` |
| 복원 | `useMultiPersist.ts:235-240`→`sessions[i].restore`→`panelSession.ts:381 makePanelInitialState`→`:218 sessionId: snapshot.sessionId` | 마운트 시 multiSessionLoad → restore |
| send 주입 | `panelSession.ts:510` | `resumeSessionId: opts?.resumeSessionId ?? stateRef.current.sessionId` |
| SDK 옵션(공용) | `claudeAgentRun.ts:341 _prepareQuery`→`:359 buildClaudeSdkOptions`(단발·지속 DRY) | 양 펌프 공용 |
| resume 주입 | `sdkOptions.ts:189` | `...(req.resumeSessionId ? { resume: req.resumeSessionId } : {})` |

→ 단발·held-open 분기(`claudeAgentRun.ts:302-306`) 둘 다 `_prepareQuery` 경유(단발 :?, 지속 :553). **resume은 경로 무관 주입**.

---

## §3. 결정적 갭 — flush 내구성 (후보 ①)

- **`before-quit`(main/index.ts:93-96)**: `disposeAllRuns()` + `_store?.close()`만. **renderer multiSession 영속 flush 트리거 없음.**
- renderer 영속(sessionId 담김)은 오직:
  - **(a) 500ms 디바운스**(`useMultiPersist.ts:272`) — 상태 변경 후 500ms 뒤 저장.
  - **(b) React 언마운트 flush**(`:279-292`) — **세션 전환(key 재마운트) 시에만** 발화. 앱 창 닫기·프로세스 kill엔 React 언마운트가 안 일어남.
- **귀결**: PC 종료/절전(급작 kill) 또는 일반 앱 종료 시, **직전 turn의 sessionId가 디바운스 창(500ms) 안에 있거나 저장 미완이면 디스크에 안 남음** → 재시작 시 복원할 sessionId 없음 → resume 불가 → "새 대화처럼 굼".
- ⚠️ **주의**: *확립된* 대화는 정상 운영 중 디바운스가 이미 sessionId를 저장했을 것 → 이 갭은 "최신 turn" 또는 "저장 미완 구간"에 취약. 영호 증상(30분+ 자리비움)이 이 갭으로 100% 설명되는지는 **RED 테스트로 런타임 확정 필요**(디스크에 실제로 sessionId가 있었는지).

---

## §4. Phase 02/04 범위 함의 (중요)

- **Phase 04(held-open resumeSessionId 배선) = 대체로 불필요** — 후보 ② 반증으로 held-open은 이미 resume을 받는다. plan-auditor 권고 B("Phase04가 안전한 절삭선")를 **강하게 뒷받침**. Phase04는 probe로 "resume+persistent 실제 양립"만 확인하고, 배선 자체는 이미 됨 → **"검증+문서화"로 축소하거나 백로그 이월** 유력.
- **Phase 02(flush 내구성) = 진짜 수정 본체** — `before-quit`(또는 beforeunload/앱 종료)에 renderer 영속 **동기 flush**를 추가해 급작 종료 갭을 닫는 게 핵심. (main before-quit → renderer flush 신호, 또는 renderer beforeunload flush. trust-boundary·IPC 고려 → Phase02 설계.)

---

## §5. RED 테스트가 확정할 것 (qa 위임 스펙)

1. **[RED 유력] 종료-시 flush 부재** — turn으로 session이벤트→state.sessionId 세팅 후, **디바운스 완료 전 + React 언마운트 없이** "앱 종료"를 모사 → sessionId가 디스크에 **미저장**임을 assert(현재 fail=갭 증명).
2. **[GREEN 특성화] 체인 정상성** — turn→디바운스 완료→디스크에 sessionId 존재→reload→state.sessionId 복원→send가 resumeSessionId 주입. 이건 **통과**해야 함(체인 배선 정상 = 갭이 "내구성"이지 "배선"이 아님을 증명).
3. **[확인] 공용 resume 주입** — persistent=true + resumeSessionId 지정 시 buildClaudeSdkOptions 결과에 `resume` 포함(후보 ② 반증의 회귀 고정).
