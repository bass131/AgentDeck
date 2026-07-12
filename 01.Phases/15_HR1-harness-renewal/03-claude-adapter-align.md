---
owner: 영호
milestone: HR1
phase: 03
title: Claude 어댑터 정합 — CLAUDE.md·policies 코어 참조화
status: done
grade: 복잡
loop_track: human-gate
estimated: 2~3h
domain: cross
summary: CLAUDE.md를 Claude 어댑터+진입점으로 재정렬하고(코어 참조·중복 서술 제거), REPL_TRANSITION stale 줄을 정정한다.
---

# Phase 03: Claude 어댑터 정합 — CLAUDE.md·policies 코어 참조화

> **상태**: done · **마일스톤**: HR1 · **등급**: 복잡 · **담당**: 메인 직접(헌법 = 영호 단독 통제 대행, diff 전체 영호 리뷰)

---

## 🎯 목표

CLAUDE.md가 "코어를 참조하는 Claude 어댑터 + 프로젝트 진입점"으로 재정렬된다. 안전 규칙의 *의미*는 코어 링크로 대체되고, CLAUDE.md에는 Claude 고유 실행 방식(멀티에이전트 조직론·hooks·정책 링크·응대 원칙)만 남는다.

## ⏪ 사전 조건

- [x] P02 완료 (코어 정본 + 의미 출처 매핑표 — 이 Phase의 작업 명세)

## 📝 작업 내용

- [x] CLAUDE.md 개정: 문서 지도에 `00.Documents/harness/` 추가 / CRITICAL 규칙 중 코어로 추출된 의미는 "정본 = 코어" 참조로 전환(중복 서술 제거 또는 요약+링크) / 멀티에이전트 분담·운영 모드 등 Claude 전용 층은 존치
- [x] REPL_TRANSITION 줄 "라이브 e2e 최종 사인오프는 잔여" → 완료로 정정 (**헌법 stale 플래그 해소** — work-pin 기록 건)
- [x] `.claude/policies/INDEX.md` 정합: 코어로 승격된 의미가 있는 정책은 머리말에 "의미 정본 = 코어" 참조 추가 (정책 본문 대수술은 범위 밖 — 참조 표기만)
- [x] 훅·스킬이 참조하는 문구/경로 파손 스캔 (`grep -rn "CLAUDE.md" .claude/`)
- [x] CLAUDE.md 내 Codex 언급(듀얼 백엔드 등)이 새 전담 보조 계약과 충돌하지 않는지 스캔 — 조직론 서술 발견 시 P05와 정합화 (plan-auditor 부수 권고)
- [x] **영호 diff 전체 리뷰 게이트** (헌법 = 영호 단독 통제)
- [x] secretary: 커밋 + CHANGELOG [H]

## ✅ 완료 조건

- [x] 동일 안전 의미가 CLAUDE.md와 코어에 이중 서술된 항목 0 (매핑표 대조)
- [x] REPL_TRANSITION stale 줄 정정 완료
- [x] `.claude/**` 내 CLAUDE.md 참조 파손 0
- [ ] 세션 재시작 후 헌법 로드 정상 (육안 1회) (다음 세션 시작 시 확인 예정)

## 📚 학습 포인트

- **헌법의 다이어트** — 진입점 문서는 "절대 규칙 + 지도"만. 규칙의 *본문*이 진입점에 살면 진입점이 비대해지고 어댑터마다 복제된다.

## ⚠️ 함정

- 헌법은 **hooks(pin-injector 컨텍스트)·스킬·에이전트 문서가 문구를 참조**할 수 있음 — 문구 변경 시 참조 스캔 필수.
- 요약+링크로 바꿀 때 **CRITICAL의 강제력이 약해 보이면 안 됨** — "CRITICAL" 라벨과 한 줄 요지는 CLAUDE.md에 잔류, 상세만 코어로.
- 이 Phase는 supervisor-guard 봉인 대상(CLAUDE.md) — **유지보수 창 개방 필요** (선례 2026-07-11).

## 담당 SubAgent

메인 직접(영호 단독 통제 대행) + secretary(커밋·CHANGELOG)

## ✅ 게이트 기록

영호 diff 전체 리뷰 승인(2026-07-12). 유지보수 창 개방 → 메인 직접 적용 → git restore 재봉인 → 봉인 프로브(Edit 차단) 확인. 부수 정정: 모델 목록 Sonnet 4.6→Sonnet 5, 응대 원칙에 외래어 음차 금지 명문화.
