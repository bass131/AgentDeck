# 지속 세션(REPL) 전환 — 설계 검토 드라이버 (compact 생존)

> 사용자 결정(2026-06-26): query()-per-message → **지속 streaming-input 세션(REPL)** 전환 **검토**.
> 목표: 턴 간 대화 맥락 유지 + 내장 `/loop`·`/schedule`·`/goal` 활성화. 이 문서가 단일 진실원.
> 단계: 설계(이 문서) → plan-auditor 감사 → go/no-go(코어 변경 + ADR = 사용자 게이트). **아직 미구현.**

## 1. 실측 근거 (확정 — 추측 아님)

| 프로브(artifacts/, gitignore) | 결과 |
|---|---|
| `context-probe.mjs` | 턴1 "BANANA42 기억해" → 턴2(새 query, resume 없음) "코드워드 없음" → **턴 간 맥락 끊김 확정** |
| `loop-probe.mjs` | `/loop`은 `CronCreate`로 **세션 전용 크론** 예약 — 세션 닫히면 2틱부터 발동 안 함 |
| `loop-persistent-probe.mjs` | **지속 세션**에서 `/loop 1m` 크론이 **입력 없이 주기 발동**(result 3회·TICK 4회) → 내장 /loop 가능 실증 |
| (관측) | **TAO/에이전트 루프(한 턴 안)는 이미 정상** — query() 하나가 think→tool→observe→반복→최종답 |

claude-code-guide(SDK 권위): `query({prompt})`의 prompt는 `string | AsyncIterable<SDKUserMessage>`(sdk.d.ts L2437),
`Query.streamInput()`(L2402) 다중턴, `session_crons` 필드가 "CronCreate/ScheduleWakeup/**/loop** wake this session later"(L6206) 명시. 권고=옵트인 파일럿.

## 2. 현재 구조 (코드 근거)

- `agentRun` IPC(`ipc/index.ts:369`) → `RunManager.start(backend, req, onEvent)`(`agent-runs.ts:93`) → `backend.start(req)` → 새 `AgentRun`.
- `ClaudeCodeBackend._runPump`(L712): `this._req.messages`에서 **마지막 user 메시지만** prompt로(L725), `query({prompt: <string>, options})` **1회**(L877), `for await`로 `result`까지 소비(L939) → 펌프 종료 → **세션 닫힘**. `resume`/`sessionId` 옵션 없음(L798-835). init session_id 캡처하나 "무시"(L85).
- **run = 1 메시지. backend.start가 매번 새 AgentRun + 새 query() + 새 세션.** 렌더러가 full history를 보내도 백엔드가 마지막 1개만 쓰고 버림.

## 3. 목표 구조

**대화(또는 패널)당 `query({prompt: AsyncIterable<SDKUserMessage>})` 1개를 열어둔다.** 사용자 메시지는
새 query가 아니라 **기존 입력 스트림에 push(yield)**. 그러면:
- 한 세션 = 맥락 누적 → **턴 간 맥락 유지**.
- 세션이 idle로 살아있어 → **내장 `/loop`/`/schedule`/`/goal` 크론이 입력 없이 발동**, 결과가 같은 iterator로 수신.

## 4. 핵심 변경 (옵트인 파일럿 권장)

1. **`PersistentSession` 추상**(백엔드 신규): `query({prompt: inputGen()})` 1개 보유. `inputGen`은 닫지 않는 async generator — `send(msg)`가 내부 큐에 push → yield. 이벤트 스트림(events)은 세션 수명 내내 살아있음.
2. **세션 수명**: 대화 첫 메시지에 open → 대화 close/사용자 abort(세션 종료)/app-close에 close(generator 종료 + `abortController.abort()`). **패널별 독립 세션**(멀티 6개 = 6세션).
3. **메시지 = push, not new query**: 기존 `agentRun`(또는 신규 `session.send` 채널)이 세션 존재 시 push, 없으면 open. 신뢰경계: 여전히 main 단독, string만 운반(ADR-003).
4. **cron-turn 수신**: 세션 iterator로 **사용자 입력 없이** 도착하는 turn(`system/init` → `assistant` → `result`)을 UI에 **새 assistant 턴**으로 렌더. (프로브 47.5s/108.0s에서 관측된 패턴.)
5. **abort 의미 분리**: "현재 turn 중단"(SDK `interrupt()`) vs "세션 종료"(generator 종료 + abort). 현재 abort는 후자만 — 분리 필요.
6. **F-B 펌프 재해석**: 한 세션에 `result`가 **턴마다 여러 번** → `done`을 **turn 경계**로 emit하되 **세션·이벤트 스트림은 유지**. (ADR-021 F-B done-coalescing은 단발 가정 — 재정의 필요.)

