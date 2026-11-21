# M12 G1 — Taste·헌장 문서와 저장

- 마일스톤: M12 (마일스톤 스펙 `01_Milestones/M12_CharterTaste/00_마일스톤-스펙.md`) · 작성: 2026-11-21 · 상태: 실행 중 · 검증 강도: 강(앱 소스 50줄 이상, 세션 설정 원천 변경)
- 작업 브랜치: `feat/m12-g1-taste-store` · 기준 브랜치: `milestone/m12-charter-taste`(`6c31c299`, M11 마일스톤 PR 118 머리)

## 목표

전역 Taste·프로젝트 헌장·프로젝트 Taste가 사람이 읽는 마크다운의 고정된 꼴로 정해지고, 앱이 두 거처(전역은 앱 데이터 폴더, 프로젝트는 그 저장소의 `docs/agentdeck/`)에서 읽고 쓴다. 루프 세션(메인 대화와 작업 노드)은 사용자 전역 설정을 싣지 않고 Taste·헌장을 대신 싣는다.

## 범위

- **만들 것**
  - 문서 꼴과 공유 파서 — `shared/`에 순수 함수로 읽기(`parse`)·쓰기(`serialize`)·검사(`validate`)를 둔다. 읽고 다시 쓰면 같은 글이 나온다(왕복).
    - Taste 문서: 머리 `# 전역 Taste` 또는 `# 프로젝트 Taste`. 항목은 `## <ID> <제목>`(ID는 `T` + 숫자, 문서 안에서 겹치지 않음). 항목 아래에 `- 원칙: …`, `- 레퍼런스: …`(링크나 저장소 안 캡처 경로), `- 금지: …` 줄을 하나 이상 둔다. 같은 칸을 여러 줄 둘 수 있다.
    - 헌장 문서: 머리 `# 프로젝트 헌장`, 절 `## 목표`(문장 하나 이상)와 `## 하지 않을 것`(선택).
    - 검사: 칸이 하나도 없는 항목, 겹치는 ID, 모르는 칸 이름, 빈 목표를 문제 목록으로 돌려준다(던지지 않는다).
  - 저장 — main에 Taste·헌장 저장소 모듈. 전역 Taste는 앱 데이터 폴더의 `taste/global-taste.md`, 프로젝트 헌장·Taste는 작업 폴더의 `docs/agentdeck/헌장.md`·`Taste.md`. 쓰기는 기존 원자적 쓰기 도구로 한다. 없는 문서는 「없음」으로 읽는다(빈 문서와 구별). 커밋은 이 goal에서 하지 않는다(goal 2의 확정이 한다).
  - 읽기 IPC — renderer가 세 문서의 읽은 결과(구조·원문·검사 문제·없음 여부)를 받는 채널 하나. 쓰기 IPC는 goal 2가 문답 확정과 함께 만든다.
  - 세션 설정 원천 — 루프 세션(실행 요청에 `loopLock`이 있는 세션)은 `settingSources`에서 `user`를 빼고(`project`·`local`만), 시스템 프롬프트 덧붙임에 전역 Taste·프로젝트 헌장·프로젝트 Taste의 원문을 싣는다(있는 것만, 각각 머리 표지와 함께). 채팅 모드 세션은 지금 그대로 세 원천을 싣는다(M10 Backlog 11).
- **건드릴 곳**: `02_Project/00_Source/`(shared의 파서, main의 저장·IPC·`04_Claude/sdkOptions.ts`와 루프 세션 조립, preload·renderer의 IPC 타입), `02_Project/01_TestCode/`, `01_Milestones/M12_CharterTaste/`, `01_Milestones/M10_LoopView/99_Backlog.md`(닫힘 표 11행), 판정 장치 `98_Management/01_GateState/gate-config.json`(`planPath`·`workPinPath` 전환, 1단계).
- **하지 않을 것**: 문답·승인 카드·보기 화면(goal 2), 검수 노드의 Taste 판정(goal 3), 사용량 한도(goal 4), 헌장·Taste 문서의 커밋과 연습 저장소 실주행(goal 2·5), Second Brain 연동, 레퍼런스 이미지 대조. 채팅 모드의 설정 원천 변경. 훅·가드·CI·`package.json` `scripts`.
- **완료조건**
  - 파서 시험이 꼴마다(정상, 칸 없는 항목, 겹치는 ID, 모르는 칸, 헌장의 빈 목표) 검사 결과를 묶고, 정상 문서는 왕복이 같다.
  - 저장 시험이 임시 폴더에서 두 거처의 읽기·쓰기·없음을 묶는다.
  - 세션 옵션 시험이 루프 세션은 `settingSources`에 `user`가 없고 덧붙임에 Taste·헌장 원문이 있음을, 채팅 세션은 세 원천 그대로임을 묶는다.
  - 하드 게이트 다섯 종 통과, `npm test` 실패 0. M10 닫힘 표 11행이 `고침(M12 goal 1)`로 근거를 단다.

