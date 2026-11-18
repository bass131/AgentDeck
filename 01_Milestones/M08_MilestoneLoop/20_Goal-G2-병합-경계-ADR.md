# M08 G2 — 병합 경계 ADR과 안내 글 · 마일스톤 단위 병합 결정을 ADR로 남기고 효력 날 뒤 틀린 안내 글을 맞춘다

- 마일스톤: M08 (마일스톤 스펙 `01_Milestones/M08_MilestoneLoop/00_마일스톤-스펙.md`) · 작성: 2026-11-18 · 상태: 실행 중 · 검증 강도: 강(판정 장치 변경)
- 작업 브랜치: `feat/m08-g2-merge-adr` · 기준 브랜치: `milestone/m08-milestone-loop`(헌법 10조 효력 날 2026-11-18, PR 88 `525c57ce` 뒤 `master`에서 가름). 이 goal은 에이전트가 마일스톤 브랜치에 병합하는 첫 goal이다.

## 목표

병합 경계가 마일스톤 단위로 옮겨 간 결정이 ADR로 남는다. 효력 날 뒤 사실과 어긋나는 거부 안내 글 둘과 감시 줄 시험이 새 뜻을 말한다. 그리고 이 goal 자체를 pin의 정형 절차로 마일스톤 브랜치에 병합한다.

## 범위

- **만들 것**: `98_Management/00_ADR/ADR-005-병합-경계는-마일스톤-단위.md`, 가드 `MERGE_HINT` 글, 앱 `mergeDeny.ts`의 `REASON` 글과 그 시험, `smoke.test.mjs` 감시 줄 단언 강화, 로드맵 진행 기록 한 줄, M07 Backlog 36의 처리 표시.
- **건드릴 곳**
  - 판정 장치(헌법 3조 — 모두 마일스톤 스펙 「건드릴 곳」에 있다): `.claude/hooks/dangerous-cmd-guard.mjs`의 `MERGE_HINT` 글(2단계), `.claude/hooks/smoke.test.mjs`(3단계), `98_Management/01_GateState/gate-config.json`의 `planPath`(1단계).
  - 판정 장치 밖: `98_Management/00_ADR/`, `02_Project/00_Source/main/04_Claude/permission/mergeDeny.ts`의 `REASON`, `02_Project/01_TestCode/main/04_Claude/mergeDeny.test.ts`, `01_Milestones/M08_MilestoneLoop/`, `01_Milestones/00_Roadmap.md`, `01_Milestones/M07_Controls/99_Backlog.md`(36 처리 표시).
- **하지 않을 것**: 가드의 판정 규칙 변경(글만 바꾼다), `.claude/hooks/dangerous-cmd-guard.test.mjs`(스펙에 이름이 없다 — 기존 단언 「현황판」「사용자」「외부 셸 아님」이 새 글을 계속 묶는다), `.claude/hooks/10_start-brief.cjs`의 감시 줄 「현재 goal이」 표현과 SessionStart의 마일스톤 스펙 읽기(스펙에 이름이 없다 — M08 Backlog 4), 앱 병합 길 변경, 헌법 문면.
- **완료조건**: ADR-005가 있고 ADR-003 결정 1을 대체한다고 적는다. `MERGE_HINT`와 `REASON`이 「`master`로 가는 병합은 사람이 한다」와 「goal은 로컬 `git merge --no-ff`로 마일스톤 브랜치에 합친다」를 말하고, `mergeDeny.test.ts`가 그 뜻을 단언한다. `smoke.test.mjs`가 감시 줄의 「마일스톤 PR이면」「멈춘다」를 단언한다. 하드 게이트 다섯 종 exit 0, `npm test` 실패 0, 독립 검수 반영, goal PR(기준 마일스톤 브랜치)의 `hard-gates` 통과, 정형 절차로 병합하고 GitHub가 PR을 병합됨으로 닫는다.

## Phase 1 — 병합 경계 ADR과 안내 글 · 태그: `harness` · 의존: G1

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. goal 준비 — 이 문서, pin, `gate-config.json`의 `planPath` 전환(판정 장치), 마일스톤 브랜치 가르기와 push
- [x] 2. 안내 글 — `mergeDeny.test.ts` 단언을 먼저 고치고(실패 확인), `mergeDeny.ts` `REASON`과 가드 `MERGE_HINT`(판정 장치)를 새 뜻으로
- [x] 3. 감시 줄 시험 — `smoke.test.mjs`의 `includes('다음 goal')`에 「마일스톤 PR이면」「멈춘다」 단언을 더한다(판정 장치)
- [x] 4. ADR-005, 로드맵 진행 기록, M07 Backlog 36 처리 표시
- [x] 5. 하드 게이트 다섯 종, `npm test`
- [>] 6. 커밋, push, PR(기준 마일스톤 브랜치), 독립 검수와 반영, CI 통과, 정형 절차로 병합과 마일스톤 브랜치 push, 종결 기록

실행 단계 일괄 승인 대상

- 마일스톤 스펙의 목록 중: `node --test`, 하드 게이트, `npm test`, 독립 검수 하위 에이전트, 브랜치 만들기, 커밋, 두 브랜치의 push, `gh pr create`, 로컬 `git merge --no-ff`

DoD

- 위 완료조건.

검증 기록

- PASS 2026-11-18T20:45:47+09:00 — 구현분: `mergeDeny.test.ts`의 새 단언(`master`로 가는 병합·`git merge --no-ff`·마일스톤 브랜치, 옛 「사용자에게 맡기세요」 없음)이 구현 전 실패 1에서 구현 뒤 127/127 통과. `smoke.test.mjs` 새 단언은 G14가 이미 바꾼 감시 줄을 묶는 회귀 시험이라 처음부터 통과(전부 통과). 가드 `MERGE_HINT`를 바꾼 뒤 기존 단언(「현황판」「사용자」, 외부 셸 아님) 포함 가드 회귀 971/971. ADR-005 50줄. 하드 게이트 다섯 종 exit 0, `npm test` 449 파일·8153 시험 실패 0. 독립 검수는 PR 뒤.

## 결정 대장

- [USER] M08 스펙 합의 「합의」 (2026-11-18) — 이 goal은 스펙의 goal 후보 2이다. 근거 줄은 스펙 결정 대장.
- [AI] 가드 시험 파일과 SessionStart 훅은 스펙 「건드릴 곳」에 없어 고치지 않는다. G1 차단 1과 같은 범위 변경을 만들지 않으려는 것이고, 기존 단언이 새 글의 핵심 성질을 계속 묶는다 (2026-11-18).

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
