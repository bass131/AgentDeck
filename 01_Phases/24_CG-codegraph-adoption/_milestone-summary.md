---
summary: CodeGraph(colbymchenry, v1.5.0)를 CLI-only·수동 갱신·인스톨러 격리로 채택한 단일 트랙 마일스톤. X 조사→GitHub 실사→파일럿 실측→유지보수 창 통합(스킬 3종·헌법 절·permissions 3벌·ADR-042)을 Phase 분해 없이 하루에 완주했다.
phase: CG-milestone (Phase 미분해 — 단일 트랙)
work-id: codegraph-adoption
status: done
grade: 보통
owner: 영호
completed_at: 2026-07-28
commit: 6d9dda1
---

# CG — CodeGraph 채택 완료 요약 (얇은 박제)

**소요 시간**: 2026-07-28 하루 (조사·실사·파일럿 → 유지보수 창 1회 → 재봉인·커밋·push)

> 📌 **왜 이 폴더에 Phase 파일이 없나** — 이 마일스톤은 `/work-plan` 분해 없이 진행됐다. 제품 코드 변경이 0이고(하네스·문서만), 흐름이 선형(조사→실사→파일럿→통합)이라 분해할 모호함이 없었으며, 등급도 「보통」이라 5단계 보고 의무 미달이다. 본 문서는 연대기(`01_Phases/INDEX.md`)가 "표현상 마일스톤인데 흔적이 없다"로 혼동되는 것을 막는 **항법용 얇은 박제**다(영호 지적 2026-07-28) — 상세 내용은 아래 정본들에 이미 분산 박제돼 있다.
> 📌 **왜 `-DONE.md`가 아닌가** — `-DONE.md` 파일명은 phase-gate-validator가 5단계 보고 형식 + 등급 복잡 이상을 강제하는 계약이다(작성 시도 → 훅 차단 실측 2026-07-28). 등급 보통의 요약 문서는 그 계약 밖 이름(`_milestone-plan.md` 관례의 짝 = `_milestone-summary.md`)을 쓴다.

## 진행 흐름 (전부 2026-07-28)

1. **조사** — X(트위터) 최신 트렌드로 후보군 확인.
2. **실사** — GitHub 저장소(colbymchenry/codegraph v1.5.0, MIT) 최근 커밋·이슈 질감 판정. 치명 후보 2건 하향(#1454 = MCP 지침 경유 컨텍스트 오염이라 CLI-only인 우리 조건 미성립 · #1451 Windows = 파일럿 미발현).
3. **인스톨러 해부** — `install`이 `.claude/settings.json`·CLAUDE.md·`~/.claude.json`을 백업 없이 자동 수정하는 4종 배선 확인 → "인스톨러 우회 + CLI만" 설계 확정.
4. **파일럿** — 영호 `!` 직접 실행: 733파일 인덱싱 ~3초 · DB 52.76MB · 노드 7,877/엣지 32,302 · 상주 프로세스 0. 채점: `callers` 100/100 · `impact` 상한 추정 · `explore`는 심볼명 bag 질의가 정밀.
5. **결정(영호)** — 갱신은 마일스톤 단위 수동(워처·데몬 미사용) + 스텝 진행 전 스킬부터 제작.
6. **유지보수 창 통합**(OPEN-GATE, TTL 7h 내) — 스킬 3종(`codegraph-init/update/search`) + CLAUDE.md 「코드 구조 지도」 절 + permissions 3벌 동기(allow 1·deny 2 — SEALED·OPEN·라이브) + ADR-042 + 스카우트 노트 + `.gitignore`(`.codegraph/`) + CHANGELOG [M].
7. **재봉인 검증 3종 → 종결** — 라이브 ≡ SEALED diff · gate-open.flag 삭제 · canary Edit 차단. 커밋 `6d9dda1`(14파일) → 영호 push(PR #32 편입).

## 정본 포인터 (본 문서는 항법 요약일 뿐)

- **결정·트레이드오프** = [ADR-042](../../00_Documents/01_Adr/ADR-042-codegraph-adoption.md) — 4안 비교(현행 유지/자체 구축/표준 설치/CLI-only)
- **실측·인스톨러 해부·AGENTS.md 인계 문안 §5** = [NEXT-CodeGraph-파일럿-스카우트-노트](../../00_Documents/02_Reports/03_Next/NEXT-CodeGraph-파일럿-스카우트-노트.md)
- **변경 이력 한 줄** = `00_Documents/CHANGELOG.md` 2026-07-28 [M] 행
- **운영 절차** = `.claude/skills/codegraph-{init,update,search}/SKILL.md` (봉인층 — 열람은 자유)

## 이월

- AGENTS.md CodeGraph 절 반영 = Codex 세션 몫(스카우트 노트 §5 문안 — CORE-12로 Claude 수정 불가).
- MCP 등록 = 보류(필요해지면 영호 수동, 유지보수 창).
- 운영 습관 = 세션 시작·마일스톤 경계마다 `codegraph-update`(sync).
