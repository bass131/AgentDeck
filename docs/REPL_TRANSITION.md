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

## 10. Phase 2a 구현 설계 (REPL 단일채팅 옵트인)

### ✅ GO 확정 (사용자 2026-06-26) + 분석 정정
**사용자 결정: 풀 REPL 진행.** 근거(사용자 실측): 내장 /loop은 "주기마다 cron이 루프 프롬프트를 입력란에
자동 삽입 → 정상 응답"으로 동작 = **타이머 주입 정상 턴**. 따라서:
- **정정 1 — cron턴 권한 = 세션 모드 상속(정상 턴)**. auditor의 "자율턴=read-only 강제"는 **오판→철회**.
  cron턴은 일반 user 턴과 동일 권한(사용자가 /loop 돌릴 때 정한 모드). read-only 머신/orphan 특수처리 불요.
- **정정 2 — 앱 레벨이 더 단순하다는 판단 오류**. 앱 레벨은 "응답완료↔다음입력 타이밍 동기화"를 우리가
  직접 설계(현 drain/tick effect, 깨지기 쉬움). REPL은 SDK 크론이 그 동기화를 내부 처리 → 더 깔끔.
- **§9 재평가의 "가치↓·재고" 결론 폐기** — 맥락(resume) ≠ REPL(/loop)은 별개 트랙이고, REPL은 자체 목적(진짜
  내장 크론)으로 진행. fragility는 수용(세션 살아있는 동안 동작 — Claude Code도 동일).

### 🏁 3턴 적대 토론 수렴 결과 (2026-06-26) — 설계 방향 확정(구현 승인 X)
메인 에이전트 의견("타이머+resume+마커")이 Opus 적대 검토로 무너짐. **수렴 설계:**
- **1차: self-re-arm 라이브 세션(REPL)** — `query({prompt: AsyncIterable})` 지속 세션 + ScheduleWakeup
  짧은 안전간격(~4분) 자기재무장 + Monitor 이벤트 즉시 깨우기. Claude가 Cron 도구(CronCreate/Update/Delete)로
  루프 자기제어, 상태가 **세션 내 보존**(= 사용자가 원한 "진짜 내장 /loop"). 세션-스코프라 self-re-arm이
  세션을 스스로 살림(idle 타임아웃 이김).
- **2차: 외부 watchdog** — main이 **실제 세션 사망**(크래시/강제종료/연결단절)만 감지 → resume 재개 + 크론
  재예약. self-re-arm은 idle은 이기나 연결단절은 못 이김 → 필수. **무측정 확실성 위의 무조건 토대.** 단
  "진짜 죽음에만 1회 발동"으로 엄격 격하(정상 만료 vs 이상 사망 구별 필수 — 안 하면 좀비 오토리바이브 버그).
- **폐기**: 메인의 "마커" 안(이벤트게이트·연속self-pace 구조적 불가, 재생성마다 크론상태 증발) — 복구수단으로만 잔존.

**코드로 확정(프로브 불필요)**: Monitor/ScheduleWakeup/Cron이 헤드리스 SDK 1급 도구 실재
(`sdk-tools.d.ts:39-45`) · 크론=세션스코프(`sdk.d.ts:6212` "wake this session") · streaming-input=설계된
held-open 모드(`sdk.d.ts:2186-2243`) · `agent-runs.ts:126` done→delete는 옵트인 플래그로 두 번째
라이프사이클 분기 격리(178줄 단일파일, 단발경로 3494 테스트 영향 0).

**게이트(미측정 — 프로브 선행)**: ① 4분 self-re-arm이 세션을 20→60분 무한 연장하나 ② Monitor가 헤드리스
즉시 fire하나 ③ session_crons 비는 시점 ④ 정상만료 vs 이상사망 구별 + 의도적 kill로 watchdog 재개경로 검증.
→ `artifacts/rearm-probe.mjs` 20분 압축 → 양성이면 60분 확정.

