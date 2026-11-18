# M07 G12 — 가드 병합 차단 · 위험 명령 가드가 병합을 묻지 않고 막는다

- 마일스톤: M07 사용자 컨트롤 · 작성: 2026-11-18 · 상태: 종결 (PR 81, master `afcb0006`) — 독립 검수 반영은 종결 기록 PR에서 · 검증 강도: 강(판정 장치 변경)
- 작업 브랜치: `feat/m07-g12-guard-merge-block` — master `45bd65d6`(PR 80)에서 갈랐다.
- 출발점: Backlog 23과 결정 대장 [USER] 두 줄.

## 목표

이 goal이 끝나면 위험 명령 가드(`.claude/hooks/dangerous-cmd-guard.mjs`)가 에이전트의 PR 병합 시도를 승인 창 없이 차단한다.
지금은 가드가 `gh pr merge`를 「묻기」로 내고, 설정 `deny`의 글자 꼴에 맞지 않는 꼴(`bash -c "gh pr merge …"`, `sudo gh …`, `GH_REPO=… gh …`)은 그 묻기에만 기댄다. 권한 창을 생략하는 모드면 사람 없이 지나갈 수 있다.

## 범위

- **만들 것**
  - **`gh-pr-merge` 차단** — 가드의 묻기 목록에서 차단 목록으로 옮긴다. 가드가 이미 읽는 꼴(래퍼, `VAR=값` 머리, `bash -c` 문자열, 경로 붙은 `gh`, `gh -R`·`--repo` 옵션 앞붙임, `\` 줄 이음)이 모두 차단이 된다. 차단 안내는 「외부 셸에서 실행」이 아니라 병합 길(현황판 병합 카드, 앱 PR 카드, GitHub 웹, 사용자가 직접 치는 한 줄)을 알린다.
  - **`gh api` 병합 차단** — 끝점 낱말이 `…/pulls/<번호>/merge`이고 쓰기 호출(`ghApiWrites`)이면 차단한다. 같은 끝점의 GET(병합 여부 읽기)과, 본문 글에 그 글자가 든 다른 호출은 막지 않는다.
  - **GraphQL 병합 차단** — `gh api graphql`의 필드 값에 `mergePullRequest` 또는 `enablePullRequestAutoMerge`가 보이면 차단한다.
  - **`timeout` 래퍼** — `timeout [옵션] <시간> <명령>`의 명령 위치를 읽는다. 지금은 `timeout 30 gh pr merge`를 가드가 읽지 못하고 설정 `deny`만 막는다.
- **건드릴 곳**
  - **판정 장치(헌법 3조, 이름으로)**: `.claude/hooks/dangerous-cmd-guard.mjs`, `.claude/hooks/dangerous-cmd-guard.test.mjs`, `.claude/hooks/cmd-guard-equivalence.test.mjs`(GH-04), 규칙 목록을 가정하는 다른 훅 시험(`cmd-guard-surface.test.mjs`·`cmd-guard-log.test.mjs`, 필요할 때만), `CLAUDE.md`·`AGENTS.md` 10조(두 파일 diff 0), `98_Management/01_GateState/gate-config.json`의 `planPath`(1단계).
  - 문서: `.claude/commands/gate.md` 병합 문단, 이 goal 문서, `M07_Controls/01_Work_Pin.md`·`99_Backlog.md`.
- **하지 않을 것**
  - `.claude/settings.json`은 건드리지 않는다. 너무 넓은 `Bash(gh api *pulls/*/merge*)` 거부도 이번에 좁히지 않는다.
  - 가드가 읽지 못하는 꼴을 쫓지 않는다 — 변수·명령 치환으로 가려진 명령, gh 별칭, `cmd /c`·`powershell -c`, `node -e`·`python -c` 같은 해석기 안 코드, 스크립트 파일, `--input`·`-F query=@파일`(파일 내용). 마지막 둘은 지금처럼 `gh-api-쓰기` 묻기다. 나머지는 헌법 10조의 규범(거부를 피하려고 꼴을 바꾸지 않는다)과 앱 잠금 노드가 맡고, Backlog에 남긴다.
  - 앱의 잠금 노드(`mergeDeny.ts`)는 고치지 않는다. 가드와 어긋나는 꼴은 Backlog에 남긴다.
  - 사용자의 `!` 명령은 이 훅을 지나지 않는다 — 훅 로그에 PR 74·77의 `!` 병합 기록이 없다(2026-11-18 확인). 그래서 사용자의 길은 그대로다.
- **완료조건**
  - 훅 시험 단정: 병합 꼴(`gh pr merge`와 그 변형, `timeout`·`sudo`·`env`·`bash -c` 감싼 꼴, `gh api -X PUT …/pulls/N/merge`, GraphQL 병합 두 낱말)은 차단(exit 2)이고 안내에 병합 길이 있다. 오탐 꼴(`git commit -F -` heredoc 본문의 병합 한 줄, `gh pr create --body`의 병합 한 줄, `echo`·`grep`·`git log --grep`의 글자, `gh pr create --title merge`, `…/pulls/12/merge` GET)은 무출력이다. 새 단정은 실패를 먼저 본다.
  - 하드 게이트 다섯 종 exit 0(`test:hooks` 포함), `npm test` 실패 0, PR의 `hard-gates` 통과.
  - 실제 경로: 이 세션에서 없는 PR 번호(999999)로만 대표 꼴을 보내, 훅 로그에 `block gh-pr-merge`·새 규칙 판정이 남고 GitHub에 아무 일도 없다.
  - `CLAUDE.md`·`AGENTS.md` 10조가 「가드도 병합을 다이얼로그 없이 차단한다」로 같게 고쳐져 있다(diff 0).
  - 구현 문맥 없는 검수자 1회(우회 꼴과 오탐 둘 다)의 지적이 반영되거나 Backlog로 넘어가 있다.

## Phase 1 — 가드 병합 차단 · 태그: `guard` · 의존: G8

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. goal 준비 — 이 문서, `planPath` 전환(판정 장치), pin
- [x] 2. 테스트 먼저 — 가드 시험의 병합 기대를 차단으로 뒤집고 새 꼴·오탐 단정을 쓴 뒤 실패를 본다(`dangerous-cmd-guard.test.mjs`, `cmd-guard-equivalence.test.mjs`)
- [x] 3. 가드 고치기 — `dangerous-cmd-guard.mjs`에 병합 차단 세 규칙, `timeout` 래퍼, 병합 안내
- [x] 4. 헌법 10조와 문서 — `CLAUDE.md`·`AGENTS.md` 같은 문장, `gate.md`
- [x] 5. 하드 게이트 다섯 종, `npm test`
- [x] 6. 실제 경로 — 없는 PR 번호로 대표 꼴을 보내 훅 로그를 본다
- [x] 7. 커밋, push, PR 생성, pin 「(병합 대기, PR N)」, 병합 감시
- [x] 8. 독립 검수 1회와 반영, push, 결과 보고 — PR 81이 검수 도중 병합되어, 반영은 종결 기록 PR에서 한다
- [x] 9. 검수 반영(판정 장치, 이름으로) — `dangerous-cmd-guard.mjs`(heredoc 면제의 파이프라인 단위 판정, 래퍼·제어 낱말 표, `timeout` 변형, 끝점의 리다이렉트, `merge-async`·`enqueuePullRequest`, `merge>` 동사), `dangerous-cmd-guard.test.mjs`

실행 단계 일괄 승인 대상 (로드맵 일회 예외로 합의 문답 없이 시작한다)

- 훅 시험, `node --test`, vitest, 하드 게이트 다섯 종, `npm test`, `npm run build`, 없는 PR 번호(999999)로만 하는 가드 실측, 읽기 전용 `gh`, 독립 검수 하위 에이전트, 커밋, 작업 브랜치 push, `gh pr create`, 병합 감시

이 goal의 PR 병합

- 사용자가 한다(현황판 병합 카드, 앱 PR 카드, GitHub 웹, 또는 `gh pr merge <번호> --merge --match-head-commit <SHA>`).

DoD

- 위 완료조건 다섯.
- 마크다운 문서 250줄 이하.

검증 기록

- PASS 2026-11-18T12:55:54+09:00 — 1~6단계: 이 문서를 쓰고 `planPath`를 전환했다. 먼저 사용자의 `!` 병합이 훅을 지나는지 훅 로그로 봤다 — PR 74·77의 `!` 병합 줄이 없어 지나지 않는다. 가드 시험의 병합 기대를 차단으로 뒤집고 새 꼴(래퍼·`bash -c`·`timeout`·`gh api` 끝점·GraphQL)과 오탐 꼴(heredoc 커밋·PR 본문, `echo`·`grep`·`git log --grep`, 같은 끝점 GET)을 더해 실패 52건을 먼저 봤다. 가드에 `MERGE_BLOCK` 세 규칙(`gh-pr-merge`를 묻기에서 옮김, `gh-api-병합`, `gh-graphql-병합`), `timeout` 래퍼, 병합 길 안내를 넣었다. 짧은 옵션 묶음(`-Xput`)을 끝 글자로 잘못 읽던 첫 구현을 앞에서부터 읽게 고쳤다. 필드가 붙은 GraphQL 읽기를 무출력으로 기대한 내 단정은 기존 설계(gh가 POST로 보냄 → 묻기)와 어긋나 묻기로 고쳤다. 헌법 10조를 두 파일에 같게 고쳤다(조항 diff 0), `gate.md`도. 가드 시험 926 통과·실패 0, 동등성 100 통과(GH-04 deny), 하드 게이트 다섯 종 exit 0, `npm test` 8,153 통과·실패 0(12:52:24 시작). 이 세션에서 없는 PR 999999로 다섯 꼴(`gh pr merge`, `bash -c`, `timeout 30`, `gh api -X PUT …/pulls/999999/merge`, GraphQL `mergePullRequest`)을 보내 모두 질문 없이 차단됐고 훅 로그에 `deny gh-pr-merge`·`gh-api-병합`·`gh-graphql-병합`이 남았다. `echo "gh pr merge 999999 --merge"`는 그대로 실행됐다.
- PASS 2026-11-18T14:12:29+09:00 — 7~9단계와 종결: PR 81을 열고 감시를 걸었다. 사용자가 PR 81을 독립 검수 도중 병합했다(GitHub 재조회 — `MERGED` 2026-11-18T04:00:04Z, 병합 커밋 `afcb0006`, 머리 `800817e6`, 병합자 bass131). 검수자(Opus, 구현 문맥 없음)는 차단 0, 중요 3, 사소 7을 냈고 기준 가드 대비 약 190개 명령에서 「묻기·차단→통과」 회귀 0건을 확인했다. 반영은 master에서 딴 종결 기록 브랜치에서 했다. 중요 1(루프의 `git add … && git commit -F - <<'EOF'` 꼴에서 본문의 병합 한 줄을 차단하는 오탐): heredoc 면제를 그 heredoc이 든 파이프라인으로 판정하되, 그룹·서브셸·명령 치환이 없고 그 파이프라인이 줄의 마지막일 때만 쓴다(첫 구현은 `{ echo; cat <<EOF; } | bash` 면제와 HD-17 회귀, 큰 입력 52초를 냈고 고쳤다). 중요 2·3: 앱 잠금 노드의 래퍼·제어 낱말 표를 가드 `commandsOf`로 옮기고(`for … do`·`then`·`!`·`exec`·`eval`·`sudo -u`·`xargs -n`·`stdbuf`·`nice -n`), `timeout.exe`·`-vs`·`--sig`를 읽는다. 사소: 끝점 앞 리다이렉트, `merge>` 동사, `merge-async`, `enqueuePullRequest`. 나머지(`--body-file -` 면제, `-X GET -f`, `2>&1` 뒤 끝점)는 Backlog 34. 새 단정은 실패 24건을 먼저 봤다. 가드 시험 971 통과·실패 0, 훅 시험 전부 통과, 하드 게이트 다섯 종 exit 0, `npm test` 8,153 통과·실패 0(14:09:14 시작).

## 결정 대장

- [USER] 위험 명령 가드의 병합 규칙도 질문에서 차단으로 올린다 — 「OK 가드도 Deny」 (2026-11-18, G8 세션 문답, G8 결정 대장에서 옮김).
- [USER] G11 다음 goal은 가드 병합 차단이다 — 「현황판 결정 응답: 1) G11 다음 goal을 무엇으로 할지 → A 가드 병합 차단 먼저」 (2026-11-18, 결정 보드 `m07-next-goal-after-g11`).
- [AI] 가드는 읽을 수 있는 꼴의 닫힌 목록만 막고, 읽지 못하는 꼴은 범위 밖으로 둔다. `gh api`는 끝점 낱말과 쓰기 여부로 판정해 설정 `deny`보다 좁게 잡는다 — 차단은 루프를 멈추므로 오탐 비용이 묻기보다 크다 (2026-11-18).

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
