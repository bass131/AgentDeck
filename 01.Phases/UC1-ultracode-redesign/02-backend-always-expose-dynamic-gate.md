---
owner: 영호
milestone: UC1
phase: 02
title: 백엔드 A안 — Workflow 상시 노출 + canUseTool 턴별 동적 게이트 (01_agents)
status: done
grade: 복잡
risk: backend-contract
loop_track: auto-gate
estimated: 2.5h
domain: agent-backend
summary: disallowedTools 제거·가이드 상시 합성·canUseTool이 라이브 orchestration 상태를 참조하는 구조로 전환 (01_agents 내부)
---

# Phase 02: 백엔드 A안 — Workflow 상시 노출 + canUseTool 턴별 동적 게이트 (01_agents)

> **상태**: pending
> **마일스톤**: UC1-ultracode-redesign
> **등급**: 복잡 (backend-contract — 권한 게이트 경로 변경)
> **담당**: agent-backend
> **loop_track 근거**: 설계는 ADR-032에서 확정 — 본 Phase는 확정 설계의 구현. 새 설계 분기 발견 시 (c) 승격 정지.

---

## 🎯 목표

`01_agents` 내부에서 A안이 성립한다: Workflow가 세션 옵션에서 상시 노출되고(`disallowedTools` 제거), `canUseTool`이 **세션 생성 시 캡처한 고정값이 아니라 "현재 턴의 orchestration 상태"를 라이브로 읽어** 허용(G1/G2 사용자 승인)·거부(G4 즉시 deny)를 판정한다.

---

## ⏪ 사전 조건

- [ ] Phase 01 완료 (RED 재현 + 회귀 고정 + 깨질 테스트 목록)

---

## 📝 작업 내용

- [ ] `sdkOptions.ts` — `disallowedTools` 계산 제거(Workflow 상시 노출). `ORCHESTRATION_SYSTEM_GUIDE`는 **상시 합성으로 전환**하되 사용 조건 서술 추가("Workflow/Task orchestration은 사용자가 UltraCode를 켰거나 메시지에서 요청한 턴에만 — 그 외 턴은 호출해도 거부된다") — OFF 턴 자발 호출 유인 완화.
- [ ] `permissionCoordinator.ts` — `makeCanUseTool(mode, orchestration)`의 orchestration 고정 캡처를 **라이브 참조로 전환**: `makeCanUseTool(mode, getOrchestration: () => boolean)` (또는 mutable ref 주입). G4(비허용 턴 즉시 deny)·G1/G2(허용 턴 사용자 승인) 판정 로직 자체는 불변 — 읽는 값만 라이브화.
- [ ] `claudeAgentRun.ts` — run 인스턴스에 `currentOrchestration` 상태 보유 + 후속 턴 주입 지점(외부에서 갱신 가능한 setter/메서드) 노출. held-open 입력 generator에 턴이 push될 때 이 상태가 갱신될 수 있는 인터페이스(P03에서 00_ipc가 배선).
- [ ] P01-(c) 스냅샷 단언을 새 스펙(상시 노출)으로 교체 + P01이 예고한 기존 테스트 정합(스펙 변경에 따른 기대값 갱신 — 케이스 삭제 금지).
- [ ] `AgentBackend.ts` 인터페이스 변경은 **최소화** — 공개 계약(AgentRunRequest.orchestration boolean)은 불변. 내부 turn-push 경로에만 확장.

## ✅ 완료 조건

- [ ] `npx vitest run 99.Others/tests/main/` green — P01-(b) deny 회귀 유지 + (c) 교체 반영
- [ ] sdkOptions 산출물에 `disallowedTools` 부재 + 가이드 상시 합성 단위 테스트로 고정
- [ ] `npm run typecheck` 0 / `npm run test` green / `npm run lint` 0
- [ ] reviewer(backend-contract 깃발 무조건) CRITICAL 0 — **집중점(plan-auditor 🟡)**: Workflow 게이트 판정이 auto/bypass 조기허용보다 **먼저** 평가되는 현행 순서(`permissionCoordinator.ts` L234-244 → L247)가 보존됐는가. disallowedTools 제거로 G4가 유일 방벽이 되므로 이 순서가 무너지면 auto/bypass 모드에서 OFF 턴 Workflow가 뚫린다.

## 📚 학습 포인트

- **클로저 캡처 vs 라이브 참조** — 콜백이 값을 캡처하면 생성 순간에 얼어붙는다. `() => state.current` 게터를 넘기면 콜백 수명 내내 최신 값을 읽는다 — 세션보다 짧은 수명의 상태(턴)를 세션 수명 콜백에 연결하는 표준 기법.
- **차단 계층의 이동** — "모델이 도구를 못 보게"(스키마 차단)에서 "호출 시점에 거부"(게이트 차단)로 옮기면 유연성을 얻고 유인(모델이 시도할 수 있음)을 비용으로 낸다 — 가이드 서술로 완화.

## ⚠️ 함정

- canUseTool 시그니처 변경이 `claudeAgentRun.ts:410` 호출부 외 다른 호출처에 파급되는지 grep 전수 확인.
- 가이드 상시 합성은 **모든 세션의 시스템 프롬프트가 바뀌는 것** — 골든/스냅샷 테스트 파급 주의(P01 예고 목록).
- `00_ipc/**`(agent-runs.ts)는 건드리지 마라 — P03(main-process) 몫. 이 Phase에서 P01-(a) RED는 아직 RED여도 된다(GREEN 전환은 P03 완료조건).

## 담당 SubAgent

agent-backend
