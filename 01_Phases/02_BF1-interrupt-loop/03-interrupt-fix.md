---
owner: 영호
milestone: BF1-interrupt-loop
phase: 03
title: Interrupt 수정 + green
status: pending
grade: 복잡
risk: backend-contract
loop_track: auto-gate
estimated: 2~4h
domain: agent-backend
summary: P02 실패 테스트를 GREEN으로 만드는 최소 수정 — held-open 펌프가 interrupt 신호를 실제로 인지해 진행 중 turn을 끝내되 세션은 유지
---

# Phase 03: Interrupt 수정 + green

> **상태**: pending
> **마일스톤**: BF1-interrupt-loop
> **등급**: 복잡 (보통 + backend-contract 자동 상향)
> **담당**: agent-backend — reviewer 무조건

---

## 🎯 목표

이 Phase가 끝나면: 진행 중인 메시지를 네모 버튼으로 멈추면 **진행 중 turn이 실제로 중단되되 REPL 세션은 살아있어** 다음 메시지를 이어서 보낼 수 있다. P02의 RED 테스트가 GREEN이 되고, 단발(`replMode=false`) 경로는 회귀 0.

> **🔬 P01 진단 확정 (영호 라이브 재현 2026-07-01)**: 재현 "안녕→네모: **에러만 뱉고 중단은 됨**". = **가설 C 확정** — interrupt는 작동(SDK가 turn을 throw로 중단)하나, `_runPersistentPump` catch(`claudeAgentRun.ts:592-599`)가 `_aborted`만 체크하는데 `interrupt()`(204-217)는 `_aborted`를 안 세워 → interrupt throw를 `'Agent execution error'`로 **오라벨**한다.
> **수정 방향(확정)**: `interrupt()`가 `_interrupted` 플래그를 세우고, 펌프 catch에서 그 플래그면 에러 대신 **깔끔한 '중단됨'**(또는 turn-done)으로 처리 + 세션 유지(no-close). **에러 문자열 매칭 금지 — 플래그**(추론/텍스트 어느 throw든 동일 포착).
> **⚠️ P03 크기 분기점 (P01 잔여 관측 ②)**: interrupt 후 **같은 세션에서 다음 메시지가 맥락을 잇는가**? throw로 async generator가 끝나면 held-open 스트림이 종료된 것 → 세션 사망 가능. **잇는다 → 소규모 재라벨 수정. 안 잇는다 → "interrupt 후 세션 재오픈" 설계 분기(human-gate 격상, 영호 GO)**. 착수 전 영호 1회 확인 필수.

---

## ⏪ 사전 조건

- [ ] Phase 02 완료 — interrupt 버그를 겨눈 RED 테스트 존재
- [ ] Phase 01 SDK 의미 확정 — 수정 방향이 SDK 동작과 정합해야

---

## 📝 작업 내용

> 수정 내용은 P01 가설로 갈린다 (아래는 가장 유력한 가설 A 기준 — 실제는 P01 결과 따름):

- [ ] **claude-api 스킬 재확인** — 수정 코드가 SDK interrupt 계약과 어긋나지 않는지 (헌법 CRITICAL).
- [ ] **(가설 A) 펌프가 interrupt를 인지하도록 배선** — `claudeAgentRun.ts`:
  - `interrupt()`(204-217)가 SDK `_queryHandle.interrupt()` 호출 후, held-open 펌프가 **진행 중 turn 종료를 인지**하도록 신호 정합 (예: interrupt 전용 플래그 또는 SDK가 emit하는 turn-종료 신호를 펌프가 처리)
  - **세션 생존 불변식 유지** — `_aborted`는 여전히 안 세움(abort와 구별), `_inputGen`·`_close`는 살림, 다음 push 정상
  - `abort()`(전체 종료)와의 분기 의미가 흐려지지 않게 — interrupt=turn만, abort=세션째
- [ ] **(가설 B면) SDK 제약 우회 설계** — held-open에서 interrupt가 무효라면, turn 경계 신호/재시작 등 대안 — **이 경우 설계 분기 발생 → human-gate로 격상, 영호 GO 후 진행** (P03 범위 밖일 수 있음 → 보고).
- [ ] **(가설 C면) 배선 수정** — 버튼→IPC→run-manager 경로 누락분 연결 (소규모).
- [ ] **단발 경로 회귀 0 단정** — `replMode=false`의 `abort()` 동작은 무변경. 기존 단발 테스트 그대로 green.
- [ ] **reviewer 자동 호출** — backend-contract 깃발(전 어댑터 영향 가능성: `AgentRun.interrupt()` 인터페이스).

---

## ✅ 완료 조건

- [ ] **P02 RED 테스트 → GREEN**.
- [ ] **재현 시나리오 해소** — P01 시나리오에서 네모 버튼이 진행 중 turn을 멈추고, 다음 메시지 정상 (영호 육안 1회 — `npm run dev`).
- [ ] `npm run typecheck` (main+renderer) 0 errors.
- [ ] `npm run test` green — **착수 시 `npm run test`로 베이스라인 재고정 후** 그 대비 비감소, 신규 GREEN 포함, **단발 경로 회귀 0** (work-pin 3847은 stale 가능 — 절대값 신뢰 X).
- [ ] `npm run lint` 0 problems.
- [ ] `npm run build` green (계약 인접).
- [ ] **reviewer GO** — CRITICAL 0, abort/interrupt 의미 분리 유지, 전 어댑터(Echo/Codex stub) 타입 정합.

---

## 📚 학습 포인트

- **최소 수정 원칙** — RED를 GREEN으로 만드는 *가장 작은* 변경. 김에 리팩토링 욕구는 참기(별 트랙).
- **불변식 보존** — "interrupt는 세션을 안 죽인다"가 ADR-024 불변식. 고치면서 이걸 깨면 다른 버그(세션 증발)를 심는다.
- **계약 깃발의 의미** — `01_agents/**` 한 줄이 Claude·Codex·Echo 전 어댑터에 파급. 그래서 reviewer 무조건.

---

## ⚠️ 함정

- **interrupt를 abort로 "쉽게" 고치기** — `_aborted=true` + `_close()`를 추가하면 멈추긴 하나 **세션이 죽어** REPL 연속성이 깨진다(ADR-024 위반). turn만 끊고 세션은 살려야.
- **SDK 계약 위반** — `query().interrupt()`를 의미와 다르게 쓰면 미묘한 깨짐. claude-api 스킬 정합.
- **단발 경로 오염** — `_runPump`(단발)와 `_runPersistentPump`(지속)는 별 메서드. 지속만 고치고 단발은 건드리지 말 것(회귀 0).
- **가설 B(SDK 무효) 시 설계 분기** — 그 땐 자율 수정 X. human-gate 격상 후 영호와 방향 결정(범위가 커질 수 있음).

---

## 담당 SubAgent

`agent-backend` (`02.Source/main/01_agents/**`). reviewer 무조건(backend-contract). SDK = claude-api 스킬.
