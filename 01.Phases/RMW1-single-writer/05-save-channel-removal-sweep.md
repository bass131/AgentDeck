---
owner: 영호
milestone: RMW1
phase: 05
title: 통짜 SAVE 채널 제거 + 회귀 스윕 + 문서 정합 (마일스톤 마감)
status: pending
grade: 보통
risk: trust-boundary
loop_track: auto-gate
estimated: 1.5h
domain: cross
---

# Phase 05: 통짜 SAVE 채널 제거 + 회귀 스윕 + 문서 정합 (마일스톤 마감)

> **상태**: pending
> **마일스톤**: RMW1-single-writer
> **등급**: 보통 (삭제 위주 — 컴파일 타임 강제로 기계 검증)
> **담당**: cross (shared-ipc 주도 삭제 + qa 회귀 — 메인 세션 조율)

---

## 🎯 목표

blob 통짜 `MULTI_SESSION_SAVE`가 계약·preload·핸들러에서 완전히 사라져 **renderer 측 RMW 재발이 컴파일 타임에 불가능**해진다. 전체 회귀 게이트 + reviewer 통합 점검 + 문서 정합으로 마일스톤을 마감한다.

---

## ⏪ 사전 조건

- [ ] Phase 04 완료 (renderer에 SAVE 호출 잔존 0)

---

## 📝 작업 내용

- [ ] `02.Source/shared/ipc/multi.ts`에서 `MULTI_SESSION_SAVE` 채널·타입 제거
- [ ] `02.Source/preload/index.ts` 노출 제거 / `02.Source/main/00_ipc/handlers/multi.ts` 핸들러 제거
- [ ] 전 소스 grep: `MULTI_SESSION_SAVE`·`multi.save` 잔존 0
- [ ] `00.Documents/ARCHITECTURE.md` 멀티세션 영속 데이터흐름 서술 갱신 (단일 기록자 = main, 명령 5종)
- [ ] ADR-031 **현황** 줄 갱신(구현 완료 표기) — 결정 본문 불변
- [ ] 멀티패널 e2e 회귀 (라이브 불가 시 기존 e2e 스위트 범위에서 — 라이브 실측은 "라이브 e2e 일괄" 건에 위임)
- [ ] reviewer 통합 점검 (마일스톤 전체 diff 대상)
- [ ] RMW1-DONE.md 박제 (복잡 Phase 포함 마일스톤 — 5단계 보고 + HTML 시각화). **ADR-031 완료조건 ④(멀티패널 e2e 라이브 회귀)는 "라이브 e2e 일괄" 잔여 건으로 이월임을 명기** — 추적 끊김 방지 (plan-auditor 🟡3)

---

## ✅ 완료 조건

- [ ] `MULTI_SESSION_SAVE`/`multi.save` grep 잔존 0
- [ ] `npm run typecheck` (양쪽) 0 / `npm run test` green (P01 3계열 GREEN 유지) / `npm run lint` 0 / `npm run build` green
- [ ] reviewer 통합 CRITICAL 0
- [ ] CHANGELOG [M] 엔트리 (shared 계약 행동 변경 — SAVE 제거·명령 5종)

---

## 📚 학습 포인트

- **"금지"보다 "불가능"** — 규칙 문서로 RMW를 금지하는 대신 채널 자체를 없애면 위반이 컴파일 에러가 된다. 가드레일은 문서가 아니라 타입 시스템에 박는 게 제일 싸다.

---

## ⚠️ 함정

- 계약 제거는 양쪽 동시 영향 — shared 변경 후 main·renderer **양쪽** typecheck 필수 (헌법 CRITICAL).
- e2e 헬퍼·픽스처가 옛 SAVE를 직접 부를 수 있음 — 테스트 코드도 grep 범위에 포함.

---

## 담당 SubAgent

cross — shared-ipc(삭제) + qa(회귀), 메인 세션 조율. 문서 갱신 중 ADR 현황 줄은 영호 통제 영역이라 메인 세션이 직접.
