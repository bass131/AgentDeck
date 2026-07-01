---
owner: 영호
milestone: LR1
phase: 06
title: 통합 e2e + 문서 정합 + 회귀 게이트
status: pending
grade: 보통
loop_track: auto-gate
domain: qa
summary: resume 재시작·replMode 기본·loop GUI를 통합 e2e로 회귀 방어 + REPL_TRANSITION/FEATURE_MAP 문서를 "구현 완료"로 정합(영호 반영). 마일스톤 최종 회귀 게이트.
---

# Phase 06: 통합 e2e + 문서 정합 + 회귀 게이트

> **상태**: pending
> **마일스톤**: LR1
> **등급**: 보통 (e2e + 문서 — 통합 마감)
> **담당**: qa Worker (e2e) + 메인 세션(문서 초안 → 영호 반영)

---

## 🎯 목표

LR1이 구현한 것(resume 재시작 생존·replMode 기본 전환·loop GUI)을 **통합 e2e로 회귀 방어**하고, 관련 문서(REPL_TRANSITION·FEATURE_MAP)를 "구현 완료" 상태로 정합한다. 마일스톤 전체 회귀 게이트를 트랜스크립트에 남긴다.

---

## ⏪ 사전 조건

- [ ] Phase 02~05 완료 (resume 수정·기본값 전환·held-open 배선·loop GUI).

---

## 📝 작업 내용

- [ ] **통합 e2e** (`99.Others/tests/e2e/`):
  - resume across restart — 앱 재시작 후 이전 대화 맥락 유지 (Playwright `_electron`)
  - replMode 기본값 = resume 단발 동작
  - loop GUI 표시 (인디케이터·/goal 진행 카드)
  - 실LLM 비결정 구간은 **attended e2e 1회**(영호 감독), 결정적 UI/이벤트는 자동
- [ ] **문서 정합 (영호 반영)**:
  - `REPL_TRANSITION.md` 상태줄 → "구현 완료 + 기본값 재고 **구현 반영**(LR1)". §11 재고 절에 구현 완료 표기.
  - `FEATURE_MAP.md` — loop/resume 항목 상태 갱신.
  - **AI 초안 → 영호 단독 커밋**(헌법: docs=영호).
- [ ] **마일스톤 회귀 게이트** — 전체 typecheck+test+lint+build green을 트랜스크립트에 남김.

---

## ✅ 완료 조건

- [ ] 통합 e2e green (resume 재시작·replMode·loop GUI 각 1 PASS 이상)
- [ ] `npm run typecheck` 0 · `npm run test` green(전체) · `npm run lint` 0 · `npm run build` green
- [ ] `REPL_TRANSITION.md`·`FEATURE_MAP.md` 정합 초안 (영호 반영 대기)
- [ ] 마일스톤 -DONE.md 초안(복잡 이상 = 5단계 보고)

---

## 📚 학습 포인트

- **프로세스 재시작 e2e** — Playwright `_electron`으로 앱을 실제 껐다 켜서 디스크 영속이 진짜 작동하는지 검증(단위 mock으로 못 잡는 통합 버그).
- **결정적 vs 비결정 검증 분리** — UI/이벤트는 자동, 실LLM 응답은 비결정이라 attended 1회. 무인 e2e가 실LLM에 flaky한 이유.

---

## ⚠️ 함정

- **docs = 영호 단독** — REPL_TRANSITION·FEATURE_MAP은 AI가 초안만, 커밋은 영호(헌법 CRITICAL). 자율 커밋 금지.
- **e2e flaky** — 실LLM 비결정 e2e는 무인 반복 시 flaky(후속 백로그 renderer flaky 1건 참고). attended 1회 + 결정적 부분 자동으로 분리.
- **PR 게이트** — 마일스톤 전체 1 PR, push/PR/merge = 영호 게이트. Phase06 완료 ≠ 자동 push.

---

## 담당 SubAgent

**qa** Worker (e2e — `99.Others/tests/**` R/W) + **메인 세션** (문서 초안 → 영호 반영). docs 커밋은 영호 단독.
