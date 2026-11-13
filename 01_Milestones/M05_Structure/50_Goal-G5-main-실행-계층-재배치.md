# M05 G5 — main 재배치 1 (실행 계층)

- 마일스톤: M05 구조 감사와 도메인별 재편 (로드맵 2번) · 작성: 2026-11-14 · 상태: 실행 중 · 검증 강도: 강
- 작업 브랜치: `chore/m05-g5-main-run-layer` (Night Shift — G4 브랜치 위에 쌓는다)
- 출발점: `12_G1-재편-계획.md`의 G5 절과 `13_G1-이동-맵.md`의 main 표.

## 목표

main의 실행 계층(`00_ipc`의 조립·검증·agent·engine 몫, `01_agents`, `07_engine`)을 도메인 폴더 `00_App`·`01_Ipc`·`03_Agent`·`04_Claude`·`10_Engine`으로 옮긴다. `backendStatus.ts`를 `03_Agent`로 보내 `01_agents`⇄`07_engine` 순환을 끊는다.

## 범위

- **만들 것**
  - 아래 이동 목록 34건을 내용 무변경 `git mv`로 옮긴다(경로는 `02_Project/00_Source/main/` 기준). 핸들러 두 파일은 이동 맵대로 도메인의 `ipc.ts`로 이름이 바뀐다. 그 밖의 파일 이름은 그대로다.
  - 옮긴 파일을 가리키는 import·`export … from`·`vi.mock`·`vi.doMock`·`importActual`·동적 `import()`·문자열 경로를 고친다.
- **건드릴 곳**: `main/00_ipc`, `main/01_agents`, `main/07_engine`, `main/index.ts`의 import, 옮긴 파일을 가리키는 소스·테스트·e2e의 경로 줄.
- **하지 않을 것**: 로직 변경, 중복 통합(G11), 함수·심볼 이름 변경, 나머지 핸들러 9개(`handlers/{conversation, fs, lsp, reference, settings, workspace, git, multi, personalization}`)와 그 밖의 main 폴더 이동(G6), 판정 장치 변경.
- **완료조건**
  - 이동 목록 34건의 위치가 `git ls-files`와 같고, `main/01_agents/`·`main/07_engine/`이 사라진다. `main/00_ipc/`에는 `handlers/`의 9파일만 남는다.
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

## Phase 1 — main 실행 계층 재배치 · 태그: `move` · 의존: G2(별칭), G4

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. G4 종결 기록, 이 goal 문서, 포인터 전환, pin 갱신
- [>] 2. 재실측 — 34파일을 가리키는 경로 줄 전수(종류별), 이동 전 import 그래프의 순환 목록
- [ ] 3. 이동 커밋(`git mv` 34건만) → import 수정 커밋 → 이동 후 순환 확인
- [ ] 4. 강 등급 검증 — 구현 문맥 없는 검수자, 하드 게이트 다섯 종, `npm test`
- [ ] 5. 커밋, 작업 브랜치 push, PR 생성 (Night Shift — 병합은 사용자가 깬 뒤)

실행 단계 일괄 승인 대상 (로드맵 합의로 승인됐다)

- 하드 게이트 다섯 종, `npm test`, 개별 vitest 실행, 경로를 고친 e2e 하네스의 실행
- 위 이동 목록 34건의 `git mv`(이동 맵 승인, 헌법 8조 예외)
- `worker`(구현)·`reviewer`(검수) 하위 에이전트 기동
- 커밋, 작업 브랜치 push, `gh pr create`

DoD

- 이동 커밋에 내용 변경이 없고, import 수정 커밋에 경로 밖 변경이 없다. 검수자가 diff로 대조한다.
- 다른 도메인 폴더를 가리키는 줄과 테스트의 줄은 `@main/…` 별칭으로 쓴다. 같은 도메인 폴더 안의 줄은 상대 경로로 둔다.
- `vi.mock` 류 경로를 고친 테스트는 실행해서 mock이 걸렸는지 확인한다(타입 검사가 못 본다).
- 프로덕션 동작 변경 0, 마크다운 문서 250줄 이하.

검증 기록

## 결정 대장

- [USER] 이 로드맵의 goal들은 헌법 11조의 예외로 합의 문답 없이 이어서 진행한다. 사용자가 「이번 순서만 예외로 이어서 처리」로 답했다 (로드맵 문답, 2026-11-13)
- [USER] 이 goal의 범위 초안은 G1 재편 계획의 G5 절이고, 이동 목록은 G1 이동 맵의 main 표다. 사용자가 PR 37 병합으로 둘을 승인했다 (2026-11-13)
- [USER] Night Shift: 병합하지 않고 PR까지만 만든다. 이 브랜치는 G4 브랜치 위에 쌓는다. 판단은 Second Brain 성향을 따른다 (2026-11-14, 로드맵 「goal 사이의 진행 방식」 절)
- [AI] `00_ipc/index.ts`(등록 함수 `registerIpc`)는 이동 맵대로 `00_App`에 둔다. 계획 G5 절의 「`01_Ipc`는 등록만 한다」와 어긋나 보이지만, 이 파일은 store·LSP 초기화와 등록을 함께 하는 조립 지점이다. 파일 단위 정본인 이동 맵을 따르는 좁은 쪽이고, 나누는 일은 조립 지점을 정리하는 G11 몫이다 (성향 37, 2026-11-14)
- [AI] 테스트와 다른 도메인을 가리키는 줄은 `@main/…` 별칭으로 쓴다. G6·G12 이동 때 경로 깊이가 바뀌어도 줄이 깨지지 않는다. G4의 shared 판단(내부 상대 경로)과 같은 꼴로, 같은 도메인 안은 상대 경로다 (성향 13, 2026-11-14)
