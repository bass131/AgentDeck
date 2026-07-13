---
owner: 영호
milestone: GAP1
phase: 07
title: Plan 모드 승인 UI — 계획 본문 렌더 + 실행 승인/계속 계획 카드
status: pending
grade: 복잡 (보통 + backend-contract·ui-visual 깃발)
risk: backend-contract·ui-visual
loop_track: human-visual
estimated: 2~5h
domain: cross
summary: ExitPlanMode 전용 처리 0건 → permissionSummary에 plan 분기 추가(permissionCoordinator.ts:146-151·281-287), 계획 본문(input.plan) 마크다운 렌더 + '실행 승인 vs 계속 계획' 전용 카드(T-07·S-06·I-02 3중 dedupe). 기존 인라인 권한 카드 재사용, plan payload는 P03 계약 필드 사용.
---

# Phase 07: Plan 모드 승인 UI

> **상태**: pending
> **마일스톤**: GAP1
> **등급**: 복잡 (자동 상향: 보통 + backend-contract·ui-visual → reviewer 무조건·human-visual)
> **담당**: cross (agent-backend + renderer) + reviewer

---

## 🎯 목표

Claude Code의 시그니처 워크플로우인 plan-approval을 완성한다. 끝나면: ExitPlanMode 시 모델이 세운 계획 본문이 마크다운으로 렌더되고, 사용자가 '실행 승인' vs '계속 계획'을 전용 카드에서 고른다. 지금은 계획 본문이 안 보이는 'ExitPlanMode 실행' 일반 권한카드만 떠서 사실상 무의미한 승인이다.

---

## ⏪ 사전 조건

- [ ] **P03 완료** — permission 요청 payload에 plan 본문 필드(P03 probe ③ 캡처 실형상: plan/planFilePath/allowedPrompts 중 실재분)가 정의됨
- [ ] 근거 = GAP1 감사 T-07(tools)·S-06(sdk)·I-02(interaction) 3중 dedupe 항목
- [ ] 현행: ExitPlanMode 전용 처리 0(전역 grep 무매치) · 'plan'은 권한 picker 모드로만 존재(`permissionCoordinator.ts:210`) · generic _requestPermission으로 떨어져 permissionSummary가 'ExitPlanMode 실행'으로만 요약(`permissionCoordinator.ts:146-151·281-287`)

---

## 📝 작업 내용

- [ ] **(a) permissionSummary plan 분기** — permissionCoordinator의 요약 로직에 ExitPlanMode 전용 분기 추가(`permissionCoordinator.ts:146-151`) → 'ExitPlanMode 실행'이 아니라 계획 요약을 표면화. plan 본문 payload는 **P03 probe ③ 캡처 실형상 기반 필드 사용**(설치본 선언은 allowedPrompts뿐, plan/planFilePath 미확인 — 실측 필드만)
- [ ] **(b) 계획 본문 마크다운 렌더** — plan 본문(probe ③ 확정 필드)을 기존 마크다운 렌더러(react-markdown+remark-gfm)로 렌더 → 사용자가 계획 전문을 읽고 판단. **계획 본문 미확보 시 UI fallback**(승인 카드에 '계획 본문을 가져올 수 없음' 상태) 정의
- [ ] **(c) '실행 승인 vs 계속 계획' 전용 카드** — 기존 인라인 권한 카드(BF3에서 모달→인라인 전환) 경로를 재사용해 plan 전용 액션(실행 승인 / 계속 계획) 배치. **신규 모달 발명 금지**
- [ ] **(d) TDD + 노출 지점** — 실패 테스트 선행(plan 분기·본문 렌더·승인/거부) + 단일챗·멀티패널 노출 지점 grep 전수

---

## ✅ 완료 조건

- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` Vitest 전체 green + TDD(실패 테스트 선행)
- [ ] `npm run lint` 0 problems
- [ ] ExitPlanMode 시 permissionSummary가 plan 분기로 요약(단정) · 계획 본문 마크다운 렌더(단정) · 실행 승인/계속 계획 액션 동작(단정)
- [ ] 영호 육안 병행 (ui-visual — 무인 commit X)
- [ ] reviewer 통과 (backend-contract = 무조건)

---

## 📚 학습 포인트

- **반쪽 기능의 완성** — 'plan 모드'는 permissionMode로 이미 있으나(편집 차단은 작동) 승인 UX가 없어 반쪽이었다. 기능의 가치는 워크플로우 전체가 닫힐 때 산다.
- **기존 경로 재사용 vs 신규 발명** — 이미 인라인 권한 카드 경로가 있는데 plan용 새 모달을 만들면 UX가 갈라진다. 기존 카드를 확장하는 게 일관성·비용 양쪽에서 낫다(memory: plan-before-scout — 기존 인프라 실측 후 설계).

---

## ⚠️ 함정

- **ui-visual = 사람 육안 병행** — 무인 commit X. 승인 카드 시각은 영호 판정.
- **신규 모달 발명 금지** — 기존 인라인 권한 카드(BF3 전환) 재사용. 새 모달은 UX 분기.
- **plan payload 출처** — P03 probe ③ 캡처 실형상 필드 사용(plan/planFilePath/allowedPrompts 중 실재분). 여기서 계약 추가 금지(필요 시 P03으로). 미확보 시 fallback 상태 필수.
- **P04~P06 claude-stream 직렬 레인과 조율** — permissionCoordinator 편집이 주라 claude-stream과 파일은 다르나, plan permission 이벤트가 P03/P04 신호와 얽힐 수 있어 후반 배치.

---

## 담당 SubAgent

coordinator 경유 — agent-backend Worker(permissionCoordinator plan 분기) + renderer Worker(계획 본문·승인 카드) + reviewer 무조건(backend-contract). ui-visual이라 영호 육안 병행.
