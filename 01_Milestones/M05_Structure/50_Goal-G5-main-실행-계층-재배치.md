# M05 G5 — main 재배치 1 (실행 계층)

- 마일스톤: M05 구조 감사와 도메인별 재편 (로드맵 2번) · 작성: 2026-11-14 · 상태: PR 42 대기 · 검증 강도: 강
- 작업 브랜치: `chore/m05-g5-main-run-layer` (Night Shift — G4 브랜치 위에 쌓는다)
- 출발점: `12_G1-재편-계획.md`의 G5 절과 `13_G1-이동-맵.md`의 main 표.

## 목표

main의 실행 계층(`00_ipc`의 조립·검증·agent·engine 몫, `01_agents`, `07_engine`)을 도메인 폴더 `00_App`·`01_Ipc`·`03_Agent`·`04_Claude`·`10_Engine`으로 옮긴다. `01_agents`⇄`07_engine` 순환을 끊는다 — 사용자 판정 「2」로 핸들러·등록은 `01_Ipc`, 백엔드 조립(`registry`·`backendStatus`)은 `00_App`이 맡는다(「순환 해소 이동」 절).

## 범위

- **만들 것**
  - 아래 이동 목록 34건을 내용 무변경 `git mv`로 옮긴다(경로는 `02_Project/00_Source/main/` 기준). 핸들러 두 파일은 처음 이동 맵대로 도메인의 `ipc.ts`로 옮겼다가, 순환 해소 이동에서 원래 이름으로 `01_Ipc/handlers/`에 간다. 그 밖의 파일 이름은 그대로다.
  - 옮긴 파일을 가리키는 import·`export … from`·`vi.mock`·`vi.doMock`·`importActual`·동적 `import()`·문자열 경로를 고친다.
- **건드릴 곳**: `main/00_ipc`, `main/01_agents`, `main/07_engine`, `main/index.ts`의 import, 옮긴 파일을 가리키는 소스·테스트·e2e의 경로 줄.
- **하지 않을 것**: 로직 변경, 중복 통합(G11), 함수·심볼 이름 변경, 나머지 핸들러 9개(`handlers/{conversation, fs, lsp, reference, settings, workspace, git, multi, personalization}`)와 그 밖의 main 폴더 이동(G6), 판정 장치 변경.
- **완료조건**
  - 이동 목록 34건과 순환 해소 이동 5건을 거친 위치가 `git ls-files`와 같고, `main/01_agents/`·`main/07_engine/`이 사라진다. `main/00_ipc/`에는 `handlers/`의 9파일만 남는다.
  - `00_App`·`01_Ipc`·`03_Agent`·`04_Claude`·`10_Engine` 사이에 import 순환이 없다. import 그래프를 도구로 뽑아 확인한다. 로직 변경 없이는 끊을 수 없는 순환이 나오면 범위 변경이므로 멈춘다.
  - 이동 커밋은 rename만 담는다(`git show -M --name-status`에서 전부 `R100`). import 수정은 별도 커밋이다.
  - 하드 게이트 다섯 종 exit 0, `npm test` 실패 0, `collection-baseline` 개수 불변(414).

## 이동 목록 (이동 맵 main 표에서 뽑음)

| 현재 | 새 위치 |
|---|---|
| `00_ipc/context.ts`, `00_ipc/index.ts` | `00_App/` 같은 이름 |
| `00_ipc/normalize.ts` | `01_Ipc/normalize.ts` |
| `00_ipc/handlers/agent.ts` | `03_Agent/ipc.ts` |
| `00_ipc/agentRuns.ts` | `03_Agent/agentRuns.ts` |
| `01_agents/{AgentBackend, registry, CodexBackend}.ts` | `03_Agent/` 같은 이름 |
| `01_agents/EchoBackend.ts` | `03_Agent/testing/EchoBackend.ts` |
| `07_engine/backendStatus.ts` | `03_Agent/backendStatus.ts` |
| `01_agents/{claudeAgentRun, idleCloseGovernor, sendTokenLedger, bgTaskObserver, bgTaskTail}.ts` | `04_Claude/run/` 같은 이름 |
| `01_agents/{eventNormalizer, claudeStream, progressTrackers, fileChangeTracker, subagentMeta, orchestrationMeta, modelFallback, descriptionUtils}.ts` | `04_Claude/stream/` 같은 이름 |
| `01_agents/permissionCoordinator.ts` | `04_Claude/permission/permissionCoordinator.ts` |
| `01_agents/{ClaudeCodeBackend, queryFn, sdkOptions, runArgs, buildPrompt}.ts` | `04_Claude/` 같은 이름 |
| `00_ipc/handlers/engine.ts` | `10_Engine/ipc.ts` |
| `00_ipc/engineCheckUpdate.ts` | `10_Engine/engineCheckUpdate.ts` |
| `07_engine/{engineState, engineVersions, usage}.ts` | `10_Engine/` 같은 이름 |

