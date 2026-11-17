# M07 Backlog — 범위 밖 발견

goal 완료조건 밖에서 찾은 것을 한 줄씩 남긴다. 승인을 묻지 않는다. M06에서 넘어온 항목은 `M06_SelfDev/99_Backlog.md`가 계속 소유한다.

1. CLI 세션의 에이전트가 Bash 경유(`node -e`, 스크립트)로 앱 데이터 폴더(`engines/`, `engine-config.json`)를 쓰는 길이 열려 있다. G1의 `Edit(~/AppData/Roaming/agentdeck/**)` 거부는 파일 도구와 Claude Code가 알아보는 Bash 파일 명령에만 걸린다. G8 `30_노드-구조.md` 보호 6의 나머지이고 맡을 goal이 아직 없다 (G1 검수 4).
2. 앱 데이터 폴더 이름 `agentdeck`은 실측이 아니라 Electron 기본 규칙(`productName ?? name`)에서 추론했다. 이 PC에는 아직 그 폴더가 없다. M08에서 설치본을 패키징할 때 `productName`이 생기면 거부 규칙을 갱신해야 한다. `settings-matcher.test.mjs`가 `package.json`에서 이름을 만들어 대조하므로 그때 빨갛게 된다 (G1 검수 2).
3. 가드 말고 다른 저장소 훅(편집 계획 게이트, TDD 가드, 마감 게이트)도 기본 `onFailure: 'continue'`라, 시간 초과나 기동 실패 때 판정 없이 지나간다. 훅마다 막힘이 맞는지는 다르다(마감 게이트가 막히면 세션을 못 끝낸다). 판정 장치 goal에서 훅별로 정한다 (G1 실측).
4. TDD 가드의 Green 채집은 도구 응답의 stdout만 읽는다. `npm test` 출력이 커서 저장 파일로 넘어가면(기본 리포터 약 140KB) 요약 줄이 잘려 「판정 불능」이 된다. 지금은 `npm test -- --silent --no-color --reporter=dot`로 피한다. `persistedOutputPath`를 읽게 할지는 판정 장치 goal에서 정한다 (G2 실측).
5. 앱 세션의 작업 폴더 밖 전면 쓰기 차단(`blockWritesOutsideWorkingDirectories`)은 켜지 않았다(G3 사용자 결정). 켜면 Second Brain 같은 다른 폴더와 `.claude/settings.json`도 파일 도구로 못 쓰고, `EnterWorktree`·`ExitWorktree`가 빠진다. 다시 볼 때는 컨트롤 패널의 켜고 끄는 노드로 두는 안이 있다 (G3).
6. 엔진 경로 잠금은 번들 SDK `0.3.325`에서만 실측했다. 앱은 major만 같으면 userData의 다른 엔진 버전을 불러온다(`engineVersions.ts` `loadActiveQuery`). 공개 타입상 `onFailure`를 모르는 옛 CLI는 실패한 훅을 통과시키고, 지원 확인을 하는 SDK는 세션을 거부한다. `//c/` 규칙 해석도 버전마다 다를 수 있다. 보호 5(엔진 교체 확인) goal에서 최소 버전 하한이나 교체 시 잠금 실측을 정한다 (G3 검수 1).
7. 엔진 경로 잠금에서 재지 않은 꼴이 남았다. 8.3 짧은 이름(`AGENTD~1`), `\\?\`·UNC 경로, junction·심볼릭 링크, 사용자 이름에 괄호가 든 경로(규칙 글자), 콜백 훅의 시간 초과가 실패로 치이는지, 하위 에이전트(`Agent`) 안의 거부, MCP 파일 쓰기 도구가 그것이다. 대문자 변형과 Edit 도구는 재서 거부를 봤다 (G3 검수).
