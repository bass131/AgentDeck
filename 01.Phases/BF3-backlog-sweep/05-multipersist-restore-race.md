---
owner: 영호
milestone: BF3
phase: 05
title: useMultiPersist 복원 레이스 수리 — 신규 세션의 타 세션 스냅샷 상속 차단
status: pending
grade: 보통
loop_track: auto-gate
estimated: 1~3h
domain: renderer
summary: LR3-P07 범위 밖 발견 — 마운트 복원 폴백(activeSessionId)이 신규 세션에서 타 세션의 언마운트-플러시 저장과 경합해 엉뚱한 스냅샷을 상속하는 레이스를 수리 (백로그 중 유일한 실질 버그)
---

# Phase 05: useMultiPersist 복원 레이스 수리

> **상태**: pending / **마일스톤**: BF3 / **등급**: 보통 / **담당**: renderer

## 🎯 목표

멀티패널에서 아직 한 번도 디스크에 저장되지 않은 신규 세션이 마운트 복원 시 **다른 세션의 스냅샷을 상속하지 않는다**. 백로그 6건 중 유일하게 사용자 데이터가 오염될 수 있는 실질 버그 — 마일스톤의 본체.

## ⏪ 사전 조건

- [ ] 없음 (renderer 도메인 — Phase 01~04와 완전 독립, 병렬 가능)
- [ ] 배경: `01.Phases/LR3-loop-ux/07-multipanel-continuity-DONE.md` §범위 밖 발견 필독

## 📝 작업 내용

- [ ] **레이스 재현 테스트(RED) 선행**: `02.Source/renderer/src/hooks/useMultiPersist.ts` 마운트 복원 effect — 자기 세션 id가 디스크에 없을 때 `res.state.activeSessionId` 폴백이, 다른 세션의 언마운트-플러시 저장과 경합하는 순서를 결정론적으로 재현 (LR3-P07 테스트가 "디스크 사전시딩"으로 우회했던 바로 그 지점 — 이번엔 우회 없이 정면 재현).
- [ ] 폴백 조건 강화(설계 후보, Worker 재량): ⓐ 신규 세션(저장 이력 0)은 폴백 자체를 금지하고 빈 상태로 시작 ⓑ 폴백 대상이 "자기 세션"임을 id 대조로 검증 후에만 상속 ⓒ 복원 effect에 세대(epoch) 토큰을 둬 늦게 도착한 응답 폐기 — **"엉뚱한 세션 데이터는 절대 상속 금지"가 불변조건**, 수단은 실측 후 결정.
- [ ] 정당한 폴백 시나리오(기존 세션의 최초 마운트 복원 등)가 있는지 실측 — 있다면 그 경로는 보존, 없다면 폴백 제거가 최선.
- [ ] LR3-P07 재현 테스트의 디스크 사전시딩 우회를 제거해도 GREEN인지 확인 (우회 정리).

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 / `npm run test` green / `npm run lint` 0
- [ ] 레이스 재현 테스트 RED→GREEN **git stash 실측**(구코드 실패 확인 — LR3-P07 교훈 3)
- [ ] 신규 세션 마운트 시 타 세션 스냅샷 상속 0 (단언)
- [ ] 기존 멀티패널 테스트(`multi-concurrent`·`multi-isolation-guard`·`lr3-p07-*`) 회귀 0

## 📚 학습 포인트

- **폴백의 위험성**: "없으면 이거라도"는 편의지만, 폴백 대상이 *남의 것*일 수 있으면 데이터 오염 벡터가 된다. 폴백엔 항상 소유권 검증이 붙어야 한다.
- **레이스 재현 테스트 작성법**: 실시간 대기 없이 promise 해소 순서를 테스트가 쥐고 흔드는(deferred 패턴) 결정론적 재현.

## ⚠️ 함정

- mock IPC의 해제 시맨틱을 실제와 일치시킬 것 — LR3-P07 교훈 1(스파이는 "콜백이 죽는다"를 흉내 못 내 착시 GREEN).
- 폴백 제거가 단일→멀티 전환 직후의 정당한 복원을 깨는지 확인 — `panelSession.ts`(별도 상태계)와의 경계 인지.
- renderer Worker는 main 영속 코드(`04_persistence/**`) R only — 수리는 renderer 훅 쪽에서.

## 담당 SubAgent

renderer Worker 1개. 실질 변경 ≥10줄 예상 → reviewer 조건부 호출.
