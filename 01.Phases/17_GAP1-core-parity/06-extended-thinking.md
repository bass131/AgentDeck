---
owner: 영호
milestone: GAP1
phase: 06
title: 확장 사고 전문 표시 — 접이식 블록 + thinking_delta 라이브 스트리밍
status: done
grade: 복잡 (보통 + backend-contract·ui-visual 깃발)
risk: backend-contract·ui-visual
loop_track: human-visual
estimated: 2~5h
domain: cross
summary: 현재 90자 oneLine 요약(claude-stream.ts:252) + thinking_delta 전량 드롭(claude-stream.ts:578) → 접이식 사고 전문 블록 + 라이브 증분 스트리밍(I-01·S-09). stale 헤더 주석 #5 교정(S-19 일부). 계약 타입은 P03 선정의분 사용.
---

# Phase 06: 확장 사고 전문 표시

> **상태**: done — 사고 전문 접이식(메인 전문/서브에이전트 90cap 분기)·thinking_delta 2경로 라이브 스트리밍·주석 #5 교정. 게이트 green(typecheck0·lint0·Vitest 4876pass)·reviewer 통과(위반0·🟡3 비차단). ui-visual 육안 = 영호 트랙(dogfood 일괄)
> **마일스톤**: GAP1
> **등급**: 복잡 (자동 상향: 보통 + backend-contract·ui-visual → reviewer 무조건·human-visual)
> **담당**: cross (agent-backend + renderer) + reviewer

---

## 🎯 목표

high/max effort로 돌리는 대가인 확장 사고(reasoning) 전문을 볼 수 있게 한다. 끝나면: 90자 요약만 남던 사고가 접이식 전문 블록으로 열람 가능하고, 사고가 진행되는 동안 thinking_delta로 라이브 증분이 스트리밍된다. 지금은 긴 사고 중 화면이 정적이라 '멈춘 듯' 보인다.

---

## ⏪ 사전 조건

- [ ] **P03 완료** — thinking_delta·thinking_tokens 타입이 `02.Source/shared`에 정의됨
- [ ] 근거 = GAP1 감사 I-01(interaction)·S-09(sdk-events, 3중 dedupe)·S-19 일부(stale 주석)
- [ ] 현행: 사고 블록 oneLine(thinking, 90) 요약(`claude-stream.ts:252`) · thinking_delta 명시적 `[]`(`claude-stream.ts:578`) · ThinkingItem은 '생각 중' 상태 표시뿐(`Conversation.tsx:215-233`)

---

## 📝 작업 내용

- [ ] **(a) 사고 전문 접이식 블록 (I-01)** — 현재 90자 oneLine 요약만 남기는 경로(`claude-stream.ts:252`)를 전문 보존으로 전환 → 접이식 블록(접힘 기본·펼침 전문). ThinkingItem을 상태 표시에서 전문 뷰어로 확장
- [ ] **(b) thinking_delta 라이브 스트리밍 (S-09)** — 현재 `claude-stream.ts:578`에서 명시적 `[]`로 드롭 → thinking_delta 증분을 소비해 사고 진행 중 라이브 증분 표시. thinking_tokens(estimated_tokens)로 토큰 진행 표시(선택)
- [ ] **(c) stale 헤더 주석 교정 (S-19 일부)** — `claude-stream.ts:54-56` 주석 #5가 'includePartialMessages=false이므로 yield 없음'이라 기술하나 실제 `sdkOptions.ts:232`는 true(stale) → 주석 교정(후속 작업자가 stream_event를 '안 흐른다'고 오판하지 않게)
- [ ] **(d) 성능** — 사고 전문은 길다 → 접힘 기본 + 긴 블록 가상화/lazy 렌더 주의
- [ ] **(e) TDD** — 전문 보존·delta 소비 실패 테스트 선행

---

## ✅ 완료 조건

- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` Vitest 전체 green + TDD(실패 테스트 선행)
- [ ] `npm run lint` 0 problems
- [ ] 사고 전문 접이식 렌더(단정) · thinking_delta 라이브 증분 소비(단정) · 주석 #5가 실제 옵션(true)과 정합
- [ ] 전문 표시는 **SDK가 방출한 reasoning 전문에 한정** — redacted-thinking 구간은 텍스트 대신 추정 토큰만 올 수 있음(sdk.d.ts:4261). 미제공 시 thinking_tokens 진행 표시 fallback
- [ ] 영호 육안 병행 (ui-visual — 무인 commit X, 긴 사고 블록 성능 육안 확인)
- [ ] reviewer 통과 (backend-contract = 무조건)

---

## 📚 학습 포인트

- **추론 추적의 학습 가치** — '왜 그 결론에 도달했는지'를 볼 수 있으면 디버깅·학습이 열린다. 학부생 학습 맥락에서 확장 사고 전문은 특히 손실이 큰 지점(감사 I-01 근거).
- **증분 스트리밍(delta)** — 완성본을 한 번에 주는 대신 증분(delta)을 이어붙이면 라이브 진행이 보인다. 정적 화면이 '멈춤'으로 오인되는 걸 막는 최신 UX.
- **긴 컨텐츠 성능** — 접힘 기본 + 가상화는 긴 텍스트 블록이 렌더 성능을 깎지 않게 하는 표준 기법.

---

## ⚠️ 함정

- **ui-visual = 사람 육안 병행** — 무인 commit X. 사고 블록 접힘/펼침·성능은 영호 육안.
- **사고 전문 길이** — 접힘 기본 필수. 안 하면 긴 사고가 대화를 밀어낸다. 가상화/성능 주의.
- **P04~P06 claude-stream 직렬** — 셋 다 claude-stream 편집. 순차(P05 뒤).

---

## 담당 SubAgent

coordinator 경유 — agent-backend Worker(claude-stream 사고 전문·delta 배선·주석 교정) + renderer Worker(접이식 블록·라이브 렌더) + reviewer 무조건(backend-contract). ui-visual이라 영호 육안 병행.
