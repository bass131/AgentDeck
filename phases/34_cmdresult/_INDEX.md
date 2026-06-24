# Phase 34 — M6: cmdresult 슬래시 진행카드 (W3)

> 드라이버: `docs/WEAKNESS_BOOST.md` M6. 슬래시 커맨드(/compact 등)가 **무피드백**인 약점 → 진행카드(running→done/failed).
> 등급: **복잡(renderer 교차)**. threadTypes·reducer·panelSession·appStore·Conversation·MultiWorkspace 한 커밋 동반.
> **plan-auditor 차단 4건 반영**(아래 §0).

## 0. 현황·스코프 결정 (plan-auditor 정정 반영)
- **cmdresult 타입 부재(B3 정정)**: threadTypes에 cmdresult **없음**(msg/thinking/toolgroup/notice만) → **신규 추가**. 렌더 분기는 단일(Conversation)·멀티(MultiWorkspace PanelView threadMsgs는 msg-only 필터) **양쪽 모두 부재** → 양쪽 추가 필요.
- **절감통계(%) OUT(B1)**: 우리는 원본의 per-turn `context` 이벤트/result.contextTokens 파이프가 **없음**(done.usage는 누적일 개연 — after>before로 stats 영구 null). 정밀 절감 % 통계는 **OUT**(per-turn context 파이프 신설 = 별도 증분). M6은 **진행카드 + 정성 sub**("이전 N개 메시지를 핵심 요약으로 압축")까지. ⇒ **shared/agent-backend 무변경**(done.contextTokens 불요) → **renderer-only**.
- **begin 통합 양경로(B2)**: user 메시지 push가 단일(appStore.sendMessage)·멀티(panelReducer ADD_USER_MESSAGE) **분산** → 카드 begin도 **양쪽** 추가(panelApply 위임은 done/error만 자동, begin은 로컬이라 수동).
- **snapshot 미영속(B4)**: cmdresult/pendingCommand는 M3 PanelThreadSnapshot(msg-only)에 **미영속**(running 카드 복원 영구 스피너 차단 — 원본 snapshotForPersist 미러로 우연히 안전). pendingCommand는 복원 시 리셋.

## 1. 목표 (왜)
원본은 `/compact` 등 카드형 슬래시 전송 시 진행카드: "대화를 요약하는 중…"(running) → "대화를 요약했어요"(done) / "명령을 완료하지 못했어요"(failed). 우리는 무피드백(W3).

## 2. 범위 (무엇) — renderer-only
### A. `lib/cmdCards.ts`(신규·순수 데이터)
- `CMD_CARDS: Record<string,{title,running,sub}>`(원본 session.ts L77-82 미러, 최소 `compact`). `commandOf(text): string|null`(카드 커맨드만, 그 외 null). (`nowTime`은 §C 컴포넌트 전용 — reducer는 CMD_CARDS만 import, 순수 유지.)

### B. `threadTypes.ts`
- `cmdresult` kind 추가: `{kind:'cmdresult', id, name, title, sub?: string|null, running: boolean, failed?: boolean, time?: string}`. L10 주석 갱신.

### C. reducer + 양 send 경로
1. `reducer.ts`:
   - AppState `pendingCommand?: {name, cardId, beforeMsgs}`(원본 pc 축소 — beforeContext OUT). `makeInitialState`에 미포함(undefined).
   - **begin-command 액션** `{type:'begin-command', name, cardId, time}`(time=컴포넌트 nowTime() — 순수): cmdresult running 카드 push(`title:CMD_CARDS[name].running, running:true, time`) + pendingCommand 기록(beforeMsgs=현 msg kind 수). **인터리브 정합**: `openMsgId=null, openGroupId=null`(다음 text 새 버블).
   - **done in-place**(원본 L398-432 축소): pendingCommand 있으면 cardId 카드 갱신 `{running:false, title:CMD_CARDS[name].title, sub:`이전 ${beforeMsgs}개 메시지를 핵심 요약으로 압축했습니다.`}`. **stats 없음**. pendingCommand 클리어. **time은 begin time 유지**(done이 백엔드 이벤트라 nowTime 순수성 회피 — 카드 time 미갱신).
   - **error**(S2 순서): error 이벤트 시 pendingCommand 있으면 카드 `{running:false, failed:true, title:'명령을 완료하지 못했어요', sub:e.message||null}` + pendingCommand 클리어 → 뒤따르는 done은 pending 없어 **이중처리 0**.
2. `panelSession.ts`(교차 동반): done/error in-place는 panelApply→applyAgentEvent 위임으로 **자동**. **begin은 panelReducer 로컬 액션 추가**(ADD_COMMAND_CARD 또는 ADD_USER_MESSAGE에 command 분기) + `send()`가 카드 슬래시 시 begin dispatch.
3. `appStore.ts`(단일채팅): `sendMessage`(또는 dispatchSend 경유)에서 `commandOf(text)` 분기 → begin-command dispatch(카드 push, user 버블 대체).

