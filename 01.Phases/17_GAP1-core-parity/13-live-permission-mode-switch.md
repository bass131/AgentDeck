---
owner: 영호
milestone: GAP1
phase: 13
title: REPL 진행 중 세션 권한 모드 전환 실지원 — 모드 피커 조용한 no-op 봉합
status: done
grade: 대규모 (cross 4 Worker: agent-backend·shared-ipc·main·renderer + backend-contract·trust-boundary → reviewer 무조건)
risk: backend-contract·trust-boundary·ui-visual
loop_track: auto-gate
estimated: 3~6h
domain: cross
summary: dogfood 결함 A(2026-07-14) — 진행 중 REPL 세션에서 모드 피커 전환이 엔진에 전달되지 않는 조용한 no-op. 스카우트 실측(2026-07-14) — SDK 0.3.201 `Query.setPermissionMode(mode)` 공식 존재(sdk.d.ts:2243, JSDoc "streaming input mode 한정" — AgentDeck REPL은 충족), 적용은 호출 즉시·이후 도구 요청부터. plan 모드는 시스템 리마인더(읽기 전용 강제 + ExitPlanMode 프로토콜) 주입 동반이라 canUseTool 흉내로는 등가 불가 → SDK API 직접 사용 확정. 라이브 전환 허용 모드 화이트리스트 = default·plan·acceptEdits·auto 4종, bypassPermissions(및 dontAsk)는 라이브 전환 금지·세션 생성 시에만 — 영호 결정 박제 2026-07-14, main 핸들러가 강제. plan 승인 착지 모드는 암묵 동작 금지 — canUseTool 응답 `updatedPermissions: [{type:'setMode', mode:'acceptEdits', destination:'session'}]`(mode 필수·destination 'session' 고정) 또는 승인 직후 명시 `setPermissionMode` 호출로 결정적으로. 상태 동기화 보조 = SDKStatusMessage `permissionMode` 필드(sdk.d.ts:4130~4139). loop_track auto-gate — 채널 계약이 영호 결정으로 사전 박제됨. P07·P11/P12 뒤, 결함 B 봉합 커밋(3c1d104) 이후 착수.
---

# Phase 13: REPL 진행 중 세션 권한 모드 전환 실지원

> **상태**: done
> **마일스톤**: GAP1
> **등급**: 대규모 (backend-contract·trust-boundary → reviewer 무조건 · 신규 IPC 채널 계약 = 영호 결정 사전 박제 2026-07-14)
> **loop_track**: auto-gate (human-gate에서 강등) — 채널 계약(화이트리스트·매핑)이 영호 결정으로 사전 박제됨(2026-07-14, plan-auditor 권고 방식) → 문서 승인 = 채널 GO, reviewer 무조건 유지
> **담당**: coordinator 경유 — agent-backend(setPermissionMode 위임) + shared-ipc(채널 additive+preload) + main-process(핸들러) + renderer(피커·배지·승인 카드) + qa. reviewer 무조건
> **실행 순서**: P07·P11/P12(claudeAgentRun 직렬) 뒤 · 결함 B 봉합 커밋(3c1d104) 이후 착수

---

## 🎯 목표

REPL 진행 중 세션에서 권한 모드 전환을 실지원한다 — dogfood 결함 A(모드 피커 조용한 no-op) 봉합. 끝나면: 진행 중 세션에서 모드 피커 전환이 SDK `setPermissionMode`로 엔진에 실전달되어 이후 도구 요청부터 새 모드가 적용되고, '플랜' 전환 시 plan 프로토콜(읽기 전용 강제 + ExitPlanMode)이 성립하며, plan 승인 후 착지 모드가 암묵이 아니라 결정적으로 정해진다. 지금은 피커가 UI 상태만 바꾸고 엔진엔 아무것도 전달하지 않는다.

---

## 📐 확정 결정 — 라이브 전환 모드 화이트리스트 (영호 2026-07-14 박제)

- **라이브 전환 허용 모드 = 4종 화이트리스트**: `default`(일반) · `plan`(플랜) · `acceptEdits`(자동승인) · `auto`.
- **`bypassPermissions`(및 `dontAsk`)는 라이브 전환 금지 — 세션 생성 시에만** 선택 가능. 진행 중 세션에서의 전환 요청은 거부.
- **main 핸들러가 화이트리스트를 강제** — untrusted renderer가 보낸 모드 값을 main이 검증하고, 화이트리스트 밖이면 거부(CORE-01).
- **UI 피커 id → SDK 모드 매핑**: `normal`→`default` · `plan`→`plan` · `acceptEdits`→`acceptEdits` · `auto`→`auto` · `bypass`→**라이브 전환 불가 안내**(세션 생성 시에만).
- **plan 승인 착지 `updatedPermissions` 형식(감사 🟡5 정정)**: `[{type:'setMode', mode:'acceptEdits', destination:'session'}]` — **`mode` 필수 필드 포함** + **`destination`은 `'session'` 고정**(`userSettings` 등으로 새면 영속 권한 규칙 C-02/M-C 이연 영역 침범).

---

## ⏪ 사전 조건

- [x] **스카우트 실측(2026-07-14)** — SDK 0.3.201 `Query.setPermissionMode(mode)` 공식 존재(sdk.d.ts:2243). JSDoc "streaming input mode 한정" — AgentDeck REPL(스트리밍 입력)은 충족. 적용 시점 = 호출 즉시·이후 도구 요청부터
- [x] **plan 모드 등가 불가 판정** — plan 모드는 시스템 리마인더(읽기 전용 강제 + ExitPlanMode 프로토콜) 주입을 동반하므로 canUseTool 흉내로는 등가 불가 → **SDK API 직접 사용 확정**
- [x] **상태 동기화 보조 신호** — SDKStatusMessage의 `permissionMode` 필드(sdk.d.ts:4130~4139)로 엔진 측 모드 상태 확인 가능
- [x] P07(plan 승인 UI, 2c77073) · P11(60e21cf) · P12 완료 — claudeAgentRun 직렬 레인 종결
- [x] 결함 B 봉합 커밋(3c1d104) 반영 완료

