---
summary: Claude Code CLI 대비 코어 작업 루프 동등(배포 게이트) 16 Phase 구현 완주 — SDK 신호 배선(훅 콕핏·턴 신뢰성·확장 사고·plan 승인)·IDE급 도구 렌더(Read/Grep/Glob·백그라운드 셸 라이브 테일)·턴 회계/고아 pump 봉합·라이브 모드 전환·SubAgent 스플릿 뷰까지 닫고, P15 라이브 버그 헌팅 루프가 R3(0)+R4(0) 연속 2라운드 신규 결함 0으로 4라운드 수렴 종결 + P16 턴 연속성·훅 빨간 배지(마감 후 편입 — 영호 육안 피드백). 최종 게이트 typecheck 0·Vitest 5174 passed/0 failed(378 files)·lint 0·라이브 배터리 9 spec 43 tests GREEN. 배포 게이트 "AgentDeck으로 AgentDeck 개발 가능"을 dogfood 통주 + 실환경 4라운드로 실증. 잔여 = 사람 게이트 3건(영호 육안 일괄·push·PR) 후 M5 배포.
phase: GAP1-마일스톤-마감
work-id: gap1-core-parity
status: done
grade: 대규모
gate_version: 1
report_html: 00.Documents/reports/GAP1-코어패리티-15페이즈-완주-보고서.html
owner: youngho
milestone: GAP1
completed_at: 2026-07-15
---

# GAP1 — 코어 패리티 마일스톤 완료 박제

**기간**: 2026-07-13 ~ 2026-07-15 · **브랜치**: `feature/gap1-core-parity` · **Phase**: 16개(P01~P16) 전부 done (P16 = 마감 후 편입 — 아래 addendum)

## TL;DR

BL1 종결 후 GAP1 감사(확정 격차 48건)가 지목한 "GUI가 일상 드라이버가 못 되는 결정적 이유"들을 **16 Phase로 닫았다** — 초기 9 Phase(영호 두껍게 결정)에서 P10~P12(턴 회계 계열 편입) → P13~P15(모드 전환·스플릿 뷰·라이브 헌팅 확장, 영호 2026-07-14) → **P16(턴 연속성·훅 빨간 배지 — 마감 후 편입, 영호 육안 피드백 2026-07-15)**로 확장된 최종 16 Phase. 마지막 결정론 게이트인 **P15 라이브 버그 헌팅 루프**(Playwright 실환경 라운드제)가 R3(신규 결함 0) + R4(신규 결함 0) **연속 2라운드 신규 결함 0으로 4라운드 수렴 종결**(서킷브레이커 5라운드 이내, 원장 = `15-rounds-log.md`), 그 뒤 마감 육안 게이트 중 영호 UX 피드백 2건을 P16으로 편입해 닫았다. 최종 게이트 전건 green(typecheck 0 · Vitest **5174 passed/0 failed**(378 files) · lint 0 · 라이브 배터리 **9 spec 43 tests GREEN**). 배포 게이트 문구 **"AgentDeck으로 AgentDeck 개발 가능"** 은 dogfood 인수 시나리오 통주(6c65170, 채증 58컷) + P15 실환경 4라운드로 실증됐다. 잔여는 사람 게이트 3건 — ① 영호 육안 일괄(P13 2컷+P14 10컷+P15 29컷+P16 8컷 = 49컷) ② push 1회(영호 승인) ③ PR 생성 GO — 그 뒤 M5 배포로 간다.

## 5단계 보고

