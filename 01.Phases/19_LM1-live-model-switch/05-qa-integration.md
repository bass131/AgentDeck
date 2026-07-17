---
owner: 영호
milestone: LM1
phase: 05
title: 통합 e2e + SDK 라이브 프로브 (message.model·effort 잔존 실측)
status: pending
grade: 보통
loop_track: auto-gate
estimated: 2~3h
domain: qa
summary: 승인 계획(2026-07-17 ExitPlanMode) LM1-P05 — opt-in e2e(tests/e2e/lm1-live-model-switch.e2e.ts, gap1-p13 e2e 미러 — REPL 턴1→라이브 전환→턴2+스크린샷) + opt-in SDK 라이브 프로브(tests/agents/lm1-setmodel-live-probe.test.ts, LIVE_SDK=1 — model-alias 선례): ⓐ setModel 후 message.model 원시 ID 변화 실측(반영 정본 검증) ⓑ opus(xhigh)→haiku 전환 시 effort 잔존 거동 실측. effort 실측 보고 1건 = human-gate(문제 시 haiku 라이브 제외 여부 영호 판단). 의존 P01~P04 전부.
---

# Phase 05: 통합 e2e + SDK 라이브 프로브

> **상태**: pending
> **마일스톤**: LM1
> **등급**: 보통 (qa)
> **loop_track**: auto-gate (+ effort 실측 보고 1건 = human-gate)
> **담당**: qa

---

## 🎯 목표

라이브 모델 전환의 전 체인을 opt-in e2e와 실 SDK 라이브 프로브로 채증한다. 끝나면: REPL 턴1 → 라이브 전환 → 턴2 성립이 e2e로 재현되고, `message.model` 원시 ID 변화로 "역통지 부재의 반영 정본"이 실측되며, opus(xhigh)→haiku 전환 시 effort 잔존 거동이 실측 보고로 확정되어 영호 판단(haiku 라이브 제외 여부)에 걸린다.

---

## ⏪ 사전 조건

- [ ] **P01~P04 전부** — 계약·어댑터·핸들러·라우팅·renderer 배선 완료(전 체인 성립 후에야 통합 검증 가능)
- [x] **선례 청사진** — `gap1-p13` e2e 미러 / `model-alias-sonnet5-live-probe` 라이브 프로브 선례(`LIVE_SDK=1` opt-in) / effort 피커 위치 `ComposerBar.tsx:103-109`
- [x] **실측(2026-07-17)** — effort는 세션 생성 시 고정 + SDK 라이브 effort API 없음 → opus(xhigh)→haiku 라이브 전환 시 거동 미지(프로브로 확정)

---

## 📝 작업 내용

- [ ] **(a) e2e 작성** — `99.Others/tests/e2e/lm1-live-model-switch.e2e.ts`(opt-in, `gap1-p13` e2e 미러): REPL 턴1 → 라이브 모델 전환 → 턴2 응답 성립 + 스크린샷 채증
- [ ] **(b) 라이브 프로브 2건** — `99.Others/tests/agents/lm1-setmodel-live-probe.test.ts`(opt-in `LIVE_SDK=1`, `model-alias-sonnet5-live-probe` 선례):
  - ⓐ **반영 정본 검증** — setModel 후 후속 응답의 `message.model` 원시 ID가 변화하는지 실측(역통지 부재 절충안의 정본 검증)
  - ⓑ **effort 잔존 실측** — opus(xhigh) 세션에서 haiku로 라이브 전환 시 effort 옵션 거동 실측(SDK 라이브 effort API 부재 상태에서 잔존 effort가 어떻게 처리되는지)
- [ ] **(c) 실행·실측 기록** — opt-in 2본을 실행하고 라이브 실행 결과를 트랜스크립트에 박제(설계 문서에 없는 effort 조합 거동 확정)
- [ ] **(d) effort 실측 보고** — ⓑ 결과를 영호에게 보고 → **판단 대기(human-gate)**: 문제 시 haiku 라이브 전환 제외 여부 영호 결정

---

## ✅ 완료 조건

- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` green (회귀 0) — opt-in 라이브 테스트는 CI 기본에서 분리(비용·플레이크)
- [ ] `npm run lint` 0 problems
- [ ] opt-in 2본(e2e + 라이브 프로브) 실행 성립 — 라이브 실행 결과 트랜스크립트 박제
- [ ] **effort 실측 보고 제출** → 영호 판단(human-gate)

---

## 📚 학습 포인트

- **opt-in 라이브 테스트** — 실 SDK 호출은 토큰 비용과 플레이크(네트워크·모델 응답 변동)를 동반한다. `LIVE_SDK=1` 같은 환경 플래그로 CI 기본에서 분리하면, 결정론 게이트(단위 테스트)는 항상 돌면서도 실측이 필요할 때만 라이브를 켤 수 있다.
- **실측이 설계를 이긴다** — effort와 모델의 라이브 조합 거동은 SDK 문서에 없다. "아마 이럴 것"으로 잠그지 말고 프로브로 실측해 확정한다(역통지 부재의 반영 정본도 `message.model` 실측으로만 검증 가능).

---

## ⚠️ 함정

- **라이브 프로브는 실 토큰 소모** — 최소 턴으로 설계한다(반영 확인에 필요한 최소 응답만). 장황한 프롬프트로 프로브를 부풀리지 말 것.
- **e2e에서 모델 전환 확인은 응답 성립까지** — 턴2가 성립하는지까지만 단정한다. 모델별 출력 *품질*을 단정하면 플레이크의 원천이 된다(같은 프롬프트도 모델·시드에 따라 출력이 갈림).

---

## 담당 SubAgent

> qa (opt-in e2e + 라이브 프로브 2건 + effort 실측 보고) · effort 보고 = human-gate(영호 판단)
