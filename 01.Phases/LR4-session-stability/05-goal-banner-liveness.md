---
owner: 영호
milestone: LR4
phase: 05
title: goal 배너 백엔드 생존신호
status: pending
grade: 복잡
loop_track: auto-gate
estimated: 2~5h
domain: renderer
summary: goal 배너를 P03이 방출하는 백엔드 goal 생존신호에 결속(소비만) — 조기발동·미해제 봉합. 신호 방출은 P03 소관.
---

# Phase 05: goal 배너 백엔드 생존신호

> **상태**: pending
> **마일스톤**: LR4
> **등급**: 복잡
> **담당**: renderer

---

## 🎯 목표

goal 배너 미해제·조기발동(증상 A3)을 봉합한다. 배너를 P03이 방출하는 백엔드 goal 실상태 신호에 결속한다(소비만 — SDK 배너가 loops 이벤트로 실상태를 반영하듯).

---

## ⏪ 사전 조건

- [ ] **P03 완료** — P03이 goal 진행/종료 생존신호를 방출(P05가 소비할 신호 소스가 준비됨).

---

## 📝 작업 내용

- [ ] **(a) 배너 결속(소비)** — renderer `loopStatus`가 **P03이 방출하는 goal 진행/종료 신호**를 소비해 배너 on/off(조기: 실제 자율반복 확인 후 / 해제: 종료 신호). 신호 *방출*은 이 Phase 소관이 아니다(P03이 담당).
- [ ] **(b) 폴백** — heartbeat/타임아웃 폴백을 둔다(신호 유실 시 배너 stuck 방지).

---

## ✅ 완료 조건

- [ ] goal 배너 실상태 정합 테스트(조기발동 억제·종료 해제·조용한 사멸 시 해제) PASS
- [ ] `npm run typecheck` (main+renderer) 0 errors · `npm run test` green · `npm run lint` 0 problems
- [ ] reviewer CRITICAL 0(renderer-only, 깃발 없음)

---

## 📚 학습 포인트

- **낙관 플래그 vs 실상태 신호** — 배너를 요청 시점의 낙관적 플래그(`pendingCommand`)에만 걸면 실제 백엔드 상태와 어긋난다(미해제·조기발동). 백엔드 생존신호에 결속하면 표시가 실상태를 반영.
- **표시-only 계약(ADR-024)** — 배너는 표시일 뿐 SDK 재주입이 아니다. 신호가 UI를 바꿀 뿐 루프 구동을 하지 않게 경계.

---

## ⚠️ 함정

- ADR-024 표시-only(SDK 재주입 아님).
- 신호 방출은 P03 소관 — 이 Phase는 소비만(중복 방출 회피는 P03 내부에서 처리).

---

## 담당 SubAgent

renderer(소비만). reviewer.
