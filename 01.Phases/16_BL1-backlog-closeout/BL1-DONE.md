---
summary: HR1 이후 work-pin에 누적된 잔여 백로그 6건을 7 Phase(그룹 A 하네스 2 + 그룹 B 앱 5)로 일괄 청소하고, 마감일 육안 세션에서 goal 배너 결함을 추적해 표시 수명을 단일 상태(goalRun)로 일원화 — 게이트 3종 green·영호 육안 8컷 통과. M5 배포 착수 전 부채 0. 배포 순서 결정 근거로 GAP1 기능격차 감사(확정 48건·마일스톤 3축·quick win 5)를 병행 산출.
phase: BL1-마일스톤-마감
work-id: bl1-backlog-closeout
status: done
grade: 대규모
gate_version: 1
report_html: 00.Documents/reports/milestones/BL1-백로그-마감-종합.html
owner: youngho
milestone: BL1
completed_at: 2026-07-13
---

# BL1 — 백로그 마감 마일스톤 완료 박제

**기간**: 2026-07-13 · **브랜치**: `feature/bl1-backlog-closeout` · **Phase**: 7개(P01~P07) 전부 done + 마감일 후속 2건

## TL;DR

HR1(하네스 전면 리뉴얼) 종결 후 work-pin에 쌓여 있던 잔여 백로그 6건을 **7개 Phase로 나눠 일괄 청소**했다 — 그룹 A(하네스, 영호 유지보수 창) 2건 + 그룹 B(앱 코드, Worker 위임) 5건. 목표는 M5 배포 착수 전 부채를 0으로 만드는 것. 여기에 마감일 세션에서 goal 배너가 단발 실행에서 안 뜨던 결함을 추적해 **goal 표시 수명을 단일 상태(`goalRun`)로 일원화**하는 후속 봉합(커밋 ①)과 상태×테마 8컷 시각검증 하네스(커밋 ②)를 더했다. 배포 순서 결정 근거로 Claude Code를 벤치마크 삼은 **GAP1 기능격차 감사**(확정 48건·마일스톤 3축·quick win 5)를 병행 산출했다. 마감 시점 게이트 3종 green(typecheck 0·Vitest 4715 pass·lint 0)·영호 육안 8컷 판정 OK. 남은 비가역 작업은 PR 하나로, 영호 게이트로 보존한다.

## 5단계 보고

