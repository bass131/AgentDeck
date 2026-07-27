---
owner: 유영호
milestone: BZ
phase: 06
title: 창 2 — ADR-040·041 반영 + conformance 축(15) + CHANGELOG 이동(16)
status: pending
grade: 대규모
loop_track: human-gate
domain: cross
estimated: 3~5h
summary: 영호 승인된 ADR 2건을 정본 반영하고, core-manifest conformedVersion 축 + conformance-check 대조를 구현하고, CHANGELOG를 00_Documents로 이동 + 역참조 전수 스윕한다.
---

# Phase 06: 창 2 — ADR 반영 + conformance 축 + CHANGELOG 이동

> **등급**: 대규모 (봉인층 다수 + 게이트 스크립트 수정 + 전역 참조 스윕) · **담당**: **메인 직접**(봉인층) + `secretary`(허용 경로 기계 치환) · **문**: **영호 ADR 승인 + 유지보수 창 2**
> 게이트 기준선·V 검증 = [`_milestone-plan.md`](_milestone-plan.md)

## 🎯 목표

ADR-040·041이 정본으로 살고, conformance 게이트가 어댑터 준수 선언을 대조하며(갱신 누락 = red), CHANGELOG가 엔진 중립 위치(`00_Documents/`)에서 옛 참조 하나 깨지 않고 동작한다.

## ⏪ 사전 조건

- [ ] Phase 05 산출물 — 영호 승인 (수정 지시 있으면 초안 개정 후 재승인)
- [ ] 영호 `OPEN-GATE.bat` (창 2) — **개방 시 잔여 TTL ≥ 2h 확인. 미만이면 §C(CHANGELOG 이동) 착수 금지, 다음 창으로** (🟡e — TTL 만료는 훅 층만 복귀 → 원자 커밋 조립 중간에 봉인층 손이 묶여 중간 상태 커밋을 강요당한다)

## 📝 작업 내용

**A. ADR 정본 반영**

- [ ] 스크래치 초안 2건 → `00_Documents/01_Adr/ADR-040-*.md`·`ADR-041-*.md` (승인 시 수정 지시 반영) + `00_Documents/ADR.md` 인덱스 2행

**A′. P01-E 파장 — 모델 티어 문서 정본 갱신** (P01-D 실측 발견 2026-07-27: `agent-model-canon.test.ts`가 티어 4층을 기계 고정하고 있어 렌즈 승격이 1건 red를 냈다 — 테스트 기대값은 P01-D에서 `claude-fable-5`로 갱신 완료, **그 테스트가 고정하는 문서 두 곳은 봉인층이라 여기 창 2 몫**)

- [ ] `.claude/policies/execution-owner.md` §3 모델 티어 표 — reviewer·plan-auditor `claude-opus-5` → `claude-fable-5`
- [ ] `00_Documents/01_Adr/ADR-010-multiagent-coordinator-worker.md` 티어 4층 서술 — 검증 렌즈 2종 승격 반영 (개정 스탬프 여부는 영호 승인 시 판단)
- [ ] CHANGELOG [H] 행에 렌즈 승격 + "실효는 다음 세션·이번 세션은 override" 병기 (P01-E 체크리스트 몫과 통합)

**B. 백로그 15 — conformance 1단계 구현** (TDD)

- [ ] (red 먼저) `harness-conformance.test.ts` 또는 신규 테스트: 대조는 **정확 동등성** — `누락`·`낮음`·`높음`·`문자열/비정수` 4클래스 각각 red 픽스처 (단순 `<`는 `undefined < v === false`로 필드 누락이 통과한다 — Codex 교차 리뷰 축 3, 2026-07-27)
- [ ] `00_Documents/00_Harness/core-manifest.json` — 13개 조항에 `claude.conformedVersion`·`codex.conformedVersion` 추가 (현행 값 실측 기입 — 추정 금지. ⚠️ Codex 쪽 값은 CORE-12로 실측 불가면 **영호·Codex receipt 기준으로 기입하고 출처 명기**)
- [ ] `00_Documents/00_Harness/conformance-check.mjs` — 대조 로직 추가. 출력에 축 구분(조항 v ↔ 어댑터 선언)
- [ ] G2 재실행 — 13/13 유지 (추가 축 포함 통과 수 변동은 기록)