**구현 게이트(헌법)**: 설계 방향 합의일 뿐 **구현 승인 아님**. 엔진 라이프사이클 변경 = ADR 선행(ADR-016 계열)
+ TDD 선행. 프로브 → ADR → 옵트인 단계 빌드.

### ✅ GO 확정 + 자율 빌드 위임 (사용자 2026-06-26)
**사용자 "OK Go, 자리 비우니 전부 진행" → ADR-024 승인 + 옵트인 단계 빌드 자율 실행 위임.** 불변 게이트:
**push/PR/merge/배포 = 인간 게이트 불가침(무인 실행 금지)** · TDD 선행 · 각 단계 회귀 0(3494 유지) 단정 · reviewer 통합.
- **ADR-024**(`docs/ADR.md`) — 지속 세션 self-re-arm + watchdog. 게이트 프로브 재실측 양성 추세(fire 4회/5분, 세션 무사망).
### 🔧 plan-auditor 최종 감사 반영 — 빌드 순서 교정 (2026-06-26, agent a037fe765aa2e1051)
**판정: 수정 필요(🔴 5).** go 유효·신뢰경계/도메인경계 양호. 핵심 교정:
- **🔴 done emit 모델 정정(최대 미식별)**: 현 펌프는 done을 **루프 자연종료 후 루프밖 1회만** push(`ClaudeCodeBackend.ts:1169`)하고 `_close()`(`:1194`). 분해 전제("run-manager done→delete가 cron턴 미라우팅")는 **현 구조와 불일치** — held-open은 그 push 지점에 영영 도달 안 함. 실제 작업 = **펌프가 `persistent`에서 turn 경계(`result`)마다 done emit**(F-B 보류 `:1015` 분기) + run-manager done≠close 분기. **펌프(구 2)가 run-manager(구 1)에 선행.**
- **🔴 (3) origin 신호 미검증**: user vs cron turn 구별 SDK 신호 소스 불명 → **`origin-probe` 선행**(미확정이면 직렬화 큐 단독 + "병렬 turn 없음" 단정).
- **🔴 (4) watchdog 음성검증 부재**: "정상 close→미발동 + kill→1회 발동" 구별 신호(iterator return vs throw) **`watchdog-probe` 선행**. 좀비 오토리바이브 위험.
- **🔴 (5) currentRunId 필터 충돌**: `panelSession.ts:258`이 `runId!==currentRunId` 이벤트를 버림 → 입력없는 cron-turn 통째 드롭. **sessionKey-안정 runId 태깅을 (0)에서 계약화**(필터 "재사용" 아님 = 모델 재정의).
- **🔴 누락 app-close**: `before-quit` closeAll(좀비0)이 순서에 부재 → (4)에 병합.
- 기준선 **~3551**(3494 stale) · `QueryFn` union은 `AsyncIterable<unknown>` 유지(SDKUserMessage 형상 본문 격리, ADR-003).

**교정 빌드 순서**(독립 커밋·미push):
- **(0) shared 계약**: `AgentRunRequest.persistent?`/`sessionKey?` + `AgentEvent` turn-경계/origin 필드(`agent-events.ts`) + `AgentRun.interrupt()` 인터페이스 + 전 어댑터(Codex/Echo) no-op stub(타입 일관). ✅ 가산·회귀0.
- **(1) 펌프 held-open + turn-done emit**: `_runPersistentPump` **별도 메서드**(단발 `_runPump` 무변경), mock union, turn 경계 done emit·error 재해석. 단발 회귀0.
- **(2) run-manager 세션모델**: `agent-runs.ts:126` done≠close 분기(`req.persistent` 게이트), sessionKey 장수 채널. (1) turn-done 선행 필수.
- **(3) cron-turn 라우팅 + abort 분리**: `origin-probe` 확정 후 — pending-send/직렬화 큐 + `interrupt()`(현재턴)/`closeSession()`(세션종료) 부수효과 분기.
- **(4) watchdog + app-close**: `watchdog-probe` 확정 후 — 실제 사망만 resume 재개(1회 멱등) + `before-quit` closeAll(좀비0 핸들 카운트).
- **(5) 렌더러**: REPL 토글 + **currentRunId 세션스코프 재정의** + cron-turn 휘발 렌더 + LoopIndicator(session_crons) + lazy 멀티.
- 각 단계 독립 커밋·미push. ADR-003(엔진 리터럴 어댑터 내부)·신뢰경계(main 단독)·TDD 선행·한국어 불변.

