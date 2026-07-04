---
owner: 영호
milestone: LR4
phase: 01
title: 무한대기·idle-close 재현 테스트 하네스
status: pending
grade: 보통
loop_track: auto-gate
estimated: 1~3h
domain: qa
summary: 688ms teardown 창·stale HIT·stuck 3단 체인을 mock 백엔드 이벤트 순서 제어로 결정적 재현 — P02~P04 red 기준선.
---

# Phase 01: 무한대기·idle-close 재현 테스트 하네스

> **상태**: pending
> **마일스톤**: LR4
> **등급**: 보통
> **담당**: qa

---

## 🎯 목표

무한대기 3단 체인을 결정적으로 재현하는 실패 테스트를 만든다. 이후 수정들(P02~P04)의 회귀 안전망이자 red 기준이 된다.

---

## ⏪ 사전 조건

- [ ] 없음 — 독립·첫 Phase.

---

## 📝 작업 내용

- [ ] **(a) 입력 고아 재현** — 지속 펌프 idle-close로 `_inputGen`이 닫힌 뒤 cleanup 전 창에 push→입력이 고아가 되는 경로 재현.
- [ ] **(b) stale HIT 재현** — `agent-runs` 라우팅에서 done=false stale 엔트리에 HIT하는 경로 재현.
- [ ] **(c) stuck 재현** — 렌더러 interrupt가 죽은 run에 대해 isRunning을 못 푸는 경로 재현.
- [ ] **mock 백엔드 이벤트 순서 제어로 688ms 창 결정화** — 688ms는 `setTimeout`이 아니라 SDK 스트림 teardown async 경합이라 가짜 타이머로는 못 만든다. idle-close 결정과 cleanup `finally` 사이에 send를 주입하는 **이벤트 순서 mock**으로 결정적 재현(flaky 회피). (가짜 타이머는 P03 유예 타이머 테스트에만 유효.)

---

## ✅ 완료 조건

- [ ] 3 재현 테스트가 수정 전 red를 실증(stash 등으로 확인) + 기존 스위트 green
- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run lint` 0 problems
- [ ] 코드(`claudeAgentRun`·`agent-runs`·`runtime`) 수정 0 — 테스트만.

---

## 📚 학습 포인트

- **이벤트 순서 mock(deterministic event ordering)** — 688ms 창은 실제 시간(setTimeout)이 아니라 SDK 스트림 teardown의 async 경합에서 비롯된다. 가짜 타이머로는 재현 불가 — mock 백엔드가 idle-close 결정과 cleanup `finally` 사이에 send를 주입하도록 이벤트 순서를 제어하면, 시간에 의존하지 않고 창을 매번 동일하게 재현해 flaky를 피한다. (가짜 타이머는 P03 유예 타이머처럼 진짜 `setTimeout` 기반 로직에만 유효.)
- **red 기준선(regression baseline)** — 수정 전에 실패하는 테스트를 먼저 확보하면, 이후 수정이 실제로 그 버그를 고쳤는지 정량 확인할 수 있다.

---

## ⚠️ 함정

- 실제 688ms 대기 금지 — 시간이 아니라 mock 이벤트 순서로 창을 만든다(688ms는 async teardown 경합이라 가짜 타이머로는 재현 불가).
- 앱 코드 무수정 — 이 Phase는 테스트만 추가한다.

---

## 담당 SubAgent

qa
