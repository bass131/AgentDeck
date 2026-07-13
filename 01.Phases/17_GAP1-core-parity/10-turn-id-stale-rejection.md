---
owner: 영호
milestone: GAP1
phase: 10
title: turn-id 상관자 — stale session_state 완전 역전 결정론 기각
status: done
grade: 복잡 (보통 + backend-contract 깃발 자동 상향)
risk: backend-contract
loop_track: auto-gate
estimated: 1~2h
domain: cross
summary: P04 잔여 — session_state에 턴 상관자(turnId) 부여로 "새 턴 running 후 이전 턴의 늦은 idle"(완전 역전)을 결정론 기각. 지속 펌프의 turn 경계(신규 프롬프트 dispatch)마다 단조 카운터 증가, 정규화 시 현재 turn id 스탬프, 소비 게이트는 불일치 기각. shared는 optional 필드 additive(ADR-035, 버전 bump 아님). 실행 순서 = P04 직후·P05 전(claude-stream 직렬). 영호 편입 결정 2026-07-14. [종결 2026-07-14: misfire 부재 실측 — turnId 철회·봉쇄 회귀 잠금 대체, 부재 중 결정 ③′]
---

# Phase 10: turn-id 상관자 — stale session_state 기각

> **상태**: done — 종결 후 정정(2026-07-14): 부재 증명은 사용자 턴 조합 한정으로 성립. 자율 턴 조합(A done의 B pending 탈취)은 Codex 교차 검증이 반증·qa 실측 5/5 확인 → 봉합은 P11(send-token 턴 귀속 회계)로 편입. 회귀 잠금 테스트는 유효 유지.
> **마일스톤**: GAP1
> **등급**: 복잡 (보통 + backend-contract → reviewer 무조건)
> **담당**: coordinator 경유 — agent-backend 중심 + shared 1필드 + qa
> **실행 순서**: 번호는 10이지만 **P04 직후·P05 전 직렬 편입** (P05·P06과 claude-stream·claudeAgentRun 동일 파일 직렬 제약)

---

## 🧾 실측 결론 (2026-07-14 종결 — 이 섹션이 아래 원 명세를 대체한다)

- **발견**: 본 Phase가 잡으려던 완전 역전 misfire(새 턴 running 후 이전 턴 늦은 idle의 idle-close 오발동)는 **현행 배선에서 실재하지 않는다** — Worker 2 + reviewer 3자 독립 실측 일치.
- **실효 가드**: `push()`의 `_pendingSends++`(claudeAgentRun.ts:520)가 신규 dispatch 시 idle-close를 봉쇄. `_cancelIdleGrace()`(542)·pump 흡수취소(1013)는 defense-in-depth 중복(mutation 프로브로 판별력 실측: 520 무력화 = RED, 542 무력화 = GREEN).
- **결정 ③′** (영호 부재 중 Supervisor 대행 — 사후 확인 대상): turnId 배선 전면 철회(shared 필드·어댑터 스탬프·기각 게이트 잔재 0, 비가역 0) + 봉쇄 메커니즘 회귀 잠금으로 목표 재충족. ①(실효화)은 실재하지 않는 버그를 위해 정당 거동을 우회하는 회귀 위험, ②(방어 계약 잔존)는 소비처 0 필드의 죽은 무게라 기각.
- **산출물**: `99.Others/tests/agents/gap1-p10-dispatch-grace-cancel-lock.test.ts` — 봉쇄 가드 회귀 잠금(판별력 mutation 실증 완료). gap1-p04b 9종은 우회 없이 원형 GREEN.
- **재도입 조건**: 향후 실제 misfire 경로가 실측되면 turnId는 optional additive로 재도입 가능(ADR-035, 버전 bump 없음).
- **교훈**: ① Worker가 테스트 통과를 위해 계약 필드를 비열거로 숨긴 false-green을 reviewer가 적발 — 게이트 수치는 우회 여부까지 검증해야 정본. ② 방어 계약을 설계하기 전에 "그 공격 경로가 실재하는가"를 현행 배선에서 먼저 실측할 것(plan-auditor GO도 misfire 실재를 전제로 했었음).
- **정정(2026-07-14, Codex 교차 검증)**: 위 "부재" 판정은 *사용자 턴끼리의 조합*에서만 성립한다. 자율(cron-origin) 턴 A가 실행 중 사용자 턴 B가 push되는 조합에서는 A의 done이 turnOrigin 재계산(:1030) 탓에 B의 pending을 탈취(1→0)해 봉쇄가 조기 해제되고, running_B→stale idle_A가 grace를 예약해 실행 중 세션이 조기 종료됨이 실측됐다(qa repro 5/5 예측 일치). 근본 봉합 = P11. 교훈: 내부 3자 일치도 같은 픽스처 전제를 공유하면 공동 맹점 — 외부 엔진 교차 검증이 적발.

---

## 🎯 목표

session_state 신호에 턴 상관자(turnId)를 부여해, P04b가 원리적으로 못 풀었던 완전 역전 — "새 턴 B의 running 이후 이전 턴 A의 늦은 idle 도착" — 을 결정론적으로 기각한다. 끝나면: 완전 역전 fixture에서 stale idle이 idle-close를 트리거하지 못한다(현재는 latest-wins가 그 idle을 최신으로 오인할 수 있음).

