---
owner: 영호
milestone: GAP1
phase: 03
title: AgentEvent 계약 일괄 정의 + SDK→AgentEvent 정규화 taxonomy ADR 초안
status: pending
grade: 복잡 (보통 + backend-contract 깃발)
risk: backend-contract
loop_track: human-gate
estimated: 2~5h
domain: shared-ipc
summary: SDK 실측 probe(계약 확정 전 의무) 선행 후, 후속 Phase(P04~P09)가 소비할 신규 AgentEvent 타입을 02.Source/shared에 검증된 최소·additive로 정의 + 'SDK 메시지→공통 AgentEvent 정규화 taxonomy' ADR 초안(어떤 원시 메시지를 어떤 이벤트로·무엇을 억제할지의 정본). 계약 bump = CORE-04, 양쪽 typecheck green + human-gate. 미검증 필드 고정 금지.
---

# Phase 03: AgentEvent 계약 일괄 정의 + taxonomy ADR 초안

> **상태**: pending
> **마일스톤**: GAP1
> **등급**: 복잡 (자동 상향: 보통 + backend-contract → reviewer 무조건·모델 상향)
> **담당**: shared-ipc + qa(어댑터 골든) + reviewer

---

## 🎯 목표

후속 5 Phase(P04~P07·P09)가 배선할 신규 이벤트 타입을 한 곳(`02.Source/shared`)에 먼저 additive로 정의해, 각 Phase가 계약을 따로 bump하지 않고 소비만 하도록 만든다. 동시에 "어떤 원시 SDK 메시지를 어떤 AgentEvent로 정규화하고 무엇을 억제할지"의 정본을 ADR 초안으로 세운다.

---

## ⏪ 사전 조건

- [ ] 선행 Phase 없음 (P01·P02와 병렬 착수 가능, 단 후속 5 Phase의 계약 선행)
- [ ] 근거 = GAP1 감사 M-A 마일스톤 '의존' 절 — "ADR 신규 1건 권장: SDK 메시지→공통 AgentEvent 정규화 taxonomy"
- [ ] 현행 드롭 지점 확인: `claude-stream.ts:554-555`(system '그 외') · `claude-stream.ts:582-584`(default) · `claude-stream.ts:578`(stream_event thinking_delta [])

---

## 📝 작업 내용

- [ ] **(a) SDK 실측 probe (계약 확정 전 의무)** — 아래 4종을 실측한 뒤에만 계약을 확정한다:
  - ① `includeHookEvents:true` 활성 후 훅 이벤트 3종 실수신 + **`hook_id` 상관관계 키** 확인(sdk.d.ts:1582·3654)
  - ② `session_state_changed` 방출 조건 실측(타입 존재 sdk.d.ts:4104, 기본 방출 여부·옵트인 필요 여부 미확인 — 가설: env 옵트인)
  - ③ ExitPlanMode canUseTool input 실형상 캡처(설치본 선언은 allowedPrompts뿐, plan/planFilePath 미확인 sdk-tools.d.ts:494)
  - ④ run_in_background Bash 실행 시 task_notification·tool_result 스트림 형상 캡처(P09 tail 근거)
  - **순서 = probe → ADR 초안 → 영호 GO → 검증된 최소 계약만 확정**(미검증 필드 고정 금지, 소비 Phase의 additive 확장 허용)
- [ ] **(b) 신규 AgentEvent 타입 정의 (02.Source/shared)** — probe로 검증된 형상만, 후속 소비 대상:
  - 훅 생명주기 3종: `hook_started` / `hook_progress` / `hook_response` (hook_name·hook_event·**hook_id 상관관계 키**·stdout·stderr·exit_code·outcome) — P05
  - `informational` (content·level info/notice/suggestion/warning·prevent_continuation·tool_use_id — 차단 사유) — P05
  - `permission_denied` (tool_name·decision_reason_type classifier/asyncAgent/mode/rule·decision_reason — auto-deny 사유) — P05
  - `session_state_changed` (state idle/running/requires_action — SDK 실행 상태, 방출 조건 probe ② 따름) — P04
  - `api_retry` (attempt·max_retries·retry_delay_ms·error) — P04
  - `compact_boundary`(trigger manual/auto·pre_tokens·post_tokens) + **requesting(API 요청)·compacting(압축) 별개 상태 분리**·compact_result — P04
  - `thinking_delta` (라이브 사고 증분) + thinking_tokens(estimated_tokens) — P06
  - 백그라운드 셸 tail (**task_notification+tool_result 스트림 기반** — shell/task-id·증분 출력·종료) — P09. **최소·additive로만 선정의**(스트림 형상 미확정 전 세부 필드 고정 금지 — 세부는 P09에서 additive 확장)
  - 백그라운드 태스크 정지 요청/결과 이벤트(stopTask) — P09
  - `search_result` (Grep/Glob 정규화 — 매치 리스트·파일 그룹·경로) — P08. **최소·additive**(Grep 3모드 형상은 실측 반영)
