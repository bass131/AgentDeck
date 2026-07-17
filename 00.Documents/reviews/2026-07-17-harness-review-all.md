# 하네스 자체 점검 — 2026-07-17 — scope=all

> 호출: 영호 (하네스 점검 세션). 동원 = reviewer + plan-auditor + secretary(정량 실측) + 메인 본인(훅 직접 점검) + **라이브 발화 배터리**(영호 추가 요청 — "무늬만 Hook" 의혹 실측).
> 이전 점검: 2026-07-11 (`2026-07-11-harness-review-all.md`).

## TL;DR

- **🔴 결함 1개 / 🟡 제안 17개(중복 제거 후) / 🟢 정합 다수** — 🔴은 기능 파손이 아니라 **문서 간 규칙 모순**(reviewer 무조건 발화 깃발 세트가 4개 문서에서 불일치).
- **라이브 발화 배터리: 훅 9종 전원 생존 판정.** "무늬만 Hook" 의혹은 AgentDeck 본체에서는 **기각** — 능동 프로브 7발 전탄 차단/검증 발화 + 원장(guard-blocks.log 1,479줄) 역사적 발화 9종 전원 확인.
- 단, 배터리가 부수 발견 2건을 건짐: **circuit-breaker 등급 추출 조용한 실패**(임계 15→기본 10로 오동작 중), **work-pin 헤더 중복 주입**(매 턴).
- 🟡 대부분은 stale 명칭·수치·인용 드리프트로, 전부 하네스(사용자 단독 통제) 영역 — 봉인 유지보수 창에서 일괄 정정 대상.

---

## 라이브 발화 배터리 (영호 요청 — "무늬만 Hook" 의혹 실측)

설계 원칙: **훅이 죽어 있어도 무해한 명령만 발사** (차단 = 생존 증거, 통과해도 no-op). 능동 프로브는 메인 세션에서 발사(Supervisor 전임 규칙 ②는 메인에만 적용되므로).

| # | 훅 | 프로브 / 근거 | 결과 | 증거 |
|---|---|---|---|---|
| 1 | pin-injector | 매 턴 `<work-pin>` 주입 관찰 | 🟢 생존 | 이 세션 전 턴 주입 확인 (부수: 헤더 중복 — 🟡-13) |
| 2 | supervisor-guard ① (Bash 우회쓰기) | `tee -a CLAUDE.md </dev/null` | 🟢 차단 | 원장 2026-07-17T00:58:55 block |
| 3 | supervisor-guard ① (Write 봉인) | `.codex/_probe-seal.tmp` Write (deny 미커버 sealed 경로 → 순수 훅 시험) | 🟢 차단 | 원장 00:59:37 block — **CORE-12 쓰기 격리 실증** |
| 4 | supervisor-guard ② (git 위임) | `git add --dry-run CLAUDE.md` | 🟢 차단 | 원장 00:58:56 block |
| 5 | supervisor-guard ② (게이트 위임) | `npx tsc --version` | 🟢 차단 | 원장 00:58:57 block |
| 6 | dangerous-cmd-guard (rm) | 존재하지 않는 스크래치 경로 `rm -rf` | 🟢 차단 | 원장 00:58:59 block |
| 7 | dangerous-cmd-guard (git) | `git clean -fd --dry-run` | 🟢 차단 | 원장 00:59:00 block |
| 8 | risk-detector | 프로브 Write 2건에 부수 발화 | 🟢 발화 | 원장 00:59:37·01:00:06 notify (harness 깃발) |
| 9 | phase-gate-validator | `gate_version: 1` 불완전 `-DONE.md` Write | 🟢 엄격 FAIL 발화 | 원장 01:00:08 block — frontmatter 7필드·H2 4종·5단계 라벨 5종·report_html 전 항목 검증 확인 |
| 10 | tdd-guard | (능동 생략 — 02.Source 접촉 회피) 전일 실차단 원장 + `tdd-enforce` 존재 확인 | 🢢 생존 | 원장 2026-07-16T23:12 block "ProviderBrandIcon.tsx 대응 테스트 부재 (차단 모드)" |
| 11 | circuit-breaker | 원장 역사 + 로그 기록 경로 | 🟢 발화 (단 임계 오동작 — 🟡-12) | 원장 다수 "Edit N회/5분 (임계 10)" |
| 12 | reviewer-auto-trigger | 원장 역사 183건 | 🟢 발화 | grep 계수 183 |
| 13 | convention-size-guard | 원장 역사 (Conversation.tsx 1227줄 등) | 🟢 발화 | 원장 2026-07-16 다수 |