## 5. 리스크 (큰 것 — 감사 중점)

- 🔴 **idle 연결 타임아웃(~5분, 가이드 경고)**: 순수 idle 세션이 얼마나 사는지 **미검**. 프로브는 `/loop 1m`이라 active 유지된 것 — **순수 idle 세션 수명 별도 프로브 필수**(아래 단계1). 드롭 시 lazy re-open + 맥락 복원(resume) 필요 → 복잡도↑.
- 🔴 **회귀**: 코어 펌프·run-manager·run 생명주기 변경 → **비-REPL 동작 회귀가 최대 위험**. 옵트인 플래그로 기존 경로 보존 필수.
- 🟡 **메모리**: 장수 세션 transcript 누적(대화 길수록↑). 멀티 6세션 동시 = 연결·메모리 비용.
- 🟡 **abort/permission/question 라우팅**: 세션 내 여러 turn에 걸친 requestId·runId 매칭 재설계.
- 🟡 **IPC/runId 모델**: 현재 runId=1메시지. 세션 스코프로 재정의(세션ID + turnID?) 또는 호환 유지 범위.
- 🟡 **앱 레벨 /loop 충돌**: 내장 /loop 살리면 지금 만든 앱 레벨 /loop(99c06c7·7ed45be) 처리 — 대체/폴백/공존 결정.

## 6. 열린 질문 (plan-auditor 확정)

1. **범위**: 전 대화 기본 REPL vs 옵트인 플래그(특정 대화만). 단발 모드 폴백 유지?
2. **맥락만 먼저 vs 풀 REPL**: 맥락 끊김만 `resume`/full-history로 싸게 먼저 고치고(작음), REPL은 /loop 가치 확인 후? 아니면 한번에?
3. **idle 타임아웃**: 순수 idle 세션 수명 실측 후 heartbeat/re-open 전략 결정(단계1 선행).
4. **멀티 패널**: 6세션 동시 보유 비용 허용? lazy(활성 패널만)?
5. **cron-turn UI**: 입력 없이 오는 turn을 대화에 어떻게 표기(자동 발동 배지)? 기존 thread 모델 영향.
6. **ADR**: ADR-016(query-per-message)·ADR-021(F-B 펌프) 개정 + 신규 ADR 범위.

## 7. 마이그레이션 단계 (제안 — 감사 후 확정)

1. **idle 타임아웃 프로브**(선행·필수): 지속 세션 open → 일반 메시지 1개 → ~6분 순수 idle → 후속 메시지 도달하나? heartbeat 필요 여부 실측.
2. `PersistentSession` 추상 + 단위(mock query AsyncIterable로 push→turn 시퀀스).
3. 백엔드 streaming-input 모드(**옵트인 플래그**) — 비-REPL 경로 회귀 0 단정.
4. run-manager/IPC 세션 수명 배선(open/send/close + abort 분리).
5. 렌더러: 세션 모델 + cron-turn 렌더 + **맥락 유지 e2e**(2턴 기억) + 내장 `/loop` 라이브.
6. 앱 레벨 /loop 처리 결정(대체 시 걷어냄 / 비-REPL 대화용 폴백 유지).
7. ADR 개정(016/021) + 신규(사용자 게이트) + reviewer 통합.

## 8. 영향도 / 등급

**대규모**(코어 엔진·run 생명주기·IPC·렌더러 동시) → plan-auditor 사전 + 단계별 파일럿 + reviewer 통합.
ADR 개정 = 사용자 게이트. **이 문서 = 단일 진실원**. 프로브 3종 = `artifacts/*.mjs`(gitignore).
관련 메모리: per-message-context-loss · loop-intent-builtin-vs-gui.

## 9. plan-auditor 감사 반영 (확정 계획 — 2026-06-26)

**판정**: 설계 방향 승인 + **단계적(맥락 먼저 → REPL 후) 강력 권고**. scope creep 없음(원본 AgentCodeGUI는
CLI 인터랙티브=REPL이라 맥락 누적 → query()-per-message는 query() 호스트 적응의 *부산물*이지 충실도 아님 →
REPL 전환 = **원본으로의 회귀(충실도↑)**. ADR-013 + 사용자 직접 지시로 정당).