### ✅ 게이트 프로브 3종 전부 양성 (2026-06-26) — 전 단계 설계 unblocked
| 프로브(artifacts/, gitignore) | 결과 | 설계 확정 |
|---|---|---|
| `rearm-probe` | self-re-arm fire **8회/21분** 균일(~180s)·무사망·동일 session_id | 1차 self-re-arm 성립 → 라이브 세션 유지 |
| `origin-probe` | user-turn vs cron-turn 메시지 구조 **동일**(system/init→assistant`parent_tool_use_id:null`→result, init키 동일) → **SDK origin 신호 부재**. 턴은 **직렬·비인터리브** 관측 | (3) **호스트측 직렬화 큐 + pending-send 카운터**(SDK 신호 불요). 한 번에 1턴 yield, result 전까지 다음 user 미투입 → cron턴=미투입 turn으로 귀속 |
| `watchdog-probe` | 정상 close=**clean return**(throw0)·abort(사망)=**throw "Operation aborted"**·abort후 **resume 복구 성공** | (4) **`didRequestClose=false && 스트림종료/throw` → 1회 발동**. 정상 close는 미발동(좀비 0). 사망 후 resume(ADR-023)으로 복구 |

### 🏗️ 구현 진행 현황 (2026-06-26, 자율 빌드 — push 0)
**백엔드 코어 (0)~(2) 완료 — 전부 TDD+reviewer+프로브 검증, 전체 3512 green·typecheck 양쪽.**
| 단계 | 상태 | 커밋 | 내용 |
|---|---|---|---|
| (0) shared 계약 | ✅ | `303eab4` | persistent/sessionKey·done.origin·AgentRun.interrupt() + Codex/Echo stub. TDD persistent-contract(4) |
| (1) held-open 펌프 | ✅ | `4caa820` | `_processSdkMessage` 순수 추출(단발 1:1 보존) + `_runPersistentPump`(held-open `_inputGen`·turn별 origin done emit·no-close) + `push()` + PersistentQueryFn. TDD persistent-pump(7). **reviewer 통과(CRITICAL 0, 단발 회귀 0 diff 실증)** |
| (2) run-manager 세션모델 | ✅ | `5b6c038` | persistentRuns Map·done≠delete(persistent)·sessionKey 후속 turn push·runId=sessionKey 안정. TDD persistent-session(7) |
| (3) interrupt IPC | ✅ | `b603a5b` | AGENT_INTERRUPT + run-manager.interrupt(턴만 중단·세션유지) + preload. origin/pending-send은 (1). TDD IT1/IT2 |
| (5a) 렌더러 기본 배선 | ✅ | `46ae0a4` | replMode(default true)·sessionKey·sendMessage/panelSession persistent 동반·`/loop` 통과 게이트(단일+멀티). TDD repl-mode(16)+multi REPL 통과 |
| (4) watchdog + app-close | ⏳ 잔여 | — | 신호 확정(watchdog-probe). 남음: 실제 사망(throw·didRequestClose=false) → resume 재개 **1회 멱등**(⚠️ 좀비 오토리바이브 리스크 — 신중 설계+사용자 인지 권장) + before-quit closeAll(좀비0) |
| (5b) 렌더러 시각 | ✅(**dev 사인오프 대기**) | `095f15a` | 컴포저 REPL 토글(default ON·라벨 "REPL"·UltraCode pill 재활용) + cron-turn 배지("자율 발동", reducer origin 마킹) + 정지=interrupt/abort 분리(interruptRun). TDD repl-ui-toggle(12) |
| (5c) LoopIndicator + 세션종료 | ⏳ 잔여 | — | **백엔드 session_crons 표면화**(claude-stream→중립 AgentEvent, ADR-003) + LoopIndicator를 그 상태로 재배선 + "세션 종료" 버튼(인디케이터에). reducer/shared 변경 동반 |

