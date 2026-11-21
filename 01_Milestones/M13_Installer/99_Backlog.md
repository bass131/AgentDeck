# M13 Backlog

M13 진행 중 범위 밖으로 발견한 것을 한 줄씩 남긴다. 새 줄은 위에 쌓는다.

6. (M13 G1) 첫 실행 소개 화면(`WhatsNew.tsx` 44·54행)과 프로필(`Profile.tsx` 93행)이 `v1.0`을 글자로 박아 둔다 — 설치본 0.1.0에서도 「Introducing — v1.0」이 보인다. 첫 실행 안내(goal 3)나 릴리스 후보(goal 5)에서 앱 버전과 맞출 후보.
5. (M13 G1) Git Bash에서 NSIS 인자 `/S`가 경로 `S:/`로 바뀌어 조용한 설치·제거가 보통 설치·확인 창으로 돈다 — 실측에서 설치 뒤 앱이 저절로 떴고 제거는 확인 창에서 기다렸다. `MSYS_NO_PATHCONV=1`로 피했다. 설치 실측을 자동화하는 스크립트(goal 4·6)는 이를 반영해야 한다.
4. (M13 G1) 저장소 안 `release/`로 빌드하면 `win-unpacked`의 `.asar`가 잠겨(EBUSY) 두 번 실패했다 — 저장소 밖 출력 폴더(`--config.directories.output`)로는 통과했다. 잠근 주체(감시·백신)는 확인하지 않았다.
3. (M13 G1) 설치본과 `npm run dev`·`start`(`electron .`)는 앱 이름 `agentdeck`으로 같은 앱 데이터 폴더와 단일 인스턴스 잠금을 나눠 쓴다 — 한쪽이 떠 있으면 다른 쪽은 바로 꺼진다. 맨 `electron out/main/index.js` 실행은 앱 이름이 `Electron`이라 `%APPDATA%\Electron`을 쓴다(e2e는 `--user-data-dir`를 준다). 코드 고정은 판정 장치 시험(`settings-matcher` 172–174행)이 금지한다.
2. (M13 G1) `typescript`가 devDependency라 설치본에 실리지 않는다 — 설치본의 TS LSP(`typescript-language-server`)가 열린 프로젝트에 typescript가 없으면 tsserver를 못 찾을 수 있다(확인 안 된 추정).
1. (M13 G1) 렌더러 전용 패키지(react, codemirror, react-markdown 등)가 `dependencies`에 있어 렌더러 번들과 별도로 설치본 `node_modules`에도 실린다 — 설치본 크기만 늘린다. 후보: 렌더러 전용 패키지를 devDependencies로 옮기고 설치본 크기를 비교.

