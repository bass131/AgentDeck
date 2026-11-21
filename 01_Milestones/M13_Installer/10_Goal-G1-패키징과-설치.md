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

## 결정 대장

- [USER·위임] `productName`은 electron-builder 설정에만 두고, 앱 데이터 폴더는 코드에서 `agentdeck`으로 고정한다 — `package.json` 최상위에 두면 판정 장치 시험 `settings-matcher.test.mjs`가 `Roaming/AgentDeck` 거부 규칙을 요구해 `.claude/settings.json`을 고쳐야 하는데, 그 파일은 스펙 「건드릴 곳」에 없다(헌법 3조·11조). 폴더를 고정하면 개발 실행본과 설치본이 같은 앱 데이터를 쓰고 거부 규칙도 실제 폴더와 맞는다. 근거: 성향 37(범위는 절차로 바꾼다), 성향 25. (2026-11-21)

- [AI] 정정 — 코드 고정은 판정 장치 시험 `settings-matcher.test.mjs`(172–174행)가 main 소스의 `setPath('userData'`·`app.setName(`를 금지해 쓸 수 없다(작업 하위 에이전트가 빨강으로 발견, 커밋 0에서 멈춤). 패키징된 `app.asar`의 `package.json`에 `productName`이 없고 `name`이 `agentdeck`이라(실측), 설치본의 앱 이름과 앱 데이터 폴더는 코드 없이 `agentdeck`이다. 그래서 고정 코드를 빼고, 시험은 「`package.json`에 `productName` 없음, 표시 이름은 electron-builder 설정에만」을 묶는다. 실제 폴더는 설치 실측으로 확인한다. 정규식만 피하는 꼴은 판정 장치를 속이는 것이라 쓰지 않는다. (2026-11-21)

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
