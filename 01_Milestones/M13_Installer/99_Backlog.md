# M13 Backlog

M13 진행 중 범위 밖으로 발견한 것을 한 줄씩 남긴다. 새 줄은 위에 쌓는다.

19. (M13 G3) 시작하기 안내의 Claude 로그인 판정(`engineState.ts`)은 `homedir()/.claude/.credentials.json`과 `ANTHROPIC_API_KEY`를 읽는다 — `--user-data-dir` 격리나 `AGENTDECK_E2E=1`로는 바뀌지 않아 e2e에서는 그 PC의 실제 로그인이 보인다. 미인증 화면을 e2e로 보려면 자식 프로세스의 `USERPROFILE`을 빈 임시 폴더로 줘야 한다(미실측).
18. (M13 G3) 엔진 업데이트 확인(`engineCheckUpdate.ts`)에는 시간 제한이 없다 — 시작하기 안내는 그 완료를 기다리지 않고 뜨지만, 알림이 늦게 오면 그동안 안내가 가려졌다가 알림을 닫은 뒤 다시 보인다.
17. (M13 G3) 「첫 마일스톤」 단계의 신호는 루프 상태(`LoopStatus`)뿐이다 — 루프를 다시 열지 않은 프로젝트는 예전에 마일스톤을 돌렸어도 `closed`로 「할 일」이고, 앞서 끝난 실행은 `not-started`와 안내 한 줄(`notice`)로만 알아본다. main이 `.agentdeck/run-state.json` 유무를 읽기 전용으로 알려 주는 신호로 바꿀 후보.

16. (M13 G2 재검수) PR 카드의 gh(`prMerge.ts` `ghRunner`)는 `gh api <path>`를 `--hostname`·`-R` 없이 `process.env`로 부른다 — 사용자 환경에 `GH_HOST=acme.ghe.com`이 있으면 앱 토큰이 그 호스트로 갈 수 있다(미실측). 호출에 `--hostname github.com`을 고정할 후보.
15. (M13 G2 검수) 앱 토큰을 무조건 우선하므로, 조직이 「OAuth App 접근 제한」을 켜 두면 개발 PC에서 앱을 연결하는 순간 그 조직 저장소의 PR 카드와 실행기 gh가 막힐 수 있다(예전에는 승인된 gh 로그인으로 돌았다). 미실측 추정 — goal 6 실측 때 본다.
14. (M13 G2) OAuth App 클라이언트 ID를 넣는 화면이 없다 — 지금은 `ui-prefs.json`의 `githubClientId`(렌더러의 `settings.setUiPref`로도 쓸 수 있다)뿐이다. 등록(goal 6) 뒤 설치본에 기본값을 싣는 길을 첫 실행 안내(goal 3)나 릴리스 후보(goal 5)에서 정할 후보.
13. (M13 G2) 앱 토큰 파일(`userData/github-auth.bin`)은 루프 잠금이 쓰기만 막고(저장소 밖 쓰기) 읽기는 막지 않는다 — `loopLock.ts`에 읽기 차단 규칙이 없다. 내용은 safeStorage(DPAPI) 암호문이지만 같은 OS 사용자 프로세스는 `Local State`의 키로 풀 수 있다(미실측 추정, childEnv 한계와 같은 부류).
12. (M13 G2) origin이 ssh 주소면 앱 토큰이 있어도 실행기 git은 사용자 ssh 키로 돈다 — 토큰 도우미는 `https://github.com` 원격에만 걸린다. 설치본만 쓰는 사람(goal 6)의 ssh origin 저장소는 push가 실패할 수 있다.
11. (M13 G2) Git 패널의 push·pull(`08_Git/git.ts` 320·328·341행)은 앱 토큰을 쓰지 않고 사용자 자격으로 돈다 — goal 2의 「건드릴 곳」 밖이다. 설치본만 쓰는 사람은 gh·GCM 로그인이 없으면 Git 패널 push가 실패할 수 있다.
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

