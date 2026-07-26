---
owner: 영호
milestone: LM1
phase: 01
title: 모델 라이브 전환 IPC 계약 — agentSetModel 채널 + preload 브릿지 (SetMode 미러)
status: done
grade: 보통
risk: shared-contract
loop_track: auto-gate
estimated: 1~2h
domain: shared-ipc
summary: 승인 계획(2026-07-17 ExitPlanMode) LM1-P01 — shared/ipc/agent.ts에 AGENT_SET_MODEL 채널 + SetModelRequest{runId,model}/SetModelResponse{accepted} 타입을 SetMode(:236-253) 미러로 additive 정의(JSDoc 신뢰경계·ADR-003 규율 동형), preload/index.ts에 agentSetModel 순수 통과(:185 미러). additive라 ipc-contract.ts 스프레드 자동 흡수 — 계약 버전 bump 아님(P13 선례). 의존 없음(P02와 병렬 가능). reviewer 무조건(shared-contract).
---

# Phase 01: 모델 라이브 전환 IPC 계약 — agentSetModel 채널 + preload 브릿지

> **상태**: done
> **마일스톤**: LM1
> **등급**: 보통 (shared-contract → reviewer 무조건)
> **loop_track**: auto-gate — 채널 계약이 승인된 계획(2026-07-17 ExitPlanMode)으로 사전 박제됨(P13 선례 방식) → 문서 승인 = 채널 GO
> **담당**: shared-ipc

---

## 🎯 목표

`shared/ipc/agent.ts`에 모델 라이브 전환용 IPC 채널·타입을 additive로 신설하고 preload에 브릿지를 연다. 끝나면: renderer가 `AGENT_SET_MODEL: 'agent.setModel'` 채널로 `SetModelRequest {runId, model}`를 타입 안전하게 IPC로 쏘고 `SetModelResponse {accepted}`를 받을 수 있다. 이 Phase는 *계약 정의*만 — 실제 위임 구현은 P02(어댑터)·P03(핸들러)이 얹는다.

---

## 📐 확정 결정 (영호 확정 2026-07-17 — AskUserQuestion+ExitPlanMode, 관련분 인용)

- **역통지 이벤트 신설 X** — 모델 라이브 전환은 낙관 반영만. 엔진 자율 변경 유일 경로인 refusal-fallback은 기존 `model-fallback` AgentEvent 배너로 통지하므로 소비자 없는 이벤트 계약 비용을 회피(필요 시 additive 후행 가능). → 본 Phase 계약에 역통지 채널을 넣지 않는다.
- **계약 = required string + KNOWN_MODELS 4종** — `setModel(undefined)`(기본값 복귀)는 미노출. `SetModelRequest.model`은 optional이 아닌 **필수 string**.
- **additive 확장 — 버전 bump 아님**(P13 선례). 기존 소비자를 깨지 않는 채널·타입 추가이므로 계약 버전을 올리지 않는다.

---

## ⏪ 사전 조건

- [x] **승인 계획(2026-07-17 ExitPlanMode)** — `~/.claude/plans/vectorized-frolicking-hopper.md` LM1-P01 절 = 좌표 정본
- [x] **선례 청사진 확인** — GAP1 P13 계약 `shared/ipc/agent.ts:236-253`(SetMode)·채널 상수 `:24` / preload `preload/index.ts:185`
- [ ] 의존 없음 — **P02(어댑터)와 병렬 가능**

---

## 📝 작업 내용

- [ ] **(a) TDD RED 선행 (qa)** — `99.Others/tests/shared/lm1-set-model-contract.test.ts` 작성(실패 먼저). `gap1-p13-set-mode-contract` 미러 — 채널명 문자열 단정(`AGENT_SET_MODEL === 'agent.setModel'`) + `SetModelRequest`/`SetModelResponse` 타입 형상 단정(runId·model 필수 string / accepted boolean)
- [ ] **(b) 채널·타입 additive 추가** — `shared/ipc/agent.ts`에 `AGENT_SET_MODEL: 'agent.setModel'` 상수 + `SetModelRequest {runId: string; model: string}` / `SetModelResponse {accepted: boolean}`. SetMode(:236-253) 미러로 JSDoc에 신뢰경계·ADR-003 규율을 동형 기재. **additive만** — `ipc-contract.ts`는 스프레드로 자동 흡수하므로 별도 수정 불요
- [ ] **(c) preload 노출** — `preload/index.ts`에 `agentSetModel`을 순수 통과(:185 미러 — 로직 없이 채널로 invoke만)
- [ ] **(d) 회귀 확인** — `ipc-contract.test.ts` 전수 green(신규 채널이 계약 전수 검사에 흡수됐는지)

---

## ✅ 완료 조건

- [x] `npm run typecheck` (main+renderer) 0 errors
- [x] `npm run test` green — 신규 계약 테스트 RED→GREEN + `ipc-contract.test.ts` 전수 green (회귀 0)
- [ ] `npm run lint` 0 problems
- [x] reviewer 통과 (shared-contract → 무조건)

---

## 📚 학습 포인트

- **additive 계약 확장 vs 버전 bump** — 기존 소비자를 깨지 않는 추가는 버전을 올리지 않아도 된다. C#으로 다리를 놓으면, 인터페이스에 `default` 구현을 가진 멤버를 더하는 것과 유사하다(기존 구현체를 재컴파일하지 않아도 깨지지 않음). 반대로 시그니처를 바꾸거나 필드를 없애면 소비자가 깨지므로 bump가 필요하다.
- **CORE-04 단일 정의 원칙** — 채널명·타입은 `02.Source/shared` 한 곳에서 정의하고 main·renderer 양쪽이 import한다. 정의가 두 곳으로 갈라지면 문자열 드리프트가 컴파일을 통과해 런타임에서만 터진다.

---

## ⚠️ 함정

- **계약은 *정의*만** — 실제 위임 구현은 P02(어댑터)·P03(핸들러)이 얹는다. shared에 로직을 넣지 말 것(shared는 순수 타입·상수 계약층).
- **채널명 오타는 양쪽 컴파일이 못 잡는 문자열** — `'agent.setModel'` 리터럴을 renderer/main에 각각 쓰면 오타가 조용히 통과한다. 반드시 `AGENT_SET_MODEL` 상수를 경유하게 배선한다.
- **additive라 착각해 기존 SetMode 계약을 건드리지 말 것** — 모델 계약은 나란히 추가되는 별개 채널이다. SetMode 타입을 재사용·확장하려 하면 P13 계약을 오염시킨다.

---

## 담당 SubAgent

> shared-ipc (계약 정의 + preload 브릿지) · TDD RED는 qa · reviewer 무조건(shared-contract)
