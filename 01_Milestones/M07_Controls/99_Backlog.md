# M07 Backlog — 범위 밖 발견

goal 완료조건 밖에서 찾은 것을 한 줄씩 남긴다. 승인을 묻지 않는다. M06에서 넘어온 항목은 `M06_SelfDev/99_Backlog.md`가 계속 소유한다.

1. CLI 세션의 에이전트가 Bash 경유(`node -e`, 스크립트)로 앱 데이터 폴더(`engines/`, `engine-config.json`)를 쓰는 길이 열려 있다. G1의 `Edit(~/AppData/Roaming/agentdeck/**)` 거부는 파일 도구와 Claude Code가 알아보는 Bash 파일 명령에만 걸린다. G8 `30_노드-구조.md` 보호 6의 나머지이고 맡을 goal이 아직 없다 (G1 검수 4).
2. 앱 데이터 폴더 이름 `agentdeck`은 실측이 아니라 Electron 기본 규칙(`productName ?? name`)에서 추론했다. 이 PC에는 아직 그 폴더가 없다. M08에서 설치본을 패키징할 때 `productName`이 생기면 거부 규칙을 갱신해야 한다. `settings-matcher.test.mjs`가 `package.json`에서 이름을 만들어 대조하므로 그때 빨갛게 된다 (G1 검수 2).
3. 가드 말고 다른 저장소 훅(편집 계획 게이트, TDD 가드, 마감 게이트)도 기본 `onFailure: 'continue'`라, 시간 초과나 기동 실패 때 판정 없이 지나간다. 훅마다 막힘이 맞는지는 다르다(마감 게이트가 막히면 세션을 못 끝낸다). 판정 장치 goal에서 훅별로 정한다 (G1 실측).
