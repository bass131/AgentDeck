# M04 Backlog — 범위 밖 관찰

완료조건 밖의 발견을 한 줄씩 남깁니다. 승인을 묻지 않고 기록만 하며, 다음 goal의 후보입니다.

## 닫힘 (M11)

M11 Backlog 정리(`01_Milestones/M11_BacklogSweep/`)가 닫은 항목이다. 아래 항목 줄은 그대로 두고 닫힘은 이 표가 갖는다. 표에 없는 항목은 M11 goal 2~9가 고치면서 더한다.

| 항목 | 닫힘 | 근거 |
|---|---|---|
| 1 | 고침(M11 goal 7) | M03-30과 같은 수리 — 포인터 없을 때 M01 기본값으로 감시하지 않는다(`40_pass-watcher.cjs`, `88394dac`). |
| 2 | 고침(M11 goal 7) | M03-13과 같은 수리 — 머리 주석이 개정된 2조를 말한다(`10_start-brief.cjs`, `88394dac`). |
| 3 | 고침(M11 goal 7) | 판정부가 머리말의 「상태: 종결」을 거부(`계획-종결`)한다 — ②③ 뒤에 본다. 마일스톤 사이에는 `01_Milestones` 안 편집만 열리고, goal을 닫은 뒤 `gate-config.json`의 `planPath`를 `01_Milestones` 안의 다음 계획으로 바꾸는 편집은 바뀐 뒤의 계획으로 판정해 지나간다(`_lib/plan-verdict.cjs` `isClosed`, `31_edit-plan-gate.cjs` 포인터 전환, EP-33·PS-01~11, `5a43d39c`·`303876ee`·`1443e129`). |
| 4 | 고침(M11 goal 6) | G1 결정 대장 [USER·위임]대로 라우팅 정책을 v3로 올리고 옛 서술에 「역사」 표시, 지금 ID·effort 값·앱 모델 목록과의 경계를 적었다(`cf6359ba`). |
| 5 | v2로 | G1 결정 대장 [USER·위임] — `node -e` 꼴은 M07-34와 같은 자리라 가드 판독 재설계와 함께 다룬다(AD-01의 수락은 파일 쓰기 위험이라 이 길을 덮지 않는다). |
| 6 | 해결됨 | 앱 경로는 모드 노드보다 앞의 노드가 가드 ask를 카드로 올리고(`permissionCoordinator.ts:120-121`, M06 G3 `c635ef75`) 권한 모드에 기대는 CLI 세션 몫은 M11 Backlog로 옮겼다. |
| 7 | 해결됨 | 작업 브랜치 push는 allow(`.claude/settings.json:28`)로 묻지 않고 `master`는 서버 브랜치 보호가 지킨다(ADR-004, 헌법 10조). |
| 8 | 고침(M11 goal 8) | `375c1e37` — 가드가 git의 `--output`·`--output=`을 묻고(`git-출력파일`), `git branch -f`·`--force`·`-M`·`-C`를 막는다(`git-branch-강제이동`). `--output-indicator-*`는 묻지 않는다. 시험: `dangerous-cmd-guard.test.mjs` 「브랜치 포인터 강제 이동·이름 바꾸기, git --output」. |
| 9 | 해결됨 | 동시 rename `EPERM` 쪽 임계구간을 `writeAt`까지로 읽게 고쳤다(`7cb426cd`). |
| 10 | 고침(M11 goal 8) | `375c1e37` — 「명시적 통과가 아니다」 단정 가운데 실측이 질의·차단인 27건을 `expectAsk`·`expectDeny`로 좁혔다(같은 명령 안의 master 전환 4건은 M08-2 질의). 남은 단정은 판독이 못 읽어 판정이 우연에 기대는 꼴이다. |
| 11 | 낡음 | 지금 pin 이름이 다시 `01_Work_Pin.md`라 헌법 4조 문면과 맞는다(`gate-config.json`의 `workPinPath`). |
| 12 | 닫음(판단) | G1 결정 대장 [USER·위임] — 이미 있는 [USER] 한계 인정을 다시 열지 않는다. |

