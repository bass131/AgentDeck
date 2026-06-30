---
owner: 영호
milestone: RF1-followup
phase: 03
title: ClaudeCodeBackend·eventNormalizer 거대모듈 분해
status: done
grade: 대규모
risk: backend-contract
loop_track: human-gate  # 설계 단계만 — 권한경계(canUseTool) 추출 설계 분기 = work-judge (c). GO 후 기계적 추출은 auto-gate.
estimated: 5~8h
domain: agent-backend
summary: ClaudeAgentRun 1000줄 클래스 + eventNormalizer 770줄을 책임 축으로 분리(>500 해소)
---

# Phase 03: ClaudeCodeBackend·eventNormalizer 거대모듈 분해

> **상태**: pending
> **마일스톤**: RF1-followup
> **등급**: 대규모 (1596+770줄 분해 · backend-contract → reviewer 통합)
> **담당**: agent-backend (설계 단계 human-gate → 영호 GO 후 추출)

---

## 🎯 목표

RF1 P11이 정규화 레이어를 1차 분리했지만 `ClaudeCodeBackend.ts`가 여전히 **1596줄**(내부 `ClaudeAgentRun` 클래스만 ~1000줄), `eventNormalizer.ts`가 **770줄**로 둘 다 500줄 초과(work-pin 후속 P11②). 책임 축으로 추가 분해해 각 파일을 단일책임에 가깝게 만든다. **거동 불변** — 공개 API(`AgentBackend.start()`, `AgentRun` 인터페이스) 표면 유지.

---

## ⏪ 사전 조건

- [ ] Phase 02 완료 (`_sanitizeDescription` 공통화 — 분해 시 중복 메서드를 한 번만 옮김)
- [x] 구조 실측 완료 — `ClaudeAgentRun`(367~1370) 내 책임 후보:
  - permission 처리: `_makeCanUseTool`(1210~1370 ~160줄), `permissionSummary`/`oneLine`(337~366), `parseQuestions`(236)/`formatAnswers`(268)
  - 명령 캡처: `_captureSupportedCommands`(647~)
  - 이벤트 펌프: `_push`/`_close`/`_wake`(572~589), `abort`/`interrupt`/`respond`/`push`(470~558)

---

## 📝 작업 내용

> 대규모 — TaskCreate로 내부 분해 권장. 책임 축별로 모듈 추출:

- [ ] **분해 설계 먼저** — `ClaudeAgentRun`의 책임 축을 식별하고 추출 단위 확정(아래는 후보):
  - [ ] permission 결정 로직(`_makeCanUseTool` + `permissionSummary` + question 파싱/포맷) → `permission*.ts` 모듈
  - [ ] 지원 커맨드 캡처(`_captureSupportedCommands`) → 별도 모듈 또는 기존 settings 인접
  - [ ] 이벤트 큐/생명주기 펌프 → 필요 시 분리 (또는 ClaudeAgentRun 코어로 잔류)
- [ ] 🛑 **영호 GO 체크포인트 (human-gate)** — 추출 축·permission 모듈 경계를 초안으로 제시하고 **영호 승인 대기**. 권한경계(canUseTool)를 *옮기는* 설계 분기는 work-judge 버킷 (c) → 사람 판단. **GO 이후 기계적 추출은 auto-gate**.
- [ ] (GO 후) `eventNormalizer.ts`(770줄)도 책임 축(이벤트 종류별 정규화 등)으로 분리
- [ ] 추출 모듈에 단위 테스트(TDD — 추출 전 거동 캡처 테스트 권장)
- [ ] 분해 후 두 파일 모두 **500줄 이하** 목표(불가 시 사유 보고)

---

## ✅ 완료 조건

- [ ] `ClaudeCodeBackend.ts` · `eventNormalizer.ts` 각 **≤500줄** (또는 미달 사유 보고 + 합리적 감소)
- [ ] 🛑 **영호 GO** 받음 (설계 단계 — 추출 축·permission 모듈 경계 확정)
- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` green (시작값 대비 비감소 + 신규 fail 0)
- [ ] `npm run build` green (번들 — 분해 import 검증)
- [ ] `npm run lint` 0 problems
- [ ] reviewer 통과 (backend-contract — 무조건 + 모델 상향)
- [ ] 공개 API 표면(`AgentBackend`/`AgentRun`) 변경 0 — 소비처 import 경로 무변경

---

## 📚 학습 포인트

- **단일책임 원칙(SRP)** — 한 클래스가 permission·이벤트·명령캡처를 다 하면 변경 이유가 여럿. 축별로 쪼개면 한 가지 이유로만 바뀐다.
- **거동 캡처 테스트(characterization test)** — 분해 전 현재 거동을 테스트로 못박으면, 분해 후 그 테스트가 회귀 안전망이 된다.
- **public 표면 보존** — 내부를 아무리 쪼개도 외부(IPC 핸들러)가 보는 인터페이스는 그대로여야 소비처 churn 0.

---

## ⚠️ 함정

- **`this` 바인딩 / 클로저** — 메서드를 모듈 함수로 빼면 `this.xxx` 접근이 깨진다. 필요한 상태를 인자로 넘기거나, 코어 클래스에 잔류시킬지 신중히 판단.
- **이벤트 순서 의존** — `_push`/`_wake`는 async iterator 펌프. 분리 시 이벤트 방출 순서·타이밍이 바뀌면 거동 변화. 테스트로 고정.
- **backend-contract** — 어댑터 계약. 한 줄 실수가 Claude run 전체 영향 → reviewer 통합 + 회귀 게이트 엄수.
- **over-split 경계** — 무리하게 잘게 쪼개 모듈이 폭증하면 추적성 저하. "단일책임"이 목표지 "최소 줄 수"가 목표가 아님.

---

## 담당 SubAgent

`agent-backend` (`02.Source/main/01_agents/**` R/W) — 대규모 + backend-contract → Opus 상향 권장
