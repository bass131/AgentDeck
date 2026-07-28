---
description: attended 리팩토링 스윕 (loop-driver refactor 프리셋) — production 코드의 코드 스멜·SOLID 부합도를 핫스팟(변경 빈도×복잡도) 우선순위로 진단하고(기본 dry-run), --apply 명시 회차에만 회귀 게이트 통과분을 전용 브랜치에 로컬 커밋한다 (push/PR 없음). 사용자가 세션을 감독할 때 호출.
argument-hint: "[--apply=low|high] [--max=N] [--domains=shared,main,backend,renderer,qa] — 기본: dry-run, max=8, 전 도메인"
---

# /refactor-sweep — attended 리팩토링 스윕

> **역할**: [`loop-driver.md`](../policies/loop-driver.md)의 *refactor 프리셋*. production 코드의 코드 스멜·SOLID 부합도를 핫스팟 우선순위로 진단하고, `--apply`를 명시한 회차에만 회귀 게이트 통과분을 전용 브랜치에 로컬 커밋까지 수행한다. 커밋 이후는 영호가 이력을 보고 선별한다 — 살림 / 재논의 / revert.
>
> **이 문서가 소유하는 것**: 스윕 절차 · 진단 축(스멜·핫스팟) · 위험도 4분류 · 전용 브랜치와 baseline 규율 · 사후 선별. **소유하지 않는 것(정본 포인터)**: 비가역 사람 게이트 = CORE-06 · 실행 주체 분업 = [`execution-owner.md`](../policies/execution-owner.md) · 신뢰경계/엔진 경계 = CORE-01·02(ADR-003) · renderer 육안 = [`work-judge.md`](../policies/work-judge.md) 버킷 (b) · 커밋 규약 = CORE-09 · CodeGraph = 헌법 CodeGraph 절. **여기 다시 적지 않는다 — 충돌 시 정본이 이긴다.**

호출 시점은 마일스톤 사이 정비·리팩토링 백로그가 쌓였을 때, 영호가 세션을 감독하는 동안만이다(무인·예약 기동 금지 — loop-driver §3 기동층 v1). 코드 변경 직후의 자동 리뷰는 reviewer, 구조·ADR 규칙 점검은 `/review`의 몫이다.

## 모드 — 기본값은 dry-run

| 호출 | 하는 일 |
|---|---|
| 인자 없음 | 진단과 제안 diff까지만 리포트로 남긴다. 코드를 바꾸지 않는다. |
| `--apply=low` | ✅ 저위험만 커밋한다. 🔶는 제안으로 남긴다. |
| `--apply=high` | ✅와 🔶를 커밋한다. 🔶는 Step 4 재검증 필수. |

실증 전의 자동 적용을 기본값으로 두지 않는다 — 잘못된 판정 스키마가 기본값이 되면 굳는다. 기본값 변경(승격·강등)은 실증 리포트를 근거로 영호가 유지보수 창에서 하고, 갱신 이력에 한 줄 남긴다.

공통 인자: `--domains`(기본 전 도메인) · `--max=N`(회차당 커밋 상한, 기본 8).

## 스윕 불변식

아래는 전부 `[문서 규범]`이다(P06) — 받쳐주는 훅이 없으니 이 문장들이 유일한 방어선이다. 기계가 막는 것(push·파괴 명령·봉인)은 위 정본 포인터 쪽 소유라 여기 없다.