- 🎯 **무엇을 만들었나** — HR1 이후 잔여 백로그를 7 Phase로 청소했다. **그룹 B(앱)**: P01 ultracode offKeys prune(대화/패널 삭제 시 OFF 키 동반 제거 — 누수 0), P02 idle-close 유예 타이머 단순화(step-splitting → 단일 `setTimeout` + GraceProbe 비중첩 barrier 테스트, 동작 불변), P03 goal 배너 stale-watchdog(ended 신호 유실 경계에서 무한 고착 방지 — renderer 수신측 폴백, 자동 강제 해제 X), P04 복원 페이지 데드락 진단(원인 = 제품 아닌 복원 창 OS 포커스 미획득 rAF 정지, 제품 무혐의 기계 확정), P05 정직 클릭 회복(P04로 재정의 — 테스트 하네스 전용 BrowserWindow show/focus 헬퍼, 제품 diff 0). **그룹 A(하네스, 유지보수 창)**: P06 훅 견고성 3건(`emit_system_message || true`·shell-policy 크래시 fail-closed·`.sh` exit code 회귀 테스트), P07 CORE-03 검증 재정합(stale "기계 차단 없음" note 교정 + 기존 Read deny 실효 프로브 + Bash 경로 부분 보장 정직 선언). 부수로 goal 표시 수명 일원화(후속)와 GAP1 감사 리포트를 냈다.
- 🤔 **왜 필요한가** — 마일스톤을 여러 개 지나오며 "지금 당장 안 막지만 언젠가 물릴" 잔여 리스크가 work-pin에 누적됐다(타이머 정리 부채·배너 고착·offKeys 누수·훅 견고성 minor·CORE-03 note stale). 각각은 작아도 M5 배포처럼 큰 다음 단계 전에 청소하지 않으면 배포 이후 디버깅 비용으로 되돌아온다(영호 결정 2026-07-13: "그룹 A+B 처리 후 M5 배포로 간다"). 마감일 goal 배너 결함은 더 근본적이었다 — 단발 펌프 goal에서 배너가 아예 안 떴고, 원인은 가시성 게이트를 `autonomyActive`(지속세션 유예 흡수 경로 전용 신호)에 걸어 둔 것이었다. 배너의 "언제 켜지고 꺼지나"가 여러 소비처에 흩어져 한 곳만 고쳐선 안 됐고, 표시 수명을 단일 상태로 일원화하는 구조 봉합이 필요했다.
- 🛠️ **어떻게 만들었나** — 큰 목표를 7 Phase로 분해해 도메인·의존성에 맞춰 쌓았다. 그룹 B는 도메인 Worker(renderer·agent-backend·qa) 위임, 그룹 A는 영호 단독 통제라 유지보수 창(영호 본인이 settings.json deny 완화 + supervisor-guard 봉인 해제 → 수정 → 재봉인·`/hooks` 재신뢰 → 봉인 복구 프로브)에서 진행(CORE-11). 계획은 plan-auditor(🔴2·🟡3) + Codex Sol 2차 검증(P2 10·P3 4) 이중 검증을 전건 반영해 시드. 핵심 설계 선택: (a) P03 watchdog은 스토어 수준 활동 시각 + 신호 수신 시점 기준 `setTimeout` 재설정(setInterval 상시 tick 금지 — P04와 같은 부류의 문제 회피), 자동 강제 해제 대신 stale 표시 + 수동 해제(오탐-미탐 축의 보수적 선택). (b) main heartbeat 신설이 아니라 renderer 수신측 폴백 채택 — 계약 불변·가역적(근본 원인은 auto-revive 트랙 몫). (c) goal 일원화는 `AppState.goalRun {detail·turns·startedAt}`를 begin에 낙관 생성, ended/error/abort 3종에서만 소멸(턴 경계 생존), 배너 가시성·내용·gloss 3소비처를 단일 상태로 묶고 `autonomyActive` 가시성 게이트 제거.
- 🧪 **테스트 결과** — 마감 시점 게이트 3종 재실행 전부 green: `npm run typecheck` 0 errors / `npm run test`(Vitest) 4715 pass·8 skip(322 파일) / `npm run lint` 0 problems. goal 표시 일원화 통합에서 reviewer가 🔴 1건(`runtime.ts` 경로2 write-through에서 goalRun 누락 → 축출 후 배너 소실)을 잡아 봉합 + 경로2 직접 주입 회귀 테스트 추가. **영호 육안 게이트(human-visual)**: goal 배너 상태(goal/stale/stopped)×테마(light/dark) 8컷을 컴포넌트 하네스로 렌더해 영호가 직접 확인 — 2026-07-13 판정 OK. 8컷은 `BL1P03SHOTS=1` 옵트인 e2e로 재현 고정(커밋 `0db30ad`). **유지보수 창 봉인 복구 프로브(P06·P07)**: 재봉인 후 하네스 Edit 시도 → supervisor-guard 차단 확인(2/2). P07 전제 반전 실측 — settings.json Read deny가 최초 커밋(fec171a)부터 존재, core-manifest.json:19 stale note 교정.
- ➡️ **다음 스텝** — PR 생성 = 영호 게이트(비가역·결정 기록 의무). 그 다음은 영호 결정(2026-07-13)대로 **GAP1 코어 패리티 마일스톤 → M5 배포** 순서, 배포 게이트 = "AgentDeck 안에서 AgentDeck 개발이 가능"할 것. `/work-plan 'GAP1 코어 패리티'`로 마일스톤 분해(배포 게이트 정의 포함). 신규 백로그 5건 이관 추적.

## Phase 결과 요약 (P01~P07)

