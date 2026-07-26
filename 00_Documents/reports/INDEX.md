# reports 카테고리 인덱스

> **물리 폴더 구조(영호 2026-07-17)** — 카테고리 = 하위 폴더 **1:1**: `milestones/`(완주·종합 보고) · `guides/`(육안 검수 가이드) · `next/`(브리프·스카우트·핸드오프) · `manuals/`(매뉴얼·셋업). 본 `INDEX.md`만 루트 유지.
> **포인터 무결성** — `-DONE.md`의 `report_html`·work-pin의 reports 경로는 새 하위 폴더 경로로 동기 갱신됨(phase-gate-validator 실존 검증 통과). 동결 이력(`.claude/CHANGELOG.md`·`00.Documents/adr/**`·`-DONE` 아닌 라운드 로그)은 미수정.
> **파일명 규칙**: `{마일스톤코드}-{한글 서술}.html` (정본 = HTML 리포트, Artifact는 병행 열람용). 근거 문서(NEXT-*)와 인덱스만 `.md`.

날짜 = 해당 파일의 마지막 커밋일(`git log -1 --format=%cs`). 신규 미커밋 파일은 작성일(2026-07-17) 표기.

## 마일스톤 완주·종합 보고 (`milestones/`)

| 파일 | 날짜 | 설명 |
|---|---|---|
| [BL1-P02-유예타이머-정리.html](milestones/BL1-P02-유예타이머-정리.html) | 2026-07-13 | BL1 P02 — idle-close 유예 타이머 정리 완료 보고 |
| [BL1-P06-훅-견고성.html](milestones/BL1-P06-훅-견고성.html) | 2026-07-13 | BL1 P06 — 훅 견고성(fail-open 봉합) 완료 보고 |
| [BL1-백로그-마감-종합.html](milestones/BL1-백로그-마감-종합.html) | 2026-07-13 | BL1 — 백로그 마감 마일스톤 종합 보고 |
| [GAP1-Claude-Code-기능격차-감사.html](milestones/GAP1-Claude-Code-기능격차-감사.html) | 2026-07-13 | GAP1 — Claude Code 기능 격차 감사 |
| [GAP1-코어패리티-15페이즈-완주-보고서.html](milestones/GAP1-코어패리티-15페이즈-완주-보고서.html) | 2026-07-15 | GAP1 — 코어 패리티 15 Phase 완주 최종 보고 |
| [H1-Codex하네스-강화.html](milestones/H1-Codex하네스-강화.html) | 2026-07-12 | H1 — Codex Harness Hardening 완료 보고 |
| [H1-Codex하네스-치명결함-봉합.html](milestones/H1-Codex하네스-치명결함-봉합.html) | 2026-07-12 | H1 — Harness 중요 결함 3건 봉합 |
| [HR1-P02-설계검토.html](milestones/HR1-P02-설계검토.html) | 2026-07-12 | HR1 하네스 리뉴얼 — P02 설계 검토 보고서 |
| [HR1-P05-전담보조-전환-완료.html](milestones/HR1-P05-전담보조-전환-완료.html) | 2026-07-13 | HR1 P05 — Codex 전담 보조 전환 완료 보고 |
| [HR1-P05-전담보조-최종구성안.html](milestones/HR1-P05-전담보조-최종구성안.html) | 2026-07-13 | HR1 P05 — Codex 전담 보조 최종 구성안 |
| [HR1-하네스-리뉴얼-종합.html](milestones/HR1-하네스-리뉴얼-종합.html) | 2026-07-13 | HR1 — 하네스 전면 리뉴얼 마일스톤 종합 보고 |
| [LR4-세션-안정성.html](milestones/LR4-세션-안정성.html) | 2026-07-12 | LR4 — Session Stability 완료 보고 |
| [RMW1-멀티세션-단일기록자.html](milestones/RMW1-멀티세션-단일기록자.html) | 2026-07-12 | RMW1 single-writer — 멀티세션 단일 기록자 마일스톤 종합 보고 |
| [TG1-사고GUI-데스크톱스타일-7페이즈-완주-보고서.html](milestones/TG1-사고GUI-데스크톱스타일-7페이즈-완주-보고서.html) | 2026-07-17 | TG1 — 사고 GUI 데스크톱 스타일 8 Phase 완주 최종 보고 (P07 마감 + P08 편입) |

## 육안 검수 가이드 (`guides/`)

| 파일 | 날짜 | 설명 |
|---|---|---|
| [GAP1-육안검수-49컷-열람가이드.html](guides/GAP1-육안검수-49컷-열람가이드.html) | 2026-07-16 | GAP1 육안 검수 — 49컷 열람 가이드 |
| [TG1-육안검수-14컷-열람가이드.html](guides/TG1-육안검수-14컷-열람가이드.html) | 2026-07-17 | TG1 육안 검수 — 22컷 열람 가이드 (P09 편입 반영, 파일명은 14컷 시점 유지) |

## 브리프·스카우트 노트 (NEXT-*, `next/`)

| 파일 | 날짜 | 설명 |
|---|---|---|
| [NEXT-하네스-개선-핸드오프.md](next/NEXT-하네스-개선-핸드오프.md) | 2026-07-17 | 하네스 개선 핸드오프 — 2026-07-17 점검 세션 산출 (우선순위 큐 P1~P5) |
| [NEXT-라이브-모델-전환-스카우트-노트.md](next/NEXT-라이브-모델-전환-스카우트-노트.md) | 2026-07-17 | REPL 지속세션 라이브 모델 전환 스카우트 노트 (차기 사이클 후보) |
| [NEXT-사고GUI-데스크톱스타일-공식로고-아바타-브리프.html](next/NEXT-사고GUI-데스크톱스타일-공식로고-아바타-브리프.html) | 2026-07-15 | 차기 마일스톤 브리프 — 사고 GUI Desktop 스타일 · Claude 공식 로고 아바타 |

## 매뉴얼·셋업 (`manuals/`)

| 파일 | 날짜 | 설명 |
|---|---|---|
| [MULTI-MACHINE-Laptop-셋업-매뉴얼.html](manuals/MULTI-MACHINE-Laptop-셋업-매뉴얼.html) | 2026-07-14 | AgentDeck 멀티머신 매뉴얼 — Laptop 셋업 & 왕복 루틴 |

## 기타/미분류 (루트)

| 파일 | 날짜 | 설명 |
|---|---|---|
| [INDEX.md](INDEX.md) | 2026-07-17 | 본 카테고리 인덱스 (reports 폴더 카탈로그) |
