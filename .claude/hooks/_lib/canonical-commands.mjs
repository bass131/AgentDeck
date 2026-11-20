// 메인 세션의 정형 절차 명령 (M11 goal 8, 헌법 10·11조) — goal 병합·마일스톤 브랜치 push·작업 브랜치 push·PR 생성·브랜치 전환.
// 가드는 무출력, 설정은 allow여야 사람 없는 사슬이 멈추지 않는다. 가드 시험과 설정 시험이 같은 목록을 읽는다.
// 브랜치 이름은 실제 꼴을 쓴다 — `-s`가 든 이름(`-settings`·`-sweep`)이 전략 옵션 꼴에 걸리지 않는지 함께 본다.
export const MILESTONE = 'milestone/m11-backlog-sweep'

export const CANONICAL_COMMANDS = [
  'git merge --no-ff -m "Merge chore/x (M11 goal 8, PR 115)" origin/chore/x',
  'git merge --no-ff -m "Merge chore/m11-g8-guard-settings-ci (M11 goal 8, PR 115)" origin/chore/m11-g8-guard-settings-ci',
  `git push -u origin ${MILESTONE}`,
  'git push -u origin chore/m11-g9-comments',
  'git push -u origin chore/m11-g8-guard-settings-ci',
  `gh pr create --base ${MILESTONE} --head chore/x --title "…" --body "…"`,
  'git fetch origin',
  `git switch ${MILESTONE}`,
  'git switch -c chore/x',
]
