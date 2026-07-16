---
owner: 영호
milestone: TG1
phase: 04
title: 한 줄 상태 라인 (심볼 · 동사 순환 · 경과 초 · 토큰)
status: pending
grade: 복잡
risk: ui-visual
loop_track: human-visual
estimated: 2~4h
domain: renderer
---

# Phase 04: 한 줄 상태 라인 (심볼 · 동사 순환 · 경과 초 · 토큰)

> **상태**: pending
> **마일스톤**: TG1
> **등급**: 복잡 (ui-visual → reviewer 무조건·human-visual)
> **담당**: renderer (+reviewer)

---

## 🎯 목표

흩어진 사고 신호를 한 줄로 통합한다 — **"✻ 궁리하는 중… (12s · ↑ 3.4k tokens)"**. 심볼 애니메이션 + 유희적 동사 순환 + 경과 초 + 실시간 토큰이 한 줄에 함께 들어가고, 답변이 시작되면 상태 라인이 소멸하며 같은 블록 안에서 답변으로 전이한다.

---

## ⏪ 사전 조건

- [ ] **P02 완료** — 경과 초 데이터(사고 시작 timestamp·경과 파생)
- [ ] **P03 완료** — 턴 블록 구조(상태 라인이 얹힐 자리)

---

## 📝 작업 내용

- [ ] **(a) 상태 라인 컴포넌트** — ✻ 회전/맥동 애니메이션 + WORKING_PHRASES(:138-154 기준 재실측) 동사 순환 재사용 + 경과 초(P02) + estimatedTokens 실시간(↑ 3.4k tokens 형태). **TDD RED-first 표적 = 경과 초/토큰 포맷터 순수 함수 실패 테스트 선행**(CORE-05).
- [ ] **(b) 소멸/전이 배선** — 사고 종료 시 사고 전문 접힘 + 상태 라인 소멸 → 같은 블록에서 답변 본문 전이(별개 블록 교대가 아니라 한 블록 내부 전이).
- [ ] **(c) prefers-reduced-motion 존중** — 신규 애니메이션(✻ 회전/맥동) 한정으로 접근성 존중. (기존 SmoothMarkdown 애니메이션 접근성 건은 백로그 별도 — 이번 범위 밖.)

---

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 · `npm run test` green · `npm run lint` 0
- [ ] 라이브에서 4요소(심볼·동사·경과 초·토큰)가 한 줄로 표시 · 답변 시작 시 소멸 실측
- [ ] 시각검증 컷 채증(dark/light) — 육안은 사람 트랙 병행(무인 commit X)
- [ ] reviewer 통과 (복잡 — 무조건)

---

## 📚 학습 포인트

- **리렌더 격리** — 1초마다 경과 초를 갱신하려고 스레드 전체를 리렌더하면 성능이 무너진다. 자주 바뀌는 값은 로컬 state로 격리해 리렌더 범위를 최소화한다.
- **기존 자산 재사용** — WORKING_PHRASES(동사 순환)·estimatedTokens(토큰)는 이미 있다. 새로 만들지 말고 재사용한다.

---

## ⚠️ 함정

- **경과 초 인터벌의 리렌더 폭발** — 1초 인터벌로 경과 초를 돌릴 때 스레드 전체 리렌더를 유발하면 안 된다. 상태 라인 로컬 state로 격리.
- **토큰 이중 집계 금지** — 토큰 카운트는 P16 estimatedTokens 자산 재사용. 새 집계 파이프라인을 만들어 이중 집계하지 않는다.
- **ui-visual = 사람 육안 병행** — 무인 commit X.

---

## 담당 SubAgent

renderer 주도(상태 라인 컴포넌트·소멸/전이 배선). reviewer 무조건. 영호 육안 병행.
