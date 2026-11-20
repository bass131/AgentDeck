# M10 Backlog

- 범위 밖 발견을 한 줄로 남긴다(헌법 11조). 최신 번호가 위다.

## 닫힘 (M11)

M11 Backlog 정리(`01_Milestones/M11_BacklogSweep/`)가 닫은 항목이다. 아래 항목 줄은 그대로 두고 닫힘은 이 표가 갖는다. 표에 없는 항목은 M11 goal 2~9가 고치면서 더한다.

| 항목 | 닫힘 | 근거 |
|---|---|---|
| 4 | 해결됨 | 결정 기록이 같은 폴더 마일스톤 스펙 대장을 goal 대장에 더한다(`99_Others/Dashboard/lib/markdown.mjs:206-214`, `6b23c32c`). |
| 5 | 해결됨 | G4 결정 대장 [USER·위임]대로 Windows 알림을 더하지 않고 앱 안 표시로 닫는다 — 작업 모드에서도 「채팅」 칸의 점이 채팅의 질문·권한 대기를 보인다(`renderer/src/12_Window/Sidebar.tsx:361,437`, `ProjectSidebar.test.tsx:176`, `e7b26d16`). |
| 6 | 해결됨 | 작업 모드로 켜도 채팅의 마지막 대화를 복원한다(`renderer/src/12_Window/restoreWorkspace.ts:7`, `547ab01b`). |
| 8 | 정함 → goal 6 | G1 결정 대장 [USER·위임] — `makeOnEscape` 사본 시험을 지우고 진짜 가드는 `panelSession.difference-pins` B2에 맡긴다. |
| 9 | 해결됨 | 깃발 내리기 IPC `loop.lowerFlag`가 있다(`main/01_Ipc/handlers/loop.ts:161`, `547ab01b`). |
| 10 | M13으로 | M11 스펙 「하지 않을 것」 — zod 의존성은 설치본 패키징과 함께 M13이 맡는다. |
| 11 | M12로 | G1 결정 대장 [USER·위임] — 스펙 지정대로 노드 세션의 설정 원천은 M12가 정한다. |
| 12 | 해결됨 | 취소 대상을 고르는 `LoopCancelTarget`이 IPC에 있다(`main/01_Ipc/handlers/loop.ts:39`, `547ab01b`). |
| 13 | 고침(M11 goal 4) | 메인 대화 저장본을 읽을 때 `queue[].events`의 사건과 `cards[]`의 칸을 항목 검사와 같은 꼴로 본다 — 깨진 턴은 버리고 깨진 카드는 거른다(`main/05_Loop/mainChatStore.ts:73,89,101,111`, `abde4069`, `mainChat.test.ts` 「[M11-G4 M10-13]」). |
| 14 | 해결됨 | `LoopStatus`가 `mainNode`를 싣는다(`shared/13_Loop/loop.ts:104`, `e7b26d16`). |
| 16 | 고침(M11 goal 4) | 「파일·변경」 탐색기가 열린 실행기의 작업 저장소를 `loop.listDir`로 읽는다 — 채팅 폴더 트리와 「폴더 선택」을 쓰지 않는다(`renderer/src/13_Loop/FilesPanel.tsx:18,54`, `07_Workspace/file/FileExplorer.tsx:127`, `main/05_Loop/loopDriver.ts:919`, `main/01_Ipc/handlers/loop.ts:172`, `abde4069`). 실앱 e2e `m11-g4-work-mode-live.e2e.ts` B에서 연습 저장소의 `src`·`test`·`README.md`가 보였다. |
| 17 | 고침(M11 goal 4, 실앱 확인) | 실앱 e2e `m11-g4-work-mode-live.e2e.ts` C(`18f0ed09`) — 위조 래치로 뜬 실제 알림 객체에 누름 사건을 내자 내려 둔 창이 앞으로 오고(최소화 풀림·보임·포커스) 채팅 모드에서 그 폴더의 작업 모드로 바뀌었다. Windows 알림 화면 자체를 누르는 것은 자동화하지 못해 그 객체의 `click`까지다. |
| 18 | 고침(M11 goal 4, 뒷절) | 단일 인스턴스 잠금 — 둘째 실행은 끝나고 첫 실행이 제 창을 앞으로 가져온다(`main/index.ts:59,62`, `abde4069`, `appUserModel.test.ts`). 실앱 e2e E에서 둘째 실행이 180ms에 코드 0으로 끝났고 내려 둔 첫 창이 돌아왔다. 앞절(`load` 겹침의 `latched` 오탐, 확신 낮음)은 G4 결정 대장대로 고치지 않고 닫는다. |
| 19 | 고침(M11 goal 4) | 알린 열쇠와 함께 앱 안 표시를 `alerts.json`에 남기고 판정자를 만들 때 되살린다(`main/05_Loop/loopNotifier.ts:62,83-85`, `abde4069`, `loopNotifier.test.ts`). 실앱 e2e D에서 재기동 직후 첫 `loop.alerts` 읽기에 래치 알림이 있었다 — 다만 그때 그 폴더는 이미 다시 열려 `latched`였다(제목 줄 0.8초), 되살림과 다시 열기를 실앱에서 가르지 못해 되살림 자체는 단위 시험이 근거다. |
| 20 | 해결됨 | 끝난 실행은 막지 않고 안내하며 새 마일스톤 시작 때 보관한다(`main/05_Loop/loopRunner.ts:138-140`, `2e85b1fa`·`037f13a7`). |
| 21 | 고침(M11 goal 1) | 연습 앱 데이터를 `%USERPROFILE%\.agentdeck-practice\udd`로 옮기고(loop 6파일 sha256 일치), 구동기 `m09-g5-practice-run.e2e.ts`가 `G5_UDD`가 없으면 그 자리를 쓴다. |
| 23 | 고침(M11 goal 3) | 룰셋 규칙이 있으면 「보호가 없다」 대신 「룰셋에 필수 검사가 없어요」, 규칙이 없을 때만 「보호가 없어」다(`main/08_Git/prMerge.ts:118,286`, `2af8fd68`). 실앱 e2e `m11-g3-ruleset-card-live.e2e.ts`(연습 앱 데이터, 연습 토큰은 앱 프로세스 `GH_TOKEN`으로만)에서 PR 6 카드가 그 문구를 보였다. |
| 22 | 고침(M11 goal 4) | 메인 대화가 세션 사건을 턴으로 나눠 채팅과 같은 `ThreadView`로 그린다 — 추론 중 표시·흘러나오는 글·도구 호출과 결과(`renderer/src/13_Loop/mainChatModel.ts:73`, `MainChatView.tsx:46`, `shared/13_Loop/mainTurn.ts:4`, `abde4069`). 실앱 e2e A에서 「사고 중」, Read·Write 도구 줄, 답 글이 차례로 캡처됐다(세션 대화 기록의 assistant 모델 `claude-haiku-5-5`). |

