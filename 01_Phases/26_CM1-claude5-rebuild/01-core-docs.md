---
owner: 유영호
milestone: CM1
phase: 01
title: 의미 층 — CORE 재편 · 문서 정본 이사 · ADR 승계표
status: pending
grade: 복잡
loop_track: human-gate
estimated: 4h (결정 포인트 6개 — 과밀 시 01a 의미 결정 / 01b 문서 이사로 분할, plan-auditor 🟡2)
domain: cross
summary: 무엇이 게이트 의미로 남는가(CORE 13조항 재편)를 확정하고, 문서 정본을 중복·이력 없이 이사하며, 이 트랙 자체의 ADR 승계표와 conformance codex gap 처리를 만든다. 이후 전 Phase의 전제.
---

# Phase 01: 의미 층 — CORE·문서 정본

> **상태**: pending · **마일스톤**: CM1 · **등급**: 복잡 · **담당**: 메인 + 영호 (대화 확정) → 격리 서브 (백지 작성)

## 🎯 목표

새 CORE.md(게이트 의미의 엔진 중립 정본)와 재작성 정본 문서들의 초안이 `drafts/`에 존재하고, 이사 결정의 ADR 승계표가 확정된다. "무엇이 기계 강제로 남는가"가 이 Phase에서 결정되므로 조직(02)·운영(03)·훅(04)의 전제다.

## ⏪ 사전 조건

- [ ] Phase 00 완료 (브랜치·drafts 스캐폴드·배정표·**격리 스폰 런북 프로브 성공** — 실패 상태로 진입 금지)

## 📝 작업 내용

공통 루프(카드 → 대화 → 브리프 → 격리 작성 → 이중 검증 → 로그)로 아래 결정 포인트를 소화한다:

- [ ] **CORE 13조항 재편** — 보존 전제: 신뢰 경계(01)·엔진 추상화(02)·시크릿(03)·IPC 단일 정의(04)·비가역 사람 게이트(06 v3)·파괴 금지(07)·하네스 봉인(11)·엔진 격리(12). 영호 판단: TDD(05)·커밋 규율(09)·등급/보고(10)·응대(13)·구조 변경=ADR(08)의 존폐·통합.
- [ ] **문서 통폐합**: FEATURE_MAP→PRD 흡수, ROOT_LAYOUT→ARCHITECTURE 흡수, 죽은 문서(HARNESS_PORT_MANIFEST·REPL_TRANSITION·MAPPING.md) 아카이브 확정.
- [ ] **CHANGELOG 한 줄 규율** 재정의(기존 이력은 절단·아카이브, 신규부터 적용 — `_decisions.md`가 파일럿).
- [ ] **BACKLOG 이월분 선별** — 살아있는 항목만 새 BACKLOG로.
- [ ] **ADR 승계표**: 이 트랙의 신설 ADR 1건 + 개정·supersede 목록(ADR-010·034·037·038 계보). ADR 42개 본문은 보존, 인덱스(ADR.md)만 재작성.
- [ ] **conformance codex gap 처리**: 재편 조항의 codex 축 `conformedVersion=0` + gap을 BACKLOG 등재(ADR-040 §5 경로). AGENTS.md 갱신은 Codex 세션 백로그로 명시.

## ✅ 완료 조건

- [ ] `drafts/00_Documents/00_Harness/CORE.md` + 재작성 정본 초안 존재, 영호 육안 확정
- [ ] 메인의 의미 누락 검증 통과 (보존 전제 8개 조항의 의미가 전부 새 판에 실재)
- [ ] ADR 승계표가 `_decisions.md`에 박제되고 신설 ADR 초안이 drafts에 존재
- [ ] conformance 새 manifest 초안: 조항 파싱·양방향 매핑·codex gap 선언(검사 ①②⑤ 상당) 유효 + **impl 실재 red는 "예상 red 목록"으로 `_decisions.md` 박제** (plan-auditor 🔴1 — impl은 Phase 04·05 산출이라 이 시점 red가 정상. 전체 red 0 판정은 Phase 06 사전 조건에 일원화)

## 📚 학습 포인트

- 정본(single source of truth) 설계 — "한 사실은 한 곳에만, 나머지는 참조"가 rot을 막는 구조적 이유.
- supersede 체인 — 결정을 지우지 않고 계보로 잇는 ADR 관리법.

## ⚠️ 함정

- 브리프에 구 문안을 인용하면 문체 오염이 그대로 전파된다 — 결정 카드(불릿 계약)만 넘긴다.
- CORE 번호를 재편하면 훅·테스트·manifest의 참조가 전부 흔들린다 — 새 번호 매핑표를 이 Phase에서 확정해 Phase 4·6에 넘긴다.
- `.codex/**`는 읽지도 않는다(CORE-12) — codex 축은 gap 등재로만 처리.

## 담당 SubAgent

대화·브리프·검증 = 메인. 백지 작성 = 격리 환경의 Opus 5 서브(`claude-opus-5` 명시, 프로브 ⑤ 반영).