합계 34건이다 — `00_ipc` 7(핸들러 이름 변경 2건 포함), `01_agents` 23, `07_engine` 4.

### 순환 해소 이동 (사용자 판정 2026-11-14 「2」, 이동 맵 개정)

위 34건 뒤 남은 `03_Agent ⇄ 04_Claude ⇄ 10_Engine` 순환을 끊으려고 5건을 더 옮긴다. 등록과 핸들러는 `01_Ipc`, 백엔드 조립은 `00_App`이 맡는다.

| 34건 뒤 위치 | 새 위치 | 이유 |
|---|---|---|
| `00_App/index.ts`(`registerIpc`) | `01_Ipc/index.ts` | 핸들러를 등록하는 쪽이 조립(`00_App`)을 부르게 해 `00_App ⇄ 01_Ipc`를 막는다 |
| `03_Agent/ipc.ts` | `01_Ipc/handlers/agent.ts` | `03_Agent → 04_Claude`(`runArgs`)와 `03_Agent → 01_Ipc`를 없앤다 |
| `10_Engine/ipc.ts` | `01_Ipc/handlers/engine.ts` | `10_Engine → 03_Agent`를 없앤다 |
| `03_Agent/registry.ts` | `00_App/registry.ts` | 구체 백엔드(Claude·Codex·Echo)를 고르는 조립 지점이다. `03_Agent → 04_Claude`를 없앤다 |
| `03_Agent/backendStatus.ts` | `00_App/backendStatus.ts` | `registry`와 엔진 상태를 합치는 조회다. `03_Agent → 10_Engine`을 없앤다 |

옮긴 뒤 기대 방향은 `01_Ipc → 00_App → {03_Agent, 04_Claude, 10_Engine}`, `04_Claude → {03_Agent, 10_Engine}`이다. `03_Agent`와 `10_Engine`은 main 안의 다른 실행 계층 도메인을 부르지 않는다. 이동 맵과 재편 계획의 해당 줄도 같은 커밋 묶음에서 고친다. G6의 나머지 핸들러 9개도 `01_Ipc/handlers/`로 간다.

## Phase 1 — main 실행 계층 재배치 · 태그: `move` · 의존: G2(별칭), G4

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. G4 종결 기록, 이 goal 문서, 포인터 전환, pin 갱신
- [x] 2. 재실측 — 34파일을 가리키는 경로 줄 전수(종류별), 이동 전 import 그래프의 순환 목록
- [x] 3. 이동 커밋(`git mv` 34건만) → import 수정 커밋 → 이동 후 순환 확인 — 순환이 남아 사용자 판단을 받았다
- [x] 3b. 이동 맵·재편 계획 개정 커밋 → 순환 해소 이동 커밋(`git mv` 5건) → import 수정 커밋 → 순환 0 확인
- [x] 4. 강 등급 검증 — 구현 문맥 없는 검수자, 하드 게이트 다섯 종, `npm test`
- [x] 5. 커밋, 작업 브랜치 push, PR 생성 (Night Shift — 병합은 사용자가 깬 뒤)

실행 단계 일괄 승인 대상 (로드맵 합의로 승인됐다)

- 하드 게이트 다섯 종, `npm test`, 개별 vitest 실행, 경로를 고친 e2e 하네스의 실행
- 위 이동 목록 34건과 순환 해소 이동 5건의 `git mv`(이동 맵 승인과 사용자 판정 「2」, 헌법 8조 예외)
- `worker`(구현)·`reviewer`(검수) 하위 에이전트 기동
- 커밋, 작업 브랜치 push, `gh pr create`

DoD

- 이동 커밋에 내용 변경이 없고, import 수정 커밋에 경로 밖 변경이 없다. 검수자가 diff로 대조한다.
- 다른 도메인 폴더를 가리키는 줄과 테스트의 줄은 `@main/…` 별칭으로 쓴다. 같은 도메인 폴더 안의 줄은 상대 경로로 둔다.
- `vi.mock` 류 경로를 고친 테스트는 실행해서 mock이 걸렸는지 확인한다(타입 검사가 못 본다).
- 프로덕션 동작 변경 0, 마크다운 문서 250줄 이하.

검증 기록

