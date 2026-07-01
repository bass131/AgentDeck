---
owner: 영호
milestone: LR1
phase: 05
title: 통합 e2e + 문서 정합 + 회귀 게이트
status: pending
grade: 보통
loop_track: auto-gate
domain: qa
summary: 단일채팅 재시작-resume·transcript 폴백·폴더없는 경로를 통합 e2e로 회귀 방어 + 원인 서술을 "저장경로 sessionId drop + 폴백 부재"로 정정(REPL_TRANSITION·ADR-024·FEATURE_MAP, 영호 반영). 마일스톤 최종 회귀 게이트.
---

# Phase 05 — 통합 e2e + 문서 정합 + 회귀 게이트

> **성격**: LR1(대화 기억 신뢰성)의 마감. 실제 사용자 시나리오를 e2e로 고정하고, 오진이었던 원인 서술을 문서에서 정정.

## 🎯 목표
LR1이 구현한 것(sessionId 저장·transcript 폴백·견고성)을 **통합 e2e로 회귀 방어**하고, 관련 문서의 원인 서술을 실제 확정 원인으로 정정한다. 회귀 게이트를 트랜스크립트에 남긴다.

## ⏪ 사전 조건
- Phase 02(폴백)·03(견고성) 완료. Phase 04(배지) 육안 GO(있으면).

## 📝 작업 내용
- **통합 e2e** (`99.Others/tests/e2e/`, LIVE_SDK 게이트):
  - 단일채팅 재시작-회상 (이미 `lr1-singlechat-sessionid.e2e.ts` — Phase 01 산출, **워크스페이스 선택 버전** 유지).
  - **NEW: transcript 폴백** — sessionId 없는 대화(폴백 경로) 로드 후 후속 질문에서 이전 맥락 회상.
  - **NEW: 폴더 없는 단일채팅** 재시작-resume (적대 검증 (C) 갭 — Phase 03 cwd 안정화 검증).
  - **NEW: 멀티패널 resume 회귀** — Phase 02 폴백이 `_runPump`·`_runPersistentPump` **공용 헬퍼**를 건드려 멀티패널 경로도 영향(plan-auditor 지적). 멀티패널 재시작-회상 회귀 0 고정.
  - 실LLM 비결정 구간은 **attended 1회**(영호 감독), 결정적 prompt-구성은 단위로.

> **known-gap (문서 1줄 남길 것, plan-auditor)**: resume이 "성공했으나 빈 세션"(session 만료·손상)인 경우, 폴백 트리거(sessionId 유무)상 폴백이 **발동 안 하고** 배지도 **안 뜬다** → 조용한 기억상실 잔존. ADR-029 §미해결로 이연(cwd 안정화로 우선 방어). 즉 **"sessionId 있음 ≠ 맥락 실제 복원"** — 이 한계를 문서에 명시.
- **문서 정정 (영호 반영 — docs=영호 단독)**:
  - `REPL_TRANSITION.md`·`ADR-024`: 원인 서술 "held-open 증발" → **"단일채팅 CONVERSATION_SAVE sessionId drop + transcript 폴백 부재"**로 정정. ADR-029 상호참조.
  - `FEATURE_MAP.md`: resume/기억 항목 상태 갱신.
  - **AI 초안 → 영호 단독 커밋**.
- **마일스톤 회귀 게이트**: 전체 typecheck+test+lint+build green을 트랜스크립트에 남김.

## ✅ 완료 조건 (정량)
- 통합 e2e green (단일채팅 재시작·폴백·폴더없는 경로 각 1 PASS 이상 — LIVE_SDK).
- `npm run typecheck` 0 · `npm run test` green · `npm run lint` 0 · `npm run build` green.
- 문서 정정 초안 (영호 반영 대기).
- 마일스톤 -DONE.md 초안(복잡 이상 = 5단계 보고).

## 📚 학습 포인트
- **프로세스 재시작 e2e** — Playwright `_electron`으로 실제 껐다 켜 디스크 영속·resume·폴백을 검증(단위 mock으로 못 잡는 통합 버그).
- **문서 드리프트 정정** — 오진 인과를 기록에 남기지 않기(미래 작업자 혼란 방지).

## ⚠️ 함정
- **docs = 영호 단독** — REPL_TRANSITION·ADR·FEATURE_MAP은 AI 초안만, 커밋은 영호(헌법 CRITICAL).
- **e2e flaky** — 실LLM 비결정 e2e는 무인 반복 시 flaky. attended 1회 + 결정적 부분 단위로 분리.
- **PR 게이트** — 마일스톤 전체 1 PR, push/PR/merge = 영호 게이트.

## 담당 SubAgent
**qa** Worker (e2e) + **메인 세션** (문서 초안 → 영호 반영). docs 커밋은 영호 단독.
