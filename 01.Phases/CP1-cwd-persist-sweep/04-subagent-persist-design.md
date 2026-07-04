---
owner: 영호
milestone: CP1
phase: 04
title: 서브에이전트 영속 스키마 설계 (영호 GO)
status: done
grade: 보통
risk: shared-contract
loop_track: human-gate
estimated: 1~3h
domain: shared-ipc
summary: 서브에이전트/도구 이력 영속의 additive 스키마 설계 + 영호 GO — 구현(P05)의 입력.
---

# Phase 04: 서브에이전트 영속 스키마 설계 (영호 GO)

> **상태**: done
> **마일스톤**: CP1
> **등급**: 보통
> **담당**: shared-ipc

---

## 🎯 목표

서브에이전트/도구 이력을 대화 레코드에 영속하기 위한 additive 스키마를 설계하고 영호 GO를 받는다. 산출물은 P05 구현의 입력 — 설계 노트 + shared 타입 초안.

> **설계 대상 한정(옵션 B — Supervisor 결정 2026-07-04)**: CP1의 서브에이전트 영속은 **`ConversationRecord`(단일챗)만** 대상으로 한다. 멀티패널(`PanelThreadSnapshot`) 서브에이전트 영속은 CP1 범위 밖 — 후속 마일스톤으로 명시 이관(plan-auditor 🔴1 봉합: P04/P05 멀티패널 스키마 비대칭 회피).

---

## ⏪ 사전 조건

- [ ] 없음 — 웨이브 1 병렬 착수 가능 (설계 노트 산출).

---

## 📝 작업 내용 (설계 노트 산출물)

- [ ] **① 저장 범위** — 서브에이전트 카드 메타 + transcript? 도구 이력은 포함? 원본 AgentCodeGUI 거동과 대조.
- [ ] **② ConversationRecord additive 필드안** — 예: `subagents?: PersistedSubAgent[]` — 기존 `kind==='msg'` 필터 철학(`conversationPayload.ts:39-42`)과 공존하는 방식. `PersistedSubAgent` 필드에 `SubAgentInfo.displayName`(P07 additive 예정 — 표시명) 포함을 명시.
- [ ] **③ 버전 전략** — 레코드 `version` 필드 신설 vs graceful optional. 마이그 불요한 additive 권장(기존 레코드는 subagents 부재로 graceful 로드).
- [ ] **④ S9b stale 봉합 설계** — 복원 시 `loadConversation`이 subagents를 미클리어하는 stale 문제 동반 봉합 설계.
- [ ] 산출물 = 설계 노트 + shared 타입 초안 → **영호 GO 대기(버킷 c — JSON 영속 스키마)**.

---

## ✅ 완료 조건

- [x] 설계 노트 완성 (저장범위·필드안·버전전략·stale봉합 4항 결정)
- [x] shared 타입 초안은 P05가 설계 재작업 없이 착수 가능한 **필드 레벨 확정**(필드명·타입·optionality)까지 제시
- [x] plan 정합 (마일스톤 계획과 모순 없음)
- [x] **영호 GO** — 버킷 c(JSON 영속 스키마) 사람 게이트 통과. loop_track: human-gate.

영호 GO 완료(설계 승인·transcript 포함), P05 구현 리뷰 🟢(atomic 커밋 대기).

---

## 📚 학습 포인트

- **설계를 코드보다 먼저** — JSON 영속 스키마는 비가역(마이그 부담)이므로 구현 전 사람 게이트(버킷 c)를 둔다. additive 설계로 마이그를 회피하는 게 핵심 판단.
- **표시용 복원 vs 재주입** — UI 이력 복원은 화면 재현이 목적이지 SDK 재주입이 아니다. 맥락 연속성은 별개 메커니즘(sessionId resume)이 담당.

---

## ⚠️ 함정

- **ADR-024(REPL) 철학과 충돌 금지** — 맥락 연속성은 sessionId resume 담당. UI 이력 복원은 **표시용이지 SDK 재주입용이 아님**을 명문화.
- 필수 버전 필드 신설은 기존 레코드를 깰 수 있음 — graceful optional(additive) 권장.
- **`PanelThreadSnapshot`(멀티패널)은 CP1 범위 밖** — 후속 마일스톤 이관(옵션 B). 이번 설계에 멀티패널 스키마를 끌어들이지 말 것(🔴1 비대칭 회피).

---

## 담당 SubAgent

shared-ipc
