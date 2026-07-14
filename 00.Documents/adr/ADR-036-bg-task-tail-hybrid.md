### ADR-036: 백그라운드 태스크 tail — 스트림 생명주기 권위 + main 증분 폴링 하이브리드

**결정(GAP1 P09, 2026-07-14)**: 백그라운드 태스크(run_in_background Bash 등)의 라이브 tail을 **하이브리드 모델**로 확정한다 — **생명주기(시작·상태 전이·종료)는 SDK 스트림의 시스템 메시지(task_started/task_updated/task_notification)가 권위**이고, **출력 조각은 main 프로세스가 세션 `tasks/{taskId}.output` 파일을 증분 폴링**해 `bg_task { kind:'output', outputChunk }` 이벤트로 합성 방출한다(`02.Source/main/01_agents/bgTaskTail.ts` + `claudeAgentRun.ts` 펌프). kind:'output'은 SDK 메시지가 아닌 어댑터 합성이며, ADR-035 `bg_task` 계약에 **additive** variant로만 확장한다(기존 shape 재-bump 없음). 태스크 정지도 같은 권위 축을 따른다 — `AgentRun.stopTask(taskId)`는 SDK query 핸들에 fire-and-forget 위임하고, 실제 종료는 task_notification(→ kind:'notification')이 통지한다.

**역할 분담**:

| 축 | 권위/경로 | 근거 |
|---|---|---|
| 생명주기(started/updated/notification) | SDK 스트림 시스템 메시지 → `bg_task` kind 판별 정규화 | probe④ 실측 · ADR-035 |
| 출력 조각(kind:'output') | main 측 output 파일 증분 폴링(기본 750ms) — 오프셋 관리, 증분만 방출 | SDK 무제공 → 유일 경로 |
| output 경로 획득 | 조기 원천 = 백그라운드 Bash tool_result content 문구 best-effort 정규식 추출(판별은 구조 payload `tool_use_result.backgroundTaskId`가 정본, content에서 taskId 추출 금지) · task_notification의 `output_file`(구조 필드)이 항상 정본 | probe④ · qa 골든 decoy 핀 |
| 태스크 정지 | `stopTask(taskId)` → query 핸들 위임(fire-and-forget) — 종료 판정은 notification | sdk.d.ts 2494 |

**이유**: ① probe④ 실측상 SDK 스트림은 생명주기 + output 파일 *경로*만 운반하고 증분 출력 *내용*은 파일에만 쌓인다 — SDK Query가 노출하는 호스트측 메서드는 stopTask/backgroundTasks/close뿐(sdk.d.ts 2494·2507행, 출력 폴링 메서드 없음) → **파일 폴링이 라이브 tail의 유일 경로**. ② 폴링(fs 접근)은 신뢰경계 안 — main 단독, `01_agents` 내부(펌프)에서만 사용하고 renderer로는 정규화된 AgentEvent만 흐른다(CORE-01). ③ 생명주기는 SDK가 이미 스트림으로 주므로 그 권위를 유지하고 폴링은 출력 조각에만 한정 — 두 원천의 책임이 겹치지 않는다.

**대안과 트레이드오프**: (a) **순수 스트림 대기** — 구현 최소·IO 0이지만 notification의 output_file/summary 사후 확인만 가능, 출력 라이브성 상실(dev 서버를 백그라운드로 지켜보는 핵심 시나리오 불성립). (b) **renderer 직접 파일 읽기** — 폴링 부하를 renderer로 분산하지만 untrusted renderer에 fs 권한이 넘어가 CORE-01 위반 — 기각. (c) **채택한 하이브리드** — 폴링 지연(주기 750ms)·파일 IO 비용을 지불하고 라이브 tail 성립 + 신뢰경계 보존을 얻는다. 비용 통제 장치 2겹: **버퍼 이중 상한**(조각 64KB=65536B — 초과분은 다음 틱 이월 + `outputTruncated` 표시 / 누적 1MB=1048576B — 도달 시 조각 방출·폴링 재스케줄 전면 중지) + **타이머 3중 정리 경로**(① `abort()` ② 단발 펌프 finally ③ 지속 펌프 finally — 전부 `_stopAllBgTails()`, 태스크별로는 notification 관측 시 개별 stop. stop은 멱등이며 진행 중 IO를 await해 "stop 후 늦은 방출 0"). 추가 한계(명시): 경로 추출이 SDK의 사람용 안내 문구 포맷에 의존(fragile) — 문구 변경 시 조용히 실패하나 tail 없이 생명주기 이벤트만 흐른다(graceful degrade). 추출 경로와 notification `output_file` 불일치 시 잘못된 파일의 잔여 flush 포기(정본 우선).

**파급**: ① **어댑터 conformance** — `AgentBackend` 계약상 `bg_task` 방출은 어댑터 책임. Codex 어댑터 실구현 시 동일 하이브리드 또는 엔진 고유 경로를 `bg_task`로 정규화하는 conformance 항목이 된다(kind:'output' 합성 포함). ② **idle-close 관계** — 활성 태스크 레지스트리(started 관측~notification 관측)가 idle-close 유예의 ∧축(`_bgTaskGateOpen()`)으로 결합되며, 활성 태스크 0이면 기존 거동 불변(P04b 축1 동형). ③ started/notification의 기존 `orchestration_progress` 방출은 이중 유지(기존 소비자 호환). ④ **범위 밖** — 백그라운드 태스크 프로세스 자체의 수명 정책(run 종료 시 고아 프로세스 역방향 정리)은 백로그 미결정으로 이 ADR 범위 밖 — 여기서는 우리 쪽 폴러/레지스트리 정리만 소유한다.

**위험도**: [L] — 어댑터 내부 합성 + shared 계약 additive 확장(kind:'output'·outputChunk·outputTruncated 옵셔널). 신뢰경계·기존 이벤트 shape 불변.

**관련**: ADR-035(`bg_task` taxonomy — kind 판별 통합·taskId 상관키) · ADR-003(엔진 추상화 — 어댑터에서 정규화) · CORE-01(신뢰경계 — fs는 main 단독) · GAP1 P09 `01.Phases/17_GAP1-core-parity/09-background-shell-tail.md` · 구현 `02.Source/main/01_agents/bgTaskTail.ts`·`claudeAgentRun.ts` · 계약 `02.Source/shared/agent-events.ts`(AgentEventBgTask).

**현황(2026-07-14)**: 채택(영호 GO — P09 reviewer 상신). 구현 완료(GAP1 P09) — 폴러(bgTaskTail)·펌프 배선·idle-close ∧게이트·stopTask 핸들러·renderer 소비까지 테스트 6파일(`gap1-p09-*`) green.
