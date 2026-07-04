---
owner: 영호
milestone: CP1
phase: 05
title: 서브에이전트 영속 구현
status: pending
grade: 복잡
risk: shared-contract
loop_track: auto-gate
estimated: 2~5h
domain: cross
---

# Phase 05: 서브에이전트 영속 구현

> **상태**: pending
> **마일스톤**: CP1
> **등급**: 복잡 (coordinator 분해 — shared→main→renderer)
> **담당**: cross

---

## 🎯 목표

P04 승인 스키마를 구현한다 — payload builder 확장, main 저장, 복원 매핑, stale 클리어까지. 저장→재로드 라운드트립에서 서브에이전트 카드/배지/모델이 동일하게 재현된다.

---

## ⏪ 사전 조건

- [ ] **P04 영호 GO** — 서브에이전트 영속 스키마 설계 승인 (버킷 c 통과).

---

## 📝 작업 내용 (coordinator 분해: shared→main→renderer)

- [ ] **shared** — P04 타입 확정(`subagents?: PersistedSubAgent[]` 등).
- [ ] **main** — `conversationPayload` builder에 서브에이전트 포함 (기존 `kind==='msg'` 필터와 공존).
- [ ] **renderer/복원** — `loadConversation`(단일챗)에서 카드 재구성(배지·상세 재현). panelSession restore는 대상 아님(멀티패널 영속 = 범위 밖).
- [ ] **stale 클리어(S9b)** — 세션 전환 시 이전 subagents 클리어.
- [ ] 라운드트립 테스트 — 저장 → 재로드 → 카드/배지/모델 동일.

---

## ✅ 완료 조건

- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` green (라운드트립 저장→재로드 동일 PASS)
- [ ] `npm run lint` 0 problems
- [ ] reviewer 필수 (shared-contract) CRITICAL 0 — 어댑터 무수정(backend-contract 무관, 감사 🟡6)
- [ ] 기존 레코드(subagents 부재) graceful 로드 확인

---

## 📚 학습 포인트

- **라운드트립 테스트** — 직렬화(serialization, 객체를 저장 형식으로 변환) → 역직렬화 후 원본과 동일한지 확인하면 영속 계층의 정합을 정량 검증할 수 있다.
- **cross 도메인 분해** — shared 타입을 먼저 확정해야 main·renderer가 같은 계약 위에서 병렬 진행 가능. coordinator가 순서를 강제.

---

## ⚠️ 함정

- **대용량 transcript 저장 크기** — 축약 정책이 필요하면 설계(P04)로 회귀 보고.
- **기존 레코드 graceful 로드** — subagents 필드 부재 레코드가 로드 시 깨지지 않아야 함(P04 additive 전략의 실증).
- **멀티패널 서브에이전트 영속은 범위 밖(이관)** — `panelSession restore`에 subagents 복원을 끼워넣지 말 것(옵션 B — 후속 마일스톤). CP1은 단일챗 `loadConversation`만.
- Worker→Worker 직접 호출 금지 — coordinator 경유 escalate.

---

## 담당 SubAgent

cross (coordinator 분해 — shared-ipc → main-process → renderer)
