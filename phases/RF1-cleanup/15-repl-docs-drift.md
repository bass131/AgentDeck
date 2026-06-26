---
owner: 영호
milestone: RF1
phase: 15
title: REPL docs 드리프트 정정 (미구현 → 구현완료·기본활성)
status: pending
risk: harness
loop_track: human-gate
estimated: 1h
domain: cross
summary: CLAUDE.md 문서지도·REPL_TRANSITION.md가 REPL을 "미구현"이라 거짓 기술 → 실측(구현완료·replMode=true 기본활성)에 맞춰 정정. 헌법/docs=영호 단독, 초안만.
---

# Phase 15: REPL docs 드리프트 정정

> **상태**: pending
> **마일스톤**: RF1-cleanup (트랙 A · 위생 — 독립, 조기 실행 가능)
> **등급**: 보통 (헌법 1줄 + 설계문서 status — harness 깃발로 human-gate)
> **담당**: 메인 직접 (초안) → **영호 확정** (CLAUDE.md=헌법·docs=사용자 단독)

---

## 🎯 목표

Phase 02 실측 중 발견한 docs 드리프트를 정정한다: **CLAUDE.md 문서지도와 `REPL_TRANSITION.md`가 REPL을 "미구현 — 사용자 게이트 대기"로 적었지만, 실제 코드는 구현 완료 + 기본 활성**(`appStore.ts:576 replMode:true`). 문서가 거짓말하면 다음 세션이 "REPL 아직 안 됐네" 오판 → 옛 결정 기반 작업 사고.

---

## ⏪ 사전 조건

- [ ] 없음 (독립 — Phase 02 실측 결과가 입력. 트랙 A와 함께 조기 실행 가능)

---

## 📝 작업 내용 (전부 영호 확정 — docs/헌법)

- [ ] **CLAUDE.md 문서지도 1줄 정정** (초안):
  - 현재: `- docs/REPL_TRANSITION.md — 지속 세션(REPL) 전환 설계 검토 (미구현 — 사용자 게이트 대기)`
  - 초안: `- docs/REPL_TRANSITION.md — 지속 세션(REPL) 전환 (구현 완료·기본 활성 replMode=true, ADR-024 §10.3 단계표 / watchdog auto-revive(4b)만 드롭)`
- [ ] **REPL_TRANSITION.md status 정합**: 문서 내부 불일치 해소 — 초기 섹션의 "미구현/게이트 대기" 프레이밍 vs §10.3 구현표(0~5 ✅, 4b 드롭)가 충돌. 상단에 "**상태: 구현 완료(기본 활성). 본 문서는 설계 근거 기록**" 헤더 + 옛 "제안" 표현 정정.
- [ ] **교차 점검**: `docs/ADR.md`(ADR-024 현황 라인)·`docs/FEATURE_MAP.md`에 REPL 상태가 "미구현/진행중"으로 남았으면 함께 정합.
- [ ] (선택) memory도 점검 — REPL "미구현 게이트 대기" 잔존 시 갱신.

---

## ✅ 완료 조건

- [ ] CLAUDE.md 문서지도가 실제 구현 상태(구현완료·기본활성)와 정합
- [ ] `REPL_TRANSITION.md` 내부 불일치 0 (status 단일)
- [ ] ADR/FEATURE_MAP에 REPL 상태 모순 0
- [ ] `.claude/CHANGELOG.md` [M] 한 줄 (docs 드리프트 정정)
- [ ] **영호 확정** (헌법/docs 변경 = human-gate)

---

## 📚 학습 포인트

- **docs 드리프트의 비용** — 코드는 진실, 문서는 거짓이 되는 순간 문서는 "함정"이 됨. 특히 헌법(CLAUDE.md)이 거짓이면 매 세션 오판.
- **실측이 드러낸 정리 대상** — "프로브 삭제" 작업이 더 큰 docs 정합 문제를 발굴. 정리는 종종 더 깊은 정리를 부른다.

---

## ⚠️ 함정

- CLAUDE.md=헌법, docs=사용자 단독 통제. AI가 *확정*하면 위반. **초안 제시까지만**.
- "구현 완료"라 단정 전 — replMode 기본값·persistent 배선을 한 번 더 실측 확인(이미 `appStore.ts:576`·`:881` 확인됨).
- REPL_TRANSITION.md는 *설계 근거*라 통째 삭제 X — status만 정정, 근거 기록은 보존.

---

## 담당 SubAgent

> 메인 직접 (docs 초안) → 영호 확정. (헌법/docs = 위임 X, 사용자 단독)
