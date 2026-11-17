# M07 G8 — 병합 버튼 · 병합을 사람 버튼으로 옮기고 에이전트의 병합 길을 거부한다

- 마일스톤: M07 사용자 컨트롤 · 작성: 2026-11-18 · 상태: 병합 대기 (PR 74) · 검증 강도: 강(판정 장치·헌법 변경, 앱 소스 50줄 이상)
- 작업 브랜치: `feat/m07-g8-merge-button` — master `aaaef0e4`(PR 73) 위에서 갈랐다. G7 종결 기록 커밋 `dcb9d02c`를 함께 싣는다.
- 출발점: G8 설계 `M06_SelfDev/81_G8-컨트롤-설계/40_병합-분리.md` 「단계 A」와 `60` 순서 4. 앞선 조건 둘(컨트롤 골격 G2, 필수 검사 `hard-gates`)은 충족됐다. 사용자가 2026-11-18에 `master` 보호에 `hard-gates`를 걸었고, 보호 API로 `contexts: ["hard-gates"]`, `enforce_admins: true`를 읽었다.

## 목표

이 goal이 끝나면 PR 병합의 길은 사람이 앱의 PR 카드에서 누르는 「병합」 버튼 하나다(GitHub 웹 화면은 사람의 몫으로 남는다).
버튼은 main 프로세스가 GitHub에서 직접 읽은 머리 SHA와 필수 검사 결과를 보이고, 병합 API에 그 SHA를 고정해 부른다.
에이전트는 앱 세션과 CLI 세션 모두에서 병합 명령을 질문 없이 거부당하고, 헌법과 pin과 현황판도 「병합은 앱의 병합 버튼으로」를 적는다.

## 병합 API 확인 (설계 `40`의 「미확인」을 푼다)

- 원문 출처: GitHub 문서 저장소 `github/docs`의 `src/rest/data/fpt-2022-11-28/pulls.json`(문서 페이지가 렌더하는 데이터)이다. 렌더된 페이지는 가져오기가 병합 절 앞에서 잘려 원문을 못 봤다. 2026-11-18 `gh api`로 읽었다.
- `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge`의 `sha` 매개변수: 「SHA that pull request head must match to allow merge.」
- 응답: 405 「Method Not Allowed if merge cannot be performed」, 409 「Conflict if sha was provided and pull request head did not match」. `merge_method`는 `merge`·`squash`·`rebase`다. fine-grained 권한은 Contents 쓰기다.
- 같은 문서가 비동기 병합 API(`PUT .../merge-async`)를 권하고, 사용자가 그쪽을 골랐다(결정 대장). 그 `sha`: 「If not provided, the current head of the PR at the time of the request will be used; if the PR is pushed in between the merge being requested and being executed, the merge will be cancelled.」 응답은 202(pending, `uuid`·`expected_head_sha`), 200(이미 병합·큐), 400(준비 안 됨), 409(이미 걸린 요청)이고, 결과는 `GET .../merge-async/{uuid}`의 `merged`·`failed`·`enqueued`다. 400 단계에서는 보호 규칙이 돌지 않고 뒤에서 돈다. 두 길 모두 잠금 노드의 거부 대상이다.

## 범위