**C. 백로그 16 — CHANGELOG 이동**

- [ ] `git mv .claude/CHANGELOG.md 00_Documents/CHANGELOG.md` → `.claude/CHANGELOG.md`를 한 줄 포인터로 신규 생성
- [ ] P05 역참조 표의 **「치환」 판정 건 전량 반영 — 전부 메인 직접** (🔴3·🔴4 봉합: secretary는 봉인층·`02_Source`·tests 편집 금지라 "허용 경로"가 사실상 공집합이었다). **치환 판정 건수 = 반영 건수** 이름 단위 대조. 「불변(과거 기록)」은 고치지 않는다 · 「Codex 이월」 2건은 P07 신규 등재로(포인터 파일 존치로 그때까지 깨지지 않는다)
- [ ] `shell-policy.mjs:415` allowed 예외(`.claude/changelog.md`) — **예외 제거로 방향 반전** (Codex 교차 리뷰 축 2 반영, 2026-07-27 — 원안 "기존 줄 존치"는 정책 방향이 반대였다): 이동 전엔 수시 갱신되는 기록이라 봉인 예외가 맞았지만, 이동 후 `.claude/CHANGELOG.md`는 **고정 어댑터 포인터 = 다른 `.claude/**` 파일처럼 CORE-11 봉인 대상**이다. Claude 예외 줄 제거 + `shell-policy.test.mjs`의 편집 허용 고정 픽스처(`:35` 상대 경로·`:125`) **반전** + 주석 정정. 신 `00_Documents/CHANGELOG.md`는 일반 문서 판정이라 별도 허용 예외 불요. 훅 수정 = 골든 픽스처 동반(P01 규율). Codex 쪽 동일 의미 예외(`agentdeck-hook.mjs` `:381`·`:419` — Codex 자기 실측)는 P07 인계 명세 몫
- [ ] CHANGELOG [H] 행 — 이 마일스톤의 하네스 변경 이력(P01·P06)을 **신 위치에서** 기록

**D. 창 폐쇄 후**

- [ ] V1·V2 + G1~G6 전종 (기준선 변동 기록) + 커밋(명시 파일만, settings.json 제외)

## ✅ 완료 조건

- [ ] G2 green + 뮤테이션 음성 1회(일부러 conformedVersion을 낮춰 red 확인 후 복원 — 출력 박제)
- [ ] CHANGELOG 역참조 **「치환」 판정** 전건 반영 대조표 green + 마크다운 링크 체커 무회귀
- [ ] G1~G6 전종 green (V1·V2 포함)
- [ ] ADR.md 인덱스 ↔ 01_Adr 파일 실재 대조 (유령 포인터 0)

## 📚 학습 포인트

- **선언 기반 게이트의 정직한 설계**: 게이트가 잡는 것(갱신 누락)과 못 잡는 것(거짓 선언)을 본문에 분리 명기 — 백로그 15가 경고한 "맹점 기록이 수리와 함께 증발"의 구조적 재발 방지
- 파일 이동의 본체는 mv가 아니라 참조 그래프 재배선 (BACKLOG 이관·백로그 5의 실측 반복 확인)

## ⚠️ 함정

- `core-manifest.json`은 conformance의 **입력이자 검증 대상** — 스키마를 깨면 게이트 자체가 죽는다. 수정 전후 G2 즉시 실행
- CHANGELOG 이동 커밋과 참조 스윕 커밋을 분리하면 중간 상태(깨진 참조)가 이력에 남는다 — **원자 커밋**(mv + 포인터 + 전 참조를 한 커밋에)
- 창 안에서 `.claude/settings.json` 스테이징 금지 (창 상태물)

## 담당 SubAgent

메인 직접(봉인층·ADR·manifest·훅·참조 치환 전부) + secretary(**게이트 실행 + 명시 파일 커밋만** — 🔴3 봉합). reviewer 무조건(harness + 대규모 — 이번 세션은 `model: "fable"` override).