24. (G6 관찰, 로컬 현황판 불변으로 범위 밖) 로컬 현황판은 goal 검증 기록의 마지막 줄이 `USER-INPUT`이면 「사용자 입력 기다림」(손 항목·탭 배지)으로 읽는다(`99_Others/Dashboard/lib/markdown.mjs:192`). 사용자 답을 받아 적은 USER-INPUT 줄(예: G6 13:18 알림 관찰)도 기다림으로 보인다 — 다음 PASS 줄이 붙기 전까지 오탐이다.
23. (G6 실주행 관찰) PR 칸이 마일스톤 PR에 「main 브랜치에 보호가 없어 필수 검사가 없어요」를 보였다 — 연습 저장소는 옛 방식의 브랜치 보호가 아니라 룰셋(`main-protect`: 삭제·강제 push 금지, PR 필수)으로 지키는데, 앱은 `branches/<b>/protection`만 읽는다(404). 필수 검사가 없다는 결론은 맞지만 「보호가 없다」는 틀린 말이다 — 룰셋(`rules/branches/<b>`)도 읽어 문구를 고친다.
22. (사용자 요청 2026-11-20, 작업량으로 다음 마일스톤 이월) 메인 대화의 표현이 채팅 모드보다 빈약하다 — 지금은 사용자 글·메인의 최종 답 글·실행기 사건 줄만 그리고(`MainChatItem`), 추론 중 표시, 글이 흘러나오는 중간 상태, 도구 호출과 결과, 생각 블록 같은 채팅 모드(`05_Conversation/ThreadView.tsx`)의 디테일이 없다. 재료는 이미 있다 — 메인 세션의 `AgentEvent`가 세션 기록(`loop.sessionEvent`, 키 `main`)으로 흐른다. 다음 마일스톤에서 채팅 모드의 스레드 그리기를 메인 대화에 재사용하는 goal로 다룬다.
21. (G6 실주행 준비) 실행 상태의 다이제스트가 앱 데이터 폴더에만 있어, 연습 저장소를 이어 쓰려면 구동기에 같은 폴더(`G5_UDD`)를 줘야 한다. G6은 M09 실주행이 쓴 임시 폴더(세션 scratchpad)를 그대로 쓴다 — 임시 폴더가 지워지면 다음 마일스톤 열기가 위조 래치로 멈추므로, 연습용 앱 데이터의 고정 자리(예: `%USERPROFILE%\.agentdeck-practice\udd`)와 옮기는 절차를 정한다.

