---
owner: 영호
milestone: LR2
phase: 03
title: loop GUI — 인디케이터 통합 + /goal 진행 카드 + 팔레트 배선
status: pending
grade: 복잡
risk: ui-visual
loop_track: human-visual
domain: renderer
summary: /goal·/loop 빌트인 루프를 GUI로 시각화 — LoopRunningIndicator(SDK 크론)+LoopIndicator(앱 타이머) 통합/정리 + /goal 진행 카드(턴 카운트·목표 평가) 신규 + 슬래시 팔레트 연결.
---

# Phase 05: loop GUI — 인디케이터 통합 + /goal 진행 카드 + 팔레트 배선

> **상태**: pending
> **마일스톤**: LR1
> **등급**: 복잡 (renderer 시각 — ui-visual 깃발)
> **담당**: coordinator + renderer Worker (+ 영호 육안 트랙)

---

## 🎯 목표

이미 앱에 존재하는 두 루프 메커니즘(SDK 크론 `CronTracker`, 앱 타이머 `loopCommand`)을 **일관된 GUI로 시각화**한다. 앱이 루프 엔진을 새로 설계하지 않음(빌트인 활용) — 부가가치는 *시각화*(TUI 텍스트 로그를 압도):
- 두 인디케이터(`LoopRunningIndicator`←activeLoops / `LoopIndicator`←activeLoop) 통합·일관화.
- `/goal` 진행 카드 신규(진행 상태·턴 카운트·목표 평가 결과).
- 슬래시 팔레트에 `/goal`·`/loop` 노출.

---

## ⏪ 사전 조건

- [ ] Phase 03 — replMode 기본값 전환(인디케이터가 replMode 분기에 의존 — 상호배타 통합 시 새 기본값 기준).

---

## 📝 작업 내용

- [ ] **인디케이터 통합/정리** — `LoopRunningIndicator.tsx`(activeLoops, SDK 크론) + `LoopIndicator.tsx`(activeLoop, 앱 타이머) 관계 정리. 현재 replMode 분기로 상호배타 → 통합 시 동시 표시 회피 + 일관된 표현.
- [ ] **/goal 진행 카드 신규** — SDK 빌트인 /goal 자율 반복(num_turns 기반)의 진행을 카드로: 목표 텍스트·현재 턴/최대 턴·목표 평가(달성 여부) 시각화. `progressTrackers.ts`(CronTracker) 이벤트를 소스로.
- [ ] **슬래시 팔레트 배선** — `/goal`·`/loop`을 슬래시 팔레트(supportedCommands)에 노출. `/loop` 인터셉트(`loopCommand.ts` `isLoopCommand`) 경로와 정합.
- [ ] **UI.md 안티슬롭 준수** — 진행 카드 디자인이 Clay 에디토리얼 듀얼테마·radius 11px·serif 스펙 준수.

---

## ✅ 완료 조건

- [ ] 인디케이터가 일관 표시(중복/동시 표시 없음) — 단위 테스트로 상태 로직 검증
- [ ] `/goal` 진행 카드가 턴 카운트·목표 평가를 렌더 — 컴포넌트 테스트
- [ ] `/goal`·`/loop`이 슬래시 팔레트에 노출
- [ ] `npm run typecheck` 0 errors · `npm run test` green · `npm run lint` 0
- [ ] **[human-visual]** 영호 육안: 진행 카드 시각·안티슬롭(`00.Documents/UI.md`) 검토 — **ui-visual = 무인 commit X**(제안/스테이징까지, 영호 육안 후 commit)
- [ ] **[scope 경계 — plan-auditor 권고 A]** 이 Phase는 "**기존 loop 컴포넌트 통합 + /goal 진행 카드**"에 한정. **새 루프 엔진 자체구현·신규 Track2 UX 서피스는 범위 밖**(그 선을 넘으면 scope creep = 중단·보고). 빌트인 `/goal`·`/loop` 이벤트 시각화만.

---

## 📚 학습 포인트

- **SDK 빌트인 활용 vs 재발명** — /goal·/loop 엔진을 앱이 다시 만들지 않고, SDK가 주는 이벤트(크론·턴)를 *시각화만* 한다. "얇게 얹기"의 설계 이점(엔진 버그를 물려받지 않음).
- **상호배타 상태 통합** — replMode 분기로 갈리던 두 인디케이터를 하나의 표현으로 합칠 때, 상태 머신이 "둘 중 하나만 active"를 보장하는지가 핵심.

---

## ⚠️ 함정

- **동시 표시 회귀** — 통합 과정에서 두 인디케이터가 동시에 뜨는 상태를 만들지 않게(현재 replMode 분기가 막던 것).
- **ui-visual 무인 commit 금지** — 시각·미감은 자동 검증 불가(버킷 b). 기능은 구현·스테이징하되 commit은 영호 육안 후. throughput 위해 기능 진행은 멈추지 않음.
- **/goal SDK 거동 의존** — 진행 카드가 SDK가 주는 이벤트 형태에 의존. probe로 확인한 num_turns=3 자율 반복 이벤트 구조를 실측 기반으로.

---

## 담당 SubAgent

**coordinator** + **renderer** Worker (인디케이터·진행 카드·팔레트). 영호 육안 트랙 병행. Phase04와 병렬 가능(도메인 독립).
