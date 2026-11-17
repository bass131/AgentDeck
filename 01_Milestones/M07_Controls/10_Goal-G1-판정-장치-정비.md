# M07 G1 — 판정 장치 정비 · 가드 시간 상한과 앱 데이터 폴더 쓰기 거부

- 마일스톤: M07 사용자 컨트롤 · 작성: 2026-11-17 · 상태: 실행 중 · 검증 강도: 강(판정 장치 `.claude/settings.json` 변경)
- 작업 브랜치: `chore/m07-g1-gate-tidy` — master `5f99f294`(PR 66) 위에서 갈랐다. M06 종결 기록을 함께 싣는다.

## 목표

G8 설계의 이행 goal 1을 한다. 위험 명령 가드가 멈췄을 때 무인 루프가 600초 동안 서 있지 않게 하고, CLI 세션의 에이전트가 파일 도구로 앱 데이터 폴더(엔진·설정)를 고치지 못하게 한다.

## 범위

- **만들 것**
  - `.claude/settings.json`의 위험 명령 가드 항목에 `timeout`을 둔다(M06 Backlog 30).
  - `.claude/settings.json`의 `permissions.deny`에 앱 데이터 폴더(Electron userData, `agentdeck`)로의 Edit·Write 거부 규칙을 둔다(G8 `30_노드-구조.md` 보호 6).
  - `.claude/hooks/settings-matcher.test.mjs`에 두 가지를 고정하는 단정을 먼저 더한다.
  - M06 Backlog 31(`20_plan-gate.cjs` 미배선)을 「의도된 상태」로 닫는다. 근거는 `settings-matcher.test.mjs`의 「판정부를 공유하고 테스트가 직접 구동하므로 남는다 — 배선만 없다」 주석이다.
- **건드릴 곳**: `.claude/settings.json`, `.claude/hooks/settings-matcher.test.mjs`, `98_Management/01_GateState/gate-config.json`의 `planPath`·`workPinPath`(1단계), 이 goal 문서, `M07_Controls/01_Work_Pin.md`, `M07_Controls/99_Backlog.md`, `M06_SelfDev/99_Backlog.md`(30·31 처리 표시), `M06_SelfDev/01_Work_Pin.md`(종결 표시), `00_Roadmap.md`, `M06_SelfDev/80_Goal-G8-…`(종결 기록).
- **하지 않을 것**
  - 가드 시간 초과를 막힘으로 바꾸는 일. 공식 문서상 시간 초과된 command 훅은 도구 호출을 막지 않고, 막힘으로 바꾸려면 가드 판정을 다른 스레드로 옮기는 재설계가 필요하다. G8 설계는 가드를 보안 경계로 셈하지 않으므로 이 goal에서는 멈춤 시간만 줄인다.
  - Bash 경유 쓰기 차단, 앱 쪽 보호(`blockWritesOutsideWorkingDirectories` 등). 컨트롤 골격 goal의 몫이다.
  - 가드 규칙의 변경.
- **완료조건**
  - `settings-matcher.test.mjs`의 새 단정이 변경 전에 실패하고 변경 뒤에 통과한다.
  - 공개 SDK `query()`로 프로젝트 설정을 싣고 연 세션에서, 앱 데이터 폴더에 Write를 시도하면 거부되고 파일이 생기지 않는다. 같은 세션의 Bash 호출에 가드가 여전히 발화한다(hook-log 줄).
  - 하드 게이트 다섯 종 exit 0, `npm test` 실패 0.
  - 구현 문맥 없는 검수자 1회의 지적이 반영되거나 Backlog로 넘어가 있다.

## Phase 1 — 판정 장치 정비 · 태그: `harness` · 의존: 없음

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. goal 준비 — M07 폴더, 이 문서, `gate-config.json`의 `planPath`·`workPinPath` 전환, M06 종결 기록
- [x] 2. 값 정하기 — 가드의 실제 판정 시간을 재서 `timeout` 값을 정하고, 거부 규칙의 경로 문법을 공식 문서로 확인한다
- [x] 3. 단정 먼저 — `settings-matcher.test.mjs`에 단정을 더하고 실패를 본다
- [x] 4. `settings.json` 변경 — 두 단정이 통과한다
- [x] 5. 실제 경로 실측 — SDK 세션으로 거부와 가드 발화를 확인한다
- [x] 6. 하드 게이트 다섯 종과 `npm test`
- [>] 7. 독립 검수 1회와 반영
- [ ] 8. 커밋, push, PR, 결정 보드에 병합 승인 올리기

실행 단계 일괄 승인 대상 (사용자 「A M06을 닫고 새 마일스톤」의 선택지 문장 「판정 장치 정비 goal부터 시작한다」, 로드맵 일회 예외)

