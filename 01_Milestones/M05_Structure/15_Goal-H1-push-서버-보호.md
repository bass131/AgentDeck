# M05 H1 — push 서버 보호 · `master` 보호는 GitHub가 하고, 작업 브랜치 push는 묻지 않는다

- 마일스톤: M05 안에 끼운 하네스 goal (로드맵 2번, G2보다 먼저) · 작성: 2026-11-13 · 상태: 실행 중 · 검증 강도: 강
- 작업 브랜치: `chore/m05-h1-push-server-guard` — G2 문서 커밋(`9910a31`) 위에서 갈라졌다. 그래서 이 PR은 M04·G1 종결 기록과 G2 goal 문서를 함께 싣는다.
- 출처 요청: 「PR 생성까지는 Ask 안하고, Merge만 체크하는 방향으로 가는게 편하겠는데. 내가 자리 비울때도 작업 돌려야하면 중간에 멈추면 또 사고인데」(2026-11-13)

## 목표

goal 루프가 사용자 입력 둘(goal 합의, 병합 승인)로 돈다. `master` 직접 push·강제 push·삭제는 GitHub 서버가 거부하므로, 가드의 명령 판독이 틀려도 `master`가 바뀌지 않는다.

## 범위

- **만들 것**
  - GitHub 고전 브랜치 보호(`master`): PR 필수(승인 0명), 관리자에게도 적용, 강제 push 금지, 삭제 금지. 상태 검사 필수와 push 제한은 두지 않는다.
  - 가드 변경(기준 커밋의 셸 판독 그대로, 판독은 최선 노력이고 `master`는 서버가 받는다): 일반 `git push`는 질의하지 않는다. 강제 push(`--force`, `-f` 묶음, `--force-with-lease`, `--force-if-includes`, `+`로 시작하는 refspec)는 차단한다. 원격 삭제(`--delete`, `-d` 묶음, `:`로 시작하는 refspec), `--mirror`·`--all`·`--tags`·`--prune`, 토큰에 `master`가 글자로 보이는 push, `send-pack`은 질의한다.
  - 가드 추가: `gh api` 중 쓰기(`-X`·`--method`가 GET 아님, 또는 `-f`·`-F`·`--field`·`--raw-field`·`--input`이 있음)와 인자에 `protection`·`rulesets`가 보이는 호출은 질의한다. `gh repo edit`·`gh repo delete`도 질의한다.
  - 가드 추가(설정이 새로 여는 명령의 짝): `git switch -C`(브랜치 포인터 강제 이동) 차단, `git fetch`의 로컬 ref 덮어쓰기(`+`·`:` refspec, `--prune`과 refspec) 질의, `git -c alias.*=…push…` 질의.
  - 설정: `Bash(git push*)`를 `ask`에서 `allow`로 옮긴다. 실행 단계 명령 중 허용 목록에 없는 것(`npx eslint *`, `git fetch*`, `git switch *`, `date`, `date +%Y-%m-%dT%H:%M:%S%z`)을 넣는다. 검수 뒤 `date*`는 시각 설정 꼴을 열어 정확 일치로 좁혔고, `npx eslint*`는 다른 패키지(`npx eslint-…`)를 열어 공백 꼴로 좁혔다.
  - 헌법 두 파일 9·10조 개정, ADR-004 신설과 ADR-003 결정 2의 대체 표시, 템플릿·`/gate`·로드맵의 push 창 문구 갱신.
- **건드릴 곳**: 판정 장치 — `.claude/hooks/dangerous-cmd-guard.mjs`, `.claude/hooks/dangerous-cmd-guard.test.mjs`(와 push 질의를 단언하는 다른 훅 테스트), `.claude/settings.json`, `CLAUDE.md`, `AGENTS.md`, `.claude/commands/gate.md`. 그 밖에 `98_Management/00_ADR/`, `00_Documents/02_Rules/04_Goal-한장-템플릿.md`, `01_Milestones/`, `98_Management/01_GateState/gate-config.json`의 포인터. GitHub 저장소 설정(브랜치 보호).
- **하지 않을 것**: 앱 소스와 앱 테스트 변경, 가드의 통과 판정 신설(가드는 여전히 `allow`를 내지 않는다), GitHub Actions·필수 상태 검사, push 목적지를 저장소 상태로 판정하는 장치(ADR-003의 실패한 설계), G2 구현.
- **완료조건**
  - `gh api repos/bass131/AgentDeck/branches/master/protection`이 PR 필수(승인 0), `enforce_admins` 켜짐, 강제 push·삭제 금지를 돌려준다.
  - 이 goal의 PR push가 승인 창 없이 지나가고, hook-log에 그 push의 `cmd-guard` 질의 줄이 없다.
  - 가드 테스트에 새 규칙의 통과·질의·차단 사례가 있고 「명시적 통과 0건」 불변식이 유지된다.
  - 하드 게이트 다섯 종 exit 0, `npm test` 실패 0.