### Phase 1 — 맥락 먼저 (작고 안전, 즉시 가치) ★ ✅ 완료(2026-06-26, `81255d8`·ADR-023)
턴 간 맥락만 복구. **펌프 국소 변경** — run-manager·waiter·세션수명·cron-turn **무관**. 회귀 표면 최소.
- 방식: **(a) `resume` 확정** (실측 `artifacts/resume-probe.mjs`: 턴1 session_id 캡처 → 턴2 `options.resume`로
  넘기니 "BANANA42" 기억 ✅, session_id 턴 간 동일=forkSession 기본 false라 같은 세션 계속). (b) full-history는
  SDK 입력이 user 메시지만 스트림이라 assistant 턴 재생 불가 → 기각. SDK 근거: `resume?: string`(sdk.d.ts L654).
- 배선: ① 백엔드가 `system/init`의 `session_id` 캡처(현재 미캡처 — L85 주석뿐) → 엔진중립 `session` AgentEvent로
  표면화(ADR-003: session_id는 불투명 토큰; `resume` *옵션 매핑*만 어댑터 내부) ② 렌더러가 대화/패널별 저장 →
  다음 `agentRun`에 `resumeSessionId` 전달 ③ 백엔드가 `req.resumeSessionId` 있으면 sdkOptions에 `resume` 추가.
  (Phase 1은 인메모리 연속성; 대화 영속에 session_id 저장은 쉬운 후속.)
- 완료조건(측정): `context-live.e2e.ts`(턴1 "BANANA42" → 턴2 회상 단정) PASS + **기존 3477 단위 + 단발 e2e 회귀 0**
  (= "회귀 0"의 유일 측정법) + typecheck 양쪽.
- ADR: ADR-016 **개정**(per-message → 맥락 유지 호출 패턴).

### Phase 2 — 풀 REPL + 내장 /loop (크고 위험, 게이트) — Phase 1 검증 후 별도 go/no-go
장수 idle 세션. **위험 대부분이 여기 집중**(idle 타임아웃·6세션 비용·cron-turn 동시성/권한·app-close 정리·
ADR-022 충돌). idle 프로브 결과로 진행 결정.
- **단계 0(설계 결정 — 선행)**: ① `artifacts/idle-probe.mjs` — 순수 idle 세션 6분 후 후속 send 도달 여부 +
  드롭 시각 + 10턴 후 입력토큰 **숫자 출력**(이 숫자 없이 설계 확정 불가). ② **ADR-022(앱 레벨 /loop) 충돌
  3안 택1**(공존/대체/폴백) — 이게 옵트인 플래그 의미론을 정의하므로 선행.
- 단계: PersistentSession 추상(QueryFn `prompt: string | AsyncIterable<SDKUserMessage>`로 타입 확장 +
  기존 string-prompt mock union 호환) → 옵트인 플래그(비-REPL 경로 회귀 0) → run-manager/IPC 세션수명
  (open/send/close + **abort 분리**: turn interrupt vs 세션 종료) → 렌더러 세션모델 → cron-turn 렌더 →
  내장 /loop 라이브.
- ADR: ADR-021 **개정**(F-B done = turn 경계, 세션 유지) + **신규 ADR**(PersistentSession 수명·cron-turn·abort 분리).

### 🔴 놓친 치명 리스크 (Phase 2에서 필수 처리)
1. **세션 드롭 × in-flight 권한**: idle 드롭 시 `_waiters`(canUseTool await) orphan → 일괄 deny resolve + UI 통지.
2. **cron-turn 동시성/권한 (최대 위험)**: 입력 없이 오는 turn이 `canUseTool` 발화 + 사용자 메시지와 같은
   iterator 인터리브 → **runId=1메시지 라우팅 붕괴**. cron-turn 권한정책 명시(자동 deny? read-only 강제?) +
   `system/init`→`result`로 turn 경계 끊어 turnId 태깅. (단계적 접근의 최대 이점 = 이 위험을 Phase 2로 격리.)
3. **app-close 6세션 정리**: `before-quit`/창파괴에 전 세션 generator close + abortController.abort() 배선(좀비 0).
4. **QueryFn.prompt 타입 확장**: string-prompt mock 다수 영향 — union 호환. SDKUserMessage 형상 어댑터 밖
   누출 0(reviewer 게이트).

### 멀티 패널: **lazy**(활성 패널만 REPL open, 비활성은 단발 폴백) — 6 idle 세션 동시 비용 회피.
### 누락 작업: PRD/FEATURE_MAP에 이 전환 위치 기록(ADR-013 충실도 회귀로 명문화).
