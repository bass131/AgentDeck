# M13 G1 — 패키징과 설치 · NSIS 설치 파일과 이 PC 설치 실측

- 마일스톤: M13 (마일스톤 스펙 `01_Milestones/M13_Installer/00_마일스톤-스펙.md`) · 작성: 2026-11-21 · 상태: 실행 중 · 검증 강도: 강(판정 장치 `package.json` `scripts` 변경, 새 의존성)
- 작업 브랜치: `feat/m13-g1-packaging` · 기준 브랜치: `milestone/m13-installer`(`186ccace`, M12 마일스톤 PR 125 머리)

## 목표

electron-builder로 Windows NSIS 설치 파일 하나를 만들고, 그 설치 파일로 이 PC에 깐 앱이 개발 서버 없이 뜨며 저장소 작업 트리 밖의 설치 폴더에서 돈다. 화면의 버전 표시가 앱 버전이다.

## 범위

- **만들 것**
  - electron-builder 설정 — NSIS 대상 하나, `productName` `AgentDeck`, 앱 ID, 아이콘이 있으면 그것, 게시 설정 없음(게시는 사람 몫). SDK의 네이티브 실행 파일처럼 asar 밖에 있어야 할 것은 풀어 둔다.
  - `package.json` — 의존성 `electron-builder`(dev)·`zod`(M10 Backlog 10), 설치본 빌드 명령 `scripts`의 `dist:win` 하나(판정 장치, 스펙 「건드릴 곳」).
  - 앱 데이터 폴더 — 설치본이 `%APPDATA%\agentdeck`을 쓴다. 표시 이름 `AgentDeck`은 electron-builder 설정에만 두어 앱 이름이 `package.json` `name`으로 남게 한다(M07 Backlog 2, 결정 대장 정정 줄).
  - 버전 표시 — 빌드본이 Electron 버전(`42.4.1`) 대신 앱 버전을 보인다(M06 Backlog 6).
  - 실측 — 설치 파일을 빌드하고, 이 PC에 조용히 설치(NSIS `/S`)하고, 설치 폴더의 실행 파일을 띄워 창·버전·앱 데이터 폴더를 확인하고, 제거한다. 창은 2번 모니터.
  - 시험 — 버전 표시와 앱 데이터 폴더 고정의 단위 시험.
- **건드릴 곳**: `package.json`(의존성, 빌드 설정 참조, `scripts`의 `dist:win` — 판정 장치), `package-lock.json`, electron-builder 설정 파일(저장소 뿌리), `.gitignore`(빌드 산출물), `02_Project/00_Source/`, `02_Project/01_TestCode/`, `01_Milestones/M13_Installer/`, 판정 장치 `98_Management/01_GateState/gate-config.json`(`planPath`·`workPinPath` 전환, 1단계).
- **하지 않을 것**
  - `package.json` 최상위 `productName`(판정 장치 시험 `settings-matcher`가 그 값으로 `.claude/settings.json`의 거부 규칙을 대조한다 — 건드릴 곳 밖).
  - 게시자 서명, 자동 업데이트(goal 4), GitHub 인증(goal 2), Release 게시, `electron-updater` 추가(goal 4).
  - `.claude/`·두 헌법·`.github/workflows/` 변경.
- **완료조건**
  - `npm run dist:win`이 NSIS 설치 파일(`.exe`) 하나를 만든다(실측).
  - 그 설치 파일로 이 PC에 깐 앱이 개발 서버 없이 창을 띄우고, 실행 경로가 저장소 작업 트리 밖이며, 화면의 버전 표시가 `package.json` 버전이고, 앱 데이터 폴더가 `%APPDATA%\agentdeck`이다(실측, 캡처). 제거도 된다.
  - 시험이 버전 표시와 앱 데이터 폴더 이름의 조건(`productName` 없음, 표시 이름은 빌드 설정에만)을 묶는다.
  - 하드 게이트 다섯 종 통과, `npm test` 실패 0.

## Phase 1 — 패키징과 설치 · 태그: `release` · 의존: 없음

진척 단계

