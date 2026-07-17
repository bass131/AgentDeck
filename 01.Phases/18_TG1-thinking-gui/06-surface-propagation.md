---
owner: 영호
milestone: TG1
phase: 06
title: 표면 전파 — 멀티패널 · 서브에이전트
status: done
grade: 복잡
risk: ui-visual
loop_track: human-visual
estimated: 2~4h
domain: renderer
---

# Phase 06: 표면 전파 — 멀티패널 · 서브에이전트

> **상태**: done
> **마일스톤**: TG1
> **등급**: 복잡 (ui-visual → reviewer 무조건·human-visual)
> **담당**: renderer (+reviewer)

---

## 🎯 목표

턴 블록 통합·상태 라인·아바타를 나머지 표면 2종에 빠짐없이 반영한다 — 멀티패널(PanelView.tsx 자체 루프 :490-577)·서브에이전트(SubAgentChatStream.tsx, +P05 데이터로 서브 토큰 카운트·서브 훅 배지 = P16 보류 해소). 노출 지점 전수 열거 교훈(배지 3번째 지점 누락) 준수.

---

## ⏪ 사전 조건

- [x] **P03 완료** — 단일챗 턴 블록·아바타
- [x] **P04 완료** — 단일챗 상태 라인
- [x] **P05 완료** — SubAgent 계약 additive 확장(또는 "데이터 원천 부재" 판정)

---

## 📝 작업 내용

- [x] **(a) 멀티패널 적용** — PanelView 자체 루프(:490-577)에 턴 블록·상태 라인·아바타 적용. 공유 리프 자동 전파분과 자체 루프 별도 적용분을 구분.
- [x] **(b) 서브에이전트 연속성** — SubAgentChatStream 사고 표시(.saf-msg--thinking :156-164)를 상태 라인화.
- [x] **(c) 서브에이전트 P05 필드 소비** — P05가 확장한 계약 필드(토큰·훅 배지) 소비. **P05가 "데이터 원천 부재" 판정이면** 해당 항목은 우아한 부재 처리 + 명시 보류 박제(조용한 드롭 금지).
- [x] **(d) 영향 테스트 정합** — 표면별 셀렉터 변경에 영향 테스트 동반 수정(P01 census 기반).

---

## ✅ 완료 조건

- [x] `npm run typecheck` 0 · `npm run test` green · `npm run lint` 0
- [x] 표면 3종(단일챗·멀티패널·서브에이전트) 동등 렌더 실측
- [x] 시각검증 컷 채증(dark/light) — 육안은 사람 트랙 병행(무인 commit X)
- [x] reviewer 통과 (복잡 — 무조건)

---

## 📚 학습 포인트

- **공유 리프에 넣으면 표면이 공짜로 는다** — MessageBubble 같은 공유 컴포넌트에 넣으면 여러 표면이 자동 전파된다. 하지만 자체 루프를 가진 컨테이너(PanelView)는 별도 적용이 필요하다 — 공유분과 개별분을 구분해야 누락이 없다.
- **계약 종속 표면** — 서브 표면은 P05 계약 확장 결과에 종속. 데이터가 없으면 우아한 부재로 정직하게.

---

## ⚠️ 함정

- **PanelView 이중 경로 누락** — PanelView는 Conversation 리프 재사용 + 자체 루프가 혼재한다. 한쪽만 고치면 누락이 생긴다.
- **서브 표면 조건부** — 서브 표면은 계약 종속(P05 결과에 조건부). P05가 부재 판정이면 해당 항목은 우아한 부재 처리 + 명시 보류 박제.
- **노출 지점 전수 열거** — 배지 3번째 지점 누락 교훈(ui-rollout-surface-enumeration).
- **ui-visual = 사람 육안 병행** — 무인 commit X.

---

## 담당 SubAgent

renderer 주도(PanelView 자체 루프·SubAgentChatStream). reviewer 무조건. 영호 육안 병행.

---

## ✅ 완료 기록 (2026-07-16)

**표면 3종 동형화** — 단일챗·멀티패널·서브에이전트를 턴 블록·상태 라인·아바타로 정렬.

- **① MessageBubble 공유 리프 — 아바타 Claude Spark 교체**: 엔진 분기 `isClaudeEngineAvatar`·`IconClaude` 폴백 보존·신규 bare prop 하위호환. 한 곳 교체로 패널·서브에 자동 전파.
- **② PanelView 자체 루프 → 턴 블록**: flat 루프를 `groupIntoTurnBlocks` 턴 블록 렌더로 대체(`turn-block-ava` 헤더 1개·bare 렌더로 아바타 이중노출 해소·`WorkingIndicator`→`StatusLine`·`panelHookBadges` 보존·`panelContinuation` 구조적 대체).
- **③ SubAgentChatStream — 정적 ✻ 심볼**: 전용 `.saf-status-symbol`. 완료 기록이라 라이브 틱 미채택(거짓 신호 회피). **P05 우아한 부재 명시**(서브 토큰·훅 배지 — SDK 귀속 채널 부재 주석 링크).

**reviewer**: 🔴 0 · 🟡 3 — ① 주석 stale 후속 해소 ② 엔진-아바타 이중 소스 → 백로그(Codex 배선 시 prop 주입 수렴) ③ 서브 표면 PNG 외관 변화 → 육안 트랙.

**게이트**: `typecheck` 0 · `test` 5246 pass(신규 18 단언) · `lint` 0 · 옵트인 shot 4/4(재베이스라인 불요·재생성 PNG 원복 완료).

**이월**: 컷 채증 P07 이월. 커밋 해시 = pin 참조.
