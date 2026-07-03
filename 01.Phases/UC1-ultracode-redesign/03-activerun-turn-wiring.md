---
owner: 영호
milestone: UC1
phase: 03
title: ActiveRun 턴별 orchestration 배선 — 후속 턴 push 시 라이브 반영 (00_ipc)
status: done
grade: 보통
risk: trust-boundary
loop_track: auto-gate
estimated: 1.5h
domain: main-process
summary: agent-runs.ts 세션 재사용 경로에서 후속 start()의 orchestration을 기존 run에 전달 — P01 RED → GREEN
---

# Phase 03: ActiveRun 턴별 orchestration 배선 — 후속 턴 push 시 라이브 반영 (00_ipc)

> **상태**: pending
> **마일스톤**: UC1-ultracode-redesign
> **등급**: 보통 (trust-boundary[00_ipc] — 입력 정규화 경로)
> **담당**: main-process

---

## 🎯 목표

같은 sessionKey의 후속 `start()`가 기존 held-open 세션에 턴을 push할 때, 그 요청의 `orchestration`(=== true 정규화 값)이 P02가 노출한 run 인터페이스로 전달되어 **다음 도구 호출부터 게이트에 반영**된다. **P01-(a) 재현 테스트가 `.fails` 제거 후 GREEN** — 마일스톤 백엔드 축의 기계 증거.

---

## ⏪ 사전 조건

- [ ] Phase 02 완료 (run에 turn-orchestration 주입 인터페이스 존재)

---

## 📝 작업 내용

- [ ] `02.Source/main/00_ipc/agent-runs.ts` — 세션 재사용 분기(기존 `persistentRuns.get(sessionKey)` 경로)에서 turn push 직전에 `existing`의 orchestration 상태 갱신 호출 추가. 기존 `=== true` 정규화(untrusted renderer 입력) 경유 값만 전달.
- [ ] `00_ipc/handlers/agent.ts`는 변경 없음이 목표(정규화가 이미 있음) — 필요 시 최소.
- [ ] P01-(a) `.fails` 제거 → GREEN 확인.

## ✅ 완료 조건

- [ ] P01-(a) ⓐ-1·ⓐ-2 **양방향** `.fails` 없이 PASS + P01-(b) deny 회귀 유지 — **false 방향도 전파(할당이지 래치 아님 — ON 고착 금지, plan-auditor 🔴#2)**
- [ ] `npm run typecheck` 0 / `npm run test` green / `npm run lint` 0
- [ ] reviewer(trust-boundary 깃발 무조건) CRITICAL 0 — 신뢰경계 점검: 정규화 우회 경로 0

## 📚 학습 포인트

- **상태의 소유와 갱신 시점** — "턴 push"라는 이벤트가 상태 갱신의 유일한 지점이면 경합 표면이 최소화된다(RMW1 교훈 — run-to-completion 안의 동기 갱신).

## ⚠️ 함정

- 갱신 시점은 **turn push 직전** — push 후 갱신이면 그 턴의 첫 도구 호출이 옛 상태로 판정될 수 있다.
- 큐잉된 예약 메시지(renderer 큐 드레인)도 같은 start() 경로를 타는지 확인 — 예외 경로가 있으면 보고.

## 담당 SubAgent

main-process
