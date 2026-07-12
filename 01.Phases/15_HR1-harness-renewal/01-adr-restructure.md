---
owner: 영호
milestone: HR1
phase: 01
title: ADR 세분화 — 00.Documents/adr/ 구조 전환
status: done
grade: 보통
loop_track: human-gate
estimated: 1~2h
domain: cross
summary: ADR.md 460줄·33건 단일 파일을 00.Documents/adr/ 개별 파일 + 얇은 인덱스로 분리한다 (의미 무변경).
---

# Phase 01: ADR 세분화 — `00.Documents/adr/` 구조 전환

> **상태**: done · **마일스톤**: HR1 · **등급**: 보통 · **담당**: 메인 직접(ADR = 영호 단독 통제 대행) + secretary(커밋)

---

## 🎯 목표

`00.Documents/ADR.md`(460줄·ADR 33건·"현황 갱신" 블록 다수)를 **ADR 1건 = 1파일**(`00.Documents/adr/ADR-NNN-slug.md`)로 분리하고, `ADR.md`는 **얇은 인덱스**(번호·제목·상태·한 줄 결정·링크)로 전환한다. 이후 ADR 신설·개정이 개별 파일 diff로 깔끔히 리뷰되는 상태.

## ⏪ 사전 조건

- [x] `feature/hr1-harness-renewal` 브랜치 (생성 완료 2026-07-12)
- [x] 영호 GO (2026-07-12 "Phases 업무 착수하자")

## 📝 작업 내용

- [x] `00.Documents/adr/` 폴더 생성, 33건을 `ADR-NNN-{slug}.md`로 분리 — **본문 그대로 이동, 의미 변경 0** ("현황" 블록·superseded 표기 포함 이동)
- [x] `ADR.md`를 인덱스로 재작성: 표(번호 | 제목 | 상태 활성/superseded | 한 줄 결정 | 링크) — **경로가 그대로라 헌법 문서 지도 링크 불변**
- [x] 저장소 전체 참조 스캔: `grep -rn "ADR.md" / "ADR-0"` — 깨지는 상대 링크 0 확인 (특히 `.claude/policies/**`·`00.Documents/**` 상호참조)
- [x] 파일 간 상호참조는 상대 링크로 정리 (`[ADR-016](ADR-016-agent-sdk.md)` 형식) — 해당 없음: 원본에 마크다운 링크 0건(전부 평문 언급), 링크 신설은 "의미 변경 0" 원칙과 충돌해 의도적 미수행
- [x] secretary: 커밋 (`docs(adr): split ADR.md into per-decision files under 00.Documents/adr/`)

## ✅ 완료 조건

- [x] `00.Documents/adr/` 아래 33개 파일 + `ADR.md` 인덱스 — 본문 텍스트 이동만(의미 diff 0, 영호 육안 스팟체크)
- [x] 참조 스캔 결과 파손 링크 0
- [x] `npm run typecheck` · `npm run lint` green (문서만이라 형식 확인용)

## 📚 학습 포인트

- **문서도 아키텍처다** — 단일 거대 파일은 diff·리뷰·참조 정밀도를 깎는다. 코드의 "거대 파일 분해"(RF1)와 같은 원리.
- **인덱스 패턴** — 진입점 경로(`ADR.md`)를 보존하면서 내용만 분산하면 기존 참조가 안 깨진다.

## ⚠️ 함정

- **의미 수정 유혹 금지** — 이 Phase는 구조만. 낡은 현황 정정·개정은 별도(P02 이후 개별 ADR diff로).
- **git 이력** — 파일 분리는 `git log --follow`로도 추적이 약해짐. 원본 `ADR.md` 이력은 남으므로 인덱스 머리말에 "2026-07-12 분리, 이전 이력은 ADR.md 참조" 한 줄 박제.
- ADR 번호 결번·중복 발견 시 그대로 보존하고 인덱스에 주석만 (소급 재번호 금지).

## 담당 SubAgent

메인 직접(영호 단독 통제 대행 — 유지보수 창 불요, `00.Documents/**`는 봉인 밖) + secretary(커밋)