- **만들 것**
  - **main PR 서비스** — 작업 폴더의 `origin`에서 GitHub 저장소를 정하고, `gh api`로 PR(상태·초안·병합 여부·base·머리 SHA·mergeable), base 브랜치의 필수 검사 이름, 그 머리 SHA의 check run과 상태를 읽는다. 병합은 `gh api -X PUT .../pulls/{n}/merge-async`에 `sha`, `merge_method=merge`, `merge_action=direct_merge`, `bypass_rules=false`를 실어 부르고, 결과를 기다려 병합 커밋이나 실패 사유를 돌려준다. main은 자기가 마지막으로 읽어 보인 SHA와 다른 SHA의 병합 요청을 거부한다. `gh` 실행기와 대기 시계는 주입받아 단위 테스트에서 응답 꼴과 검사 미통과를 고정한다.
  - **PR 카드(새로 만든다 — 앱에 아직 없다)** — 번호, 제목, base←head, 머리 SHA(짧은 꼴과 전체), 필수 검사별 결과, 「병합」 버튼을 보인다. 버튼은 열림·초안 아님·필수 검사 전부 성공일 때만 켜지고, 누르면 SHA를 다시 보이는 확인을 한 번 거친다. 결과(병합 커밋 SHA 또는 거부 사유)를 카드에 보인다.
  - **카드를 띄우는 두 길** — 대화에서 `gh pr create`의 Bash 결과에 PR URL이 보이면 카드를 띄운다. Git 창에서 PR 번호로 불러온다(CLI 세션이 만든 PR용). 감지한 URL은 번호를 찾는 데만 쓴다. URL의 저장소가 작업 폴더 `origin`과 다르면 불러오지 않는다. 화면의 값은 모두 main이 GitHub에서 읽은 값이다.
  - **잠금 노드 `merge-deny`** — 앱 세션의 PreToolUse 잠금 노드(L3, 잠김, 실패 시 막음). `gh pr merge`(옵션 위치 변형, `--auto` 포함), `gh api`의 `pulls/<n>/merge`·`merge-async` 경로, GraphQL `mergePullRequest`·`enablePullRequestAutoMerge`를 질문 없이 거부한다. 컨트롤 패널 목록에 보인다.
- **건드릴 곳**
  - 앱 소스: `main/04_Claude/permission/`(새 잠금 노드, `controlNodes.ts` 목록), `main/04_Claude/sdkOptions.ts`(훅 등록), `main/08_Git/`(PR 서비스), `main/01_Ipc/handlers/`, `shared/08_Git/`·`shared/01_Ipc/`(채널), `renderer/src/08_Git/`(Git 창 불러오기), `renderer/src/05_Conversation/`(카드와 감지), `02_Project/01_TestCode/` 미러.
  - **판정 장치(헌법 3조, 이름으로)**
    - `98_Management/01_GateState/gate-config.json` — `planPath`를 이 문서로 전환(1단계).
    - `.claude/settings.json` — `ask`의 `Bash(gh pr merge*)`를 `deny`로 옮기고, `deny`에 병합 API 경로·GraphQL 병합 mutation·옵션 앞 꼴·`timeout` 앞붙임 규칙을 더한다(4단계, 9단계 검수 반영).
    - `.claude/hooks/settings-matcher.test.mjs` — 103~107행의 `ask` 유지 단정을 `deny` 단정으로 바꾼다(4단계).
    - `CLAUDE.md`·`AGENTS.md` — 10조(병합은 사람이 앱의 병합 버튼으로, 에이전트의 병합 명령은 설정이 거부), 11조(마감 판정은 사용자의 병합이 겸함), 6조(하드 게이트 다섯 종을 CI `hard-gates`가 PR마다 돌리고 `master` 보호의 필수 검사다)(4단계).
  - 문서: 이 goal 문서, `M07_Controls/01_Work_Pin.md`·`99_Backlog.md`, `.claude/commands/gate.md`(70행 병합 문구), `00_Documents/02_Rules/04_Goal-한장-템플릿.md`(병합 승인 문구), `99_Others/Dashboard/`(병합 종류 `kind: merge` 처리와 「병합은 메인 세션이 승인 다이얼로그로」 안내문, 그 테스트).
- **하지 않을 것**
  - `.claude/hooks/dangerous-cmd-guard.mjs` 변경. 설계 `60`이 저장소 훅은 남긴다고 정했다. CLI에서는 설정 `deny`가 가드의 `ask`보다 먼저 이긴다(아래 결정 대장).
  - 헌법 3조 보호 표면에 `.github/workflows/`를 더하는 일(M07 Backlog 20). 보호 표면을 넓히는 결정이라 이 goal에서 조용히 넣지 않고 Backlog에 남긴다.
  - 단계 B·C(에이전트 토큰 분리, 기기 인증, App 신원). 같은 토큰이라 에이전트가 글자를 바꿔 병합 API를 부르면 서버는 받는다 — 설계가 정한 L3 한계다.
  - 노드 판정 기록(M07 Backlog 13). 병합 기록은 GitHub의 PR 병합 정보(병합한 사람, 병합 커밋)로 갈음한다.
  - 병합 방식 선택 화면. `merge`로 고정한다(지금 이력이 병합 커밋이다).
  - 열린 실제 PR에 시험 삼아 병합 API를 부르는 일. 응답 꼴은 주입 실행기 단위 테스트로 고정한다.
  - 현황판의 「병합 대기」 표시 제거. 사용자가 누를 PR을 아는 길이라 남긴다.
