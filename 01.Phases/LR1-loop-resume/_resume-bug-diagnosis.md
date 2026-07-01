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

---

## §6. 디스크 실측 — 가설 A(flush 갭) **반증 확정** (2026-07-01 추가)

영호의 실제 영속 파일 `%APPDATA%/agentdeck/multi-agent.json`(mtime 2026-06-30) 파싱 결과:

```
version:2 · activeSessionId:a832dcca-… · sessions:1 · panels:6
  panel[0] snapshot: sessionId="fb21de8f-b8e2-4f03-863d-8cbbb7eb0cbc" messages=4
  panel[1] snapshot: sessionId="8f1e8a4e-3507-4e13-9faf-525e9fe0caec" messages=4
```

→ **sessionId가 유효 UUID로 4개 메시지와 함께 디스크에 durable하게 저장됨.** 정상 사용 중 디바운스가 sessionId를 이미 영속함을 실측 확인. **flush 내구성 갭(RED 테스트가 잡은 마지막 500ms 창)은 영호의 "idle-후-재시작 맥락끊김" 증상의 원인이 아니다** — 확정 반증.

### 진짜 원인 재조준 (flush 아님 → resume 경로)
sessionId가 디스크에 있는데도 재시작 시 맥락이 끊긴다면, 원인은 다음 중 하나(런타임 검증 필요):
- **(B1)** 재시작 시 restore가 sessionId를 state에 안 넣음 (useMultiPersist:235 `messages.length>0` 게이트는 통과할 것 — messages=4).
- **(B2)** restore된 sessionId가 send의 resumeSessionId로 안 실림.
- **(B3)** **held-open(현재 기본 replMode=true) 라우팅에서 resumeSessionId가 유실** — RunManager가 sessionKey로 새 held-open 세션 시작 시 resumeSessionId를 어댑터에 안 넘길 가능성.
- **(B4)** SDK가 resume+persistent를 받아도 실제 맥락 복원을 안 함(SDK 거동).

### Phase 함의 (2차 갱신)
- **Phase 02(flush fix)** = 진짜 버그 아님. 여전히 *유효한 하드닝*(마지막 500ms 창 방어)이나 "resume 버그 수정"으로 라벨링 금지. 커밋 여부·라벨 = 영호 판단.
- **신규 필요**: 재시작→resume 맥락복원 실패 지점(B1~B4)을 런타임으로 특정하는 검증. 영호 GO로 attended(계측 로그 + 실 재시작 1회). → 이게 마일스톤의 진짜 1순위.

---

## §7. ★ 진짜 원인 확정 + 수정 (2026-07-01, 실측 종결) ★

### 결정적 반전 — 멀티패널이 아니라 **단일채팅** 버그
- 초기 4중 검증(정적·디스크·probe·재시작 e2e)은 전부 **멀티패널**(multi-agent.json) 경로를 봤고 "resume 정상"이었다. **맞았다** — 멀티패널은 정상.
- 영호 스크린샷이 **단일채팅**(`.pane.chat`, ConversationRecord) 뷰임을 드러냄. 단일채팅은 완전히 다른 영속·저장 경로.
- 영호 실데이터 `chats/ebe0d616.json`: 12메시지(2일)인데 `sessionId: undefined`. 신규 e2e 한 턴 재현도 undefined. → **단일채팅이 sessionId를 영속 못 함.**

### 정확한 손실 지점 (계측 트레이스로 확정)
```
[BROWSER] handleSession SET sessionId=2adf8d90        ← renderer 세팅 ✅
[BROWSER] saveConversation READ get().sessionId=2adf8d90  ← renderer 전송 ✅
[MAIN]    store.save incoming.sessionId=undefined      ← main 도착 undefined ❌
```
→ B1~B4(restore/send/RunManager/SDK) **전부 무관**. 진짜 원인은 **저장(save) 경로의 IPC 핸들러 필드 drop**:
- `02.Source/main/00_ipc/handlers/conversation.ts` `CONVERSATION_SAVE` 핸들러가 `store.save({id,title,messages,backendId,cwd})`만 넘기고 **`conv.sessionId`(+`lastContextWindow`·`lastUsage`)를 누락**.
- renderer는 보내고(slice:99), store.save는 저장 준비돼 있었으나(store.ts:248·262), **중간 핸들러가 필드를 떨어뜨림.**
- 멀티패널은 다른 채널(`MULTI_SESSION_SAVE`)이 스냅샷 전체를 넘겨 정상 → **경로 비대칭이 함정.**

### 수정
핸들러가 sessionId(string 가드)·lastContextWindow·lastUsage를 `store.save`로 forward. 3필드 대칭 복구.

### 검증 (실 LLM, end-to-end)
- 단일채팅 재시작-회상 e2e: 심기→sessionId 저장→**앱 재시작**→회상 "BANANA77SC" ✅
- 멀티패널 재시작-회상 e2e: 회귀 0 ✅
- 전체 test 3855 · typecheck green · lint 0 · reviewer 통과(trust-boundary 4축).

### 교훈
- **경로 비대칭 함정**: "resume 정상"을 멀티패널로 검증하고 단일채팅 버그를 놓쳤다. 사용자 실제 사용 경로(스크린샷)를 먼저 확인했어야.
- **ADR-024 재고 전제("held-open 증발")는 메커니즘이 틀렸다** — 실제는 저장 경로 필드 누락. 그러나 영호 불편은 진짜였다.
- **테스트 갭**: 단일채팅 sessionId 왕복을 검증하는 테스트가 없어 이 버그가 오래 잠복. 신규 e2e 2개가 그 갭을 메움.
