# M08 G1 — 병합 길 장치 · goal 병합의 길을 장치와 맞추고 CLI 쪽 막는 장치를 실측한다

- 마일스톤: M08 (마일스톤 스펙 `01_Milestones/M08_MilestoneLoop/00_마일스톤-스펙.md`) · 작성: 2026-11-18 · 상태: 실행 중 · 검증 강도: 강(판정 장치 변경)
- 작업 브랜치: `feat/m08-g1-merge-path` · 기준 브랜치: `master`(헌법 10조 과도기 — 이 goal이 병합되는 날이 효력 날이다). M07 종결 기록 `chore/g15-close` 위에서 갈라 그 커밋을 함께 싣는다.

## 목표

로컬 `git merge --no-ff`가 묻지 않고 지나가고, 마일스톤 브랜치로 가는 PR에도 `hard-gates`가 돈다. 서버 보호가 없다고 볼 때 CLI 세션의 어느 장치가 무엇을 막는지가 표로 남는다.

## 범위

- **만들 것**: 설정 allow `Bash(git merge --no-ff *)` 한 줄과 그 시험, `hard-gates` 트리거에 `milestone/**`, CLI 실측 표(아래), work-pin의 M08 이전.
- **건드릴 곳**
  - 판정 장치(헌법 3조 — 마일스톤 스펙 「건드릴 곳」에 있다): `.claude/settings.json`(2단계), `.claude/hooks/settings-matcher.test.mjs`(2단계), `.github/workflows/hard-gates.yml`(3단계), `98_Management/01_GateState/gate-config.json`의 `planPath`·`workPinPath`(1단계).
  - `01_Milestones/M08_MilestoneLoop/`(이 문서, pin, 스펙), `99_Others/Dashboard/docs/병합.md`는 건드리지 않는다.
- **하지 않을 것**: 가드 소스 변경(판정을 바꾸지 않는다 — 실측만), `gh pr merge` 거부 범위 변경, 넓은 `Bash(git merge*)` 허용(`--abort`·`--squash`·`-X theirs` 같은 꼴까지 묻지 않게 된다), 앱 변경.
- **완료조건**: settings 시험이 `git merge` 계열 allow가 정확히 `Bash(git merge --no-ff *)` 한 줄임을 본다. 워크플로가 `master`와 `milestone/**` PR에서 돈다(파일). 실측 표가 가드 판정 실측 입력과 결과를 갖는다. 하드 게이트 다섯 종 exit 0, `npm test` 실패 0, 독립 검수 반영, PR의 `hard-gates` 통과.

## Phase 1 — 병합 길 장치 · 태그: `harness` · 의존: 없음

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. goal 준비 — 이 문서, 마일스톤 스펙 합의 표시, M08 work-pin, `gate-config.json`의 `planPath`·`workPinPath` 전환(판정 장치)
- [x] 2. 설정 allow — `settings-matcher.test.mjs`에 `git merge` 계열 정확 일치 시험을 먼저 넣고(실패 1 확인), `.claude/settings.json`에 `Bash(git merge --no-ff *)`
- [x] 3. CI 트리거 — `.github/workflows/hard-gates.yml`의 `pull_request.branches`에 `milestone/**`
- [x] 4. CLI 실측 — 가드에 입력만 넣어 판정을 재고, 설정 규칙과 함께 표로 쓴다
- [x] 5. 하드 게이트 다섯 종, `npm test`
- [>] 6. 커밋, push, PR(`master`), 독립 검수와 반영, pin 「(병합 대기, PR N)」, 감시, 결과 보고

실행 단계 일괄 승인 대상

- 마일스톤 스펙의 목록 중: `node --test`, 하드 게이트, `npm test`, 가드 판정 실측, 독립 검수 하위 에이전트, 브랜치 만들기, 커밋, push, `gh pr create`, 병합 감시

DoD

- 위 완료조건.

CLI 실측 표

- 2026-11-18 실측. 가드 열은 `node .claude/hooks/dangerous-cmd-guard.mjs`에 PreToolUse 입력 JSON을 넣어 읽은 판정이다(입력 목록은 세션 scratchpad, 저장소 파일을 쓰지 않음). 설정 열은 `.claude/settings.json` 규칙이고, `settings-matcher.test.mjs`가 그 존재를 본다(설정 판정은 Claude Code가 하므로 실행 실측이 아니다). 서버 열은 저장소가 공개인 지금의 `master` 보호다.

| 명령 | 가드 | 설정 | 서버(지금) | 서버가 없을 때 |
|---|---|---|---|---|
| `gh pr merge 12 --merge` | 차단 | deny | — | 가드·설정 두 겹이 막는다 |
| `gh api …/pulls/12/merge -X PUT` | 차단 | deny | — | 두 겹이 막는다 |
| GraphQL `mergePullRequest` | 차단 | deny | — | 두 겹이 막는다 |
| `git merge --no-ff feat/x` | 통과 | allow(이 goal) | — | 로컬 일이라 막을 것이 없다 |
| `git push origin master`, `git push -u origin HEAD:master` | 질문 | allow | PR 없는 push 거부 | 가드의 질문 한 겹 |
| `git push`, `git push origin HEAD`(현재 브랜치가 `master`일 때) | **통과** | allow | 거부 | **막는 장치가 없다** — 가드는 명령 글자에 `master`가 없으면 현재 브랜치를 모른다 |
| `git push --force …`, `git push origin +…` | 차단 | allow | 거부 | 가드 한 겹 |
| `git push origin --delete …`, `git push origin :…` | 질문 | allow | `master` 삭제 거부 | 가드의 질문 한 겹 |
| `git branch -D …` | 차단 | allow 밖 | — | 가드 한 겹(로컬) |
| `gh api -X PUT/DELETE …/branches/master/protection` | 질문 | allow 밖 | — | 가드의 질문 한 겹 |

- 찾은 빈틈: 현재 브랜치가 `master`인 채 맨 `git push`나 `git push origin HEAD`를 하면 가드도 설정도 묻지 않는다. 지금은 서버가 거부하지만, 비공개(Free)로 돌리면 `git switch master && git merge --no-ff x && git push`가 질문 없이 `master`에 닿는다. 이 goal의 `git merge --no-ff` 허용이 그 사슬의 질문 하나를 없앤다. 비공개 전환 전 막아야 할 일로 M08 Backlog 2에 넘긴다(가드 소스 변경은 이 goal 범위 밖).

검증 기록

- PASS 2026-11-18T20:10:05+09:00 — 구현분: `settings-matcher.test.mjs` 새 정확 일치 시험이 구현 전 실패 1(「0건」)에서 구현 뒤 33/33 통과. 워크플로 트리거 `[master, 'milestone/**']`. CLI 실측 16개 입력의 가드 판정을 표로 남겼고 빈틈 하나(맨 `git push` on `master`)를 Backlog 2로 넘겼다. 하드 게이트 다섯 종 exit 0, `npm test` 449 파일·8153 시험 실패 0. 독립 검수는 PR 뒤에 한다. 기준 HEAD `559ae777` 위 작업 트리.

## 결정 대장

- [USER] M08 스펙 합의 「합의」 (2026-11-18) — 이 goal은 스펙의 goal 후보 1이다. 근거 줄은 스펙 결정 대장.
- [AI] allow는 `Bash(git merge --no-ff *)`로 좁힌다. goal 병합의 길이 헌법 10조에 `--no-ff`로 적혀 있고, 넓은 `git merge*`는 다른 꼴까지 묻지 않게 연다 (2026-11-18).

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
