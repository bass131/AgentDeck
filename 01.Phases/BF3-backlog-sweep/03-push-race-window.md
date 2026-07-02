---
owner: 영호
milestone: BF3
phase: 03
title: P02 push μs창 봉합 — idle-close 판정과 push 사이 경합 창 제거
status: pending
grade: 보통
risk: backend-contract
loop_track: auto-gate
estimated: 1~3h
domain: agent-backend
summary: LR3-P02 reviewer 🟡-1 — idle-close 판정 직후 μs 창에 도착한 push가 유실될 수 있는 이론상 경합을 재확인 패턴으로 봉합
---

# Phase 03: P02 push μs창 봉합

> **상태**: pending / **마일스톤**: BF3 / **등급**: 보통 (backend-contract 깃발 → reviewer 무조건) / **담당**: agent-backend

## 🎯 목표

`claudeAgentRun.ts` 지속세션 펌프의 턴 경계 idle-close 판정(`_pendingSends === 0 && !hasLoopActivity()`, ~:657)과 실제 입력 스트림 종료 사이의 마이크로초 경합 창에서 도착한 push가 유실되지 않는다. "인간 속도 도달 불가"(LR3-P02 reviewer 판정)지만 자동화·큐잉 경로에선 이론상 도달 가능 — 구조적으로 봉합한다.

## ⏪ 사전 조건

- [ ] Phase 02 완료 (같은 파일 `claudeAgentRun.ts` — 충돌 방지 직렬)

## 📝 작업 내용

- [ ] **TDD 선행**: 경합 창 재현 테스트(RED) — idle 판정 직후·input gen 종료 전에 push를 주입하는 결정론적 재현(타이밍 sleep 금지, 훅/큐 조작으로 순서 고정).
- [ ] 봉합 설계(Worker 재량, 후보 제시): ⓐ `push()`가 `_idleClosing`을 확인해 아직 close 전이면 플래그 해제+세션 유지 ⓑ input gen 종료 직전 `_inputQueue`/`_pendingSends` 최종 재확인 후 잔여 있으면 강등 취소 ⓒ push를 명시 거부(reject)해 호출측(agent-runs)이 새 run으로 라우팅 — **ⓐ/ⓑ 우선**(ⓒ는 agent-runs 변경 유발이라 회피).
- [ ] LR3-P02가 세운 **불변조건 보존**: `_idleClosing`은 abort와 분리된 순수 강등 경로(AbortController·권한취소·abortCleanup 미개입) — 봉합이 이 분리를 흐리지 않을 것.
- [ ] 기존 IC1~4 + interrupt·권한대기·멀티패널 엣지 테스트 전체 회귀 확인.

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 / `npm run test` green / `npm run lint` 0
- [ ] 경합 재현 테스트 RED→GREEN 실측 (타이밍 의존 없는 결정론적 재현)
- [ ] `02.Source/main/00_ipc/agent-runs.ts` diff **0줄** (🔴 ADR-024 위험구역 — LR3-P02 0줄 전략 유지. 경로 실측 확인됨 — plan-auditor 주의-2 반영)
- [ ] 정상 idle-close(잔여 push 없음)는 기존과 동일하게 자연종료 (회귀 단언 — LR3-P02 라이브 계약 "무활동 done → 자연종료")

## 📚 학습 포인트

- **경합 창(race window)**: "판정"과 "행동" 사이에 다른 액터가 끼어들 수 있는 시간 틈. 봉합의 정석은 판정-행동을 원자화하거나, 행동 직전 재확인(double-check)하거나, 늦게 온 쪽이 되돌리게 하는 것.
- **이론상 버그를 고치는 기준**: 도달 확률이 아니라 "도달 시 피해 × 봉합 비용"으로 판단 — 여기선 봉합이 싸고 자동화 경로가 커지는 중이라 수리 가치가 생겼다.

## ⚠️ 함정

- 재현 테스트에 `setTimeout`/실시간 대기 넣지 말 것 — flaky의 씨앗. 순서를 코드로 고정.
- `_idleClosing` 해제 로직이 abort 경로와 얽히면 LR3-P02 불변조건 위반 — abort 중엔 절대 세션 부활 금지.
- 지속세션 finally의 `persistentPumpCleanup()` 이벤트 순서(loops 정리 → close) 변경 금지 — BF2-mini 화이트리스트 계약과 맞물림.

## 담당 SubAgent

agent-backend Worker 1개. reviewer 무조건(backend-contract).
