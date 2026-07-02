---
owner: 영호
milestone: BF3
phase: 02
title: interrupt 에러문구 순화 — tool_use 중 중단 시 "Agent execution error" 노출 제거
status: pending
grade: 보통
risk: backend-contract
loop_track: auto-gate
estimated: 1~3h
domain: agent-backend
summary: tool_use 실행 도중 중단 시 펌프 catch가 내보내는 위협적 일반 에러문구를 중단 안내로 재라벨(또는 억제) — BF1 _interrupted 패턴의 연장
---

# Phase 02: interrupt 에러문구 순화

> **상태**: pending / **마일스톤**: BF3 / **등급**: 보통 (backend-contract 깃발 → reviewer 무조건) / **담당**: agent-backend

## 🎯 목표

tool_use 실행 도중 ■로 중단하면 채팅에 `"Agent execution error: …"` 대신 순화된 중단 안내가 뜬다(또는 에러 이벤트 자체가 억제되고 정상 중단 처리). 정지 기능은 이미 정상 — 문구만 위협적인 표면 이슈를 봉합한다.

## ⏪ 사전 조건

- [ ] Phase 01 완료 (bf1 단언 진단력 — 이 Phase의 회귀 안전망)

## 📝 작업 내용

- [ ] **TDD 선행**: tool_use 중 interrupt throw가 펌프 catch에 도달하는 시나리오 재현 테스트(RED) — BF1 P03의 `_interrupted` 수리가 커버하지 못한 경로임을 단언으로 고정.
- [ ] `02.Source/main/01_agents/claudeAgentRun.ts` catch 2곳(단발 펌프 ~:486, 지속세션 펌프 ~:677): `_interrupted`(또는 abort 신호) 상태에서 도달한 throw는 `Agent execution error:` 재라벨 대상에서 제외 — 순화 문구로 교체 또는 error 이벤트 억제 후 done만 push. 설계는 Worker 재량이되 **error+done 쌍 계약**과 기존 abort 조기 return 가드(:482, :673)를 깨지 않을 것.
- [ ] `_interrupted` 리셋 타이밍(:645, turn 경계 리셋)과의 상호작용 검증 — 다음 turn의 *진짜* 에러는 여전히 표면화되어야 함(BF1 계약 유지).
- [ ] 순화 문구는 renderer의 기존 한국어 UX 톤과 정합 (예: "실행을 중단했어요" 계열 — 기존 문구 grep 후 결정).

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 / `npm run test` green / `npm run lint` 0
- [ ] 신규 재현 테스트 RED→GREEN **git stash 실측 필수** (구코드에서 실제 실패 확인 — P07 교훈, plan-auditor 주의-3로 필수 승격)
- [ ] tool_use 중 중단 시 `Agent execution error` 문자열이 push 이벤트에 미출현 (단언)
- [ ] 중단이 아닌 실제 SDK 오류는 기존과 동일하게 error 표면화 (회귀 단언)

## 📚 학습 포인트

- **에러 라벨링은 UX다**: 같은 throw라도 "누가 왜 던졌나"(사용자 중단 vs 진짜 장애)에 따라 사용자 대면 메시지를 갈라야 한다.
- **플래그 리셋 타이밍**: `_interrupted`처럼 상태 플래그는 "언제 세우나"만큼 "언제 내리나"가 계약이다.

## ⚠️ 함정

- catch에서 interrupt를 과잉 억제하면 진짜 에러까지 삼킨다 — 판별 조건을 `_interrupted`/abort 신호로 좁게.
- `01_agents/**` = backend-contract 깃발 — AgentEvent 타입 자체는 변경 금지(문구만). 타입 바뀌면 shared-ipc 영역 침범.
- done 이벤트 누락/이중 push — F-B 보류 로직(:472~479)과 지속세션 즉시-push(:640) 경로가 다름을 인지.

## 담당 SubAgent

agent-backend Worker 1개. reviewer 무조건(backend-contract).