## Phase 1 — Taste·헌장 문서와 저장 · 태그: `feature` · 의존: 없음

진척 단계

- [x] 1. goal 준비 — 이 문서, M12 pin, `gate-config.json` `planPath`·`workPinPath` 전환(판정 장치)
- [x] 2. 기준선 — `npm test` 시험 수
- [x] 3. 공유 파서·검사와 시험
- [x] 4. main 저장 모듈과 읽기 IPC, 시험
- [x] 5. 루프 세션 설정 원천과 Taste·헌장 싣기, 시험
- [x] 6. 하드 게이트 다섯 종, `npm test`, 닫힘 표
- [>] 7. 독립 검수와 반영, goal PR, `hard-gates`, 로컬 goal 병합

실행 단계 일괄 승인 대상 (스펙에서 옮김)

- vitest·`node --test`, 하드 게이트 다섯 종, `npm test`, 작업·독립 검수 하위 에이전트, 커밋, 작업 브랜치와 마일스톤 브랜치 push, `gh pr create`, 로컬 `git merge --no-ff`.

DoD

- 완료조건 네 줄이 검증 기록 `PASS` 줄로 있다.
- 범위 밖 발견은 `99_Backlog.md`에 한 줄로 있다.

검증 기록

- PASS 2026-11-21T12:48:38+09:00 — 독립 검수(구현 문맥 없는 검수자, `10a0cc73..a281b41b`): 막는 결함 0, goal 2의 쓰기 전에 막을 것 셋과 사소 다섯. 반영(`a91d3669`·`b0ba568e`) — 쓰기는 줄바꿈·칸 이름의 쌍점·다시 읽어 구조가 달라지는 값을 `TasteWriteError`(`bad-input`)로 거절(`tasteStore.test.ts:172·184`), 문제가 있는 기존 문서는 덮어쓰지 않음(`existing-problems`, `:189`), 루프 덧붙임은 문서당 32 KiB 상한과 건너뜀 알림(`:249`), 칸 판독을 선형으로(`tasteDoc.test.ts:162`)·한 번 훑기(`:220`), URL의 쌍점 보존(`:135·146`), 코드 울타리는 문제(`:153`), 읽기·쓰기·싣기 모두 `createFsPort(root)`의 뿌리 안 확인(실제 junction 시험 `tasteStore.test.ts:143`), `ENOTDIR`은 그 문서만 없음(`:134`), `T1`·`T01` 겹침(`tasteDoc.test.ts:128`), `sdkOptions.ts:132` 주석은 코드가 하는 일만. 워커 보고 `npm test` 473 passed·6 skipped(479), Tests 9204 passed·10 skipped, 실패 0, 하드 게이트 다섯 종 통과. 메인이 taste 시험 5파일 50건 통과와 lint를 다시 돌려 확인했다.
- PASS 2026-11-21T12:31:25+09:00 — 실앱 확인(Backlog 2의 앞당김): `a281b41b` 빌드로 `m11-g4-work-mode-live.e2e.ts`(Haiku, 연습 앱 데이터)를 돌려 5 passed. 루프 세션인 메인 대화가 `user` 원천 없이 실제 모델 턴을 끝냈다 — Read 도구 한 번 뒤 README의 답 낱말 「pelican」을 답했다(메인이 `a-main-done.png`를 눈 확인). 작업 노드도 같은 `ClaudeAgentRun` 길이라 로그인 경로가 같다. 디스플레이는 하나(`displays: 1`)라 창은 주 모니터였다.
- PASS 2026-11-21T12:26:19+09:00 — 구현: 작업 하위 에이전트가 커밋 셋(`751a790f` 파서·저장소·읽기 IPC `taste.read`, `94328d64` 루프 세션 설정 원천과 문서 싣기, `a281b41b` 닫힘 표·Backlog). 파서 `shared/14_Taste/tasteDoc.ts`(시험 `tasteDoc.test.ts` — 정상 :45·:128, 왕복 :60·:135, 칸 없음 :76, 겹치는 ID :85, 모르는 칸 :93, 빈 목표 :143, 던지지 않음 :119·:160). 저장소 `main/13_Taste/tasteStore.ts`(시험 `tasteStore.test.ts` — 두 거처 :55, 없음 :61, 원자적 쓰기 :68·:80, 빈 파일은 없음이 아님 :95). 세션 옵션 `sdkOptions.taste.test.ts:25·32·43`, 실행 단계 `claudeAgentRun.taste.test.ts:46·58·64`. 하드 게이트 다섯 종 통과, `npm test` Test Files 473 passed·6 skipped(479), Tests 9190 passed·10 skipped, 실패 0(기준선보다 파일 5·시험 36 늘었다). M10 닫힘 표 11행 `고침(M12 goal 1)`. 워커 보고 기준이며 메인이 `git diff --name-only`로 범위 밖 변경 0을 확인했다.
- PASS 2026-11-21T12:01:05+09:00 — 기준선: M11 회귀 검증(`e0c98c9d` 위, 2026-11-21T11:51:49)의 `npm test` Test Files 468 passed·6 skipped(474), Tests 9154 passed·10 skipped(9164), 실패 0을 기준선으로 쓴다. `git diff --stat e0c98c9d 10a0cc73 -- 02_Project .claude 99_Others`가 비어 소스·시험·훅이 같다.

