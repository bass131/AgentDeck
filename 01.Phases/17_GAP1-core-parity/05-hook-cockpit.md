---
owner: 영호
milestone: GAP1
phase: 05
title: 훅 콕핏 — 생명주기 · 차단 사유 · auto-deny 사유 배선
status: done
grade: 복잡 (보통 + backend-contract·ui-visual 깃발)
risk: backend-contract·ui-visual
loop_track: human-visual
estimated: 2~5h
domain: cross
summary: 하네스 콕핏 정체성 직결 — hook_started/progress/response 생명주기(S-04) + informational 차단 사유·Stop continuation 거부(S-03) + permission_denied auto-deny 사유(S-07) 배선 → 대화 인라인 표시 + 훅 타임라인 표면. 9종 훅이 왜 막았는지 화면에서 보이게. 계약 타입은 P03 선정의분 사용.
---

# Phase 05: 훅 콕핏

> **상태**: done — 훅 생명주기 3종·informational·permission_denied 소비 + HookTimeline·인라인 배지(접힘 기본). 게이트 green(typecheck0·lint0·Vitest 4863pass)·reviewer 통과(위반0·🟡4 비차단). ui-visual 육안 = 영호 트랙(dogfood 스크린샷 일괄)
> **마일스톤**: GAP1
> **등급**: 복잡 (자동 상향: 보통 + backend-contract·ui-visual → reviewer 무조건·human-visual)
> **담당**: cross (agent-backend + renderer) + reviewer

---

## 🎯 목표

이 앱의 정체성인 '하네스 콕핏'을 화면으로 완성한다. 끝나면: 9종 훅(pin-injector·tdd-guard·dangerous-cmd-guard 등)이 언제 시작·진행·완료·실패했는지, 왜 막았는지, 왜 자동 거부됐는지가 대화 인라인 + 훅 타임라인에서 보인다. 지금은 훅이 조용히 막으면 사용자는 이유 없이 멈춘 것으로만 본다.

---

## ⏪ 사전 조건

- [ ] **P03 완료** — hook_started/progress/response(+hook_id)·informational·permission_denied 타입이 `02.Source/shared`에 정의됨
- [ ] **`includeHookEvents:true` 옵션 배선** (sdk.d.ts:1582 — 현재 sdkOptions 미설정) + 미지원 버전 fallback + 훅 3종 subtype 실 fixture(P03 probe ①) 기반 테스트
- [ ] 근거 = GAP1 감사 S-04·S-03·S-07 (전부 sdk-events, 하네스 콕핏 온-브랜드)
- [ ] 현행 드롭 지점: system '그 외' 분기(`claude-stream.ts:554-555`) · 대화형 ask는 canUseTool→permission_request로 처리됨(`permissionCoordinator.ts:322`)

---

## 📝 작업 내용

- [ ] **(a) 훅 생명주기 3종 (S-04)** — hook_started/hook_progress/hook_response(hook_name·hook_event·stdout·stderr·exit_code·outcome success/error/cancelled)를 system '그 외'에서 건져 소비 → 대화 인라인 배지 + 훅 타임라인 패널
- [ ] **(b) informational 차단 사유 (S-03)** — SDKInformationalMessage(content·level·prevent_continuation·tool_use_id)로 UserPromptSubmit 훅 차단 사유·슬래시 출력·Stop 훅 continuation 거부(prevent_continuation=true)를 대화에 표시
- [ ] **(c) permission_denied auto-deny 사유 (S-07)** — deny-rule 등 비대화형 auto-deny는 이 메시지가 유일 신호인데 드롭 중 → decision_reason_type(classifier/asyncAgent/mode/rule)·decision_reason 소비 → '어느 규칙이 왜 막았는지' 표시(사용자가 규칙 튜닝에 쓰는 실정보 — memory: deny 범위 실측)
- [ ] **(d) 소음 억제 UI** — 훅 발화 빈도 높음(pin-injector 매 입력). 접힘/배지 기본 + 펼침 상세. 타임라인은 요약 뷰
- [ ] **(e) TDD + 노출 지점 전수** — 실패 테스트 선행 + 단일챗·멀티패널 노출 지점 grep 전수

---

## ✅ 완료 조건

- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` Vitest 전체 green + TDD(실패 테스트 선행)
- [ ] `npm run lint` 0 problems
- [ ] 훅 생명주기 3종 소비·렌더(단정) · informational 차단 사유 표시(단정) · permission_denied 사유 표시(단정) · 소음 억제(접힘 기본) 확인
- [ ] 영호 육안 병행 (ui-visual — 무인 commit X)
- [ ] reviewer 통과 (backend-contract = 무조건)

---

## 📚 학습 포인트

- **투명성 = 신뢰의 전제** — 자동화(훅)가 왜 그 판단을 했는지 안 보이면 사용자는 그 자동화를 믿지 못한다. 하네스가 곧 제품인 이 앱에서 '왜 막았나'를 보여주는 건 부가 기능이 아니라 핵심.
- **신호 소음 관리** — 유용한 신호도 너무 자주 뜨면 소음이 된다. 접힘/배지 기본 + 요청 시 펼침이 고빈도 신호의 표준 UX 패턴.

---

## ⚠️ 함정

- **ui-visual = 사람 육안 병행** — 무인 commit X. 타임라인·인라인 배지의 시각은 영호 판정.
- **이벤트 소음** — pin-injector는 매 입력 발화. 기본 접힘 안 하면 대화가 훅 로그로 뒤덮인다.
- **P04~P06 claude-stream 직렬** — 셋 다 claude-stream 편집. 순차 진행(P04 뒤).
- **deny 사유 정확성** — 사용자가 규칙 튜닝의 근거로 쓰므로 어느 규칙이 막았는지 정확히(decision_reason). 뭉뚱그리면 튜닝 불가.

---

## 담당 SubAgent

coordinator 경유 — agent-backend Worker(claude-stream 훅 이벤트 배선) + renderer Worker(타임라인·인라인 렌더) + reviewer 무조건(backend-contract). ui-visual이라 영호 육안 병행.