**레이어링 실측**: Write 도구로 `.claude/hooks/**` 접근 시 **permission deny가 훅보다 먼저** 발화(tool_use_error). deny 목록 밖 sealed 경로(`.codex/**`·`.gitattributes`·`AGENTS.md`)는 훅이 2선 방어 — 이중 방어 양층 모두 생존 확인.

**"이식하면 무늬만" 원인 후보 (타 프로젝트 이식 시 점검 목록)**:
1. **훅 신뢰 미승인** — Claude Code는 프로젝트별 settings.json 훅을 승인해야 실행. 미승인이면 조용히 전부 미실행 (신뢰는 설정 다이제스트 기준 — 2026-07-13 실측).
2. **node 부재/스텁** — `_lib/*.js` 파서는 node 의존. 이 머신의 python이 MS Store 스텁이라 전 훅이 조용히 무력화됐던 실사(hook-common.sh 헤더 박제)가 바로 이 모드. `parse_hook_payload` 실패 = eval '' fail-open → 훅이 "돌지만 아무것도 안 잡는" 상태.
3. **경로 레이아웃 하드코딩** — tdd-guard(`02.Source/`·`99.Others/tests/`)·risk-detector·supervisor-guard(`02.Source`·`01.Phases`)는 AgentDeck 디렉토리 구조 전제. 다른 구조의 repo에 이식하면 **훅은 실행되지만 글롭이 영원히 미매치 = 무늬만** (hook-glob-rename-trap의 이식 버전 — 가장 유력한 원인 후보).
4. **CRLF** — `.gitattributes`가 `.claude/hooks/**` LF 고정. 이 줄 없이 이식하면 Windows에서 bash가 `\r`로 파손.
5. **Git Bash 경로** — portable Git은 `CLAUDE_CODE_GIT_BASH_PATH` 필요.
6. **state 디렉토리** — `.claude/state/` 부재 시 pin-injector 무발화(정상 동작이지만 "안 뜬다"로 보임)·tdd-enforce 부재 시 경고 모드로 하향.

---

## reviewer 결과 (Step 2 — 그대로)

### 🔴 결함 (0)

명확한 헌법/ADR 위반 또는 "약속-실재 불일치(존재 약속했는데 부재)"는 발견되지 않았다. 아래는 실측으로 green 확인:
- CLAUDE.md가 나열한 훅 9종이 `settings.json`에 전부 등록 + 파일 실재.
- 문서 지도 경로 7개(PRD·ARCHITECTURE·UI·FEATURE_MAP·REPL_TRANSITION·CHANGELOG·MAPPING) 전부 실존.
- `conformance-check.mjs` 실행 = **PASS 13/13** (매핑·버전·impl 실재·verify 선언 전부 green). manifest impl 파일 9종(codex 어댑터 포함) 전부 실존.
- superseded/개정 ADR(004·006·011·014·025) 본문 마커가 인덱스 상태와 1:1 일치.

### 🟡 제안 (5)

1. **[명칭드리프트] 라이브 정책·커맨드가 폐기된 `/work:plan`(콜론) 호출을 지시** — 2026-06-30 `/work:plan` 슬래시 → `/work-plan` Skill 승격 후에도 운영 파일에 콜론 표기 잔존: `.claude/commands/harness.md:2,19,28` · `.claude/policies/doc-thresholds.md:20,95` · `.claude/policies/pin-and-done.md:45`. 존재하지 않는 명령을 호출하라 지시하는 상태. (ADR-011·026·028의 콜론 표기는 동결 역사 기록이라 정정 대상 아님.)
2. **[유령(역방향)] `/harness` 커맨드가 CLAUDE.md 슬래시 목록에 부재** — `.claude/commands/harness.md` 실재·동작하나 헌법 커맨드 열거(6종)에 없음. 기능이 `/work-plan` Skill과 대부분 중복 — 편입 또는 레거시 정리 결정 필요.
3. **[수치드리프트] `harness-review.md:55` "8개 적정한가"** — 같은 파일 `:32` "9역할"·전 문서 "9"와 모순(secretary 복원 전 잔재). "9"로 정정.
4. **[stale 인용] ADR-011(superseded)을 "비가역 사람 게이트" 근거로 인용** — `settings.json:2` · `dangerous-cmd-guard.sh:7`. 의미 정본은 CORE-06이고, dangerous-cmd-guard가 실제 강제하는 건 CORE-07(파괴 명령) — 헤더 라벨이 조항을 잘못 짚음. 강제 자체는 정상, 인용만 stale.
5. **[목록드리프트] `INDEX.md:21` 위험 깃발 요약이 `shared-contract` 누락** — SSOT(grade-and-risk.md)·CORE-10은 6깃발, INDEX 요약은 5깃발.

