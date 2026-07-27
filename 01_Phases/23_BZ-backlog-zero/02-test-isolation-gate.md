---
owner: 유영호
milestone: BZ
phase: 02
title: 테스트 격리 전역 게이트 신설 (백로그 21①)
status: done
grade: 복잡
loop_track: auto-gate
domain: qa
estimated: 2~3h
summary: vitest globalSetup이 ~/.agentdeck-dev를 스냅샷·대조해 테스트의 저장소 밖 쓰기를 red로 만든다. TDD + 뮤테이션 음성 대조. engineVersions.test.ts qa 후속 3건 동반.
---

# Phase 02: 테스트 격리 전역 게이트 신설

> **등급**: 복잡 (신설 게이트 + 기준선 변동) · **담당**: `qa` · **문**: 없음 (밤 자율 — 계약 = 계획서 🌙 절)
> 게이트 기준선 = [`_milestone-plan.md`](_milestone-plan.md)

## 🎯 목표

테스트 실행이 끝난 시점에 `~/.agentdeck-dev`에 **남은 순 변화(net change — 추가·수정·삭제)**가 있으면 `npx vitest run` 자체가 red가 된다 — engineVersions 사고(실사용 config를 `activeVersion: null`로 덮고도 green)의 재발 클래스를 전역으로 잡는다. **한계를 정직하게** (Codex 교차 리뷰 축 4 반영, 2026-07-27): ① 사후 검출이다(피해를 막는 게 아니라 침묵을 깬다) ② 시작·종료 스냅샷 대조라 **생성→삭제·수정→원상복구처럼 종료 상태가 같아지는 일시 쓰기는 미탐**이다 — 이 한계를 `homeGuard.ts` 주석과 P07 백로그 신규 등재(CI 제한 권한 항목)에 병기한다. 모든 순간의 쓰기를 잡으려면 파일 감시·제한 권한 실행이라는 다른 설계가 필요하다.

## ⏪ 사전 조건

- [x] Phase 01 완료 (쓰기·조회 혼합 오탐 수리 — 이 Phase의 셸 작업이 오탐에 물리지 않게) — 오탐 수리 V3 라이브 확증(P02 셸 작업 무마찰 실증). ⚠️ shell-policy 커밋 자체는 reviewer 🔴로 보류(P01 F절) — 오탐 해소 효력과는 별개
- [x] 방식 확정 — globalSetup 스냅샷·대조 (영호 2026-07-27). CI 제한 권한은 백로그 신규 등재(P07)

## 📝 작업 내용

- [x] (TDD red 먼저) 대조 로직 순수 함수의 실패 테스트 — `99_Others/tests/_lib/homeGuard.test.ts` (신규 14건, red 확인 후 구현)
- [x] 구현 — `99_Others/tests/_lib/homeGuard.ts` (신규): 순수 함수 + `GuardFs` 주입(기본 `nodeGuardFs`). 비교 축 = size+mtimeMs, 디렉토리는 존재만(자식 변화 잡음 회피). 한계 주석(순 변화만 검출) 상단 박제
- [x] `99_Others/tests/globalSetup.ts` (신규): `AGENTDECK_HOMEGUARD_DIR` 주입 가능, 기본값 `~/.agentdeck-dev`. teardown 대조 → 차이 목록 포함 에러 throw
- [x] `vitest.config.ts`에 `globalSetup` 등록
- [x] **뮤테이션 음성 대조** — 임시 디렉토리 + 임시 프로브로 실측: **15/15 green인데 exit 1** (잡으려던 바로 그 상태). 출력 하단 박제. 실사용 홈 무접촉(stat만)
- [x] **오탐 폴백 규정** — 밤 동안 미발동 (전량 green)
- [x] qa 후속 3건 — 좌표 실측 일치, 전부 반영 (건수 무증가 확인)
- [x] `w6-selection-ask.test.tsx` — `{...actual}` 제거, named 명시 열거 + default에도 같은 mock 고정

## ✅ 완료 조건

- [x] `npx vitest run` 전량 green — 5,336 → **5,350 (+14 = homeGuard 전량)**, engineVersions 33건 불변
- [x] 마지막 `Tests N passed | M skipped` 원문 줄 하단 박제 (🟡c 앵커)
- [x] 뮤테이션 음성 대조 실측 1회 — red 출력 박제 (exit 1)
- [x] `npm run typecheck && npm run lint` 0/0
- [x] `~/.agentdeck-dev` mtime 불변 (stat 전후 동일 — 하단 박제)

