---
owner: 영호
milestone: LR1
phase: 03
title: resume 견고성 — session 이벤트 즉시 저장 · cwd 안정화
status: pending
grade: 복잡
risk: trust-boundary
loop_track: auto-gate
domain: cross
summary: resume 주경로가 조용히 실패하는 두 갈래를 닫는다 — ①done 전 종료 시 sessionId 유실(session 이벤트 즉시 저장) ②폴더 없는 단일채팅의 cwd 불안정(SDK resume이 세션을 cwd로 못 찾음). (held-open sessionKey 고아 갈래는 LR2로 이관 — 누수·held-open 라이프사이클.)
---

# Phase 03 — resume 견고성 (두 갈래 갭 봉합)

> **성격**: Phase 02 폴백이 "안전망"이라면, 이건 "주경로(resume)를 실제로 신뢰 가능하게" 만드는 수정. 두 갈래는 **독립 → 갈래별 개별 commit**.
> **범위 조정(plan-auditor)**: 원래 3갈래였으나 갈래②(sessionKey/held-open 고아)는 (a)맥락은 resume으로 보존되는 자원 누수(correctness 아님) (b)held-open 라이프사이클=LR2 도메인 (c)가치가 replMode 전환에 의존 → **LR2로 이관**. 여기 남은 둘은 현재 기본 모드에서 영호 시나리오 직결.

## 🎯 목표
resume이 있어야 할 때 확실히 작동하도록 두 갈래를 닫는다.

## ⏪ 사전 조건
- Phase 01 done. Phase 02와 **병렬 안전**(이 Phase는 `sdkOptions.ts`·`runtime.ts subscribeAgentEvents`를 건드리고 Phase 02의 `claudeAgentRun` prompt 빌더와 겹치지 않음 — plan-auditor 실측).

## 📝 작업 내용 (두 갈래 — 갈래별 commit)
### 갈래 A — session 이벤트 즉시 저장 (Codex #3)
- 현재 sessionId는 `done` 시점 saveConversation에만 저장(`runtime.ts:210`) → 턴이 중단(interrupt/앱 종료)되면 그 턴 sessionId 유실.
- **session 이벤트 수신 즉시 경량 metadata 저장**(sessionId만이라도) 추가. (`runtime.ts` subscribeAgentEvents / lifecycle handleSession 경로) — I/O 빈발 방지 위해 sessionId만·필요 시 디바운스.

### 갈래 B — cwd 안정화 (적대 검증 (C), `sdkOptions.ts:175`)
- 폴더 안 고른 단일채팅은 `cwd=process.cwd()`로 떨어지고, SDK resume은 세션을 **cwd 기준**으로 찾음 → 재시작 간 cwd 불일치 시 resume 실패.
- **단일채팅 cwd를 대화에 앵커(ADR-020 cwd 영속 활용)** 하거나 안정 기본값으로 재시작 간 일관성 확보. **trust-boundary: cwd는 경로 — resolveSafe/경로 방어 준수, renderer는 IPC만.**

## ✅ 완료 조건 (정량)
- 갈래 A: session 이벤트 후 done 전 종료를 모사해도 sessionId가 디스크에 남음(단위/통합 테스트).
- 갈래 B: 폴더 없는 단일채팅 재시작 간 cwd 동일함을 검증(테스트) + Phase 05 e2e(폴더없음 경로).
- 갈래별 개별 commit. typecheck·test green·lint 0 · **reviewer 통과**(trust-boundary — persistence/cwd path).

## 📚 학습 포인트
- 이벤트 소싱에서 "언제 영속하나"(즉시 vs 배치)의 트레이드오프.
- SDK resume이 cwd에 묶이는 이유(세션 트랜스크립트 저장 위치).

## ⚠️ 함정
- 갈래 A: session 이벤트마다 저장하면 I/O 빈발 → sessionId만·디바운스. 단 done 전 유실은 막아야.
- 갈래 B: cwd 변경은 ADR-020(cwd 앵커)과 정합 — 새 설계 말고 기존 영속 활용. 경로 방어 위반 금지.
- 두 갈래 독립 → 한 갈래 회귀가 다른 갈래 막지 않게 개별 commit·개별 검증.

## 담당 SubAgent
main-process(cwd·persistence) + renderer(저장 트리거) — cross. reviewer 무조건.
