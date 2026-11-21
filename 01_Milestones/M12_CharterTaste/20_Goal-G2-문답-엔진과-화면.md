# M12 G2 — 문답 엔진과 화면

- 마일스톤: M12 (마일스톤 스펙 `01_Milestones/M12_CharterTaste/00_마일스톤-스펙.md`) · 작성: 2026-11-21 · 상태: 실행 중 · 검증 강도: 강(앱 소스 50줄 이상)
- 작업 브랜치: `feat/m12-g2-taste-dialog` · 기준 브랜치: `milestone/m12-charter-taste`(`e544d797`, goal 1 병합 머리)

## 목표

작업 모드의 메인 대화가 여러 턴의 문답으로 전역 Taste·프로젝트 헌장·프로젝트 Taste의 초안을 만들고, 사람이 승인 카드로 확정하면 앱이 goal 1의 저장소로 쓴다. 프로젝트 문서는 그 저장소의 기본 브랜치로 가는 PR로 커밋된다. 작업 모드에서 세 문서를 보고, 고치고 싶으면 문답을 다시 연다.

## 범위

- **만들 것**
  - 제안 도구 — 메인 대화의 앱 안 도구에 `propose_taste_doc`을 더한다. 입력은 문서 종류(`global-taste`·`project-taste`·`charter`)와 구조(항목 또는 목표·하지 않을 것). 앱은 goal 1의 쓰기 검사로 미리 돌려 보고(쓰지 않는다), 통과하면 초안을 메인 대화 기록에 두고 승인 카드를 띄운다. 검사에 걸리면 문제 목록을 도구 결과로 돌려줘 메인이 고치게 한다.
  - 승인 카드 — 메인 대화의 새 카드 종류(제안 문서의 원문을 보이고 「확정」·「반려」). 반려는 사람의 이유 한 줄과 함께 다음 턴으로 메인에게 간다. 확정은 한 번만 쓴다(같은 카드 두 번 확정 불가, 재기동 뒤에도 카드가 남는다).
  - 확정의 쓰기
    - 전역 Taste — 앱 데이터 폴더에 goal 1의 쓰기로.
    - 프로젝트 헌장·Taste — 실행기가 돌고 있지 않고 작업 트리가 깨끗할 때만. 원격 기본 브랜치 머리에서 `agentdeck/charter-<짧은 시각>` 브랜치를 갈라 `docs/agentdeck/`에 쓰고, 커밋·push하고, 기본 브랜치로 PR을 연다(기존 `GitPort`·`GhPort`). 끝나면 원래 브랜치로 돌아온다. 조건이 맞지 않으면 쓰지 않고 이유를 카드와 메인 대화에 남긴다. PR 병합은 사람이 앱 PR 카드의 병합 버튼으로 한다.
  - 문답 여는 길 — 작업 모드의 「헌장·Taste」 보기에서 「문답 열기」(전역 Taste / 프로젝트 헌장·Taste)를 누르면 메인 대화에 여는 턴이 간다. 여는 턴은 지금 문서 원문(없으면 없음)과 문서 꼴 규칙, 「판정할 수 있는 꼴」 안내(비전 20_Taste)를 싣는다. 전역 Taste가 없으면 보기가 문답을 권하는 표시를 낸다. 프로젝트를 열었는데 헌장이 없으면 같은 표시를 낸다(자동으로 턴을 보내지는 않는다).
  - 보기 화면 — 작업 모드 안 「헌장·Taste」 칸(goal 1의 `taste.read`로 세 문서의 구조·검사 문제·없음 표시). 직접 편집칸은 두지 않는다(스펙 제안).
- **건드릴 곳**: `02_Project/00_Source/`(main의 메인 대화 도구·카드·확정 쓰기, shared 타입, preload·renderer의 작업 모드 보기와 카드), `02_Project/01_TestCode/`, `01_Milestones/M12_CharterTaste/`, 판정 장치 `98_Management/01_GateState/gate-config.json`(`planPath` 전환, 1단계).
- **하지 않을 것**: 검수 노드의 Taste 판정(goal 3), 사용량 한도(goal 4), 연습 저장소 실주행과 장면 캡처(goal 5), 레퍼런스 이미지 저장·대조, Second Brain 연동, 직접 편집칸, 채팅 모드 변경. 프로젝트 문서를 실행 중인 마일스톤 브랜치에 커밋하는 길.
- **완료조건**
  - 시험이 제안 도구의 검사 통과·거절, 카드 확정의 전역 쓰기, 반려가 다음 턴으로 가는 것, 같은 카드의 두 번 확정 불가, 재기동 뒤 카드 복원을 묶는다.
  - 시험이 프로젝트 확정의 git 순서(원격 기본 머리에서 가름 → 쓰기 → 커밋 → push → PR → 원래 브랜치로)와 거절 조건(실행기 동작 중, 더러운 작업 트리)을 가짜 포트로 묶는다.
  - 시험이 보기 화면의 세 상태(없음·정상·검사 문제)와 「문답 열기」가 여는 턴을 보내는 것을 묶는다.
  - 하드 게이트 다섯 종 통과, `npm test` 실패 0.