- [ ] **(c) permission 요청 payload 확장** — ExitPlanMode의 plan 본문 필드(probe ③ 캡처 실형상: plan/planFilePath/allowedPrompts 중 실재분)를 표면화 — P07 소비
- [ ] **(d) taxonomy ADR 초안** — `00.Documents/adr/`에 신규 ADR 초안(어떤 원시 메시지→어떤 이벤트·무엇을 배지/접힘으로 억제·무엇을 드롭 유지 + probe 실측 근거). ADR.md 인덱스 갱신은 영호 GO 후 (**결정 문서라 문구 창작 최소·초안만**)
- [ ] **(e) 어댑터 골든 테스트 시드 (qa)** — 각 신규 타입에 대해 **probe 캡처 fixture 기반** 원시 SDK 메시지→정규화 AgentEvent 매핑 골든 테스트 자리 마련(P04~P09가 채움)
- [ ] **(f) additive 무결성** — Codex 어댑터(stub)에 영향 없는 additive-only 설계 확인

---

## ✅ 완료 조건

- [ ] `npm run typecheck` (main+renderer) 0 errors — **양쪽 필수(CORE-04)**
- [ ] `npm run test` Vitest 전체 green + TDD(골든 테스트 시드 선행)
- [ ] `npm run lint` 0 problems
- [ ] SDK probe 4종(훅 hook_id·session_state 방출조건·ExitPlan input·bg task 스트림) 실측 완료 + 캡처 fixture 확보 — 미검증 필드 계약 고정 0
- [ ] 신규 타입 전부 `02.Source/shared` 단일 정의 + 양쪽 import 성립 · 기존 이벤트 소비 회귀 0(additive 증명)
- [ ] taxonomy ADR 초안 존재 + 영호 GO(human-gate — 설계 분기·ADR 신설)
- [ ] reviewer 통과 (backend-contract = 무조건)

---

## 📚 학습 포인트

- **계약 선행(contract-first)** — 여러 소비자가 같은 타입을 쓸 때, 각자 계약을 조금씩 늘리면 충돌·중복이 난다. 한 곳에 먼저 정의하고 소비만 하게 하면 파일 충돌·타입 드리프트가 준다.
- **정규화 taxonomy** — 엔진 고유 출력(SDK system/stream 메시지 수십 종)을 공통 AgentEvent로 옮길 때, "어떤 걸 표면화·억제·드롭할지"를 한 문서로 정하면 후속 배선이 그 표를 따라간다(엔진 추상화, ADR-003).

---

## ⚠️ 함정

- **계약 bump = CORE-04** — 변경 후 main·renderer 양쪽 typecheck green이 완료 조건. 한쪽만 고치면 위반.
- **human-gate** — taxonomy 설계 분기(무엇을 억제할지) + ADR 신설은 영호 GO 후 확정. 초안까지 진행하되 확정은 대기.
- **additive 유지** — 기존 타입 shape 변경 금지(Codex stub 영향). 기존 이벤트 필드를 건드리면 계약 마이그레이션(버킷 c) — 정지.
- **결정 문서 경계** — ADR 본문은 초안·근거 기록만. ADR.md 인덱스의 결정 문구 창작은 영호 확정 후.

---

## 담당 SubAgent

shared-ipc Worker(계약 정의, `02.Source/shared`·`02.Source/preload`) + qa(어댑터 골든 테스트 시드) + reviewer 무조건(backend-contract). taxonomy 설계·ADR 확정은 human-gate.