- **완료조건** (병합 전에 관찰할 수 있는 것만)
  - 단위 테스트가 고정한다: 버튼 활성 판정(열림·초안·병합됨·필수 검사 성공·대기·실패·필수 검사 읽기 실패), 병합 호출이 화면에 보인 SHA와 `bypass_rules=false`를 싣는다, 보이지 않은 SHA는 거부한다, 202→병합·202→실패·200·400·409·대기 시간 초과를 사유로 보인다, 다른 저장소 URL은 불러오지 않는다, `merge-deny`가 병합 꼴을 거부하고 오탐 꼴(가드 테스트 392~432행 계열)은 지나간다.
  - 하드 게이트 다섯 종 exit 0, `npm test` 실패 0, PR의 `hard-gates` 통과.
  - 이 브랜치 빌드본의 실제 앱(임시 userData)에서 Git 창으로 이 goal의 PR을 불러오면, 카드에 머리 SHA와 `hard-gates` 결과가 GitHub 값과 같게 보인다. 같은 앱의 에이전트 세션에서 `gh pr merge`가 거부된다.
  - CLI 세션(이 세션)에서 설정 변경 뒤 없는 PR 번호로 `gh pr merge`를 부르면 질문 없이 거부된다.
  - 구현 문맥 없는 검수자 1회의 지적이 반영되거나 Backlog로 넘어가 있다.

## Phase 1 — 병합 버튼과 병합 거부 · 태그: `source` `harness` · 의존: G2, G6

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. goal 준비 — 이 문서, `planPath` 전환(판정 장치), pin 갱신
- [x] 2. 테스트 먼저 — PR 서비스·버튼 판정·감지·잠금 노드 단정을 쓰고 실패를 본다
- [x] 3. 구현 — PR 서비스, IPC, PR 카드와 두 길, `merge-deny` 노드
- [x] 4. 판정 장치 개정 — `.claude/settings.json`, `settings-matcher.test.mjs`, 헌법 10·11·6조(두 파일), 그 뒤 CLI 거부 실측
- [x] 5. 문서 정리 — pin 문구, `gate.md`, 템플릿, 현황판 병합 경로 폐지
- [x] 6. 하드 게이트 다섯 종과 `npm test`
- [x] 7. 커밋, push, PR 생성
- [x] 8. 실제 경로 — 빌드본 앱에서 이 PR의 카드와 앱 세션 거부를 본다
- [x] 9. 독립 검수 1회와 반영, push, 결과 보고

실행 단계 일괄 승인 대상 (로드맵 일회 예외로 합의 문답 없이 시작한다)

- vitest, 하드 게이트 다섯 종, `npm test`, `npm run build`, 앱 기동·종료(Playwright, 2번 모니터), 임시 userData의 파일 편집·삭제(임시 폴더에서만), 읽기 전용 `gh api`·`gh pr view`, 없는 PR 번호로 `gh pr merge` 거부 실측, 구현 워커·독립 검수 하위 에이전트, 커밋, 작업 브랜치 push, `gh pr create`

이 goal의 PR 병합

- 브랜치에서 `deny`가 살아 있으면 이 세션은 병합하지 못하고, 결정 보드의 병합 길도 없어진다.
- 그래서 이 PR은 사용자가 직접 병합한다. 이 브랜치 빌드본 앱의 PR 카드 버튼이나 GitHub 웹 화면으로 한다. 결과 보고에 그 방법과 PR 번호를 적는다.

DoD

- 위 완료조건 다섯.
- 마크다운 문서 250줄 이하.

검증 기록

