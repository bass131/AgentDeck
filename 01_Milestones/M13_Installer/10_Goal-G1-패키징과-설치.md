# M13 G1 — 패키징과 설치 · NSIS 설치 파일과 이 PC 설치 실측

- 마일스톤: M13 (마일스톤 스펙 `01_Milestones/M13_Installer/00_마일스톤-스펙.md`) · 작성: 2026-11-21 · 상태: 실행 중 · 검증 강도: 강(판정 장치 `package.json` `scripts` 변경, 새 의존성)
- 작업 브랜치: `feat/m13-g1-packaging` · 기준 브랜치: `milestone/m13-installer`(`186ccace`, M12 마일스톤 PR 125 머리)

## 목표

electron-builder로 Windows NSIS 설치 파일 하나를 만들고, 그 설치 파일로 이 PC에 깐 앱이 개발 서버 없이 뜨며 저장소 작업 트리 밖의 설치 폴더에서 돈다. 화면의 버전 표시가 앱 버전이다.

## 범위

- **만들 것**
  - electron-builder 설정 — NSIS 대상 하나, `productName` `AgentDeck`, 앱 ID, 아이콘이 있으면 그것, 게시 설정 없음(게시는 사람 몫). SDK의 네이티브 실행 파일처럼 asar 밖에 있어야 할 것은 풀어 둔다.
  - `package.json` — 의존성 `electron-builder`(dev)·`zod`(M10 Backlog 10), 설치본 빌드 명령 `scripts`의 `dist:win` 하나(판정 장치, 스펙 「건드릴 곳」).
  - 앱 데이터 폴더 고정 — 설치본과 개발 실행본 모두 `%APPDATA%\agentdeck`을 쓴다. `productName`으로 폴더가 바뀌지 않게 코드에서 정한다(M07 Backlog 2).
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
  - 시험이 버전 표시와 앱 데이터 폴더 고정을 묶는다.
  - 하드 게이트 다섯 종 통과, `npm test` 실패 0.

## Phase 1 — 패키징과 설치 · 태그: `release` · 의존: 없음

진척 단계

- [x] 1. goal 준비 — 이 문서, M13 pin, `gate-config.json` `planPath`·`workPinPath` 전환(판정 장치)
- [ ] 2. 구현 — electron-builder 설정, 의존성, `dist:win`, 앱 데이터 폴더 고정, 버전 표시, 시험
- [ ] 3. 설치 실측 — 빌드, 조용히 설치, 띄우기·확인·캡처, 제거
- [ ] 4. 하드 게이트 다섯 종, `npm test`
- [ ] 5. 독립 검수와 반영
- [ ] 6. goal PR, `hard-gates`, 로컬 goal 병합

실행 단계 일괄 승인 대상 (스펙에서 옮김)

- `npm install`로 `electron-builder`·`zod` 추가, 설치 파일 로컬 빌드, 이 PC에 설치·제거, 앱 빌드본 기동과 e2e(창은 2번 모니터).
- vitest, 하드 게이트 다섯 종, `npm test`, 작업·독립 검수 하위 에이전트, 커밋, 작업 브랜치와 마일스톤 브랜치 push, `gh pr create`, 로컬 `git merge --no-ff`.

DoD

- 완료조건 네 줄이 검증 기록 `PASS` 줄로 있다.
- 범위 밖 발견은 `99_Backlog.md`에 한 줄로 있다.

검증 기록

- (기록 없음)

## 결정 대장

- [USER·위임] `productName`은 electron-builder 설정에만 두고, 앱 데이터 폴더는 코드에서 `agentdeck`으로 고정한다 — `package.json` 최상위에 두면 판정 장치 시험 `settings-matcher.test.mjs`가 `Roaming/AgentDeck` 거부 규칙을 요구해 `.claude/settings.json`을 고쳐야 하는데, 그 파일은 스펙 「건드릴 곳」에 없다(헌법 3조·11조). 폴더를 고정하면 개발 실행본과 설치본이 같은 앱 데이터를 쓰고 거부 규칙도 실제 폴더와 맞는다. 근거: 성향 37(범위는 절차로 바꾼다), 성향 25. (2026-11-21)

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