## Phase 1 — 문답 엔진과 화면 · 태그: `feature` · 의존: 없음

진척 단계

- [x] 1. goal 준비 — 이 문서, `gate-config.json` `planPath` 전환(판정 장치)
- [x] 2. 제안 도구와 승인 카드(main·shared), 시험
- [x] 3. 확정 쓰기 — 전역과 프로젝트 PR 길, 시험
- [x] 4. 작업 모드 보기와 문답 여는 길(renderer), 시험
- [x] 5. 하드 게이트 다섯 종, `npm test`
- [>] 6. 독립 검수와 반영, goal PR, `hard-gates`, 로컬 goal 병합

실행 단계 일괄 승인 대상 (스펙에서 옮김)

- vitest·`node --test`, 하드 게이트 다섯 종, `npm test`, 앱 개발 기동과 e2e, 작업·독립 검수 하위 에이전트, 커밋, 작업 브랜치와 마일스톤 브랜치 push, `gh pr create`, 로컬 `git merge --no-ff`.

DoD

- 완료조건 네 줄이 검증 기록 `PASS` 줄로 있다.
- 범위 밖 발견은 `99_Backlog.md`에 한 줄로 있다.

검증 기록

- PASS 2026-11-21T15:11:55+09:00 — 반영분 재검수(다른 검수자, `ab50d9f3..142eb982`): 막는 결함 0, 확정 길은 문서 경로 말고는 커밋·push하지 않음을 확인(한글 경로 pathspec 실 git 통과). 지적 6 반영(`9d66e7c3`~`de69bce8`) — 기본 브랜치가 문서 경로를 무시하면 쓰지 않고 따로 된 사유로 거절하며 쓴 파일은 무시 여부와 관계없이 지운다(`gitPort.test.ts:87`, `charterPr.test.ts:155·168`, 실 git `loopDriver.taste-doc.test.ts:168`). 가르기 전 GitHub에서 열린 `agentdeck/charter-*` PR을 찾아 거절·기록하고 `createPr` 실패 뒤 한 번 찾는다(`ghPort.test.ts:177`, `charterPr.test.ts:187·194`, `loopDriver.taste-doc.test.ts:206`). 배너는 BOM·CRLF를 가리지 않고 PR 상태를 GitHub에 물어 열림일 때만(`tasteDoc.test.ts:226`, `TastePanel.test.tsx:133·141`, `loopDriver.taste-doc.test.ts:229`). 저장소 뿌리 캐시에 null을 담지 않음(`git.test.ts:79`). 무시된 채 있는 파일을 기본 브랜치가 추적하면 가르지 않아 `.env`를 잃지 않음(`gitPort.test.ts:102`, 실 git `loopDriver.taste-doc.test.ts:184`). 문서 PR은 하나씩, 거절 메시지가 막은 PR을 알림(`:115`). 하드 게이트 다섯 종 exit 0, `npm test` Test Files 479 passed·6 skipped(485), Tests 9282 passed·10 skipped, 실패 0(워커 보고). 범위 밖 변경 0.
- PASS 2026-11-21T14:25:09+09:00 — 독립 검수(구현 문맥 없는 검수자, `06ee4cd3..ab50d9f3`): 막는 결함 1, 고칠 것 3, 사소 4. 반영(`acf27416`~`142eb982`, 커밋 일곱) — 막는 결함: 확정 커밋이 `git add -A`로 사용자 브랜치에서만 무시되던 `.env`·`dist/`까지 쓸어 담던 것을 문서 두 경로만 커밋하고, 확정 브랜치로 옮긴 직후 문서 밖 경로가 보이면 쓰지 않고 돌아가게 고쳤다(`gitPort.test.ts:66`, `charterPr.test.ts:121`, 실 git `.gitignore`가 갈리는 경우 `loopDriver.taste-doc.test.ts:143`). 쓴 뒤 실패의 정리(`charterPr.test.ts:153`), 재기동 안내에 두 브랜치 이름(`mainChat.taste-draft.test.ts:259`), charter 브랜치 위 거절(`charterPr.test.ts:106`), 열린 PR 동안 새 확정 거절(`loopDriver.taste-doc.test.ts:134`), 읽기 뿌리를 git 최상위로(Backlog 6, `taste.handler.test.ts:96`)와 열린 PR 표시(`TastePanel.test.tsx:119`), 초안·여는 턴 크기 상한(`tasteStore.test.ts:232`, `tasteDialog.test.ts:27`), 시작 중 확정 거절(`loopDriver.taste-doc.test.ts:168`), 오류 분리(`TastePanel.test.tsx:133`), 카드 기다림 풀기(`MainChatView.taste-card.test.tsx:63`). 하드 게이트 다섯 종 exit 0, `npm test` Test Files 479 passed·6 skipped(485), Tests 9266 passed·10 skipped, 실패 0(워커 보고). 막는 결함이 있었으므로 반영분을 다른 검수자가 다시 본다.
- PASS 2026-11-21T13:43:59+09:00 — 구현: 작업 하위 에이전트가 커밋 열(`61f62a1b`~`ab50d9f3`, 42파일). 제안 도구 통과·거절 `mainChat.taste-draft.test.ts:86·95`·`mainChatTools.test.ts:33`, 전역 확정 쓰기 `mainChat.taste-draft.test.ts:119`·`loopDriver.taste-doc.test.ts:98`, 반려가 다음 턴 `:170`, 두 번 확정 불가 `:130`, 재기동 복원 `:199·212`. 프로젝트 확정 git 순서 `charterPr.test.ts:56`(실 git `loopDriver.taste-doc.test.ts:115`), 실행 중 거절 `charterPr.test.ts:73`·`loopDriver.taste-doc.test.ts:146·168`, 더러운 작업 트리 거절 `charterPr.test.ts:80`·`loopDriver.taste-doc.test.ts:133`. 보기 세 상태 `TastePanel.test.tsx:64·76·85`, 「문답 열기」의 여는 턴 `:92`·`WorkView.test.tsx:115`·`tasteDialog.test.ts:13`, 화면을 여는 것만으로 턴이 가지 않음 `TastePanel.test.tsx:64`. 하드 게이트 다섯 종 exit 0, `npm test` Test Files 479 passed·6 skipped(485), Tests 9251 passed·10 skipped, 실패 0(워커 보고, 그 앞 두 번의 실패는 채널 수 고정값과 안 쓰는 export 래칫 — `2a957f11`·`ab50d9f3`에서 고침). 메인이 범위 밖 변경 0을 확인했다.

