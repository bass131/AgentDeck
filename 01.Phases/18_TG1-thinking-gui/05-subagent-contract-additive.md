---
owner: 영호
milestone: TG1
phase: 05
title: SubAgent 계약 additive 확장 (사고 토큰 · 훅 알림)
status: pending
grade: 복잡
risk: backend-contract
loop_track: auto-gate
estimated: 2~4h
domain: cross
---

# Phase 05: SubAgent 계약 additive 확장 (사고 토큰 · 훅 알림)

> **상태**: pending
> **마일스톤**: TG1
> **등급**: 복잡 (backend-contract → reviewer 무조건·모델 상향)
> **담당**: shared-ipc 주도 + agent-backend (coordinator 조율, reviewer 무조건)

---

## 🎯 목표

SubAgent 계약(agent-events.ts:287-300 기준 재실측)에 사고 estimatedTokens·훅 알림 필드를 **additive(옵셔널)**로 확장하고 어댑터→main 배선을 완성한다. GAP1 P16이 남긴 명시 보류(서브 훅 배지·토큰)의 뿌리를 해소한다. **기존 행동 불변.**

---

## ⏪ 사전 조건

- [ ] **P01 완료** — 좌표표(agent-events.ts:287-300 최신 라인·SubAgent 계약 형상)
- [ ] **P02~P04와 병렬 가능(독립)** — 서브 표면 합류는 P06

---

## 📝 작업 내용

- [ ] **(a) probe-first 채증** — SDK가 서브에이전트 사고 토큰(estimatedTokens)·훅 알림을 실제로 주는지 먼저 채증. 못 주면 "데이터 원천 부재"로 명시 보류 박제하고 renderer 몫은 우아한 부재 처리로 설계(조용한 드롭 금지).
- [ ] **(b) shared 계약 additive 필드 정의 (shared-ipc)** — SubAgent 계약에 사고 estimatedTokens·훅 알림 옵셔널 필드 추가. 기존 필드 의미 변경 금지(ADR-035 규율).
- [ ] **(c) 어댑터 매핑 (agent-backend)** — ClaudeCodeBackend eventNormalizer에서 서브에이전트 사고 토큰·훅 알림을 추출·매핑.
- [ ] **(d) main 경유 전달 확인** — main을 통해 필드가 renderer까지 전달되는지 확인.
- [ ] **(e) 골든·단위 테스트 + 양쪽 typecheck** — 골든 테스트로 정규화 형상 고정, main·renderer 양쪽 typecheck green(CORE-04).
- [ ] **(f) CHANGELOG 박제** — 계약 additive 확장을 CHANGELOG에 `[L]` 위험도로 박제(GAP1 P09 bg_task additive 선례 형식).
- [ ] **(g) 신뢰경계 불변식 보존** — SubAgentTranscriptItem의 'raw SDK 필드 0(신뢰경계)' 불변식(agent-events.ts:278 주석, CORE-01) 보존 — 어댑터에서 파생값만 매핑, 원시 SDK 필드(특히 훅 알림에 훅 실행 세부·권한 내부) 밀반입 금지.

---

## ✅ 완료 조건

- [ ] 옵셔널 필드만 추가(기존 소비처 diff 최소)
- [ ] `npm run typecheck` 양쪽(main+renderer) 0 errors
- [ ] `npm run test` green — 골든·단위 테스트 GREEN
- [ ] Codex stub 영향 0 (additive 설계 — 기존 어댑터 무영향)
- [ ] reviewer 통과 (backend-contract = 무조건, 모델 상향)

---

## 📚 학습 포인트

- **additive 계약 확장** — 기존 필드를 건드리지 않고 옵셔널 필드만 더하면 기존 소비처가 무접촉으로 살아남는다. 계약 진화의 안전한 형태(ADR-035).
- **probe-first** — SDK가 데이터를 실제로 주는지 먼저 확인하고 설계한다. 못 주는 데이터를 UI가 기대하면 조용한 빈칸이 생긴다 — 명시 보류로 정직하게 박제.

---

## ⚠️ 함정

- **additive 원칙 위반 금지** — 기존 필드 의미 변경 금지(ADR-035 규율).
- **데이터 원천 부재 시 정직하게** — SDK가 서브 사고 토큰을 못 주면 "데이터 원천 부재"로 명시 보류 박제 + renderer 몫은 우아한 부재 처리(조용한 드롭 금지).
- **CORE-04 양쪽 typecheck** — 계약 bump 후 main·renderer 양쪽 green 필수.
- **신뢰경계 밀반입 금지** — SubAgentTranscriptItem의 'raw SDK 필드 0(신뢰경계)' 불변식(agent-events.ts:278 주석, CORE-01)을 깨지 말 것. 어댑터에서 파생값만 매핑하고 원시 SDK 필드(특히 훅 알림에 훅 실행 세부·권한 내부)를 밀반입하지 않는다.

---

## 담당 SubAgent

coordinator 조율 — shared-ipc 주도(계약 additive 필드) + agent-backend(어댑터 매핑). reviewer 무조건(backend-contract, 모델 상향).
