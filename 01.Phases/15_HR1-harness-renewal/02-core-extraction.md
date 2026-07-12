---
owner: 영호
milestone: HR1
phase: 02
title: 3층 구조 설계 박제 + 공통 코어 추출
status: done
grade: 복잡
loop_track: human-gate
estimated: 2~4h
domain: cross
summary: 엔진 중립 안전 코어(00.Documents/harness/)를 신설하고 하네스 3층 구조를 신규 ADR로 박제한다.
---

# Phase 02: 3층 구조 설계 박제 + 공통 코어 추출

> **상태**: done · **마일스톤**: HR1 · **등급**: 복잡 · **담당**: 메인 직접 + 영호 승인 게이트

---

## 🎯 목표

`00.Documents/harness/`에 **엔진 중립 안전 코어 정본**이 생기고, "코어/Claude 어댑터/Codex 어댑터" 3층 구조가 신규 ADR로 박제된다. 이후 어떤 엔진이 와도 안전 의미는 한 곳만 고치면 되는 상태.

## ⏪ 사전 조건

- [x] P01 완료 (ff5668f — `00.Documents/adr/` 33파일 + 인덱스)

## 📝 작업 내용

- [x] `00.Documents/harness/CORE.md` 작성 — **현행 의미의 추출이지 신규 발명이 아님**. 출처: CLAUDE.md CRITICAL 규칙·`.claude/policies/**`·AGENTS.md §4·§6. 수록: 신뢰경계 / 비가역 사람 게이트(push·PR·merge·배포·스키마 마이그) / TDD / 시크릿 / 파괴명령 금지 / 보고·등급의 엔진 중립 의미
- [x] 의미 출처 매핑표 작성(코어로 간 것 / Claude 전용 잔류 / Codex 전용 잔류) — P03·P05의 작업 명세가 됨 (`00.Documents/harness/MAPPING.md` — 이중 서술 13건 액션 지도)
- [x] 코어 조항에 안정 clause ID·버전 부여(예: CORE-01 신뢰경계 v1) + machine-readable manifest 작성(`00.Documents/harness/core-manifest.json` — 조항별 Claude/Codex 구현·검증 지점 선언) — 어댑터 정합을 사람 눈이 아니라 기계가 검사할 기반 (Codex adversarial #4)
- [x] 신규 ADR 초안(하네스 3층 구조 — 결정·이유·트레이드오프: 문서 계층 1단 증가 vs 드리프트 원인 제거) → `00.Documents/adr/`에 박제 (ADR-034)
- [x] **영호 설계 승인 게이트** (버킷 c — 설계 분기) — 통과(2026-07-12, 검토 포인트 4건 원안 확정)
- [x] secretary: 커밋 + CHANGELOG [H]

## ✅ 완료 조건

- [x] `00.Documents/harness/CORE.md` + 매핑표 + 신규 ADR 존재, 영호 승인
- [x] 코어 내용이 기존 문서와 의미 충돌 0 (추출 검증 — MAPPING.md 항목별 출처, 설계 승인)
- [x] CLAUDE.md/AGENTS.md는 이 Phase에서 **무변경** (이중 서술 해소는 P03/P05 몫임을 매핑표에 명시 — git 무변경 확인)
- [x] 전 코어 조항이 clause ID·버전·양 엔진 매핑을 가짐 — 미매핑 조항 0 (core-manifest.json 선언 부재 불허, conformance 게이트 기계화는 P06)

## 📚 학습 포인트

- **관심사 분리(separation of concerns)를 문서에 적용** — "무엇이 안전인가(코어)"와 "어떻게 강제하나(어댑터)"의 분리. 코드의 인터페이스/구현 분리와 동형.
- **단일 진실 원천(SSoT, Single Source of Truth)** — 드리프트는 동기화 노력 부족이 아니라 *정본이 두 개인 구조*의 필연.

## ⚠️ 함정

- **코어에 조직론 넣지 말 것** — Supervisor 전임·워커 함대·등급별 동원 패턴은 Claude 어댑터 층. 코어는 엔진이 바뀌어도 참인 문장만.
- **이중 서술 기간 최소화** — P02 종료 시점엔 코어와 기존 문서에 같은 의미가 잠시 공존(P03/P05가 해소). 이 기간에 의미 수정 금지.
- 새 최상위 폴더 아님(`00.Documents/` 하위) — ADR "새 최상위 폴더" 조항 저촉 없음. 그래도 구조 결정이므로 ADR 박제.

## 담당 SubAgent

메인 직접(하네스 설계 = 영호 단독 통제 대행) + secretary(커밋·CHANGELOG)

## ✅ 승인 기록

**설계 승인 게이트 통과(영호 2026-07-12)** — 검토 포인트 4건 원안 확정(CORE-13 포함 유지 / manual 검증 허용·선언 부재 불허 / CRITICAL 요지 잔류 / CORE-03 공백 백로그 등재). 검토 보고서 = 00.Documents/reports/HR1-P02-설계검토.html
