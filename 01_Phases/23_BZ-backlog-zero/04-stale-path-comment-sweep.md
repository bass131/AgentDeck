---
owner: 유영호
milestone: BZ
phase: 04
title: 옛 경로 주석 보수 스윕 (백로그 23·24) — A구간(밤·비깃발) / B구간(주간·깃발 경로)
status: done
grade: 대규모
loop_track: human-gate
domain: cross
estimated: 2~3h (A) + 1h (B)
summary: src/ 옛 포인터 + 구 stem 교차참조를 보수 기준으로 치환. 실측 5도메인/61파일 = 대규모. trust-boundary 경로(B구간)는 내일 영호 재석 + reviewer 동반 — 밤에는 A구간만.
---

# Phase 04: 옛 경로 주석 보수 스윕 (A/B 분할)

> **등급**: 대규모 (plan-auditor 실측: main-process 20 · qa 24 · renderer 8 · shared-ipc 8 · preload 1 = **5도메인 / 61파일 / 130건** — 정량 우선, "주석뿐"은 등급 사유가 못 된다 [grade-and-risk §6])
> **loop_track**: A구간 = auto-gate(밤) / **B구간 = human-gate(내일 주간 — trust-boundary는 work-judge (c) 버킷)**

## 🎯 목표

에이전트가 읽는 주석·지시문에서 죽은 경로(`src/main/…`, 구 stem)가 보수 기준 치환분만큼 사라지고, 애매 건은 전수 목록으로 아침 검토를 기다린다. 전부 주석 — 런타임 영향 0을 게이트 등호로 증명한다.

## ⏪ 사전 조건

- [x] Phase 03 완료 — **P03이 같은 파일(`engineVersions.ts`)의 `:62` 주석·`:66-72` 구현을 고치므로, 순서를 지켜야 이 Phase의 줄 좌표 재실측이 불필요하다** (🟡g 정정 — `:22`는 이 Phase 단독 대상)
- [x] 판별 기준 확정 — 보수 치환 (계획서 ⚖️ 3)

## 📝 작업 내용

**판별 기준 (⚖️ 3 — 재확인하지 않는다)**: 치환 = 확장자·슬래시 붙은 **명시 경로**가 현존 경로의 옛 표기일 때만. 불변 = 예시 문자열·개념 호칭·채증 인용. 애매 = 목록행.

**공통 — 목록 확정 (메인, 밤)**

- [x] 전수 grep 재실측으로 치환/불변/애매 판정 목록 작성 (백로그 23 `src/…` 130건/61파일 + 백로그 24 구 stem 교차참조 대표 좌표 전수 재실측). **목록은 이 문서 하단에 박제** + 각 건에 **A/B 구간 태그**
- [x] B구간 분류 기준: `02_Source/preload/**` · `02_Source/main/00_ipc/**` (**trust-boundary** — 실측: `preload/index.ts:7,587,979` · `main/00_ipc/engineCheckUpdate.ts:14`) + `02_Source/shared/**` · `02_Source/main/01_agents/**` (shared-contract·backend-contract — reviewer 무조건이라 사람 재석 시간대가 싸다). **나머지 전부 A구간**

**A구간 — 밤 실행 (비깃발: main-process 일반 · renderer · qa ≈ 46파일)** ✅ **완료 (2026-07-27 밤)**

- [x] 실행자 = **도메인 Worker 재배정**: `main-process` 13건(커밋 `743b612`) / `renderer` 6건(`5fd973b`) / `qa` 19건(`8fb8a8d`) — **38/38 전건 반영, 좌표 어긋남 0**
- [x] 메인 검산 — A구간 치환 건수 = 반영 건수 (이름 단위) + `engineVersions.ts:22` 한 줄 신·구 공존 해소 확인 → **잔여 grep 대조 정확 일치**: `02_Source` 잔여 81건 = B구간 예정 28 + 외부 원본 17 + 샘플 리터럴 33 + 예시 1 + 애매 2 · `99_Others/tests` 잔여 10건 = 리터럴 8 + 외부 원본 2. **누락 0 · 오폭 0.** 게이트 등호 확인: `Tests 5352 passed | 10 skipped` (P03 앵커와 등호 — 주석 전용 증명) + typecheck/lint 0/0 (Worker 3종 각각 + qa 전량 1회)

**B구간 — 내일 주간 실행 (깃발 경로 ≈ 15파일, 영호 재석)**

