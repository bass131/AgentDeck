---
owner: 영호
milestone: LR1
phase: 03
title: resume 견고성 — session 이벤트 즉시 저장 · cwd 안정화
status: done (갈래A 25072f7 유효=session즉시저장 | 갈래B-1 원복 bdf7853=폴더없는채팅 불가[컴포저 disabled]로 전제 실측기각·dead code | 갈래B-2 a41a06e 유지=resolveSafeCwd untrusted cwd검증. reviewer🟢·게이트green. LR1교훈이 folderless 전제 기각.)
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

## 🔎 실행 결과 (2026-07-02)
> LR1 교훈(`verify-fixes-empirically`) 재적용 — 단위테스트는 통과했으나 실측이 갈래 B 전제를 기각.

### 갈래 A — ✅ 유효 (real fix, 실측 확정)
- `subscribeAgentEvents`에 `session` 분기 추가 → 즉시 `saveConversation` (커밋 `25072f7`).
- **라이브 crash probe(`055fe81`, LIVE_SDK)**: 긴 카운트 턴 중 done 前 main SIGKILL → 재시작 시 sessionId(`c0d5fb81…`)가 crash 前 이미 디스크에 저장·생존, 대화 복원 확인. 갈래 A 없으면 그 턴 전체(user msg 포함) 증발.
- reviewer 🟢(trust-boundary) · 단위 2 green.

### 갈래 B — 전제 실측 기각
- **폴더없는 단일채팅은 존재 불가**: `Composer`가 `workspaceRoot===null`이면 textarea `disabled`("프로젝트 폴더를 먼저 열어주세요"). AgentDeck은 폴더를 열어야만 채팅 → "폴더없는 cwd" 시나리오 자체가 없음.
- **B-1(loadConversation cwd 복원)**: `loadConversation`은 live 호출부 0(dead code). startup 복원은 `selectConversation`이 담당하며 ADR-020으로 **이미 cwd 복원**(갈래 B 이전부터). → B-1은 불가능 시나리오용 dead code 수정 → **원복(`bdf7853`)** + 관련 테스트 삭제.
- **B-2(`resolveSafeCwd`, `a41a06e`)**: folderless와 무관하게 "untrusted renderer가 준 cwd를 main이 검증(isAbsolute+existsSync+isDirectory, 무효 시 process.cwd() 폴백)"은 trust-boundary 방어로 유효 → **유지**. 단위 3 green.

### 순수 산출
갈래 A(session 즉시저장) + B-2(cwd 검증). 폴더없는 cwd 버그는 비-버그(재현 불가)로 종결.
