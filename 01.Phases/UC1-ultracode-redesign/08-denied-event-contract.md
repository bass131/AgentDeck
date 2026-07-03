---
owner: 영호
milestone: UC1
phase: 08
title: orchestration_denied 이벤트 계약 — G4 차단 가시화의 공유 타입 (additive)
status: pending
grade: 보통
risk: shared-contract
loop_track: auto-gate
estimated: 0.5h
domain: shared-ipc
summary: AgentEvent 유니온에 orchestration_denied additive 추가(기존 필드 변경 0) — 엔진중립·신뢰경계 준수 계약 정의
---

# Phase 08: orchestration_denied 이벤트 계약 — G4 차단 가시화의 공유 타입 (additive)

> **상태**: pending
> **마일스톤**: UC1-ultracode-redesign
> **등급**: 보통 (additive 1타입 — 파급은 작으나 shared-contract 깃발)
> **담당**: shared-ipc

---

## 🎯 목표

G4 즉시 deny(OFF 턴 Workflow 차단)를 renderer가 표시할 수 있는 **엔진중립 이벤트 계약**이 `02.Source/shared/agent-events.ts`에 additive로 정의된다(ADR-032 v2 ④). 기존 이벤트·필드 변경 0.

---

## ⏪ 사전 조건

- [ ] ADR-032 개정 v2 박제

---

## 📝 작업 내용

- [ ] `agent-events.ts`에 `AgentEventOrchestrationDenied` 추가:
  - `type: 'orchestration_denied'` / `id: string`(도구 호출 id) / `reason: 'orchestration-off'`(유니온 확장 여지 있는 리터럴) — 표시 문구는 renderer 몫(계약에 한국어 카피 넣지 않음).
  - 주석에 CRITICAL 명기: 엔진중립('Workflow' 리터럴 금지 — 기존 orchestration 이벤트 관례) / 신뢰경계(모델 raw payload 0) / backend-contract 깃발(어댑터·renderer·qa 파급).
- [ ] `AgentEvent` 유니온에 합류 + 타입 가드/헬퍼가 있으면 정합.
- [ ] preload 화이트리스트는 기존 이벤트 스트림 채널 재사용이라 변경 없음이 목표 — 확인만.

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 (main+renderer 양쪽 — shared 변경 영향 확인)
- [ ] 기존 이벤트 스키마 변경 0 (diff가 additive뿐임을 reviewer가 확인)
- [ ] reviewer(shared-contract 깃발 무조건) CRITICAL 0

## 📚 학습 포인트

- **additive 확장** — 유니온에 멤버를 *더하는* 것은 기존 소비자를 깨지 않는다(discriminated union의 switch는 default/미처리로 안전). *바꾸는* 것과 위험 등급이 다르다 — 그래서 IPC 버전 bump 없이 가능.

## ⚠️ 함정

- 계약은 *정의만* — 방출(P09)·표시(P10)는 다른 Phase. 이 Phase에서 main/renderer 구현 금지.
- `reason`을 자유 문자열로 두지 말 것 — 리터럴 유니온이어야 renderer가 카피를 안전하게 매핑.

## 담당 SubAgent

shared-ipc
