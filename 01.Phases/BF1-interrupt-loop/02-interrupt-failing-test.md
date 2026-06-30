---
owner: 영호
milestone: BF1-interrupt-loop
phase: 02
title: Interrupt 진단 실패 테스트 (TDD)
status: pending
grade: 보통
loop_track: auto-gate
estimated: 1~2h
domain: qa
summary: P01 원인 가설을 mock query 단위 테스트로 고정 — 현재 코드에서 RED(실패)로 interrupt 버그를 기계적으로 증명
---

# Phase 02: Interrupt 진단 실패 테스트 (TDD)

> **상태**: pending
> **마일스톤**: BF1-interrupt-loop
> **등급**: 보통
> **담당**: qa (테스트만 작성, 앱 코드 R only)

---

## 🎯 목표

이 Phase가 끝나면: P01에서 좁힌 원인 가설이 **재현 가능한 단위 테스트(RED)**로 고정된다. mock query(AsyncIterable)로 held-open 펌프를 돌리고, 진행 중 `interrupt()`를 호출했을 때 "turn이 실제로 끝나야 한다"는 기대를 단정 → **현재 코드에서 실패**. 이 실패 테스트가 P03 수정의 GREEN 타깃이 된다.

> **🔬 P01 진단 확정 (영호 재현)**: 가설 C 확정 — interrupt throw를 펌프 catch가 `'Agent execution error'`로 오라벨. 핵심 RED 테스트 = **"interrupt 시 펌프가 error 이벤트를 push하면 안 된다(깔끔한 중단 이벤트여야)"**. 추가 테스트 케이스: ① 일반 텍스트 turn 중 interrupt ② **추론(thinking) 블록 중 interrupt**(영호 직감 — throw 형태 다를 수 있음, 플래그 방식이 둘 다 잡는지 검증) ③ interrupt 후 **다음 push가 같은 세션에서 처리되는가**(세션 생존 — P03 크기 분기점 검증). mock query는 interrupt 시 throw하도록 모델링(P01 확정 동작).

---

## ⏪ 사전 조건

- [ ] Phase 01 완료 — 원인 가설 1개 확정(A: 펌프 가드 미트립 / B: SDK 무효 / C: 배선 누락)
- [ ] SDK interrupt 의미 확정 — mock이 SDK 실제 동작을 충실히 흉내내야 테스트가 유효

---

## 📝 작업 내용

> 가설에 따라 테스트 대상 레이어가 달라진다 (P01 결과로 확정):

- [ ] **가설 A·B (펌프/SDK 레이어)** — `claudeAgentRun` 단위 테스트(기존 `persistent-pump`·`persistent-session` 테스트 옆):
  - mock `PersistentQueryFn`으로 held-open 세션 구성 (기존 mock 패턴 재사용 — `99.Others/tests/**`의 persistent 테스트 픽스처 참고)
  - 진행 중 turn에서 `run.interrupt()` 호출 → 기대: 진행 중 turn이 종료되고 다음 push가 정상 처리됨
  - mock query의 interrupt 동작을 P01 확정 의미대로 모델링 (예: interrupt 시 mock iterator가 `result`를 조기 yield하거나 throw)
- [ ] **가설 C (배선 레이어)** — IPC/run-manager 테스트:
  - `agent-runs.ts`의 `interrupt(runId)`가 `activeRun.interruptFn()`을 호출하는지 (이미 IT1/IT2 테스트 존재 — `b603a5b`), 끊긴 지점이 그 위인지 아래인지 격리
- [ ] **테스트가 버그를 정확히 겨냥하는지 확인** — RED 이유가 "버그" 때문이지 "테스트 작성 실수"가 아님을 검증(가짜 RED 금지).
- [ ] **테스트 이름·주석에 버그 출처 명시** — `BF1-interrupt` + 재현 시나리오 한 줄, 미래 회귀 추적용.

---

## ✅ 완료 조건

- [ ] **신규 테스트 1+ 작성, 현재 코드에서 RED(실패)** — 버그가 기계적 증거로 고정됨.
- [ ] RED의 실패 메시지가 가설과 일치 (예: "interrupt 후에도 turn이 안 끝남" / "다음 push가 막힘").
- [ ] `npm run typecheck` 0 errors (테스트 파일 타입 정합).
- [ ] 기존 테스트 회귀 0 — 신규 RED 외 다른 변화 없음 (`npm run test`에서 신규 1건만 빨강).
- [ ] tdd-guard 훅 정합 — 구현(P03) 전 테스트 선작성 순서 준수.

---

## 📚 학습 포인트

- **실패 테스트 = 버그의 객관적 증거** — "안 멈춰요"는 주관, "이 테스트가 빨강"은 객관. 고친 뒤 초록이 되면 그게 증명.
- **mock으로 비결정적 외부(SDK·모델) 격리** — 실제 LLM 호출은 느리고 비결정적. mock query로 "interrupt 시 이렇게 동작한다"를 고정해 빠르고 반복가능하게.
- **RED를 정확히 겨눈다** — 테스트가 버그가 아닌 다른 이유로 실패하면 P03이 엉뚱한 걸 고친다. RED 원인 = 버그임을 확인하는 게 중요.

---

## ⚠️ 함정

- **mock이 SDK를 잘못 흉내내면 테스트가 거짓말** — P01의 SDK 의미 확정이 mock의 정확도를 좌우. 추측 mock 금지.
- **가짜 GREEN/가짜 RED** — 테스트가 항상 통과(아무것도 안 검증)하거나 항상 실패(setup 오류)하지 않는지. 일부러 코드를 바꿔보며 RED↔GREEN 토글되는지 확인.
- **앱 코드 수정 금지** — qa는 테스트만. interrupt() 로직을 여기서 고치고 싶어도 P03으로.

---

## 담당 SubAgent

`qa` (Vitest 단위 — `99.Others/tests/**`). 앱 코드는 R only. TDD 선작성.
