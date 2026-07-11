---
owner: 영호
milestone: LR4
phase: 04
title: 렌더러 stuck 탈출 — interrupt 죽은 run 감지 정리
status: done
grade: 보통
loop_track: auto-gate
estimated: 1~3h
domain: renderer
summary: interrupt가 활성 run 부재/죽은 run 감지 시 isRunning 로컬 정리 — 재시작 없이 복구(2차 안전망).
---

# Phase 04: 렌더러 stuck 탈출 — interrupt 죽은 run 감지 정리

> **상태**: done
> **마일스톤**: LR4
> **등급**: 보통
> **담당**: renderer

---

## 🎯 목표

비가역 stuck을 해소한다. 무한대기가 나더라도 스톱/Esc로 복구 가능하게(재시작 불요) 만든다. P02가 근본을 막지만, 방어적 2차 안전망(main 세션이 어떤 이유로 죽어도 UI 복구)이다.

---

## ⏪ 사전 조건

- [x] **P01 완료** — stuck 재현 테스트 확보. P02·P03과는 독립(renderer) — 병렬 가능.

---

## 📝 작업 내용

- [x] **(a) interrupt 기반 복구 — 우선** — `interruptRun`(`runtime.ts:280-287`)이 대상 run 생존을 확인(currentRunId 유효·main 응답 부재) → 죽었으면 `abortRun`처럼 isRunning=false 로컬 정리. 이 경로를 1차로 채택.
- [x] **(b) send-guard 탈출 — 보수적 2차** — `sendMessage`의 `if(isRunning)return`(`runtime.ts:77`) 우회는 liveness 오판 시 **이중 send/고아 run 위험**이라 2차로만. 느린-하지만-살아있는 세션을 죽은 것으로 오탈출시키지 말 것(정확한 생존 판정 전제, 미확신 시 미채택).
- [x] **(c) 재현 green** — P01 stuck 재현 테스트를 green으로 전환.

---

## ✅ 완료 조건

- [x] interrupt 죽은 run→isRunning 정리 테스트 PASS
- [x] 정상 interrupt(살아있는 run) 회귀 0
- [x] `npm run typecheck` (main+renderer) 0 errors · `npm run test` green · `npm run lint` 0 problems

---

## 📚 학습 포인트

- **2차 안전망(defense in depth)** — 근본 수정(P02)이 있어도, 렌더러가 죽은 세션을 감지해 로컬 상태를 복구하면 예기치 못한 main 사망에도 UI가 잠기지 않는다.
- **생존 판정(liveness check)** — "run이 살아있는가"를 정확히 판정해야 정상 스트리밍을 죽은 것으로 오판하지 않는다.

---

## ⚠️ 함정

- 정상 스트리밍 중 interrupt를 죽은 것으로 오판 금지(생존 판정 정확성).
- send-guard 탈출(b)은 이중 send/고아 위험이라 보수적 2차 — interrupt 경로(a)로 먼저 해결하고, P02가 근본을 막으므로 P04는 어디까지나 2차 안전망 성격을 유지한다.
- CP1 P06의 Esc→`decideStopAction` 변경과 정합 유지.

---

## 담당 SubAgent

renderer
