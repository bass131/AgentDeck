---
owner: 영호
milestone: RMW1
phase: 01
title: 경합 재현 테스트 (TDD RED) — lost-update 3계열 결정론 재현
status: pending
grade: 보통
loop_track: auto-gate
estimated: 2h
domain: qa
---

# Phase 01: 경합 재현 테스트 (TDD RED) — lost-update 3계열 결정론 재현

> **상태**: pending
> **마일스톤**: RMW1-single-writer
> **등급**: 보통
> **담당**: qa

---

## 🎯 목표

`multi-agent.json` 분산 RMW의 lost-update가 **결정론적으로**(타이밍 운이 아니라 매번 같은 결과로) 재현되는 테스트 3계열이 존재하고, 현 구조에서 유실이 실측된다. 이 테스트들이 P03~P04 구현의 "done 판사"가 된다.

---

## ⏪ 사전 조건

- [ ] 없음 (마일스톤 첫 Phase — P02와 병렬 가능)
- [ ] 참고 선례: `99.Others/tests/renderer/bf3-p05-multipersist-restore-race.test.tsx` — deferred promise로 IPC 왕복 간극을 고정하는 기법

---

## 📝 작업 내용

> 테스트는 **공개 행동 경유**(store 액션·훅 public API)로 작성 — P04에서 내부 구현이 갈아엎어져도 테스트가 살아남게. IPC는 mock으로 대체하되, mock이 "디스크 상태"를 시뮬레이션(마지막 write가 남는 in-memory blob)해야 유실을 관측할 수 있다.

- [ ] (a) **autosave × 언마운트 flush**: 패널 A의 `performRmwSave` read가 pending인 동안 패널 B의 flush write 랜딩 → 최종 디스크 blob에 두 세션 변경이 모두 남는지 단언 (현 구조: 한쪽 유실)
- [ ] (b) **autosave × CRUD**: autosave read-pending 중 `newMultiSession`(또는 `deleteMultiSession`) write 랜딩 → 새 세션 존재 + autosave 스냅샷 모두 생존 단언
- [ ] (c) **CRUD 연쇄**: `selectMultiSession` 직후 `renameMultiSession` 인터리브 → rename 결과와 activeSessionId 변경 모두 생존 단언
- [ ] 3계열 모두 **`test.fails`로 표기** — "현 구조에서 실패함"을 CI green 상태로 박제. P04 완료 시 `.fails` 제거가 곧 GREEN 전환 증거
- [ ] 유실 관측 헬퍼(디스크 시뮬레이션 mock) 공용화 — 3계열 중복 방지

> **커버리지 노트**: ADR-031 실측 경합 4갈래 중 ④(다중 패널 저장 폭주)는 별도 계열을 두지 않는다 — `buildActiveSession`이 패널들을 한 스냅샷으로 집약하는 구조라 ④는 (a)의 writer-vs-writer 토폴로지에 포섭됨 (plan-auditor 축⑥ 확인). 후행 reviewer의 커버리지 오해 방지용 명기.

---

## ✅ 완료 조건

- [ ] 3계열 테스트가 `test.fails`로 전부 PASS (= 현 구조에서 유실이 재현됨을 CI가 증명)
- [ ] `.fails` 임시 제거 시 3계열 전부 FAIL하는 것을 로컬 확인(트랜스크립트에 출력 남김)
- [ ] `npm run typecheck` 0 errors / `npm run test` green / `npm run lint` 0 problems
- [ ] 앱 코드(`02.Source/**`) 변경 0줄 (qa는 테스트만)

---

## 📚 학습 포인트

- **결정론적 레이스 재현** — 레이스는 "가끔 터지는" 게 아니라 deferred promise로 인터리브 순서를 고정하면 매번 재현된다. 타이밍에 기대는 `setTimeout` 테스트는 flaky의 근원.
- **`test.fails`** — "이 테스트는 실패해야 정상"을 선언하는 Vitest 기능. 버그의 존재를 CI green으로 박제하고, 고쳐지는 순간 (fails인데 통과해서) 오히려 실패로 뒤집혀 알려준다.

---

## ⚠️ 함정

- 내부 함수(`performRmwSave` 등)를 직접 import해 테스트하면 P04 리팩토링 때 테스트가 통째로 죽는다 — 공개 행동 경유 원칙.
- mock이 "마지막 write 승리"를 시뮬레이션하지 않으면(예: write를 merge로 구현) 유실이 관측 안 된다 — mock은 현 `writeMulti`처럼 무조건 덮어써야 한다.

---

## 담당 SubAgent

qa (앱 코드 R only — 테스트만 작성)
