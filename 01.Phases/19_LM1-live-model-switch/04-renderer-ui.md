---
owner: 영호
milestone: LM1
phase: 04
title: renderer 스토어 + 피커 UI — requestLiveModelSwitch·same-value 가드·체감 언어 고지
status: pending
grade: 보통
risk: ui-visual
loop_track: human-visual
estimated: 2~3h
domain: renderer
summary: 승인 계획(2026-07-17 ExitPlanMode) LM1-P04 — composer.ts에 LIVE_SWITCHABLE_MODELS(=MODELS id 파생, 4번째 동기화 지점 신설 금지) + requestLiveModelSwitch(runId,replMode,model)(:48-62 미러·게이트 3조건·fire-and-forget) + setSelectedModel에 same-value 가드 후 낙관 set+헬퍼 호출, PanelView.tsx handleSetPicker(:163-169) model 분기, ComposerBar.tsx:97-98 + PanelPicker.tsx 체감 언어 문구 2지점(노출 전수 원칙). 육안=영호(버킷 b — 기능 자율 진행·무인 commit X). 의존 P01(preload). P02·P03과 병렬.
---

# Phase 04: renderer 스토어 + 피커 UI — 라이브 모델 전환 배선

> **상태**: pending
> **마일스톤**: LM1
> **등급**: 보통 (ui-visual)
> **loop_track**: human-visual — 기능은 자율 진행, 피커 문구·거동 시각 판정은 영호 육안(버킷 b · 무인 commit X)
> **담당**: renderer

---

## 🎯 목표

컴포저·패널 모델 피커에서 진행 중 REPL 세션의 모델을 라이브 전환하도록 스토어와 UI를 배선하고, 캐시 무효화 비용을 체감 언어로 고지한다. 끝나면: 피커를 바꾸면 낙관적으로 로컬 상태가 갱신되고 `requestLiveModelSwitch`가 게이트 3조건을 통과할 때만 IPC로 위임되며, 사용자는 "다음 응답부터 적용·첫 응답은 조금 느릴 수 있음"을 내부 용어 없이 안내받는다.

---

## 📐 확정 결정 (영호 확정 2026-07-17, 관련분 인용)

- **피커 고지 = 체감 언어(영호 결정 ②)** — 캐시 무효화 비용을 내부 용어 없이 노출. 문구 최종안은 육안 버킷(b)에서 재확인.
  - title: `모델 변경은 진행 중 REPL 세션에 즉시 적용됩니다 (단발 모드는 새 대화부터)`
  - note: `REPL 세션 중 변경은 다음 응답부터 적용돼요. 전환 직후 첫 응답은 준비로 조금 느릴 수 있어요.`
- **`LIVE_SWITCHABLE_MODELS` = `MODELS` id 파생** — `pickerOptions.ts:45-50`의 `MODELS`에서 id를 파생한다. 리터럴로 새로 쓰면 id 집합 동기화 지점이 4개로 늘어난다 → **4번째 동기화 지점 신설 금지**.
- **낙관 반영만** — 역통지 이벤트 없음. `setSelectedModel`은 same-value 가드 후 로컬을 먼저 set하고 헬퍼로 위임(서버 응답을 기다려 반영하지 않음).

---

## ⏪ 사전 조건

- [ ] **P01(shared 계약)** — `preload/index.ts`의 `agentSetModel` 브릿지
- [x] **선례 청사진** — `composer.ts:16-62,155-164`(requestLiveModeSwitch·setSelectedMode) / `PanelView.tsx:163-169`(handleSetPicker) / `ComposerBar.tsx:97-98`(title/note) / `PanelPicker.tsx:225-232`(패널 피커) / `pickerOptions.ts:45-50`(MODELS)
- [x] **실측(2026-07-17)** — 대화 복원 경로(`conversation.ts:103`·`sessions.ts:375`)는 raw `set`이라 액션 훅 미경유(오발화 없음) / `Conversation.tsx:678` sendNow가 액션 재호출 → **same-value 가드 필요**
- [ ] P02·P03과 병렬 가능 — 의존은 P01만

---

## 📝 작업 내용