### 🎛️ UI 활성화 결정 (사용자 2026-06-26)
1. **REPL이 기본 모드** — 모든 세션 default `persistent=true`(sessionKey=conversationId). **헤드리스 단발(`-p`)은 명시적 옵트아웃**(어포던스 형태 확정 대기). → (0)~(2) 백엔드 그대로, **활성화 층에서 default 뒤집기**(renderer/ipc). 단발 경로는 명시 토글/모드일 때만.
2. **`/loop`(및 크론 슬래시)은 내장 스킬처럼 SDK 통과** — 앱 레벨 `/loop` 인터셉트(ADR-022) **제거**(REPL 모드), Claude가 라이브 세션 크론 도구로 자기제어. LoopIndicator는 `session_crons` 반영(GUI 유지·엔진 제거 — 사용자 기존 지시 일관).
3. **cron-turn** = 일반 assistant 턴 + **배지**("🔁 루프/자율") (2a). **정지** = 현재 턴 interrupt(세션 유지) + **세션 종료 별도**(3a) → interrupt IPC(3) 필요.
- **idle 사망 처리**: default-REPL 세션이 idle ~6분 후 죽어도 다음 메시지가 resume(ADR-023)으로 맥락 복원 + run-manager(2) 정리→새 세션. /loop 활성 중엔 self-re-arm 유지(rearm-probe). watchdog(4)는 연결단절 복구.
- **잔여 빌드**: (3) interrupt IPC → (4) watchdog+app-close → (5) renderer(default persistent 배선·`/loop` 통과·currentRunId 세션스코프·cron-turn 배지·정지 분리·LoopIndicator·단발 어포던스). **(5) 미적/동작 사인오프 대상.**

**자율 빌드 경계(사용자 부재)**: (0)~(2) 백엔드 코어는 단발 경로 회귀 0으로 격리 완료(옵트인 — persistent=false면 기존 동작 그대로, 3512 green). (3)~(5)는 (5) UI 활성화 전까지 dormant + (5)는 사인오프, (4) auto-revive는 좀비 리스크 → 사용자 복귀 후 활성화 단계로 진행 권장. (3) interrupt IPC는 소규모 플러밍(다음 단계 즉시 가능).

### 🔑 긴 주기(30분~1시간) 제약 → 메커니즘 재결정 (사용자 2026-06-26)
**라이브 세션 REPL은 긴 주기에서 깨진다.** 1시간 주기 = 세션 1시간 idle 생존 필요인데, 프로브는 6분만 확인,
30분~1시간은 연결 타임아웃으로 죽음 → 크론 영영 미발동. heartbeat(~4분 더미턴)는 토큰낭비+대화오염+fragile.
(Claude Code CLI도 동일 — 터미널 세션이 그 시간 내내 살아야 함. headless SDK는 보장 불가.)

**→ 정답: "우리 타이머 + resume"** (= 사용자 모델 "주기마다 프롬프트 주입" 그대로, 타이머만 우리가 쥠):
타이머가 주기에 fire → `resume`(디스크 맥락 복원) + 루프 프롬프트 주입 → 정상 턴(풀 권한) → 완료 → 다음 타이머.
- 타이머는 앱 열린 한 **어떤 주기든** 정확(세션 생존 무관). resume이 맥락 디스크 복원(라이브 세션 불요).
- **이미 구축됨**: 앱 레벨 /loop(타이머+주입, ADR-022) + Phase 1 resume(틱이 sendMessage 경유 → resumeSessionId
  전달 → **틱마다 맥락 이어짐, 이미 동작**). 라이브 REPL은 긴 주기에 strictly worse → **풀 REPL(§10) 탈락.**

