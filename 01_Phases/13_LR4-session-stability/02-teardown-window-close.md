---
owner: 영호
milestone: LR4
phase: 02
title: 688ms 창 소거 — _inputGen 닫힘 시 persistentRuns 원자 제거
status: done
grade: 복잡
risk: backend-contract
loop_track: human-gate
estimated: 2~5h
domain: cross
summary: 펌프가 _inputGen 닫는 순간 persistentRuns 엔트리 원자 제거 → stale HIT 창 소거, 무한대기 근본 봉합(agent-backend+main-process 최소 게이트 터치 — persistentRuns 소유가 펌프 밖이라 라우팅/consumer 최소 수정 불가피).
---

# Phase 02: 688ms 창 소거 — _inputGen 닫힘 시 persistentRuns 원자 제거

> **상태**: done
> **마일스톤**: LR4
> **등급**: 복잡
> **담당**: cross (agent-backend + main-process)

---

## 🎯 목표

무한대기(증상 C)를 근본에서 봉합한다. LR3 P02의 "닫힌 뒤 miss→resume" 계약을 "닫히는 중(688ms 창)"까지 확장 — 창 안에서 발생하는 send도 stale HIT 대신 miss→재생성 경로를 타게 한다.

> **최소 게이트 터치(0줄 계승 불가):** `persistentRuns`는 `agent-runs.ts:134` createRunManager 클로저 소유라 펌프(`claudeAgentRun`) 스코프 밖이다. 따라서 "닫히는 중 688ms 창" stale HIT 제거는 라우팅(`agent-runs.ts:162-174`) 또는 consumer(`agent-runs.ts:211-223`)를 **불가피하게 수정**한다. LR3 P02의 "agent-runs.ts 0줄"은 "닫힌 **뒤** 제거"라 가능했던 것으로, "닫히는 **중**" 봉합인 이 Phase는 그 목표를 계승하지 못한다. 목표는 "0줄"이 아니라 **최소 diff**다.

---

## ⏪ 사전 조건

- [x] **P01 완료** — 무한대기 재현 테스트가 red 기준으로 확보됨.

---

## 📝 작업 내용

- [x] **(a) 원자 제거** — `_idleClosing`/`_inputGen` return 시점에 `persistentRuns.delete(sessionKey)`(또는 done 조기 마킹)로, 후속 send가 stale HIT 대신 miss→새 held-open+resume(기존 경로)를 타게 한다.
- [x] **(b) 활동 세션 보존** — 크론/wakeup 활동이 있는 세션은 제거 대상이 아니다(정상 유지).
- [x] **(c) 재현 green 전환** — P01 무한대기 재현 테스트를 green으로 전환.
- [x] **최소 게이트 터치(0줄 계승 불가)** — 제거 훅은 펌프/cleanup 경로에 배치하되, `persistentRuns` 소유(`agent-runs.ts:134` createRunManager 클로저)가 펌프 밖이라 라우팅(`agent-runs.ts:162-174`) 또는 consumer(`agent-runs.ts:211-223`) 수정이 **설계상 확실히 촉발**된다. 이는 "정지·보고 예외"가 아니라 **처음부터 reviewer 무조건 + 영호 GO 하에 진행**하는 정상 경로다(🔴 구역 게이트가 이미 커버). 목표 = 최소 diff.

---

## ✅ 완료 조건

- [x] P01 무한대기 재현 테스트 green
- [x] 라우팅 miss→resume 계약 테스트 PASS
- [x] 최소 diff + reviewer 계약 검토 + LR3 P02 라이브 probe 2종 회귀 유지(무활동 688ms 자연종료·후속 resume 회상 / wakeup 유지)
- [x] `npm run typecheck` (main+renderer) 0 errors · `npm run test` green · `npm run lint` 0 problems
- [x] reviewer 무조건(backend-contract·cross 계약) CRITICAL 0
- [x] **영호 GO** — 커밋·ADR-024 인접(버킷 c).

---

## 📚 학습 포인트

- **경합 창(race window)** — done 판정과 teardown 사이의 짧은 시간에 send가 끼어들면 죽어가는 세션에 라우팅된다. 창 자체를 소거(엔트리 원자 제거)하면 타이밍 의존 버그를 구조적으로 없앨 수 있다.
- **원자 제거(atomic delete)** — 상태 전이 지점에서 엔트리를 즉시 제거해 "닫히는 중"이라는 중간 상태를 관찰 불가능하게 만드는 패턴.

---

## ⚠️ 함정

- ADR-024 최대위험 구역. 원자 제거가 정상 자연종료 resume(회상)을 깨지 않게 할 것.
- 크론 틱 발화 순간의 경합 주의(활동 세션 오제거 금지).
- 라우팅/consumer(`agent-runs.ts`) 수정은 예외가 아니라 설계상 예정된 경로 — "0줄" 목표를 강행해 우회 꼼수를 두지 말 것(최소 diff로 정면 봉합).

---

## 담당 SubAgent

agent-backend + main-process cross. reviewer 무조건 + 영호 GO.
