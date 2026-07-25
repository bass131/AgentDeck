---
owner: 영호
milestone: LM1
phase: 02
title: 어댑터 setModel — AgentBackend optional + claudeAgentRun (change-guard·reject 롤백)
status: done
grade: 보통
risk: backend-contract
loop_track: auto-gate
estimated: 2~3h
domain: agent-backend
summary: 승인 계획(2026-07-17 ExitPlanMode) LM1-P02 — AgentBackend.ts에 optional setModel?(modelId:string):void(setPermissionMode :255 JSDoc 미러 — streaming input 한정·no-op·no-throw), claudeAgentRun.ts에 _currentModel(생성 시 req.model??null 시드) + setModel 구현(비지속 no-op → KNOWN_MODELS 밖 no-op → change-guard → 갱신+handle.setModel fire-and-forget → reject 롤백). 모델은 역통지 부재라 reject 롤백이 유일한 의도적 비대칭(주석 박제). 의존 없음(P01과 병렬). reviewer 무조건(backend-contract).
---

# Phase 02: 어댑터 setModel — AgentBackend optional + claudeAgentRun

> **상태**: done
> **마일스톤**: LM1
> **등급**: 보통 (backend-contract → reviewer 무조건)
> **loop_track**: auto-gate
> **담당**: agent-backend

---

## 🎯 목표

`AgentBackend` 인터페이스에 optional `setModel?(modelId: string): void`를 추가하고 `claudeAgentRun`이 이를 구현해 SDK `Query.setModel(model)`로 라이브 위임한다. 끝나면: 어댑터 단위 테스트로 "라이브 세션에서 setModel 호출 → SDK 핸들에 원문 id가 fire-and-forget으로 위임됨"을 실증할 수 있고, change-guard(같은 값 no-op)로 평상시 재사용 경로의 비용이 0이 된다. 엔진 추상화(`AgentBackend`) 경유이므로 Codex 어댑터엔 영향 없는 additive 설계(CORE-02).

---

## 📐 확정 결정 (영호 확정 2026-07-17, 관련분 인용)

- **재사용 경로 안전망의 전제 = 어댑터 change-guard(같은 값 no-op)** — 매 턴 재사용 경로(P03)가 `existing.setModelFn?.(req.model)`을 무조건 호출해도, 어댑터가 `modelId === _currentModel`을 no-op으로 삼키므로 평상시 비용 0·캐시 무효화 회피. change-guard = 이 안전망을 값싸게 만드는 핵심 장치.
- **picker id를 SDK에 그대로 전달** — `'opus'|'sonnet'|'haiku'|'fable'`를 매핑 테이블 없이 SDK 원문으로 위임(run-args.ts:147-149 선례). 모드와 다르다(모드는 피커 id↔SDK 모드 매핑 존재).
- **모델은 역통지 이벤트 부재 → reject 시 `_currentModel` 롤백이 유일한 의도적 비대칭**(모드는 롤백 없음). 유실 시 P03 안전망의 다음 턴 재시도가 살아나야 하므로 롤백 필수. 사유를 주석으로 박제한다.

---

## ⏪ 사전 조건

- [x] **승인 계획(2026-07-17 ExitPlanMode)** — `~/.claude/plans/vectorized-frolicking-hopper.md` LM1-P02 절 = 좌표 정본
- [x] **스카우트 실측(2026-07-17)** — SDK `Query.setModel(model?)`(sdk.d.ts:2270, streaming input 전용 = held-open 세션이 바로 그 모드) 존재. 스카우트 노트 = `00.Documents/reports/next/NEXT-라이브-모델-전환-스카우트-노트.md`
- [x] **선례 청사진** — 어댑터 `claudeAgentRun.ts:692-709`(setPermissionMode 위임) + `AgentBackend.ts:255`(setPermissionMode JSDoc) + `KNOWN_MODELS`(run-args.ts:32)
- [ ] 의존 없음 — **P01(shared 계약)과 병렬 가능**

---

## 📝 작업 내용

