---
owner: 영호
milestone: RF1
phase: 12
title: appStore.ts + reducer.ts 슬라이스 분해
status: done
grade: 대규모
loop_track: auto-gate
estimated: 4h
domain: renderer
summary: 1642줄 appStore + 959줄 reducer를 도메인 슬라이스(대화/워크스페이스/에이전트/UI)로 분해
---

# Phase 12: appStore.ts + reducer.ts 슬라이스 분해

> **상태**: pending
> **마일스톤**: RF1-cleanup (트랙 C · 리팩토링)
> **등급**: 대규모 (1642+959 = 2601줄)
> **담당**: renderer

---

## 🎯 목표

`src/renderer/src/store/appStore.ts`(1642줄)와 `reducer.ts`(959줄)를 **도메인 슬라이스**(대화·워크스페이스·에이전트 세션·UI 상태 등)로 분해한다. 단방향 데이터 흐름(IPC 이벤트→store→리렌더) 불변.

---

## ⏪ 사전 조건

- [ ] 트랙 A 완료 권장
- [ ] (독립) — store는 components 밖이라 트랙 B와 무관

---

## 📝 작업 내용

- [ ] 현 store 상태 트리를 도메인 경계로 식별 (대화/워크스페이스/세션/UI/diff …)
- [ ] Zustand 슬라이스 패턴으로 분리 (`createConversationSlice` 등) 또는 도메인별 store 파일
- [ ] `reducer.ts`의 액션도 도메인별 분리 (slice와 정렬)
- [ ] 셀렉터·구독 지점 import 갱신
- [ ] 슬라이스 간 교차 의존(파생 상태)은 명시적으로 (숨은 결합 제거)

---

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 errors · `npm run test` green
- [ ] 앱 실행 — 대화 스트리밍·세션 전환·diff·멀티워크스페이스 상태 동작 불변
- [ ] 각 슬라이스 파일 ≤ ~400줄
- [ ] store 구독 컴포넌트 리렌더 거동 불변 (불필요 리렌더 신규 발생 X)

---

## 📚 학습 포인트

- **Zustand 슬라이스 패턴** — 큰 store를 도메인 슬라이스로 쪼개 합성. 상태도 모듈화.
- **파생 상태(derived state)** — 슬라이스 경계를 넘는 계산은 셀렉터로 명시. 숨은 결합이 분해를 어렵게 함.

---

## ⚠️ 함정

- 슬라이스 분리 중 구독 셀렉터 의미 변경 → 리렌더 폭증/누락 (성능·버그). 거동 불변 확인.
- 액션 분산하다 상태 갱신 순서 의존 깨짐 → 레이스. 순서 의존 명시.

---

## 담당 SubAgent

> renderer (src/renderer/** R/W).
