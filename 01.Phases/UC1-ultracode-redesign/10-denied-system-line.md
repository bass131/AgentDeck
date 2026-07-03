---
owner: 영호
milestone: UC1
phase: 10
title: 차단 가시화 — orchestration_denied 시스템 라인 표시 (renderer)
status: pending
grade: 보통
loop_track: auto-gate
estimated: 1h
domain: renderer
summary: orchestration_denied 이벤트를 대화 thread에 시스템 라인으로 렌더 — "UltraCode 꺼짐, Workflow 차단 + 켜는 법" 카피
---

# Phase 10: 차단 가시화 — orchestration_denied 시스템 라인 표시 (renderer)

> **상태**: pending
> **마일스톤**: UC1-ultracode-redesign
> **등급**: 보통 (기존 시스템 라인/카드 관례 재사용 — 신규 시각 문법 없음이면 auto-gate, 새 문법 필요 시 육안 승격 보고)
> **담당**: renderer

---

## 🎯 목표

OFF 턴에 모델이 Workflow를 시도해 차단되면 대화창에 **시스템 라인 1줄**이 뜬다: "UltraCode가 꺼져 있어 Workflow 호출이 차단됐어요 — 켜려면 컴포저의 UltraCode 토글" 취지. 사용자가 영문 모를 상황 소멸(ADR-032 v2 ④).

---

## ⏪ 사전 조건

- [ ] Phase 09 완료 (이벤트가 실제 방출됨)

---

## 📝 작업 내용

- [ ] reducer: `orchestration_denied` 케이스 추가 — thread에 시스템 라인 아이템 push(기존 시스템/알림 라인 관례 조사 후 재사용 — 새 시각 문법 발명 금지. 마땅한 관례가 없으면 보고 후 확정).
- [ ] 표시 카피는 renderer에 상수로(계약에 카피 없음 — P08 결정). `reason` 리터럴 → 카피 매핑.
- [ ] 단위 테스트: 이벤트 → thread 아이템 생성 / 알 수 없는 reason 안전 처리(기본 카피) / 중복 이벤트 중복 라인 허용 여부 결정·고정.

## ✅ 완료 조건

- [ ] reducer·표시 단위 테스트 green
- [ ] `npm run typecheck` 0 / `npm run test` green / `npm run lint` 0
- [ ] reviewer CRITICAL 0

## 📚 학습 포인트

- **이벤트 → 카피 매핑의 위치** — 사용자 문구를 shared 계약에 넣으면 카피 수정마다 계약 변경이 된다. 리터럴 reason(기계값)과 카피(표시값)를 분리하면 각자 자기 속도로 진화한다.

## ⚠️ 함정

- 시스템 라인이 모델 말풍선처럼 보이면 안 됨(발화 주체 혼동) — 기존 시스템 표기 관례 준수.
- 이벤트 폭주(모델이 연속 시도) 시 라인 도배 가능성 — 같은 턴 내 dedup을 검토하되 과설계 금지(발생 빈도 낮음, 단순하게).

## 담당 SubAgent

renderer