**남은 작업(작음)**: ① 루프 틱이 실제로 resume으로 맥락 잇는지 라이브 재확인(긴 주기 시뮬). ② session_id 영속
(앱 재시작 후 resume) ③ /loop GUI(LoopIndicator 이미 있음) 정리. **§10 라이브세션 REPL은 보류(긴 주기 부적합).**

### ⚠️ plan-auditor 감사 결과 (2026-06-26) — §10(라이브세션) 보류로 대부분 무효, 참고만
**판정: 수정 필요(7항목).** 방향·신뢰경계 격리·옵트인 구조는 건전하나, **실제 범위가 §10보다 큼**:
- **🔴 최대 미식별 작업 = run-manager 코어 재설계**: `agent-runs.ts` L126이 **첫 done에서 run 삭제** →
  지속 세션은 done이 턴마다 와서 **2번째 cron턴부터 이벤트 미라우팅**(§10-C "필터 재사용"은 렌더러 절반만 봄).
  → **0단계 신설: run-manager를 세션수명 모델로(done≠삭제, 세션 close에만 삭제, sessionKey 장수 채널)**. 3489 테스트가
  의존하는 코어.
- **🔴 cron-turn 권한 = read-only 강제 권고**: 입력 없이 온 턴이 fs Write 권한모달 → orphan waiter/의도없는 부수효과.
  안전기본 = **MUTATING/Bash 자동 deny + notice**. 즉 **자율 /loop은 파일 수정·명령 실행 불가**(읽기전용). 코딩 반복엔 큰 제약.
- **🔴 pending-send 카운터 단독 비견고**: 경합(cron턴 중 유저 push)·병렬(Task/Workflow) → 턴 직렬화 큐 + SDK origin 신호 보강 필요.
- **🔴 abort 2분기 파급**: `AgentRun.interrupt()` 신설(전 어댑터 Echo/Codex) + IPC 분기 + run-manager interrupt시 미삭제.
- **🔴 app-close**: before-quit 동기 → `e.preventDefault()+await closeAll()+타임아웃`(좀비0=프로세스핸들 카운트0 측정).
- **🔴 §9 재평가 미해소**: §9가 "풀 REPL 가치↓ 재고권장"인데 §10이 반박 없이 구현 진입 → **사용자 go/no-go로 닫아야**.
- **🔴 완료조건 측정**: ADR-023식("전체 단위 green+단발 e2e 회귀0") 재사용.

**재분해(감사 권장)**: 0)shared 계약(QueryFn union·interrupt·persistent/sessionKey) → 1)run-manager 세션모델 →
2)PersistentSession+Manager+옵트인(회귀0) → 3)턴직렬화큐+origin+cron read-only+abort분기 → 4)before-quit closeAll →
5)렌더러 토글·라우팅·LoopIndicator(session_crons 프로브 선행)+라이브 → 6)2b 엔진제거 → 7)ADR.

**드러난 트레이드오프(사용자 결정용)**: 내장 /loop(REPL) = ① fragile(세션 죽으면 멈춤) ② **read-only 제약**(자율턴 Write 불가)
③ 코어 run-manager 재설계(회귀 위험) ④ 5도메인+ADR 개정. vs 앱 레벨 /loop = 견고·풀권한·이미 완성. **go/no-go 대기.**

### (이하 원안 — go 시 위 재분해로 갱신)

> 트랙 분리(사용자 2026-06-26): **세션 맥락 저장(resume, 별개 작은 트랙)** ≠ **풀 REPL(라이브 세션, 이 §10)**.
> 둘은 독립. §10은 라이브 세션 = 자동 /loop·schedule 전용. 맥락은 Phase 1 resume가 이미 담당(라이브든 아니든).

**게이트 통과**: idle 6분+ 생존(heartbeat 불요)·토큰 캐시완화. cron-turn은 순차(프로브 확인) → pending-send 카운터로 라우팅.

### A. 옵트인 + 세션 식별
- `AgentRunRequest.persistent?: boolean`(REPL 모드) + `sessionKey?: string`(대화 식별=conversationId).
- GUI 토글(REPL 모드, 대화별) — 켜면 persistent+sessionKey 전송.