## Phase 1 — push 서버 보호 · 태그: `harness`·`guard`·`github` · 의존: 없음

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. 이 goal 문서, 포인터 전환, pin 갱신
- [x] 2. `master` 브랜치 보호 적용과 API 읽기 대조 — 가드를 풀기 전에 한다
- [x] 3. 가드 규칙 변경과 테스트(`dangerous-cmd-guard.mjs`·`.test.mjs`, push를 단언하던 `cmd-guard-equivalence`·`cmd-guard-surface`·`cmd-guard-log` 테스트, 사람용 정본 `M02_Hardening/02_동등성-기준표.md`의 PU 행)
- [x] 4. 헌법 9·10조, ADR-004, ADR-003 대체 표시, 템플릿·`/gate`·로드맵 문구
- [x] 5. `settings.json`과 그 단언 `settings-matcher.test.mjs` ④ 구획 — 하네스 편집의 마지막
- [x] 6. 강 등급 검증 — 구현 문맥 없는 검수자, 하드 게이트 다섯 종, `npm test` 차분
- [>] 7. 커밋, 작업 브랜치 push(창이 안 떠야 한다), PR 생성, hook-log 대조, 결과 보고, 병합 승인

실행 단계 일괄 승인 대상 (사용자가 하네스 설계 문답에서 승인했다)

- `gh api -X PUT repos/bass131/AgentDeck/branches/master/protection`(보호 적용, 한 번)과 같은 경로의 GET 읽기
- `npm run typecheck:node`·`typecheck:web`·`lint`·`test:hooks`·`build`, `npm test`
- `worker`(가드 구현)·`reviewer`(검수) 하위 에이전트 기동
- 커밋, 작업 브랜치 push, `gh pr create`, 병합 승인 다이얼로그(`gh pr merge`)

DoD

- 보호 설정 API 응답이 완료조건 첫 항목과 같다.
- 가드가 어떤 명령에도 `permissionDecision: "allow"`를 내지 않는다(테스트 불변식).
- 기준 판독이 읽는 강제 push 꼴은 차단, 원격 삭제·`master` 글자·`--mirror` 류는 질의, `git push -u origin <작업 브랜치>`는 무출력이다. 각 꼴이 테스트에 있다.
- 기준 커밋 `9910a31` 대비 push 밖 규칙(rm, reset, clean, checkout, restore, branch -D 등)에 회귀가 없고, 정상 루프 명령(heredoc 커밋·PR 본문 포함)에 새 질의·차단이 없다.
- `gh api` 쓰기·보호 경로 호출과 `gh repo edit`은 질의, `gh api` GET 읽기는 무출력이다.
- 두 헌법의 조항 문면이 같다. 마크다운 문서는 250줄 이하다.

검증 기록