📦 커밋 `f715710` (qa — 명시 6파일)

## 📚 학습 포인트

- **globalSetup vs setupFiles**: globalSetup은 전체 실행에 1회(워커 밖), setupFiles는 테스트 파일마다. 전역 스냅샷 대조는 전자가 맞다 — 테스트별로 하면 병렬 워커끼리 서로의 쓰기를 오검출한다
- 게이트의 실효는 "만들었다"가 아니라 **뮤테이션이 red를 내는 실측**으로만 보증된다(성향 20·NC P07 수리와 같은 규율)

## ⚠️ 함정

- 감시 범위를 홈 루트 전체로 넓히면 다른 프로세스의 쓰기가 오탐이 된다 — `~/.agentdeck-dev` 한정(계획서 함정 표)
- e2e(playwright)는 vitest globalSetup 밖이다 — 이 게이트는 vitest 계열만 커버. e2e 쪽은 백로그 신규 등재에 명시(P07)
- 스냅샷을 mtime만으로 하면 같은 초 내 덮어쓰기를 놓칠 수 있다 — size 병용, 필요시 내용 hash는 파일 수가 작아(config 1 + engines 폴더) 비용 무시 가능

## 담당 SubAgent

`qa` (99_Others/tests/** + vitest.config.ts — 테스트 인프라). reviewer 조건부(≥10줄 + 보통 이상 충족 시 자동).

---

## 📌 실측 박제 (qa, 2026-07-27 — 🟡c 앵커)

### G4 `npx vitest run` (최종 실행, exit 0)

```
 Test Files  396 passed | 6 skipped (402)
      Tests  5350 passed | 10 skipped (5360)
```

기준선 5,336 → **5,350 (+14)**. 증가분 전량 = `_lib/homeGuard.test.ts` 신규 14건.
`engineVersions.test.ts` 는 33건으로 **불변**(qa 후속 3건은 기존 케이스 수정·주석이라 건수 무증가).

### 뮤테이션 음성 대조 (1회 실측 — red 출력 원문)

`AGENTDECK_HOMEGUARD_DIR` 를 임시 디렉토리로 돌려놓고, 그 디렉토리에 쓰는 임시 프로브
테스트(`_lib/__mutation-probe.test.ts`, 실측 후 삭제)로 **설치된 게이트**를 때린 결과 —
**테스트 자체는 15/15 green 인데 실행은 exit 1**(= 이 게이트가 잡으려던 바로 그 상태:
"홈을 오염시키고도 green"):

```
 Test Files  2 passed (2)
      Tests  15 passed (15)

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: [homeGuard] 테스트 격리 위반 — 저장소 밖 디렉토리가 테스트 실행으로 변경되었습니다.
감시 대상: .../scratchpad/hg-probe-20081
변화 2건:
  - [modified] engine-config.json — size 25 → 22, mtime 1785163001058.3071 → 1785163002511.754
  - [added] leaked.json — 파일(size 2)이 생성됨

테스트는 실사용 데이터에 쓰면 안 됩니다. 임시 디렉토리(fs.mkdtempSync)로 경로를 주입하거나,
userData 경로 주입 매개변수를 명시하세요 (예: 99_Others/tests/main/engineVersions.test.ts).
이 게이트의 감시 대상은 AGENTDECK_HOMEGUARD_DIR 환경변수로 바꿀 수 있습니다.
    at Object.teardown (C:\Dev\AgentDeck\99_Others\tests\globalSetup.ts:27:9)

===EXITCODE=1
```

> vitest 는 globalSetup teardown 예외를 `Startup Error` 라벨로 찍지만 **종료 코드는 1** 이다 —
> CI 회귀 게이트 판정에는 문제 없다(라벨이 아니라 exit code 가 판사).

### G5 `npm run typecheck && npm run lint`

둘 다 exit 0 / 출력 0건.

### 홈 무접촉 확인 (`~/.agentdeck-dev`)

작업 착수 전 · 전량 실행 후 `stat` 동일 — **mtime 불변**:

```
2026-06-24 13:20:16.190483800 +0900 0   (디렉토리)
2026-07-26 23:20:08.368917000 +0900 27  (engine-config.json)
```

뮤테이션 대조는 임시 디렉토리로만 수행 — 실사용 홈은 읽기(stat)만 했다.