### 🟢 정합 (6)

- 약속-실재: 훅 9/9·문서지도 7/7·conformance 13/13·슬래시 대부분 1:1.
- policies↔헌법: "충돌하면 헌법이 이깁니다" 단일진실 룰 명시, 우선순위 역전 서술 없음.
- ADR: 인덱스 36행 ↔ adr/ 36파일 1:1, superseded 마커 5건 일치.
- policies 신선도: 최고령 21일 — 6개월 초과 0건.
- 훅 우회: 신규 우회 구멍 0 (기지 백로그 2건은 관리 중 분류) — ※ 메인 본인 점검은 아래에서 신규 3형태를 추가 식별(🟡-14), 성격은 자기 규율 훅의 한계.
- "세션 2종" 표기는 드리프트 아님(작업/리뷰 2종 개념 — end는 마감 커맨드).

## plan-auditor 결과 (Step 3 — 그대로)

실측 기준선: `.claude/agents/` 역할 파일 **9개** + 메타 2개(_routing·_escalation).

### 🔴 결함 (1)

**"무조건 reviewer" 위험 깃발 세트가 4개 문서에서 서로 모순 — SSOT 위배**
- SSOT `grade-and-risk.md:80-81` = backend-contract·shared-contract "reviewer 무조건", ui-visual은 버킷(b) 육안.
- `review-tiering.md:32` = {trust-boundary, irreversible, ui-visual} — **계약 깃발 2종 누락 + ui-visual 오포함**.
- `reviewer.md:12` = {trust-boundary, backend-contract, irreversible}. `work-run/SKILL.md:63` = {shared-contract, trust-boundary, backend-contract}.
- → 읽는 문서에 따라 checker 발화가 달라짐. **grade-and-risk.md를 단일 진실로 3곳 동기화 권고.**

### 🟡 제안 (6)

1. SubAgent 수 "8" 표기 2곳(`loop-driver.md:106` · `harness-review.md:55`) — 실측 9로 정정. *(reviewer 🟡-3과 동일 건 — 통합 계수 시 1건)*
2. 루트 빌드/테스트 설정(`package.json`·`electron.vite.config.ts`·`tsconfig*`·`playwright/vitest config`) 소유 Worker 공백 — _routing.md에 담당 1줄 명시 권고.
3. plan-auditor 입력 계약(plan_files/milestone_context/prior_phases)이 자기 파일에 인라인 안 됨 — reviewer.md와 비대칭.
4. reviewer 입력 키 개수 불일치 — reviewer.md·coordinator.md 5키 vs review-tiering.md §4 4키(flags 행 부재).
5. `effort: xhigh` frontmatter 9파일 전부 no-op(실측 박제 근거) — 제거 또는 "no-op 문서용" 주석.
6. `main-process.md:16` IPC 경로 라벨 `ipc/` vs 실측 `00_ipc/`.

### 🟢 정합 (5)

- 재귀 차단 4곳(CLAUDE.md·coordinator·_routing·_escalation) 완전 일관 + escalate 경로 정의.
- 4등급 동원 규칙 4문서 정합.
- R-only 역할 tool-level 강제 정확(reviewer/plan-auditor/coordinator Edit·Write 부재), 모델 티어 9/9 일치.
- secretary·qa 프로세스-강제 경계 프로즈 명문화(플랫폼 한계이지 설계 결함 아님).
- 도메인 디렉토리 소유 무중복(shared 단방향 소유 배타 정합).

## 메인 본인 훅 직접 점검 (스킬 hook scope "본인+reviewer" 몫)

### 🟡 신규 (4)

