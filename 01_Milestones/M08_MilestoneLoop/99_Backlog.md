# M08 Backlog

- 범위 밖 발견을 한 줄로 남긴다(헌법 11조). 최신 번호가 위다.

## 닫힘 (M11)

M11 Backlog 정리(`01_Milestones/M11_BacklogSweep/`)가 닫은 항목이다. 아래 항목 줄은 그대로 두고 닫힘은 이 표가 갖는다. 표에 없는 항목은 M11 goal 2~9가 고치면서 더한다.

| 항목 | 닫힘 | 근거 |
|---|---|---|
| 1 | v2로 | M11 스펙 결정 대장 [USER] 2회차 — 규칙 파일 넣기는 가드 재설계와 함께 「이번엔 안 한다」. |
| 2 | 고침(M11 goal 8) | `375c1e37`·`48a9baef` — 가드가 작업 폴더의 현재 브랜치(`.git` 폴더 또는 worktree의 `gitdir:` 파일이 가리키는 `HEAD`)를 읽어 `master`면 맨 push(원격만)·`HEAD` push·병합을 묻고, 같은 명령 안에서 `master`로 옮긴 뒤(`switch`·`checkout master`, `checkout -B master`, `--track <원격>/master`, `rebase <위> master`)의 같은 꼴도 묻는다. 이전 브랜치로 가는 `-`·`@{-N}`은 대상을 못 읽어 묻는 쪽으로 본다(독립 검수 반영). `git branch -M master`는 차단이다(M05-8). 읽기에 실패하면 지금 판정 그대로라 질의를 더할 뿐 빼지 않는다(ADR-003의 통과 판정과 다르다). 「서버 보호에 맡기는 꼴」 묶음의 나머지는 M11 Backlog 75. |
| 3 | 고침(M11 goal 8) | `ac73f0ac` — 공식 permissions 문서 「Rules are evaluated in order: deny, then ask, then allow. The first match in that order determines the outcome, and rule specificity doesn't change the order.」, 「The same precedence applies between ask and allow: a matching ask rule prompts even when a more specific allow rule also matches the same call.」를 확인하고 ask에 `Bash(git merge -s*)`·`Bash(git merge * -s*)`·`-X` 두 꼴·`*--strategy*`·`*--allow-unrelated-histories*`를 두었다. 정형 goal 병합은 묻지 않음을 `settings-matcher.test.mjs` ⑥·⑦이 묶는다. 묶은 짧은 옵션은 M11 Backlog 76. |
| 4 | 고침(M11 goal 7) | SessionStart 감시 줄이 「pin의 현재 goal 줄이 PR N의 병합 대기를 말한다(goal PR이든 마일스톤 PR이든 — 종류는 gh pr view로 읽는다)」로 시작한다(`10_start-brief.cjs`, smoke 감시 줄 검사, `88394dac`). |
| 5 | 고침(M11 goal 8) | `375c1e37` — 병합 차단 안내 시험이 새 뜻의 문구 셋(「`master`로 가는 병합은 사람이 합니다」, 「goal PR은 에이전트가 로컬 `git merge --no-ff`로 마일스톤 브랜치에 합치고」, 「대상 브랜치와 관계없이」)을 단정한다. 옛 글로 되돌리면 빨갛다. |
| 6 | 고침(M11 goal 8) | `ac73f0ac` — G1 결정대로 allow에 `Bash(git merge --ff-only origin/milestone/*)` 한 꼴을 더했다. `--ff-only origin/master`·`--ff-only chore/x`는 열지 않음을 `settings-matcher.test.mjs` ⑦이 묶는다. |

6. 정형 절차 ③에서 로컬 마일스톤 브랜치를 원격에 맞추려고 `git merge --ff-only origin/milestone/…`을 한 번 썼다. 이 꼴은 allow `Bash(git merge --no-ff *)` 밖이다. 이 세션은 자동 모드라 질문 없이 지나갔고, 기본 모드였다면 질문이 떴을 것이다(추정). 길은 둘이다 — `git switch --detach origin/milestone/…`에서 `git merge --no-ff`하고 `git push origin HEAD:milestone/…`로 보내 로컬 브랜치 맞추기를 없애거나, `git merge --ff-only origin/milestone/*` 한 꼴을 allow에 더한다(설정은 판정 장치) (G2 후속 병합에서 발견).
5. 가드 `MERGE_HINT`의 새 뜻(`master`만 사람 몫, goal은 로컬 `git merge --no-ff`)을 묶는 시험이 없다. `dangerous-cmd-guard.test.mjs`의 병합 안내 단언은 「현황판」「사용자」「외부 셸 아님」만 봐서 옛 글로 되돌려도 통과한다. 그 시험 파일은 M08 스펙 「건드릴 곳」에 없다 (G2 독립 검수 중요 5).
4. SessionStart(`.claude/hooks/10_start-brief.cjs`)의 감시 줄은 「현재 goal이 PR N의 병합을 기다린다」로 시작해 마일스톤 PR도 goal이라 부르고, SessionStart는 마일스톤 스펙을 읽지 않는다. 그 훅은 M08 스펙 「건드릴 곳」에 없다 (M07 Backlog 36의 남은 몫, G2에서 넘김).
3. `Bash(git merge --no-ff *)` allow는 `--no-ff` 뒤의 `-s ours`·`-X theirs`·`--allow-unrelated-histories`도 묻지 않고 연다. `-s ours`로 goal 내용이 빠진 병합 커밋을 push해도 PR 머리가 base에 닿아 GitHub가 「병합됨」으로 닫는다. `ask`에 전략 옵션 꼴을 두거나(ask가 allow를 이기는지 공식 문서 확인 필요), goal 병합 명령을 정형 한 꼴로 고정한다 (G1 독립 검수 중요 3).
2. **비공개 전환 전 필수.** 현재 브랜치가 `master`인 채 맨 `git push`·`git push origin HEAD`를 하면 가드도 설정도 묻지 않는다(G1 CLI 실측 표). 범위는 이 두 꼴만이 아니라 `.claude/hooks/dangerous-cmd-guard.test.mjs`의 「서버 보호에 맡기는 꼴」 묶음 전체다(`git branch -M master && git push origin HEAD`, `remote.origin.push` 설정, 변수·중괄호 `master`, `git checkout master && git merge --no-ff … && git push` 등). 빈틈은 M04부터 있었다. 지금은 서버 보호가 거부하지만 Free 비공개에서는 `git switch master && git merge --no-ff x && git push`가 질문 없이 `master`에 닿는다. 가드가 push 때 현재 브랜치(`git rev-parse --abbrev-ref HEAD`·push 기본값)를 읽어 `master`면 묻거나, `master` 위의 `git merge`를 묻는 길이 있다. 비전 `90_열린-질문.md` 2의 실측 후보와 같이 본다 (G1 실측에서 발견).
1. 위험 명령 가드의 규칙을 소스 수정 없이 바로 넣는 기능(사용자 제안 2026-11-18, M08 브레인스토밍 3번 덧붙임). 넣는 규칙 파일은 판정 장치가 되므로, 비전 스펙의 그래프 수정 규칙(`00_Vision/30_마일스톤-루프.md`)을 따른다 — 사람이 넣으면 바로 적용하고 메인 세션에 알리며, 에이전트가 넣으면 사람 승인 뒤 적용한다. 로드맵 판정 표의 「기준표와 분류기」(규칙 노드 GUI, v2)와 같은 자리이고, M06 Backlog 20·21(판독 재설계)과 함께 본다.
