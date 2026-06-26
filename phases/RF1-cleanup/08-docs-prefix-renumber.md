---
owner: 영호
milestone: RF1
phase: 08
title: docs 번호접두 + CLAUDE.md 문서지도 링크 갱신
status: pending
grade: 대규모
risk: harness
loop_track: human-gate
estimated: 1.5h
domain: cross
summary: docs/ 파일을 읽기순서 번호접두(00.PRD~)로 재명명 + CLAUDE.md 문서지도·ADR·상호 링크 전부 갱신
---

# Phase 08: docs 번호접두 + CLAUDE.md 문서지도 링크 갱신

> **상태**: pending
> **마일스톤**: RF1-cleanup (트랙 B · 구조)
> **등급**: 대규모 (docs 참조 .md 18개 + CLAUDE.md 헌법 + policies 다수 링크 전수 + harness 깃발 상향)
> **담당**: 메인 직접 (초안) → **영호 확정** (헌법/docs = 사용자 통제)

---

## 🎯 목표

`docs/` 파일을 읽기 순서대로 번호접두(예: `00.PRD.md`·`01.ARCHITECTURE.md`·`02.ADR.md`·`03.UI.md`·`04.FEATURE_MAP.md`…)로 재명명하고, 이를 참조하는 **모든 링크**(`CLAUDE.md` 문서지도, ADR 상호참조, policies의 `../../docs/*` 링크)를 정합한다.

---

## ⏪ 사전 조건

- [ ] Phase 04 — ADR-027 확정 (docs 포함 범위)
- [ ] **Phase 06·07 완료** — 06·07이 `docs/UI.md`·`docs/ARCHITECTURE.md`를 *참조*하므로, 08(docs rename)이 먼저 끝나면 그 참조가 stale (주의4). 08은 트랙 B의 **마지막**.

---

## 📝 작업 내용

- [ ] `docs/` 파일 읽기 순서 합의 (PRD→ARCHITECTURE→ADR→UI→FEATURE_MAP→…)
- [ ] `git mv`로 번호접두 재명명
- [ ] **링크 갱신 전수**: `CLAUDE.md` "문서 지도" 섹션, `docs/ADR.md` 내부 상호참조, `.claude/policies/**`의 `../../docs/*.md` 링크, `.claude/agents/**` 참조, **`scripts/hooks/**` 주석의 `docs/*.md` 경로**(예: dangerous-cmd-guard.sh — 주의6)
- [ ] 깨진 링크 스캔 (markdown 링크 checker 또는 grep `docs/` 참조 — `.md`·`.sh`·`.json` 전체)
- [ ] `CLAUDE.md`·`docs/**` 변경분 = **영호 확정**

---

## ✅ 완료 조건

- [ ] `docs/` 전 파일 번호접두 정합
- [ ] 깨진 마크다운 링크 0 (전 `.md`에서 `docs/` 참조 검증)
- [ ] `CLAUDE.md` 문서지도가 실제 파일명과 1:1
- [ ] `.claude/CHANGELOG.md` [M] 한 줄
- [ ] **영호 확정** (헌법 문서 변경 = human-gate)

---

## 📚 학습 포인트

- **링크 정합성** — 파일을 옮기면 그걸 가리키는 모든 링크가 깨진다. "참조 그래프"를 의식한 일괄 갱신.
- **문서 읽기 순서의 가치** — 번호접두는 "어디부터 읽나"를 파일 시스템이 답하게 함 (신규 합류자 온보딩).

---

## ⚠️ 함정

- 깨진 링크는 typecheck가 못 잡음 (마크다운) → 전용 grep/checker 필수.
- `CLAUDE.md`는 헌법 = 사용자 단독 통제. AI 초안 → 영호 확정.
- policies 상대경로(`../../docs/`)는 깊이 주의 — 한 칸 틀리면 깨짐.

---

## 담당 SubAgent

> 메인 직접 (링크 grep·git mv) → 영호 확정 (헌법/docs).
