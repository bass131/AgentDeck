# M07 G3 — 엔진 경로 잠금 · 앱 세션의 에이전트가 앱 엔진·설정 파일을 못 고치게 막는다

- 마일스톤: M07 사용자 컨트롤 · 작성: 2026-11-17 · 상태: 종결 (PR 69, master `b5bc354c`) · 검증 강도: 강(앱 권한 판정 경로 변경)
- 작업 브랜치: `feat/m07-g3-engine-path-lock` — master `c213e169`(PR 68) 위에서 갈랐다. G2 종결 기록을 함께 싣는다.

## 목표

앱은 main 프로세스에서 userData의 `engines/<버전>/`에 있는 SDK 코드를 불러 쓴다(`engineVersions.ts`). 앱 세션의 에이전트가 이 폴더나 엔진 설정을 고치면, 다음 실행부터 앱의 판정 코드 자체가 바뀐다.
이 goal은 G8 설계 `30_노드-구조.md` 「보호」의 2·3을 앱 세션에 넣는다. 파일 도구는 SDK 인라인 거부 규칙으로, Bash는 SDK 훅 콜백의 잠금 노드로 막는다.

## 범위

- **만들 것**
  - 보호 대상 경로 함수. 실행 중인 userData 아래 `engines/`, `engine-config.json`, `controls.json`이다. 경로는 런타임 `getUserDataDir()`에서 만든다. e2e와 실주행은 임시 `--user-data-dir`를 쓰므로 G1의 고정 글자로는 안 된다.
  - 인라인 거부 규칙 `Edit(//c/…/engines/**)` 꼴. `Edit` 규칙은 Write·NotebookEdit에도 걸린다. 경로 꼴은 실측으로 골랐다(검증 기록).
  - 잠금 코드 노드 「엔진 경로 Bash 잠금」. SDK `hooks.PreToolUse` 콜백이다. `command` 입력을 가진 도구의 명령 글자에 보호 대상이 보이면 거부한다. `onFailure: 'block'`과 시간 상한을 둔다. 명령 글자를 보는 L3라서 실수만 막는다.
  - 두 노드를 G2 등록부 목록에 올린다. 지점 칸에 `permissionRules`·`preToolUse`를 더한다.
  - `buildClaudeSdkOptions`가 userData 경로를 받아 거부 규칙과 훅을 넣는다.
- **건드릴 곳**: `02_Project/00_Source/main/04_Claude/`(`sdkOptions.ts`, `run/claudeAgentRun.ts`, `permission/`), `02_Project/01_TestCode/main/04_Claude/`, 이 goal 문서, `M07_Controls/01_Work_Pin.md`·`99_Backlog.md`·`20_Goal-G2-…`(종결 기록), `00_Decision_Board.local.json`, `98_Management/01_GateState/gate-config.json`의 `planPath`(1단계).
- **하지 않을 것**
  - `blockWritesOutsideWorkingDirectories`. 사용자 결정으로 하지 않는다(결정 대장). Backlog로 남긴다.
  - 보호 4(해시 봉인과 닫힌 실패), 보호 5(엔진 교체 확인), `controls.json`의 내용, 컨트롤 패널. 다음 goal 몫이다.
  - CLI 세션의 Bash 경유 쓰기(M07 Backlog 1). 저장소 판정 장치는 고치지 않는다.
  - 기존 권한 콜백 노드 여섯의 판정 변경.
- **완료조건**
  - 단위 테스트가 다음을 고정한다. 보호 대상 경로와 거부 규칙 글자, 잠금 노드의 거부와 통과(경로 꼴 변형 포함), 훅 등록 모양(`onFailure: 'block'`·시간 상한), 등록부 목록의 두 노드.
  - 이 브랜치 빌드본의 실제 앱(임시 userData, `자동` 모드)에서 다음을 본다. 에이전트의 `engines/` Write와 `engine-config.json` 덮어쓰기 Bash가 거부되고 파일이 그대로다. 비교용 Bash와 작업 폴더 Write는 실행된다.
  - 하드 게이트 다섯 종 exit 0, `npm test` 실패 0.
  - 구현 문맥 없는 검수자 1회의 지적이 반영되거나 Backlog로 넘어가 있다.