20. (G5 검수 사소 5 → G6) 옛 템플릿 해시의 실행 상태(끝난 M09 연습 실행 포함)가 있는 폴더를 열면 `blocked`와 Windows 알림·「사람이 필요해」 표시가 상태 파일을 치울 때까지 남고, 화면에서 풀 길이 없다 — G6 실주행 전에 연습 저장소의 옛 상태를 치우는 절차를 정하고, 끝난 실행의 해시 불일치를 막힘 대신 안내로 볼지 정한다.
19. (G5 검수 사소 7) 알림 목록이 메모리에만 있어 재기동 뒤 그 폴더를 「열기」 하기 전에는 앱 안 표시(「작업」 점·프로젝트 점·띠)가 없다 — 저장본의 열쇠로 재기동 직후 표시를 되살린다.
18. (G5 검수 사소 8·10) `loopRunner.load`가 쓰기와 두 번 겹치면 래치 없이 `needs-user`를 돌려 `latched` 알림 오탐이 날 수 있고(확신 낮음), `requestSingleInstanceLock`이 없어 두 인스턴스가 같은 userData의 `alerts.json`을 덮을 수 있다.
17. (G5 검수 사소 9 → G6) 실제 알림 포트(`createNotifyPort` → 누름 → `loop.alertOpen`)는 실제 앱에서 아직 돌지 않았다 — G6 실주행에서 Windows 알림과 누름을 관찰한다. (G6: 알림 표시는 사용자가 봤다. 누름 → 그 폴더 작업 모드 경로는 아직 관찰하지 않았다.)
16. (G4 검수 중요 2) 작업 모드 「파일·변경」의 탐색기가 작업 폴더가 아니라 채팅 모드의 폴더 트리를 보이고, 그 안 「폴더 선택」은 채팅 폴더를 바꾼다 — 탐색기를 폴더 인자로 받게 나눠 작업 폴더 트리를 그린다(시안 장면 「파일·변경」).
15. (사용자 요청 2026-11-19, M10 뒤) 코드베이스 전체 주석 전수조사와 개선 — 「모든 코드베이스에 필요없는 주석이 좀 많은데, 주석으로 설명해야할정도로 복잡한 코드면 옳지 않은 코드야, 이번 마일스톤 끝나면 한번 전수조사하고 개선해줘」. 코드를 되풀이하는 주석·goal 꼬리표·긴 머리 주석을 걷고, 주석이 필요할 만큼 복잡한 곳은 코드를 단순하게 고친다. G4부터 새 코드는 주석을 최소로 쓴다.
14. (G3 검수 사소 3 → G4) 브레인스토밍 노드에서는 `LoopStatus.sessionActive`가 참이라 루프 화면에 「작업 세션 취소」가 남는다(누르면 「취소할 작업 세션이 없어요」) — `LoopStatus`에 지금 노드가 메인 노드인지 싣고, G4 현황판이 루프 화면을 대신할 때 같이 맞춘다.
13. (G2 검수 반영 관찰) 메인 대화 저장본의 `queue[].events`와 `cards[].questions`는 칸 검사를 하지 않는다 — 칸이 빠지면 턴이 예외로 끝난다. 항목 검사와 같은 꼴로 넓힌다.
12. (G2 검수 사소 9 → G3) 화면의 「취소」는 메인 턴이 돌면 작업자 세션 대신 메인 턴을 멈춘다 — 취소 대상을 고르는 칸을 G3 화면과 IPC에 둔다.
11. (G2 탐침 관찰) 루프 세션은 `settingSources`에 user를 실어 사용자 전역 지시·자동 기억 지시가 메인 대화에도 들어간다 — 탐침에서 모델이 `~/.claude/projects/…/memory/`에 쓰려다 잠금에 막혔다. 메인 대화·작업 노드에 user 설정을 실을지 M11 헌장 문답에서 정한다.
10. (G2 작업자 관찰 → M12) `mainChatTools.ts`가 SDK의 동료 의존성 zod를 `package.json`에 적지 않고 동적 import한다 — 빌드는 main 청크에 인라인해 지금은 돈다. 설치본 패키징(M12)에서 확인하고 필요하면 의존성으로 적는다.
9. (G2 → G3) 일시 정지 깃발을 내리는 길이 메인의 resume 도구뿐이다 — 화면 버튼·IPC를 G3 메인 대화 화면에 붙인다. 백로그 6(두 모드의 복원)도 렌더러 몫이라 G3로 옮긴다.
8. (G1 독립 검수 사소 10, 기존) `useGlobalShortcuts.test.tsx`의 `makeOnEscape`는 Shell의 Esc 처리를 다시 구현한 사본이라, `Shell.tsx`의 `workspaceMode !== 'single'` 가드를 지워도 그 묶음은 통과한다. 실제 가드는 `panelSession.difference-pins` B2가 본다. 사본을 진짜 Shell 렌더로 바꿀지 정한다.
7. (G1 독립 검수 사소 11) `README.md` 15~17·33줄이 지운 멀티 에이전트 화면(「6개 패널 동시 실행」)을 소개하고, 그 그림을 만들던 `readme-shots.e2e.ts` 컷④도 지워졌다. G3 화면이 서면 README 글과 그림을 새 작업 모드로 바꾼다.
6. (G1 독립 검수 사소 8 → G2) 작업 모드로 끈 뒤 다시 켜면 채팅의 마지막 대화가 복원되지 않는다(`restoreWorkspace.ts` — 대화 배치일 때만 복원). 작업 모드가 메인 대화를 갖는 G2에서 두 모드의 복원을 함께 정한다.
5. (G1 독립 검수 중요 4 → G3·G4) 작업 모드에서는 채팅 실행의 질문·권한 요청이 보이는 곳이 없다 — `QuestionModal`·`PermissionCard`가 `Conversation` 안에만 있고 작업 모드는 `Conversation`을 내린다. 사이드바 점은 「진행 중」뿐이다. G3 사이드바·G4 알림에서 「채팅이 답을 기다림」을 보인다.
4. (G1 독립 검수 중요 3, 로컬 현황판 불변 합의로 범위 밖) 로컬 현황판의 판정 ③ 사본(`99_Others/Dashboard/lib/markdown.mjs` 196~208, `progress.mjs` 226~229)은 goal 대장만 세는 옛 규칙이라, 훅은 통과시키는 goal(대장 [AI] 3 · [USER] 1)에 「새 워커를 띄울 수 없어요」 멈춤 알림을 띄운다. 현황판을 여는 마일스톤에서 같은 폴더 스펙 합산으로 맞춘다.
3. (범위 밖, G1 작업자 관찰) 멀티 모드를 지운 뒤 쓰는 곳이 없어진 것 — `multiAgentDefaults`의 COLS·COUNT_OPTIONS·SAMPLE_*, 앱에서 부르는 곳이 0인 `FolderSwitchDialog`(시험만 씀), 값이 app 하나뿐인 `QuestionModal`의 `layer` prop, 디스크 채널이 없어진 `panelSession` 스냅샷·복원 기계. G3 세션 탭이 다시 쓸지 본 뒤 정리한다.
2. (범위 밖, G1 작업자 관찰) 「새 소식」 표본 데이터 `whatsNewSampleData.ts`에 「멀티 에이전트」 소개 카드(N개 패널 병렬 작업)가 아직 사용자에게 보인다 — 제품 문구라 G3 화면 정리 때 고친다.
1. (범위 밖, 판정 장치) `.claude/commands/gate.md` 41·54·58줄이 G1에서 지운 `multi-agent-ops.e2e.ts`를 알려진 실패 기준으로 적고 있다. 판정 장치라 M10 「건드릴 곳」에 이름이 없어 고치지 않았다 — 다음에 판정 장치를 여는 마일스톤에서 줄을 뺀다.
