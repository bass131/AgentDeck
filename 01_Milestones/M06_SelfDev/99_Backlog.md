# M06 Backlog — 범위 밖 관찰

완료조건 밖의 발견을 한 줄씩 남깁니다. 승인을 묻지 않고 기록만 하며, 다음 goal의 후보입니다.
M05에서 넘어온 항목은 `M05_Structure/99_Backlog.md`가 계속 소유합니다 — 특히 57·78(이 기계의 `npm test` 타임아웃과 TDD 가드 리셋)은 M06에서 앱 소스를 고치기 전에 다룰 후보입니다.

## 닫힘 (M11)

M11 Backlog 정리(`01_Milestones/M11_BacklogSweep/`)가 닫은 항목이다. 아래 항목 줄은 그대로 두고 닫힘은 이 표가 갖는다. 표에 없는 항목은 M11 goal 2~9가 고치면서 더한다.

| 항목 | 닫힘 | 근거 |
|---|---|---|
| 1 | 고침(M11 goal 2) | 권한 모드를 대화마다 저장하고 불러온다(`renderer/src/06_Sessions/state/sessions.ts:186`, `main/06_Sessions/store.ts:49`, `d95d7051`). 쉬는 중의 모드 변경도 저장하고(`05_Conversation/state/composer.ts:128`) 대화 폴더 `chats`를 엔진 경로 잠금에 넣었다(`main/04_Claude/permission/enginePathLock.ts:22`, `932c80e9`). 실앱 e2e `m11-g2-app-session-live.e2e.ts` C에서 두 대화가 Bypass·플랜을 따로 기억했다. |
| 2 | 고침(M11 goal 2) | 계기 usage가 턴 합계가 아니라 마지막 최상위 assistant 호출이다(`main/04_Claude/stream/eventNormalizer.ts:62,128,163`, `57c20790`). 실앱 e2e B에서 네 도구 턴 뒤 「40K / 1M 4%」. |
| 3 | 고침(M11 goal 2) | 상태 줄 가지 칸이 git의 실제 가지를 읽는다(`renderer/src/12_Window/useStatusBranch.ts:11`, `Shell.tsx:53,273`, `57c20790`, `932c80e9`). 실앱 e2e A에서 `feat/m11-g2-probe`. |
| 4 | 닫음(실측) | 캐시가 따뜻할 때 다시 열기의 캐시 생성 추가는 작고 훅 재부착은 약 500토큰, 기동 지연은 약 0.4~0.5초(표본 1)라 닫기 유예 3000ms를 둔다(`57c20790` 메시지). |
| 5 | 고침(M11 goal 7) | `50_stop-gate.cjs`의 두 지시문이 스탬프를 「장전 시각(그 값) 이후의 지금 시각」으로 찍으라고 하고, 세션 시작 시각은 장전보다 이를 수 있다고 적는다(smoke 「block 사유가 스탬프를 장전 시각 이후로…」, `88394dac`). |
| 6 | M13으로 | M11 스펙 「하지 않을 것」 — 버전 표시는 설치본 패키징과 함께 M13이 맡는다. |
| 7 | 고침(M11 goal 6) | 두 컴포넌트 파일이 컴포넌트만 내보낸다. `nextInject`는 `renderer/src/12_Window/inject.ts`로 옮겼다. `Conversation.tsx`의 `ThreadView` 재수출은 지웠고, 배럴이 `ThreadView`에서 직접 내보낸다(`05_Conversation/index.ts`). `ThreadView.test.tsx`가 `Conversation.tsx`의 export 목록을 고정한다(`a55db0e9`). |
| 8 | 해결됨 | 가드가 논리 줄 판독과 이음 지운 원문 읽기로 줄 이음 꼴을 읽고(`dangerous-cmd-guard.mjs:6-8,15`, G5 `a9408c52`) 남은 꼴은 M06-20·21이 맡는다. |
| 9 | 고침(M11 goal 3) | SDK를 올릴 때 다시 돌릴 블랙박스 실측 절차를 문서로 뒀다 — 공개 `query()`와 돌려받은 값만 쓴다(`00_Documents/00_Architecture/01_SDK-재실측-절차.md` 「다시 잴 것」 첫 줄, 제안 없으면 카드). 판정 코드는 그대로다. |
| 10 | 낡음 | M07 G4 봉인과 하한 뒤로 번들 이상 버전만 돈다(`main/10_Engine/engineSeal.ts:151`). |
| 11 | 고침(M11 goal 2) | 숫자 키가 카드 종류와 상관없이 1 허용, 2 거부, 3 항상 허용이다(`renderer/src/03_Agent/PermissionCard.tsx:11`, `d95d7051`). |
| 12 | 고침(M11 goal 2) | 펼친 긴 명령은 끝까지 스크롤해야 허용되고 두 번째 요청은 줄을 선다(`PermissionCard.tsx:63,262`, `05_Conversation/state/reducer/permission.ts:27`, `d95d7051`). 길게 누른 키와 다음 요청으로 바뀐 직후 300ms의 키는 받지 않는다(`PermissionCard.tsx:90,116`, `932c80e9`). 올라온 비Bash 카드의 입력 전문은 M11 Backlog 13. |
| 13 | 고침(M11 goal 2) | SDK 목록을 못 받으면 main은 다음 요청에 다시 묻고 renderer는 5·15·60초 뒤 다시 묻는다(`main/04_Claude/modelListProvider.ts:121`, `05_Conversation/state/composer.ts:11`, `57c20790`). |
| 14 | 해결됨 | `hookTimeout`이 30000이다(`vitest.config.ts:22`, G7). |
| 15 | 고침(M11 goal 2) | `ContextStrip`이 쓰지 않던 `selectedModel`을 받지 않는다(`05_Conversation/ComposerContext.tsx`, `57c20790`). |
| 16 | 고침(M11 goal 2) | 최소 목록이 SDK 별칭 행 꼴이고 목록에 없는 모델은 effort 메뉴를 끈다(`shared/03_Agent/models/knownModels.ts:8`, `renderer/src/03_Agent/pickerOptions.ts:111`, `57c20790`). |
| 17 | 고침(M11 goal 2) | 새 대화 기본 모델이 SDK 목록 `default` 행의 정식 ID다(`knownModels.ts:17` `defaultModelOf`, `57c20790`). |
| 18 | 고침(M11 goal 2) | 모델을 바꾸면 다음 턴이 창을 새로 잴 때까지 재적재 예산에서 옛 창을 빼고 계기 창은 둔다(`composer.ts:99`, `03_Agent/state/runtime.ts:102`, `0de67e27`). 턴 도중의 변경은 그 턴의 done이 내리지 않는다(`05_Conversation/state/reducer/lifecycle.ts`, `932c80e9`). 행 값에 꼴·길이 제한을 둔다(`shared/03_Agent/models/modelList.ts:37`, `57c20790`). 패널 쪽은 M11 Backlog 14. |
| 19 | 고침(M11 goal 2) | 폴백 버전을 `package.json` 의존 명세에서 파생하고 접미 벗기기는 한 벌이다(`main/10_Engine/sdkVersion.ts:9`, `main/04_Claude/stream/claudeStream.ts:4`, `57c20790`). PR 검사는 `hard-gates`가 한다. |
| 20 | v2로 | M11 스펙 결정 대장 [USER] 2회차 — 가드 재설계 「이번엔 안 한다」. |
| 21 | v2로 | M11 스펙 결정 대장 [USER] 2회차 — 셸 파서 도입도 가드 재설계와 함께 「이번엔 안 한다」. |
| 22 | 해결됨 | 항목 본문대로 G8 결정 대장이 알려진 동작으로 닫았다. |
| 23 | 고침(M11 goal 7) | `gate.md` 기준선을 다시 쟀다 — 468파일 통과·6 스킵·실패 0, 9117 시험, 약 204초. `phase18-audit-fix` 메모를 빼고 시간 한도 30초를 적었다(`88394dac`). |
| 24 | 고침(M11 goal 2) | 지속 세션의 effort를 공개 `Query.applyFlagSettings({ effortLevel })`로 바꾼다 — 재사용 턴과 실행 중 `agent.setEffort`(`main/04_Claude/run/claudeAgentRun.ts:224`, `main/03_Agent/agentRuns.ts:77`, `57c20790`). 실측으로 deny 규칙 유지를 봤다. 패널 쪽은 M11 Backlog 14. |
| 25 | 해결됨 | 메인 대화 안에 질문·승인 카드가 뜬다(`renderer/src/13_Loop/MainChatView.tsx:6,81`, M10 G3 `547ab01b`). |
| 26 | 고침(M11 goal 2) | M06-2와 같은 고침이다(`eventNormalizer.ts:163`, `57c20790`). |
| 27 | 고침(M11 goal 2) | SDK 자동 압축은 이미 켜져 있었다(실측 `getContextUsage` `isAutoCompactEnabled` true, 문턱은 사용자 설정 `autoCompactWindow`를 따른다 — 실앱에서 「자동 압축 217K」). 지속 세션은 턴 뒤, 한 턴짜리는 첫 메시지에서 모델마다 한 번 물어 컨텍스트 칩에 보인다(`claudeAgentRun.ts:210,415,622,642`, `05_Conversation/ComposerContext.tsx:50`, `57c20790`, `932c80e9`). |
| 28 | 닫음(판단) | 겹침을 유지한다. `gh pr merge`는 M07 G12 뒤 설정 deny라 적힌 겹침은 없어졌고, 남은 겹침은 릴리스·배포 셋(설정 ask와 가드 ask)이다. 공식 permission-modes 문서 「Claude Code doesn't auto-approve the following in any mode, including `bypassPermissions`」의 첫 줄이 「Tools matched by an explicit ask rule」이다 — 설정 ask는 모든 모드에서 창을 보장하는 층이고, 가드 ask는 감싼 꼴을 잡는 층이라 하나를 빼면 보장 하나를 잃는다. 카드 사유 표시는 앱 몫으로 M11 Backlog 78. |
| 29 | 고침(M11 goal 4) | 메인 대화로 보내는 요청의 선택 칸 `proxy: true`가 대리 입력 표지다 — 기록의 사람 글이 표지를 갖고 화면에 「대리 입력」으로 보이며, 그 턴의 글에 결정 대장에 `[USER·위임]`으로 적으라는 줄이 붙는다(`main/05_Loop/mainChat.ts:65,145`, `main/01_Ipc/handlers/loop.ts:157`, `renderer/src/13_Loop/MainChatView.tsx:55`, `abde4069`). 화면 토글은 만들지 않는다(G4 결정 대장). 실앱 e2e `m11-g4-work-mode-live.e2e.ts` A에서 표지가 보였고 메인이 `[USER·위임]` 기록을 시도했다(브레인스토밍 밖이라 쓰기 창이 막았다). |
| 30 | 해결됨 | 가드 훅에 `timeout: 30`과 `onFailure: "block"`이 있다(`.claude/settings.json:70`). |
| 31 | 해결됨 | M07 G1 결정 대장 [USER] 「그대로 두고 닫기」가 닫았다(`M07_Controls/10_Goal-G1-판정-장치-정비.md:72`). |