- [x] 아침 GO 후: 같은 목록의 B구간 건 치환 — `shared-ipc`(shared/** + preload/**) / `agent-backend`(01_agents/**) / `main-process`(00_ipc) Worker
- [x] **reviewer 무조건 호출** (trust-boundary + shared·backend-contract — 이번 세션은 `model: "fable"` override)

## ✅ 완료 조건

- [x] A구간(밤): 치환 목록 A건수 = 반영 건수 · `npx vitest run`+typecheck+lint — **P03 박제 수치와 정확히 등호** (주석 전용 증명: 증가도 red)
- [x] B구간(주간): 잔여 전건 반영 + reviewer 통과 + 게이트 등호 유지
- [x] 애매 건 목록 완성 (0건이어도 명기) · 잔여 `src/` 패턴 grep = 「불변 판정」 목록과 일치

## 📚 학습 포인트

- **위치가 등급의 일부다** — 같은 "주석 한 줄"도 preload에 있으면 trust-boundary 깃발이다. 내용이 아니라 좌표가 게이트를 정한다(grade-and-risk §6)
- 주석 치환의 완료 증명은 게이트 **등호**(변화 0)라는 역설 — 보통은 green이 목표지만 여기선 "아무것도 안 변했음"이 목표다

## ⚠️ 함정

- 예시 문자열 오폭(`diff.ts:164` 류) — 「불변」 선판정
- 한 줄 신·구 공존(`engineVersions.ts:22`) — 줄 단위 결과 확인
- 테스트 파일의 문자열 리터럴(코드가 소비하는 값)은 전부 「애매」로
- B구간을 밤에 당기지 않는다 — trust-boundary는 (c) 버킷, 밤 계약 밖 (🔴2)

## ✅ 완료 기록 (2026-07-28)

A구간 38건 = `743b612`(main 13) · `5fd973b`(renderer 6) · `8fb8a8d`(qa 19), B구간 28건 = `58bfb8a`(00_ipc 1) · `c1268444`(shared·preload 27 — reviewer(fable) 🔴0·🟡0, 28건 전량 주석 내부 정독). 게이트 **등호** 유지(5352 passed | 10 skipped 불변 — 주석 전용 증명). 애매 잔여 3부류 = BACKLOG.md 30 등재(추천 = 전부 불변). 잔여 grep 대조: 외부 원본 17 + 샘플 리터럴 33 + 예시 1 + 애매(30번) = 누락 0.

## 담당 SubAgent

메인(목록·검산) + A구간: `main-process`·`renderer`·`qa` / B구간: `shared-ipc`·`agent-backend`·`main-process` + reviewer(fable override).

---

## 📌 확정 목록 박제 (메인 전수 재실측, 2026-07-27 밤 — `02_Source` 구간. `99_Others/tests` 구간은 P02·P03이 파일을 만지는 중이라 A구간 실행 직전 재실측)

**⭐ 실측 발견**: 백로그 24(구 stem 교차참조)는 보수 기준 적용 시 **거의 전부 「불변」**이다 — `run-args가 처리`·`engine-versions 단방향 import` 류 **개념 호칭**(확장자·슬래시 없음)이 대부분. 치환 실작업의 본체는 백로그 23(`src/` 슬래시 경로)이다.

### 치환 — A구간 (main 일반 · renderer, 밤): 19건

`main/02_fs/workspace.ts:5` · `main/02_fs/roots.ts:65` · `main/engineVersions.ts:22·:23` ⚠️P03 후 좌표 재확인 · `main/backendStatus.ts:20` · `main/engineState.ts:20` · `main/usage.ts:14` · `main/prefs.ts:16` · `main/profile.ts:16` · `main/05_settings/commands.ts:4·:20` · `main/05_settings/mcp.ts:22` · `main/05_settings/skills.ts:19` · `renderer/src/lib/agentSampleData.ts:26·:33·:40`(canonical 지시 주석 — 샘플 리터럴 아님) · `renderer/src/lib/gitSampleData.ts:4`(CRITICAL 지시 주석) · `renderer/src/lib/viewer.ts:5·:13`

### 치환 — B구간 (preload · shared · 00_ipc, 내일 주간 + reviewer): 28건

`preload/index.ts:7·:587·:979` (trust-boundary) · `main/00_ipc/engineCheckUpdate.ts:14` (trust-boundary) · `shared/agentEvents.ts:304·:319·:391·:473·:484` · `shared/diffTypes.ts:8·:9·:10·:11·:12` · `shared/ipcContract.ts:16` · `shared/ipc/multi.ts:116` · `shared/ipc/personalization.ts:78·:107·:108` · `shared/ipc/settings.ts:141·:166·:195·:247·:302` · `shared/ipc/engine.ts:126·:151·:198·:277`

### 불변 (고치지 않는다): 3부류

- **외부 원본 참조** (~17건): `AgentCodeGUI/src/...`·`C:/Dev/AgentCodeGUI/src/...` — 참고 프로젝트의 **실재 경로**라 치환하면 오히려 틀려진다 (`store.ts:17`·`manager.ts:11`·`jsonrpc.ts:4`·`fs.ts:36`·`skipDirs.ts:8`·`listFiles.ts:4·:23`·`multiStore.ts:4`·`prefs.ts:4`·`mcp.ts:4`·`skills.ts:4·:126`·`git.ts:5`·`cmdCards.ts:4`·`threadTypes.ts:5`·`mentions.ts:14`·`usage.ts:4`·`engineVersions.ts:4`)
- **샘플 데이터 리터럴** (~30건): `composerSampleData.ts:40-66`·`gitSampleData.ts:40-44·:103-108`·`agentSampleData.ts:64·:75`·`f14SampleData.ts:28` — UI 데모용 가상 트리(코드가 소비하는 값·장식)
- **예시·개념 호칭**: `diff.ts:164`(@param 예시 — 계획서 명시) · 백로그 24 stem 교차참조 전부(`AgentBackend.ts:36·41·46`·`ipc/agent.ts:76·82·87·146`·`ClaudeCodeBackend.ts:224·230`·`claudeAgentRun.ts:64·236·702·1740`·`ipc/engine.ts:125·230`·`git.ts:368·411`·`handlers/agent.ts:91`·`permissionCoordinator.ts:152`·`progressTrackers.ts:31`·`queryFn.ts:54·61`·`sdkOptions.ts:199`·`gaugeCalc.ts:5`) · `engineVersions.ts:457`(`[engine-versions]` **로그 태그 리터럴** — 치환 시 런타임 출력이 변해 등호 원칙 위반)

### 치환 — A구간 추가분 (`99_Others/tests`, qa 도메인 — 참조 *대상*이 00_ipc여도 파일 *위치*가 qa면 A구간): 19건

`main/commands.test.ts:4` · `main/fs-diff-head.test.ts:25` · `main/mcp.test.ts:4` · `main/mergeSlashCommands.test.ts:4` · `main/multiStore.test.ts:4` · `main/orchestration-ipc-normalize.test.ts:19·:45` · `main/prefs.test.ts:4` · `main/profile.test.ts:4` · `main/skills.test.ts:4` · `main/systemprompt-ipc.test.ts:21` · `agents/orchestration-stream.test.ts:4·:5` · `agents/orchestrationMetaParse.test.ts:4` · `renderer/orchestration-panel-parity.test.ts:4` · `renderer/orchestration-reducer.test.ts:4·:5` · `renderer/prefs.test.ts:4` · `renderer/subagent-transcript-reducer.test.ts:411`
(⚠️ `main/engineVersions.test.ts:82·:448`은 P03이 파일을 만지는 중 — A구간 실행 직전 좌표 재실측)

### 불변 추가분 (`99_Others/tests`)

`main/skipDirs.test.ts:25` · `agents/task-tools.golden.test.ts:15` (둘 다 AgentCodeGUI 외부 원본 참조)

### 애매 (영호 검토): 2건 + 테스트 리터럴 부류

① `main/02_fs/skipDirs.ts:9` — `이전 위치: src/main/02_fs/listFiles.ts` = 역사 서술이지만 가리키는 파일은 현존 ② `main/00_ipc/handlers/engine.ts:48` — `registry/engine-state 내부에만` = 슬래시가 경로 구분자가 아니라 병렬 나열 ③ **테스트 데이터 리터럴 부류** (규칙 문언 "코드가 소비하는 값 = 애매" 적용, **추천 판정 = 불변** — 가상 샘플 경로라 치환은 무의미하고 등호 원칙만 위협): `shared/ipcContract.test.ts:428·:477·:536` · `renderer/f14-modals.test.tsx:25` · `renderer/m4-4-question-store.test.ts:39` · `renderer/m4-4-question-conversation.test.tsx:28` · `renderer/panel-input-palettes.test.tsx:80·:81`