- PASS 2026-11-13T22:43:45+09:00 — 2단계: `gh api -X PUT …/branches/master/protection`으로 보호를 적용했고, GET 읽기가 `required_approving_review_count` 0, `enforce_admins.enabled` true, `allow_force_pushes.enabled` false, `allow_deletions.enabled` false, `required_status_checks`·`restrictions` null을 돌려줬다. 가드와 설정은 아직 그대로다. 세션 df394581, 기준 HEAD `9910a31`.
- PASS 2026-11-13T23:08:06+09:00 — 하드 게이트 다섯 종 exit 0(`test:hooks`는 settings 변경 뒤 재실행), `npm test` 411파일 통과·6 skip·수집 417, 실패 0. 이 줄은 아래 FAIL의 수정 전 상태이며 수정 뒤 다시 돌린다. 세션 df394581.
- FAIL 2026-11-13T23:08:06+09:00 — 6단계 독립 검수(fable) 불통과. 무엇이 실패했나: 줄 이음(`\`+개행), `2>&1`의 `&`, 붙여 쓴 리다이렉트(`-f>/dev/null`), 아포스트로피가 든 주석 줄 뒤의 꼴에서 강제 push·원격 삭제·`--mirror`·`--tags`·보호 경로 `gh api`가 무출력으로 지나갔다(일부는 기준 커밋에서 차단·질의되던 회귀). 테스트가 그 꼴을 `expectNoPass`로만 묶어 새는 것을 못 잡았고, 설정의 `git switch *`·`git fetch*`·`date*`가 가드 규칙 없는 꼴(`switch -C`, fetch `+`refspec, `date -s`)을 열었으며, 주석의 `master`가 작업 브랜치 push에 질의를 띄웠다. 시도한 것: 가드 규칙을 토큰 전체 일치 판독으로 바꾸고 push·gh 사례 150여 건을 더했다 — 셸 분할 단계의 사각은 손대지 않았던 것이 원인이다. 세션 df394581.
- PASS 2026-11-13T23:43:40+09:00 — 재수리 뒤 하드 게이트 다섯 종 exit 0, `npm test` 411파일 통과·6 skip·수집 417, 실패 0(23:24 실행). 세션 df394581.
- FAIL 2026-11-13T23:43:40+09:00 — 6단계 2차 독립 검수(fable) 불통과. 무엇이 실패했나: 새 셸 전처리(주석 제거·리다이렉트 토큰 처리·이스케이프 해제)가 heredoc 커밋 메시지 안의 `"`·`#`, 백슬래시로 이스케이프한 메타문자(`\>`, `\ #`, `\;`), `$'\x66'`·`$"…"`에서 인용 상태를 어긋나게 읽어, 뒤에 이은 강제 push를 무출력으로 보냈고 기존 `git reset --hard` 규칙도 다섯 꼴에서 무출력으로 떨어뜨렸다. 같은 원인으로 정상 heredoc 커밋·PR 본문에 새 질의·차단이 생겼고, 테스트는 못 읽는 꼴을 `master`로만 고정했다. 시도한 것: 1차 결함대로 줄 이음 결합, `&` 분할 예외, 리다이렉트 토큰 경계, 주석 제거, 이스케이프 해제, 제어 구문 머리 벗기기를 넣고 사례를 492건으로 늘렸다. 1차의 네 꼴은 고쳐졌지만 판독을 넓힐수록 새 사각과 회귀가 나왔다 — M04의 여섯 번 불통과와 같은 비수렴 신호다. 세션 df394581.
- USER-INPUT 2026-11-14T00:20:00+09:00 — FAIL 2회째에서 방향을 물었고, 사용자가 「push는 허용으로 가되 작업별로 브랜치를 나눠서 컨트롤, master 브랜치에 merge하기전에 PR까지 생성 자율로 진행」으로 답했다(2026-11-13 23:44경, 결정 대장 [USER] 줄). 이 줄이 FAIL 집계의 기준점이다. 세션 df394581.
- PASS 2026-11-14T00:20:00+09:00 — 6단계 3차 독립 검수(fable) 통과: 차단 0. 기준 가드 대비 약 570건 대조에서 push 밖 규칙의 약해진 판정 0, allow 출력 0, 기준 판독이 읽는 강제 push 96건 DENY, 원격 삭제·일괄·`master`·send-pack 38건과 `gh api` 쓰기·보호 경로·`gh repo edit/delete` 47건 ASK. 검수 뒤 메인 세션이 고친 것: 중요 1(리다이렉트·주석·옵션 값이 붙은 정상 `git fetch --prune`에 질의가 뜨던 오탐 — refspec 후보에서 제외), 경미 2(기준 판독이 읽는 세 꼴을 `expectAsk`로), 경미 3·4(이 문서와 pin 문면). 가드 테스트 566건·`npm run test:hooks` exit 0. 경미 1(짝 없는 `"`가 든 heredoc 본문의 새 규칙 낱말)은 기준 판독의 기존 한계로 감수한다. 세션 df394581.
- PASS 2026-11-14T00:28:21+09:00 — 최종 트리의 하드 게이트 다섯 종 exit 0(`test:hooks`는 fetch 수정 뒤 00:20 실행). `npm test`는 00:21 실행에서 25파일·128건이 실패했으나 전부 5초 시간 초과였다. 같은 시각 사용자 PC에 게임 프로세스(메모리 8GB)가 떠 있어 실행 시간이 66초에서 180초로 늘었다. 진단으로 `npx vitest run --testTimeout=60000 --hookTimeout=60000`을 돌려 411파일 통과·6 skip·수집 417, 실패 0을 확인했다. 앱 소스는 이 goal에서 변경 0이고, 23:24의 기준 명령 실행은 실패 0이었다. 세션 df394581.

## 결정 대장

- [USER] 이 로드맵의 goal들은 헌법 11조의 예외로 합의 문답 없이 이어서 진행한다. 사용자가 「이번 순서만 예외로 이어서 처리」로 답했다 (로드맵 문답, 2026-11-13)
- [USER] 작업 브랜치 push의 승인 창을 없애고 병합만 묻는다. `master` 보호는 GitHub 서버 보호가 맡는다. 사용자가 「서버 보호로 질의 제거」로 답했다 (push 질의 문답, 2026-11-13)
- [USER] 이 하네스 변경을 G2 PR보다 먼저 병합한다. 사용자가 「지금 G2보다 먼저」로 답했다 (끼울 시점 문답, 2026-11-13)
- [USER] 보호 설정은 고전 브랜치 보호로 PR 필수(승인 0명)·관리자 적용·강제 push 금지·삭제 금지다. 사용자가 하네스 설계 문답에서 「넷 다 승인」으로 답했다 (2026-11-13)
- [USER] 가드는 일반 push를 묻지 않고, 강제 push는 차단하며, 원격 삭제 push와 `master`가 글자로 보이는 push는 묻는다. 같은 문답에서 승인됐다 (2026-11-13)
- [USER] 보호 설정을 바꾸는 `gh api` 호출은 가드가 묻고, 헌법에 보호 설정 변경은 사용자 전용임을 넣는다. 같은 문답에서 승인됐다 (2026-11-13)
- [USER] 실행 단계 명령이 권한 창 없이 돌도록 허용 목록을 점검한다. 같은 문답에서 승인됐다 (2026-11-13)
- [USER] 2차 검수 FAIL 뒤 방향: 작업 브랜치 강제 push를 서버 ruleset으로 막지 않는다. push는 허용하고 작업별 브랜치 분리로 통제하며, 병합 전 PR 생성까지 자율로 간다. 가드가 못 읽는 꼴의 작업 브랜치 강제 push는 그 브랜치 안의 감수 위험이다. 사용자가 「push는 허용으로 가되 작업별로 브랜치를 나눠서 컨트롤, master 브랜치에 merge하기전에 PR까지 생성 자율로 진행」으로 답했다 (강제 push 문답, 2026-11-13)
- [AI] 위 답에 따라 2차 수리의 셸 전처리(주석 제거·리다이렉트 토큰·이스케이프 해제 등)는 되돌리고 기준 커밋 `9910a31`의 셸 판독 위에 push·gh 규칙과, 설정이 새로 여는 switch·fetch의 짝 규칙만 얹는다. 전처리가 기존 `reset --hard` 규칙을 회귀시키고 정상 heredoc 커밋에 질의·차단을 만들어, 무인 루프에 더 해롭기 때문이다 (2026-11-13)
- [AI] 이 브랜치를 G2 문서 커밋 위에서 가른다. 포인터 파일의 충돌 없이 G2가 이 goal 병합 뒤 바로 이어지게 하려는 것이다. PR 본문에 G2 문서가 함께 실린다고 밝힌다 (2026-11-13)
- [AI] `gh api`의 쓰기 판정은 메서드 옵션과 필드 옵션으로 한다. `gh api`는 필드 옵션이 있으면 기본 메서드가 POST가 되기 때문이다. `--mirror`·`--all`·`--tags`·`--prune`은 여러 ref를 한 번에 바꾸므로 질의에 넣는다 (2026-11-13)
- [AI] 서버 보호를 가드 완화보다 먼저 적용한다. 가드 파일은 작업 트리에서 바로 읽혀서, 편집하는 순간부터 효력이 생기기 때문이다 (2026-11-13)
