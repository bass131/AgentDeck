---
owner: 영호
milestone: GAP1
phase: 04
title: 턴 신뢰성 신호 배선 — session_state_changed · api_retry · compact · resume 가드
status: done
grade: 복잡 (보통 + backend-contract 깃발)
risk: backend-contract
loop_track: auto-gate
estimated: 2~5h
domain: cross
summary: claude-stream이 드롭하는 턴 신뢰성 신호 배선 — (1) session_state_changed 권위 턴 종료(S-05), (2) api_retry 재시도 인디케이터(S-02), (3) compact_boundary+compacting 상태(S-01), (4) resume replay isReplay 중복 가드(S-13). 계약 타입은 P03 선정의분 사용.
---

# Phase 04: 턴 신뢰성 신호 배선

> **상태**: done (session_state 권위 이양(P04b)·api_retry·compact 분리·isReplay 가드 — 실 SDK 순서 회귀 reviewer 실측·2차 봉합, 게이트 green·reviewer PASS 🔴0🟡0)
> **마일스톤**: GAP1
> **등급**: 복잡 (자동 상향: 보통 + backend-contract → reviewer 무조건·모델 상향)
> **담당**: cross (agent-backend + renderer) + reviewer

---

## 🎯 목표

턴 경계·재시도·컴팩션·resume를 추론이 아니라 권위 신호로 판정하게 만든다. 끝나면: 턴 종료가 pendingSends 휴리스틱이 아니라 SDK 권위 신호로 확정되고, API 과부하 재시도가 '앱 멈춤'이 아니라 '재시도 중(2/5)'로 보이고, 자동 컴팩 경계가 마커로 남고, resume 시 중복 tool_result 오염이 사라진다.

---

## ⏪ 사전 조건

- [ ] **P03 완료** — session_state_changed·api_retry·compact_boundary/compacting 타입이 `02.Source/shared`에 정의됨
- [ ] 근거 = GAP1 감사 S-05·S-02·S-01·S-13
- [ ] 기존 idle 판정 경로 확인: `claudeAgentRun.ts:767-778`(pendingSends 카운터) · lr4-p01·loopStatus·BL1 P03 staleWatchdog

---

## 📝 작업 내용

- [ ] **(a) 상태 전이표 작성 (책임 분해)** — pendingSends가 겸하는 책임을 분해: **SDK 실행 상태 / 로컬 입력 큐 직렬화 / turn origin(user·cron) / 자율 루프 / background liveness**. `session_state_changed`는 **SDK 실행 상태에만** 권위 신호로 사용, 나머지 책임은 존치. 방출 조건은 **P03 probe ② 결과 따름**, 미수신 환경 fallback = 기존 휴리스틱 유지
- [ ] **(b) session_state_changed 권위 신호 (S-05)** — 현재 system '그 외' 분기(`claude-stream.ts:554-555`)에서 드롭, idle/턴 경계를 pendingSends 직렬화 카운터(`claudeAgentRun.ts:767-778`)로 휴리스틱 추론 중 → 권위 신호(state idle/running/requires_action)를 **SDK 실행 상태의 단일 진실로 승격**(위 (a) 전이표 범위 내), 방출 미수신 시 기존 휴리스틱 fallback
- [ ] **(c) api_retry 인디케이터 (S-02)** — system '그 외'에서 드롭 중 → SDKAPIRetryMessage(attempt·max_retries·retry_delay_ms) 소비 → '과부하로 재시도 중(N/M)' 인디케이터. 재시도 대기 동안 UI 무이벤트 → '앱 멈춤' 오인 제거
- [ ] **(d) compact 경계·상태 (S-01)** — compact_boundary(trigger·pre/post_tokens) 경계 마커 1개 + **requesting(API 요청 상태)과 compacting(압축 상태)을 별개 상태로 분리** 소비(sdk.d.ts:4128). `/compact` 슬래시는 이미 SDK 전달되나 경계·진행 표시 부재였음
- [ ] **(e) resume isReplay 가드 (S-13)** — case 'user'가 isReplay 가드 없이 mapUserContent로 흘려(`claude-stream.ts:501-508`) replay된 tool_result가 중복 이벤트로 재방출 → isReplay=true면 재방출 억제(트랜스크립트 오염 실동작 버그 수정)
- [ ] **(f) TDD** — 각 신호 실패 테스트 선행 + **requesting/compacting 별개 상태 + null clear 해제 테스트 포함(sdk.d.ts:4128)** + lr4 계열 회귀 스위트 green 재확인

---

## ✅ 완료 조건

- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` Vitest 전체 green + TDD(실패 테스트 선행) — **lr4-p01·loopStatus·BL1 P03 계열 회귀 0**
- [ ] `npm run lint` 0 problems
- [ ] 권위 신호 승격 후 턴 종료 판정이 SDK 실행 상태 신호 기반(단정) · session_state_changed 미수신 환경 fallback 유지(단정) · api_retry 소비(단정) · compact 경계 마커 + requesting/compacting 별개 상태·null clear 해제(단정) · resume replay 중복 tool_result 미방출(단정)
- [ ] reviewer 통과 (backend-contract = 무조건)

---

## 📚 학습 포인트

- **권위 신호 vs 휴리스틱 추론** — 시스템이 확정 신호(session_state_changed)를 주는데도 자체 카운터로 추론하면, 추론 오차가 곧 오판(interrupt-stuck·loop 멈춤)이 된다. 권위 소스가 있으면 그걸 단일 진실로 승격하는 게 정석.
- **이중 판정 충돌** — 새 권위 신호를 기존 휴리스틱과 병존시키면 두 판정이 어긋날 때 더 나빠질 수 있다. 승격은 "기존 것을 대체"까지 가야 하며, 기존 테스트가 그 대체를 지켜본다.
- **replay 멱등성** — resume가 과거 메시지를 다시 흘릴 때(isReplay), 소비측이 멱등하지 않으면 중복이 쌓인다. 가드 플래그로 재방출을 억제하는 게 정합성의 기본.

---

## ⚠️ 함정

- **최대 함정 = 이중 idle 판정 충돌** — lr4-p01·loopStatus·BL1 P03 staleWatchdog와 정합 필수. 권위 신호를 단일 진실로 올리되 기존 lr4 계열 테스트 회귀 0.
- **P04~P06 claude-stream 직렬** — 셋 다 claude-stream을 편집. 병렬 강행 시 머지 충돌. 순차 진행.
- **backend-contract 경로** — AgentEvent 계약은 P03 선정의분만 사용, 여기서 새 타입 추가하지 않음(추가 필요 시 P03로 되돌림).

---

## 담당 SubAgent

coordinator 경유 — agent-backend Worker(claude-stream·claudeAgentRun 배선) + renderer Worker(인디케이터·마커 렌더) + reviewer 무조건(backend-contract).