- 🎯 **무엇을 만들었나** — Claude Code CLI로 하던 일상 코딩 드라이버 루프를 GUI 안에서 손실 없이 성립시켰다. **(1) SDK 신호 배선**: AgentEvent 정규화 taxonomy 계약(P03, ADR-035) 위에 턴 신뢰성 권위 신호(P04)·훅 콕핏(P05)·확장 사고 전문(P06)·plan 모드 승인 UI(P07)를 배선. **(2) IDE급 도구 렌더**: Read 결과 CodeMirror 재사용 등 quick win 3건(P01)·Grep/Glob 검색 카드 + 클릭 점프(P08)·감사 앵커였던 백그라운드 셸 라이브 테일(P09, ADR-036). **(3) 신뢰성 봉합**: toolKind MAP·TaskStop 재분류·모델 영속(P02)·turn-id 상관자 종결(P10)·send-token 턴 귀속 회계(P11)·RunManager 고아 pump 종결(P12). **(4) 확장분**: REPL 진행 중 세션 권한 모드 라이브 전환(P13)·SubAgent 스플릿 뷰 우측 분할 그리드(P14)·라이브 버그 헌팅 루프(P15 — 시드 봉합 6건 포함 실환경 결함 소탕). **(5) 마감 후 편입(P16)**: 턴 연속성 연출(사고 인디케이터↔답변 분리감 해소 — 순수 파생 `isThinkingContinuous` + gap 축소·아바타 통일)·훅 빨간 배지(`permission-denied`/informational 차단 턴 assistant 메시지에 `deriveHookTurnBadges` 파생 배지, 컴포저 위 HookTimeline과 병행)·표면 3종(단일챗·멀티패널·서브에이전트 연속성). 서브에이전트 훅 배지·토큰 카운트는 계약 데이터 부재로 명시 보류.
- 🤔 **왜 필요한가** — 결정론 게이트(typecheck·test·lint)가 전부 green이어도 "실제로 이 앱으로 개발할 수 있는가"는 별개다. GAP1 감사가 확정한 격차들(백그라운드 셸 tail 부재·plan 승인 불가·검색 결과 텍스트 덤프·모드 피커 no-op 등)은 각각이 CLI로 돌아가게 만드는 결정적 마찰이었고, 영호 결정(2026-07-13)에 따라 이 게이트를 통과해야만 M5 배포로 간다. P15는 그 위에 "실환경에서 제대로 돌아가는 것"이라는 마지막 검증층을 세운 것 — 단위 테스트가 못 잡는 타이밍·병행·장시간 결함(interrupt reject 누수·S6b 실SDK 회귀·게이지 캐시 미합산)을 실제로 잡아냈다.
- 🛠️ **어떻게 만들었나** — 계약 선행(P03이 신규 이벤트 9종을 `02.Source/shared`에 additive로 먼저 박고 P04~P09가 소비, CORE-04) + 파일 충돌 직렬 레인(claude-stream: P04→P10→P05→P06 / claudeAgentRun: P11→P12 / renderer: P13→P14→P15) + 전 Phase TDD RED 선행(CORE-05). P15는 라운드제 루프로 설계 — 라이브 배터리 통주 → 티켓화 → 결정론 재현 RED 박제(재현 없는 봉합 금지) → 도메인 Worker 봉합 → 게이트+커밋을 1회전으로, 종결 조건을 "연속 2라운드 신규 결함 0"이라는 기계 판정 가능한 수렴 조건으로 먼저 정의했다(대안 "버그가 없을 때까지"는 판정 불가라 기각). 검증은 plan-auditor GO + Codex 교차 리뷰 13건 전건 봉합의 이중 검증으로 시드.
- 🧪 **테스트 결과** — 최종 게이트(P16 마감 증분 반영 시점 실측): `npm run typecheck` 0 errors(node+web) / `npm run test` **378 files passed·5 skipped, 5174 passed·8 skipped·0 failed** / `npm run lint` 0 problems. **라이브 배터리 9 spec 43 tests 전건 GREEN**(11.0분, EXIT=0, flake 0 — dogfood-live 8·live2 2·p13 1·p14 5·visual 16·hunt r1~r4 11). 마일스톤 전체 **RED 선행 박제 23건**(각 Phase RED 커밋 — 예: P13 22 FAIL·P14 40 FAIL·P09 40 FAIL·P15 R1 12 FAIL·P16 21 FAIL `15b0794`). P15 수렴 증적 = R1 티켓 3 → R2 티켓 4 → **R3 0 → R4 0**(원장 `15-rounds-log.md`). dogfood 인수 시나리오 6단계 통주 + 육안 채증 58컷(6c65170). P16 반영 = RED `15b0794`(21 FAIL) → 구현 `c03fada`(13파일 GREEN, shared/preload/main diff 0) → 채증 `87f176d`(8컷).
- ➡️ **다음 스텝** — ① **영호 육안 일괄**(ui-visual 사람 게이트): P13 채증 2컷 + P14 채증 10컷 + P15 채증 29컷(`p15r1-*`~`p15r4-*`, ScreenShot/) + P16 채증 8컷(`p16-*`, ScreenShot/) = **49컷** ② **push 1회**(영호 승인 — 예약종료 전 승인 완료 확인, 멀티머신 공통 진실 갱신, 중간 push 2026-07-15 `02ec448`까지 완료) ③ **PR 생성 GO**(이때 원격 머지완료 브랜치 8건 삭제 확정도 여쭘) → 이후 **M5 배포**(electron-builder NSIS + electron-updater, asarUnpack LSP 함정 = ADR-009). 백로그 승계 3건(SDK 버전 갱신 시 content 모드 toolUseResult 재채증 체크리스트 · P14 대기열 수동 승격 보류 · **P16 서브에이전트 훅 배지·토큰 카운트 — SubAgent 계약 additive 확장 후보**)은 pin 잔여 백로그로 추적.

