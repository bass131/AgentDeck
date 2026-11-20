# M11 Backlog

- 범위 밖 발견을 한 줄로 남긴다(헌법 11조). 최신 번호가 위다.
- M01~M10 Backlog의 닫힘은 각 파일의 「## 닫힘 (M11)」 표가 갖는다. 여기에는 M11 진행 중 새로 생긴 것과 해결됨 항목의 남은 갈래만 둔다.

15. e2e `engine-update.e2e.ts:12`가 `cmpVer`를 따로 복사해 쓴다. 앱의 비교는 pre-release를 읽는 한 벌(`engineCheckUpdate.ts:4`)이 됐는데 e2e 사본은 옛 `Number` 쪼개기다 (M05-65, M11 G2).
14. 패널(`05_Conversation/PanelView.tsx`)은 실행 중 effort 전환, 모델을 바꿀 때 직전 창 버리기, 자동 압축 표시를 아직 잇지 않았다. 단일 대화 입력창만 고쳤다 (M06-18·24·27, M11 G2).
13. Bash가 아닌 올라온 승인 카드에는 판단 재료(입력 전문)가 아직 없다. 긴 명령 스크롤과 요청 줄만 고쳤다 (M06-12, M11 G2).
12. 세션 레지스트리 남은 갈래 — 대화 쪽 실행 포트에 `life`가 없어(`03_Agent/state/runtime.ts:94`) `agent.run` 응답 전에 다른 대화로 넘어가면 뒤늦은 `SET_RUN_ID`가 새 전경 대화에 붙을 수 있다(`runCore.ts:138,202`, 코드 읽기). `forget`의 키 구독자 제거, 시험의 `defineKind` 덮기 미복원, `00_App`·`main.tsx`의 CSS 직접 import도 남았다 (M05-53, M11 G2).
11. `preservePanelLocalFields`(`03_Agent/state/panelSession.ts:103-111`)는 여전히 사실상 아무 일도 안 한다. 지운 대화의 run 끊기만 고쳤다 (M05-52, M11 G2).
10. 패널 쪽 남은 갈래 — `07_Workspace/file/index.ts:2` 주석의 낡은 PanelComposer, 패널 `/clear`의 REPL 토글 유지, 패널 입력창의 모드 뒤 꼬리 구분선 (M05-51, M11 G2).
9. `mainChat.test.ts` 「재개 (M10 G2) > 줄 서 있던 사용자 글은 다시 열면 다시 줄을 선다」가 두 워커가 동시에 전체 시험을 돌릴 때 한 번 30초 timeout으로 실패했고 다시 돌리면 통과했다 — 부하 의존 flaky 후보, goal 6이 본다 (M11 G3 시험 담당 관찰).
8. tdd-guard(`33_tdd-guard.cjs`)가 ROOT를 `CLAUDE_PROJECT_DIR`로 잡아 `.claude/worktrees/` 아래의 시험 파일 편집을 소스 편집으로 세고, 같은 세션 id의 하위 에이전트들이 streak 카운터를 나눠 써 한 워커의 초록 실행이 다른 워커의 카운터를 리셋한다 — 병렬 파이프라인에서 판정이 섞인다, goal 7이 본다 (M11 G3 시험 담당 관찰).
7. `README.md:62-64`가 `/work:plan`·`/review`와 멀티 에이전트를 소개하고, `:74`의 「복원 후 다시 연결할 예정」 문구도 낡았을 수 있다 — goal 6이 README를 고칠 때 함께 본다 (M01-8, M11 G1 검수).
6. 실행기에 goal을 다시 나누는 길을 넣으면 앞 goal의 FAIL 계수를 새 goal로 잇는다(헌법 11조). M09 G1 독립 검수의 G3 메모이고 아직 맡은 곳이 없다 (M09-1, M11 G1).
5. 설정 `deny`의 `Bash(gh api *pulls/*/merge*)`는 본문에 `pulls/12/merge` 글자가 든 댓글 호출도 막는다. 가드 차단이 들어온 뒤에도 넓은 꼴을 그대로 뒀다 (M07-23, M11 G1).
4. 현황판에 결정 보드를 고치는 명령 도구와 「답이 전달됨」 판정이 없다. 메인이 Edit로 보드를 고치고 답을 받으면 손으로 지운다 (M05-70, M11 G1).
3. renderer 콜드 import의 근본 수리(공용 import 준비를 `beforeAll`로 올리기)는 하지 않았다. 지금은 `testTimeout`·`hookTimeout` 30000이 가린다 (M05-45, M11 G1).
2. CLI 세션에서는 가드의 질의가 권한 창을 생략하는 권한 모드에서 창이 되지 않는다. 앱 경로만 카드로 올린다 (M04-6, M11 G1).
1. 표피 검사 훅(`51_surface-probe.cjs`)을 차단형으로 승격할지는 몇 세션 실측 뒤 사용자가 판정한다. 아직 판정이 없다 (M01-15, M11 G1).
