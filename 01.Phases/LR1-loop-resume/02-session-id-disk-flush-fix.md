---
owner: 영호
milestone: LR1
phase: 02
title: session_id 디스크 영속 flush 수정 (resume 정확화)
status: pending
grade: 복잡
risk: irreversible-conditional
loop_track: auto-gate
domain: cross
summary: session_id snapshot이 신뢰성 있게 디스크에 flush되고 재시작 후 복원되도록 수정 → Phase01 RED 테스트를 green으로. resume 경로의 정확성 확보.
---

# Phase 02: session_id 디스크 영속 flush 수정 (resume 정확화)

> **상태**: pending
> **마일스톤**: LR1
> **등급**: 복잡 (2 도메인: renderer panelSession + main persistence)
> **담당**: coordinator + main-process(+renderer) Worker

---

## 🎯 목표

Phase01이 확정한 원인(후보 ① flush 타이밍)을 고쳐, session_id snapshot이 **재시작 후에도 디스크에서 복원**되게 한다. resume 경로(`resumeSessionId` → `sdkOptions.ts:189`)가 유효한 session_id를 항상 받도록 정확화. Phase01의 RED 테스트가 green이 된다.

---

## ⏪ 사전 조건

- [ ] Phase 01 — 원인 확정 (`_resume-bug-diagnosis.md`). 원인이 후보 ②(held-open resume 미배선)뿐이면 이 Phase는 **검증 전용으로 축소**(수정 코드 최소)되고 Phase04가 본체가 됨 → 진단 결과로 범위 조정. **⚠️ "축소 ≠ skip"** — flush 신뢰성은 resume-기본값(Phase03)이 재시작 생존하는 *임계경로*라, 원인 귀속과 무관하게 flush 작동 확인은 반드시 남는다(plan-auditor 권고 C).
- [ ] Phase 01 RED 테스트 존재.

---

## 📝 작업 내용

- [ ] **flush 트리거 수정** — `panelSession.ts:256`(`snapshotForPersist`)의 sessionId가 SDK session_id 확정 직후 디스크에 write되게 배선. 저장 경로가 renderer→main IPC→JSON persistence임을 정합.
- [ ] **복원 경로 검증** — `panelSession.ts:218`(`makePanelInitialState`)가 재시작 시 디스크 snapshot에서 sessionId를 실제로 읽어 초기 상태에 넣는지.
- [ ] **send() 주입 정합** — `panelSession.ts:509` `resumeSessionId: opts?.resumeSessionId ?? stateRef.current.sessionId` — 복원된 sessionId가 첫 send에 실려 resume되는지.
- [ ] **과도 write 방지** — 매 토큰/이벤트마다 flush 금지. sessionId *확정 시점 1회* 또는 debounce.
- [ ] **테스트 갱신** — `persistent-session.test.ts` / `resume-session.test.ts` 기대값을 정확화.

---

## ✅ 완료 조건

- [ ] Phase01 RED 테스트 **green** (재시작 후 session_id 복원 + resume)
- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` green (resume/persistent 관련 테스트 전부 PASS, 회귀 0)
- [ ] `npm run lint` 0 problems
- [ ] 디스크 write가 sessionId 확정 시점에 1회(또는 debounce) — 과도 write 없음

---

## 📚 학습 포인트

- **write-through vs write-back** — 상태 변경 즉시 디스크 반영(write-through)이면 재시작에 강하지만 잦은 I/O. 버퍼링(write-back)은 빠르지만 종료 시 유실 위험. session_id 같은 "잃으면 치명적, 자주 안 변함" 데이터는 확정 시 즉시 flush가 정석.
- **renderer↔main 영속 경계** — panelSession(renderer)은 window.api(IPC)로만 디스크에 쓸 수 있다(신뢰 경계). flush가 실제로 main까지 도달하는지가 관건.

---

## ⚠️ 함정

- **JSON 영속 스키마 변경 = human-gate** — sessionId 필드는 이미 snapshot 스키마에 존재(panelSession:256)하므로 대개 flush *타이밍*만 고침 = auto-gate. 만약 스키마 필드 추가/구조 변경이 필요하면 → **버킷 (c) human-gate로 상향**, 영호 GO 대기 + 마이그레이션 고려.
- **신뢰 경계** — renderer에서 직접 fs 접근 X. 반드시 IPC 경유(헌법 CRITICAL).
- **부분 수정** — 원인이 ①②양쪽이면 이 Phase는 ①만, ②는 Phase04. 양쪽을 한 Phase에 섞지 말 것(도메인 분리).

---

## 담당 SubAgent

**coordinator** + **main-process** Worker (persistence·IPC flush) + **renderer** Worker (panelSession snapshot 트리거). 2 도메인 = coordinator 분해. reviewer 조건부(영속 경로 변경 ≥10줄).
