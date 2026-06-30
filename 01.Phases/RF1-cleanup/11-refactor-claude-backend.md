---
owner: 영호
milestone: RF1
phase: 11
title: ClaudeCodeBackend.ts 책임 분리
status: pending
grade: 대규모
risk: backend-contract
loop_track: auto-gate
estimated: 5h
domain: agent-backend
summary: 2472줄 ClaudeCodeBackend를 스트림파싱/이벤트정규화/생명주기로 책임 분리 (AgentBackend 계약·AgentEvent 출력 불변)
---

# Phase 11: ClaudeCodeBackend.ts 책임 분리

> **상태**: pending
> **마일스톤**: RF1-cleanup (트랙 C · 리팩토링)
> **등급**: 대규모 (2472줄 · backend-contract)
> **담당**: agent-backend — **reviewer 무조건** (backend-contract)

---

## 🎯 목표

`src/main/agents/ClaudeCodeBackend.ts`(2472줄, 최대 파일)를 책임 축으로 분리한다:
- **SDK 호출·생명주기** (query() 핸들·abort)
- **스트림 파싱** (claude-stream JSON → 중간 표현)
- **이벤트 정규화** (→ 공통 `AgentEvent`)

`AgentBackend` 인터페이스 구현·`AgentEvent` 출력은 **계약 불변** (골든 테스트로 증명).

---

## ⏪ 사전 조건

- [ ] 트랙 A 완료 권장
- [ ] **Phase 07 — src/main 번호접두 이동** (결함2): 07이 `src/main/agents/`를 rename → 11은 그 *이후*에 내부 분해 (import 1회 갱신). 07 전 착수 시 double churn.

---

## 📝 작업 내용 (TDD — 골든 테스트 먼저)

- [ ] 기존 어댑터 골든 테스트 확인/보강 (입력 스트림 → 기대 AgentEvent 시퀀스 고정)
- [ ] 책임별 모듈 분리: `streamParser.ts`·`eventNormalizer.ts`·`lifecycle.ts` (또는 유사)
- [ ] `ClaudeCodeBackend.ts`는 *오케스트레이터*로 슬림화 (조립 + AgentBackend 구현)
- [ ] Task/subagent·tool_call·parentToolId 정규화 로직 (B4 기능) 보존
- [ ] 신뢰 경계: spawn/SDK 호출은 main 단독 — 분리해도 경계 불변

---

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 errors · `npm run test` green
- [ ] **어댑터 골든 테스트 PASS** (AgentEvent 시퀀스 정확히 동일 = 거동 불변 증명)
- [ ] 라이브 smoke — 실 claude run 1회 스트리밍·도구·abort 정상
- [ ] 각 모듈 ≤ ~500줄
- [ ] **reviewer GO** (backend-contract — 전 어댑터 영향 + ADR-003 추상화 점검)

---

## 📚 학습 포인트

- **단일책임원칙(SRP)** — "파싱"과 "정규화"와 "생명주기"는 변하는 이유가 다르다 → 다른 모듈.
- **골든 테스트** — 입력→출력을 통째 고정해두면, 리팩토링이 출력을 바꿨는지 즉시 발각 (거동 불변의 자물쇠).

---

## ⚠️ 함정

- 정규화 미묘 변경 → AgentEvent 시퀀스 달라짐 → UI·영속 깨짐. 골든 테스트가 방어.
- ADR-003: 호출부는 구체 엔진 모름 — 분리하다 엔진 고유 타입이 인터페이스로 누출 주의.
- 가장 큰 파일 = 가장 위험. Opus Worker 권장 (대규모 + backend-contract).

---

## 담당 SubAgent

> agent-backend (src/main/agents/** R/W, Opus 권장) → reviewer 무조건 (backend-contract).
