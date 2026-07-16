### ADR-035: SDK 메시지 → 공통 AgentEvent 정규화 taxonomy (probe-first) ⭐

**결정(GAP1 P03, 2026-07-13)**: GAP1 P03 probe 실측(4종 + 재조사 1종)을 근거로 SDK 원시 시스템 메시지 10개 카테고리를 공통 `AgentEvent` 9종(+ 기존 `permission_request` 1건 확장)으로 정규화하는 taxonomy를 확정한다. **probe-first 원칙** — 실측 확인된 필드만 확정 타입, 미검증 필드는 옵셔널/예약으로 두어 **additive 계약만** 신설한다(정규화기 구현·방출·소비는 이 ADR 범위 밖 — 후속 Phase P04~P09).

**매핑 표**:

| SDK 원시 메시지 | 정규화 AgentEvent | 확정도 · 근거 |
|---|---|---|
| hook_started / hook_progress / hook_response | `hook_lifecycle` (phase 판별) | 확정 · probe① · `hookId` 상관키 |
| session_state_changed | `session_state` | 확정 · probe②b · env `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1` 옵트인 |
| task_started · task_updated · task_notification | `bg_task` | 확정 · probe④ · `taskId`=`tool_use_result.backgroundTaskId` |
| thinking_tokens | `thinking_delta.estimatedTokens` | 확정 (107건) |
| stream_event thinking_delta | `thinking_delta.text` | 예약 |
| ExitPlanMode input | `permission_request.planReview` | 확정 · probe③ (`plan`·`planFilePath`) |
| informational · permission_denied · api_retry · compact · search_result | 동명 이벤트 | SDK 선언 기반 — P04·P05·P08 fixture 검증 예정 |

**훅 3메시지 통합 결정(reviewer 🟡①)**: SDK가 훅 생명주기를 3개 메시지(hook_started/hook_progress/hook_response)로 쪼개 방출하는 것을 **단일 `hook_lifecycle` 이벤트 + `phase` 판별**로 통합한다 — 기존 `bg_task`의 kind-판별 패턴(task_started/updated/notification → 단일 `bg_task`)과 일관. 소비자는 union 3종을 각각 다루는 대신 phase 스위치 1단계만 추가한다.

**`session_state` vs 기존 `session` 역할 대비(reviewer 🟡②)**: 신규 `session_state`는 **실행 상태(idle/running/requires_action) 권위 신호**이고, 기존 `session` 이벤트는 **resume용 불투명 세션 토큰(session_id) 운반**이다 — 이름은 비슷하나 역할이 다르다(전자=턴 경계 판정, 후자=맥락 재개 식별자).

**억제/드롭 유지**: rate_limit_event · commands_changed · memory_recall · local_command_output · settings_parse_error · auth_status · keep_alive는 범위 밖(향후 additive 행 추가). `task_progress`(서브에이전트)는 ADR-021 `orchestration_progress` 기존 정규화 유지 — `bg_task`와 별개 `task_id` 네임스페이스.

**이유**: ① probe-first(억측 아닌 fixture 근거). ② 계약 선행(P04~P09 드리프트 방지, 한 곳 `02.Source/shared` 정의). ③ additive-only(Codex stub 영향 0).

**트레이드오프**: ① 3 SDK 메시지→1 phase/kind-판별 통합은 소비자 switch 1단계 추가 비용(union 비대화 방지와 교환). ② SDK 열린 string 필드는 좁히지 않음(P04/P05 fixture 후 리터럴화 재검토). ③ `planReview`는 신규 신뢰경계 아님(기존 `tool_call.input` 재구조화). ④ `search_result` 파싱은 어댑터(P08) 책임 — 전 필드 optional 골격만.

**완료조건(측정가능)**: ① shared 신규 9종 + 확장 1, 양쪽 typecheck 0(CORE-04). ② fixture 6 + 골든 25 green. ③ exhaustiveness 회귀 0. ④ Codex stub 영향 0.

**위험도**: [L] — 공유 계약 *additive* 확장(옵셔널/신규 이벤트만, 기존 shape 불변). 방출·소비는 후속 Phase.

**관련**: ADR-003(엔진 추상화 — 어댑터에서 정규화) · ADR-021(`orchestration_progress` — `task_progress` 별도 네임스페이스) · GAP1 P03 `01.Phases/17_GAP1-core-parity/03-agent-event-contract.md` · 소비 P04(session_state·api_retry·compact)·P05(hook_lifecycle·informational·permission_denied)·P06(thinking_delta)·P07(planReview)·P08(search_result)·P09(bg_task).

**현황(2026-07-13)**: 계약 정의 완료(GAP1 P03) — 방출·소비는 P04~P09. probe 실측 4+1종 · fixture 6 · 골든 25 green · typecheck 0 · 4760 pass · lint 0. reviewer 통과(🔴 0 · 🟡 2 문서 반영).