---

## 📝 작업 내용

- [ ] **(a) TDD RED 선행 (qa)** — 실패 테스트 먼저: ① 진행 중 세션 모드 전환 요청 → `setPermissionMode` 호출 단정 ② 전환 후 도구 요청부터 새 모드 반영 단정 ③ plan 승인 착지 모드 결정성 단정(아래 (e)) ④ untrusted 입력 검증(비정상 모드 문자열 거부)
- [ ] **(b) agent-backend: setPermissionMode 위임 배선** — AgentRun에 모드 전환 위임 추가 → 내부에서 `Query.setPermissionMode(mode)` 호출. 엔진 추상화(`AgentBackend`) 경유 — CORE-02, Codex 어댑터에 영향 없는 additive 설계
- [ ] **(c) shared-ipc: 모드 변경 요청 채널 additive** — `02.Source/shared`에 채널·타입 단일 정의(CORE-04) + preload 화이트리스트 노출. **additive만 — 기존 계약 bump 금지**
- [ ] **(d) main: 핸들러 + untrusted 검증** — renderer 요청을 신뢰하지 않고 모드 값·세션 대상 검증 후 AgentRun 위임(CORE-01). 모드 값은 위 📐 화이트리스트(4종) 밖이면 거부 — 채널 계약은 영호 결정(2026-07-14)으로 사전 박제, **문서 승인 = 채널 GO**
- [ ] **(e) renderer: 피커 활성화·배지·승인 카드 착지** — ① 진행 중 세션에서 모드 피커 활성화(현재 no-op 봉합, 피커 id→SDK 모드 매핑은 📐 정본 — `bypass`는 라이브 불가 안내) ② 전환 반영 배지(SDKStatusMessage `permissionMode` 동기화 보조) ③ P07 승인 카드의 plan 승인 착지 모드 응답 — **암묵 동작 금지**: canUseTool 응답 `updatedPermissions: [{type:'setMode', mode:'acceptEdits', destination:'session'}]`(`mode` 필수 · `destination` `'session'` 고정) 또는 승인 직후 명시 `setPermissionMode` 호출로 결정적으로

---

## ✅ 완료 조건

- [ ] `npm run typecheck` (main+renderer) 0 · `npm run test` 전체 green(신규 RED→GREEN, 회귀 0) · `npm run lint` 0
- [ ] 결정론 테스트: 전환 후 모드 반영 단정 + plan 승인 착지 모드 결정성 단정
- [ ] **라이브 확인 1회** — 진행 중 세션에서 '플랜' 전환 → ExitPlanMode 카드 성립(dogfood ④ 1차 실패 시나리오 역전)
- [ ] reviewer 통과 (backend-contract·trust-boundary → 무조건)
- [ ] ui-visual(피커) 육안은 마감 일괄 — 영호 트랙(무인 commit X)

---

## 📚 학습 포인트

- **조용한 no-op은 명시 에러보다 나쁘다** — UI가 상태를 바꾼 척하는데 엔진엔 전달되지 않으면, 사용자는 plan 모드라고 믿고 실행 모드로 도구를 승인하게 된다. 실패가 보이는 인터페이스가 실패를 숨기는 인터페이스보다 안전하다.
- **흉내 vs 공식 API** — plan 모드는 "권한 정책"이 아니라 시스템 리마인더 주입까지 포함된 프로토콜이다. canUseTool 게이트만 흉내 내면 겉모습만 같고 의미가 다르다 — 공식 API의 의미론을 실측(sdk.d.ts + JSDoc)으로 확인하고 직접 쓴다.
- **착지 모드의 결정성** — plan 승인 후 어느 모드로 내려앉는지가 암묵이면 SDK 버전에 따라 거동이 흔들린다. `updatedPermissions` 또는 명시 호출로 결정론화해야 회귀 잠금이 가능하다.

---

## ⚠️ 함정

- **trust-boundary = 신규 IPC 채널** — 채널 계약(화이트리스트 4종·피커 매핑)은 영호 결정으로 사전 박제됨(2026-07-14) → 문서 승인 = 채널 GO(auto-gate). 단, 박제 범위 밖 계약 변경이 필요해지면 그때 정지 + 영호 게이트. renderer는 untrusted — 모드 값 화이트리스트 검증은 main 단독(CORE-01), `bypassPermissions`·`dontAsk`는 라이브 전환 거부.
- **JSDoc 제약 확인** — `setPermissionMode`는 streaming input mode 한정. AgentDeck REPL은 충족하나, 단발(비-persistent) 경로에 잘못 배선하면 미지원 경로 — persistent run에만 위임.
- **plan 착지 모드 암묵 동작 금지** — "SDK가 알아서 default로 돌아가겠지"는 설계가 아니다. 결정적 경로(updatedPermissions 또는 명시 호출) 중 하나로 확정하고 테스트로 박제.
- **P07 승인 카드와의 조율** — 착지 모드 응답은 P07이 만든 카드 경로에 얹는다. 신규 카드/모달 발명 금지(P07 함정과 동일).
- **ui-visual 육안은 마감 일괄** — 기능은 자율 진행, 피커·배지 시각 판정은 영호 육안(무인 commit X).
