---
owner: 영호
milestone: BL1
phase: 03
title: goal 배너 stale-watchdog — ended 신호 유실 경계 폴백 (LR4-P05 잔여)
status: done
grade: 복잡 (자동 상향: 보통 + ui-visual)
risk: ui-visual
loop_track: human-visual
estimated: 2~3h
domain: renderer
summary: ended 신호 유실 + error/abort 미발생 경계에서 goal 배너가 무한 고착되는 🟡 잔여 리스크(LR4-DONE:76) — renderer 수신측 stale-watchdog으로 1차 폴백.
---

# Phase 03: goal 배너 stale-watchdog (LR4-P05 잔여)

> **상태**: done
> **마일스톤**: BL1
> **등급**: 복잡 (자동 상향: 보통 + ui-visual — 배너 UI 상태 추가)
> **담당**: renderer

---

## 🎯 목표

`autonomy_status` ended 신호가 유실되고 error/abort도 오지 않는 경계에서, goal 배너가 영원히 "진행 중"으로 고착되지 않는다. 마지막 생존신호 이후 임계 시간이 지나면 배너가 **stale(신호 없음) 상태로 전환**되고 사용자가 수동 해제할 수 있다.

---

## ⏪ 사전 조건

- [ ] 근거 확인: LR4-DONE.md:76 (잔여 4번 — 🟡), `01.Phases/13_LR4-session-stability/05-goal-banner-liveness.md` (배너-생존신호 결속 스펙)
- [ ] 배너 결속부 실측 — renderer의 autonomy_status 소비처(orchestration store/배너 컴포넌트) grep. 단일 대화와 패널은 **별도 라우팅**(runtime.ts:496·panelSession.ts:909) — 양쪽 모두 대상
- [ ] **P02 완료 권장** (soft 의존 — P02가 보존해야 할 autonomy_status 방출 시점을 이 Phase가 소비. 병렬 시 통합 회귀 게이트 필요 — Codex P3)

---

## 📝 작업 내용

> **설계 고정 (분기 사전 해소)**: main 측 heartbeat 신설이 아니라 **renderer 수신측 stale-watchdog** 채택.
> - 이유: main heartbeat는 backend-contract 확장(AgentEvent 추가)이고, LR4-DONE 합의대로 REPL 4b auto-revive 재도입 때 함께 설계하는 게 맞음. renderer 폴백은 계약 불변·가역적.
> - 단점(trade-off): 유실을 임계 시간만큼 늦게 감지하고, 근본 원인(신호 유실 자체)은 해결 안 됨 — 그건 auto-revive 트랙 몫.
> - 구현 중 main/shared 변경이 불가피해지면 **보고 후 중단**(escalate — 설계 분기 재발).

- [ ] **활동 신호 정의 먼저 (Codex P2)** — `autonomy_status`의 `active`는 유예 중 자율 continuation 때만 방출됨(claudeAgentRun.ts:918) — 이것만 기준 삼으면 정상 장기 턴을 stale로 오판. 스트림/턴 이벤트 등 renderer가 이미 수신하는 이벤트 중 "활동"으로 집계할 목록을 실측해 명시하고, 그 최신 수신 시각으로 stale 판정
- [ ] **(TDD) 실패 테스트 먼저** — fake timer로 "마지막 활동 신호 후 임계 초과 → stale 전환" spec (RED)
- [ ] watchdog 구현 — run·대화·패널별 최신 활동 시각을 **스토어 수준**에 보관(컴포넌트 로컬 타이머 금지), 임계(기본 제안 5분) 초과 시 배너 stale 상태 전환. 타이머 수명(생성·정리)도 스코프별 정의
- [ ] stale UI — 배너에 "신호 없음" 표시 + 수동 해제 액션 (자동 강제 해제 X — 오탐 시 진행 중 배너 소실 방지)
- [ ] **전환·축출 경계 (Codex P2)** — 대화 전환·패널 캐시 축출 후에도 stale 판정이 리셋되지 않고 연속됨을 보장. 근거: bgRuns는 autonomyActive 포함(sessions.ts:66)이나 표시 레지스트리는 미보존(loopDisplayRegistry.ts:47·panelSession.ts:844)
- [ ] 정상 경로 회귀 — ended/error/abort 도착 시 기존 해제 동작 불변, 새 신호 도착 시 stale 해제(복귀)

---

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 errors
- [ ] `npm run test` green — watchdog spec(전환·복귀·수동해제) PASS + 기존 배너 liveness spec 회귀 PASS
- [ ] 대화 전환·패널 캐시 축출 후 stale 판정 연속성 회귀 테스트 PASS (Codex P2)
- [ ] `npm run lint` 0 problems
- [ ] **영호 육안 확인** (ui-visual — stale 표시 미감·해제 UX): 기능 진행은 하되 무인 commit X, 육안 후 commit

---

## 📚 학습 포인트

- **liveness 감시의 오탐-미탐 trade-off** — 임계가 짧으면 긴 자율 턴을 죽은 것으로 오판(오탐), 길면 고착을 늦게 발견(미탐). 자동 해제 대신 "stale 표시 + 수동 해제"를 고른 것도 같은 축의 보수적 선택.
- **폴백 vs 근본 해결** — 수신측 watchdog은 증상 완화. 신호 유실 자체는 발신측(heartbeat/auto-revive)에서 풀어야 하며, 그 결정을 미루는 것도 설계.

---

## ⚠️ 함정

- 임계값·stale 문구·배너 시각은 사람 육안 트랙(버킷 b) — 제안 기본값(5분)으로 구현하되 영호 확인에서 조정 가능하게 상수화.
- 여러 패널(멀티세션)의 배너가 각자 watchdog을 가져야 함 — 전역 타이머 하나로 만들면 패널 간 오염.
- 컴포넌트 로컬 타이머로 구현하면 화면 전환·언마운트에 임계가 리셋/소실 — 스토어 수준 timestamp가 정본 (Codex P2).
- setInterval 상시 tick으로 구현하지 말 것 — P04(복원 페이지 갱신 루프 데드락)와 같은 부류의 문제를 새로 만드는 꼴. 신호 수신 시점 기준 setTimeout 재설정 방식 권장.

---

## 담당 SubAgent

renderer