- PASS 2026-11-14T04:32:50+09:00 — 2단계 재실측과 3단계의 이동·import 커밋(워커 보고 대조, `dcb84c2`·`488e277`).
  - 재실측: 옮길 34파일을 가리키는 경로 줄은 테스트 109파일 275줄(정적 214, `await import()` 41, 타입 위치 3, `vi.mock` 5, `vi.doMock` 7, 문자열 5), 소스 3줄, 34파일 자신의 깨지는 상대 import 63줄이다.
  - 이동 커밋은 34건 전부 `R100`이다. 새 폴더 7개는 `git mv`가 만들지 않아 `mkdir -p`로 만들었다(빈 폴더, 파일 쓰기 아님).
  - import 커밋은 132파일 344/344줄이다. 경로 밖 변경은 `mainDomains.smoke.test.ts`의 주석 2줄·`it` 제목 1줄(옛 폴더 이름 → 새 이름, 단언 불변)뿐이다. main 소스에서 shared를 가리키던 17줄은 G4 선례대로 `@shared/…`로 썼다.
  - 게이트: 하드 게이트 다섯 종 exit 0, `npm test` 408파일 통과·6 skip·수집 414·실패 0(66.57초). mock 경로를 고친 7파일 단독 99 passed, e2e `gap1-visual-shots` 16 passed.
  - 세션 df394581.
- FAIL 2026-11-14T04:32:50+09:00 — 완료조건 2(도메인 순환 0) 불충족. 이동 뒤 도메인 그래프에 `03_Agent ⇄ 04_Claude ⇄ 10_Engine` 순환이 남는다(TypeScript compiler API로 메모리에서 뽑음, 타입 전용 import를 빼도 남음).
  - 순환을 만드는 값 간선: `03_Agent/backendStatus → 10_Engine/engineState`, `10_Engine/ipc → 03_Agent/{backendStatus, registry}`, `03_Agent/{registry → 04_Claude/ClaudeCodeBackend, ipc → 04_Claude/runArgs}`, `04_Claude/{ClaudeCodeBackend, queryFn} → 10_Engine/engineVersions`(동적 import).
  - 원인: 계획은 `backendStatus.ts`를 `03_Agent`로 보내면 `01_agents ⇄ 07_engine` 순환이 끊긴다고 봤다. 하지만 engine 핸들러(`10_Engine/ipc.ts`)가 `registry`·`backendStatus`를 부르고 `registry`가 Claude 백엔드를 조립해서, 이동 맵의 배치만으로는 순환이 남는다.
  - 시도한 것: 이동 맵대로 34건을 옮기고 경로만 고쳤다. 로직 변경 없이 끊으려면 이동 맵을 바꿔 파일을 다른 도메인으로 보내야 하므로(goal 문서 완료조건이 정한 범위 변경 사안) 고치지 않았다.
  - 세션 df394581.
- USER-INPUT 2026-11-14T04:32:50+09:00 — 순환 처리 방식을 사용자에게 묻는다. 안건은 둘이다. 하나는 G5의 순환 조건을 풀고 남은 순환을 조립 지점 정리 goal(G11)로 넘기는 것이고, 다른 하나는 이동 맵을 고쳐 `registry`·`03_Agent/ipc.ts`·`10_Engine/ipc.ts`를 조립·IPC 쪽으로 보내는 것이다. Night Shift 규칙(범위 변경 시 멈춤)에 따라 G5 PR과 G6 이후 goal을 멈췄다. 브랜치는 push만 했다.
- PASS 2026-11-14T07:57:51+09:00 — 3b단계 순환 해소(사용자 판정 「2」, 이동 맵 개정 `99e6603`, 워커 보고 대조 `1f29a3c`·`184e2a3`).
  - 이동 커밋은 5건 전부 `R100`이다. import 커밋은 14파일 30/30줄이다(소스 6파일 17줄, 테스트 8파일 13줄, `vi.mock` 4줄 포함).
  - 경로 밖 변경은 `mainDomains.smoke.test.ts`의 주석·제목 2줄(경로 토큰, 단언 불변)뿐이다. 깨지지 않은 줄을 고친 곳은 `01_Ipc/handlers/agent.ts`의 normalize 한 줄이다(같은 도메인이 돼 별칭 → 상대 경로).
  - 순환: 같은 도구(TypeScript compiler API, 메모리)로 다섯 도메인 사이 SCC가 0이다. 타입 전용 import를 넣어도 빼도 0이다. `03_Agent`·`10_Engine`은 main 안의 다른 도메인을 부르지 않는다. `01_Ipc`는 `00_App`을 거치지 않고 `03_Agent`·`04_Claude`·`10_Engine`도 직접 부르지만 모두 아래 방향이다. 파일 순환은 기존 `02_fs/diff ⇄ git`(Backlog 29, G6)뿐이다.
  - 게이트: 하드 게이트 다섯 종 단독 exit 0, `npm test` 408파일 통과·6 skip·수집 414·실패 0(70.88초), 고친 테스트 8파일 92 passed, e2e `gap1-visual-shots` 16 passed.
  - 세션 df394581.
