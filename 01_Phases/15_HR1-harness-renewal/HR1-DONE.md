---
summary: 하네스를 3층 구조(엔진 중립 코어 CORE-01~13+manifest / Claude 어댑터 / Codex 전담 보조)로 재설계하고 conformance 게이트로 정합을 기계화 — 드리프트 원인 제거·훅 관측성 확보·Codex 최소권한 축소를 6 Phase에 걸쳐 완료(게이트 7종 green·reviewer CRITICAL 0).
phase: HR1-마일스톤-마감
work-id: hr1-harness-renewal
status: done
grade: 대규모
gate_version: 1
report_html: 00.Documents/reports/milestones/HR1-하네스-리뉴얼-종합.html
owner: youngho
milestone: HR1
completed_at: 2026-07-13
---

# HR1 — 하네스 전면 리뉴얼 마일스톤 완료 박제

**기간**: 2026-07-12 ~ 2026-07-13 · **브랜치**: `feature/hr1-harness-renewal` · **Phase**: 6개(P01~P06) 전부 done

## TL;DR

하네스(AI에게 규칙·권한·훅을 채워 안전하게 굴리는 통제 장치)를 **3층 구조**로 재설계했다 — 안전의 *의미*를 담는 엔진 중립 공통 코어(`00.Documents/harness/CORE.md`, CORE-01~13 + machine-readable `core-manifest.json`), 그걸 강제하는 Claude 어댑터(`CLAUDE.md`·`.claude/**`), Codex 전담 보조 어댑터(`AGENTS.md`·`.codex/**`). 동기 = 같은 안전 규칙이 두 곳에 적혀 드리프트가 구조적으로 재발한다는 진단(H3 결함 ①)과, Codex를 풀 드라이버로 굴리려던 전제의 철회(영호 2026-07-12), 그리고 훅이 사용자 눈에 안 보이던 관측성 통증. GPT-5.6 Sol 적대 리뷰 No-ship(high 4·medium 2)을 전건 반영해 계획을 v2로 재편(7→6 Phase)한 뒤 실행했다. 마감 시점 게이트 7종 green·reviewer CRITICAL 0·conformance PASS 13/13. 남은 비가역 작업은 PR 하나로, 영호 게이트로 보존한다.

## 5단계 보고