- [x] 1. goal 준비 — 이 문서, M13 pin, `gate-config.json` `planPath`·`workPinPath` 전환(판정 장치)
- [x] 2. 구현 — electron-builder 설정, 의존성, `dist:win`, 앱 데이터 폴더 고정, 버전 표시, 시험
- [x] 3. 설치 실측 — 빌드, 조용히 설치, 띄우기·확인·캡처, 제거
- [x] 4. 하드 게이트 다섯 종, `npm test`
- [>] 5. 독립 검수와 반영
- [ ] 6. goal PR, `hard-gates`, 로컬 goal 병합

실행 단계 일괄 승인 대상 (스펙에서 옮김)

- `npm install`로 `electron-builder`·`zod` 추가, 설치 파일 로컬 빌드, 이 PC에 설치·제거, 앱 빌드본 기동과 e2e(창은 2번 모니터).
- vitest, 하드 게이트 다섯 종, `npm test`, 작업·독립 검수 하위 에이전트, 커밋, 작업 브랜치와 마일스톤 브랜치 push, `gh pr create`, 로컬 `git merge --no-ff`.

DoD

- 완료조건 네 줄이 검증 기록 `PASS` 줄로 있다.
- 범위 밖 발견은 `99_Backlog.md`에 한 줄로 있다.

검증 기록

