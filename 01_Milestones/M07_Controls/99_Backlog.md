# M07 Backlog — 범위 밖 발견

goal 완료조건 밖에서 찾은 것을 한 줄씩 남긴다. 승인을 묻지 않는다. M06에서 넘어온 항목은 `M06_SelfDev/99_Backlog.md`가 계속 소유한다.

## 닫힘 (M11)

M11 Backlog 정리(`01_Milestones/M11_BacklogSweep/`)가 닫은 항목이다. 아래 항목 줄은 그대로 두고 닫힘은 이 표가 갖는다. 표에 없는 항목은 M11 goal 2~9가 고치면서 더한다.

| 항목 | 닫힘 | 근거 |
|---|---|---|
| 2 | M13으로 | M11 스펙 「하지 않을 것」 — `productName`은 설치본 패키징과 함께 M13이 맡는다. |
| 4 | 고침(M11 goal 7) | Green 채집이 `persistedOutputPath` 파일 전문까지 읽어 요약 줄과 실패 표기를 본다(`33_tdd-guard.cjs` `responseText`, GE-09~09c, `3aa38815`). |
| 5 | v2로 | G1 결정 대장 [USER·위임] — 끈 노드의 토글은 그래프 편집기의 일이다. |
| 6 | 고침(M11 goal 3) | 엔진 경로 잠금의 재실측(규칙 경로 꼴 `//c/`, 훅 실패 시 `onFailure: 'block'`)을 SDK 재실측 절차에 뒀고, 다른 엔진 버전을 활성으로 삼을 때도 돌린다(`00_Documents/00_Architecture/01_SDK-재실측-절차.md` 「언제 돌리나」·「다시 잴 것」). |
| 7 | 고침(M11 goal 3) | 셸 잠금이 8.3 짧은 이름(`AGENTD~1`, `ENGINE~1.JSO`)을 원래 이름으로 펴서 판정한다(`main/04_Claude/permission/enginePathLock.ts:88,97`, `0c2fec37`). SDK 동작에 달린 나머지 꼴(junction, `\\?\`·UNC, 괄호 든 경로, 하위 에이전트, MCP 쓰기 도구, 콜백 시간 초과)은 재실측 절차 「아직 재지 않은 꼴」에 다음 SDK 갱신 때 잴 것으로 올렸다. |
| 8 | 해결됨 | 컨트롤 패널이 엔진 봉인 경고와 「이 엔진 다시 고르기」를 보인다(`renderer/src/11_Settings/ControlsView.tsx:3,141`, `8a0eddd4`). |
| 9 | 고침(M11 goal 3) | `installVersion`이 빈 임시 형제 폴더(`engines/.<v>.tmp-…`)에 npm을 부르고 성공하면 바꿔 끼운다 — 미리 놓인 잠금 파일·패키지를 쓰지 않고, 실패하면 기존 버전 폴더가 남는다(`main/10_Engine/engineVersions.ts` `swapIn`, `0c2fec37`·독립 검수). 점으로 시작하는 폴더는 설치 목록에 들지 않는다. |
| 10 | 해결됨 | 3글자 이상 접두 뒤 와일드카드를 막는다(`main/04_Claude/permission/enginePathLock.ts:64-65`, G5). |
| 11 | 고침(M11 goal 3) | 봉인 목록 행에 바뀜 시각(ctime)을 더했다 — utimes로 수정 시각을 되돌려도 걸린다(`main/10_Engine/engineSeal.ts:76`, `ed5411ae`). 내용 해시는 실측(설치본 7968개·402MB, 따뜻할 때 6.3초·차가울 때 16.6초, 목록만 0.15초)으로 거뒀다. `engines/node_modules`·`<userData>/node_modules`가 있으면 mismatch, 봉인 쓰기는 임시 파일+이름 바꾸기다(`engineSeal.ts:22,169,116`, `0c2fec37`). |
| 12 | 고침(M11 goal 3) | `version()`은 실행이 실제로 쓰는 엔진(`activeInUse`)을 보인다 — major 불일치나 같은 봉인의 불러오기 실패면 번들 버전(`main/10_Engine/engineVersions.ts:352`, `main/04_Claude/ClaudeCodeBackend.ts:64`, `0c2fec37`). |
| 13 | 고침(M11 goal 3) | 노드마다 메모리 고리(50줄, 파일 없음)에 시각·노드·도구·입력 요약(200자, 자격 가림)·결과·사유를 쌓는다(`main/04_Claude/permission/verdictLog.ts:6,56`). 권한 콜백은 `controlNodes.ts:201,205`, 훅 노드는 `sdkOptions.ts:88,91`이 감싼다. 패널에 「최근 판정 N」(`renderer/src/11_Settings/ControlsView.tsx:55`, `0c2fec37`). 인라인 거부 규칙 노드(`engine-path-file-deny`)는 SDK가 판정해 앱이 보지 못하므로 「최근 판정 기록 없음」이다(독립 검수). |
| 14 | v2로 | 규칙 노드 GUI는 v2 그래프 편집기와 같은 화면이다(`00_Roadmap.md:33`). |
| 15 | v2로 | G1 결정 대장 [USER·위임] — 노드 설정 내보내기·가져오기는 그래프 편집기의 일이다. |
| 16 | 고침(M11 goal 2) | 응답 전에 도착한 실행 이벤트를 붙들었다가 실행 id가 정해지면 적용하고 요청 오류의 Electron 접두를 지운다(`renderer/src/03_Agent/state/runCore.ts:127,173-174,204`, `d95d7051`). |
| 17 | 고침(M11 goal 2) | 실측(Bypass·허용 규칙·SDK 자체 승인·auto 분류기 승인은 콜백이 오지 않음) 뒤 노드 이름을 「자동 모드는 허용」으로 좁히고 패널 머리말에 적었다(`main/04_Claude/permission/controlNodes.ts:138`, `renderer/src/11_Settings/ControlsView.tsx:156`, `d95d7051`). |
| 18 | 고침(M11 goal 2) | userData 경로를 못 얻으면 닫힌 실패이고 앱 조립 지점이 검사를 주입한다(`main/04_Claude/permission/controlsStore.ts:205`, `main/00_App/registry.ts:30`, `d95d7051`). |
| 19 | 해결됨 | 「처음 설정함」 표시를 두 파일과 따로 둔다(`main/04_Claude/permission/controlsStore.ts:8`, PR 73 `aaaef0e4`). |
| 20 | 정함 → goal 8 | M11 스펙 결정 대장 [USER] 2회차 — 헌법 3조 보호 표면 「넣는다」. |
| 22 | 고침(M11 goal 6) | ADR-004 23행 아래에 대체 표시를 달았다 — 병합의 사람 판정은 현황판·앱의 「병합」 버튼과 사용자가 직접 실행하는 `gh pr merge`이고, 에이전트의 병합은 가드가 거부한다(`cf6359ba`). ADR-003 80~81행의 옛 경로는 M08 G2가 ADR-005 대체 표시를 이미 달았다(`72623936`). |
| 23 | 해결됨 | 가드가 `gh pr merge`와 병합 API·GraphQL 병합을 차단 목록으로 막고(`dangerous-cmd-guard.mjs:512-516`, M07 G12) 설정 `deny`의 넓은 꼴은 M11 Backlog로 옮겼다. |
| 24 | 고침(M11 goal 3, 앞절) | 고전 보호가 「Branch not protected」면 `rules/branches/<b>`의 `required_status_checks`를 필수 검사로 읽는다(`main/08_Git/prMerge.ts:164,286`, `2af8fd68`). 실앱 e2e `m11-g3-ruleset-card-live.e2e.ts`에서 연습 저장소 PR 6 카드가 「main 브랜치 룰셋에 필수 검사가 없어요」. 뒷절(하위 에이전트 대화·「이미 있음」 오류의 `gh pr create`)은 M11 Backlog 26. |
| 25 | v2로 | G1 결정 대장 [USER·위임] — 루프 노드 세션은 원격 자격이 없는 환경이라 `mergeDeny`는 겹의 하나이고, 남은 꼴은 판독 재설계와 함께 다룬다. |
| 26 | 고침(M11 goal 5) | 병합 카드의 브라우저 e2e를 더했다 — `DASHBOARD_E2E=1`일 때 설치된 Edge(창 없음)로 펼친 diff가 새 스냅샷·시계 다시 칠하기에도 남는지, GitHub diff 링크를 누르면 본 것으로 세는지, 게이트가 그때만 열리는지 본다. 서버 쪽 병합(`prService`·`confirm`·`mergeFn`)은 가짜다(`99_Others/Dashboard/test/m11-g5-e2e.test.mjs:45`, `c98b20a1`). |
| 27 | 고침(M11 goal 5) | 보낸 뒤 결과 줄이 있으면 「이미 병합을 요청했어요」 이유 줄을 빼 한 줄만 남긴다(`99_Others/Dashboard/public/app.js:896`, `20329d6f`). 시험 `[M11-G5 M07-27]`. |
| 28 | 일부 고침(M11 goal 7) | `readme-links.test.mjs`가 루트 README와 현황판 README(그 폴더를 뿌리로)의 실물 링크를 검사한다(RL-28·29, `88394dac`). 현황판 `docs/*.md`는 검사 스크립트가 `README.md`만 읽어 그 스크립트를 고쳐야 본다 — M11 Backlog 62. AMSI 관찰은 할 일 없는 기록이다. |
| 29 | 해결됨 | PR을 만든 세션이 병합을 뒤에서 감시한다(`99_Others/Dashboard/wait-merge.mjs`, `da219603`). |
| 30 | 해결됨 | 현황판이 열린 PR 목록을 보인다(`4c49a98b`). |
| 31 | 해결됨 | 넣기 직전 Orca 목록으로 메인 터미널을 찾는다(`99_Others/Dashboard/lib/deliver.mjs:64`, `53f5c91b`). |
| 32 | 고침(M11 goal 5) | goal의 병합 대기 PR 번호가 바뀌면 PR 목록을 다시 읽고, 「목록 새로 읽기」·「다시 읽기」는 읽는 동안 끄지 않고 `aria-disabled`로 알려 키보드 초점이 남는다(`99_Others/Dashboard/public/app.js:911,988`, `20329d6f`). 시험 `[M11-G5 M07-32]`. |
| 33 | 고침(M11 goal 7) | `SOURCE_EXTS`에서 `.css`를 뺐다 — 스타일 편집은 시험이 이끄는 편집이 아니다(CS-01). 현황판 `public/*.js`는 소스로 두고, 현황판 `node --test`의 실패 0 요약이 카운터를 푼다(GE-13, `3aa38815`). CSS 편집은 카운터에만 들지 않고 전체 Green 증거는 여전히 실효시킨다(CS-02, `1443e129`). |
| 34 | v2로 | M11 스펙 결정 대장 [USER] 2회차 — 두 표 일원화는 가드 재설계와 함께 「이번엔 안 한다」. |
| 35 | 고침(M11 goal 5) | 후보가 있을 때 `orca worktree ps --json`(읽기 전용)을 한 번 더 읽어 `agents[].parentPaneKey`가 있는 pane(`tabId:leafId`)을 빼고, ps를 못 읽으면 예전대로 고른다. 성공 응답에 넣은 터미널 제목(`terminal`)을 싣고 화면의 「넣었어요」 줄이 그 제목을 보인다(`99_Others/Dashboard/lib/deliver.mjs:52,62`, `server.mjs:160`, `public/app.js:745`, `03d25f64`·`8e4116c0`). `answer.test.mjs`의 `canType` 소스 정규식은 지웠다(`c98b20a1`). worker·셸 pane의 실제 목록 모양은 실측하지 못했다. |
| 36 | 해결됨 | ADR-005와 바뀐 거부 사유(가드 `MERGE_HINT`, 앱 `mergeDeny.ts:17` `REASON`)와 `smoke.test.mjs:141-142` 단언이 있고 SessionStart 몫은 M08-4가 맡는다. |

1. CLI 세션의 에이전트가 Bash 경유(`node -e`, 스크립트)로 앱 데이터 폴더(`engines/`, `engine-config.json`)를 쓰는 길이 열려 있다. G1의 `Edit(~/AppData/Roaming/agentdeck/**)` 거부는 파일 도구와 Claude Code가 알아보는 Bash 파일 명령에만 걸린다. G8 `30_노드-구조.md` 보호 6의 나머지이고 맡을 goal이 아직 없다 (G1 검수 4).
2. 앱 데이터 폴더 이름 `agentdeck`은 실측이 아니라 Electron 기본 규칙(`productName ?? name`)에서 추론했다. 이 PC에는 아직 그 폴더가 없다. M08에서 설치본을 패키징할 때 `productName`이 생기면 거부 규칙을 갱신해야 한다. `settings-matcher.test.mjs`가 `package.json`에서 이름을 만들어 대조하므로 그때 빨갛게 된다 (G1 검수 2).
3. 가드 말고 다른 저장소 훅(편집 계획 게이트, TDD 가드, 마감 게이트)도 기본 `onFailure: 'continue'`라, 시간 초과나 기동 실패 때 판정 없이 지나간다. 훅마다 막힘이 맞는지는 다르다(마감 게이트가 막히면 세션을 못 끝낸다). 판정 장치 goal에서 훅별로 정한다 (G1 실측).
4. TDD 가드의 Green 채집은 도구 응답의 stdout만 읽는다. `npm test` 출력이 커서 저장 파일로 넘어가면(기본 리포터 약 140KB) 요약 줄이 잘려 「판정 불능」이 된다. 지금은 `npm test -- --silent --no-color --reporter=dot`로 피한다. `persistedOutputPath`를 읽게 할지는 판정 장치 goal에서 정한다 (G2 실측).
5. 앱 세션의 작업 폴더 밖 전면 쓰기 차단(`blockWritesOutsideWorkingDirectories`)은 켜지 않았다(G3 사용자 결정). 켜면 Second Brain 같은 다른 폴더와 `.claude/settings.json`도 파일 도구로 못 쓰고, `EnterWorktree`·`ExitWorktree`가 빠진다. 다시 볼 때는 컨트롤 패널의 켜고 끄는 노드로 두는 안이 있다 (G3).
6. 엔진 경로 잠금은 번들 SDK `0.3.325`에서만 실측했다. 앱은 major만 같으면 userData의 다른 엔진 버전을 불러온다(`engineVersions.ts` `loadActiveQuery`). 공개 타입상 `onFailure`를 모르는 옛 CLI는 실패한 훅을 통과시키고, 지원 확인을 하는 SDK는 세션을 거부한다. `//c/` 규칙 해석도 버전마다 다를 수 있다. 보호 5(엔진 교체 확인) goal에서 최소 버전 하한이나 교체 시 잠금 실측을 정한다 (G3 검수 1).
7. 엔진 경로 잠금에서 재지 않은 꼴이 남았다. 8.3 짧은 이름(`AGENTD~1`), `\\?\`·UNC 경로, junction·심볼릭 링크, 사용자 이름에 괄호가 든 경로(규칙 글자), 콜백 훅의 시간 초과가 실패로 치이는지, 하위 에이전트(`Agent`) 안의 거부, MCP 파일 쓰기 도구가 그것이다. 대문자 변형과 Edit 도구는 재서 거부를 봤다 (G3 검수).
8. 봉인이 `ok`가 아닐 때 엔진을 다시 고를 화면이 없다. 지금 `setActive`는 엔진 업데이트 알림에서만 불린다. 알림을 닫았던 사용자는 더 새 SDK가 나올 때까지 조용히 번들을 쓴다. 가장 작은 안은 `checkUpdate` 응답에 봉인 상태를 실어 알림을 다시 띄우는 것이다. 컨트롤 패널의 「바뀜 경고」와 함께 본다 (G4 검수 중요 1·B1).
9. `installVersion`은 버전 폴더를 비우지 않는다. 잠금 파일과 함께 미리 놓인 내용은 npm이 「up to date」로 남기고, 사용자의 업데이트 한 번이 그 내용을 봉인한다. 빈 임시 폴더에 설치한 뒤 옮기는 안이 있다 (G4 검수 사소 3, L1 범위).
10. (G5에서 닫힘 — 3글자 이상 접두+와일드카드를 막는다. `rm co*` 같은 더 짧은 접두는 저장소 명령 오탐 때문에 여전히 통과한다) 봉인 Bash 잠금은 `cd <폴더> && rm engine-s*` 꼴(폴더로 들어간 뒤 접두 와일드카드)을 통과시킨다. 경계에 맨 `/`를 넣거나 빈 접두를 막으면, 폴더 이름이 같은 저장소(AgentDeck) 작업 명령이 걸린다. L3 잠금의 한계로 두고, 다시 볼 때는 명령 해석 방식을 정한다 (G4 검수 사소 7).
11. 봉인의 남은 틈과 비용이 있다. SDK 형제 파일(`core-*.mjs` 등)은 내용 해시가 아니라 크기와 수정 시각으로만 본다. Node가 `engines/node_modules`와 `userData/node_modules`로 올라가며 찾는 길은 봉인 밖이다. 봉인과 설정 쓰기는 원자적이지 않다. 앱의 선택 한 번에 동기 걷기(0.4~0.8초)가 들고, 실행 시작마다 비동기 걷기 지연이 붙는다 (G4 검수 B2·B4·B5, 실측).
12. `ClaudeCodeBackend.version()`은 major 불일치나 로드 실패로 번들이 돌 때도 활성 버전을 보인다. `ipcContract.engine-install.test.ts`의 「타입 구조」 테스트는 스스로 만든 객체를 단정한다 (G4 검수 B3·B6, 기존 동작).
13. 노드의 판정 기록 칸(판정마다 시각·노드·입력 요약·결과·사유 한 줄)과 패널의 「최근 판정 수」가 없다. 기록의 거처(파일·메모리), 크기 상한, 입력 요약의 비밀 가리기를 정해야 한다. 노드 실패는 지금 main 로그에만 남는다 (G5 범위 밖).
14. 컨트롤 패널은 저장소 노드(`.claude/hooks/`·`.claude/settings.json`)를 보이지 않는다. 프로젝트마다 다르므로 패널이 작업 폴더를 알아야 하고, 토글은 잠근 채 「계획 단계로만 변경」을 보인다(설계 30) (G5 범위 밖).
15. 빈 임시 userData로 띄우는 실주행에서는 사용자 노드 설정이 없다. 설계 30의 설정 내보내기·가져오기는 아직 없다. 가져오기는 사람 확인(봉인)과 함께 해야 한다 (G5 범위 밖).
16. renderer는 `agent.run` 응답(실행 id)을 받기 전에 도착한 실행 이벤트를 버린다(`runCore.ts` runId 대조). 실행이 곧바로 오류를 내면 화면이 「생각 중」에 멈춘다. G5 리허설에서 드러났고, 컨트롤 거절은 요청 단계로 옮겨 피했다. SDK 로드 실패 같은 다른 즉시 오류도 같은 틈에 걸릴 수 있다. 요청 단계 오류 문장에 Electron 접두(`Error invoking remote method 'agent.run': Error:`)가 붙는 것도 함께 본다 (G5 실측). 요청 단계를 통과한 직후 `_prepareQuery` 전에 파일이 바뀌면, 실행 안 거절은 여전히 이 틈에 걸린다(창은 아주 좁다, G5 검수 사소 8).
17. `mode-auto-bypass-allow`를 꺼도 Bypass 모드(`bypassPermissions`), 설정 파일의 허용 규칙, SDK가 스스로 승인하는 명령(`echo` 실측)은 권한 콜백까지 오지 않을 수 있다. 공식 평가 순서상 그렇다는 추론이고, Bypass 모드는 실측하지 않았다. 패널 머리말에 한계를 적었다. 노드 이름을 「자동 모드는 허용」으로 좁힐지 실측 뒤 정한다 (G5 검수 중요 3).
18. 실행 안의 컨트롤 검사(`claudeAgentRun.ts` `controlsAtRunStart`)는 `getUserDataDir()`가 던지면 기본값(전부 켬)으로 연다. 지금은 앞선 `agent.run` 요청 단계 검사가 감싸지 않고 먼저 닫지만, 그 길을 거치지 않는 진입점이 생기면 조용히 열린다. Electron 밖 테스트 조건을 주입받게 바꾸는 안이 있다 (G5 검수 사소 5).
20. `.github/workflows/`는 헌법 3조 보호 표면 목록에 없다. PR이 워크플로나 `package.json` 스크립트를 고치면 필수 검사 `hard-gates`도 함께 바뀐다. 병합 버튼 goal(G8)은 보호 표면을 넓히는 결정이라 이 항목을 넣지 않았다. 지금은 사람이 병합 버튼을 누르기 전에 `.github/`·`package.json` scripts의 diff를 보는 것이 지킨다 (G6 검수 중요 1, G8에서 보류).
21. CI가 덜 하는 것: `npm test` 전체(기준선 차분 판정과 창 띄우는 테스트의 러너 의존 때문에 뺐다), 병합 뒤 `master` 자체의 검사(`push` 트리거 없음), 검사가 빨갛게 되는 것을 본 실측(지금 YAML에 `continue-on-error`는 없다), 액션의 커밋 SHA 고정과 Node 24 대상 메이저로 올리기(실행 로그에 Node 20 폐기 경고), `dependabot.yml`의 `github-actions` 생태계. `state-race.test.mjs`의 경합 테스트는 2코어 러너에서 흔들릴 수 있다(첫 실행은 통과) (G6 검수 사소 5~9).
22. `98_Management/00_ADR/ADR-003`(80~81행)과 `ADR-004`(23행)가 「병합 승인은 `gh pr merge`의 승인 다이얼로그」라는 옛 경로를 대체 표시 없이 적는다. G8로 헌법 10조가 바뀌었으니 superseded 표시나 새 ADR이 필요하다 (G8 검수 사소 9).
23. CLI 설정 `deny`는 글자 꼴만 맞춘다. `bash -c "gh pr merge …"`, `sudo gh …`, 다른 래퍼는 가드의 `ask`로 떨어지고, 권한 창을 생략하는 모드면 사람 없이 지나갈 수 있다. → 사용자 결정(2026-11-18 「OK 가드도 Deny」): 가드의 `gh-pr-merge`를 차단 목록으로 옮기고 병합 API·GraphQL 병합 호출 전용 차단 규칙을 둔다. 현황판 병합 버튼(G9) 다음 goal(G10)로 한다(사용자 결정 「3 현황판 버튼 먼저」). 반대로 `Bash(gh api *pulls/*/merge*)`는 본문에 `pulls/12/merge` 글자가 든 댓글 호출도 막는다 (G8 검수 중요 1·사소 8). → G12에서 가드 차단으로 처리했다(설정 `deny`의 넓은 꼴은 그대로).
24. PR 카드의 필수 검사 판정은 브랜치 보호의 `required_status_checks`만 읽는다. ruleset으로만 필수 검사를 거는 저장소에서는 「보호가 없어 필수 검사가 없어요」로 틀리게 안내한다 (G8 검수 사소 2). 하위 에이전트 대화 보기의 `gh pr create`와 「이미 있음」 오류로 끝난 `gh pr create`에는 카드가 뜨지 않는다 (G8 구현 중 발견).
25. 잠금 노드 `merge-deny`가 읽지 못하는 꼴: `env -S "gh pr merge …"`(나눈 문자열), `powershell -EncodedCommand`(base64), gh 별칭, `--input` 파일, `-F query=@file`. `cmd /c`·`-Command`의 낱말을 다시 이을 때 안쪽 따옴표가 사라져 `cmd /c echo "a && gh pr merge 1"`을 과하게 막는다. L3 한계다 (G8 검수 반영 중 발견).
26. 현황판 병합 카드의 브라우저 수준 e2e가 없다(펼침 상태가 다시 그리기에도 남는지, GitHub 링크 열기가 본 것으로 세어지는지, 게이트). G9는 Orca 브라우저 실측 한 번과 소스 단정으로 갈음했다. 카드는 PR URL을 받지 않고 번호만 받는다 (G9 구현 중 발견).
27. 현황판 병합 카드는 확인 창이 닫힌 뒤 「이미 병합을 요청했어요」와 「확인 창에서 병합하지 않았어요」를 함께 보여 같은 뜻이 두 줄로 겹친다(요청은 한 번). 콘솔 없이 분리 실행한 서버에서도 확인 창이 보이는지는 PR 75의 실제 병합으로 확인됐다 (G9 실측).
29. 병합이 끝나도 메인 세션에는 아무 신호가 가지 않는다. 사용자가 「병합 완료」를 따로 말해야 종결 기록이 시작된다. 현황판 병합 성공 때 결정 응답처럼 메인 터미널에 한 줄(PR 번호·병합 커밋)을 넣거나, 세션 쪽이 병합을 감지하는 길이 필요하다 (사용자 제안 2026-11-18, PR 75 병합 직후).
30. 현황판 병합 카드는 PR을 하나씩만 보인다. 열린 PR 여러 개를 목록으로 보이고, 3개를 넘으면 스크롤로 보게 한다. 각 PR의 꼭 볼 것·검사·병합 버튼은 지금 카드 규칙을 따른다 (사용자 제안 2026-11-18, PR 76 병합 직후). → G11로 연다.
31. 현황판 `config.local.json`의 `mainTerminalHandle`은 세션을 새로 열 때마다 손으로 고쳐야 한다. 낡으면 결정 응답 넣기가 「메인 입력창에 넣지 못했어요」로 실패한다(2026-11-18 실제 발생, 손으로 고침). 같은 worktree의 Claude 터미널을 `orca terminal list`로 찾거나, 세션 시작 때 handle을 알려 주는 길이 필요하다 (G11 착수 중 발견). → G13에서 넣기 직전 Orca 목록으로 찾게 했다.
32. 현황판 PR 목록은 처음 그릴 때, 「목록 새로 읽기」, 병합 결과 뒤에만 다시 읽는다. goal의 병합 대기 PR 번호가 바뀌어도 저절로 다시 읽지 않는다. 「목록 새로 읽기」·「다시 읽기」는 읽는 동안 꺼져 키보드 초점이 페이지로 떨어진다 (G11 구현 중 발견).
34. 위험 명령 가드가 읽지 못하는 병합 꼴이 남는다: gh 별칭(`gh alias set m 'pr merge'` 뒤 `gh m 12`), `cmd /c`·`powershell -c`, `node -e`·`python -c` 안 코드, 스크립트 파일, 변수·명령 치환, `eval "…"` 한 덩어리 문자열, `2>&1` 뒤의 끝점, `-F query=@파일`(이 둘은 묻기). `gh pr create --body-file - <<EOF` 본문은 면제가 아니라 본문 줄 머리의 병합 한 줄이 차단된다(루프는 `--body "$(cat <<'EOF' …)"` 꼴을 쓴다). `gh api …/pulls/N/merge -X GET -f x=1`은 실제 GET인데 차단이다. 가드의 래퍼·제어 낱말 표는 G12 검수 반영에서 앱 잠금 노드 `mergeDeny.ts`의 표를 옮겼다 — 두 표를 한 곳에서 기르는 길이 필요하다 (G12 구현·검수 중 발견).
35. 현황판 메인 터미널 찾기는 같은 폴더의 Claude 터미널이 하나면 그것에 넣는다. 메인이 닫힌 뒤 orchestration worker 하나만 남으면 worker에 들어간다 — `orca worktree ps --json`의 `agents[].parentPaneKey`로 worker를 빼고, 성공 응답에 고른 터미널 제목을 싣는 길이 있다. worker pane·Claude를 끝낸 셸 pane이 목록에서 어떻게 보이는지는 실측하지 못했다. `answer.test.mjs`의 `canType` 소스 정규식 시험은 동작 시험과 겹친다(Backlog 71 계열) (G13 검수 중요 3·사소에서 발견).
36. (M08 G2에서 처리 — ADR-005, `MERGE_HINT`·`mergeDeny.ts` 거부 사유, `smoke.test.mjs` 단언. SessionStart 몫은 M08 Backlog 4로 넘김) 병합 경계를 마일스톤 단위로 옮긴 결정(G14)이 ADR-003(goal마다 병합만 승인)을 대체하는데 새 ADR이 없다. M08에서 장치가 들어올 때 ADR로 남길지 정한다. `10_start-brief.cjs`의 감시 안내는 「현재 goal이 PR N의 병합을 기다린다」로 시작해 마일스톤 PR에도 goal이라 부르고, 효력 날 뒤에 틀리게 되는 거부 사유 글이 둘 있다 — 가드 `dangerous-cmd-guard.mjs`의 `MERGE_HINT`(「병합은 사람이 합니다」)와 앱 `02_Project/00_Source/main/04_Claude/permission/mergeDeny.ts`(「병합은 사용자에게 맡기세요」). `smoke.test.mjs:140`의 감시 줄 시험은 `includes('다음 goal')`만 봐서 옛 뜻과 새 뜻을 가리지 못한다 — 「마일스톤 PR이면」「멈춘다」를 단언해야 한다. SessionStart는 planPath와 pin만 읽고 마일스톤 스펙을 읽지 않는다 (G14 구현·검수 중 발견, M08에서).
33. TDD 가드가 현황판 `public/*.js`·`styles.css`를 소스로 세어, 실패 시험이 이미 있는 goal 안에서도 CSS만 고치는 연속 편집을 셋째에서 막는다 (G11 구현 중 발견).
28. `.claude/hooks/readme-links.test.mjs`는 루트 README만 본다. `99_Others/Dashboard/README.md`·`docs/`의 링크는 검사 밖이다. `orca computer`(화면 자동화)는 이 PC에서 백신 검사(AMSI)에 막혀 PowerShell UI Automation 읽기로 대신했다 (G9 실측).
19. (사용자 결정 2026-11-18 「막는다」 — G7로 연다) 「처음 설정함」 표시도 L1이다. 세 파일을 함께 지우면 첫 실행으로 보인다. 표시를 앱 밖 저장소(레지스트리 등)에 둘지는 L1 수용 여부와 함께 본다 (G5 검수 차단 1 반영 뒤 남은 몫).