- 🎯 **무엇을 만들었나** — 하네스 3층 구조를 수립했다. ① 엔진 중립 코어(`CORE.md` 조항 CORE-01~13 + 조항별 안정 ID·버전 + `core-manifest.json`이 "조항 × 어댑터 2종" 매핑을 기계 선언 + `MAPPING.md` 이중 서술 13건 액션 지도) ② Claude 어댑터 — `CLAUDE.md`를 "코어 참조 어댑터 + 진입점"으로 재정렬(CRITICAL 요지+CORE-NN 참조로 축약)하고 훅 관측성을 `systemMessage` 채널로 전환 + `guard-blocks.log` 원장 신설 ③ Codex 전담 보조 — `AGENTS.md` 재작성·권한 프로필 8→3·custom agent 9→2·시크릿 직접 참조 차단 훅 신설·doctor 3축+baseline 외부화를 단일 green 커밋으로 원자 전환. 부수로 ADR.md(460줄·33건)를 1결정=1파일 + 인덱스로 분리(P01)하고, P06에서 `conformance-check.mjs`로 3층 정합을 CI 게이트로 못 박았다(ADR-034).
- 🤔 **왜 필요한가** — 같은 안전 의미가 `CLAUDE.md`와 `AGENTS.md` 두 정본에 있으면 한쪽만 고쳐질 때 드리프트가 필연적으로 재발한다(원인 = 노력 부족이 아니라 "정본이 둘인 구조"). 그래서 코어를 엔진 중립 위치로 추출해 원인을 제거했다. 겹쳐서, Codex는 "Sol을 직접 써보고 싶다"가 원 의도였는데 이식 중 Claude의 운영 조직론(Supervisor 전임·워커 함대)까지 통째로 복제돼 의도와 어긋났고(풀 드라이버 전제 철회), 남기면 옛 결정 기반 사고의 씨앗이 된다. 마지막으로 훅이 `echo >&2`로만 말해 사용자 눈에 안 보였다 — 안전 장치가 작동해도 안 보이면 신뢰할 수 없다.
- 🛠️ **어떻게 만들었나** — 하네스·헌법·ADR은 영호 단독 통제라 실행 Phase는 유지보수 창 개방 하 메인 직접 수술 + 영호 감독(선례 2026-07-11). Phase 문서·pin·CHANGELOG·커밋 = secretary, 제품 코드 = main-process Worker의 분업. 큰 목표를 6 Phase로 분해해 코어→어댑터 순 의존성으로 쌓았다(P01 ADR 세분화 → P02 코어 추출 → P03 Claude 어댑터 → P04 훅 관측성 → P05 Codex 원자 전환 → P06 통합 검증·마감). 핵심 설계 선택: (a) 코어에 조직론을 넣지 않고 "엔진이 바뀌어도 참인 문장"만 — 관심사 분리(인터페이스/구현 분리와 동형) (b) 정합을 사람 눈이 아니라 manifest + conformance 게이트로 기계 검사 (c) Codex 전환을 점진 아닌 단일 green 원자 커밋으로 — 어떤 중단 지점에서도 커밋된 하네스는 green(Sol #3 반영). ADR 분리는 결정론 재조립으로 "바이트 === 원본" 의미 무변경 기계 증명, stash 5종은 불변 OID(99704c1b) 검증 후 drop.
- 🧪 **테스트 결과** — P06 통합 검증에서 게이트 7종 전부 green: typecheck 0 / Vitest 4632 pass·8 skip / lint 0 / Claude 훅 테스트 23 pass / Codex 훅+계약 테스트 30 pass / doctor --live exit 0 / conformance PASS 13/13. reviewer 1패스(P04 보안 훅 중심) = CRITICAL 0·major 0·minor 3(전부 하네스 영역 — 영호 유지보수 창 소관). conformance 게이트는 음성 검증(깨진 픽스처 8가지 고장 모드 전부 FAIL·exit 1)까지 확인. 관측성 프로브(`touch AGENTS.md` → 차단+systemMessage+원장 append)와 agent-runs.ts 라인 하드 참조 0건 확인. (AC 섹션에 명령·결과 원문 박제)
- ➡️ **다음 스텝** — PR 생성 = 영호 게이트(비가역·결정 기록 의무). Codex 세션에서 `$agentdeck-review` 1회 → `/agent`로 reviewer(gpt-5.6-sol) 라벨 실적용 확인(P05 스모크 4번 이월). 훅 견고성 손질(유지보수 창 1회 묶음 — reviewer minor 1~3). 잔여 백로그(CORE-03 Claude 시크릿 read 차단 공백 등)는 별건 추적.

## AC 검증 결과

마일스톤 완료 조건을 실제로 실행한 명령과 결과(P06 통합 검증 — secretary가 conformance 재실행, 나머지는 P06 실측 증거 원문 박제):

```text
$ npm run typecheck
  0 errors

$ npm run test        # Vitest
  Tests  4632 passed | 8 skipped

$ npm run lint
  0 problems

$ node --test .claude/hooks/_lib/*.test.mjs
  tests 23, pass 23, fail 0

$ node --test .codex/hooks/agentdeck-hook.test.mjs .codex/harness-contract.test.mjs
  tests 30, pass 30, fail 0

$ node .codex/harness-doctor.mjs --live
  exit 0 — HOOK-GUARD PASS 3/3 · WRITE-BOUNDARY PASS 5/5 · OS-READ-BOUNDARY UNENFORCED_EXPECTED(0.144.1 baseline 일치) · LIVE-CONFORMANCE ACCEPTED_WITH_LIMITATION

$ node 00.Documents/harness/conformance-check.mjs
  CONFORMANCE: PASS — 13/13 조항 (매핑·버전·impl 실재·verify 선언 전부 green)   exit 0
```

**음성 검증(게이트가 진짜 고장을 잡는가)**: 깨진 픽스처 8가지 고장 모드(미매핑·버전 불일치·impl 부재·verify 선언 누락 등) 전부 FAIL·exit 1 확인.

**reviewer 1패스(R-only, P04 보안 훅 중심)** — CRITICAL 0 · major 0 · minor 3, ship 판정:

- 차단 판정 라이브 프로브 9종 전부 기대치 일치, "관측 추가·판정 불변" 성립.
- minor 3건(전부 하네스 영역 — 영호 유지보수 창 소관): ① `tdd-guard.sh:52` 경고 경로 `emit_system_message`에 `|| true` 누락(set -e로 notify 원장 유실 가능 — non-blocking·보안 회귀 아님) ② dangerous/supervisor-guard의 `shell-policy.mjs` 크래시 시 fail-open(기존·P04 무관) ③ `.sh` 글루 자동 테스트 공백(라이브 프로브로만 커버).

**관측성 프로브**: `touch AGENTS.md` → supervisor-guard 차단 + systemMessage 표면화 + `guard-blocks.log` 61→62줄 append(4필드 원장 형식).

**잡정리(H3 안건 ③)**: `agent-runs.ts` 주석의 라인 번호 하드 참조 0건(커밋 327b218 — `L173-174` → `start()`의 이중 등록).

## AC ↔ 마일스톤 완료 조건 대조

- [x] 공통 코어 정본 + clause ID·버전·manifest 양 어댑터 매핑 — 이중 서술 0·미매핑 0 (conformance PASS 13/13)
- [x] 훅 발화·차단 사용자 가시(라이브 프로브) + `guard-blocks.log` 기록
- [x] Codex 계약 = 전담 보조 + 최소권한 프로필 + negative canary PASS, 단일 green 커밋
- [x] ADR 개별 파일 구조 + 인덱스, 참조 파손 0
- [x] 제품 게이트 무영향: typecheck 0 · vitest green · lint 0
- [x] conformance 게이트 green (P06)
- [x] HR1-DONE.md + HTML 종합 보고 + CHANGELOG [H]
- [ ] PR (영호 게이트 — 결정 기록 대기)

## 결정 흐름 (회고 참고용)

- 코어에 조직론 포함 vs 배제 → **배제**. Supervisor 전임·워커 함대·비용 계층은 Claude 어댑터 층. 코어는 엔진 중립 문장만. 대가 = 조직론이 어댑터에 남아 Codex 어댑터는 별도 축소 필요.
- 정합 강제 = 사람 리뷰 vs 기계 게이트 → **기계**(manifest + conformance-check.mjs). 드리프트 재발을 사람 규율이 아니라 CI가 막는다. Sol #4 반영.
- Codex 전환 = 점진 vs 단일 원자 커밋 → **원자 커밋**. 중간 RED가 저장소에 남지 않게(Sol #3, 7→6 Phase 합병). 대가 = 커밋 하나가 커짐.
- 차단형 훅 가시화 = exit-0 `permissionDecision:"deny"` 채택 vs 현행 exit 2 유지 → **현행 exit 2 + 원장**(fail-closed 우선 — deny-JSON은 실측 유효하나 fail-open 위험으로 미채택, 영호 확정).

## 막혔던 지점 (있다면)

- P06 시작 시 phase-gate-validator는 새 `-DONE.md` 작성 시 `report_html`이 가리키는 HTML이 실재하고 5단계 라벨을 담아야 통과 → HTML 종합 보고를 먼저 생성한 뒤 DONE을 박았다(P05 접미사 반려 교훈 반영, 라벨 정확 일치).
- Codex CLI 도입 당일 패치(0.144.0→0.144.1)로 `REVALIDATION_REQUIRED` 첫 실전 발화 → baseline 외부화(codex-baseline.json)로 patch churn 흡수(P05).

## 학습 일지 후보 키워드

- 3층 하네스 · 엔진 중립 코어 · SSoT와 드리프트의 구조적 원인
- clause ID·machine-readable manifest·conformance 게이트(음성 검증)
- 관심사 분리를 문서에 적용 (무엇이 안전인가 vs 어떻게 강제하나)
- 적대적 리뷰(No-ship) 전건 반영 · 단일 green 원자 커밋
- 훅 관측성 (systemMessage 채널 · append-only 원장 · fail-closed 우선)
- 부분 보장 가드레일의 정직한 선언 · 불변 앵커(OID)

## 추록 — Codex 전담 보조 첫 실전 가동 (2026-07-13)

- **P05 스모크 4번 종결(라벨 실적용 — 기계 증거)**: Codex 세션 로그(`~/.codex/sessions`)에서 reviewer 스레드(`/root/reviewer_conformance_851c83d`, depth 1 스폰) 실행 기록에 `"model":"gpt-5.6-sol"` + `"reasoning_effort":"xhigh"` + permission_profile `restricted`(`secrets/**` deny 글롭 포함) 실적용 확인. ADR-033 원문 6항의 "custom agent 실제 모델·권한 label 적용 PENDING"을 사실상 종결(ADR 본문 추가 기재 여부는 영호 선택).
- **Sol 첫 실전 리뷰(대상: 커밋 `851c83d` conformance 게이트)** — 판정 "재작업 필요 — 🔴2·🟡2":
  - 🔴1 표준 검증 흐름 미연결 → Vitest 스펙으로 `npm run test`에 연결(테스트 집계 4640→4651).
  - 🔴2 CORE 중복·비정규 헤더 조용한 무시(false-green) → 검출·FAIL화.
  - 🟡3 자동 회귀 테스트 부재 → 11케이스 스펙.
  - 🟡4 저장소 밖 경로를 증거로 인정 → `resolveInRoot` 차단.
  - 재작업 커밋: `d7d5758`.
- **의미**: 전담 보조 체제가 첫 가동에서 하네스 게이트 자체의 결함을 잡아 봉합까지 이어짐 — 3층 구조의 교차 검증이 실전 증명됨.

### PR 머지 전 2차 리뷰 — Sol 전체 diff (2026-07-13)

- **Codex `codex review --base master`(gpt-5.6-sol)로 PR #20 전체 재리뷰** → 판정 "patch is incorrect", 발견 2건:
  - **P1(우선순위 1)**: 시크릿 가드가 `readFileSync('.env')`·`ReadAllText('.env')`처럼 표현식 안에 따옴표로 감싼 경로를 못 잡음. Windows에서 OS 읽기 deny가 비강제라 이 훅이 CORE-03의 유일 실효 방어선인데 정면 우회로 존재. → `secretPathCandidates`에 토큰 내 따옴표 리터럴 추출 추가(공백 포함 인용문은 토크나이저가 따옴표를 소비 → 산문 오탐 없음). 실측: 우회 6형태 BLOCK · 산문 3형태 PASS.
  - **P2(우선순위 2)**: doctor `--live` canary가 고정 경로에 기존 파일이 있으면 쓰기 성공으로 오판 + 무조건 삭제(사용자 파일 유실·동시 실행 충돌). → 실행별 고유 토큰 경로 + "이번 실행이 만든 파일만 삭제". doctor를 import-safe(`runDoctor` 가드)로 만들어 순수 헬퍼(`canaryShouldRemove`·`canaryRelative`)를 계약 테스트에 연결.
- **유지보수 창**: 영호가 `settings.json` supervisor-guard 등록 삭제 → 메인 직접 수정 → git restore 재봉인 → `touch AGENTS.md` 차단 실측(봉인 복구 확인).
- **훅 digest** 66830d32…→b0fe85ca… 갱신, 다음 Codex 세션 `/hooks` 재신뢰 필요.
- **봉합 커밋**: `130c74e` (fix(harness): Codex Sol PR리뷰 봉합 — 시크릿 가드 리터럴 경로 우회 P1 + doctor canary 파일 삭제 P2).
- **의미**: Codex 전담 보조가 자기 어댑터의 결함을 스스로 잡아 봉합 — 3층 구조의 자기교정 루프가 머지 전에 작동.

### 봉합 확인 재리뷰 — Sol 3차 (2026-07-13)

- **이전 P1/P2 봉합(커밋 `130c74e`)을 Sol이 `codex review --base master`(gpt-5.6-sol)로 재리뷰** → **원래 P1/P2는 재지적 없음(봉합 확인)**, 대신 새 이슈 3건(전부 실측 확인):
  - **발견1(P1)**: PowerShell `-Path:.env`·`-LiteralPath:.env.local` 콜론 바인딩이 세그먼트 매칭을 우회 → `secretPathCandidates`에 `-Name:Value` 값 추출로 차단. 실측: 콜론 3형태 BLOCK · 오탐 경계 PASS.
  - **발견2(P1)**: `doctor --live`가 canary를 `C:\Dev`에 직접 생성 → root 기본 `agentdeck-assistant`(:tmpdir만 쓰기) 세션에서 EPERM 크래시. 내 CI/Bash는 풀 액세스라 못 덮었던 사각지대. → canary를 `os.tmpdir()`로 이전 + 쓰기 경계 테스트를 소유 프로필 샌드박스 self-clean으로 전환(부모의 repo/`C:\Dev` 직접 쓰기 전부 제거). 엔드투엔드 실측: 미끼 파일 2개 생존 · 잔여 canary 0.
  - **발견3(P2)**: conformance가 `verifyTypes`를 manifest에서 읽어 manifest가 자기 계약을 재정의 가능(bogus 타입 false-green) → 게이트가 고정 allowlist 소유. 실측: bogus 타입 FAIL.
- **규율 기록**: 시크릿 가드는 denylist(차단 목록)라 구문 우회 공간이 무한 — 발견1이 **시크릿 가드 구문 손질의 마지막 라운드**(영호 합의). 이후 구문 우회는 버그로 취급하지 않고 ADR-033의 "부분 보장 가드레일" 선언 + attended 운영에 맡긴다. 발견2·3은 수렴형 구조 결함이라 종결.
- **훅 digest** b0fe85ca…→42b91351… 갱신, 다음 Codex 세션 `/hooks` 재신뢰 필요.
- **봉합 커밋**: `9455451` (fix(harness): Codex Sol 봉합-확인 재리뷰 3건 — PowerShell 콜론 우회(P1)·doctor tmpdir/self-clean(P1)·conformance allowlist(P2)).
- **의미**: 전담 보조가 자기 봉합의 사각지대(테스트가 못 덮는 실런타임)까지 잡아냄 — 3층 교차검증의 값.

PR 게이트: 영호 GO(2026-07-13) → PR #20 생성(https://github.com/bass131/AgentDeck/pull/20) — merge는 별도 게이트.