1. 모드 선택기는 대화마다가 아니라 전역이다. 새 대화에서 Bypass를 고른 뒤 옛 대화를 열어도 Bypass로 보내진다 (G1 실측 4절 직전 화면).
2. 세션 중 모델을 Haiku 4.5로 바꾸자 컨텍스트 계기가 「429K / 200K 100%」를 보였다. 계기의 합산 방식이나 창 크기 표가 의심된다 (G1 실측, 화면).
3. 하단 상태줄의 브랜치 칸이 clone의 실제 브랜치 `chore/m06-g1-app-probe` 대신 `main`을 보였다 (G1 실측, 화면).
4. 턴 뒤 3초 만에 세션을 닫아 매 전송이 재개(SessionStart `resume`)가 되고 work-pin 전문이 매 턴 재부착된다. 컨텍스트 비용과 재개 지연을 G5 무렵 따로 잰다 (G1 실측 2절).
5. 앱 안 에이전트가 마감 요약 스탬프에 주입된 세션 시작 시각을 써서, 장전 시각보다 이른 스탬프로 두 번 더 막혔다. 스탬프 지시에 「장전 시각 이후」를 명시하는 안이 있다 (G1 실측 2절).
6. dev 실행본의 버전 표시는 `AgentDeck 0.1.0`, 빌드본은 `AgentDeck 42.4.1`이다 (G1 실측, 화면).
7. `Conversation.tsx`와 `Shell.tsx`가 컴포넌트 아닌 export를 같이 내보내 Fast Refresh가 실패하고 갱신이 `AppGate.tsx`까지 올라간다 (G1 실측 5절 dev 로그).
8. (G5에서 처리 — 원형과 검수 일곱 번이 찾은 꼴은 닫았고, 남은 꼴은 20·21번) **위험 명령 가드가 `\` 줄 이음 여러 줄 명령을 놓친다.** `git -c … \⏎ -c … push … origin HEAD:master`를 `allow`(「차단 규칙 미발동」)로 판정해, SDK가 일반 질의(제안 포함)로 보내므로 앱 `자동`·`Bypass`에서 카드 없이 실행될 수 있다. 판정 장치(가드 훅) 수정이라 계획 Step이 필요하다 (G3 재실측 clone hook-log 14:00:20).
9. G3 판별(「제안 없으면 카드」)은 문서에 없는 SDK 동작의 실측에 기댄다. SDK를 올릴 때마다 같은 블랙박스 실측을 다시 돌린다. 훅 응답 이벤트(`includeHookEvents`)에 가드의 `permissionDecision`·사유가 실려 오지만 tool_use id가 없어 지금은 쓰지 않았다 (G3 7단계).
10. 앱이 사용자 userData의 활성 엔진 버전을 쓰면 번들 0.3.201이 아닌 SDK가 돈다(`main/10_Engine/engineVersions.ts`). G3 실측은 활성 엔진 없는 임시 userData 기준이다 (G3 검수 minor 5).
11. 승인 카드의 숫자 키 2가 카드 종류에 따라 뜻이 바뀐다 — 올라온 카드에선 거부, 일반 카드에선 「항상 허용」(Bash 전체가 세션 동안 열림). 습관 입력 사고를 막을 배치 통일 후보 (G3 재검수 minor 1).
12. 펼친 긴 명령도 320px 스크롤 아래에 꼬리가 숨을 수 있고, 대기 카드가 한 칸이라 두 번째 요청이 첫 번째를 덮으면 허용이 뒤 요청에 꽂힌다. Bash가 아닌 올라온 카드에는 판단 재료(입력 전문)가 없다 (G3 재검수 minor 2·3·4).
13. 모델 목록 공급자는 한 번 받은 결과를 기억해서, 앱 시작 때 목록 요청이 실패해 최소 목록으로 떴으면 재시작 전까지 다시 묻지 않는다. 다시 묻기 버튼이나 지연 재시도 후보 (G4 구현 보고).
14. (G7에서 처리 — 훅 기본 타임아웃 `hookTimeout`을 30초로 올리고 테스트로 고정했다) `pickerOptions.audit-fix.test.tsx`의 beforeAll이 이 기계에서 10초 hook 타임아웃을 가끔 넘는다(변경 전 12.9초 실측). 기본 `hookTimeout`도 `testTimeout`처럼 올릴지 (G4 구현 보고).
15. 저장된 별칭 `opus`가 이제 SDK 목록대로 Opus 5.5로 풀린다(예전 손 표는 4.8). `ContextStrip`이 받는 `selectedModel`을 쓰지 않는다 (G4 구현 보고).
16. 모델 목록이 최소 목록으로만 떴을 때(목록 실패·앱 시작 직후 최대 20초) 저장된 `claude-opus-5`는 effort 메뉴가 켜져 보여도 effort가 안 실리고, 저장된 짧은 별칭 `opus`·`sonnet`은 model 키가 빠져 SDK 기본 모델로 돈다 (G4 검수 1-3·1-4).
17. 새 대화 기본 모델이 SDK 목록의 `default` 행이 아니라 손으로 적은 `claude-opus-5-5`다 — 「사람 손은 SDK 갱신 하나」가 기본값에는 아직 참이 아니다 (G4 검수 1-6).
18. 기록 재적재 예산은 지금 고른 모델이 아니라 직전 턴이 잰 창을 따른다(1M로 잰 대화를 200K 모델로 바꿔 세션 없이 보내면 넘칠 수 있다). 캐시 파일 행의 `value`에 길이·문자 제한이 없다 (G4 검수 1-7·1-8).
19. Dependabot PR은 `package.json`만 올린다 — `SDK_VERSION_FALLBACK`과 그 테스트 기댓값을 손으로 같이 올려야 하고, PR 검사 워크플로가 없다. `claudeStream.ts`의 접미 벗기기가 `modelList.ts`와 복제다 (G4 검수 메모).
20. 가드가 한 줄로 써도 놓치는 셸 꼴(옛 가드도 같다): `cat <<'EOF' |⏎…⏎EOF⏎bash`, `{⏎cat <<'EOF' …} | bash`, 함수 본문, `echo "$(cat <<EOF …)" | bash`, `$'it\'s'`처럼 원문 읽기의 따옴표 규칙이 bash와 다른 자리, `if [[ x =~ (#) ]]; then …`. 80만 자 넘는 `bash -c` 중첩은 스택 넘침으로 차단된다(닫힌 실패). 셸 깊이 상한(3) 밖 1.7MB 중첩은 14초 (G5 검수 3~7차).
21. G5로 가드가 588줄에서 1,032줄이 됐고, 판독 셋의 합집합(원문 읽기·논리 줄 판독·이음 지운 원문 읽기)이 셸 해석기에 가까워졌다. 테스트가 못 가르는 변이 4개(다른 판독이 대신 읽는 동치 꼴)가 남았다. 더 넓히기보다, 판독을 줄이거나 공개된 셸 파서를 쓰는 재설계를 따로 판단한다 (G5 마감, YAGNI 결정).
22. (알려진 동작으로 닫음, G8 결정 대장 — SDK 0.3.325에서도 이 변수 없이는 `session_state_changed`가 0개라 지울 수 없고, 셸에서만 빼는 공식 수단이 없다. 테스트 쪽은 G7이 처리했다) (G7에서 테스트 쪽 처리 — 그 테스트가 변수를 비운 채 돈다. 앱 변수가 세션 셸까지 물려 내려오는 것 자체는 남았다) 앱 세션 안에서 `npm run test`를 돌리면 앱이 SDK에 넣는 `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1`(`sdkOptions.ts:100`)이 세션의 Bash와 vitest까지 물려 내려와 `sdkOptions.session-state-env.test.ts` (c)의 전제가 깨진다. 그래서 앱 안에서는 TDD 가드가 `source` 태그 PASS 줄에 요구하는 전체 Green을 만들 수 없다 (G7 4단계, G6 사다리 5칸).
23. `.claude/commands/gate.md`의 기준선 숫자(400파일)와 `phase18-audit-fix` 단독 실패 메모(옛 이름, 5초 기본값)가 G3·G7 뒤로 낡았다. 지금은 441파일을 수집하고 기본값은 30초다 (G7 관찰).
24. Effort가 세션을 만들 때 정해져 대화 중에는 바꿀 수 없다 — 사용자 관찰 「Effort가 세션 생성시 고정되는게 불편하긴하네」. 앱은 기본 Effort 「최대」로 시작한다 (G6 실주행).
25. 앱 안 goal 합의 질문이 채팅 글로만 오고 질문 모달·대기 표시가 없다. 에이전트는 `AskUserQuestion`·`ExitPlanMode` 없이 표로 묻고 PushNotification만 보냈다(`자동` 모드라 플랜 승인 모달은 원래 안 뜬다). 알림을 눌러 들어와도 답을 기다린다는 것이 화면에서 두드러지지 않는다 — 사용자 관찰 「Plan 승인 modal이 떠야하는데 안뜬건가?」 (G6 실주행, 세션 `611e2fcf`).
    - 핵심은 **작업 루프의 진입을 어떻게 처리하나**다(사용자, 2026-11-17). goal 합의는 루프에 들어가는 문이라, 채팅 글이 아니라 GUI 조작으로 다뤄야 할 후보다. 다음에 점검할 것: 합의 대기를 앱이 어떻게 알아보나(전용 도구·질문 모달·goal 문서 상태 줄 중 무엇을 신호로 쓰나), 합의·수정 요청·보류를 어떤 화면 요소로 받나(모달·카드·goal 배너), 합의 결과가 결정 대장 `[USER]` 줄로 어떻게 이어지나, 루프 진행 중 병합 승인 같은 다른 사람 몫 지점과 같은 틀로 묶을 수 있나. 앱에 이미 있는 `/goal` 배너와 질문 모달, 현황판 결정 보드를 출발점으로 비교한다.
26. 컨텍스트 계기가 「현재 컨텍스트 100% · 1.8M / 1M 토큰」을 보였다 — 1M 창을 넘는 값이라 누적 합산으로 보인다. Backlog 2(Haiku 「429K / 200K」)와 같은 결함 후보다. 같은 화면 하단 상태줄 브랜치 칸은 실제 `fix/m06-g7-hook-timeout` 대신 `main`이었다(Backlog 3 재현) (G6 실주행 09:37 스크린샷, 사용자 관찰 「컨텍스트 현재 크기 표기 오류」). 같은 때 세션 기록의 마지막 응답 `usage`(입력+캐시 읽기+캐시 생성)는 241,512 토큰(약 24%)이고 압축은 0회였다 — 실제 컨텍스트는 정상이고 계기만 틀리다. 1.8M은 한 턴 안 호출들의 입력 합계로 추정한다(미확인).
27. 앱에 AutoCompact(컨텍스트가 차면 대화를 자동으로 요약해 이어 가는 기능)가 없다 — 사용자 확인 「AutoCompact 기능이 없구나」. 긴 goal 루프를 앱 안에서 끊지 않고 돌리려면 필요한 후보다 (G6 실주행).
28. `gh pr merge` 승인 카드에 가드 사유가 없고 「도구가 사유를 보내지 않았어요」가 보였다. 가드는 `ask`와 사유 「PR 병합 (master 진입)」을 냈는데(hook-log 10:06:08), `.claude/settings.json`의 `ask` 규칙 `Bash(gh pr merge*)`도 같은 명령에 걸린다. 리허설의 `git push --dry-run … HEAD:master`(설정 규칙 없음)는 사유가 보였다. 두 질의가 겹치면 사유가 빠지는 것으로 보인다 (G6 실주행 사다리 8칸).
29. 앱 안 에이전트가 메인이 위임받아 보낸 답(「합의」·「테스트 고치기」·「보류」)을 결정 대장에 `[USER]`로 적었다. 앱은 입력한 사람이 사용자인지 대리인지 모른다 — 대리 입력을 표시할 방법이 없으면 출처 태그 `[USER·위임]`을 쓸 수 없다 (G6 실주행).
30. (M07 G1에서 처리 — `timeout: 30`과 `onFailure: "block"`. 이제 시간 초과와 기동 실패는 막힘으로 떨어진다) 위험 명령 가드의 `settings.json` 항목에 `timeout`이 없어 기본 600초다. 공식 문서상 시간 초과된 command 훅은 도구 호출을 막지 않으므로, 가드가 멈추면 명령이 통과한다. 다른 훅처럼 짧은 `timeout`을 둘지 판정 장치 goal에서 정한다 (G8 실사 발견 2).
31. (M07 G1에서 닫음 — 사용자 답 「그대로 두고 닫기」, M03 P4가 의도한 상태) 스폰 게이트 `.claude/hooks/20_plan-gate.cjs`(56줄)는 M03 P4(`0b8bfdf0`)부터 `settings.json`에 배선이 없다. 파일을 지울지, 꺼진 노드로 남길지 판정 장치 정비 goal에서 정한다 (G8 실사 발견 4).
