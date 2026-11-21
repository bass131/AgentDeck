# M13 Backlog

M13 진행 중 범위 밖으로 발견한 것을 한 줄씩 남긴다. 새 줄은 위에 쌓는다.

10. (M13 G1 재검수) 빌드 출력 `../AgentDeck-release`는 프로젝트 폴더 기준 상대 경로다 — 워크트리(`.claude/worktrees/<id>`)에서 빌드하면 저장소 안으로 가고, goal 5가 `v0.2.0`·`v0.2.1`을 연달아 빌드하면 둘째가 `win-unpacked`·`latest.yml`을 덮어쓴다. goal 5에서 빌드 사이에 산출물을 옮겨 담는다.
9. (M13 G1 재검수) 설치 폴더 `%LOCALAPPDATA%\Programs\agentdeck\resources`(앱이 이제 명시적으로 띄우는 `claude.exe` 포함)는 사용자 권한으로 쓸 수 있는데, 엔진 경로 잠금(`enginePathLock.ts`)은 앱 데이터의 `engines`만 지킨다 — 설치본의 에이전트가 그 실행 파일을 고칠 수 있다(미실측 추정).
8. (M13 G1 검수) `appUserModel.ts`는 패키징본에서 AppUserModelID를 정하지 않는다 — Electron 알림 문서가 자동 설정을 말하는 것은 Squirrel 설치기뿐이라 NSIS 설치본의 Windows 알림(`notifyPort.ts`)이 안 뜨거나 이름이 어긋날 수 있다(미실측). 후보: 패키징본이면 `appId`(`com.bass131.agentdeck`)로 정한다.
7. (M13 G1) e2e 주입 길(`AGENTDECK_E2E_WORKSPACE`·`AGENTDECK_E2E_PICK_FOLDER` 등 환경변수)이 설치본에서도 켜진다 — 설치본 확인 e2e가 그 길로 돌았다. 환경변수를 줄 수 있는 쪽만 쓰는 길이지만, 배포본에서 끌지 정할 후보.
6. (M13 G1) 첫 실행 소개 화면(`WhatsNew.tsx` 44·54행)과 프로필(`Profile.tsx` 93행)이 `v1.0`을 글자로 박아 둔다 — 설치본 0.1.0에서도 「Introducing — v1.0」이 보인다. 첫 실행 안내(goal 3)나 릴리스 후보(goal 5)에서 앱 버전과 맞출 후보.
5. (M13 G1) Git Bash에서 NSIS 인자 `/S`가 경로 `S:/`로 바뀌어 조용한 설치·제거가 보통 설치·확인 창으로 돈다 — 실측에서 설치 뒤 앱이 저절로 떴고 제거는 확인 창에서 기다렸다. `MSYS_NO_PATHCONV=1`로 피했다. 설치 실측을 자동화하는 스크립트(goal 4·6)는 이를 반영해야 한다.
4. (M13 G1) 저장소 안 `release/`로 재빌드하면 앞 빌드가 남긴 `.asar`를 지우지 못해(EBUSY) 실패했다 — 남은 `.asar`가 빌드가 끝난 40분 뒤에도 잠겨 있었다(저장소를 감시하는 상주 Electron 프로세스로 추정, 주체 미확인). 빌드 출력을 저장소 밖 `..\AgentDeck-release`로 옮겨 풀었다. 저장소 안 옛 `release/`는 가드가 `rm -rf`를 막아 남아 있다(git 무시 대상, 사람이 치운다).
3. (M13 G1) 설치본과 `npm run dev`·`start`(`electron .`)는 앱 이름 `agentdeck`으로 같은 앱 데이터 폴더와 단일 인스턴스 잠금을 나눠 쓴다 — 한쪽이 떠 있으면 다른 쪽은 바로 꺼진다. 맨 `electron out/main/index.js` 실행은 앱 이름이 `Electron`이라 `%APPDATA%\Electron`을 쓴다(e2e는 `--user-data-dir`를 준다). 코드 고정은 판정 장치 시험(`settings-matcher` 172–174행)이 금지한다.
2. (M13 G1) `typescript`가 devDependency라 설치본에 실리지 않는다 — 설치본의 TS LSP(`typescript-language-server`)가 열린 프로젝트에 typescript가 없으면 tsserver를 못 찾을 수 있다(확인 안 된 추정).
1. (M13 G1) 렌더러 전용 패키지(react, codemirror, react-markdown 등)가 `dependencies`에 있어 렌더러 번들과 별도로 설치본 `node_modules`에도 실린다 — 설치본 크기만 늘린다. 후보: 렌더러 전용 패키지를 devDependencies로 옮기고 설치본 크기를 비교.

