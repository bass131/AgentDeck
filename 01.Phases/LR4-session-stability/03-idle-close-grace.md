---
owner: 영호
milestone: LR4
phase: 03
title: idle-close 유예 후 판정 + 무한루프 상한
status: pending
grade: 복잡
risk: backend-contract
loop_track: human-gate
estimated: 2~5h
domain: agent-backend
summary: done 직후 즉시 close 대신 짧은 유예 — goal stop-hook 다음 턴 흡수(hasLoopActivity 미집계 보완) + 최대 턴/시간 상한 + goal 생존신호 방출(P05 소비처).
---

# Phase 03: idle-close 유예 후 판정 + 무한루프 상한

> **상태**: pending
> **마일스톤**: LR4
> **등급**: 복잡
> **담당**: agent-backend

---

## 🎯 목표

goal 자멸(증상 A2)을 봉합한다. `hasLoopActivity`가 goal stop-hook 자기지속을 못 보므로, 유예를 둬 다음 자율 턴을 활동으로 흡수한다. 아울러 무한 세션을 막는 상한을 둔다.

---

## ⏪ 사전 조건

- [ ] **P02 완료** — 창 소거 위에 유예를 얹는다(같은 펌프 코드 순차 편집이 안전).

---

## 📝 작업 내용

- [ ] **(a) 유예 도입** — idle 판정(`pendingSends===0 && !hasLoopActivity()`)에 짧은 유예를 둔다. 유예 중 새 result/turn 도착 시 close 취소(goal continuation 흡수).
- [ ] **(b) 유예 만료 close** — 유예 만료 + 여전히 무활동이면 기존대로 close.
- [ ] **(c) 무한루프 안전장치** — 최대 연속 자율 턴 수 or 시간 상한 초과 시 강제 종료 + 사용자 통지. **상한 값은 영호 결정 필요(human-gate).**
- [ ] **(d) goal 진행/종료 신호 방출** — continuation 감지 시 진행 신호, 유예 만료·상한 종료 시 종료 신호(유예 로직과 같은 소스라 중복 없이 방출). renderer(P05)가 이 신호를 배너에 소비.
- [ ] **(e) 재현 green** — P01 goal 자멸 재현 테스트를 green으로 전환.

---

## ✅ 완료 조건

- [ ] goal 다중 스텝 세션 유지 테스트 PASS
- [ ] 유예 만료 close 테스트 PASS
- [ ] 상한 발동 통지 테스트 PASS
- [ ] goal 생존신호 방출(진행/종료, P05 소비처) 테스트 PASS
- [ ] LR3 P02 라이브 probe 회귀 유지
- [ ] `npm run typecheck` (main+renderer) 0 errors · `npm run test` green · `npm run lint` 0 problems
- [ ] reviewer 무조건(backend-contract) CRITICAL 0
- [ ] **영호 GO** — 상한 값·커밋(버킷 c).

---

## 📚 학습 포인트

- **유예(grace period)** — 즉시 판정 대신 짧은 대기를 두면, 비동기적으로 도착하는 후속 이벤트(다음 자율 턴)를 활동으로 흡수해 오종료를 막을 수 있다. 단 유예가 길면 자원을 오래 붙잡는 trade-off.
- **상한(guard rail)** — 자기지속 루프에는 최대 턴/시간 상한이 없으면 무한 세션 위험. 상한은 정상 긴 goal을 오종료하지 않게 넉넉히 잡는 것이 관건.

---

## ⚠️ 함정

- 유예가 길면 자원 프로필 훼손(짧게 유지).
- 상한이 낮으면 정상 긴 goal을 오종료(넉넉히 설정).
- ADR-024 구역.

---

## 담당 SubAgent

agent-backend. reviewer + 영호 GO 2개(상한 값·커밋).