- PASS 2026-11-21T23:08:36+09:00 — 설치 실측: `electron-builder --win nsis`가 NSIS `AgentDeck-Setup-0.1.0.exe`(250,175,950바이트)를 만들었다(저장소 안 `release/` 출력은 `.asar` 잠김 EBUSY로 두 번 실패, 저장소 밖 출력 폴더로 통과 — Backlog 4). 이 PC에 설치하니 `%LOCALAPPDATA%\Programs\agentdeck`에 깔렸다. 설치본을 앱 데이터 인자 없이 띄운 확인 e2e(`m13-g1-installed.e2e.ts`, 2번 모니터)가 `isPackaged` true, 앱 이름 `agentdeck`, `app.getVersion()` 0.1.0, 화면 버전 표시 0.1.0, 실행 경로 `...\Programs\agentdeck\AgentDeck.exe`(작업 트리 밖), 앱 데이터 `%APPDATA%\agentdeck`, 화면 주소 `file:///...app.asar/out/renderer/index.html`(개발 서버 없음)을 읽었다. 캡처는 세션 임시 폴더 `m13-g1-out\installed-window.png`. 제거 프로그램을 조용히 돌려 설치 폴더와 제거 등록 항목이 사라졌다. 예외: Git Bash가 `/S`를 `S:/`로 바꿔 첫 설치는 보통 설치로 돌아 앱이 저절로 떴고(단일 인스턴스 잠금으로 확인 e2e가 처음 두 번 꺼짐, 그 인스턴스를 강제 종료), 첫 제거는 확인 창에서 기다렸다(그 창을 닫고 `MSYS_NO_PATHCONV=1`로 다시 — Backlog 5).
- PASS 2026-11-21T23:08:36+09:00 — 구현 뒤(`a30f502b`) 하드 게이트 다섯 종이 모두 0이고 `npm test`가 490 passed·6 skipped(496 파일), 9403 passed·10 skipped·실패 0이다. 시험 — `appVersion.test.ts`(버전 표시가 `package.json` 버전이고 Electron 버전이 아님), `userDataPin.test.ts`(`productName` 없음, 표시 이름은 빌드 설정에만).
- FAIL 2026-11-21T23:22:32+09:00 — (독립 검수 지적으로 뒤늦게 적는 줄, 실제 시각 22:56) 커밋 뒤 트리에서 `npm run dist:win`이 `EBUSY: unlink release\win-unpacked\resources\app.asar`로 실패했다. 22:38 첫 빌드(커밋 전 트리, 통과)가 남긴 산출물을 재빌드가 지우지 못했다. 시도: 같은 명령 재실행(아래 줄).
- FAIL 2026-11-21T23:22:32+09:00 — (실제 시각 23:00) 같은 명령이 `EBUSY: unlink release\win-unpacked.tmp\resources\default_app.asar`로 다시 실패했다. 둘째 시도가 남긴 산출물이다. 시도: 출력 폴더를 저장소 밖으로 돌린 `electron-builder` 직접 실행(통과, 설치 실측에 씀) — 완료조건 1의 명령과 다르므로 위 PASS 줄의 「`npm run dist:win`」 증거로는 무효다. 다음 시도는 남은 `release/` 산출물을 치운 뒤 같은 명령 그대로다.
- FAIL 2026-11-21T23:30:56+09:00 — 독립 검수 반영 뒤 설치본 확인 e2e 둘이 실패했다. 빌드 출력을 저장소 밖으로 옮긴 뒤 `npm run dist:win`은 빌드와 재빌드 모두 통과했고(23:26·23:28), `MSYS_NO_PATHCONV=1`로 한 조용한 설치도 앱을 띄우지 않고 끝났다. A(버전·앱 데이터 폴더)는 소개 화면 「건너뛰기」 버튼이 애니메이션으로 「안정」 조건을 못 채워 클릭이 30초 시간 초과로 끝났다(시험 결함). B(실제 엔진 턴)는 앱 결함을 드러냈다 — SDK가 `...\resources\app.asar\node_modules\@anthropic-ai\claude-agent-sdk-win32-x64\claude.exe`를 띄우려다 실패했다(「exists but failed to launch … Specify a matching binary with options.pathToClaudeCodeExecutable」). 실행 파일은 `app.asar.unpacked`에 풀려 있지만 SDK는 asar 안 경로를 쓴다. 시도: 이 실행이 첫 시도다. 고칠 길은 패키징본에서 `pathToClaudeCodeExecutable`을 `app.asar.unpacked` 경로로 넘기는 것이다(엔진 버전 폴더의 SDK와 얽힘은 확인 필요).
- USER-INPUT 2026-11-21T23:30:56+09:00 — 마지막 USER-INPUT 뒤 FAIL이 세 번이라 헌법 7조로 멈춘다. 앞 둘은 빌드 환경(저장소 안 `.asar` 잠김)이고 출력 폴더 이동으로 풀렸다. 셋째는 설치본에서 SDK 실행 파일 경로가 asar 안을 가리키는 앱 결함과 소개 화면 클릭 시험 결함이다. 사용자 판단을 기다린다: 이 goal 안에서 `pathToClaudeCodeExecutable` 경로 수정과 시험 수정으로 이어 갈지.
- FAIL 2026-11-21T23:55:21+09:00 — 경로 수정(`queryFn.ts` `bundledClaudeExecutable`·`withClaudeExecutable`, 시험 3) 뒤 `npm run dist:win`(23:53)·조용한 설치·확인 e2e: B(실제 엔진 턴)는 통과했다 — 설치본이 Haiku 5.5로 `ok`를 답했다. A는 소개 화면 「건너뛰기」를 `force` 클릭했지만 등장 애니메이션 중 좌표가 빗나가 버튼이 사라지지 않았다(10초 시간 초과, 시험 결함). 시도: 클릭 이벤트를 버튼에 직접 보낸다(`dispatchEvent('click')`, React `onClick`=`onClose`).
- PASS 2026-11-21T23:56:11+09:00 — 완료조건 1·2 실측: `npm run dist:win`이 저장소 밖 `C:\Dev\AgentDeck-release\AgentDeck-Setup-0.1.0.exe`(250,176,417바이트, 23:53)를 만들었고 재빌드도 통과했다(23:26·23:28·23:53). `MSYS_NO_PATHCONV=1`로 조용히 설치하니 앱이 저절로 뜨지 않았다. 확인 e2e A가 통과 — `isPackaged` true, 앱 이름 `agentdeck`, 앱 데이터 `%APPDATA%\agentdeck`, 화면 사이드바 버전 `AgentDeck 0.1.0`(캡처 `m13-g1-out\installed-window.png`, 소개 화면을 닫은 뒤), 실행 경로 `%LOCALAPPDATA%\Programs\agentdeck\AgentDeck.exe`(작업 트리 밖), 화면 주소 `file:///...app.asar/out/renderer/index.html`. e2e B가 통과(23:55) — 격리 앱 데이터의 설치본이 실제 엔진 턴에서 Haiku 5.5로 `ok`를 답했다(캡처 `installed-turn.png`). 조용히 제거하니 설치 폴더와 제거 등록 항목이 사라졌다.
- PASS 2026-11-22T00:03:16+09:00 — 경로 수정과 시험 보강 뒤 하드 게이트 다섯 종이 모두 0이고 `npm test`가 490 passed·6 skipped(496 파일), 9406 passed·10 skipped·실패 0이다. 시험 — `queryFn.test.ts`(패키징본 실행 파일 경로, 호출자 값 보존), `userDataPin.test.ts`(`package.json` `build` 키·`dist:win`의 `extraMetadata` 없음까지), `appVersion.test.ts`.

