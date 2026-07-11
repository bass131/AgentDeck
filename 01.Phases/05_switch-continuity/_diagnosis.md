# 전환-연속성 버그 진단서 (P1)

> 트랙: 뷰 전환 중 in-flight run 표시·진행 끊김 (영호 2026-07-02 "체크 같이"). 브랜치 `fix/switch-continuity`.
> 접근(영호 결정): 정식 /work-plan 없이 **재현(P1) → 설계분기(P2, 영호 GO) → 구현(P3+)**.

## 증상 (영호 실측 + 스크린샷)
진행 중(스트리밍)인 채팅을 두고 다른 뷰로 갔다 돌아오면 표시·진행이 끊겨 보임.
`01.Phases/LR1-loop-resume/ScreenShot/1·2.png` = "1→50 세어줘" 카운트가 **41·15에서 멈춘 화면**.

## 단일채팅 — 확정 (store+reducer RED)
`99.Others/tests/renderer/switch-continuity-repro.test.ts` (2 RED). 실측 로그:
- 전환(A→B) 후: `isRunning=false`(리셋), `currentRunId='run-a'`(**안 지워짐 = 누수 벡터**), `conversationId=B`.
- run-a의 늦은 `text` 이벤트 → **B thread에 'A에서 새어나온 텍스트' append** = **교차오염 확정**.
- 적용 후 `isRunning=true` → B에 유령 "생각 중" 표시.

### 근본 원인 (구조적)
1. **runId 필터 부재**: `AgentEventPayload{runId, event}`의 runId는 envelope에만 있고 `event` 본체엔 없음. `subscribeAgentEvents`(runtime.ts:182)·`applyAgentEvent`(reducer.ts:132)는 `payload.runId`를 참조하지 않음 → **어느 run의 이벤트든 현재 상태에 적용** → 교차오염 + 유령 표시.
2. **selectConversation이 `isRunning`만 리셋, `currentRunId`는 안 지움**(sessions.ts) → 누수 벡터 + B에서 interrupt 시 run-a 타겟 위험(부수 발견).
3. **표시 끊김**: 돌아올 때 `selectConversation(A)`이 A를 **디스크에서 재로드**(conversationLoad) → 실행 중이던 라이브 스트림(미저장)은 사라짐 + isRunning=false. (스샷의 멈춤.)

### 성격
- **교차오염 = correctness 버그**(대화 B가 A 내용에 오염). 표시 끊김·유령 = UX 버그.
- 단일채팅은 상태 슬롯 1개라 "백그라운드 동시 실행"을 애초에 표현 못 함.

## 멀티패널 — 확정 (07-03 야간 read-only 진단, 코드 근거)
> 수리는 renderer-only 가능하나 **상태 소유권 승격 = 설계 분기(버킷 c)** → 야간 정지 큐. 영호 GO 후 착수.

### 근본 원인 (표층 아님)
- **구독이 컴포넌트(훅) 스코프**: `usePanelSession()` 내부 useEffect가 mount 구독/unmount 해제(`panelSession.ts:450-456`). 훅 6개는 `MultiWorkspace.tsx:57-62`에 상주하고, MultiWorkspace는 `workspaceMode==='multi'`일 때만 조건부 마운트(`Shell.tsx:324`, `key={activeMultiSessionId}`).
- main은 fire-and-forget push(`handlers/agent.ts:102`), 버퍼링 없음 → **단일 뷰로 전환하는 순간 6구독 전부 해제 → 그동안의 멀티 run 이벤트 영구 유실**. snapshotForPersist의 currentRunId/isRunning 미영속(:236, :219 복원 시 null/false)은 표층 — 영속해도 유실된 델타는 못 되살림.

### 증상 대칭표 (단일채팅 P3a/P3b 대비)
| 증상 | 멀티? | 근거 |
|---|---|---|
| ① 교차오염 | **X** | panelApply runId 엄격 격리(:280) — P3a급 수정 불필요 |
| ② 유령 isRunning | X(멀티 자체) / **O 추정(역방향)** | 패널 복원=항상 idle. 역방향: 단일챗 구독도 컴포넌트 스코프(`Conversation.tsx:455-460`) → multi 체류 중 done 유실 시 단일 복귀에 isRunning 고착 가능(라이브 재현 필요) |
| ③ 복귀 시 스트림 증발 | **O 확정** | 모드 전환·멀티세션 전환 시 구독 해제 + 복원 currentRunId=null + 이벤트 드롭 → **영구 증발**. 멀티 내부(패널 포커스·expand·count)는 전 패널 동시 마운트라 무손실 |
| ④ 고스트 run (신규 발견) | **O** | 언마운트 시 abort 없음 + 이어받을 주체 없음 → 아무도 안 듣는 run이 main에서 토큰 계속 소모 |

### 수리 분류
- **renderer-only 가능**(IPC·영속 스키마 불변): 패널 세션 상태·구독 소유권을 컴포넌트 훅(useReducer)에서 **앱 수명 스코프(zustand 슬라이스 or 모듈 store)로 승격**. 단 6패널 상태+useMultiPersist 재배선+훅 API 결정 = **renderer 내부 설계 분기 → 영호 GO 필요**.
- 부분 봉합(currentRunId만 보존·재주입)은 텍스트 구멍이 남아 **비권장**.
- 앱 **재시작** 후 run 이어붙이기는 main 보관+pull 필요(P3c 계열 밖, 별도).

### 라이브 재현 시나리오 (GO 후 검증용)
1. 멀티 패널1 카운트 스트리밍 중 → single 전환 → 3s → multi 복귀 = 부분 텍스트에서 멈춤+idle(예상). 2. 멀티세션 전환 변종. 3. 역방향 유령 isRunning. 4. expand 중 /loop 끊김(부수: PanelView 로컬 orchestration·activeLoop 리셋, `usePanelLoop.ts:59`).

## 설계 분기 (P2 — 영호 결정)
### 결정-무관 (반드시 수정)
- **runId 필터 추가** → 교차오염·유령 차단. `currentRunId` 리셋 정합.
### 선택지
- **Y (최소)**: 위 correctness만 + 전환 시 실행 대화는 백그라운드 계속·완료 시 저장·돌아오면 저장상태 표시. 라이브 스트림 seamless 이음은 안 함. 작음·안전.
- **X (완전)**: 대화별 독립 run 상태(멀티패널 모델 차용) → 돌아오면 라이브 스트림 그대로 이어짐. 큼(아키텍처 변경).
