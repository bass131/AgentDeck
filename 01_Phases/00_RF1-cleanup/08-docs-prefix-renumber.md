---
owner: 영호
milestone: RF1
phase: 08
title: docs 번호접두 + CLAUDE.md 문서지도 링크 갱신
status: superseded
grade: 대규모
risk: harness
loop_track: human-gate
estimated: 1.5h
domain: cross
summary: docs/ 파일을 읽기순서 번호접두(00.PRD~)로 재명명 + CLAUDE.md 문서지도·ADR·상호 링크 전부 갱신
---

# Phase 08: docs 번호접두 + CLAUDE.md 문서지도 링크 갱신

> **상태**: ⚠️ **superseded (2026-07-26)** — 미이행 상태로 `done` 처리돼 있었다. 아래 「⚠️ 상태 정정」 참조.
> **마일스톤**: RF1-cleanup (트랙 B · 구조)
> **등급**: 대규모 (docs 참조 .md 18개 + CLAUDE.md 헌법 + policies 다수 링크 전수 + harness 깃발 상향)
> **담당**: 메인 직접 (초안) → **영호 확정** (헌법/docs = 사용자 통제)

---

## ⚠️ 상태 정정 (2026-07-26, NC 마일스톤 유지보수 창 1)

이 문서는 **네 겹 모순** 상태였다 — frontmatter `status: done` ↔ 본문 「상태: pending」 ↔ 아래 체크박스 **전부 미체크** ↔ **실제 구현 0건**(`00_Documents/` 루트 `.md` 에 번호접두는 존재한 적이 없다). 기계는 frontmatter를 읽고 사람은 본문을 읽으므로, 둘이 갈라지는 순간 "완료"라는 말이 아무 뜻도 갖지 않는다.

**결론**: 이 Phase가 하려던 일은 **폐기가 아니라 방향이 바뀌었다.**

- **파일 번호접두는 하지 않기로 확정** — `00_Documents/` 루트 `.md` 7개는 번호를 붙이지 않는다(영호 결정 2026-07-26). `CLAUDE.md` 「문서 지도」가 이미 읽는 순서를 문장으로 소유하고 있어 번호가 중복 정보이고, 헌법·정책·훅 다수가 이 파일들을 **경로 리터럴**로 가리켜 개명 파장이 이득보다 크다.
- **대신 `00_Documents/` *하위 폴더*에 `NN_PascalCase` 를 적용**한다 → **ADR-027 개정 1**이 이 전환을 소유한다.
- 실행 이월처 = **`01_Phases/22_NC-naming-placement/`** (Phase 01·02·05).

📌 **이 항목을 지우지 않고 남기는 이유**: 이 모순이 곧 NC 마일스톤의 진단 근거다. *"규칙이 없다"* 와 *"규칙이 안 지켜진다"* 는 다른 병이고, 이번 진단은 후자였다. 기록을 지우면 다음 세션은 다시 전자로 오진한다.

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
- [ ] **링크 갱신 전수**: `CLAUDE.md` "문서 지도" 섹션, `docs/ADR.md` 내부 상호참조, `.claude/policies/**`의 `../../docs/*.md` 링크, `.claude/agents/**` 참조, **`.claude/hooks/**` 주석의 `docs/*.md` 경로**(예: dangerous-cmd-guard.sh — 주의6)
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