12. **circuit-breaker 등급 추출 조용한 실패** — `circuit-breaker.sh:29` `grep '^(등급|grade):'`는 줄 시작 매치인데 현 pin 포맷은 등급이 `PHASE:` 줄 중간(`/ 등급: 복잡…`)에 있음 → 추출 실패 → 임계 기본 10. **원장이 증거**: TG1(복잡, 임계 15여야 함) 작업 중 "Edit 10회/5분 (임계 10)" 발화 다수. hook-glob-rename-trap과 동형(포맷 변경에 검출 패턴이 조용히 죽음).
13. **work-pin 헤더 중복 주입** — `current-pin.txt:1`에 `[자동 주입 —…]` 헤더가 들어가 있는데 `pin-injector.sh:24`가 같은 문구를 또 붙임 → 매 턴 헤더 2회 노출. 계약(파일=본문만) 위반 드리프트. 수정 = pin 파일 1행 제거(state 구역이라 secretary 가능).
14. **shell-write 봉인 우회 잔여 3형태(기지 2건 외 신규)** — ① 변수 간접참조+순수 리다이렉트(`p=.claude/…; echo x > $p`): sealed 후보는 잡히나 쓰기 연산 판정이 못 잡음 ② `bash -c`/`sh -c` 중첩 문자열 미분석(중첩 해석은 cmd/pwsh/node/deno만) — dangerous 모드도 동일 ③ 임베디드 런타임 화이트리스트에 perl(Git Bash 동봉) 부재. 성격 = 자기 규율 훅(적대자 방어 아님)이라 🟡.
15. **봉인 범위가 ADR-034 3층 구조를 못 따라감** — 기술 봉인(sealed+deny) 대상은 어댑터 층(CLAUDE.md·.claude/**·.codex/** 등)뿐, **의미 정본 `00.Documents/harness/CORE.md`·`core-manifest.json`·ADR 문서는 규범 게이트만**. CORE-11(사용자 단독 통제) 대상인데 계층 간 보호 비대칭 — 봉인 확장 또는 "의도적 제외" 박제 중 결정 필요. 인접: CORE-12 **읽기** 격리도 규범뿐(`Read(**)` allow가 .codex 포함 — 쓰기는 실측 차단 확인).

### 🟢 (2)

- 판정기 사망 시 fail-closed(BL1 P06 약속)가 supervisor-guard·dangerous-cmd-guard 양쪽 실재.
- shell-policy 경로 분류기의 재진입(`..`) 해소·홈/repo 앵커 3분류·기존 우회 봉합(GAP1 유지보수 창) 견고 — 신규 프로브에서도 미붕괴.

## 양식 비용 평가 (Step 4 — secretary 정량 실측)

- **work-pin**: 13줄 / **14,189바이트** (5커밋 내내 13줄 고정, 바이트는 1.5일 새 10,457→14,189 **+36%**). 목표 "30~40줄"은 현 포맷(줄당 평균 ≈1,091바이트 초장문 라인)을 못 재는 지표 — **🟡-16: pin 다이어트 기준을 줄 수 → 바이트/토큰 상한으로 교체 + 현 pin 감량 필요**(루프 상태 절이 완료 Phase 전 이력을 안고 있음 — 완료 마일스톤 상세는 -DONE.md로 이관이 원래 계약).
- **-DONE.md**: 20건 / 평균 80.3줄(41~165) — 마일스톤급 10 + 서브페이즈급 10. **🟡-17: 서브페이즈 단위 5단계 보고 발동이 절반** — "복잡 이상만" 의도 대비 잦을 소지(등급 판정 재확인 또는 의도 명문화).
- **5단계 보고**: 발동 추정 20회(-DONE.md와 1:1). reports HTML 18건 중 6~7건은 보고 짝이 아닌 산출물 — report_html 1:1 페어링 미완(2026-07-10 이전 유예 대상).
- **policies 신선도**: 6개월 초과 0건(최고령 21일).

## 결정 권유

- **🔴 즉시 봉합 (유지보수 창 1건)**: 깃발 세트 SSOT 동기화 — `grade-and-risk.md` 기준으로 `review-tiering.md:32`·`reviewer.md:12`·`work-run/SKILL.md:63` 3곳 통일.
- **🟡 유지보수 창 일괄(수 분짜리 문서 정정 묶음)**: /work:plan 콜론 잔존(1) · /harness 목록 결정(2) · "8→9" 2곳(3) · ADR-011→CORE-06/07 인용 교체(4) · INDEX shared-contract(5) · 루트 config 소유 1줄(7) · 입력계약 인라인/flags 통일(8·9) · effort no-op 처리(10) · ipc 라벨(11) · **circuit-breaker 등급 grep 패턴 수정(12)** · pin-injector 계약 주석 강화(13과 세트).
- **🟡 secretary 즉시 가능(봉인 밖 state 구역)**: pin 1행 헤더 제거(13) + pin 감량(16) — 커밋 마디에서.
- **🟡 별도 결정(설계 판단)**: 봉인 범위 CORE/ADR 확장 여부(15) · CORE-12 읽기 격리 기술 강제 여부(15 인접) · shell-write 잔여 3형태 봉합 수위(14 — C-full 백로그와 합쳐 훅 견고성 창 후보) · 서브페이즈 DONE 발동 정책(17).
- **🟢 그대로**: 조직 골격(재귀 차단·등급 동원·R/W 배타)·ADR 위생·policies 신선도·훅 9종 실발화.

> 하드 룰 준수: 본 점검은 읽기 전용 — 위 항목 어느 것도 수정하지 않음(프로브 임시 파일은 생성 즉시 제거). 하네스 정정은 전건 영호 단독 통제(CORE-11).
