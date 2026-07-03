---
owner: 영호
milestone: UC1
phase: 06
title: 라이브 e2e — mid-session UltraCode 실증 + 회귀 스윕 + 마일스톤 마감
status: pending
grade: 보통
loop_track: auto-gate
estimated: 1.5h
domain: cross
summary: ADR-032 완료조건 ① 라이브 실증(진행 중 대화에서 토글/키워드 → Workflow → perm-card → 결과) + 기존 라이브 스펙 정합 + DONE 박제
---

# Phase 06: 라이브 e2e — mid-session UltraCode 실증 + 회귀 스윕 + 마일스톤 마감

> **상태**: pending
> **마일스톤**: UC1-ultracode-redesign
> **등급**: 보통 (검증·마감 — 삭제/추가 소폭)
> **담당**: cross (qa 주도 + 메인 세션 문서·조율)

---

## 🎯 목표

ADR-032 완료조건 ①이 실 SDK로 실증된다: **진행 중 대화**(이미 몇 턴 나눈 held-open 세션)에서 UltraCode 토글 ON 또는 키워드 언급 → Workflow 호출 → perm-card → 결과 복귀. 라이브 일괄에서 실증했던 "시퀀스 무력" 함정이 소멸했음을 같은 형태의 테스트로 증명하고 마일스톤을 마감한다.

---

## ⏪ 사전 조건

- [ ] Phase 05까지 완료 (전 축 구현 + 육안 승인)

---

## 📝 작업 내용

- [ ] `orchestration-live.e2e.ts` 확장(qa): Test2의 "새 대화 분리"를 **역이용** — 신규 Test3 "같은 대화 진행 중 mid-session UltraCode ON → Workflow" (구 구조에선 실패했을 시나리오가 이제 PASS = ADR-032 증거). 기존 Test1·Test2는 불변(회귀 유지) + **L138-144 "후속 send 토글 무력" 설명 주석이 UC1 후 거짓이 되므로 갱신**(plan-auditor). 라이브 스펙 표준(bootGates+프로필 격리+settleTurn) 준수.
- [ ] 키워드 트리거 라이브 확인 1케이스(토글 OFF + 메시지에 "ultracode" 언급 → Workflow 경로 발화). 부수 관찰: "언급 ≠ 요청" 오탐(예: "ultracode 어떻게 꺼?")은 ADR-032 의도된 동작(deny 가능한 카드 1장) — 시나리오에 오탐 체감 메모 남기기.
- [ ] **라이브 스윕 전수 열거(plan-auditor 🔴#1)**: `LIVE_SDK=1`로 `orchestration-live`(Test1~3) + **`ultracode-demo`(P04 치환분 라이브 검증)** + `multi-ultracode` 관련 라이브 게이트 여부 확인분 — 전부 PASS.
- [ ] ※ 본 Phase의 라이브 실증(Test3·키워드)은 **P04 완료 시점부터 착수 가능**(P05 하이라이트와 직교) — P05 육안 대기와 병렬 가능, 문서 마감(DONE·CHANGELOG)만 P05 뒤.
- [ ] 전체 회귀: `npm run typecheck`·`test`·`lint`·`build` green + 비라이브 skip 경로 무회귀.
- [ ] 문서 마감(메인 세션 직접): ADR-032 현황 줄 "구현 완료" 갱신(결정 본문 불변) · UI.md 반영분 확인 · `.claude/CHANGELOG.md` [M] 엔트리(상호작용 의미론 + 권한 게이트 경로 변경).
- [ ] `UC1-DONE.md` 박제(복잡 Phase 포함 — 5단계 보고) + `00.Documents/reports/UC1-ultracode-redesign.html`.

## ✅ 완료 조건

- [ ] 라이브: mid-session 토글 케이스 + 키워드 케이스 실 SDK PASS
- [ ] typecheck 0 / test green / lint 0 / build green
- [ ] reviewer 통합 점검(마일스톤 전체 diff) CRITICAL 0
- [ ] CHANGELOG [M] + UC1-DONE.md + HTML 리포트 존재

## 📚 학습 포인트

- **버그 재현 테스트의 재활용** — 함정을 실증했던 시나리오(시퀀스 mid-session)를 그대로 "고쳐졌음의 증거"로 뒤집는다 — RMW1 P01→P04와 같은 패턴의 라이브판.

## ⚠️ 함정

- 라이브 실행은 한 번에 한 스펙(Electron 경합) + 실 토큰 소모(attended 전제).
- push·PR·merge는 사람 게이트 — 마감 보고 후 영호 GO.

## 담당 SubAgent

cross — qa(라이브 e2e) + 메인 세션(문서·DONE·조율)
