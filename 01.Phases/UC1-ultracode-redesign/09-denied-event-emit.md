---
owner: 영호
milestone: UC1
phase: 09
title: G4 deny 시 orchestration_denied 방출 — permissionCoordinator (01_agents)
status: pending
grade: 보통
risk: backend-contract
loop_track: auto-gate
estimated: 1h
domain: agent-backend
summary: canUseTool G4 즉시 deny 경로에서 orchestration_denied 이벤트 push — deny 거동 불변, 이벤트만 추가
---

# Phase 09: G4 deny 시 orchestration_denied 방출 — permissionCoordinator (01_agents)

> **상태**: pending
> **마일스톤**: UC1-ultracode-redesign
> **등급**: 보통
> **담당**: agent-backend

---

## 🎯 목표

`permissionCoordinator`의 G4 즉시 deny 경로(OFF 턴 Workflow 차단)가 deny와 **동시에 `orchestration_denied` 이벤트를 push**한다. deny 판정 자체(즉시 반환·permission_request 0·auto/bypass 선평가 순서)는 라인 단위 불변 — 이벤트 방출만 추가.

---

## ⏪ 사전 조건

- [ ] Phase 08 완료 (이벤트 계약 존재)

---

## 📝 작업 내용

- [ ] `permissionCoordinator.ts` G4 분기(`ORCHESTRATION_TOOLS.includes(toolName) && !getOrchestration()` — L234 부근)에서 `{behavior:'deny'}` 반환 직전 `_push`(기존 이벤트 push 경로)로 `orchestration_denied` 방출. `id`는 해당 도구 호출 id, `reason: 'orchestration-off'`.
- [ ] 단위 테스트: G4 deny 시 ⓐ deny 반환 불변 ⓑ permission_request 0 불변 ⓒ orchestration_denied 정확히 1건 push. ON 턴·비-Workflow 도구에서는 미방출.
- [ ] P01 회귀(`uc1-p01-turn-orchestration.test.ts` (b))가 "permission_request 0" 단언 기준이면 불변 확인 — denied 이벤트는 permission_request가 아님.
- [ ] **총-push 개수 단언 기존 테스트 명시 열거 정합(plan-auditor 🔴#1)** — G4 deny에 push가 1건 늘면서 깨지는 *unfiltered* 단언 2건, 의도 보존 치환(총-count → `permission_request` 필터 + `orchestration_denied` 1건 단언 추가, 케이스 삭제 금지):
  - `99.Others/tests/agents/permissionCoordinator.test.ts:123` `expect(pushed).toEqual([])`
  - `99.Others/tests/main/uc1-p01-turn-orchestration.test.ts:308` `expect(pushed).toHaveLength(0)` (auto-mode G4 변형)
  - (참고: `orchestration-permission-gate.test.ts:219`는 이미 permission_request 필터 — 안전.)

## ✅ 완료 조건

- [ ] 신규 단위 테스트 green + 기존 permissionCoordinator·P01 테스트 전부 green
- [ ] `npm run typecheck` 0 / `npm run test` green / `npm run lint` 0
- [ ] reviewer(backend-contract 깃발 무조건) CRITICAL 0 — deny 판정·게이트 순서 불변 집중 확인

## 📚 학습 포인트

- **판정과 통지의 분리** — 게이트의 *판정*(deny)은 보안 로직, *통지*(이벤트)는 UX. 통지를 추가해도 판정 코드가 안 바뀌면 보안 리뷰 표면이 최소가 된다.

## ⚠️ 함정

- 이벤트 push가 deny 반환을 지연/실패시키면 안 됨 — push는 fire-and-forget(기존 permission_request push 관례 확인).
- `_push`는 생성자 필수 인자(옵셔널 아님 — permissionCoordinator.ts:172 실측, plan-auditor 정정) — NPE 방어 코드 불요, 기존 시그니처 그대로 사용.

## 담당 SubAgent

agent-backend