1. `40_pass-watcher.cjs`는 포인터가 없을 때 종결된 M01 계획을 기본값으로 쓴다 (93줄). 판정부는 M03에서 fail-closed로 바뀌었는데 이 훅은 옛 기본값이 남았다.
2. `10_start-brief.cjs`의 머리 주석은 `--resume` 감지를 「헌법 금지 사항」이라고 적는다. 2조 개정 뒤의 문면과 어긋난다.
3. 계획 판정부는 계획 머리말의 「상태: 종결」을 읽지 않는다. 종결된 계획을 가리키는 포인터로도 `01_Milestones` 밖 편집이 열린다.
4. `00_Documents/02_Rules/02_모델-라우팅-정책.md` 61줄의 「모델 ID 변경은 사용자 판정」 요건은 이번 범위에서 뺐다. 목표지향 루프와 맞출지 따로 정해야 한다.
5. 설정의 `Bash(node *)` 허용은 `node -e`로 git을 띄우는 push를 가드 밖에서 통과시킨다 (3차 검수 지적, M04 이전부터 있던 구멍). 헌법 8조가 규범으로만 막는다.
6. 가드의 질의는 권한 창을 생략하는 권한 모드에서는 창이 아니다. 승인 항목의 집행이 세션의 권한 모드에 기댄다 (3차 검수 지적).
7. 작업 브랜치 push의 무질의 통과는 AgentDeck 커스텀 에이전트를 만들 때 넣을 기능이다 ([USER] 2026-11-13). Claude Code 훅은 명령 문자열만 받아 push의 목적지를 닫지 못했다. 앱이 push를 직접 실행하면 원격과 refspec을 인자로 고정할 수 있다는 것은 Claude의 의견이다. 여섯 번의 검수 반례는 ADR-003 결정 2와 M04 검증 기록에 있다.
8. `git log`·`git diff`·`git show`의 `--output=`은 설정의 허용 규칙에 맞으면서 임의 경로에 파일을 쓴다 (6차 검수 실측, M04 이전부터 있던 허용). `git branch -f master <브랜치>`도 `Bash(git branch*)` 허용으로 로컬 `master`를 창 없이 옮긴다.
9. `state-race.test.mjs`가 간헐 실패한다 (마감 검수 실측: 단독 5회 중 1회, `npm run test:hooks` 2회 중 1회, RC-02·RC-04 「임계구간 겹침 판정불능」). 이 파일과 의존 모듈은 M04에서 바뀌지 않았다. 하드 게이트가 무작위로 exit 1이 될 수 있다.
10. 가드 테스트의 「명시적 통과가 아니다」 단정 30건 중 16건은 실제 판정이 `ask`다. `ask`로 좁혀 단정하면 토크나이저 회귀(탭 구분 등)를 잡는다 (마감 검수 권고).
11. 헌법 4조는 pin 이름을 `01_Work_Pin.md`로 적는데 M04의 pin은 `02_Work_Pin.md`다. 핵심 규칙 참조처럼 포인터(`workPinPath`) 기준으로 적어야 한다 (마감 재검수 권고, 4조는 M04 개정 범위 밖).
12. 가드가 못 읽는 `gh` 꼴이 남아 있다 — `timeout 30 gh pr merge 12`, `eval "gh pr merge 12"`, `if gh pr merge 12; then … fi`, `gh api -X PUT …/merge`, 빈 인용 값(`gh pr -b "" merge 12`, 토크나이저가 빈 토큰을 버린다), 백슬래시 줄 잇기(`gh pr close 12 \⏎ --delete-branch`), 낱말 사이 리다이렉트(`gh pr 2>&1 merge 12`), 괄호 뒤 리다이렉트(`(gh pr merge) > log.txt`). M03 때도 같았고 권한 창이 받는다. 사용자가 2026-11-13에 한계로 인정했다. 가드 주석의 「`-h`는 값을 먹지 않는다」는 gh 실측과 다르다(판정에는 영향 없음). `gh pr close 12 -cdone`은 반대로 브랜치 삭제 질의가 뜨는 오탐이다 (마감 재검수 실측).