- [ ] **(a) TDD RED 선행 (qa)** — `99.Others/tests/agents/lm1-live-model-switch.test.ts` 작성(실패 먼저). `gap1-p13-live-mode-switch` 컨벤션 미러 — mock queryFn + `Object.assign(gen, {setModel})` 스파이. **6케이스**: ① 위임 인자 원문(picker id가 그대로 SDK 핸들에 전달) ② 비지속(단발) 경로 no-op ③ change-guard 재호출 0(같은 값 두 번째 호출 시 SDK 위임 안 됨) ④ 미지 id no-op(KNOWN_MODELS 밖) ⑤ 핸들 미캡처 no-op(setModel 핸들 없는 세션) ⑥ reject 시 `_currentModel` 롤백
- [ ] **(b) AgentBackend 계약** — `AgentBackend.ts`에 optional `setModel?(modelId: string): void` 추가. setPermissionMode(:255) JSDoc 미러 — **streaming input mode 한정·no-op·no-throw** 계약을 동형 기재. optional이므로 Codex 어댑터 미구현이 계약 위반 아님
- [ ] **(c) claudeAgentRun 구현 (순서 엄수)** — `_currentModel`(생성 시 `req.model ?? null` 시드) 필드 추가 후 `setModel(modelId)`:
  1. **비지속 no-op** — persistent(streaming) 세션이 아니면 그냥 반환
  2. **KNOWN_MODELS 밖 no-op** — `run-args.ts:32`의 `KNOWN_MODELS`에 없는 id면 반환
  3. **change-guard** — `modelId === _currentModel`이면 no-op(멱등)
  4. **갱신 + 위임** — `_currentModel = modelId` 후 `handle.setModel(modelId)` fire-and-forget no-throw
  5. **reject 롤백** — 위임 프로미스 reject 시 `_currentModel`을 이전 값으로 롤백(다음 턴 재시도를 살림 — **모드와의 유일한 의도적 비대칭, 주석 박제**)

---

## ✅ 완료 조건

- [x] `npm run typecheck` (main+renderer) 0 errors
- [x] `npm run test` green — 신규 6케이스 RED→GREEN + 회귀 0
- [ ] `npm run lint` 0 problems
- [x] reviewer 통과 (backend-contract → 무조건)

---

## 📚 학습 포인트

- **fire-and-forget + no-throw 계약** — 제어 요청(모델 전환)의 실패가 세션 자체를 죽이면 안 된다. 위임은 던지지 않고, 결과를 기다리지 않는다(다음 사용자 응답의 응답성을 막지 않기 위해). 대신 실패는 상태 롤백으로 자기치유 경로를 남긴다.
- **change-guard = 멱등성(idempotency)** — 같은 입력으로 몇 번을 재호출해도 부작용이 한 번과 같다. P03 안전망이 매 턴 무조건 호출해도 무해한 이유이자, 캐시 무효화 비용을 회피하는 핵심.
- **역통지 부재 = 낙관 반영의 대가** — 엔진이 "모델이 바뀌었다"를 되쏘는 이벤트가 없으므로, 클라이언트는 요청이 성공했다고 낙관하고 유실은 다음 턴 안전망으로 복구한다. 롤백은 이 복구가 작동하게 만드는 장치다.

---

## ⚠️ 함정

- **model-fallback 관측 시 `_currentModel` 무효화 금지** — `_currentModel`은 *사용자 의도값*이다. refusal 시 SDK가 Opus로 세션을 전환하고(`agent-events.ts:535` 배너 "이후 대화도 Opus로") 그 뒤 P03 안전망이 재호출하면, guard에서 no-op이 되어야 배너 약속이 파기되지 않는다. fallback을 관측했다고 `_currentModel`을 건드리면 안전망이 사용자 의도값으로 되돌려 배너를 배신한다.
- **picker→SDK 매핑 테이블 만들지 말 것** — 모드와 다르다. 모델은 picker id를 SDK 원문 그대로 전달한다(run-args.ts:147-149 선례). 매핑을 발명하면 동기화 지점이 늘고 드리프트가 생긴다.
- **단발(비-persistent) 경로 배선 금지** — `setModel`은 streaming input mode 한정(SDK JSDoc). 단발 run에 위임을 배선하면 미지원 경로다 — persistent run에만 위임하고, 그 외엔 첫 게이트에서 no-op.

---

## 담당 SubAgent

> agent-backend (AgentBackend 계약 + claudeAgentRun 구현) · TDD RED는 qa · reviewer 무조건(backend-contract)