## Phase 1 — 엔진 경로 잠금 · 태그: `source` · 의존: 없음

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. goal 준비 — 이 문서, `planPath` 전환, pin, G2 종결 기록, SDK 블랙박스 실측(경로 꼴, 훅 거부, 훅 실패 시 막힘)
- [x] 2. 테스트 먼저 — 경로·규칙·잠금 노드·훅 등록·목록 단정을 쓰고 실패를 본다
- [x] 3. 구현 — 2단계 테스트와 기존 테스트가 통과한다
- [x] 4. 하드 게이트 다섯 종과 `npm test`
- [x] 5. 실제 경로 — 이 브랜치 빌드본의 앱에서 거부와 통과를 본다
- [x] 6. 독립 검수 1회와 반영
- [x] 7. 커밋, push, PR, 결정 보드에 병합 승인 올리기

실행 단계 일괄 승인 대상 (로드맵 일회 예외 — 「이번 순서만 예외로 이어서 처리」)

- SDK `query()` 블랙박스 실측(저장소 밖 임시 폴더), vitest, 하드 게이트 다섯 종, `npm test`, `npm run build`, 앱 기동·종료(Playwright, 2번 모니터), 리허설용 worktree 만들기·지우기, 독립 검수 하위 에이전트, 커밋, 작업 브랜치 push, `gh pr create`

DoD

- 위 완료조건 넷.
- 마크다운 문서 250줄 이하.

검증 기록

- PASS 2026-11-17T14:53:32+09:00 1단계 — 문서와 `planPath`, pin, G2 종결 기록을 갖췄다. SDK `query()` 블랙박스 실측을 했다. 저장소 밖 임시 폴더의 가짜 userData, `bypassPermissions`, `settingSources: []`, 모델 Haiku 4.5를 썼다. 근거는 돌려받은 `permission_denials`와 파일 존재 여부다.
  - 인라인 거부 규칙 경로 꼴: `Edit(//C:/Users/…)`는 `engines/` Write를 막지 못했다(파일 생성됨, 거부 0). `Edit(//c/Users/…)`는 `engines/` Write와 `engine-config.json` Write를 둘 다 막았다(거부 둘, 파일 불변). 비교용 Write는 성공했다.
  - 훅 콜백 잠금: `PreToolUse` 콜백이 `echo probe > "<userData>/engine-config.json"`을 거부했고 파일은 그대로였다. 비교용 `echo g3-control-bash`는 콜백을 지나 실행됐다.
  - 훅 실패: 콜백이 던지고 `onFailure: 'block'`이면 비교용 Bash까지 거부됐다. 던지지 않으면 같은 명령이 실행됐다(같은 프롬프트로 짝 실행).
- PASS 2026-11-17T15:03:39+09:00 2~4단계
  - 테스트 먼저: `enginePathLock.test.ts`를 쓰고 모듈이 없어 실패하는 것을 봤다. 구현 중에는 TDD 가드의 연속 편집 임계에 맞춰 단정을 하나씩 더했다(PowerShell 명령, 임시 userData 경로, 경로를 못 얻을 때, 훅 실패 정책 배선).
  - 구현: `enginePathLock.ts`(보호 대상, `//c/` 규칙, Bash 잠금 훅, 노드 둘)를 만들었다. 등록부 지점 칸을 넓히고 목록 뒤에 두 노드를 붙였다. `buildClaudeSdkOptions`는 `userDataDir`를 받고, 실행은 매번 `getUserDataDir()`를 넘긴다. G2 등록부 테스트의 목록 단정은 앞 여섯만 보게 고쳤다.
  - 경로를 못 얻을 때(Electron 밖)는 잠금 없이 열고 main 로그에 남긴다. 앱 안에서는 일어나지 않는다. 기존 SDK 옵션 테스트들이 경로 없이 부르므로 그 모양을 지킨다.
  - 게이트: 수집 기준선 443 → 444. 하드 게이트 다섯 종 exit 0, `npm test` 438파일 통과·6 건너뜀, 7,854 통과·실패 0(15:00:38 시작).
- PASS 2026-11-17T15:06:22+09:00 5단계
  - 무대: 이 브랜치 빌드본으로 실제 앱을 띄웠다(잠금 사유 문구가 `out/main/index.js`에 실존). 세션 폴더는 `3f40c7d4` worktree, userData는 빈 임시 폴더, 모드는 `자동`이다. 임시 userData에 `controls.json`(`{"seed":"g3"}`)을 미리 뒀다.
  - 결과(에이전트 답과 디스크 대조):
    - 1번 `<임시 userData>/engines/g3-probe.txt` Write는 권한 설정 거부(「denied by your permission settings」)였다. `engines/` 폴더도 생기지 않았다.
    - 2번 `echo probe > "<임시 userData>/controls.json"`은 PreToolUse 훅 거부(잠금 사유 문구)였다. 파일은 `{"seed":"g3"}` 그대로였다.
    - 3번 작업 폴더 Write와 4번 `echo g3-control-bash`는 실행됐다.
  - 확인된 것: 실행이 런타임 userData 경로(임시 `--user-data-dir`)로 잠금을 만든다.
  - 정리: 앱을 닫고 worktree를 지웠다.