### B. 백엔드: PersistentSession + Manager (신규)
- `PersistentSession`: `query({prompt: inputGen()})` 1개 보유 + 입력 push-queue + 이벤트 라우팅. inputGen 미종료=세션 생존.
- `PersistentSessionManager`: `Map<sessionKey, PersistentSession>`. agentRun(persistent,sessionKey): 기존 세션 있으면 메시지 push, 없으면 생성+push.
- ADR-003: streamInput/SDKUserMessage/query 형상은 매니저 어댑터 내부에만. shared/renderer는 중립.

### C. cron-turn 라우팅 (pending-send 카운터 — SDK 마커 불필요)
- 백엔드가 세션별 `pendingUserSends` 추적: 유저 메시지 push → +1. 턴 result 시 counter>0이면 유저턴(−1), 0이면 **cron턴**(자율 발동 태깅).
- 이벤트는 sessionKey를 안정 "runId"로 태깅 → 렌더러가 모든 턴(유저+cron)을 같은 대화로 라우팅(기존 currentRunId 필터 재사용).
- 전제: 턴 순차(SDK가 한 번에 1턴). 프로브로 확인 — 구현 시 단위로 재단정.

### D. abort 분리 (🔴#1)
- `interrupt()`(SDK Query 메서드) = 현재 턴 중단, 세션 유지. `closeSession()` = inputGen 종료 + abortController = 세션 종료.
- 렌더러 abort 버튼(턴 중) → interrupt. REPL 토글 OFF/대화전환/app-close → closeSession.

### E. cron-turn UI + 권한 (🔴#2 최대 위험)
- 자율 턴을 thread에 렌더(신규 마커 `{kind:'cron-turn'}`? 또는 일반 assistant + 배지). 영속 정책 명시(휘발 권장).
- **권한 정책**: cron턴 중 canUseTool 발화 시 — 대화 권한모드 상속(사용자가 옵트인했으니 모달 표면화). 또는 안전하게 cron턴 read-only? → 설계 확정 필요.
- session_crons(SDK 활성 크론 목록) → 중립 이벤트 표면화 → LoopIndicator 재배선(앱 레벨 activeLoop 대신).

### F. 수명/정리 (🔴#3)
- open: 첫 REPL 메시지. close: 토글 OFF·clearConversation·**app-close(before-quit/창파괴 → 전 세션 close, 좀비 0)**.

### G. 폴백 + 멀티 (감사 Q1/Q4)
- 비-REPL 대화: 기존 query()-per-message(+Phase1 resume) + 앱 레벨 /loop(안전망). 세션 드롭 시 폴백 검토.
- 멀티: **lazy**(활성 패널만 REPL) — 6 idle 세션 동시 회피.

### 구현 순서 (Phase 2a, 단계별 TDD)
1. PersistentSession 추상 + 단위(mock query AsyncIterable로 push→turn 시퀀스 + cron턴 시뮬). 
2. Manager + 옵트인 IPC(persistent/sessionKey) + 비-REPL 회귀 0.
3. pending-send 카운터 라우팅 + abort 분리(interrupt/close) 단위.
4. 렌더러: REPL 모드 토글 + 세션 라우팅 + cron-turn 렌더 + LoopIndicator 재배선.
5. app-close 정리 + 라이브(REPL 맥락·내장 /loop 입력없이 발동·정지).
6. (2b) 앱 레벨 loop 엔진 제거(GUI 유지) — REPL 신뢰 입증 후.
7. ADR-016/021 개정 + 신규 ADR(PersistentSession). 사용자 게이트.

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

