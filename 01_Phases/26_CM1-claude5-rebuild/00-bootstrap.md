---
owner: 유영호
milestone: CM1
phase: 00
title: 부트스트랩 — 사전 정리 · 스테이징 준비 · 런타임 프로브
status: in-progress
grade: 보통
loop_track: human-gate
estimated: 1.5h
domain: cross
summary: 트랙의 발판 — dirty 봉합·pull·브랜치·CRLF 미니 창·전수 배정표·런타임 프로브 5종. 커밋과 프로브는 채택 세션에서 기실행, 잔여 4건이 남아 있다.
---

# Phase 00: 부트스트랩

> **상태**: in-progress · **마일스톤**: CM1 · **등급**: 보통 · **담당**: 메인 + 영호 (하네스 트랙 — CORE-11 예외 구조, Worker 위임 없음)

## 🎯 목표

트랙이 안전하게 굴러갈 발판을 만든다: 워킹트리 clean, 트랙 브랜치, CRLF 안전한 스테이징 규격, 하네스 구성물 전수의 Phase 소유자 배정, 그리고 새 설계가 딛는 런타임 계약의 현 시점 실측.

## ⏪ 사전 조건

- [x] 플랜 승인 (영호, 2026-07-29 — `_milestone-plan.md`)

## 📝 작업 내용

- [x] `settings.json` 재봉인 동기 커밋 — **완료 021f531** (그 한 파일만, secretary 경유. 잔여 dirty = pin뿐)
- [x] 런타임 프로브 5종 — **완료** (결과 = `_scout-diagnosis.md` §5. 핵심: 서브에 CLAUDE.md 전문 주입 확인 → 산문 층 격리 작성 확정)
- [ ] `git pull origin master` (멀티머신 동기 확인)
- [ ] 트랙 브랜치 생성: `feature/cm1-claude5-rebuild`
- [ ] **미니 창 1회(영호 OPEN → 메인 편집 → 커밋 → 영호 CLOSE)**: `.gitattributes`에 `01_Phases/**/drafts/** text eol=lf` 추가 — drafts의 .sh가 CRLF로 물질화되는 지뢰 제거
- [ ] `drafts/` 스캐폴드 생성 — **저장소 루트 동형 미러** 규격(`drafts/.claude/hooks/...` 형태)이어야 스테이징에서 훅 테스트·conformance `--root` 검증이 성립한다
- [ ] **전수 배정표 완성** — `_scout-diagnosis.md` §6의 sealed 집합 기준, 소유자 없던 구성물(templates 3종·`.agents/skills` 2종·skills 5종·commands 비세션 3종·`.gitignore` 하네스 절·`package.json` scripts·`.claude/CHANGELOG.md` 포인터)을 Phase 1~6에 배정해 본 문서에 표로 박제
- [ ] **격리 스폰 런북 프로브 1회** (plan-auditor 🔴2 봉합) — 산문 층 백지 작성의 메커니즘 실측: **저장소 밖 빈 디렉토리**(⚠️ git worktree는 CLAUDE.md·`.claude/**`가 딸려와 주입이 재발하므로 격리가 아니다) 준비 → 서브/headless 스폰 → 산출물에 하네스 흔적 부재 확인(구 하우스 스타일 마커 grep) → 회수까지 1왕복. 실패 시 Phase 01 진입 금지(작성 전략 전체가 오염 작성으로 후퇴)

## ✅ 완료 조건

- [ ] `git status` clean (pin 제외) + 트랙 브랜치에서 작업 중
- [ ] `.gitattributes`에 drafts LF 규칙 커밋됨 (창은 닫힌 상태로 종료)
- [ ] 배정표에 "소유자 없음" 항목 0건
- [x] 프로브 5종 결과가 `_scout-diagnosis.md`에 박제됨
- [ ] 격리 스폰 런북 프로브 1왕복 성공 (하네스 흔적 0 확인 로그)
- [x] plan-auditor 점검 결과 기록 — 🔴 2건 옵션 A 즉시 봉합(2026-07-29, `_decisions.md`), 🟡 3건 반영

## 📚 학습 포인트

- git의 `core.autocrlf`와 `.gitattributes`의 관계 — 체크아웃 시 개행 변환이 셸 스크립트를 조용히 깨뜨리는 경로.
- 런타임 계약(훅 payload·권한 다이얼로그)은 문서가 아니라 실측이 진실원이라는 것 — 구세대 실측은 세대 전환기에 일괄 재검증한다.

## ⚠️ 함정

- 미니 창 중 편집은 `.gitattributes` 한 파일만 — 창이 열려 있다고 다른 봉인 파일을 건드리지 않는다(창 작업 최소주의).
- auto 권한 모드는 하네스 편집을 분류기가 조용히 거부한다(2026-07-29 실측) — 창 작업은 default 모드에서.
- pull 시 pin dirty와의 충돌 가능성 — 충돌하면 영호에게 보고하고 자동 해소 시도 금지.

## 담당 SubAgent

메인 직접(문서·배정표·판단) + secretary(커밋 실행 — 구 규범 존속 중이므로). 미니 창 개폐는 영호 단독.