## 결정 대장

- [USER·위임] 문서 꼴은 사람이 읽는 마크다운에 고정된 머리·칸 줄을 쓰고, 공유 파서가 결정론적으로 읽는다. YAML·JSON을 쓰지 않는 것은 사람이 문서로 읽고 git diff로 감사하기 위해서다. 근거: 비전 「Taste는 사람이 읽기 좋은 스펙 문서로 쓴다」, 성향 2(문서가 먼저)·4(결정론적 검증)·30(셀 수 있는 기록). (2026-11-21)
- [USER·위임] 저장소 안 자리는 스펙 제안대로 `docs/agentdeck/헌장.md`·`Taste.md`, 전역은 앱 데이터 폴더 `taste/global-taste.md`. 근거: 스펙 3회차 1번 「전역은 앱, 프로젝트는 저장소」, `.agentdeck/` 실행기 상태와 섞지 않는다(스펙). (2026-11-21)
- [USER·위임] 루프 세션은 `user` 원천만 빼고 `project`·`local`은 둔다 — 작업 저장소의 `CLAUDE.md`는 그 프로젝트의 규칙이라 싣는 것이 맞고, 사용자 전역 지시·자동 기억은 남에게 건넬 때 따라가지 않아야 한다. 채팅 모드는 그대로 둔다. 근거: 스펙 「노드 세션의 설정 원천」, M10 Backlog 11, 성향 22(격리), 25(드러나지 않은 문제는 방어하지 않는다 — 채팅 모드는 그대로). (2026-11-21)

- [AI] 워커 설계 선택 — 문서는 `ClaudeAgentRun._prepareQuery`에서 `loopLock`이 있을 때만 한 번 읽어 `buildClaudeSdkOptions`의 `loopDocs`로 넘긴다(세 루프 세션 조립부는 그대로). 읽기 실패한 문서는 건너뛰고 세션은 연다. 파서는 위치에서 온 층(`scope`)으로 머리를 검사하고, 모르는 칸은 구조에 남겨 다시 써도 사람이 쓴 글이 사라지지 않는다. 쓰기 함수는 원문이 아니라 항목·헌장 구조를 받는다. 공개 — 워커가 tdd-guard를 그 변경의 좁힌 시험 실행으로 두 번 풀었다(규칙 안). (2026-11-21)

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
