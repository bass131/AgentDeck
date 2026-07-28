---
owner: 유영호
milestone: RS1
phase: 03
title: shared 계약 정비 — agentEvents 분할 + 모델 어휘 타입 조임
status: pending
grade: 복잡
risk: backend-contract
loop_track: auto-gate
estimated: 2~4h
domain: shared-ipc
summary: 1,041줄 agentEvents.ts를 주제별 파일로 분할(기존 경로는 배럴 유지 — import 불변), 모델 어휘 3면 분산을 KnownModel 타입으로 조여 드리프트를 컴파일러가 잡게. 죽은 export 제거 + 거짓 주석 정정 동반.
---

# Phase 03: shared 계약 정비 — agentEvents 분할 + 모델 어휘 타입 조임

> **상태**: pending · **마일스톤**: RS1 · **등급**: 복잡(backend-contract + shared-contract 2깃발 — 문면상 대규모 상향이나, 편성이 이미 대규모급[coordinator + reviewer 무조건]이라 복잡 유지, plan-auditor 🟡2 판단 기재) · **담당**: shared-ipc + agent-backend + coordinator 경계 검증 + reviewer 무조건

## 🎯 목표

이벤트 계약이 주제별 파일로 나뉘어 "어떤 이벤트를 추가하든 한 거대 파일이 바뀌는" 구조가 해소되고, 지원 모델 목록이 어긋나면 typecheck가 빨간불을 켠다. **import 경로와 이벤트 계약 표면은 100% 불변.** 단 모델 테이블 2종의 `Record<KnownModel, …>` 조임은 **의도된 타입 강화**다(현재는 `Record<string, number>` — 임의 string 인덱싱 소비처에서 컴파일 에러를 내는 것이 목적). "표면 불변"을 근거로 이 조임을 거부하지 않는다.

## ⏪ 사전 조건

- [ ] Phase 01 완료 (기준선). Phase 02와는 병렬 가능(파일 무중복).

## 📝 작업 내용

- [ ] `02_Source/shared/agentEvents.ts`(1,041줄, union 28종·주제 6그룹)를 `shared/agentEvents/` 하위 주제별 파일로 분할 — 코어 스트리밍 / 오케스트레이션 / 서브에이전트 / 양방향 요청 / REPL·자율 / SDK 생명주기. **기존 `agentEvents.ts`는 전부 re-export하는 배럴로 유지**(`ipcContract.ts:20-29`가 이미 세운 하위호환 선례와 같은 방식).
- [ ] 모델 어휘 단일화 — `main/01_agents/runArgs.ts:34`의 `KNOWN_MODELS`/`KnownModel`을 shared로 승격(`modelEffort.ts:12-14`의 type-forwarding 선례 — runArgs는 import 후 re-export라 main 소비처 경로·검증 로직 위치 불변). `shared/ipc/agent.ts:150`의 `MODEL_CONTEXT_WINDOW`와 `shared/modelEffort.ts:35`의 `MODEL_EFFORT_SUPPORT`를 `Record<KnownModel, …>`로 조임. **커밋 2분해**(plan-auditor 🔴1 봉합): ① shared에 정의 신설 — shared-ipc 담당(이 시점엔 runArgs와 일시 중복이어도 typecheck green) ② `runArgs.ts`를 import + re-export로 전환 — **agent-backend 담당**(`main/**` 쓰기는 agent-backend 소유, shared-ipc는 R only).
- [ ] 죽은 export 제거 — `shared/ipc/multi.ts:217` `MultiSessionLoadRequest`(codegraph·grep 양쪽에서 소비처 0 확인됨).
- [ ] 거짓 주석 정정 — `agentEvents.ts:699-701`(어댑터가 subtype을 "드롭한다"는 서술이 실측과 반대 — 8종 방출·4파일 소비 중) / `:304·319·473·485`(canonical 방향 서술 반전 — shared가 정본, renderer가 re-export) / `multi.ts:212·220`(섹션 헤더 채널명 오기).

## ✅ 완료 조건

- [ ] `npm run typecheck`(node+web) 0 / `npm run test` 5,359+ passed·신규 fail 0 / `npm run lint` 0
- [ ] 계약 골든 테스트 무수정 green (어댑터 이벤트 계약 불변의 증거)
- [ ] 기존 import 경로로 컴파일되는 소비처 전부 무수정 (배럴 확인)
- [ ] coordinator 경계 정합 검증 통과 + reviewer 🔴 0

## 📚 학습 포인트

- **배럴(barrel)** — 분할된 모듈을 한 파일에서 재수출해 소비처의 import 경로를 보존하는 기법. 분할의 파급을 0으로 만드는 표준 수단.
- `Record<K, V>` 타입 조임 — "목록 A와 목록 B가 같은 키를 가져야 한다"는 규칙을 주석이 아니라 컴파일러에게 맡기는 방법.

## ⚠️ 함정

- **엔진 고유 리터럴은 이 Phase에서도 shared로 들어오면 안 된다**(ADR-003) — KnownModel 승격은 *picker 어휘*(opus/sonnet/haiku/fable)다. 단 `runArgs.ts:26` 주석대로 이 어휘는 SDK alias 역할도 겸한다(이중 역할) — 같은 어휘가 이미 shared 두 곳(`modelEffort.ts`·`agent.ts:150`)에 상주하는 선례가 있으므로 **이중 역할 자체는 중단 사유가 아니다**. 그 외의 애매함은 중단하고 보고.
- 이 파일들은 trust-boundary 인접 공용 계약 — 타입 표면(필드 추가·제거·이름)을 바꾸는 순간 리팩토링이 아니다.
- discriminant 값(`type: 'model-fallback'` 등)은 와이어 표면 — 표기가 이상해 보여도 변경 금지.

## 담당 SubAgent

shared-ipc (Worker — 분할·주석 정정·죽은 export·모델 어휘 커밋 ①) + agent-backend (Worker — 모델 어휘 커밋 ②, runArgs 전환) + coordinator(경계 검증) + reviewer(무조건 — backend-contract·shared-contract)