1. 작업은 전용 브랜치 `refactor/auto-YYYYMMDD`(중복 시 `-NN`)에서만 한다. 출발 브랜치와 master는 건드리지 않는다.
2. 회귀 게이트 green인 변경만 커밋한다. red면 변경을 반씩 적용해 게이트를 반복하는 이분 격리로 범인을 특정하고, 통과분만 커밋한 뒤 범인은 `git restore`로 되돌려 리포트에 "실패로 미적용"으로 남긴다.
3. 거동과 공개 계약(시그니처·IPC·AgentEvent)은 불변이다. 바꾸면 리팩토링이 아니라 별도 Phase다(two-hats — 리팩 모자와 기능 모자를 동시에 쓰지 않는다).
4. 커밋은 항목별 atomic — `refactor(scope): <한 줄> [auto-sweep]`, 본문에 무엇/파일:줄/왜. 이 본문과 리포트가 사후 선별의 입력이다.
5. 진단 백로그는 매 회차 그 자리에서 실측해 만든다. 과거 서베이·Phase 문서를 시드로 쓰지 않고, 이 문서에 좌표·파일명을 박제하지 않는다 — rename에 조용히 죽고, 이미 갚은 항목이 유령 안건으로 부활한다.
6. production 경로(`02_Source/**`·`99_Others/tests/**`)가 dirty면 시작하지 않는다. 그 외 경로의 dirty(work-pin은 설계상 상시 dirty)는 리포트에 기록만 하고, 이 스윕에서 스테이징하지 않는다.

## 도메인과 Worker

| 도메인 | 경로 | Worker |
|---|---|---|
| shared | `02_Source/shared/**` (trust-boundary 계약은 거동 불변만) | shared-ipc |
| main | `02_Source/main/**` (`00_ipc/**`는 ⛔) | main-process |
| backend | `02_Source/main/01_agents/**` (어댑터 내부까지만) | agent-backend |
| renderer | `02_Source/renderer/**`의 로직(store·hooks·util). 시각은 📋 | renderer |
| qa | `99_Others/tests/**` (테스트 구조 정리·중복 제거) | qa |

`*.config.*`·`*.d.ts`·`.env*`·생성물은 항상 제외한다. ⛔·📋의 경계는 아래 위험도 분류가 정의한다.

## 절차

**0 — 준비.** 불변식 6(dirty 판정)을 통과하면 현재 브랜치를 복귀 좌표로 기록하고 전용 브랜치를 만든다. `.codegraph/`가 있으면 `codegraph-update`(sync) 1회, 없으면 codegraph는 건너뛴다. baseline 회귀를 1회 돌리고(실행 주체는 execution-owner를 따른다 — 이하 게이트·git 실행 동일) red면 시작 자체를 중단한다. 측정된 `Tests passed` 수가 baseline이다.

**1 — 진단.** 두 축으로 백로그를 만든다.
- **핫스팟(우선순위 축)**: 리팩토링 가치 = 복잡도 × 변경 빈도(churn)다. `git log --format= --name-only -- 02_Source 99_Others/tests | sort | uniq -c | sort -rn`으로 churn을 뽑고, 복잡도 대리 지표(줄 수·codegraph 노드 수)와 함께 정렬한다. 크지만 아무도 안 건드리는 파일은 이자가 붙지 않는 부채라 후순위다. `convention-size-guard`가 편집 중 띄운 거대파일 경고 이력도 입력이다(그 훅의 메시지가 판정을 본 스윕에 위탁한다).
- **스멜(발견 축)**: 도메인별로 reviewer를 병렬 호출한다(읽기 전용이라 충돌 없음). 입력: `range` = `refactor-sweep-YYYYMMDD-{domain}` / `files` = 도메인 production 파일 목록(제외 필터 적용) / `diff_summary` = "리팩토링 전 진단 — 변경 없음. 코드 스멜 축(Long Method · Large Class · Duplicated Code · Shotgun Surgery · Divergent Change · Feature Envy · Speculative Generality)과 SOLID 부합도 측정. CRITICAL(신뢰경계/ADR-003) 위반 후보 포함." / `grade` = 보통. 브리프에 명시: 구조·호출·영향 판정(죽은 코드·미사용 export·중복 호출면)은 Grep 루프 전에 codegraph CLI로 교차 확인할 것.

결과를 합쳐 아래 분류로 라벨을 달고, 우선순위는 핫스팟 순으로 매긴다. 스멜 이름은 진단 언어지 자동 판정 규칙이 아니다 — 처리 라벨은 분류표만이 정한다.