## Phase 결과 요약 (P01~P16)

| Phase | 제목 | 핵심 커밋 |
|---|---|---|
| P01 | quick win 렌더 재사용 3건 | `8efa3d6` (육안 통과) |
| P02 | toolKind MAP·TaskStop 재분류·모델 영속 | `b6635b4`·`0bfeaa2` |
| P03 | AgentEvent 정규화 taxonomy 계약 (ADR-035) | `bfbff5e` |
| P04 | 턴 신뢰성 신호 배선 | `d9eed92` |
| P05 | 훅 콕핏 (생명주기·차단사유·auto-deny) | `de01307` |
| P06 | 확장 사고 전문 표시 | `7485447` |
| P07 | Plan 모드 승인 UI | `2c77073` (+RED `9dfd751`) |
| P08 | Grep/Glob 결과 IDE 렌더 | `0f19e8c` (+RED `b06ae08`) |
| P09 | 백그라운드 셸 라이브 테일 (ADR-036) | `e1d1676` (+RED `f77a7b6`) |
| dogfood | 인수 시나리오 통주 + 결함 B 봉합 | `3c1d104`·`6c65170` (채증 58컷) |
| P10 | turn-id 상관자 — misfire 부재 실측·봉쇄 회귀 잠금 (turnId 철회, 정정 기록) | 정정 기록 (부재 중 결정 ③′) |
| P11 | send-token 턴 귀속 회계 | `60e21cf` |
| P12 | RunManager 고아 pump 종결 | `1d14c7f` |
| P13 | REPL 진행 중 세션 권한 모드 전환 실지원 | `8f51c04`~`5a6826d` 7커밋 (라이브 1pass) |
| P14 | SubAgent 스플릿 뷰 (우측 분할 그리드) | `da34fe6` (+RED `e3030cf`) |
| P15 | 라이브 버그 헌팅 루프 (4라운드 수렴) | `1e94f2d`·`09d256d`·`f69dd92`·`8992b89`·`858aa2c`·`9a6c571`·`9fd33cd`·`524a894`·`d2464c0` |
| P16 | 턴 연속성 + 훅 빨간 배지 (표면 3종 · **마감 후 편입**) | `15b0794` RED · `c03fada` 구현(13파일 GREEN) · `87f176d` 채증 8컷 |

## 리스크·보류 (정직 기록)