## 결정 대장

- [USER·위임] `productName`은 electron-builder 설정에만 두고, 앱 데이터 폴더는 코드에서 `agentdeck`으로 고정한다 — `package.json` 최상위에 두면 판정 장치 시험 `settings-matcher.test.mjs`가 `Roaming/AgentDeck` 거부 규칙을 요구해 `.claude/settings.json`을 고쳐야 하는데, 그 파일은 스펙 「건드릴 곳」에 없다(헌법 3조·11조). 폴더를 고정하면 개발 실행본과 설치본이 같은 앱 데이터를 쓰고 거부 규칙도 실제 폴더와 맞는다. 근거: 성향 37(범위는 절차로 바꾼다), 성향 25. (2026-11-21)

- [AI] 정정 — 코드 고정은 판정 장치 시험 `settings-matcher.test.mjs`(172–174행)가 main 소스의 `setPath('userData'`·`app.setName(`를 금지해 쓸 수 없다(작업 하위 에이전트가 빨강으로 발견, 커밋 0에서 멈춤). 패키징된 `app.asar`의 `package.json`에 `productName`이 없고 `name`이 `agentdeck`이라(실측), 설치본의 앱 이름과 앱 데이터 폴더는 코드 없이 `agentdeck`이다. 그래서 고정 코드를 빼고, 시험은 「`package.json`에 `productName` 없음, 표시 이름은 electron-builder 설정에만」을 묶는다. 실제 폴더는 설치 실측으로 확인한다. 정규식만 피하는 꼴은 판정 장치를 속이는 것이라 쓰지 않는다. (2026-11-21)

- [AI] 설치본 빌드 출력은 저장소 밖 `..\AgentDeck-release`(`C:\Dev\AgentDeck-release`)로 둔다 — 저장소 안 `release/`에 남은 `.asar` 두 개가 빌드 프로세스가 모두 끝난 40분 뒤에도 잠겨 있었다(읽기 전용 열기 시험). 저장소를 감시하는 상주 Electron 프로세스(Orca의 파일 감시)가 `.asar`를 압축 파일로 열어 쥔 것으로 보이며, 저장소 밖 출력으로는 같은 빌드가 통과했다. 호스트인 Orca는 끄지 않는다. 남은 `release/` 산출물은 가드가 `rm -rf`를 막아 그대로 두고(git 무시 대상), 사용자가 치울 수 있다. 근거: 성향 26(실패 원인을 방법과 실행으로 구분). (2026-11-21)

- [USER] 「이어 가줘」 (2026-11-21, FAIL 셋 뒤 USER-INPUT에 대한 답) — 이 goal 안에서 설치본의 SDK 실행 파일 경로 수정과 소개 화면 클릭 시험 수정으로 이어 간다. FAIL 계수는 이 답으로 다시 0부터 센다.
- [AI] 경로 수정은 번들 SDK를 쓰는 길(`queryFn.ts` 폴백)에만 건다 — 패키징본이면 `process.resourcesPath\app.asar.unpacked\node_modules\@anthropic-ai\claude-agent-sdk-<플랫폼>-<아키텍처>\claude(.exe)`를 `pathToClaudeCodeExecutable`로 넘기고, 호출자가 이미 준 값은 덮지 않는다. 앱 데이터의 엔진 버전(`loadActiveQuery`)은 asar 밖에 깔리므로 건드리지 않는다. `mainChatTools.ts`의 번들 SDK import는 도구 서버만 만들고 실행 파일을 띄우지 않는다. (2026-11-21)

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