## 결정 대장

- [USER·위임] 메인은 파일을 직접 쓰지 않고 구조로 제안하며, 앱이 goal 1의 쓰기 검사를 거쳐 사람 확정 뒤에만 쓴다. 메인 대화의 「파일은 읽기만」 잠금을 넓히지 않고, 판정할 수 있는 꼴을 기계가 지킨다. 근거: 스펙 「문답이 끝나면 승인 카드로 확정」, 성향 1(구조로 강제)·4(결정론적 검증)·29(가역성). (2026-11-21)
- [USER·위임] 프로젝트 문서는 기본 브랜치로 가는 별도 PR로 커밋한다. 실행기는 마일스톤 브랜치를 원격 기본 머리에서 가르므로(`loopRunner.ts` `ensureBranch`), 문서가 기본 브랜치에 있어야 다음 마일스톤의 루프 세션이 읽는다. 기본 브랜치 보호를 넘지 않고 병합은 사람의 PR 카드 버튼이다. 실행기 동작 중이나 더러운 작업 트리면 쓰지 않는다(좁은 쪽). 근거: 스펙 「프로젝트 헌장과 프로젝트 Taste는 그 저장소 안 문서로 커밋」, 헌법 10조의 사람 병합, 성향 29·25. (2026-11-21)
- [USER·위임] 헌장이 없을 때 문답을 자동으로 보내지 않고 보기에 권하는 표시만 낸다 — 사람이 대화를 여는 시점을 고른다. 근거: 비전 「알림」의 사람을 부르는 사건 구분, 성향 25. (2026-11-21)

- [AI] 워커 설계 선택 — 같은 종류를 다시 제안하면 앞 카드를 갈음하고, 새 메인 대화를 열면 초안 카드를 새 장으로 옮긴다. 확정 도중 꺼지면 재기동 때 그 카드는 확정 중이 아니며 확인하라는 이유가 붙는다. 확정 결과는 알림 줄로만 남기고 턴을 보내지 않는다. 실행 상태가 없거나 끝났을 때만 확정을 받고, 확정 중에는 실행 시작을 거절한다. 확정 응답에는 구조를 싣지 않고 main이 쥔 초안만 쓴다. 공개 — 커밋 하나(`bf09eacb`)는 셸 문제로 폴더 pathspec으로 했고(의도한 7파일만 들어감), tdd-guard를 한 번 편집과 관계없는 시험으로 풀었으며, `2a957f11`의 제목이 내용보다 넓다. (2026-11-21)
- [USER·위임] 문서 확정 PR은 한 번에 하나다 — 헌장 PR이 열려 있는 동안 프로젝트 Taste 확정도 거절하고 막은 PR을 알린다. 두 PR이 같은 폴더를 겹쳐 고치는 일을 막는 좁은 쪽이다. 사용자 브랜치에서만 무시하는 파일이 남아 있거나, 무시된 파일을 기본 브랜치가 추적하면 확정을 거절한다(비밀 파일의 커밋·손실 방지). 근거: 성향 29(되돌릴 수 없는 손상일수록 게이트를 세게), 25. (2026-11-21)

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