- **P15 명시 보류 4건 (P09 reviewer 🟡 — 사유와 함께 백로그 귀속)**: ① 추출 경로 컨테인먼트(4중 방어 실측 + 정품 `.output`이 워크스페이스 밖 SDK 임시 디렉토리라 강제 시 정상 tail 전멸) ② TERMINAL 집합 shared 승격(위생 리팩토링 — 실사용 결함 아님) ③ outputTruncated 이중 의미(R1·R2 연속 미관측 — 보류 확정) ④ notification 유실 탈출구 문서화(P15 문서 수정 금지 제약 — M5 전 문서 스윕 귀속).
- **P16 명시 보류 1건 (서브에이전트 훅 배지·토큰 카운트)**: SubAgent 계약(`agent-events.ts:287-300`)에 훅 알림·`estimatedTokens` 데이터 부재 — renderer 단독 불가(어댑터·main 배선 필요)라 이번 범위 밖. 서브에이전트는 연속성 연출만 적용, 훅 배지는 shared 계약 additive 확장 후보 백로그로 박제(조용한 드롭 아님). P16 reviewer 위반 0(🟡 2 비차단 — p05 golden 소유권 qa 복원 완료 / HookBadge hover 사유는 선택 가산점 미충족 후속 여지).
- **백로그 승계 3건**: SDK 버전 갱신 시 content 모드 toolUseResult 형상 재채증 체크리스트(agent-backend) · P14 대기열 수동 승격 보류 유지(R4 실측 — 실사용 필요성 낮음, 6+ 병행 관찰 시 재평가) · P16 서브에이전트 훅 배지·토큰 카운트(SubAgent 계약 additive 확장 후보).
- **P08 reviewer 🟡**: P15에서 전건 처리 완료 — (a) 다중 블록 귀속 골든 GREEN 안전망 편입(`1e94f2d`) (b) Grep -n 오파싱 봉합(S6b → 실SDK 회귀 재봉합 `9a6c571`) (c) React key 비결함 판정(유일성 4중 근거). 클릭→라인 스크롤 soft 미구현도 R2에서 봉합.
- **P14 reviewer 🟡 잔여 3건 + 접근성 후보**: 하네스 contextIsolation 통일 · `--split-w` 전역 변수 정리 · `.sag-grid` flex 이탈 사유 기재 + SmoothMarkdown prefers-reduced-motion 무시(접근성 후보) — 전부 비차단 위생·후속 몫.
- **잔여 사람 게이트 3건 (구현 완주와 별도)**: ① 영호 육안 일괄(P13 2컷+P14 10컷+P15 29컷+P16 8컷 = 49컷) ② push 1회(영호 승인) ③ PR 생성 GO(+원격 머지완료 브랜치 8건 삭제 여쭘).

## AC 검증 결과

마일스톤 완료 조건을 실제로 실행한 명령과 결과(P16 마감 증분 반영 시점 실측 — Vitest/typecheck/lint는 P16 포함, 라이브 배터리는 P15 R4 결과가 최신[P16은 시각검증 하네스 채증이라 라이브 배터리 재실행 없음], 원장 = `15-rounds-log.md`):

```text
$ npm run typecheck
  0 errors (node+web)

$ npm run test        # Vitest — P16 마감 증분 반영
  Test Files  378 passed | 5 skipped (383)
        Tests  5174 passed | 8 skipped (5182)   0 failed

$ npm run lint
  0 problems

$ npx playwright test  # 라이브 배터리 (P15 R4 — P16 무영향)
  9 spec 43 tests 전건 GREEN (11.0분, EXIT=0, flake 0)
```

- [x] 16 Phase 전부 `status: done` — P01~P16 (각 Phase typecheck 0 · Vitest green · lint 0 + TDD RED 선행 23건)
- [x] 코어 루프 3축 복구 — SDK 신호 배선(P03~P07) · IDE급 도구 렌더(P01·P08·P09) · 신형 도구 인지·모델 영속(P02)
- [x] 감사 앵커 T-01(백그라운드 셸 라이브 테일) GUI 안에서 성립 — P09 + P15 라이브 확증
- [x] dogfood 인수 시나리오 통주(⑦ P13 모드 전환·⑧ P14 스플릿 뷰 확장분 포함) — `6c65170` 채증 58컷 + P15 배터리 상주
- [x] P15 수렴 종결 — R3(0)+R4(0) 연속 2라운드 신규 결함 0, 시드 전 항목 처리 상태 명시(봉합 or 명시 보류)
- [x] P16 마감 후 편입 완주 — 영호 육안 피드백 2건(연속성·훅 배지) 표면 3종 반영, RED→GREEN→채증 3커밋, reviewer 위반 0, shared/preload/main diff 0, 서브 훅 배지 명시 보류
- [ ] 영호 육안 일괄 (사람 게이트 — P13 2컷+P14 10컷+P15 29컷+P16 8컷 = 49컷 대기)
- [ ] push·PR (사람 게이트 — 영호 승인 대기)