**2 — 위임.** dry-run이면 5로 건너뛴다. apply면 라벨 범위(low = ✅, high = ✅+🔶)를 shared → main → backend → renderer → qa 순서로 도메인 Worker에 직렬 위임한다 — 병렬이면 어느 변경이 무엇을 깼는지 추적이 안 된다. 브리프: 실측 좌표(file:line) / 완료조건(거동 불변 + 공개 계약 불변 + typecheck green) / 제외(⛔·📋 전부) / 🔶는 "한 리팩토링 = 한 커밋" 단위 / 출력으로 커밋 메시지 후보(무엇을/파일/왜). Worker는 수정만 한다.

**3 — 게이트와 커밋.** 도메인 한 묶음이 끝나면 회귀 게이트를 1회 돌린다(출력이 트랜스크립트에 남게). green/red 판정과 커밋 메시지 문구는 메인이, 스테이징(명시 파일만)·커밋 실행은 위임이 맡는다. green이면 불변식 4대로 항목별 커밋, red면 불변식 2대로 이분 격리한다.

**4 — 재검증.** 변경된 도메인만 reviewer를 다시 병렬 호출한다(`diff_summary` = 커밋 요약). 확인 질문은 "거동 불변인가, 새 위반(특히 CRITICAL)을 만들지 않았는가". 🔶는 필수고, 🔴가 나오면 그 커밋을 revert 후보로 표시해 리포트에서 강조한다.

**5 — 리포트.** `00_Documents/03_Reviews/Harness/YYYY-MM-DD-refactor-sweep.md`에 남긴다: 모드·브랜치·무관 dirty 목록 / baseline→최종 게이트 수치 / 핫스팟 상위 목록과 도메인별 부합도 / 적용 커밋 표(hash·라벨·한 줄) / 🔶 우선검토 상세 / 제안만(⛔·📋 — 파일:줄, 제안 diff, 제외 사유) / 실패 미적용 / **적합도 함수 승격 후보**(이번에 고친 성질 중 기계 검사로 고정할 가치가 있는 것 — 테스트는 qa Phase, 훅은 유지보수 창 몫이라 스윕은 후보 제안까지만. 고정하지 않은 성질은 다음 스윕에서 되돌아올 수 있다) / 선별 가이드. push·PR은 하지 않고 "사람 GO 대기"로 명시한다(CORE-06). 영호에게는 모드·커밋 수(✅/🔶)·제안/실패/재검증 🔴 건수·리포트 경로를 요약 보고한다.

## 위험도 분류

처리는 네 갈래다: **✅ 자동 적용**(저위험 — 거동 불변·가역·국소) / **🔶 자동 적용**(고위험 — 구조 변경, 재검증 필수) / **⛔ 영구 제외**(신뢰경계·ADR-003 — 테스트로 못 잡는 구멍이라 영원히 사람 트랙, 제안까지만) / **📋 제안만**(육안 검증 대상).

| 발견 | 처리 |
|---|---|
| 죽은 코드·미사용 export/import·superseded 잔재 (codegraph로 소비처 0 교차 확인) | ✅ |
| 네이밍 일관성·자명 주석 제거·순수 헬퍼 추출 — 기준은 반복 횟수가 아니라 "정형화 가능(시그니처 동일) + 중복 실측" 두 축 | ✅ |
| RMW·보일러플레이트 헬퍼 추출(거동 불변) | ✅ |
| 거대파일 분할(Large Class·Long Method — barrel·store 분리·reducer 분리·훅 추출 류) — 단계별 분리로 관측 표면을 먼저 만들고, 공용화는 중복이 실측된 뒤에 | 🔶 |
| 평행 구현 통합(Duplicated Code — 같은 개념의 중복 구현, 대상은 Step 1 실측으로 특정) | 🔶 |
| `02_Source/preload/**` · `02_Source/main/00_ipc/**` · `canUseTool`/권한 경로 · ADR-003 엔진 리터럴의 어댑터 밖 이동 | ⛔ |
| renderer 시각(.css·JSX 레이아웃·애니메이션 — work-judge 버킷 (b)) | 📋 |

