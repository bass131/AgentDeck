---
owner: 영호
milestone: TG1
phase: 02
title: 사고 경과 시간 데이터 토대 (store)
status: pending
grade: 보통
loop_track: auto-gate
estimated: 1~2h
domain: renderer
---

# Phase 02: 사고 경과 시간 데이터 토대 (store)

> **상태**: pending
> **마일스톤**: TG1
> **등급**: 보통
> **담당**: renderer (+qa는 테스트 리뷰)

---

## 🎯 목표

한 줄 상태 라인의 "경과 초"에 필요한 신규 데이터를 store에 만든다. 브리프 실측: 현재 사고 시작 timestamp를 store가 보유하지 않는다. 사고 시작 시각을 기록하고 경과를 계산하는 데이터 토대가 생긴다(렌더는 P04 몫).

---

## ⏪ 사전 조건

- [ ] **P01 완료** — 좌표표(`text.ts` handleThinking/handleThinkingDelta/handleText 리셋 지점 최신 라인)

---

## 📝 작업 내용

- [ ] **(a) TDD RED 선행 (Vitest)** — 실패 테스트 먼저: ① 사고 시작 시 timestamp가 기록되는지 ② 새 턴에서 시작점이 리셋되는지 ③ 경과 초가 시작 timestamp로부터 올바르게 계산되는지.
- [ ] **(b) store 시작 timestamp 기록** — `text.ts` handleThinking(:139-179 기준 재실측 좌표)에 사고 시작 timestamp를 기록. 턴 단위 리셋 규칙 포함 — handleText(:115) 리셋 지점과 정합.
- [ ] **(c) 경과 초 파생 셀렉터** — 시작 timestamp로부터 경과 초를 파생하는 셀렉터/헬퍼(렌더는 P04). Date.now()를 주입 가능하게 설계(테스트 가능성).
- [ ] **(d) estimatedTokens 수명 정합** — 기존 estimatedTokens 런닝 토탈(handleThinkingDelta :192-223)과 **동일 수명**으로 정합(같은 시점에 시작·리셋).

---

## ✅ 완료 조건

- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` green — 신규 Vitest N케이스 GREEN(시작 기록·리셋·경과 계산)
- [ ] `npm run lint` 0 problems
- [ ] UI 변경 0 (데이터 토대만 — 렌더는 P04)

---

## 📚 학습 포인트

- **시간 의존의 주입 가능화** — `Date.now()`를 코드 곳곳에서 직접 호출하면 시각이 흘러 테스트가 결정론적이지 못하다. 시간 소스를 주입 가능한 인자/의존으로 빼면 테스트가 시각을 고정할 수 있다.
- **수명 정합** — 경과 초와 토큰 카운트가 서로 다른 시점에 시작·리셋되면 한 줄 상태 라인이 어긋난다. 같은 사고 블록의 두 신호는 같은 수명을 공유해야 한다.

---

## ⚠️ 함정

- **Date.now() 흩뿌리기 금지** — 렌더 경로에 직접 호출을 흩뿌리면 테스트가 불가능해진다. 주입 가능하게.
- **멀티 사고 블록 리셋 규칙** — 한 턴에서 사고가 여러 번(멀티 사고 블록) 일어날 때 시작점 리셋 규칙을 명확히. handleText(:115) 리셋 정합을 따른다.

---

## 담당 SubAgent

renderer (store `text.ts`·파생 셀렉터). qa는 신규 테스트 리뷰.