## Addendum — P16 마감 후 편입 (2026-07-15)

> **경위**: 위 P01~P15 마감 플립(`8d540ce`) 이후, 영호가 마감 육안 게이트를 돌리던 중 UX 피드백 2건을 냈다 — ① 사고 인디케이터(실시간 토큰 카운트)와 이후 답변 버블이 분리돼 보여 가시성이 떨어진다 ② 훅 차단 알림이 컴포저 위 HookTimeline에만 나오는데 assistant 답변 메시지에도 빨간 배지로 병행되면 좋겠다. P13~P15가 이미 "마감 육안 중 영호 피드백을 같은 브랜치 후속 마디로 편입"한 관례를 따라, 이를 P16으로 편입했다. **성격**: Track 1 CLI 패리티가 아니라 영호의 GAP1 게이트 확장("AgentDeck으로 AgentDeck 개발 가능한 성능·안정성·UX" — 2026-07-14)에 근거한 UX 개선(Track 2, plan-auditor 조건부 GO 2026-07-15).

- **구현 요지**: (1) 사고↔답변 연속성 — 순수 파생 `isThinkingContinuous(thread, index, {ignoreToolgroups?})` + gap 축소·프레임 완화·아바타 통일(IconSpark→IconClaude, 원본 AgentCodeGUI 충실도 회복). (2) 훅 빨간 배지 — 순수 파생 `deriveHookTurnBadges(thread)`(차단 술어 = permission-denied[hook] / informational[warning·preventContinuation] → 턴 경계 배타 구간 내 최근접 후속 assistant, 부재 시 선행) + `HookBadge` 공용 조각(`NoticeItem` tone='error' `--red/--red-soft` 토큰 재사용, 신규 HEX 0) + HookTimeline 병행. (3) 표면 3종 — 단일챗 인라인 + `MessageBubble` prop(멀티패널·서브응답 자동 전파) + 서브에이전트 연속성. `HookRun.runId`는 renderer 내부 타입 additive 배선(기존 엔벨로프 소스).
- **커밋 3개**: `15b0794`(RED 21 FAIL) → `c03fada`(구현 13파일 GREEN, shared/preload/main diff 0) → `87f176d`(채증 하네스 + 8컷).
- **게이트**: typecheck 0 · Vitest **5174 passed / 0 failed (378 files)** · lint 0. reviewer 위반 0(🟡 2 비차단).
- **명시 보류**: 서브에이전트 훅 배지·토큰 카운트 — SubAgent 계약(`agent-events.ts:287-300`)에 데이터 부재, shared additive 확장 후보 백로그(조용한 드롭 아님).
- **채증 8컷**: `p16-continuity-single-{dark,light}` · `p16-hookbadge-single-{dark,light}` · `p16-hookbadge-panel-{dark,light}` · `p16-subagent-continuity-{dark,light}`.
- **추적 문서 화해**: 이 편입으로 생긴 plan-auditor 🔴 조건(추적 3문서의 "15/15 done" 명제를 16 Phase 체제로 정정)을 본 마감 증분 마디가 해소했다 — `_milestone-plan.md`·본 문서·`FEATURE_MAP.md` + HTML 보고서 부록.

## 학습 일지 후보 키워드

- 결정론 게이트 green ≠ 실환경 작동 — 라이브 헌팅 루프가 배포 전 마지막 게이트인 이유
- 기계 판정 가능한 수렴 조건 설계 — "연속 2라운드 신규 결함 0" (판정 불가한 "버그 없을 때까지" 기각)
- 재현 박제 → 봉합의 순서 — RED→GREEN 전환이 "고쳤다"의 유일한 증거
- 계약 선행(additive) + 파일 충돌 직렬 레인 — 15 Phase 병렬·직렬 배치의 근거
- 명시 보류 = 사유 + 백로그 귀속 — 조용한 드롭 금지
- 배포 게이트를 문구("AgentDeck으로 AgentDeck 개발 가능")에서 실증(dogfood 통주 + 4라운드)으로

사람 게이트: 영호 육안 일괄 → push 승인 → PR GO(2026-07-15 대기) — merge는 별도 게이트.
