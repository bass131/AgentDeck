---
owner: 영호
milestone: UC1
phase: 01
title: 턴별 orchestration 미반영 재현 박제 + 현행 deny 회귀 고정 (TDD RED)
status: done
grade: 보통
loop_track: auto-gate
estimated: 1.5h
domain: qa
summary: held-open 후속 턴의 orchestration 무시를 테스트로 재현(RED)하고, OFF 턴 Workflow 즉시 deny(G4) 현행을 회귀로 고정
---

# Phase 01: 턴별 orchestration 미반영 재현 박제 + 현행 deny 회귀 고정 (TDD RED)

> **상태**: pending
> **마일스톤**: UC1-ultracode-redesign
> **등급**: 보통
> **담당**: qa

---

## 🎯 목표

ADR-032의 근본 문제 — "held-open 세션에 push되는 후속 턴의 orchestration 플래그가 무시된다(세션 생성 시 고정)" — 가 **단위 테스트로 결정론 재현**되고(RED 박제), 지켜야 할 현행 동작 — "orchestration=false 턴의 Workflow 호출은 permission_request 없이 즉시 deny(G4)" — 가 회귀 테스트로 고정된다. P02~P03의 done 판사.

---

## ⏪ 사전 조건

- [ ] ADR-032 박제 완료 (00.Documents/ADR.md §ADR-032)

---

## 📝 작업 내용

- [ ] `99.Others/tests/main/uc1-p01-turn-orchestration.test.ts` (신규):
  - (a) **후속 턴 orchestration 미반영 재현(양방향)** — `agent-runs.ts` start()를 mock backend로 구동: ⓐ-1 첫 start(orchestration=false, persistent+sessionKey) → 같은 sessionKey로 둘째 start(orchestration=true) → 반영 안 됨 재현. **ⓐ-2 역방향(plan-auditor 🔴#2)**: 첫 턴 ON → 다음 턴 OFF(토글 OFF·키워드 없음) → Workflow 즉시 deny(G4)로 **재봉인**되는지 — 권한 표면이 ON으로 래치되지 않음을 단언. 둘 다 RMW1 P01 방식 `it.fails`(또는 RED) 박제 — P03에서 `.fails` 제거가 GREEN 증거.
  - (b) **G4 deny 회귀 고정(현행 유지 — GREEN으로 작성)** — `permissionCoordinator.makeCanUseTool(mode, orchestration=false)` 경유 Workflow 호출 → permission_request 이벤트 0 + 즉시 deny 단언(기존 테스트 있으면 커버 확인만, 없으면 신규).
  - (c) **가이드 상시 합성 전환 대비** — 현재 `sdkOptions`가 orchestration=false에서 `disallowedTools:['Workflow']`를 넣는 것을 스냅샷 단언으로 박제하되 `.fails` 아님 — P02에서 이 단언을 새 스펙(상시 노출)으로 *교체*하는 것까지가 P02 완료조건(테스트가 스펙 변경을 강제하는 장치).
- [ ] 기존 관련 테스트 지도 작성: sdkOptions/permissionCoordinator 기존 테스트 중 P02가 깨뜨릴 것 목록을 보고(사전 예고 — P02 Worker 입력).

## ✅ 완료 조건

- [ ] (a) RED(`it.fails` green) / (b)·(c) GREEN — `npx vitest run 99.Others/tests/main/uc1-p01-turn-orchestration.test.ts`
- [ ] `npm run typecheck` 0 / `npm run test` 전체 green(신규 fail 0) / `npm run lint` 0
- [ ] P02가 깨뜨릴 기존 테스트 목록 보고 첨부

## 📚 학습 포인트

- **RED 박제의 가치** — 버그를 "고치기 전에 테스트로 증명"하면, 수리가 진짜 그 버그를 잡았는지 기계가 판정한다(RMW1 P01→P04 선례).
- **회귀 고정 vs 변경 강제** — (b)는 지켜야 할 동작(불변), (c)는 바뀔 동작(P02가 교체) — 같은 테스트 파일 안에서 역할이 다르다.

## ⚠️ 함정

- (a) 재현은 실 SDK 없이 — mock backend/gate로 결정론 재현(라이브는 P06 몫).
- `02.Source/**` 수정 금지 — 테스트만.

## 담당 SubAgent

qa