- PASS 2026-11-17T15:25:17+09:00 6단계 — 구현 문맥 없는 검수자 1회에서 막을 결함은 없었다. 중간 1·낮음 2·미측정 묶음이 나왔다.
  - Bash 잠금이 놓친 꼴 넷(`cd "$APPDATA/agentdeck" && rm -r engines`, `rm -rf …/agentdeck/engine*`, `>agentdeck/controls.json`, `…/agentdeck/*`)을 테스트에 먼저 넣어 실패 넷을 봤다. 판별을 직접·와일드카드·폴더 진입 세 갈래로 고쳐 통과시켰다. 통과 쪽에 `chats/*`와 `cd C:/Dev/AgentDeck && npm test`를 더했다.
  - 추가 SDK 실측(같은 조건): 대문자로 바꾼 경로의 Write와 `engine-config.json`의 Edit 도구가 둘 다 거부됐고 파일은 그대로였다. 콜백 훅은 `includeHookEvents`에서 훅 시스템 메시지를 하나도 내지 않았다. 그래서 화면의 훅 타임라인에 도구 호출마다 줄이 쌓이지 않는다.
  - 옛 엔진 버전의 잠금은 M07 Backlog 6, 재지 않은 꼴은 Backlog 7로 넘겼다. 커밋 메시지 등의 오탐은 결정 대장에 받아들인다고 적었다.
  - 하드 게이트 다섯 종 exit 0(린트 경고 1은 변경 전부터 있던 것). `npm test` 438파일·7,860 통과·실패 0(15:21:09 시작).
- PASS 2026-11-17T15:26:03+09:00 7단계 — 커밋 `0ba61f6d`·`3f40c7d4`·`7f583d6d`·`b7c39c5b`, 작업 브랜치 push, PR 69. 결정 보드에 병합 승인(`m07-g3-pr69-merge`)을 올렸다.

## 결정 대장

- [USER] 로드맵의 goal들은 합의 문답 없이 이어 간다 — 「이번 순서만 예외로 이어서 처리」 (2026-11-13, 로드맵 합의)
- [USER] G8 설계를 M07의 출발점으로 삼는다 — PR 66 병합 승인과 「A M06을 닫고 새 마일스톤」 (2026-11-17)
- [USER] PR 68(G2)을 병합하고 다음 goal로 간다 — 「A 병합한다」, 「OK 다음목표 진행하자」 (2026-11-17)
- [USER] 작업 폴더 밖 전면 쓰기 차단(`blockWritesOutsideWorkingDirectories`)은 켜지 않고 보호 대상만 거부한다 — 문답 「보호 대상만 거부」. 앱 세션의 Second Brain 쓰기와 판정 장치 편집을 지금처럼 둔다 (2026-11-17)
- [AI] G2에서 떼어 낸 몫을 둘로 나눈다 — 이 goal은 보호 2·3(엔진 경로 잠금)이고, 보호 4·5와 `controls.json`, 컨트롤 패널은 다음 goal이다. 해시 봉인은 패널의 저장과 짝이라 함께 간다 (2026-11-17)
- [AI] Bash 잠금은 명령 글자에 `<userData 폴더 이름>/engines`·`/engine-config.json`·`/controls.json`이 보이는지로 가른다 — 절대 경로 전체가 아니라 끝 두 마디로 보면 `$APPDATA/agentdeck/…`, `~/AppData/Roaming/agentdeck/…` 꼴도 걸린다. 같은 글자가 든 읽기 명령도 막히는 오탐은 받아들인다(L3, 엔진 폴더를 읽을 일이 없다) (2026-11-17)
- [AI] 검수가 짚은 오탐 둘도 받아들인다 — 앱 세션에서 이 저장소를 작업할 때 `agentdeck/controls.json` 같은 글자가 든 커밋 메시지·PR 본문·grep 명령이 막힌다. 임시 userData에서는 `userdata/engines` 글자가 든 명령이 막힌다. 막히면 글자를 바꿔 다시 쓰면 되고, 잠금을 좁히면 실수 꼴을 놓친다 (2026-11-17)
- [USER] PR 69를 병합한다 — 「M07 G3 엔진 경로 잠금 PR 69를 master에 병합할지 → A 병합한다」, master `b5bc354c` (2026-11-17)

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
