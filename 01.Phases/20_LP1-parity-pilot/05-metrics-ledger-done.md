---
owner: 영호
milestone: LP1
phase: 05
title: 지표 원장 개시 + LP1 회고(-DONE) — 파일럿 1회전 마감
status: pending
grade: 보통
loop_track: auto-gate
estimated: 3h
domain: cross
summary: 계약 §8 지표(커버리지 3분해·accepted-change rate·봉합률)의 기록 틀 문서(지표 원장)를 만들어 P0 1회전 실측 수치를 첫 행으로 박고, LP1 마일스톤 HTML 보고서 + LP1-DONE.md(마일스톤 종합 등급 복잡 — phase-gate-validator strict 게이트 충족)로 마감한다. 커밋은 명시 파일만(CORE-09) · push/PR은 사람 게이트(CORE-06).
---

# Phase 05: 지표 원장 개시 + LP1 회고(-DONE) — 파일럿 1회전 마감

## 🎯 목표

계약 §8 지표의 기록 틀(지표 원장)을 만들어 P0 파일럿 1회전의 실측 수치를 첫 행으로 박고, LP1 마일스톤 HTML 보고서와 -DONE.md로 마감한다.

## ⏪ 사전 조건

- P02·P04 완료 (전 산출물 확정 상태).

## 📝 작업 내용

1. **지표 원장**: `00.Documents/reports/LP1-지표-원장.md` 생성 — 구성:
   - **지표 정의 절**: 계약 §8 자구 그대로 인용 — 커버리지 3분해(지원율 = ✅ 행/전체 · 의도적 제외율 = 제외 행/전체 · 보류율 = 보류 행/전체, 공통 행은 CC/CX 각각 산출) / accepted-change rate(= reviewer 통과율 + 육안 통과율) / 봉합률(= 봉합 재진입 횟수/기능 — 3회 상한 대비 조기 경보). 단일 합산 % 단독 박제 금지 조항 포함.
   - **기록 표**: 사이클 ID / 일자 / 분모 / 3분해-CC / 3분해-CX / accepted-change / 봉합률 / 비고.
   - **첫 행**: P0 파일럿 실측 (분모 8).
   - **승격 노트**: 원장의 상설 위치·FEATURE_MAP 연동은 C0에서 결정한다는 한 줄.
2. **HTML 마일스톤 보고서**: `00.Documents/reports/milestones/LP1-패리티-루프-파일럿-보고서.html` — Report-YYH-Style 스킬 절차(자립형 단일 HTML · 조판 게이트 3종 0건 수렴). LM1 선례 관례(`00.Documents/reports/milestones/`) 준수.
3. **LP1-DONE.md**: `01.Phases/20_LP1-parity-pilot/LP1-DONE.md` — phase-gate-validator strict 게이트 요건 전수 충족:
   - frontmatter **`grade: 복잡`** — 마일스톤 종합 등급(Phase 등급 '보통'과 별개). 훅은 신규 *-DONE.md에 복잡|대규모를 강제한다.
   - frontmatter **`report_html`** = 위 HTML 보고서 경로 (파일 실존 필수 — HTML을 먼저 만들고 DONE을 쓴다).
   - 필수 H2 4종 포함: `## TL;DR` / `## 5단계 보고` / `## AC 검증 결과` / `## 학습 일지 후보 키워드`.
   - frontmatter에 `gate_version: 1` · `owner: 영호`도 포함하고, "5단계 보고"의 단계 라벨은 LM1-DONE 미러 자구(무엇을 만들었나 / 왜 필요한가 / 어떻게 만들었나 / 테스트 결과 / 다음 스텝)를 쓴다.
   - "AC 검증 결과" 절에는 실제 실행한 명령과 그 출력 결과 줄을 별도 기재 (예: `git status --porcelain` 실행 → `02.Source/ 변경 0건` 결과 줄 — hasAcEvidence 요건).
   - 5단계 보고 "남긴 것" = 스키마 마찰·Doc 불일치 제안 목록과 처리 몫. "다음 좌표" = 유지보수 창 → M5 → C0 + **Doc Maintainer 손실행 결과의 처리 몫(제안 채택 여부·별도 루프 승격 여부)은 유지보수 창/C0 안건**임을 명시.
4. 커밋: 검증 후 명시 파일만 스테이징 (CORE-09). push·PR은 사람 게이트 (CORE-06) — 영호 GO 대기.

## ✅ 완료 조건 (정량)

- [ ] 원장 존재 + 지표 정의가 계약 §8과 자구 일치 (재서술 변형 0) + 기록 표 첫 행 = P0 실측 (분모 8, CC/CX 분리 산출).
- [ ] HTML 보고서 실존 + DONE frontmatter `report_html` 경로와 일치.
- [ ] DONE frontmatter `grade: 복잡` · 필수 H2 4종 존재 · AC 절에 명령+결과 줄 — **phase-gate-validator 발화 exit 0** (트랜스크립트 근거).
- [ ] `git status`: `02.Source/` 변경 0 최종 확인.

## 📚 학습 포인트

- 지표를 "정의 → 첫 계측"까지 한 사이클에 묶는 이유 — 정의만 있는 지표는 부패한다. 커버리지 단일 %가 보류를 숨기는 문제 (Codex 검토 구멍 ①).
- 훅(phase-gate-validator)이 강제하는 것은 보고 *형식*의 무결성뿐 — 내용 판정은 여전히 사람 몫 (계약 §11 "스키마 무결성 상한"과 동형).

## ⚠️ 함정

- 지표 정의를 요약하며 뜻을 바꾸지 말 것 — §8 자구 인용 (적대 검증 선례: 정의 재서술 변형은 실결함).
- accepted-change rate는 이번 회전에서 표본이 부족할 수 있다 — 억지로 산출하지 말고 "표본 부족, C0부터 계측"으로 미확인 처리 허용.
- Phase 등급(보통)과 DONE frontmatter의 grade(복잡)는 서로 다른 값이다 — DONE의 grade는 마일스톤 종합 등급. 혼동하면 훅이 차단한다.
- HTML 보고서는 base64 인라인 시 MB급이 된다 — 커밋 시 파일 명시에 주의.

## 담당 SubAgent

secretary — 원장·HTML 보고서·DONE 작성 + 커밋(명시 파일만). 전부 `00.Documents/reports/**`·`01.Phases/**` W 영역.
