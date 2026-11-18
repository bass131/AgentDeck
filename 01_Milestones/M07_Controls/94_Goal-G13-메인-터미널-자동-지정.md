# M07 G13 — 메인 터미널 자동 지정 · 현황판이 결정 응답을 넣을 Claude 터미널을 스스로 찾는다

- 마일스톤: M07 사용자 컨트롤 · 작성: 2026-11-18 · 상태: 병합 대기 (PR 83) · 검증 강도: 강(바깥 쓰기의 대상을 바꾼다)
- 작업 브랜치: `feat/m07-g13-terminal-auto` — master `ff7445eb`(PR 82)에서 갈랐다.
- 출발점: Backlog 31과 결정 대장 [USER] 2026-11-18.

## 목표

이 goal이 끝나면 세션을 새로 열어도 현황판의 결정 응답 「넣기」가 손 설정 없이 메인 Claude 입력창에 들어간다.
지금은 `config.local.json`의 `mainTerminalHandle`을 세션마다 손으로 고쳐야 하고, 낡으면 「메인 입력창에 넣지 못했어요」로 실패한다(2026-11-18 실제 발생).

## 범위

- **만들 것**
  - **터미널 찾기** — `lib/deliver.mjs`에 읽기 하나를 더한다. `orca terminal list --worktree path:<repoPath> --json`을 인자 배열로, 셸 없이, 시간 제한을 두고 부른다. 후보는 작업 폴더가 `repoPath`와 같고(슬래시·대소문자 무시), `agentIdentity`가 정확히 `claude`이고, 연결돼 있고 쓸 수 있고 고아가 아니며, handle 형식이 맞는 터미널이다.
  - **고르는 규칙** — 후보가 정확히 하나면 그것에 넣는다. 여럿이면 설정 `mainTerminalHandle`이 그 안에 있을 때만 그것에 넣고, 아니면 넣지 않는다. (검수 반영: 설정이 있으면 후보가 하나여도 설정만 따른다 — 결정 대장 [AI].) 없음·여럿·목록이 잘림(`truncated`)·Orca에 닿지 못함은 모두 넣지 않고 지금처럼 문장 복사를 안내한다(이유 글에 handle을 싣지 않는다). Orca에 닿지 못할 때만 설정 handle을 그대로 쓴다(지금 동작).
  - **서버** — 넣기 직전에 한 번 찾는다(넣을 때마다, 수집 때는 부르지 않는다). 겹침 막기(`sending`)는 찾기 전에 건다. 찾기는 `createDashboard` 인자(`findMain`)로만 바꿔 끼운다. 넣기 버튼 표시(`answer.canType`)는 설정 handle이 있거나 찾기가 연결돼 있으면 참이다.
- **건드릴 곳**
  - `99_Others/Dashboard/`(`lib/deliver.mjs`, `server.mjs`, `test/`, `README.md`, `docs/결정-응답.md`). 개인 설정 `config.local.json`의 `mainTerminalHandle`은 비운다(자동이 기본, 지정은 터미널이 여럿일 때만).
  - **판정 장치(헌법 3조, 이름으로)**: `98_Management/01_GateState/gate-config.json`의 `planPath`(1단계).
  - 문서: 이 goal 문서, `M07_Controls/01_Work_Pin.md`·`99_Backlog.md`.
- **하지 않을 것**
  - 세션 시작 훅이 handle을 적는 길, 화면에서 handle 고르기, 여러 후보 가운데 추측해 고르기(제목·최근 출력 등).
  - Enter 누르기, 다시 시도하기 — 넣기 규칙은 그대로다.
- **완료조건**
  - `node --test` 단정: 찾기 인자 배열·셸 없음·시간 제한, 후보 거르기(다른 폴더·`codex`·끊김·쓰기 불가·고아·틀린 handle), 고르는 규칙(하나·여럿+설정·여럿·없음·잘림·Orca 실패), 서버가 찾은 handle로 한 번 넣고 못 찾으면 넣지 않고 복사 안내, 찾는 동안 겹친 두 번째 요청은 409. 새 단정은 실패를 먼저 본다.
  - 하드 게이트 다섯 종 exit 0, `npm test` 실패 0, 현황판 시험 전부 통과, PR의 `hard-gates` 통과.
  - 실제 경로: 낡은 handle을 설정으로 넘긴 실측 서버(포트 따로, 넣기 함수는 기록만)가 진짜 Orca 목록에서 이 세션의 `$ORCA_TERMINAL_HANDLE`을 고른다. 실제 현황판(4319)을 새 코드로 다시 띄우고 탭을 새로고침한다.
  - 구현 문맥 없는 검수자 1회(엉뚱한 터미널에 넣는 상황 중심)의 지적이 반영되거나 Backlog로 넘어가 있다.

## Phase 1 — 메인 터미널 자동 지정 · 태그: `source` · 의존: M05 H7

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. goal 준비 — 이 문서, `planPath` 전환(판정 장치), pin
- [x] 2. 테스트 먼저 — 찾기·고르기·서버 넣기 단정을 쓰고 실패를 본다
- [x] 3. 구현 — `deliver.mjs` 찾기, `server.mjs` 넣기 길, 문서
- [x] 4. 하드 게이트 다섯 종, `npm test`, 현황판 시험
- [x] 5. 실제 경로 — 낡은 handle 실측 서버, 4319 다시 띄우기
- [x] 6. 커밋, push, PR 생성, pin 「(병합 대기, PR N)」, 병합 감시
- [x] 7. 독립 검수 1회와 반영, push, 결과 보고

