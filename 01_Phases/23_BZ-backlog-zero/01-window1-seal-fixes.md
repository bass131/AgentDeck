---
owner: 유영호
milestone: BZ
phase: 01
title: 창 1 — 봉인 오탐 수리(백로그 14) + 템플릿 정합(25) + HR2 deny 일몰
status: pending
grade: 복잡
loop_track: human-gate
domain: cross
estimated: 2~3h
summary: shell-policy 역할 기반 귀속으로 쓰기·조회 혼합 오탐 제거 + done 템플릿 H2 정합 + SEALED 옛 4줄 일몰. 창 폐쇄 후 라이브 3종 재검증.
---

# Phase 01: 창 1 — 봉인 오탐 수리 + 템플릿 정합 + HR2 deny 일몰

> **등급**: 복잡 (harness 깃발 — 봉인 판정기 핵심부) · **담당**: **메인 직접** (하네스 = 위임 금지, NC 편성 규율)
> **문**: 유지보수 창 1 (영호 개폐) · 게이트 기준선·V 검증 = [`_milestone-plan.md`](_milestone-plan.md) 참조

## 🎯 목표

`git mv … && grep --exclude-dir=.codex …` 같은 쓰기·조회 혼합 명령이 더는 오탐 차단되지 않고, 기존 양성(진짜 우회) 차단은 전량 유지된다. done 템플릿을 따라 쓴 -DONE.md가 훅에 차단되지 않는다. SEALED deny에서 시효 지난 HR2 몫 4줄이 사라진다.

## ⏪ 사전 조건

- [x] 백로그 14 원인 진단 — 3중 확증 완료 (2026-07-27: 혼합=차단 / 조회 단독=통과 / 쓰기 단독=통과)
- [x] 수리 설계 확정 — 역할 기반 귀속 (아래)
- [x] 영호 `OPEN-GATE.bat` 실행 (TTL 7h) — 폐쇄까지 완료 (CLOSE 2026-07-27, flag age 11m 시점)

## 📝 작업 내용

**A. 백로그 14 — `harnessShellWriteReason()` 역할 기반 귀속** (`.claude/hooks/_lib/shell-policy.mjs`)

원인: 봉인 후보 추출(`[...tokens, command]` 전역)과 쓰기 명령 검출(전역)의 AND가 **세그먼트를 넘어** 성립한다. 변수 우회(`F=<sealed>; sed -i … $F`) 방어의 의도된 대가였다(sed 주석 명시).

수리: sealed 후보를 **출처 역할**로 가른다 — 차단 트리거로 인정하는 후보는 ① **쓰기 벡터가 있는 세그먼트**(직접 쓰기 명령·임베디드 쓰기 런타임·`git` 쓰기 서브커맨드)의 토큰 ② 리다이렉트 대상(기존 cwd 추적 로직 그대로) ③ **변수 할당 토큰의 우변** ④ **원문에서만 발견된 후보**(토큰화가 백슬래시로 깨진 경우 — 역할 불명 = fail-closed, Windows 경로 방어 유지). 읽기 명령 인자로만 나온 후보는 트리거가 아니다.

- [x] (TDD red 먼저) `shell-policy.test.mjs`에 **오탐 음성 픽스처** 추가: ⓐ `touch <무관경로> && grep --exclude-dir=.codex …` ⓑ `git mv a b && grep --exclude-dir=.codex …` ⓒ `cmp <sealed> <sealed사본> && wc -l <sealed>` (읽기 전용 조합 — 백로그 14 원 표본) → 현행 구현에서 red 확인
- [x] **기존 양성 유지 픽스처 명시 재확인** (이미 있으면 존치 확인, 없으면 추가): `tee <sealed>` / `F=<sealed>; sed -i … $F`(할당 우변) / `cd .claude/hooks && echo x > <파일>`(cwd 리다이렉트) / Windows 백슬래시 경로 쓰기(원문 전용 후보) / `bash -c "echo x > <sealed>"`(임베디드)
- [x] 구현 — 기존 `verdicts` 전역 수집을 역할 귀속으로 재구조화. `harnessRedirection`은 자체로 sealed 확정이므로 최종 조건을 `harnessRedirection || (쓰기벡터 세그먼트 sealed) || (할당 우변 sealed && 쓰기 존재) || (원문 전용 sealed && 쓰기 존재)`로 재구성
- [x] `cd .claude/hooks && node --test` — 신규 포함 전량 green (기준선 120 + 신규분, 감소 = red) → **실측 121/121** (신규 1 블록·내부 assert 7종, 감소 0)