- [ ] **(a) TDD RED 선행 (qa)** — `99.Others/tests/renderer/lm1-live-model-picker.test.ts`(window.api mock + `useAppStore.setState` 주입 — `gap1-p13-live-mode-picker` 컨벤션). **7케이스**: ① 정상 인자(runId+replMode+model로 IPC 발화) ② replMode off → 미발화 ③ runId null → 미발화 ④ 미지 모델(LIVE_SWITCHABLE_MODELS 밖) → 미발화 ⑤ same-value → 미발화 ⑥ 복원 경로(raw set) → 무발화 ⑦ 패널 분기 발화. **+ 문구 단정 2지점**(ComposerBar·PanelPicker title/note)
- [ ] **(b) 스토어 헬퍼 + 액션** — `composer.ts`에 `LIVE_SWITCHABLE_MODELS`(= `MODELS` id 파생) + `requestLiveModelSwitch(runId, replMode, model)`(:48-62 미러 — 게이트 3조건[runId 존재·replMode·LIVE_SWITCHABLE_MODELS 소속]·fire-and-forget) + `setSelectedModel`에 **same-value 가드** 후 낙관 set + 헬퍼 호출(:155-164 미러)
- [ ] **(c) PanelView 분기** — `handleSetPicker`(:163-169)에 model 분기를 mode 분기 나란히 추가(`session.state.*` 패널 로컬 상태 사용). PanelPicker.tsx 자체는 title/note 추가만
- [ ] **(d) 문구 2지점** — `ComposerBar.tsx:97-98` title/note 교체(체감 언어 정본) + `PanelPicker.tsx` 모델 Picker(:225-232)에도 **동형 title/note**(노출 지점 전수 원칙 — 배지 3번째 지점 누락 교훈)

---

## ✅ 완료 조건

- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` green — 신규 7케이스 + 문구 2지점 RED→GREEN + 회귀 0
- [ ] `npm run lint` 0 problems
- [ ] **육안 = 영호** (버킷 b — 기능은 자율 진행, 무인 commit X, 문구 최종안을 육안에서 재확인)

---

## 📚 학습 포인트

- **낙관적 업데이트(optimistic update)** — 로컬 상태를 먼저 바꾸고 서버 위임은 뒤로 보낸다. 응답을 기다려 반영하면 피커가 굼떠 보이므로, 낙관 반영 + 실패 시 자기치유(P03 안전망)로 UX와 정합을 둘 다 잡는다.
- **same-value 가드가 필요한 이유** — `Conversation.tsx:678` sendNow가 `setSelectedModel` 액션을 재호출한다. 가드가 없으면 같은 모델로도 IPC가 중복 발화한다. 가드는 이 중복을 값에서 차단한다(어댑터 change-guard와 이중 방어).
- **단일 출처 헬퍼로 게이트 드리프트 차단** — 발화 게이트 3조건을 `requestLiveModelSwitch` 한 곳에만 두면, 컴포저·패널 어디서 불러도 같은 규칙이 적용된다. 게이트를 소비처마다 복붙하면 규칙이 갈라진다.

---

## ⚠️ 함정

- **대화 복원 경로(conversation.ts:103·sessions.ts:375)는 raw set** — 액션 훅을 경유하지 않으므로 오발화가 없다. **여기를 건드리지 말 것** — 복원을 액션으로 바꾸면 로드 시 IPC가 튄다.
- **`LIVE_SWITCHABLE_MODELS`를 리터럴로 새로 쓰면 동기화 지점 4개** — 반드시 `MODELS`(pickerOptions.ts:45-50)에서 id를 파생한다. 리터럴 하드코딩은 id 집합 드리프트의 씨앗.
- **renderer는 untrusted** — 피커 게이트는 *소음 절감용*이다. 신뢰 근거는 main(P03, CORE-01). 여기서 검증했다고 main 검증을 생략하면 안 된다.
- **노출 지점 전수** — 문구는 ComposerBar와 PanelPicker 둘 다에 동형으로 넣는다(배지 3번째 지점 누락 교훈). 한 곳만 바꾸면 다른 표면이 옛 안내를 노출한다.

---

## 담당 SubAgent

> renderer (스토어 헬퍼·액션 + PanelView 분기 + 문구 2지점) · TDD RED는 qa · 육안 = 영호(버킷 b)
