---
owner: 영호
milestone: RF1-followup
phase: 02
title: _sanitizeDescription DRY 공통화
status: pending
grade: 복잡
risk: backend-contract
loop_track: auto-gate
estimated: 1~1.5h  # 작업량은 작으나 backend-contract 깃발로 등급 복잡 상향(grade-and-risk §3 일관)
domain: agent-backend
summary: ClaudeAgentRun·RunEventNormalizer 두 클래스의 중복 _sanitizeDescription을 공통 유틸로 추출
---

# Phase 02: _sanitizeDescription DRY 공통화

> **상태**: pending
> **마일스톤**: RF1-followup
> **등급**: 복잡 (보통 + backend-contract 자동 상향, grade-and-risk §3 → coordinator + reviewer 무조건 + -DONE.md/HTML)
> **담당**: agent-backend (복잡 → coordinator 경유)

---

## 🎯 목표

`_sanitizeDescription`이 `ClaudeAgentRun`(ClaudeCodeBackend.ts)과 `RunEventNormalizer`(eventNormalizer.ts) 두 클래스에 **중복 정의**돼 있다(work-pin 후속 P11①). 동일 로직을 공통 유틸 함수로 추출해 단일 진실로 만든다. 거동 불변.

---

## ⏪ 사전 조건

- [ ] Phase 01 완료 (drift 봉합 — work-pin 정합)
- [x] 중복 위치 실측: 호출 `ClaudeCodeBackend.ts:666`(`ClaudeAgentRun._sanitizeDescription`), `eventNormalizer.ts:594`(`RunEventNormalizer._sanitizeDescription`)

---

## 📝 작업 내용

- [ ] 두 클래스의 `_sanitizeDescription` 정의 본문을 비교 — **로직 동일성 확인**(다르면 차이를 보고 후 판단)
- [ ] 공통 유틸 함수로 추출 — `02.Source/main/01_agents/` 내 적절한 위치(예: `descriptionUtils.ts` 또는 기존 공용 모듈). static 메서드 → 순수 함수
- [ ] 두 호출부를 공통 함수 import로 교체 (`Class._sanitizeDescription(x)` → `sanitizeDescription(x)`)
- [ ] 두 클래스에서 중복 메서드 정의 제거
- [ ] 관련 단위 테스트 있으면 공통 함수 기준으로 정합 (없으면 공통 함수에 최소 테스트 추가 — TDD)

---

## ✅ 완료 조건

- [ ] `grep -rn "_sanitizeDescription" 02.Source` — 정의 **1곳**(공통 유틸), 나머지는 호출/import만
- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` green (시작값 대비 비감소 + 신규 fail 0)
- [ ] `npm run lint` 0 problems
- [ ] reviewer 통과 (backend-contract 깃발 — 무조건 호출)

---

## 📚 학습 포인트

- **DRY(Don't Repeat Yourself)** — 같은 로직이 두 곳에 있으면 한쪽만 고치는 버그가 생긴다. 단일 진실로 모은다.
- **static 메서드 → 순수 함수** — 클래스에 묶일 이유가 없는(인스턴스 상태를 안 쓰는) 메서드는 모듈 함수가 더 재사용·테스트하기 쉽다.

---

## ⚠️ 함정

- **로직이 미묘하게 다를 수 있다** — "중복"처럼 보여도 한쪽이 추가 처리를 할 수 있다. 본문을 *반드시* 대조하고, 다르면 통합 전 보고.
- **backend-contract 깃발** — `01_agents/`는 엔진 추상화 계약. 한 곳 변경이 어댑터 전체 영향 → reviewer 무조건 + 거동 불변 엄수.
- **import 순환 주의** — 공통 유틸을 두 파일이 import하므로, 유틸이 역으로 둘을 import하면 순환. 유틸은 의존 없는 말단에.

---

## 담당 SubAgent

복잡 등급 → `coordinator` 경유 → `agent-backend` Worker (`02.Source/main/01_agents/**` R/W) + `reviewer` 통합. 완료 = `-DONE.md` + HTML 시각화.

> ⚠️ **양식 부담 주석**: 실 작업량은 메서드 1개 추출(보통급)이나, backend-contract 깃발의 §3 등급 상향으로 복잡 양식 적용(영호 결정 — 일관성 우선). coordinator는 단일 Worker 위임 + 통합만 하는 경량 경유여도 무방.