실행 단계 일괄 승인 대상 (로드맵 일회 예외로 합의 문답 없이 시작한다)

- `node --test`, vitest, 하드 게이트 다섯 종, `npm test`, `npm run build`, 읽기 전용 `orca terminal list`, 실측 서버(넣기는 기록만) 기동·종료, 현황판 다시 띄우기, Orca 브라우저 새로고침, 독립 검수 하위 에이전트, 커밋, 작업 브랜치 push, `gh pr create`, 병합 감시

이 goal의 PR 병합

- 사용자가 한다(현황판 병합 카드, 앱 PR 카드, GitHub 웹, 또는 `gh pr merge <번호> --merge --match-head-commit <SHA>`).

DoD

- 위 완료조건 넷.
- 마크다운 문서 250줄 이하.

검증 기록

- PASS 2026-11-18T15:22:32+09:00 — 1~5단계: 이 문서를 쓰고 `planPath`를 전환했다. 먼저 Orca를 실측했다 — `orca terminal list --worktree path:<폴더> --json`이 `worktreePath`·`agentIdentity`·`connected`·`writable`·`orphaned`·`truncated`를 주고, 역슬래시·소문자 경로도 받으며, 없는 폴더는 exit 1과 `selector_not_found`다. `find-main.test.mjs`(찾기 인자·후보 거르기·고르는 규칙·닿지 못함·서버 넣기 길·찾는 동안 겹침 409)를 먼저 써 실패를 봤다. `lib/deliver.mjs`에 `findArgs`·`pickMain`·`findMainTerminal`, `server.mjs`에 `findMain` 주입·찾기 전 겹침 막기·못 찾으면 복사·`canType`을 넣었다. `answer.test.mjs`는 찾기를 꺼 설정 handle 길을 그대로 본다. README·`docs/결정-응답.md`를 고쳤다. 실측 서버(포트 4397, 낡은 handle `term_00000000-…`을 설정으로, 넣기는 기록만)가 진짜 Orca 목록에서 이 세션의 `$ORCA_TERMINAL_HANDLE`(`term_45547189-…`)을 골라 한 번 넣었다(`match: true`). 개인 설정 `mainTerminalHandle`을 `null`로 비우고 4319를 다시 띄워 탭을 새로고침했다 — `canType` 참. 현황판 시험 253 통과, 하드 게이트 다섯 종 exit 0, `npm test` 8,153 통과·실패 0(15:19:44 시작).
- PASS 2026-11-18T15:41:05+09:00 — 7단계: 독립 검수(구현 문맥 없는 Opus `reviewer`)는 차단 0, 중요 3, 사소 3이었다. 중요 1(찾는 동안 결정 목록이 바뀌면 낡은 문장이 들어감)은 찾은 뒤 문장을 다시 만들어 다르면 409로 막았다. 중요 2(Orca의 정상 거절도 「닿지 못함」으로 쳐 설정 handle에 넣음)는 「닿지 못함」을 실행 실패·시간 초과·읽을 수 없는 출력으로 좁혔다. 중요 3(설정을 넘어 하나뿐인 후보를 고름)은 설정이 있으면 설정만 따르게 했다. worker pane 가려내기와 사소 지적은 Backlog 35, docs 실측 절은 고쳤다. 시험을 먼저 고쳐 실패 3을 봤다. 실측 서버를 두 경우로 다시 돌렸다 — 설정 없음은 이 세션 `$ORCA_TERMINAL_HANDLE`에 한 번 넣었고, 낡은 설정은 넣지 않고 복사 안내였다(`match: true`). 그래서 첫 PASS의 「낡은 handle 설정에서도 이 세션을 고른다」는 검수 반영으로 「넣지 않는다」로 바뀌었다. 현황판 시험 254 통과, 하드 게이트 다섯 종 exit 0, `npm test` 8,153 통과·실패 0(15:37:59 시작), 4319를 다시 띄워 탭을 새로고침했다(`canType` 참).

## 결정 대장

- [USER] G12 다음 goal은 메인 터미널 자동 지정이다 — 「현황판 결정 응답: 1) G12 다음 goal을 무엇으로 할지 → A 메인 터미널 자동 지정」 (2026-11-18, 결정 보드 `m07-next-goal-after-g12`).
- [AI] 넣을 때마다 Orca 목록에서 이 저장소의 Claude 터미널을 찾고, 정확히 하나일 때만 자동으로 넣는다. 여럿이면 설정 지정이 그 안에 있을 때만 넣고, 추측하지 않는다 — 엉뚱한 세션에 글이 들어가는 것이 복사 한 번보다 비싸다 (2026-11-18). 검수 반영으로 좁혔다: 설정 지정이 있으면 후보가 하나여도 설정만 따르고, Orca가 읽히는 답으로 거절하면 설정 handle로 넣지 않으며, 찾는 동안 결정 목록이 바뀌면 넣지 않는다. worker 가려내기는 Backlog 35 (2026-11-18).

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