### D. 렌더 (양쪽·B3)
- `Conversation.tsx`: dispatchSend(L437~) — /clear·/ask 옆 카드 슬래시(`commandOf`) 감지 → begin dispatch(time=nowTime()) + 백엔드 전송(슬래시 백엔드도 실행). thread.map에 **cmdresult 분기** → `CmdResultCard`.
- `MultiWorkspace.tsx`: PanelView threadMsgs **msg-only 필터에 cmdresult 포함** + cmdresult 렌더(또는 별 분기). 패널 composer send도 카드 begin.
- `CmdResultCard` 컴포넌트 + CSS(running 스피너·done·failed, 원본 카드 스타일 미러).

### OUT
- **절감 % 통계**(컨텍스트 bp%→ap% · 토큰 회수) — per-turn context 파이프 부재(B1). 후속 증분.
- `time` 전 ThreadItem 부여+렌더(msg/toolgroup time) — M8(W7). M6은 cmdresult.time만(생성).
- compact 외 카드 확장 — 최소 compact.
- cmdresult/pendingCommand 영속·복원(B4) — 미영속(running 스피너 차단).

## 3. 도메인 R/W
| 도메인 | 파일 | R/W |
|---|---|---|
| renderer | `lib/cmdCards.ts`(신규)·`threadTypes.ts`·`reducer.ts`·`panelSession.ts`·`appStore.ts`·`components/Conversation.tsx`(+CmdResultCard)·`components/MultiWorkspace.tsx`·CSS | W |
| qa | `tests/**` | W |
| 불변(확인) | shared·agent-backend(stats OUT → done 무변경)·threadTypes 외 인터리브 | 무변경 |

## 4. 의존성 순서
1. 실패 테스트 먼저(commandOf·reducer begin→running·done in-place(sub)·error failed·이중처리0·panelReducer begin·인터리브 무회귀) → 2. lib/cmdCards → 3. threadTypes cmdresult → 4. reducer(pendingCommand·begin·done·error) → 5. panelSession begin 동반 → 6. appStore begin → 7. Conversation·MultiWorkspace 렌더 + CmdResultCard → 8. typecheck 양쪽 green → 단위 green → 9. 라이브 e2e(/compact 카드 전이) → reviewer → commit.

## 5. 측정가능 완료조건 (AC)
- [ ] **commandOf/CMD_CARDS 단위**: "/compact x"→"compact", "/review"→null, 일반 텍스트→null.
- [ ] **begin→running 단위(단일+멀티 B2)**: /compact begin → cmdresult `{running:true, title:'대화를 요약하는 중…'}` push + pendingCommand{beforeMsgs}. **appStore(단일)·panelReducer(멀티) 둘 다** 카드 push 검증.
- [ ] **done in-place 단위**: done → 같은 cardId 카드 `{running:false, title:'대화를 요약했어요', sub:'이전 N개...'}` **in-place 갱신**(새 카드 0). pendingCommand 클리어.
- [ ] **error failed + 이중처리0 단위(S2)**: error → `{running:false, failed:true, title:'명령을 완료하지 못했어요'}` + pendingCommand 클리어 → 뒤 done은 무동작(이중 갱신 0).
- [ ] **인터리브 무회귀(CRITICAL)**: begin 카드 push가 기존 msg/toolgroup/notice 인터리브(openMsgId/openGroupId/seq) 무파손. begin이 openMsgId/openGroupId=null로 다음 text 새 버블. 기존 인터리브 테스트 green.
- [ ] **순수성**: reducer가 nowTime() 직접 호출 0(begin time은 액션, done 카드 time 미갱신) — 단위 결정적.
- [ ] **렌더 단위(단일+멀티)**: cmdresult ThreadItem → CmdResultCard DOM(running 스피너/done/failed). MultiWorkspace 패널에서도 표시(threadMsgs 필터 포함).
- [ ] **라이브 e2e**: 실 /compact → 진행카드(running) DOM → 완료(done title) 전이.
- [ ] **회귀 0**: 기존 thread/reducer/panel/M3 snapshot 테스트 green(cmdresult 미영속 확인). typecheck 양쪽 green. m4-4-* 2건 증가 0.

## 6. 검증 3층
- ① 단위 TDD: commandOf·reducer begin/done/error/이중처리·panelReducer begin·인터리브 무회귀.
- ② 스모크: (선택) — stats OUT이라 백엔드 결합 없음, 생략 가능.
- ③ 라이브 e2e: /compact 카드 running→done DOM 전이.

## 7. 리스크·롤백
- **교차 회귀(threadTypes·reducer·panelSession·appStore·Conversation·MultiWorkspace)**: cmdresult가 Phase A 인터리브 깨면. 완화 = cmdresult 인터리브 포인터 독립 + begin이 포인터 null + 기존 인터리브 테스트 재실행 + 양 send 경로 동반.
- **begin 비대칭(B2)**: 단일만/멀티만 카드 → 비대칭. 완화 = AC 양쪽 분리 측정.
- **running 영구 스피너(B4)**: 미영속으로 차단(snapshot msg-only). pendingCommand 복원 리셋.
- **순수성**: done 카드 time 미갱신으로 nowTime 리듀서 호출 0.
- **롤백**: cmdresult/begin/pendingCommand additive → revert 1커밋. 카드 미표시여도 슬래시 백엔드 정상(graceful).

## 8. ADR
- 불요. renderer-only 충실도 복원(stats OUT으로 backend-contract 깃발도 불요). _INDEX 흔적 + reviewer.