- PASS 2026-11-14T08:13:53+09:00 — 4단계 강 등급 검증. 구현 문맥 없는 검수자(fable)가 `52efbb8..HEAD`를 보고 차단 0·중요 0·경미 3으로 통과를 냈다.
  - 검수자 독립 확인: 739파일·지정자 4163개를 이동 전후로 풀어 같은 모듈로 풀림(불일치 0), 다섯 도메인 SCC 0(전체·타입 제외·동적 제외 세 경우), `DEBUG=vite-node` 실행 로그로 mock 12개가 걸림, `registerIpc` 본문·등록 순서 불변, 판정 장치 변경 0.
  - 경미 셋은 고쳤다. e2e 표본 문자열의 옛 경로(`gap1-visual-shots.e2e.ts:158`), 이동 맵·재편 계획에 남은 `12_Window/ipc.ts`(→ `01_Ipc/handlers/window.ts`, 판정 「2」와 맞춤), 이 문서 목표·범위 문장이다. 참고로 지적된 `.claude/agents/reviewer.md:28`의 옛 경로도 이번 이동이 깨뜨린 경로라 고쳤다(Backlog 28 해소).
  - 게이트(수정 뒤, 메인 세션): typecheck 둘·lint·build exit 0. `test:hooks` 첫 실행은 `state-race`의 RC-02·RC-04(post-read 대본의 임계구간 겹침 실측이 `null`, 부하로 판정 불능)로 exit 1이었다. 단독 재실행 21/21, 전체 재실행 전 묶음 「전부 통과」다(Backlog 30). `npm test` 408파일 통과·6 skip·수집 414·실패 0(64초).
  - 세션 df394581.
- PASS 2026-11-14T08:14:55+09:00 — 5단계. 커밋 `8087ce5`까지 `chore/m05-g5-main-run-layer`로 push했고 PR 42(base `master`)를 열었다. 병합 순서는 PR 40 → 41 → 42다. 병합하지 않았고, 이 줄은 G6 브랜치의 첫 커밋에 실린다. 세션 df394581.

## 결정 대장

- [USER] 이 로드맵의 goal들은 헌법 11조의 예외로 합의 문답 없이 이어서 진행한다. 사용자가 「이번 순서만 예외로 이어서 처리」로 답했다 (로드맵 문답, 2026-11-13)
- [USER] 이 goal의 범위 초안은 G1 재편 계획의 G5 절이고, 이동 목록은 G1 이동 맵의 main 표다. 사용자가 PR 37 병합으로 둘을 승인했다 (2026-11-13)
- [USER] Night Shift: 병합하지 않고 PR까지만 만든다. 이 브랜치는 G4 브랜치 위에 쌓는다. 판단은 Second Brain 성향을 따른다 (2026-11-14, 로드맵 「goal 사이의 진행 방식」 절)
- [AI] `00_ipc/index.ts`(등록 함수 `registerIpc`)는 이동 맵대로 `00_App`에 둔다. 계획 G5 절의 「`01_Ipc`는 등록만 한다」와 어긋나 보이지만, 이 파일은 store·LSP 초기화와 등록을 함께 하는 조립 지점이다. 파일 단위 정본인 이동 맵을 따르는 좁은 쪽이고, 나누는 일은 조립 지점을 정리하는 G11 몫이다 (성향 37, 2026-11-14)
- [USER] 도메인 순환은 이동 맵을 고쳐 G5 안에서 끊는다. 「핸들러는 자기 도메인의 `ipc.ts`」 원칙을 바꿔, 핸들러는 `01_Ipc/handlers/`, 백엔드 조립은 `00_App`이 맡고 G6도 이를 따른다. 사용자가 순환 처리 문답(1 조건 완화·G11 이월 / 2 이동 맵 개정)에 「2」로 답했다 (2026-11-14T07:51)
- [AI] 판정 「2」의 구체 배치는 순환 해소 이동 표의 5건이다. 문답 때 적은 셋(`registry`, 핸들러 둘)만 옮기면 `backendStatus → registry`가 `03_Agent → 00_App`, `registerIpc`의 등록이 `00_App ⇄ 01_Ipc` 순환을 새로 만들어서 `backendStatus`·`00_App/index.ts`를 함께 옮긴다. 판정의 목적(순환 0)을 이루는 가장 작은 집합이다 (성향 37, 2026-11-14)
- [AI] 테스트와 다른 도메인을 가리키는 줄은 `@main/…` 별칭으로 쓴다. G6·G12 이동 때 경로 깊이가 바뀌어도 줄이 깨지지 않는다. G4의 shared 판단(내부 상대 경로)과 같은 꼴로, 같은 도메인 안은 상대 경로다 (성향 13, 2026-11-14)
