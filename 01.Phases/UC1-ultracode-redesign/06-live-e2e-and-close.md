---
owner: 영호
milestone: UC1
phase: 06
title: 라이브 e2e — mid-session UltraCode 실증 + 회귀 스윕 + 마일스톤 마감
status: done
grade: 보통
loop_track: auto-gate
estimated: 1.5h
domain: cross
summary: ADR-032(v2) 완료조건 ① 라이브 실증(진행 중 대화에서 토글 ON → Workflow → perm-card → 결과) + 비승격·deny 가시화 실증 + 기존 라이브 스펙 정합 + DONE 박제
---

# Phase 06: 라이브 e2e — mid-session UltraCode 실증 + 회귀 스윕 + 마일스톤 마감

> **상태**: done
> **마일스톤**: UC1-ultracode-redesign
> **등급**: 보통 (검증·마감 — 삭제/추가 소폭)
> **담당**: cross (qa 주도 + 메인 세션 문서·조율)

---

## 🎯 목표

ADR-032(개정 v2 반영) 완료조건 ①이 실 SDK로 실증된다: **진행 중 대화**(이미 몇 턴 나눈 held-open 세션)에서 UltraCode 토글 ON → Workflow 호출 → perm-card → 결과 복귀. 라이브 일괄에서 실증했던 "시퀀스 무력" 함정이 소멸했음을 같은 형태의 테스트로 증명하고, v2 신설분(키워드 비승격·G4 deny 가시화)을 함께 실증한 뒤 마일스톤을 마감한다.

---

## ⏪ 사전 조건

- [ ] Phase 05·07~10 완료 (전 축 구현 + P05·P07 묶음 육안 승인)

---

## 📝 작업 내용

- [ ] `orchestration-live.e2e.ts` 확장(qa): Test2의 "새 대화 분리"를 **역이용** — 신규 Test3 "같은 대화 진행 중 mid-session UltraCode ON → Workflow" (구 구조에선 실패했을 시나리오가 이제 PASS = ADR-032 증거). 기존 Test1·Test2는 불변(회귀 유지) + **L138-144 "후속 send 토글 무력" 설명 주석이 UC1 후 거짓이 되므로 갱신**(plan-auditor). 라이브 스펙 표준(bootGates+프로필 격리+settleTurn) 준수.
- [ ] **(v2 교체) 키워드 비승격 + deny 가시화 라이브 확인** — 토글 OFF + 메시지에 "ultracode" 언급 → orchestration=false로 전송됨(비승격) + 모델이 Workflow를 시도하면 즉시 deny + 대화창에 orchestration_denied 시스템 라인 표시. (구 "키워드 → Workflow 발화" 케이스는 v2에서 폐지된 의미론 — 반대 방향으로 실증.)
- [ ] **라이브 스윕 전수 열거(plan-auditor 🔴#1)**: `LIVE_SDK=1`로 `orchestration-live`(Test1~3) + **`ultracode-demo`(P04 치환분 라이브 검증)** + `multi-ultracode` 관련 라이브 게이트 여부 확인분 — 전부 PASS.
- [ ] ※ (v2 갱신) mid-session 토글 실증(Test3)은 P03 완료 시점부터 가능하나, 비승격·deny 가시화 케이스는 **P07·P09·P10 완료가 전제** — 라이브 스윕은 P07~P10 뒤 일괄이 실용적. 문서 마감(DONE·CHANGELOG)은 육안 승인 뒤.
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