### ⚠️ 재평가 (2026-06-26, 사용자 통찰 + 디스크 실증) — 풀 REPL 가치 하락
**Claude Code의 맥락 유지 = 라이브 세션이 아니라 디스크 저장 + resume.** 실증: 모든 세션이
`~/.claude/projects/<project>/<session_id>.jsonl`로 디스크에 저장됨(idle/resume 프로브 세션·이 대화
`c021f88c…`·context-live e2e 세션 전부 확인). resume-probe: 턴1 query() **완전 종료 후** 턴2 resume →
맥락 복원(디스크에서). 즉:
- **맥락 메모리** = resume(디스크) — 세션 죽어도·재시작해도 견고. **Phase 1 = 이미 Claude Code 방식**.
  앱 재시작 후 옛 대화 resume까지 = session_id를 대화 영속에 저장(작은 **Phase 1.5**).
- **자동 /loop 발동** = 라이브 세션 크론 — **본질적으로 fragile**(idle 6분+여도 결국 죽음, 재시작 시 죽음).
  Claude Code CLI도 터미널 닫으면 /loop 멈춤(세션 전용). **우리 앱 레벨 /loop(renderer 재호출)이 오히려
  "앱 열려있는 동안 반복"엔 더 견고.**

→ **풀 REPL(라이브 세션)의 유일한 추가 가치 = 자동 크론(/loop·schedule)인데, 그게 fragile하고 앱 레벨
/loop이 이미 더 견고.** 맥락(진짜 가치)은 resume로 해결됨. **따라서 풀 REPL 강행 가치 ↓ — 재고 권장.**
대안: **Phase 1.5(session_id 영속 → 완전한 맥락 패리티) + 앱 레벨 /loop 유지**(GUI는 그대로). 풀 REPL은 보류.

### Phase 2 — 풀 REPL + 내장 /loop (크고 위험, 게이트) — ⚠️ 위 재평가로 보류 검토
장수 idle 세션. **위험 대부분이 여기 집중**(idle 타임아웃·6세션 비용·cron-turn 동시성/권한·app-close 정리·
ADR-022 충돌). idle 프로브 결과: idle 6분+ 생존(heartbeat 불요)·토큰 캐시완화 — 기술적으론 가능. 그러나
위 재평가대로 **가치 대비 위험이 역전**(맥락은 resume로 끝, 크론은 fragile). go/no-go 재검토.
- **단계 0(설계 결정 — 선행)**: ① `artifacts/idle-probe.mjs` — 순수 idle 세션 6분 후 후속 send 도달 여부 +
  드롭 시각 + 10턴 후 입력토큰 **숫자 출력**(이 숫자 없이 설계 확정 불가). ② **ADR-022(앱 레벨 /loop) 충돌
  — 사용자 결정(2026-06-26): "REPL 잘 되면 앱 레벨 loop **엔진은 제거**하되 **GUI 표현은 유지**"** →
  **대체(엔진) + GUI 재활용**. 단계: **(2a)** REPL 옵트인 + 내장 `/loop` SDK 통과 + **LoopIndicator를 내장
  크론 상태(session_crons)로 재배선** — 이때 앱 레벨 loop 엔진(renderer 재호출)은 비-REPL **안전망 폴백**으로
  잠시 공존(감사 Q1). **(2b)** REPL 신뢰 입증 후 **앱 레벨 loop 엔진 제거**(activeLoop 스토어·틱 effect·
  dispatchSend `/loop` 인터셉트) — GUI(LoopIndicator)만 남아 내장 크론을 비춤. 옵트인 플래그(REPL 모드, GUI
  토글)가 ON이면 진짜 `/loop`(크론), OFF면 폴백.
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
5. **`forkSession: false` 명시**(Phase 1 reviewer 지적): 현재 resume은 SDK 기본값(forkSession 미지정=false)에
   의존 — "같은 세션 계속" 불변식이 SDK 기본값 변경 시 조용히 깨질 수 있음. Phase 2 진입 시 sdkOptions에
   `forkSession: false` 명시해 코드로 단정(프로브 의존 제거).

### 멀티 패널: **lazy**(활성 패널만 REPL open, 비활성은 단발 폴백) — 6 idle 세션 동시 비용 회피.
### 누락 작업: PRD/FEATURE_MAP에 이 전환 위치 기록(ADR-013 충실도 회귀로 명문화).