- PASS 2026-11-18T05:38:00+09:00 — 1단계: 이 문서를 쓰고 `planPath`를 전환했다. 병합 API `sha`·응답 꼴을 문서 데이터 원문으로, 설정 `deny`가 훅 `ask`보다 이긴다는 것을 Claude Code 훅 문서 원문으로 확인했다. PR 73 읽기 전용 조회로 `headRefOid`·`statusCheckRollup`(`hard-gates` SUCCESS)과 보호 API의 `contexts`를 실측했다. 주도권 게이트에 걸려 [AI] 결정 넷을 세션 문답으로 받았다(병합 API는 비동기로 바뀜).
- PASS 2026-11-18T05:38:00+09:00 — 2~3단계: 구현 워커(Opus)가 `mergeDeny.ts`(잠금 노드, 거부 51·통과 46 사례), `prMerge.ts`(PR 읽기·비동기 병합·대기, 34 사례), PR 카드와 두 길(Git 창 번호 불러오기, 대화의 `gh pr create` 결과)을 만들었다. `mergeDeny`·`prMerge`·IPC 계약·Git 창·Bash 카드 테스트는 구현 전에 실패를 봤다. `prCardModel`·`PrCard`·ThreadView cwd 테스트는 구현 뒤에 처음 돌렸다.
- PASS 2026-11-18T05:38:00+09:00 — 4단계: `.claude/settings.json`의 `Bash(gh pr merge*)`를 `ask`에서 `deny`로 옮기고 병합 API 거부 셋을 더했다. `settings-matcher.test.mjs` 단정을 바꿨고, 두 헌법의 6·10·11조를 같게 고쳤다(조항 절 diff 0). 이 CLI 세션에서 `gh pr merge 999999 --repo bass131/AgentDeck`와 `gh api -X PUT .../pulls/999999/merge-async`가 질문 창 없이 거부됐다.
- PASS 2026-11-18T05:38:00+09:00 — 5~6단계: pin, `gate.md`, 템플릿, 현황판(`kind: merge` 은퇴 경고, 병합 결정 표시와 안내문 제거, 「내 손」 문구)을 고쳤다. 현황판 시험 149 통과(새 단정은 구현 전 실패를 봤다). 하드 게이트 다섯 종 exit 0(린트 경고 1건은 기존 줄). `npm test` 449파일 통과·6 건너뜀, 8,108 통과·실패 0(05:34:15 시작).
- PASS 2026-11-18T05:40:37+09:00 — 7~8단계: 커밋 `c8f107c1`을 push하고 PR 74를 열었다. 이 브랜치 빌드본을 임시 userData와 임시 작업 폴더(origin만 이 저장소)로 띄웠다(프로브 `e2e/m07-g8-merge-card-live.e2e.ts`, 2 통과). Git 창에서 PR 74를 불러오자 카드의 머리 SHA가 GitHub 값 `c8f107c1…`과 같았고, `hard-gates`가 「대기 중」이라 병합 버튼은 꺼져 있었다. 같은 앱의 에이전트가 `gh pr merge 999999 --repo bass131/AgentDeck`를 부르자 `merge-deny` 사유(「PR 병합은 에이전트가 하지 않습니다 — …「병합」 버튼으로 합니다」)로 거부됐다. 작업 폴더에 저장소 설정이 없어 거부 주체는 잠금 노드다.
- PASS 2026-11-18T06:16:43+09:00 — 9단계: 구현 문맥 없는 검수자(reviewer, Opus) 1회. 차단 0·중요 3·사소 9건이다.
  - 중요 1 반영: CLI `deny`에 옵션 앞 꼴(`gh -R`·`--repo`, `gh pr -R`·`--repo`), `timeout` 앞붙임, 경로 앞 GraphQL(`gh api *graphql*`)을 더했다. 이 세션에서 다섯 꼴(`gh -R … pr merge`, `gh pr -R … merge`, `timeout 30 gh pr merge`, `GH_REPO=… gh pr merge`, `gh api /graphql …mergePullRequest`)이 없는 PR로 질문 창 없이 거부됐다. 가드를 `deny`로 올리는 안은 사용자 결정(설정 deny만)과 어긋나 Backlog 23으로 남겼다.
  - 중요 2 반영: 필수 검사를 보호의 `checks[{context, app_id}]`로 읽고 그 앱의 check run만 센다. 여러 결과는 실패 > 대기 > 성공 순으로 닫힌 쪽이다.
  - 중요 3 반영: `merge-deny`가 `timeout`·`stdbuf`·`watch`·`sudo -u`·`nice`·`time`, `cmd /c`, `powershell`·`pwsh -Command`를 벗겨 읽는다.
  - 사소 1~7 반영(경로 인코딩, 보호에 필수 검사 없음, 409 옵션 대조, 상태 모름, 늦은 읽기, 병합 직전 재확인, 따옴표 없는 heredoc 치환). 사소 8·9와 남은 꼴은 Backlog 22~25. 새 사례 31건은 구현 전 실패를 봤다. 카드의 늦은 읽기 버림은 버튼을 끄는 쪽이 경합을 막아 테스트가 없다.
  - 하드 게이트 다섯 종 exit 0. `npm test` 449파일 통과·6 건너뜀, 8,153 통과·실패 0(06:12:35 시작). 실제 앱 프로브를 다시 돌려 2 통과했다. 이번엔 `hard-gates`가 성공이라 카드의 병합 버튼이 켜졌다(누르지 않았다). PR 74의 `hard-gates`(첫 커밋)는 통과했다.
