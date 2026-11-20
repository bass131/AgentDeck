# M11 Backlog

- 범위 밖 발견을 한 줄로 남긴다(헌법 11조). 최신 번호가 위다.
- M01~M10 Backlog의 닫힘은 각 파일의 「## 닫힘 (M11)」 표가 갖는다. 여기에는 M11 진행 중 새로 생긴 것과 해결됨 항목의 남은 갈래만 둔다.

37. 권한 카드는 Esc 처리를 카드 요소에서 받고 곁 층 알약은 window capture에서 받아, 카드에 포커스가 있고 내려둔 알약이 함께 떠 있으면 Esc 한 번에 카드 거부와 알약 닫기가 같이 일어날 수 있다(코드 판독) — 카드 Esc도 모달 층으로 옮길지 본다 (M11 G4 검수 반영 관찰).
36. 실앱 e2e가 연습 앱 데이터 `loop/`에 임시 저장소 두 벌의 메인 대화 저장본(`1be55c4c….main.json`, `78fd994e….main.json`)과 래치 파일(`digests/` 같은 이름 `.latch`)을 남겼다 — 가드가 지우기를 막아 사람 손으로 지운다. 같은 자리에 원자 쓰기 임시 파일(`*.main.json.<pid>.<hex>.tmp`)도 앱 종료 때마다 쌓인다(기존 15:13분 것 포함) (M11 G4).
35. 재기동 뒤 메인 대화의 지난 턴은 답 글만 남고 도구 줄·추론 표시가 사라진다 — 세션 사건이 메모리에만 있어서다(e2e D 캡처). 저장할지 정한다 (M10-22, M11 G4).
34. 사고 글이 없는 사고 조각은 턴이 끝난 뒤에도 「사고 중… ~N 토큰」으로 남는다(`renderer/src/05_Conversation/ThreadView.tsx:32,357`, 실행 중 여부를 보지 않는다. `thinking_clear`는 진행 글만 지우고 조각은 두며(`05_Conversation/state/reducer/text.ts:172`) 메인 대화도 같은 리듀서로 접는다(`13_Loop/sessionLogModel.ts:35`)) — 채팅과 메인 대화 공통, e2e A 캡처 (M11 G4).
33. Playwright로 띄운 앱 창은 `ready-to-show`가 오지 않아 숨은 채로 그리지 않는다(requestAnimationFrame 0회) — 캡처 한 장을 찍어야 보인다(`main/index.ts:18,31`, 투명·테두리 없는 창). 실제 사용자 기동에서도 늦는지는 재지 않았다 (M09-10, M11 G4).
32. 모달 층(`02_Common/modalStack.ts`)은 Esc만 맨 위 하나에 준다 — `ImageViewer`·`WhatsNew`의 화살표, `QuestionModal`의 숫자 키는 위에 다른 모달이 떠도 반응한다 (M11 G4).
31. 옛 모달 선택자 목록의 `.sa-overlay`는 그리는 컴포넌트가 없어 모달 층으로 옮기지 않고 뺐다 (M11 G4 설계 감사 22).
30. 작업 모드 탐색기는 첫 읽기가 실패하면(실행기가 아직 안 열림) 「열면 파일이 보여요」로 남고, 루프가 열려도 폴더를 다시 고르기 전까지 다시 읽지 않는다(`renderer/src/07_Workspace/file/FileExplorer.tsx`의 `unavailable`, 코드 판독) — 상태가 열림으로 바뀔 때 다시 읽는다 (M10-16, M11 G4).
29. 작업 모드 탐색기에서 파일을 눌러도 열리지 않는다 — 원천 모드는 트리만 보인다(`FileExplorer.tsx` source 모드). 파일 보기를 작업 폴더 기준으로 열지 정한다 (M10-16, M11 G4).
28. PowerShell 꼴 `` g`h pr merge 1 ``(백틱 이스케이프), `iex`·`Invoke-Expression "gh pr merge 1"`, `Start-Process gh -ArgumentList 'pr merge 1'`은 가드·`mergeDeny`·`loopLock` 셋 다 통과한다 — 셋의 판독은 같아(패리티) goal 3 몫은 없고, 가드와 함께 goal 8이 본다 (M11 G3 독립 검수).
27. PR 카드의 룰셋 읽기는 고전 보호가 「Branch not protected」일 때만 돈다 — 고전 보호와 룰셋이 함께 걸려 룰셋에만 필수 검사가 있는 base는 고전 쪽만 읽는다(`main/08_Git/prMerge.ts:285`, 코드 판독). 두 목록을 합칠지 정한다 (M07-24, M11 G3).
26. PR 카드는 하위 에이전트 대화 보기의 `gh pr create`와 「이미 있음」 오류로 끝난 `gh pr create`에는 아직 뜨지 않는다 — M07-24 뒷절, goal 3은 룰셋 판독(앞절)만 고쳤다 (M07-24, M11 G3).
25. 모델 목록 다시 묻기는 5·15·60초 세 번이다. 셋 다 SDK 목록을 못 받으면 재시작 전까지 다시 묻지 않는다(`renderer/src/05_Conversation/state/composer.ts:11`) — 다시 묻기 버튼이나 화면 복귀 때 묻기 후보 (M06-13, M11 G2 검수 사소 11).
24. 시험 사본 `stopAction.esc-interrupt-wiring.test.ts:11-25`의 `makeOnEscape`가 `Shell.tsx:160-169`를 재구현하면서 `isAnyModalOpen()`·`workspaceMode` 가드가 빠져, Shell에서 그 가드를 지워도 시험이 통과한다(M10 Backlog 8과 같은 꼴) (M11 설계 감사). → 고침(M11 goal 4, `a29fd8d5`)
23. `Shell.tsx:81,353` — `appUpdateOpen`이 true로 바뀌는 곳이 없어 `AppUpdateGate`가 열리지 않는다(코드 판독) (M11 설계 감사). → 고침(M11 goal 4, `a29fd8d5`)
22. 모달 판정이 CSS 클래스 목록(`useGlobalShortcuts.ts:4-11`)에 묶여 `.fs-overlay`가 빠져 있다 — 실행 중 서브에이전트 전체 화면을 Esc로 닫으면 Shell이 모달 없음으로 보고 실행을 중단할 수 있고, Git 창 위 파일 창에서 Esc 한 번에 둘 다 닫힐 수 있다(코드 추론) (M11 설계 감사). → 고침(M11 goal 4, `a29fd8d5`)
21. `08_Git/diff.ts:7` LCS 표가 (m+1)×(n+1) 전체 할당이라 3만 줄 파일 둘이면 main 프로세스가 멎을 수 있다(호출부는 글자 150만만 봄, 산술 추론) (M11 설계 감사). → 고침(M11 goal 3, `ae748e3e`)
20. `06_Sessions/store.ts:148-159,260-264` — `index.json`이 깨지면 `readIndex`가 빈 목록을 돌려주고 다음 `save`가 목록을 id 하나로 덮어써 옛 대화가 목록에서 사라진다(파일은 남음). 쓰기가 원자적이지 않고, `safeId`가 `index`를 통과시켜 `chatFile('index')`가 색인 파일과 같아진다(코드 판독) (M11 설계 감사). → 고침(M11 goal 3, `ae748e3e`·`ed5411ae`)
19. `01_Ipc/handlers/git.ts:58-62` → `08_Git/git.ts:203-207` — renderer가 보낸 `hash`를 문자열인지만 보고 `git show`에 넘겨, `--output=<경로>`를 보내면 그 경로에 파일이 써진다(임시 저장소 실측). `gitPort.ts:61-64` `safeName`처럼 `-` 머리 값을 막아야 한다 (M11 설계 감사). → 고침(M11 goal 3, `ae748e3e`)
18. `claudeAgentRun.ts:28-35` `userDataForLock`은 `getUserDataDir()`가 던지면 엔진 경로 잠금 없이 세션을 연다(로그만) — M07-18의 형제 fail-open이고 주입되지 않는다. `enginePathLock.ts:63` `TARGET_WORD`가 `TARGETS` 이름을 손으로 다시 적어 새 보호 파일이 `cd <userData> && rm` 꼴에서 빠질 수 있다 — goal 3(잠금)이 본다 (M11 설계 감사). → 고침(M11 goal 3, `ae748e3e`)
17. 가드와 앱 잠금의 판독 어긋남 10꼴 실측 — `timeout -vs KILL 5 gh pr merge 1`, `bash -ce "…"`, `bash -c -x "…"`, `eval gh pr merge 1`, `find … -exec gh pr merge 1 \;`를 가드는 막고 `mergeDeny`는 통과시키며, `loopLock`이 그 판독을 물려받아 같은 꼴의 `git push`도 통과한다. `gh api -iX DELETE …`·`-X=PUT`은 가드 ask, `loopLock.apiIsWrite` 통과. 같음 시험(`cmd-guard-equivalence.test.mjs:176-237`)이 래퍼 표 글자만 비교해 판독 함수를 지키지 않는다 — M09-7을 넓혀 goal 3이 고치고 같음 시험을 판독 결과 말뭉치로 넓힌다(판정 장치 몫은 goal 8) (M11 설계 감사, 프로브 `scratchpad/guardprobe`). → 고침(M11 goal 3, `a6e7f88a`·`bc920e64`)
16. G2 실앱 캡처(`c-conversation-b-mode.png`)에서 답 「hi」가 끝나고 에이전트 패널이 「대기 중」인데도 그 턴 머리에 「사고 중... ~564 토큰 •••」이 남아 보였다 — 끝난 턴의 사고 표시가 닫히지 않는지 확인이 필요하다 (M11 G2 메인 관찰).
15. e2e `engine-update.e2e.ts:12`가 `cmpVer`를 따로 복사해 쓴다. 앱의 비교는 pre-release를 읽는 한 벌(`engineCheckUpdate.ts:4`)이 됐는데 e2e 사본은 옛 `Number` 쪼개기다 (M05-65, M11 G2).
14. 패널(`05_Conversation/PanelView.tsx`)은 실행 중 effort 전환, 모델을 바꿀 때 직전 창 버리기, 자동 압축 표시를 아직 잇지 않았다. 단일 대화 입력창만 고쳤다. M10 G1 뒤로 `PanelView`를 그리는 곳(`<PanelView`)이 없어 지금은 화면에 닿지 않는다 — 패널 코드를 지울지와 함께 본다 (M06-18·24·27, M11 G2).
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
