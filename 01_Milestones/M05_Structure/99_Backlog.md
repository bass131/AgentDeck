# M05 Backlog — 범위 밖 관찰

완료조건 밖의 발견을 한 줄씩 남깁니다. 승인을 묻지 않고 기록만 하며, 다음 goal의 후보입니다.
M04에서 넘어온 항목은 `M04_Goal_Loop/99_Backlog.md`가 계속 소유합니다.

1. `main/03_lsp/manager.ts:519`의 `disposeAll()`을 프로덕션에서 아무도 부르지 않는다. 앱 종료(`before-quit`)는 실행과 store만 닫으므로 LSP 자식 프로세스가 남을 수 있다 (G1 감사, 판독 — 실행 확인 필요).
2. `@keyframes rise`가 몸체가 다른 두 벌이다(`MultiWorkspace.css:698` +14px, `SettingsModal.css:171` -6px). 적용되는 쪽이 번들 순서에 달렸다 (G1 감사 실측, 화면 영향은 추측).
3. 권한 모드 매핑이 시작 때(`runArgs.ts:10`, `auto→acceptEdits`)와 실행 중 전환 때(`claudeAgentRun.ts:31`, `auto→auto`) 다르다. M06의 권한 처리 goal이 의미를 정한다 (G1 감사 실측).
4. SDK 버전 폴백 `0.3.186`이 두 곳에 있고 설치본(`^0.3.201`)보다 낡았다 (`ClaudeCodeBackend.ts:14`, `engineState.ts:18`). G11의 중복 통합 때 함께 고친다.
5. `renderer/src/store/slices/selector.ts:27`의 `selectTaskScope`가 호출마다 새 객체를 만들어 `AgentPanel.tsx:181`이 store 변경마다 다시 렌더될 수 있다 (G1 감사, 판독).
6. `10_Engine`·`11_Settings`의 main 구현은 Claude 전용이다. Codex 백엔드를 붙이는 goal이 백엔드 중립 계층과 Claude 구현으로 나눈다 (재편 계획 도메인 절).
7. 이벤트 이름 `'model-fallback'`만 kebab이다(나머지 28종은 snake_case). 바꾸면 영속된 대화 기록의 호환을 봐야 한다 (G1 감사 실측).
8. 설정 allow `Bash(git branch*)`가 `git branch -f`·`-M`·`-m`·`--force`(브랜치 포인터 강제 이동, 이름 덮기)를 가드 규칙 없이 연다. `switch -C`와 같은 종류다 (H1 워커 실측).
9. 가드가 못 읽는 push·gh 꼴: 다른 세그먼트에서 먼저 바꾼 push 설정(`git config remote.origin.push +x && git push`), 영속된 git·gh 별칭, 셸 확장, `--receive-pack`·`--upload-pack`의 임의 명령, `gh repo rename·archive·sync --force`, `gh secret set`, `gh alias set`, `git fetch --refmap=+…`, `git -c remote.origin.fetch=+… fetch`, 줄 이음·`2>&1` 뒤 옵션, 짝 없는 `"`가 든 heredoc 본문 뒤의 명령. `master`는 서버 보호가 받고 나머지는 규범과 사후 감사에 기댄다 (H1 워커 실측).
10. 하위 에이전트 안에서 가드의 질의가 창으로 이어지는지 미확인이다. 1차 검수자의 보호 설정 GET이 질의로 기록되고도 실행됐다(hook-log 23:03:59). 사용자 전역 설정의 `defaultMode`는 `auto`다 (H1 검수 관찰).
11. eslint 경계 규칙(내장 `no-restricted-imports`)은 동적 `import()`, `typeof import()`, 타입 위치의 `import('…').T`를 잡지 않는다. 지금 위반은 0건이다 (G2 워커 실측).
12. TDD 가드의 Green 채집이 큰 테스트 출력(persisted 파일로 넘어간 출력)에서 요약 줄을 못 찾아 「판정-불능 무기록」이 된다. 워커가 `--reporter=dot --silent`로 우회했다 (G2 워커 실측).
13. `renderer/multi-session-persist-2.test.tsx:101`이 부하 때 5초 시간 초과로 간헐 실패한다. 단독 실행은 통과다 (G2 워커 실측).
14. e2e 하네스 다섯 개(`bl1-p03-goal-banner-visual.e2e.ts:92` 꼴, `gap1-p14`·`gap1-p16`·`gap1-visual`·`tg1-p07`)의 esbuild 번들이 `@shared`·`@renderer` 별칭을 못 푼다. 루트 `tsconfig.json`에 `paths`가 없어서다. 호출에 `tsconfig: 'tsconfig.web.json'`을 주면 풀린다. renderer 쪽 import를 별칭으로 바꾸는 G4·G7·G8 전에 고친다 (G2 검수 실측).
15. 경계 lint 오탐 꼴: renderer 하위에서 `../main`(= `renderer/src/main.tsx`)이나 트리 안의 `main` 이름 폴더, 대소문자 무시로 `../Main`·`../Preload`도 걸린다. 지금 소스에는 0건이다 (G2 검수 실측).
16. preload → main 방향은 lint가 막지 않는다. G2 범위가 preload → renderer만 정했다. 상대 경로 꼴은 build까지 통과해 main 코드가 preload 번들에 들어갈 수 있다 (G2 검수 실측).
17. 타입 검사 사각지대가 둘 남았다. `01_TestCode/renderer/panel-session.test.tsx`·`queue-drain.test.tsx`는 같은 이름의 `.ts`가 옆에 있어 tsc가 버린다. 또 e2e의 `declare global`(`Window.__p01b`)이 web 프로그램에 섞여 renderer 소스에서도 보인다. 교차 테스트(`multiCmdMock.ts`, `rmw1-p01`, `model-canon`)는 tsconfig에 그 별칭이 없어 상대 경로로 남아야 한다 (G2 검수 실측).
18. 자기 파일 안에서만 쓰는 export 164개(값 24, 타입 140 — 대부분 `…Props`·`…Deps`)의 `export` 키워드가 불필요하다. 목록은 G3 재실측 스크립트로 다시 뽑는다 (G3 재실측).
19. `CodeViewerPane` 테스트를 지우면 같은 동작의 실물인 `FileModal.tsx:77·117-118`(읽기전용 배지, markdown·image 분기, too-large·binary 메시지)을 검사하는 테스트가 없다 (G3 재실측).
20. `m7-explorer-lazy`의 A·E·F 절은 실물 순수 함수가 없어 지웠다. FileExplorer 렌더 테스트로 같은 동작(지연 로드 캐시, 토글, fileTree 재로드)을 검사할지 정한다. 또 `buildChgMaps`의 `'new'` 우선 규칙은 호출부가 항상 `'edit'` tagMap을 넘겨 프로덕션에서 도달하지 않는다 (G3 재실측).
21. SubAgentModal 삭제 뒤 `.sa-overlay` 셀렉터(`useGlobalShortcuts.ts:5`)와 CSS(`AgentPanel.css:310·458`)가 대상 없이 남는다. `m4-4-subagent-panel.test.tsx:98`의 제목은 낡았다. `PanelPicker.tsx:33·41`은 `ComposerPicker.tsx`의 `ModeIc`·`isModeOption`을 복제한다(G9 후보) (G3 재실측).
22. G3 연쇄 고아: `lib/mentions.ts:1` `MentionToken`과 `lib/f14SampleData.ts`의 `QuestionOption` 재수출은 참조 0이 됐다. `fb-run-failed-cleanup`의 첫 it과 셋째 it은 슬롯 키만 다른 중복이다. `w6-inject-nonce`는 `nextInject`를 쓰려고 Shell 모듈을 통째로 import한다. `InjectedInput` 타입을 shared나 lib으로 옮기면 가벼워진다(G7 후보) (G3 워커 실측).
23. TDD 가드 Green 채집은 `&&`·파이프가 섞인 명령을 판정 불능으로 본다(`33_tdd-guard.cjs:269`). 저장소 루트 밖 cwd에서 `npx vitest run`을 돌리면 수집 파일이 0개다. 하위 에이전트 브리프의 Green 명령은 `npm test -- --reporter=dot --no-color --silent` 단독 꼴로 쓴다 (G3 워커 실측).
24. 실물 import로 바꾼 복제 검사 테스트에 빠진 입력이 있다. 공백만 있는 `requestId`와 `null` 요청 본문이다 (G3 검수 경미 2).
25. `normalizeToRel`이 루트 밖의 Windows 절대 경로(`D:\…`)를 거르지 않고 통과시킨다 (G3 검수 경미 3, 판독 — 실행 확인 필요).
26. `Shell.tsx`(`nextInject`)와 `FileExplorer.tsx`(순수 함수 5개)가 컴포넌트가 아닌 export를 갖게 돼 Vite Fast Refresh 경계가 깨진다. 개발 중 수정 때 전체 새로고침이 난다. lib으로 옮기면 풀린다(G7 후보) (G3 검수 경미 6).
27. e2e 스크린샷 하네스의 `SHOT_DIR`가 저장소 안 `01_Phases/`이고 gitignore 대상이 아니다. G4 e2e 실행이 미추적 PNG 92장을 남겼다(16_BL1 8, 17_GAP1 62, 18_TG1 22). `git add -A` 한 번에 커밋에 섞일 수 있다. 출력 경로를 저장소 밖이나 gitignore 아래로 옮긴다 (G4 워커 실측).
28. `.claude/agents/reviewer.md:28`이 옛 경로 `main/01_agents/runArgs.ts`를 가리킨다 — G5 검수 뒤 고쳤다. 남은 것은 마일스톤 문서와 `99_Others/loop-design-handoff.md:122·196`의 옛 경로다 (G5 워커 실측).
29. `08_Git/diff.ts:3` ⇄ `08_Git/git.ts:13` 파일 순환이 남아 있다(옛 `02_fs/`). G6은 둘을 `08_Git`에 모아 도메인 순환만 없앴고, 파일 순환을 끊는 것은 내용 변경이라 미뤘다. G11(main 중복·조립 정리) 후보다 (G5 워커 실측, G6 검수 경미 1로 갱신).
30. 하드 게이트 `test:hooks`의 `state-race` RC-02·RC-04가 부하 때 post-read 대본의 임계구간 겹침을 `null`로 재 exit 1을 낸다. 단독·재실행은 통과다. 판정 불능을 실패로 세지 않게 하거나 재시도를 두는 수리는 판정 장치 변경이라 계획 Step으로 한다 (G5 게이트 실측).
31. 이동 맵 「예외」의 파일 쪼개기 둘이 남았다. `12_Window/controls.ts`(G6 뒤 위치)의 `registerWindowControls`를 `01_Ipc/handlers/window.ts`로, `01_Ipc/handlers/multi.ts`의 병합 로직을 `06_Sessions`로 나눈다. 이동 goal에는 내용 변경을 넣지 않아서 미뤘다. G10이나 G11 후보다 (G6 결정 대장).
32. 진짜 견본의 테스트 fixture 이동이 남았다. `03_Agent/types.ts`(옛 `agentSampleData`)의 `SAMPLE_TODOS`·`SAMPLE_SUBAGENTS`는 `agentpanel-detail.test.tsx`만 쓴다. 또 `lib/multiAgentSampleData.ts`의 `SAMPLE_BATCH_TO = 'C:/Dev/AgentDeck/src'`가 프로덕션 `MultiWorkspace.tsx:220`에 박혀 있다 (G7 재실측).
33. renderer 도메인 경계를 건너는 의존: SubAgent 계열 3파일(03_Agent)이 `features/shell/MultiWorkspace.css`(12_Window 예정)를 직접 import하고, `PermissionCard`(03_Agent)와 `PanelView`(05_Conversation)가 서로의 배럴을 import한다. G9·G11에서 본다 (G7 재실측).
34. e2e 하네스의 표시용 경로 문자열 6줄(`gap1-p14` 57·63, `gap1-visual` 66, `tg1-p07` 460~462)이 G7 뒤 옛 위치를 보여 준다. 고치면 PNG 기준선이 바뀌므로 화면 기준선을 새로 잡는 goal에서 함께 고친다 (G7 결정 대장).
35. 스크린샷 「안정 45장」 기준선이 약하다. G7 이동 뒤 세 번 실행에서 5장이 회차마다 해시가 흔들렸다. G8부터는 빌드 CSS sha256을 주 판정으로 두고, 스크린샷은 「여러 회차 중 한 번이라도 기준선과 일치」로 본다. 근본 수리는 하네스의 애니메이션·스피너 정지(결정적 캡처)다 (G7 워커 실측).
36. 옮긴 renderer 파일 안에 이동 뒤에도 유효해서 안 고친 상대 경로가 남았고(예: `03_Agent/state/runtime.ts`의 `'../../lib/time'`), 테스트 다수가 아직 안 옮긴 `store/appStore`를 상대 경로로 가리킨다. G8 import 수정 때 별칭으로 맞춘다 (G7 워커 실측).
