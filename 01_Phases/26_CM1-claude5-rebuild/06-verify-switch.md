---
owner: 유영호
milestone: CM1
phase: 06
title: 검증 + 스위치 — 스테이징 green → OpenGate 창 배치 → 재봉인
status: pending
grade: 복잡
risk: irreversible
loop_track: human-gate
estimated: 2h
domain: cross
summary: 스테이징 검증을 통과한 새 하네스를 영호가 연 창에서 실경로로 배치한다. canonical 2벌 교체 → 배치 → 아카이브 → 동기 체크리스트 → 명시 커밋 → 재봉인 → 세션 즉시 종료의 고정 순서.
---

# Phase 06: 검증 + 스위치

> **상태**: pending · **마일스톤**: CM1 · **등급**: 복잡 · **위험**: irreversible (실경로 하네스 교체) · **담당**: 영호(창 개폐·승인) + 메인(창 안 실행)

## 🎯 목표

새 하네스가 실경로에서 살아 있고(라이브 프로브 3종 green), 구본은 아카이브에 보존되며, 전 과정이 2커밋(스위치 + 재봉인 동기)으로 revert 가능하다.

## ⏪ 사전 조건

- [ ] Phase 01~05 산출물 전부 drafts에 확정
- [ ] 스테이징 검증 green: drafts 미러 훅 테스트 + settings 3벌 파싱 + conformance `--root` (codex gap = WARN)

## 📝 작업 내용 (순서 고정 — 바꾸지 않는다)

- [ ] 권한 모드 **default** 확인 (auto 모드는 하네스 편집을 조용히 거부 — 2026-07-29 실측)
- [ ] 영호 **OPEN-GATE** 실행
- [ ] **canonical 2벌 교체** (`98_Management/Harness_OpenGate/settings.SEALED.json`·`settings.OPEN.json` ← 신판) — 이 스텝을 건너뛰면 CLOSE-GATE가 구본으로 롤백한다
- [ ] drafts → 실경로 배치 (`.claude/**`·`CLAUDE.md`·`00_Documents` 재작성분)
- [ ] 구본 아카이브로 `git mv` (⚠️ `core.ignorecase=true` — 대소문자 전용 개명은 무음 no-op, 이름을 실질적으로 바꾼다)
- [ ] **동기 전수 체크리스트** 소화: core-manifest impl 경로 실재 / `package.json` `test:hooks` 경로 / `agent-model-canon.test.ts`·`harness-conformance.test.ts` 기대표 / BACKLOG(codex gap 등재분) / `.gitattributes` / `.claude/state` 잔재(`tdd-enforce` 플래그 등) / `.claude/CHANGELOG.md` 포인터 / CHANGELOG 항목 1줄
- [ ] **명시 스테이징 커밋** (`git add .` 금지 유지 — 위 체크리스트가 열거 실수를 막는다)
- [ ] 영호 **CLOSE-GATE** (신 SEALED로 봉인) → **그 세션 즉시 종료** — git mv 직후 그 세션의 훅 배선은 시작 스냅샷이라 무게이트 구간, 커밋 후 어떤 작업도 하지 않는다
- [ ] **새 세션**에서: 라이브 발화 프로브 3종(봉인 차단·파괴 차단·비가역 ask — 다이얼로그 미출현 = 사고, 즉시 중단·보고) + **재봉인 동기 커밋**(활성 settings.json ≡ 신 SEALED — 스위치 커밋은 창이 열린 동안이라 OPEN 판이 박제되므로 CLOSE 후 동기 1커밋이 필요, plan-auditor 🟡1 · 전례 021f531) + revert 복구 runbook을 본 폴더에 박제

## ✅ 완료 조건

- [ ] 스위치 1커밋 + 재봉인 동기 1커밋 (revert 단위 2커밋)
- [ ] 새 세션 라이브 프로브 3종 green 로그 박제
- [ ] 앱 회귀 게이트(typecheck·test) green — 하네스 결합 테스트 2종 포함
- [ ] OpenGate CLOSED + 신 SEALED ≡ 활성 settings 검증

## 📚 학습 포인트

- 원자적 전환(atomic switchover) — 흩어진 동기 대상을 최소 커밋 단위(스위치 + 재봉인 동기)로 묶고, 전환 중 무방비 구간을 절차(세션 종료)로 봉하는 설계.

## ⚠️ 함정

- 창이 열린 김에 다른 봉인 파일을 "겸사겸사" 고치지 않는다 — 스위치는 창의 마지막이자 유일한 행위.
- push·PR·merge는 이 Phase에 없다 — 로컬 커밋까지. 원격 반영은 트랙 종결 시 여느 때처럼 ask 게이트.

## 담당 SubAgent

없음 — 영호(개폐·육안) + 메인(창 안 배치·커밋 직접, CORE-11 창 예외).
