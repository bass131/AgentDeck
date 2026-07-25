---
owner: 영호
milestone: LR2
phase: 04
title: held-open sessionKey 전환 안정화 (고아 세션 누수 제거)
status: done
grade: 복잡
risk: backend-contract
loop_track: auto-gate
domain: agent-backend
summary: turn1(currentSessionKey)→turn2(conversationId) sessionKey 전환으로 held-open 재사용이 끊기고 turn1 세션이 고아로 남는 누수를 제거. held-open 라이프사이클(agent-runs.ts done→delete) = ADR-024 "🔴 회귀 최대위험" 구역. LR1 Phase 03에서 이관(2026-07-01, plan-auditor).
---

# LR2 Phase 04 — held-open sessionKey 전환 안정화

> **이관 이력**: 원래 LR1 Phase 03의 한 갈래였으나 plan-auditor 판정으로 LR2 이관 — (a)맥락은 resume으로 보존되는 **자원 누수**지 correctness 버그 아님 (b)held-open 라이프사이클 = LR2 도메인 (c)가치가 LR2 Phase 01(replMode 전환)에 의존(resume 기본으로 뒤집히면 held-open 옵트인 격하 → 우선순위↓).

## 🎯 목표
`runtime.ts:131` `resolvedSessionKey = convId ?? currentSessionKey` 로 인해, turn1은 `currentSessionKey`로 held-open 등록되나 conversationId 생기면 turn2가 `conversationId`를 키로 써 held-open 재사용이 끊기고 turn1 세션이 고아로 남는 누수를 제거. 대화 생애에 걸쳐 sessionKey를 안정화.

## ⏪ 사전 조건
- LR2 Phase 01(replMode 전환) 착수 여부에 따라 우선순위 재검토. held-open이 여전히 유의미한 경우에만 가치 有.

## 📝 작업 내용
1. 키 결정을 대화 생애 안정적으로 — 첫 저장 후 currentSessionKey를 conversationId로 승격하거나, 키 소스 일관화.
2. `agent-runs.ts` held-open 등록/재사용/dispose 라이프사이클(done→delete)과 정합 — **🔴 회귀 최대위험 구역, 테스트 촘촘히**.

## ✅ 완료 조건 (정량)
- turn1→turn2 동일 held-open 세션 재사용(또는 명시적 resume 승격) — 고아 세션 0(테스트/로그).
- held-open 라이프사이클 회귀 0 (기존 e2e·단위 green).
- typecheck·test green·lint 0 · **reviewer 무조건**(backend-contract, held-open 라이프사이클).

## ⚠️ 함정
- **held-open 라이프사이클(agent-runs.ts)은 ADR-024 지정 회귀 최대위험** — done→delete 타이밍·interrupt·app-close 상호작용. 단독 Phase·촘촘한 테스트.
- LR2 Phase 01(replMode 전환) 후엔 held-open 옵트인이라 이 누수의 노출면 축소 → 착수 전 가치 재확인.

## 담당 SubAgent
agent-backend (`02.Source/main/01_agents/**` + `agent-runs.ts`). reviewer 무조건.
