---
owner: 영호
milestone: LM1
phase: 03
title: main 핸들러 + 라우팅 + 재사용 경로 안전망 (KNOWN_MODELS 검증)
status: done
grade: 보통
risk: trust-boundary
loop_track: auto-gate
estimated: 2~3h
domain: main-process
summary: 승인 계획(2026-07-17 ExitPlanMode) LM1-P03 — handlers/agent.ts에 AGENT_SET_MODEL 핸들러(runId/model string·trim 검증 + KNOWN_MODELS import 재사용, 신규 상수 0·throw 금지), agent-runs.ts에 ActiveRun setModelFn·바인딩·RunManager.setModel(runId,model):boolean(setMode :383-396 미러), 재사용 분기(:212-223) setOrchestrationFn 직후 existing.setModelFn?.(req.model) 안전망(undefined skip·pushFn 직전·비대칭 사유 주석). loop_track auto-gate — human-gate에서 강등: 채널 계약·검증 규칙이 승인된 계획(2026-07-17 ExitPlanMode)으로 사전 박제(P13 선례 방식). 의존 P01·P02.
---

# Phase 03: main 핸들러 + 라우팅 + 재사용 경로 안전망

> **상태**: done
> **마일스톤**: LM1
> **등급**: 보통 (trust-boundary → reviewer 무조건)
> **loop_track**: auto-gate (human-gate에서 강등) — 채널 계약·검증 규칙(KNOWN_MODELS 재사용·안전망 순서)이 승인된 계획(2026-07-17 ExitPlanMode)으로 사전 박제됨(P13 선례 방식) → 문서 승인 = 채널 GO, reviewer 무조건 유지
> **담당**: main-process

---

## 🎯 목표

renderer의 `AGENT_SET_MODEL` 요청을 main이 untrusted 값으로 검증한 뒤 어댑터까지 위임하고, 매 턴 재사용 경로에 자기치유 안전망을 배선한다. 끝나면: IPC → 핸들러 → RunManager → 어댑터의 전 체인이 성립하고, 이벤트 유실 시에도 다음 send가 사용자 의도 모델을 재전송해 최종 정합에 수렴한다.

---

## 📐 확정 결정 (영호 확정 2026-07-17, 관련분 인용)

- **재사용 경로 안전망 채택(영호 결정 ①)** — 전용 `agentSetModel` IPC + 매 턴 재사용 경로에서 `existing.setModelFn?.(req.model)`(orchestration 선례). 전제 = 어댑터 change-guard(P02, 같은 값 no-op → 평상시 비용 0). **모드 선례와의 1지점 비대칭 사유**(모델은 역통지 이벤트 부재 → 유실 시 자기치유 경로 필요)는 주석 박제.
- **KNOWN_MODELS 재사용 = 검증 정본** — 모드의 `LIVE_MODE_WHITELIST`와 달리, 모델은 세션생성/라이브 허용 집합이 동일하므로 신규 상수를 만들지 않고 `KNOWN_MODELS`(run-args.ts:32)를 import해 재검증한다.
- **throw 금지** — 검증 실패는 예외가 아니라 no-op/false 반환. untrusted 값이 main을 죽이면 안 된다.

---

## ⏪ 사전 조건

- [ ] **P01(shared 계약)** — `AGENT_SET_MODEL` 채널·`SetModelRequest`/`SetModelResponse` 타입
- [ ] **P02(어댑터)** — `run.setModel?(modelId)` 구현(change-guard·롤백 포함)
- [x] **선례 청사진** — 핸들러 `main/00_ipc/handlers/agent.ts:47,178-188` / 라우팅 `main/00_ipc/agent-runs.ts:42-46,140,240-242,383-396` / 재사용 분기 `:212-223`

---

## 📝 작업 내용

- [ ] **(a) TDD RED 선행 (qa)** — `99.Others/tests/main/lm1-set-model-handler.test.ts`(순수함수 추출 + delegate mock — `gap1-p13-set-mode-handler` 컨벤션): ① 정상 수락(유효 runId+KNOWN_MODELS 모델 → true) ② 빈 runId 거부 ③ 비문자열 model 거부 ④ allowlist(KNOWN_MODELS) 밖 거부 ⑤ done run → false. **+ 재사용 라우팅 테스트**: 재사용 턴에서 `setModelFn` 호출 단정 / `req.model` undefined일 때 skip 단정
- [ ] **(b) 핸들러** — `handlers/agent.ts`에 `AGENT_SET_MODEL` 핸들러: `runId`·`model`이 string인지 + `trim` 후 비지 않는지 + `KNOWN_MODELS` 소속인지 검증(신규 상수 0, **import 재사용**) → `runManager.setModel(runId, model)` 위임, **throw 금지**(검증 실패는 `{accepted: false}`)
- [ ] **(c) 라우팅** — `agent-runs.ts`에 ActiveRun `setModelFn` 필드 + 바인딩 `(m) => run.setModel?.(m)` + `RunManager.setModel(runId, model): boolean`(setMode :383-396 미러 — 미존재/done run이면 false)
- [ ] **(d) 안전망** — 재사용 분기(:212-223)의 `setOrchestrationFn` 직후에 `if (typeof req.model === 'string') existing.setModelFn?.(req.model)` 삽입. **undefined skip**(기본값 복귀 오해 차단), **pushFn 직전 순서**(:215-218 주석 규율 동형), **비대칭 사유 주석**(모드엔 없는 안전망인 이유 = 역통지 부재)

---

## ✅ 완료 조건

- [x] `npm run typecheck` (main+renderer) 0 errors
- [x] `npm run test` green — 신규 핸들러/라우팅 테스트 RED→GREEN + 회귀 0
- [x] `npm run lint` 0 problems
- [x] reviewer 통과 (trust-boundary → 무조건)

---

## 📚 학습 포인트

- **신뢰 경계 검증(CORE-01)** — untrusted renderer가 보낸 값은 main이 다시 검증한다. renderer의 피커 게이트(P04)는 소음 절감용일 뿐, 신뢰 근거가 아니다. main이 `KNOWN_MODELS` allowlist로 재검증하는 것이 실질 방어선이다.
- **자기치유(self-healing) 안전망** — 이벤트가 유실돼도 상태를 재전송해 복구한다. 여기선 매 send 턴마다 사용자 의도 모델을 안전망으로 재위임하므로, 중간에 위임이 실패했어도 다음 턴에 스스로 정합으로 수렴한다(idle-close 강등 경합·stale runId 삼킴 시나리오를 이 창구가 흡수).

---

## ⚠️ 함정

- **mode의 `LIVE_MODE_WHITELIST`를 복붙하지 말 것** — 모델은 세션생성/라이브 허용 집합이 동일하므로 `KNOWN_MODELS` 재사용이 정본이다. 별도 화이트리스트를 만들면 두 상수가 갈라질 위험이 생긴다.
- **안전망은 pushFn *직전*** — `:215-218` 주석 규율과 동형으로, 사용자 메시지를 push하기 전에 모델 위임이 먼저 나가야 한다. push 후에 위임하면 *그 턴 첫 응답*이 옛 모델로 나간다.
- **undefined는 skip** — `req.model`이 undefined면 안전망을 건너뛴다. undefined를 위임하면 "기본값 복귀"로 오해될 수 있다(계약은 required string).

---

## 담당 SubAgent

> main-process (핸들러 + 라우팅 + 안전망) · TDD RED는 qa · reviewer 무조건(trust-boundary)