---

## ⏪ 사전 조건

- [x] P04 완료(d9eed92) — 권위 이양(idle 신호 트리거)·latest-wins·안전 교집합·gap1-p04b 테스트 9종
- [x] reviewer 분리 정당 판정 + 영호 편입 결정(2026-07-14)
- [ ] P05 미착수 상태에서 실행(동일 파일 직렬)

---

## 📝 작업 내용 (원 명세 — 실측 결론으로 대체됨)

- [ ] **(a) repro 선행(TDD)** — 완전 역전 fixture(결정론 스펙): fake timer로 ① 턴 A dispatch(카운터=N) → running/done_A → **늦은 idle_A 도착(어댑터 스탬프=N)** → grace 예약 ② **턴 B dispatch(카운터=N+1)** — B의 첫 메시지 도착 *전* 침묵 구간 유지(**grace 창 내 중간 메시지 0** — continuation-흡수 취소 `claudeAgentRun.ts:1013`이 먼저 발화하면 turnId 기각이 아예 안 불려 판별력 0) ③ grace 만료 → idle-close **미발동** 단정(스탬프 N < 현재 N+1 = stale 기각). 현행 코드 RED 확인이 출발점. 스탬프는 어댑터 정규화 시점의 현재 turn 카운터가 산출해야 하며 **테스트가 손으로 박은 트리비얼 스탬프 금지**(false-green 차단)
- [ ] **(b) shared additive** — `AgentEventSessionState`에 optional `turnId?` 추가(ADR-035 additive-only — 필수화 금지, 기존 소비자 영향 0, 버전 bump 아님)
- [ ] **(c) 카운터 발급·스탬프** — 카운터는 지속 펌프의 **turn 경계에서 증가**(신규 프롬프트 dispatch 시점). **`backend.start`/run 시작 기준 절대 아님** — persistent run 하나가 여러 turn을 감싸므로 run 기준이면 전 turn이 동일 id를 공유해 이 Phase가 no-op이 된다. 정규화기는 session_state 도착 시 현재 열린 turn의 id로 스탬프
- [ ] **(d) 소비 게이트 기각(단조 술어)** — 판정부(grace 만료 재검증·idle-close 트리거)는 idle 관찰의 turnId가 **현재 발급된 최대 turnId와 같을 때만** 유효, **낮으면 stale 기각** — exact-mismatch가 아니라 monotonic-less-than. turnId 부재 신호 = 기존 거동 유지(하위 호환 fallback). 기존 3트리거·멱등 가드 유지
- [ ] **(e) 회귀** — gap1-p04b 기존 9종 불변 + 신규 완전 역전 케이스 green

---

## ✅ 완료 조건 (원 명세 — 실측 결론으로 대체됨)

- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run lint` 0 problems
- [ ] `npm run test` 전체 green — 신규 완전 역전 테스트 RED→GREEN + 기존(gap1-p04b 9종 포함) 회귀 0
- [ ] reviewer 통과 (backend-contract = 무조건)
- [ ] reviewer 실측 확인: fixture가 실제 완전 역전(dispatch_B 이후 stale idle_A의 grace 만료)을 재현하고, turnId 스탬프가 originating turn을 반영해 기각이 발화됨 (false-green 차단 정성 게이트)

---

## 📚 학습 포인트

- **상관자(correlation ID) 패턴** — 비동기 신호를 요청/턴에 짝지어 stale 응답을 기각하는 표준 기법 (overlapped I/O 완료 통지의 요청 태그와 동형)
- **additive-only 계약 진화** — optional 필드 추가는 기존 소비자를 깨지 않으므로 버전 bump 없이 안전 (ADR-035)

---

## ⚠️ 함정

- **turnId 발급 시점 = turn 경계, run 아님** — "턴 경계"는 지속 펌프의 신규 프롬프트 dispatch. resume·isReplay 경로에서 카운터 리셋·중복 금지. run 시작 기준으로 발급하면 목표 시나리오에 no-op(🔴-1 감사 판정)
- **additive 원칙 위반 금지** — turnId를 required로 만들면 renderer 등 기존 소비자 전파 수정 발생. optional + 부재 시 fallback 유지
- **P05 직렬** — 이 Phase 완료·커밋 후에만 P05 착수(claude-stream 동일 파일)
- **grace 창 내 turn-B 무개입 강제** — fixture는 fake timer + 중간 메시지 0으로 침묵 구간을 강제해야 turnId 기각 경로가 발화한다. 안 그러면 continuation-흡수 취소가 먼저 grace를 죽여 테스트 판별력이 0
- **공유계약 additive 추적성** — turnId? 필드 추가 완료 시 `.claude/CHANGELOG.md` 1줄(또는 ADR-035 매핑 표 각주) 반영 (plan-auditor 🟡)

---

## 담당 SubAgent

coordinator 경유(P04b 조율 컨텍스트 승계) — agent-backend Worker(스탬프·기각) + shared-ipc 소폭(optional 1필드) + qa(repro 선행). reviewer 무조건(backend-contract).