**B. 백로그 25 — 템플릿 정합**

- [x] `.claude/templates/done-md-template.md:65` — `## 학습 일지 후보 키워드 (검색용)` → `## 학습 일지 후보 키워드` (ⓐ안: 훅 완화가 아니라 템플릿 정정 — 수용 방향 완화 경계 규율. `(검색용)` 의도는 절 본문 첫 줄로 이동) — 훅 요구 문자열(`done-report-policy.mjs:101`)과 일치 확인

**C. HR2 몫 deny 일몰** (조건 충족: HR2 머지 + NC 1마일스톤 경과)

- [x] `98_Management/Harness_OpenGate/settings.SEALED.json` — **옛 4줄을 이름 전수 열거로 제거** (🔴5 봉합 — plan-auditor 실측 `:54-57`, 분해는 `00.Documents` **3줄** + `98.Management` **1줄**이다):
  `"Edit(00.Documents/harness/**)"` · `"Edit(00.Documents/adr/**)"` · `"Edit(00.Documents/ADR.md)"` · `"Edit(98.Management/Harness_OpenGate/**)"`
  ⚠️ `:61`의 **살아 있는** `"Edit(98_Management/Harness_OpenGate/**)"`(언더스코어)와 혼동 금지 — 지우면 OpenGate 권한 봉인이 사라진다. ⚠️ **NC 몫 구 2줄(`00_Documents/harness`·`adr`)도 건드리지 않는다** — 타이머가 다르다(pin 이월 ①)
- [x] `$comment` — **HR2 몫 문단은 전체 삭제**(문단 스스로 "삭제 시 이 문단도 함께 지울 것" 지시 — 🟡f) · **NC 몫 문단은 존치**. 제거 후 라인 수·서술 대조 (NC의 `$comment` "11줄" vs 실제 15줄 어긋남 전례 — 성향 20) — 검증 스크립트: `VALID — deny 18줄, 옛 4줄 부재, 존치 6줄 확인` (109→105줄). NC 문단의 "위 옛 4줄" 참조는 허공에 뜨지 않게 한 구절만 정정(존치 원칙 유지)

**E. 검증 렌즈 정식 승격** (영호 결정 2026-07-27 — NC 「이번 한정 격상」의 정식화)

- [x] `.claude/agents/plan-auditor.md:6` · `.claude/agents/reviewer.md:6` — `model: claude-opus-5` → `model: claude-fable-5` (effort xhigh 유지, **full ID 필수** — 별칭 `opus`가 4.8로 스폰된 실측 전례)
- [x] reviewer 정의에 완화 노트 1줄: 방어적 보안 산출물 검토 시 Fable 5 안전장치 거부 가능 → 그 경우 `claude-opus-5`로 재호출하고 **품질 저하가 아니라 안전장치 발동임을 구분 기록** (NC 계획서 실측: 발동 0회)
- [x] ⚠️ **실효는 다음 세션부터** (정의 편집은 현 세션 listing에 반영 안 됨 — 검증 불가 함정). **이번 세션의 reviewer 호출은 `model: "fable"` override로 커버** — 이 사실을 CHANGELOG [H] 행에 병기 (CHANGELOG 기입은 P06 창 2 몫)
- [x] trade-off 기록: 검증 렌즈 상시 최상위 품질 ↔ Fable 5 단가 상시 발생. 되돌림 = frontmatter 한 줄 (영호 판단)

**D. 창 폐쇄 후 검증** (영호 `CLOSE-GATE.bat` 후 — 메인 직접)

- [x] V1 canary + V2 재봉인 (계획서 정본 절차) → **V2 실측**: `gate-open.flag` 부재 + `cmp` IDENTICAL (`settings.json ≡ SEALED`, 105줄)
- [x] **V3 — 14 라이브 재검증**: 오탐 3종 프로브 **통과**(exit 0) + 양성 1종(`tee` 대상에 canary sealed 경로) **차단**(exit 2 + `guard-blocks.log` 기록). 판정은 로그로(화면 출력 아님) → **실측**: 로그 4545→4546 (+1 = 양성 block 기록뿐), 오탐 3종 무기록 통과, canary 잔해 없음. 프로브 2 = 원 표본(`git config` 조회+sealed `cmp`) 그대로 재현 통과
- [x] 커밋 — **reviewer 판정으로 분리 실행** (원계획 7파일 일괄 → 3갈래): ⓐ `agent-model-canon.test.ts` = qa 커밋 `c9340db` (E 승격의 실측 파장 — 티어 4층 기계 고정 테스트 red → 기대값 fable-5 갱신. 문서 정본 2곳(`execution-owner.md` §3·ADR-010)은 봉인층 → P06 A′ 등재) ⓑ 통과 품질 4파일(`done-md-template.md`·`settings.SEALED.json`·`agents/plan-auditor.md`·`agents/reviewer.md`) = 밤 커밋 ⓒ **`shell-policy.mjs`·`shell-policy.test.mjs` = 커밋 보류** (아래 reviewer 🔴 — 재수리가 창을 요구해 밤 불가, 워킹트리 유지) (⚠️ `.claude/settings.json`은 창 상태물 — P01 커밋 제외. 재봉인 미러 커밋은 NC 선례(`5253d1c`)상 별도 — 아침 영호 확인 후)