- 가드 판정 시간 측정, 공식 문서 조사 하위 에이전트, 저장소 밖 scratch 스크립트로 SDK `query()` 실측, 하드 게이트 다섯 종, `npm test`, 독립 검수 하위 에이전트, 커밋, 작업 브랜치 push, `gh pr create`

DoD

- 위 완료조건 넷.
- 마크다운 문서 250줄 이하.

검증 기록

- PASS 2026-11-17T12:15:34+09:00 1·2단계 — M07 폴더·goal 문서·pin·Backlog를 만들고 `gate-config.json`을 M07로 돌렸다. 로드맵에 M07을 넣고 실전 투입을 M08로 밀었다. 가드 판정 시간을 격리 루트(`CLAUDE_PROJECT_DIR`을 scratch로)에서 쟀다. `git status` 106ms, 200 세그먼트 12,196자 122ms, 줄 이음 500줄 120ms, 17만 자 heredoc 205ms였고, 대부분은 node 기동 시간이다. 그래서 `timeout`은 30초(편집 계획 게이트와 같은 값)로 정했다. 경로 문법은 공식 permissions 문서로 확인했다. `~/`는 홈 기준이고, Write·NotebookEdit는 `Edit(path)` 규칙으로 검사되며 `Write(path)` 규칙은 맞지 않는다.
- PASS 2026-11-17T12:15:34+09:00 3·4단계 — `settings-matcher.test.mjs`에 단정 넷(가드 `timeout` 30, `Edit(~/AppData/Roaming/agentdeck/**)` 거부, 그 규칙이 allow·ask에 없음)을 먼저 더했다. 변경 전 실행은 「통과 27 · 실패 2」(timeout `[null]`, 거부 규칙 없음)였다. `settings.json` 변경 뒤에는 「통과 29 · 실패 0」이다.
- PASS 2026-11-17T12:15:34+09:00 5단계 — 공개 SDK `query()`로 실측했다. 프로젝트 설정을 싣고 `acceptEdits`로 열었고, `canUseTool`은 모두 허용하게 했다. 결과는 세 가지다. 앱 데이터 폴더로의 Write는 `permission_denials`에 올랐고 파일이 생기지 않았다. 같은 세션의 대조 Write(scratch 경로)는 파일을 만들었다. Bash `echo g1-probe-bash`에는 가드 `cmd-guard` 줄이 hook-log에 남았다(세션 `e564b2db`, 12:08:38). 편집 계획 게이트 줄은 대조 Write에만 있었다. 거부 규칙이 PreToolUse 훅보다 먼저 확정된 것으로 보인다(관찰).
- PASS 2026-11-17T12:15:34+09:00 6단계 — 하드 게이트 다섯 종 exit 0. `npm test` 435파일 통과·6 건너뜀, 5,871 통과·실패 0.

## 결정 대장

- [USER] M06을 닫고 컨트롤 작업을 새 마일스톤으로 세운다 — 「현황판 결정 응답: … 2) 컨트롤 작업(goal 9개)을 새 마일스톤으로 세울지 → A M06을 닫고 새 마일스톤」. 선택지 A의 문장은 「M06을 G8로 종결하고, M07 실전 투입 앞에 컨트롤 마일스톤을 새로 세워 판정 장치 정비 goal부터 시작한다」였다 (2026-11-17)
- [USER] 새 마일스톤 번호를 M07로 두고 실전 투입을 M08로 민다 — 순서를 문서 번호에 그대로 드러내기 위해서다. 그 전 문서의 「M07 실전 투입」은 로드맵에 대응 설명을 남겼다. (처음 [AI]로 적었고, 편집 계획 게이트의 주도권 판정으로 문답해 사용자 답 「그대로」를 받아 전환했다) (2026-11-17)
- [USER] 완료선은 G8 `60`의 예시를 쓴다 — 「되돌리기 어려운 행위(병합, 보호 해제)가 사람 버튼이나 서버 거부로만 일어나고, 컨트롤을 앱의 공통 패널에서 노드 단위로 넣고 뺀다」. (처음 [AI], 문답 답 「그대로」로 전환) (2026-11-17)
- [USER] Backlog 31은 손대지 않고 닫는다 — `20_plan-gate.cjs`는 편집 경로 게이트와 판정부를 공유하고 훅 테스트가 직접 구동한다. 배선만 내린 것은 M03 P4의 의도였다(`settings-matcher.test.mjs` 19~21행). (처음 [AI], 문답 답 「그대로 두고 닫기」로 전환) (2026-11-17)

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
