---
owner: 영호
milestone: BL1
phase: 02
title: idle-close 유예 타이머 정리 — setTimeout 단순화 + 테스트 재구성 (LR4-P03 꼬리)
status: pending
grade: 복잡 (자동 상향: 보통 + backend-contract)
risk: backend-contract
loop_track: auto-gate
estimated: 2~4h
domain: cross
summary: LR4-P03이 남긴 정리 부채 — 유예 타이머 step-splitting 구현을 단순 setTimeout 기반으로 리팩토링 + qa 테스트 구조 정리(이미 fake timer 기반 — 비중첩 clock/barrier 구조로 재구성). 동작 불변(유예 3000ms·상한 100·autonomy_status).
---

# Phase 02: idle-close 유예 타이머 정리 (LR4-P03 꼬리)

> **상태**: pending
> **마일스톤**: BL1
> **등급**: 복잡 (자동 상향: 보통 + backend-contract 깃발 → reviewer 무조건·모델 상향)
> **담당**: agent-backend

---

## 🎯 목표

LR4-P03의 idle-close 유예 타이머(step-splitting 구현)를 단순 `setTimeout` 기반으로 정리하고, qa 테스트를 비중첩 clock/barrier 구조로 재구성한다. **주의(Codex 실측)**: 현 테스트는 이미 fake timer를 사용 중이며(lr4-p03-idle-grace.test.ts:100), step-splitting 자체가 *중첩 fake-time 진행 문제를 피하려고* 도입된 구조다(claudeAgentRun.ts:524) — 즉 단순 전환이 아니라 그 문제를 다른 방식으로 푸는 설계가 선행돼야 한다. **외부 동작은 완전 불변**: 유예 `IDLE_CLOSE_GRACE_MS=3000` / 자율 턴 상한 `MAX_CONSECUTIVE_AUTONOMOUS_TURNS=100` / `autonomy_status` 신호 방출 타이밍·페이로드 동일.

---

## ⏪ 사전 조건

- [ ] 근거 확인: LR4-DONE.md:75 (잔여 3번), `01.Phases/13_LR4-session-stability/03-idle-close-grace.md` (원 Phase 정의 — 유예·상한·신호 스펙)
- [ ] 현행 타이머 구현 위치: `02.Source/main/01_agents/claudeAgentRun.ts` (plan-auditor 실측 확정 2026-07-13 — `IDLE_CLOSE_GRACE_MS` 소재). agent-runs.ts는 소비처 — 착수 시 재실측이 진실

---

## 📝 작업 내용

- [ ] **(a) 실측** — step-splitting 타이머의 현재 구조 파악. 도입 사유는 확인됨(중첩 fake-time 진행 문제 회피 — claudeAgentRun.ts:524): 단일 setTimeout 전환 시 이 문제를 어떻게 피할지(비중첩 clock/barrier 설계) 리팩토링 메모에 먼저 답할 것
- [ ] **(b) 동작 불변 목록 고정** — 유예 중 result/turn 도착 시 close 취소 / 유예 만료 close / 상한 발동 통지 / autonomy_status 방출 — 각각을 지키는 기존 테스트 식별
- [ ] **(c) setTimeout 단순화** — step-splitting 제거, 단일 setTimeout + clearTimeout(취소 경로) 구조로 교체
- [ ] **(d) 테스트 재구성** — 현 테스트는 이미 fake timer 기반(lr4-p03-idle-grace.test.ts:100). deferred-promise/barrier 얽힘을 비중첩 clock 진행 구조로 정리해 가독성 회복 — 기존 계약(다중 스텝 유지·유예 만료 close·상한 통지·close 취소·autonomy_status) 5종 보존을 명시적으로 확인
- [ ] **(e) 회귀** — LR4-P03 관련 기존 spec 전부 green (goal 다중 스텝 유지 / 유예 만료 close / 상한 발동 통지)

---

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 errors
- [ ] `npm run test` green — LR4-P03 기존 spec 전수 PASS + 재구성 spec PASS
- [ ] `npm run lint` 0 problems
- [ ] 동작 불변 증명: 유예·상한·신호 3축 각각 단정 테스트 존재 (숫자 상수 3000/100 변경 없음 diff 확인)
- [ ] 단일 타이머 전환 후 중첩 fake-time 진행 문제 미재발 — 관련 spec 연속 실행 플레이크 0 (Codex P2)
- [ ] reviewer 통과 (backend-contract 깃발 = 무조건 호출)

---

## 📚 학습 포인트

- **리팩토링의 정의** — 외부 동작 불변 + 내부 구조 개선. "동작 불변"은 주장하는 게 아니라 기존 테스트 green으로 *증명*하는 것. 리팩토링 전 테스트가 그 동작을 실제로 커버하는지부터 확인.
- **fake timer의 중첩 진행 함정** — fake timer 환경에서 타이머 콜백 안에서 다시 시간을 진행시키면(중첩 advance) 교착·순서 붕괴가 생긴다. step-splitting은 그 회피책이었고, 이번 정리는 회피책 없이도 안전한 clock 진행 구조를 설계하는 문제다.

---

## ⚠️ 함정

- **backend-contract 경로**(`02.Source/main/01_agents/**`) — `AgentEvent`/`autonomy_status` 계약(타입·페이로드·방출 조건) 변경 금지. 순수 내부 리팩토링만. 계약을 건드리게 되면 보고 후 중단(설계 분기 = 버킷 c).
- 타이머 교체 시 race 경계 유지 — 이미 close된 세션에서 타이머 늦게 발화하는 경로(clearTimeout 누락)가 전형적 회귀.
- fake timer 사용 시 다른 테스트로 타이머 상태 누출(afterEach에서 useRealTimers 복원) 주의.

---

## 담당 SubAgent

coordinator 경유 — agent-backend(구현, `01_agents/claudeAgentRun.ts`) + qa(테스트 재구성, `99.Others/tests/agents/lr4-p03-idle-grace.test.ts`) 2 Worker + reviewer 무조건(backend-contract)
