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

## 멀티패널 — 별도 (미확정, 후속)
`panelApply`(panelSession.ts:278)는 runId로 격리 → 교차오염은 없을 가능성. 대신 `snapshotForPersist`가 currentRunId/isRunning 미영속 + 뷰 전환 시 언마운트 이벤트 손실 여부가 `[추정]`. **별도 확인 필요**(단일채팅과 다른 메커니즘).

## 설계 분기 (P2 — 영호 결정)
### 결정-무관 (반드시 수정)
- **runId 필터 추가** → 교차오염·유령 차단. `currentRunId` 리셋 정합.
### 선택지
- **Y (최소)**: 위 correctness만 + 전환 시 실행 대화는 백그라운드 계속·완료 시 저장·돌아오면 저장상태 표시. 라이브 스트림 seamless 이음은 안 함. 작음·안전.
- **X (완전)**: 대화별 독립 run 상태(멀티패널 모델 차용) → 돌아오면 라이브 스트림 그대로 이어짐. 큼(아키텍처 변경).
