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
