---
owner: 영호
milestone: LP1
phase: 01
title: 파일럿 준비 — Doc Maintainer 대상 문서 + P0 매트릭스 8행 후보 선정
status: done
grade: 단순
loop_track: auto-gate
estimated: 1h
domain: cross
summary: 계약 v1.1 §4 P0 파일럿(8행)과 Doc Maintainer 손실행 1회의 대상을 확정한다 — Doc Maintainer 훑기 대상 문서 4~6개 목록 + P0 8행 후보(공통2·CC전용2·CX전용2·GUI번역1·제외후보1) 선정 근거 문서 1개. 전부 읽기 전용, 산출물 = 00.Documents/reports/LP1-01-대상선정.md 한 개.
---

# Phase 01: 파일럿 준비 — Doc Maintainer 대상 문서 + P0 매트릭스 8행 후보 선정

## 🎯 목표

계약 v1.1이 정의한 P0 파일럿(8행)과 Doc Maintainer 손실행 1회의 **대상을 확정**한다. 산출물은 대상 선정 문서 1개 — 이후 P02(손실행)·P03(매트릭스 작성)이 이 문서를 입력으로 삼는다.

## ⏪ 사전 조건

- 계약 정본 읽기: `C:\Dev\Loop_Engineering\02.AgentDeck-리뉴얼\06.엔진-패리티-루프-계약-v1.1.md` §2(행 스키마·철칙 5)·§4(P0 구성)·§8(지표) — 영호 승인 2026-07-18 발효.
- 브랜치 `feature/lp1-parity-pilot` 위에서 작업.

## 📝 작업 내용

1. **Doc Maintainer 대상 목록**: `00.Documents/` 문서 중 코드 경로·수치·명령 인용 밀도가 높은 4~6개 선정 (후보 풀: ARCHITECTURE.md · FEATURE_MAP.md · REPL_TRANSITION.md · UI.md · PRD.md · ADR 인덱스). 각 문서에 "왜 이 문서인가" 1줄 + 예상 대조 항목 유형 + 대조 범위(전수 또는 절 한정 — P02는 이 범위를 임의 확장·축소할 수 없다).
2. **P0 8행 후보 선정** — 구성 고정: 공통 2 · Claude 전용 2 · Codex 전용 2 · GUI 번역 1 · 제외 후보 1. 각 행에 선정 사유 1줄 + 증거 수집 계획(어디서 증거를 찾을지 — 코드 좌표·테스트·세션 로그·PRD 조항).
   - 참고 소스: `00.Documents/FEATURE_MAP.md`(기존 추적) · `00.Documents/reports/next/NEXT-라이브-모델-전환-스카우트-노트.md`(C1 1번 갭 확보분).
   - 제외 후보 풀: PRD의 명시 비목표(macOS 지원 등 — PRD "비목표" 서술)와 Track 2 "복제 이후" 계열에서 고른다. **주의**: PRD에 "MVP 제외 사항"이라는 절은 실재하지 않는다(헌법 문서 지도 표기와의 드리프트 — 이 드리프트 자체가 P02 대조 표본 후보다).
3. 산출물: `00.Documents/reports/LP1-01-대상선정.md`

## ✅ 완료 조건 (정량)

- [ ] `00.Documents/reports/LP1-01-대상선정.md` 존재.
- [ ] P0 후보 표 8행 — 구성이 공통 2 / CC 전용 2 / CX 전용 2 / GUI 번역 1 / 제외 후보 1과 정확히 일치.
- [ ] 8행 전부 선정 사유·증거 수집 계획 열이 비어 있지 않음.
- [ ] Doc Maintainer 대상 4~6개, 각각 사유 1줄 + 대조 범위 명기.
- [ ] `git status --porcelain`에 `02.Source/` 변경 0건, 신규 파일은 위 보고서 1개뿐.

## 📚 학습 포인트

- 루프 계약에서 "대상 선정"이 왜 별도 걸음인가 — 파일럿의 실패 비용을 8행으로 캡핑하는 설계.
- 표본 구성(공통/전용/번역/제외)이 각각 스키마의 어느 결함을 검출하는가 (엔진별 분리·해당 없음·판정 근거·PRD 화해).

## ⚠️ 함정

- 여기서 매트릭스를 미리 채우지 말 것 — 이 Phase는 *후보 선정*까지. 행 작성은 P03.
- 훅·하네스 편입 절대 금지 (계약 §11 — P0 통과 전 금지). 산출물 경로는 `00.Documents/reports/` 밖으로 나가지 않는다.

## 담당 SubAgent

secretary — 읽기 전용 문서 트랙이라 코드 Worker 불요. 산출물 경로가 전부 secretary W 영역(`00.Documents/reports/**`).
