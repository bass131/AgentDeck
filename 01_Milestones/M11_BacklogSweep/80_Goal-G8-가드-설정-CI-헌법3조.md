# M11 G8 — 가드·설정·CI·헌법 3조

- 마일스톤: M11 (마일스톤 스펙 `01_Milestones/M11_BacklogSweep/00_마일스톤-스펙.md`) · 작성: 2026-11-21 · 상태: 실행 중 · 검증 강도: 강(판정 장치 변경)
- 작업 브랜치: `chore/m11-g8-guard-settings-ci` · 기준 브랜치: `milestone/m11-backlog-sweep`(`f630b36c`, G7 병합 머리)

## 목표

분류표 「처리」 G3 묶음 중 고칠 항목(M03-28·32, M04-8·10, M05-8·9·10, M06-28, M07-1·3·20·21, M08-2·3·5·6)과 M11 Backlog 5(설정 deny의 넓은 꼴)·17의 판정 장치 몫(같음 시험을 판독 결과 말뭉치로)·28(PowerShell 꼴)이 고쳐지거나 근거로 닫히고, 각 항목이 원래 Backlog 닫힘 표에 행을 갖는다. 같은 묶음의 「v2로」·「닫음(판단)」 항목(M03-24·31·35, M04-5·12, M07-25)은 G1이 이미 닫았고 다시 열지 않는다.

## 범위

- **만들 것** — 원문은 각 마일스톤 `99_Backlog.md`의 같은 번호 줄, 분류 근거는 `10_`~`13_분류-*.md`와 각 표 끝 「판단 결정 (G1)」 절이다(M05-9 규칙 없는 꼴에 규칙 추가·못 읽는 꼴은 v2, M08-3 전략 옵션 꼴을 ask로·우선순위는 공식 문서로 먼저 확인, M08-6 `--ff-only` 한 꼴 allow).
  - 가드 규칙(M03-28·32, M04-8·10, M05-8·9, M07-1, M08-2·5, Backlog 28): 셸 스크립트 판독의 빠진 꼴, 이스케이프 리다이렉트, `--output=`·`git branch -f/-M/-m/--force`, 좁힌 기대값, `gh repo rename·archive·sync --force`·`gh secret set`·`gh alias set`·`--receive-pack`, AppData·`engines/`·`engine-config`, 현재 브랜치가 `master`일 때의 맨 push·병합 질의, MERGE_HINT 시험, PowerShell `iex`·`Invoke-Expression`·`Start-Process`로 감싼 병합.
  - 설정(M06-28, M08-3·6, Backlog 5): settings ask와 가드 ask의 겹침, `git merge --no-ff *`의 전략 옵션, `--ff-only` 한 꼴, `pulls/*/merge` deny가 댓글 호출까지 막는 넓은 꼴.
  - 훅 배선과 하위 에이전트 질의(M07-3, M05-10): 가드 밖 훅의 실패 처리, 하위 에이전트의 가드 질의가 창이 되는지의 근거.
  - CI(M07-21): `hard-gates.yml` 액션을 커밋 SHA로 고정하고 dependabot에 github-actions를 더한다.
  - 헌법 3조(M07-20): 보호 표면 목록에 `.github/workflows/`와 `package.json`의 `scripts`를 더한다 — `CLAUDE.md`·`AGENTS.md`의 그 한 곳만, 두 파일 같은 글.
  - 같음 시험(Backlog 17 판정 장치 몫): `cmd-guard-equivalence.test.mjs`가 래퍼 표 글자가 아니라 가드와 앱 잠금(`mergeDeny`·`loopLock`)의 판독 결과를 같은 말뭉치로 비교한다. 가드에 더한 병합 꼴이 앱 잠금과 어긋나면 앱 잠금도 같은 꼴을 막게 고친다(패리티).