| Phase | 그룹 | 제목 | 결과 | 커밋 |
|---|---|---|---|---|
| P01 | B 앱 | ultracodeToggle offKeys prune | 대화(단일챗)·패널(멀티세션) 삭제 시 해당 스코프 OFF 키 동반 prune — 잔존 누수 0(LR4-DONE 잔여 5번) | `0363aec` |
| P02 | B 앱 | idle-close 유예 타이머 정리 | step-splitting → 단일 `setTimeout` 리팩토링 + GraceProbe 비중첩 barrier 테스트. 동작 불변(유예 3000ms·상한 100·autonomy_status) | `25b49af` / 플립 `a6c399c` |
| P03 | B 앱 | goal 배너 stale-watchdog | ended 신호 유실 + error/abort 미발생 경계의 배너 무한 고착 방지 — renderer 수신측 stale-watchdog 1차 폴백(스토어 수준 활동 시각·수동 해제) | `d8e29c7` |
| P04 | B 앱 | 복원 페이지 데드락 진단 | Playwright stable 타임아웃 원인 = 제품 갱신 루프가 아니라 복원 창 OS 포커스 미획득(Chromium rAF 정지). 제품 무혐의·idle CPU 0 실측 | `62ae2cb` |
| P05 | B 앱 | 정직 클릭 회복 (P04 재정의) | 테스트 하네스 전용 수정 — relaunch 후 BrowserWindow show/focus 공통 헬퍼로 force 클릭 우회를 정직 클릭으로 복원. 제품 diff 0 | `ee6ef62` / 플립 `63bd8d7` |
| P06 | A 하네스 | [유지보수 창] 훅 견고성 3건 | `emit_system_message || true` 누락 봉합·shell-policy.mjs 크래시 fail-open→fail-closed·`.sh` 글루 exit code 회귀 테스트 신설 | `e0a064b` / CHANGELOG `8309cf9` |
| P07 | A 하네스 | [유지보수 창] CORE-03 검증 재정합 | 전제 반전(plan-auditor 실측) — settings.json Read deny 기존재. core-manifest.json:19 stale "기계 차단 없음" note 교정 + 실효 프로브 + Bash 경로 부분 보장 선언 | `c8844ff` / P06·P07 done `5ef4717` |

## 마감일 육안 세션 후속 2건 (2026-07-13)

1. **P03 goal 배너 stale-watchdog** (`d8e29c7`) — 마감일 human-visual 트랙으로 완료. ended 신호 유실 경계 폴백. 이 배너 작업이 육안 세션의 출발점.
2. **goal 표시 수명 일원화 = 커밋 ①** (`e782de6`) — 육안 중 단발 펌프 goal에서 배너 미표시 결함 발견 → 추적. `AppState.goalRun {detail·turns·startedAt}` 신설(begin 낙관 생성, ended/error/abort 3종에서만 소멸 — 턴 경계 생존), 배너 가시성·내용(텍스트/턴수)·gloss 3소비처를 단일 상태로 일원화, `autonomyActive` 가시성 게이트 제거. reviewer 🔴 1건(runtime.ts 경로2 write-through goalRun 누락) 봉합 + 경로2 직접 주입 회귀 테스트. P03 stale-watchdog 의미론 보존(타이머 게이트만 goalRun으로 교체). 시각검증 하네스 = 커밋 ② (`0db30ad`, 상태×테마 8컷 `BL1P03SHOTS=1` 옵트인).

## GAP1 기능격차 감사 요약 (2026-07-13, 커밋 `dec4d9f`)

Claude Code 자체를 벤치마크 삼아 Ultracode 17에이전트 4단계 워크플로로 외부 후보 91건을 적대 검증 → **확정 격차 48건**(탈락 10). 확정 48건 전부 `sdkExposed=sdk`(구현 경로 원천 존재). **마일스톤 3축으로 합성**:

- **M-A (우선순위 1, 대규모)**: SDK 이벤트 스트림 배선 — `claude-stream.ts:554-555` '그 외' 분기가 드롭하는 SDK system·stream 메시지 15+종을 공통 AgentEvent로 정규화(훅 콕핏·턴 신뢰성·라이브 진행). 일상 임팩트×비용 비율 최고.
- **M-B (우선순위 2, 복잡~대규모)**: IDE다운 도구 결과 렌더링 + 백그라운드 셸 라이브 테일. renderer 중심(기존 CodeViewer/AgentPanel 재사용).
- **M-C (우선순위 3, 대규모+·재분할 유력)**: 제어·안전 표면 — 설정·권한·MCP 관리 + 세션 되감기/격리. read-only 아키텍처 정면 변경 = trust-boundary+ADR 다수.

**quick win 5**(각 반나절 안팎, 마일스톤 전 선반영 가능): ① Read 결과 CodeViewer 재사용 ② 멀티워크스페이스 todos 마운트 ③ 모델 선택 대화별 영속 ④ toolKind MAP 확장 + KillShell MUTATING 오분류 교정 ⑤ MCP verb 사람읽기 라벨.

상세 리포트: `00.Documents/reports/milestones/GAP1-Claude-Code-기능격차-감사.html`.

## 신규 백로그 이관 5건

GAP1 감사가 기존 백로그로 귀속시킨 항목 + 마감일 파생:

1. **백그라운드 태스크 수명 정책** (goal 조기 ended 오판 포함) — TaskStop/Monitor 등 태스크 제어 + 백그라운드 셸 tail 조율.
2. **SDK 트랜스크립트 동반 삭제** — 세션 트랜스크립트 접근/export.
3. **goal 정지 어포던스** — 진행 중 goal의 사용자 정지 UI.
4. **인터럽트 잘림 마커** — interrupt 시 잘린 지점 표시.
5. **순서 재결정** — 향후 우선순위 재조정 트랙.

## 영호 결정 기록 (2026-07-13)

- **배포 순서**: GAP1 코어 패리티 마일스톤을 **먼저**, M5 배포를 그 **다음**. (부채 0 → 앱 자체 개발 가능 → 배포)
- **배포 게이트**: "AgentDeck 안에서 AgentDeck 개발이 가능"할 것 — 이 상태가 되기 전엔 M5 배포 착수하지 않음.
- **BL1 처리 방침**(마일스톤 시드 시): "그룹 A+B 처리 후 M5 배포로 간다" → GAP1 감사로 "GAP1 코어 패리티 → M5"로 구체화.

## AC 검증 결과

마일스톤 완료 조건을 실제로 실행한 명령과 결과(마감 시점 secretary 게이트 재실행 + 영호 육안 게이트):

```text
$ npm run typecheck
  0 errors

$ npm run test        # Vitest
  Test Files  322 passed | 5 skipped (327)
        Tests  4715 passed | 8 skipped (4723)   Duration 34.72s

$ npm run lint
  0 problems
```

**영호 육안 게이트(human-visual)**: goal 배너 상태(goal/stale/stopped)×테마(light/dark) 8컷을 컴포넌트 하네스로 렌더 → 영호 직접 확인 판정 OK(2026-07-13). 8컷은 `BL1P03SHOTS=1` 옵트인 e2e로 재현 고정(커밋 `0db30ad`).

**reviewer(goal 일원화 통합)**: 🔴 1건 — `runtime.ts` 경로2 write-through에서 goalRun 누락(축출 후 배너 소실) → 봉합 + 경로2 직접 주입 회귀 테스트 추가. 봉합 후 게이트 green.

**유지보수 창 봉인 복구 프로브(P06·P07)**: 재봉인(digest 갱신·`/hooks` 재신뢰) 후 하네스 Edit 시도 → supervisor-guard 차단 확인(2/2). P07 전제 반전 실측 — settings.json Read deny(`.env*`·`secrets/**`)가 최초 커밋(fec171a)부터 존재, core-manifest.json:19 stale note 교정.

## AC ↔ 마일스톤 완료 조건 대조

- [x] 그룹 B(앱) 5건 완료 — offKeys prune·타이머 정리·배너 watchdog·데드락 진단·정직 클릭 회복
- [x] 그룹 A(하네스) 2건 완료 — 훅 견고성 3건·CORE-03 재정합 (유지보수 창 + 봉인 복구 프로브 2/2)
- [x] goal 표시 수명 일원화(후속) — 단일 상태 `goalRun`, reviewer 🔴 봉합 + 회귀 테스트
- [x] 게이트 3종 green — typecheck 0 · Vitest 4715 pass · lint 0
- [x] 영호 육안 게이트 — goal 배너 상태×테마 8컷 판정 OK (2026-07-13)
- [x] BL1-DONE.md + HTML 종합 보고 + CHANGELOG + INDEX 플립
- [x] GAP1 감사 리포트 병행 산출 (배포 순서 결정 근거)
- [ ] PR (영호 게이트 — 결정 기록 대기)

## 학습 일지 후보 키워드

- 백로그 청소의 가치 — 큰 다음 단계 전 부채 0
- liveness/watchdog 오탐-미탐 trade-off · 폴백 vs 근본 해결(수신측 vs 발신측)
- 진단이 범위를 재정의 — 오진을 기계 증거로 뒤집기(P04→P05)
- 상태 일원화 — 흩어진 소비처(가시성·내용·gloss)를 단일 상태로 묶어 수명 정의
- 유지보수 창 + 봉인 복구 프로브 (CORE-11)
- 벤치마크 감사로 배포 순서 결정 — 확정 격차 48건·마일스톤 3축

PR 게이트: 영호 GO 대기(2026-07-13) → PR 생성은 Supervisor가 별도 진행 — merge는 별도 게이트.