**F. reviewer 결과 (fable override, 2026-07-27 밤) — 🔴 1건: 커밋 전 실측으로 회귀 3계열 발견**

- 🔴 **역할 귀속이 세그먼트 간 데이터 흐름을 보지 못한다** (`shell-policy.mjs:694-706,733-737`, 14케이스 양쪽 실측 — 신규 PASS / HEAD BLOCK): **A** 명령 치환 위장(`cp evil $(echo <sealed>)` — `$(`가 세그먼트로 분리돼 sealed가 echo 읽기 세그먼트로 귀속) · **B** `cd <sealed폴더> && rm <상대경로>`(cwd 추적이 리다이렉트에만 적용, 쓰기 명령 인자 미적용) · **C** `echo <sealed> | xargs rm`(sealed는 앞 세그먼트, 쓰기는 뒤). 옛 전역 AND는 셋 다 부산물로 차단 — 수리 주석의 트레이드오프 목록에 없으므로 **의도된 완화가 아니라 미인지 손실**. Bash 전용 채널이라 shell-policy가 유일 방어층 → CORE-11 완화 불가.
- 🟡 세그먼트 경계 넘는 양성 픽스처 0건(그래서 테스트가 못 잡았다) — 수리 시 A/B/C 골든 등재 · 🟡 리다이렉트 대상이 명령 치환인 형태는 HEAD에서도 통과던 기존 갭 — 함께 볼 것.
- ✅ 오탐 수리 목적 자체는 달성(라이브 3종 PASS·방어 등가 4종 BLOCK 유지·121/121 재현) · 템플릿·SEALED·모델 승격 4파일은 통과 품질.
- **처리**: 재수리 = 봉인층 = **내일 창 몫**(수리 방향 힌트: 치환 세그먼트 = 값 역할 트리거 ③ 준용 / 쓰기 세그먼트 판정에 추적 cwd 반영 / 파이프 연결 세그먼트 간 귀속 — 오탐 3종 green 유지 조건). **밤 위험 평가**: 워킹트리 훅은 수리판이라 A/B/C 구멍이 밤 동안 존재하나, 해당 명령 형태는 밤 작업이 쓰지 않으며 Edit deny 층은 온전 — HEAD 복귀는 파괴 명령(CORE-07)이라 에이전트 실행 불가이기도 하다. 오탐 해소는 유효하므로 밤 Phase 진행에는 지장 없음.

## ✅ 완료 조건

- [ ] `npm run test:hooks` green (증가분 기록)
- [ ] V3 라이브 4종 판정 일치 (오탐 3 통과 · 양성 1 차단)
- [ ] V2 재봉인 green
- [ ] G4·G5 무회귀 (`npx vitest run` · typecheck·lint — 훅 외 변경 없음 확인용)

## 📚 학습 포인트

- **오탐과 방어는 같은 설계의 양면** — 전역 AND는 버그가 아니라 트레이드오프였고, 수리는 "완화"가 아니라 "귀속 정밀화"여야 한다
- fail-closed의 정확한 자리: 판정 불가(원문 전용 후보)에서만 보수적으로, 판정 가능(역할 판명)에서는 정밀하게

## ⚠️ 함정

- 창 안에서는 훅이 전부 exit 0 — **수리 확인을 창 안 프로브로 하면 거짓 green**. 라이브 판정은 반드시 폐쇄 후(V3)
- 쓰기·조회 분리 규율은 **이 Phase의 수리가 라이브 확인되기 전까지 유지**
- `settings.SEALED.json` 편집 시 JSON 유효성 즉시 검증 (`node -e` 파싱 아님 — 조회 명령 단독으로)

## 담당 SubAgent

메인 직접 (봉인층 — `_routing.md` R/W 경계). reviewer 자동 트리거 대상(harness).