- **건드릴 곳**: 판정 장치 — `.claude/hooks/`(가드·`_lib/`·시험·`fixtures/`), `.claude/settings.json`, `CLAUDE.md`·`AGENTS.md`(3조 보호 표면 목록 한 곳만), `.github/workflows/hard-gates.yml`, `.github/dependabot.yml`, `98_Management/01_GateState/gate-config.json`(`planPath` 전환, 1단계). 그 밖 — `02_Project/00_Source/main/`의 병합·실행기 잠금 판독(`mergeDeny`·`loopLock`, 패리티 몫만)과 그 시험, `01_Milestones/M03_Harness_Refresh`·`M04_Goal_Loop`·`M05_Structure`·`M06_SelfDev`·`M07_Controls`·`M08_MilestoneLoop/99_Backlog.md`(닫힘 표 행만), `01_Milestones/M11_BacklogSweep/`.
- **하지 않을 것**: 가드 판독 재설계와 공개 셸 파서(v2), 「v2로」·「닫음(판단)」 항목의 재론, GitHub 저장소 설정·브랜치 보호 변경과 비공개 전환(사람 몫, 헌법 9·10조), 계획 게이트·tdd-guard(goal 7이 닫음), 주석 전수조사(goal 9). 질의가 뜨는 명령을 꼴을 바꿔 통과시키기.
- **완료조건**
  - 항목마다 고친 커밋과 훅 시험(또는 근거·결정 줄)이 있고, 바꾼 가드·설정마다 `npm run test:hooks`의 시험이 그 변경을 묶는다. 하드 게이트 다섯 종과 `npm test`가 실패 0이다.
  - 메인의 정형 절차 명령 — `git merge --no-ff -m "<메시지>" origin/<goal 브랜치>`, `git push -u origin milestone/<이름>`, `git push -u origin <작업 브랜치>`, `gh pr create --base milestone/<이름>` — 이 질의 없이 지나감을 가드 시험과 설정 판정 시험이 묶는다(사슬이 사람 없이 멈추지 않는다).
  - 닫힘 표에서 위 항목 행이 `고침(M11 goal 8)` 또는 근거를 단 처분이고, M11 Backlog 5·17·28 줄 끝에 처분이 붙는다.

## Phase 1 — 가드·설정·CI·헌법 3조 · 태그: `harness` · 의존: 없음

진척 단계

- [x] 1. goal 준비 — 이 문서, `gate-config.json` `planPath` 전환(판정 장치)
- [>] 2. 정형 절차 명령의 통과 시험 먼저
- [ ] 3. 가드 규칙과 같음 시험(앱 잠금 패리티)
- [ ] 4. 설정 — 질의 겹침, 병합 꼴, deny의 넓은 꼴
- [ ] 5. 훅 배선, 하위 에이전트 질의 근거, CI 고정, 헌법 3조
- [ ] 6. 닫힘 표, 하드 게이트 다섯 종, `npm test` 차분
- [ ] 7. 독립 검수와 반영, goal PR, `hard-gates`, 로컬 goal 병합

실행 단계 일괄 승인 대상 (스펙에서 옮김)

- vitest·`node --test`, 하드 게이트 다섯 종, `npm test`, 작업·독립 검수 하위 에이전트, 커밋, 작업 브랜치와 마일스톤 브랜치 push, `gh pr create`, 로컬 `git merge --no-ff`.

DoD

- 완료조건 세 줄이 검증 기록 `PASS` 줄로 있다.
- 가드·설정 변경 커밋마다 그 시점의 `npm run test:hooks`가 통과한다.
- 새 주석은 최소다.
- 범위 밖 발견은 `99_Backlog.md`에 한 줄로 있다.

검증 기록

- (기록 없음)

## 결정 대장

- [USER·위임] G3 묶음의 고칠 항목과 M11 Backlog 5·17·28을 한 goal에서 정형 절차 통과 시험, 가드 규칙과 같음 시험, 설정, 배선·CI·헌법 순서로 고친다. 정형 절차 시험을 맨 앞에 두는 것은 가드·설정 변경이 사람 없는 사슬을 질의로 멈추지 않게 하려는 것이다. 근거: 스펙 goal 표 8행, 분류표 「처리」 G3, 성향 13·29. (2026-11-21)
- [USER·위임] Backlog 28의 PowerShell 꼴은 규칙이 없는 꼴(`iex`·`Invoke-Expression`·`Start-Process`가 감싼 `gh pr merge`)만 가드와 앱 잠금에 같이 더하고, 백틱 이스케이프(`` g`h ``)처럼 판독이 낱말을 못 읽는 꼴은 M05-9 처분과 같이 v2로 보낸다. 근거: G1 결정 M05-9, 스펙 「하지 않을 것」(판독 재설계는 v2). (2026-11-21)
- [USER·위임] M05-10(하위 에이전트의 가드 질의가 창이 되는지)은 사람이 없는 지금 실제 질의를 띄워 재지 않는다 — 사슬이 창에서 멈춘다. 공식 문서와 훅 로그의 기존 줄로 근거를 적고, 실측이 필요하면 Backlog로 남긴다. 근거: 성향 28·31, 사슬 규칙(사람에게 묻지 않는다). (2026-11-21)
- [USER·위임] M08-3의 ask/allow 우선순위는 Claude Code 공식 권한 문서로 확인한 뒤 규칙을 정한다. 문서가 「deny → ask → allow」 순서를 보장하지 않으면 allow 꼴을 좁히는 쪽을 고른다. 근거: G1 결정 M08-3, 사용자 지시(번들 열람 금지). (2026-11-21)

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