판정 순서는 위치가 우선이다: ⛔ 위치 → 📋 위치 → 구조 변경이면 🔶 → 나머지가 ✅. reviewer가 🟡로 정말 모호하다고 하면 이번 회차는 📋로 미룬다.

## 회귀 게이트

`npm run typecheck`(node·web 양쪽 green) → `npm run test`(baseline 비감소 + 신규 fail 0) → `npm run lint`(0 error). baseline은 Step 0의 실측값이라 테스트 수의 자연 증감에 견고하다. 게이트를 돌리게 하는 훅은 없다 — 출력이 트랜스크립트에 남게 실행하는 것이 유일한 장치다(loop-driver §4).

## 사후 선별

영호가 리포트와 `git log refactor/auto-YYYYMMDD`를 보고 세 갈래로 정한다. 커밋 이력이 변경점의 단일 진실, atomic 커밋이 선별 단위다. 전체를 날리는 것은 전체가 NG일 때만이다.

| 판단 | 처리 |
|---|---|
| 전체 OK | 살린다. push·PR은 사람 GO로. |
| 일부 NG | OK는 살리고, 방향은 맞는데 방식이 별로면 재논의(커밋 본문이 의도를 보존한다), 의도가 틀린 것만 `git revert <hash>`. |
| 전체 NG | `git checkout <원브랜치> && git branch -D refactor/auto-YYYYMMDD`. |

## 함정

- 리팩토링의 안전망은 기존 테스트다. 테스트가 약한 핫스팟은 스윕에서 제일 위험한 조합(자주 바뀌는데 안전망이 없다)이다 — 리팩 전에 characterization 테스트(현재 거동을 그대로 박제하는 테스트)를 qa에 위임해 깔고, 리포트에서 강조한다.
- Worker가 ⛔ 영역을 "정리"하려 들면 그 항목은 즉시 중단한다.
- 어댑터 거대파일을 분할할 때 엔진 리터럴(resume·Cron·streamInput·SDKUserMessage)이 shared·공용층으로 새면 ADR-003 위반이다. 분할은 어댑터 내부 모듈로만 한다.
- reviewer는 자기 슬래시의 진단을 후하게 볼 수 있다(self-assessment bias). 자동 적용 첫 회차는 2차 reviewer 또는 상향 모델의 cross-check 1회가 필수다.

## 변경 시 동기화 책임

본 문서 수정 시 함께 점검: [`loop-driver.md`](../policies/loop-driver.md) §7(프리셋 서술) · [`_routing.md`](../agents/_routing.md) 버킷 (b) 예시 · `convention-size-guard.sh`(이름 참조 — 메시지가 본 스윕을 판정자로 지목).

## 갱신 이력

- 2026-07-28 — v3.1 정식 채택(유지보수 창, dry-run 파일럿 1회 실증 후): 진단을 이론 3축으로 재편 — 발견 축을 스멜 카탈로그(Fowler) 이름으로, 우선순위 축을 핫스팟(churn×복잡도, Tornhill)으로 신설, 리포트에 적합도 함수 승격 후보 칸 추가. 스멜 이름은 진단 언어일 뿐 처리 라벨은 분류표가 정한다. 파일럿 발견(v3.2 후보): churn 실측은 rename 이력 단절 보정 필요 · convention-size-guard 경고는 로그가 없어 "이력 입력"이 현재 미실행 가능.
- 2026-07-28 — 전면 리뉴얼(초안). 기본값을 commit 모드 → dry-run으로(실증 전 자동 적용 미기본), G1~G9 해체(소유권 밖 규칙은 정본 포인터로), dirty 게이트를 production 경로 한정으로 정밀화, CodeGraph 편입, 실행 주체를 execution-owner 정합으로. 모드 기본값 변경은 여기 한 줄씩 쌓는다.
- 2026-06-26 — ClaudeDev `/refactor-sweep` AgentDeck 이식(원판).