- PASS 2026-11-18T06:20:11+09:00 — 9단계 마무리: 검수 반영 커밋 `5d291b4e`를 push했고, 그 머리에서 `hard-gates` 실행 44178234162가 통과했다(2분 24초). 실제 `merge-async` 호출은 한 번도 하지 않았다 — 병합 흐름은 주입 실행기 단위 테스트로만 고정됐고 409 본문 꼴은 가정이다. 첫 실제 호출은 사용자의 병합 버튼이다.

## 결정 대장

- [USER] 다음 로드맵 goal은 순서대로 「병합 버튼」이다 — 「4) → A 순서대로 「병합 버튼」」 (2026-11-18, 현황판 결정 응답, G6 결정 대장). 로드맵 일회 예외(2026-11-13)로 합의 문답 없이 시작한다.
- [USER] 병합은 PR 생성까지만 에이전트에 주고 사용자만 컨트롤하는 결정론적 기능으로 분화한다 (G8 결정 대장 [USER] 2026-11-17). 이 goal은 그 단계 A다.
- [USER] 병합은 비동기 API(`PUT .../merge-async`)로 부른다 — 「비동기 API」 (2026-11-18, 세션 문답. 추천은 동기 API였다). `sha`를 늘 싣고 `merge_method=merge`, `merge_action=direct_merge`, `bypass_rules=false`를 명시한다. 결과는 `GET .../merge-async/{uuid}`로 기다린다.
- [USER] CLI 쪽 거부는 설정 `deny`만으로 하고 가드는 손대지 않는다 — 「설정 deny만 (Recommended)」 (2026-11-18, 세션 문답). 공식 문서(`code.claude.com/docs/en/hooks`)가 「Deny and ask rules are still evaluated regardless of what the hook returns.」라고 적어, 가드 훅의 `ask`가 있어도 `deny` 규칙이 이긴다. 권한 문서는 규칙 중간의 `*`도 받는다(「A `*` can go anywhere in the rule」). 4단계 실측으로 확인한다.
- [USER] 필수 검사 이름을 보호 설정에서 못 읽으면 버튼을 끈다 — 「버튼을 끈다 (Recommended)」 (2026-11-18, 세션 문답). 이름은 base 브랜치 보호 API의 `required_status_checks.contexts`에서, 결과는 보인 머리 SHA의 check run·상태에서 읽는다. 서버도 같은 검사를 집행한다(`enforce_admins: true`).
- [USER] 병합 기록의 정본은 GitHub의 PR 병합 정보(병합한 사람, 병합 시각, 병합 커밋)다 — 「GitHub 병합 정보 (Recommended)」 (2026-11-18, 세션 문답). 앱 노드 기록(Backlog 13)이 아직 없어서다. 다음 종결 커밋에서 그 값을 결정 대장 `[USER]` 줄로 옮겨 적는다.

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
