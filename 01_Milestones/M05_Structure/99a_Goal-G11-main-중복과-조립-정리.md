# M05 G11 — main 중복과 조립 지점 정리 · 확인된 중복 위치 쌍을 하나로, 조립 지점을 `00_App` 하나로

- 마일스톤: M05 구조 감사와 도메인별 재편 (로드맵 2번) · 작성: 2026-11-15 · 상태: 종결 (PR 55 병합, master `b19b1787`) · 검증 강도: 강(main 소스 50줄 이상 예상, 조립 구조 변경)
- 작업 브랜치: `chore/m05-g11-main-dedupe` — PR 52 병합 뒤의 `origin/master`(`558046ab`)에서 시작했다.
- 출발점: `12_G1-재편-계획.md`의 G11 절, `11_G1-감사-보고서.md` 1절 6항(조립 지점 셋, 인스턴스 이중 생성, 워크스페이스 루트 원천 둘)·3절(권한 모드 매핑 표 네 벌)·4절(확인된 중복 위치 쌍), Backlog 4(SDK 버전 폴백 `0.3.186`이 두 곳이고 낡음). 재실측 결과는 `99b_G11-재실측.md`.
- 병행: 보조 세션이 worktree `C:\Dev\AgentDeck-h5`에서 H5(현황판 알림 다듬기)를 진행한다. 이 goal은 `99_Others/Dashboard/`를 건드리지 않는다.

## 목표

main 프로세스에서 같은 일을 하는 코드가 위치마다 한 곳으로 줄고, 앱 조립이 `00_App` 한 곳에서 일어나 store 인스턴스가 이중으로 생기지 않는다. 권한 모드 매핑 표는 한 곳에 모이되 값은 그대로다.

## 범위

- **만들 것**
  - 확인된 중복 일곱 쌍 통합 — SDK 버전 읽기(폴백 값 포함, Backlog 4), credentials 읽기, 버전 비교, frontmatter 파싱, 비활성 목록 처리, 폴더 선택, `app.getPath('userData')` 해석. 위치는 재실측이 정한다(G4~G10 이동 뒤 경로).
  - 조립 지점 하나 — `main/index.ts`, 컨텍스트의 전역 싱글톤(지금 `00_App/context.ts`), IPC 등록부에 흩어진 조립을 `00_App` 한 곳으로 모은다. `ClaudeCodeBackend`가 호출마다 skills·MCP store를 새로 만드는 것을 조립 지점이 만든 하나로 바꾼다.
  - 워크스페이스 루트 원천 하나 — `currentWorkspaceRoot`와 `roots` 두 원천을 하나로.
  - 권한 모드 매핑 표 하나 — 네 벌을 한 모듈의 표로 모으고, 시작 시 의미와 실행 중 전환 의미가 다른 값(`auto`)은 표 안에 두 칸으로 그대로 둔다.
- **건드릴 곳**: `02_Project/00_Source/main/`(조립·중복 위치만, 도메인 동작은 그대로), 대응 테스트(`02_Project/01_TestCode/`), `collection-baseline.test.ts`, 이 goal 문서, `98_Management/01_GateState/gate-config.json`의 `planPath` 한 줄(판정 장치 — 1단계), work-pin, Backlog, H3·H4 goal 문서의 상태 줄과 종결 기록. 2b단계에 한해 `.claude/hooks/state-race.test.mjs`·`fixtures/race-concurrent/run.cjs`·`_lib/state-store.cjs`(판정 장치 — 불안정 수리).
- **하지 않을 것**: 권한 모드 값·의미 변경(M06), renderer·preload·shared 계약 변경, IPC 채널 추가·변경, 저장 형식 변경, 테스트 이름·배치 규칙(G12), 판정 장치 변경(포인터 한 줄과 2b단계 말고 — 잠금 의미론과 RC 판정 기준은 바꾸지 않는다), 새 기능, `99_Others/Dashboard/`, CSS.
- **완료조건**
  - 재실측 표의 중복 위치 쌍마다 구현이 한 곳만 남는다(전후 grep 결과를 검증 기록이나 부속 문서에 둔다).
  - store 인스턴스가 이중으로 생기지 않는다 — 같은 앱 수명에서 `ClaudeCodeBackend` 실행을 두 번 해도 skills·MCP store가 같은 인스턴스임을 테스트가 고정한다.
  - 워크스페이스 루트를 읽는 곳이 하나의 원천을 거친다(테스트 또는 grep으로 고정).
  - 권한 모드 매핑이 한 모듈에만 있고, 기존 매핑 값(시작 시 `auto→acceptEdits`, 실행 중 `auto→auto` 등)을 테스트가 그대로 고정한다.
  - 하드 게이트 다섯 종 exit 0. `npm test`는 같은 기계에서 master와 대조해 새 실패 0이다 — 이 노트북은 콜드 import 타임아웃(Backlog 45·57)으로 renderer 15파일이 결정적으로 깨지므로, 그 집합이 master와 같고 main·agents·shared 실패가 0이면 통과다. 테스트 수의 변화는 `collection-baseline.test.ts`에 사유와 함께 반영된다.
  - 화면: renderer를 건드리지 않으므로 빌드 CSS sha256 `090224c4…a3006e`가 같다.

## Phase 1 — main 중복과 조립 정리 · 태그: `refactor` · 의존: G10

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. 이 goal 문서, 포인터 전환(`98_Management/01_GateState/gate-config.json`의 `planPath`), pin 갱신, H3·H4 종결 표기
- [x] 2. 재실측 — 중복 일곱 쌍의 지금 위치·차이·호출부, 조립 지점과 싱글톤·이중 인스턴스, 워크스페이스 루트 원천, 권한 모드 표 네 벌의 값, 규모와 커밋 순서, 분할 필요 여부
- [x] 2b. 판정 장치 — `state-race` RC-02·RC-04 불안정 수리(Backlog 58). 원인을 실측으로 확정하고, Red 대본이 겹침·손실을 판정불능 없이 결정적으로 읽게 한다. 완료: 노트북에서 `state-race.test.mjs` 단독 20회 연속 통과, `test:hooks` 전체 exit 0
- [x] 3. 구현 1 — 중복 여섯 쌍 통합(동작 무변경, 구조 — 버전 비교 쌍은 결정 대장대로 제외)
- [x] 4. 구현 2 — 조립 지점 `00_App` 하나, store 이중 생성 제거, 워크스페이스 루트 원천 하나
- [x] 5. 구현 3 — 권한 모드 매핑 표 하나(값 유지)
- [x] 6. 강 등급 검증 — 구현 문맥 없는 검수자(`reviewer`, fable), 하드 게이트 다섯 종, `npm test` master 대조, 빌드 CSS sha
- [x] 7. 커밋, 작업 브랜치 push, PR 생성, 병합 승인 요청

실행 단계 일괄 승인 대상 (로드맵 합의로 승인됐다 — 헌법 11조 일회 예외)

- 하드 게이트 다섯 종, `npm test`, 개별 vitest 실행, master 대조용 `git worktree add --detach`와 node_modules 정션
- `worker`(구현, Opus effort high)·`reviewer`(검수, fable) 하위 에이전트 기동
- 커밋, 작업 브랜치 push, `gh pr create`

DoD

- 구조만 바꾸는 커밋과 조립 순서를 바꾸는 커밋을 나눈다. 커밋마다 하드 게이트가 통과한다.
- 남는 중복과 합치지 않은 위치는 근거가 적혀 있다.
- 마크다운 문서 250줄 이하.

검증 기록

- PASS 2026-11-15T20:59:15+09:00 — 1단계. 이 goal 문서를 쓰고 `planPath`를 이 문서로 옮겼다(SessionStart가 새 경로를 실존으로 읽었다). pin의 현재 goal을 G11로 바꿨고, H3·H4 머리말 상태를 「종결」로 고쳐 종결 줄을 남겼다. 노트북 세션.
- PASS 2026-11-15T21:18:35+09:00 — 2단계. 읽기 전용 워커가 `99b_G11-재실측.md`(106줄)를 썼다. 메인 세션이 대조한 사실: SDK 버전 읽기 두 벌(`ClaudeCodeBackend.ts:18`·`engineState.ts`), 권한 모드 표 네 벌(`runArgs.ts:10-16` auto→acceptEdits, `claudeAgentRun.ts:31-36` auto→auto, `claudeStream.ts:128-134` 역매핑, `agent.ts:27` 화이트리스트 — 넷 다 main), `cmpVer`(`Number`)와 `compareDesc`(`parseInt`)의 pre-release 차이, `ConversationStore`는 한 번 생성·참조 공유. 버전 비교 쌍은 합치지 않기로 결정 대장에 적었다(Backlog 61). goal의 Backlog 번호(9→4)와 컨텍스트 경로(`00_App/context.ts`)를 고쳤다. 노트북 세션.
- USER-INPUT 2026-11-15T21:31:07+09:00 — 3단계 구현 워커의 첫 편집이 편집 계획 게이트의 주도권 판정(`[AI] 4 > [USER] 3`)에 막혔다(편집 0, 커밋 0). 선택지형 문답 네 안건을 냈고, 사용자는 `state-race` 안건에만 「깨지는 부분도 같이 고치기」로 답했다. 그 줄을 [USER]로 전환하고 2b단계를 더했다. 버전 비교·SDK 폴백 안건은 [AI]로 남는다(`[AI] 3 ≤ [USER] 4`). 노트북 세션.
- PASS 2026-11-15T21:34:52+09:00 — 2b단계. 원인 실측: 고치기 전 단독 6회 중 2회 판정불능이었고, 진단 출력으로 본 timeline에서 한 프로세스의 rename이 `EPERM: operation not permitted`로 실패해 `renameAt`이 없었다(Windows는 같은 대상으로의 동시 rename을 거부한다). 손실은 매번 성립했다. 수리: `run.cjs`가 쓰기 실패 쪽의 임계구간 끝을 `writeAt`(보수적 하한)으로 잡고 `writeFailed`를 세며, 테스트가 판정불능일 때 timeline과 오류를 출력한다. 잠금 의미론·RC 판정 기준·`state-store.cjs`는 그대로다. 수리 뒤 단독 20회 연속 통과(그중 7회는 rename 충돌이 실제로 난 실행), 하드 게이트 다섯 종 exit 0. Backlog 58 해소. 노트북 세션.
- PASS 2026-11-15T22:17:53+09:00 — 3·5단계. 워커 커밋 9개(`994bed5d`~`eecc12be`), 커밋마다 하드 게이트 다섯 종 exit 0(`c842a03d`만 첫 lint가 Write 도구의 `﻿`→실제 BOM 치환으로 깨져 `charCodeAt` 꼴로 고친 뒤 0), `test:hooks` 재실행 0회. 메인 대조: diff 33파일이 `main/`·`01_TestCode/` 안뿐, `0.3.186` 0곳, `getPath('userData')` 1곳(`02_Common/userData.ts`), `credentials.json`·`parseFrontmatter` 각 1곳, 권한 표 정의는 `04_Claude/permissionModes.ts` 한 곳이고 값이 옛 네 벌과 같다(auto 시작 acceptEdits·실행 중 auto, bypass는 실행 중 전환 거부, 화이트리스트는 배열 `.includes`). 새 테스트 6파일로 수집 427→433. main·agents·shared·integration vitest 2403 통과·12 건너뜀(실계정 probe). 남긴 차이(버전 해석 순서, 토큰 추출, 투영 모양, 폴더 사후 검증)는 동작 보존 근거로 그대로다. `sdkVersion`은 이동 맵 50행의 `02_Common` 대신 `10_Engine`에 뒀다 — 도메인을 아는 엔진 코드라 「도메인 모르는 공용 부품」 정의에 맞지 않는다(메인 판단, 되돌리기 쉬움). 노트북 세션 Night Shift.
- PASS 2026-11-15T22:52:26+09:00 — 4단계. 워커 커밋 4개(`b55c9f75` 루트 원천 `roots` 하나, `2dd90712` ConversationStore 소유자 하나, `cdc5a541` 실행용 skills·MCP store를 조립 지점 것 하나로, `8a200743` 조립을 `00_App/bootstrap.ts`로), 커밋마다 하드 게이트 다섯 종 exit 0·`test:hooks` 재실행 0회. 기동 순서는 옮기기 전과 같아 「조립 순서를 바꾸는 커밋」은 생기지 않았다. 메인 대조: diff 14파일이 `main/`·`01_TestCode/` 안뿐, `currentWorkspaceRoot` 0곳, `createSkillsStore(`·`createMcpStore(`·`createConversationStore(` 호출은 `00_App/context.ts`에만. 새 테스트 `appAssembly.test.ts`(백엔드 실행 두 번에 store 생성 각 1회 — 옛 코드에서 Red)와 `workspace-root-source.test.ts`, 수집 433→435. main·agents·shared·integration 2403 통과·12 건너뜀·실패 0. 남긴 예외: `new BrowserWindow`·줌 복원은 `index.ts`(창 수명주기), 핸들러의 `getBackend` 조회, `LspManager`의 `_instance` 보유 — 생성은 모두 `00_App` 안이다. 워커가 3·5단계 줄의 2403과 지금 2403(새 사례 19건 포함)이 맞지 않음을 짚었다 — 앞 실행은 루트의 `collection-baseline`·`smoke`를 같이 셌다. 기존 사례 감소 여부는 6단계 master 대조로 확인한다. 노트북 세션 Night Shift.
- PASS 2026-11-15T23:08:26+09:00 — 6단계. 구현 문맥 없는 검수자(`reviewer`, fable)가 차단 0, 비차단 4건을 냈다 — 2b 끝점 보정이 rename 밖 쓰기 실패까지 받는 것, `fs.diff` 루트가 동작으로 고정되지 않은 것은 `55e5ed2a`로 고쳤고(state-race 단독 20회 통과, 그중 9회 rename 거부 실발생), `appAssembly.test.ts`의 사례 순서 의존과 권한 표 「한 곳」 검사의 좁음은 Backlog 69로 넘겼다. 검수자가 기동·종료 순서, 창 둘, try 위치, userData 시점, E2E 환경변수, 권한 표 값·키 순서, 루트 원천, 2b가 겹침을 거짓으로 만들 수 없음을 확인했다. `npm test` master 대조(같은 노트북): master 8파일·48건 실패(5624건), HEAD 16파일·180건 실패(5786건), 실패는 양쪽 다 renderer뿐이고 G11의 renderer·shared·preload diff는 0, HEAD 실패 16파일을 `--testTimeout=30000`으로 다시 돌려 294건 전부 통과 — 콜드 import 타이밍(Backlog 57)이지 회귀가 아니다. main·agents·shared 실패 0, 수집 427→435(새 테스트 8파일). 하드 게이트 다섯 종 exit 0, 빌드 CSS sha256 `090224c4…02a3006e` 같음. 노트북 세션 Night Shift.
- PASS 2026-11-15T23:09:12+09:00 — 7단계. 작업 브랜치를 push하고 PR 55를 만들었다(본문에 버전 비교 비통합·SDK 폴백 값 변경·2b 판정 장치 수리를 예외로 밝힘). 사용자가 자는 중이라 병합 승인은 아침 대기열이다. 노트북 세션 Night Shift.
- PASS 2026-11-16T04:28:33+09:00 — 종결. 사용자가 「둘다 병합하고」로 승인해 PR 55를 병합했다(master `b19b1787`). goal의 마감 판정은 병합 승인이 겸한다(헌법 11조). 결정 대장의 [AI] 둘(버전 비교 비통합, SDK 폴백 별도 커밋)은 사용자에게 다시 설명했고 답은 아직이다. 노트북 메인 세션.

## 결정 대장

- [USER] 이 로드맵의 goal들은 헌법 11조의 예외로 합의 문답 없이 이어서 진행한다. 사용자가 「이번 순서만 예외로 이어서 처리」로 답했다 (로드맵 문답, 2026-11-13)
- [USER] 이 goal의 범위 초안은 G1 재편 계획의 G11 절이다. 사용자가 PR 37 병합으로 승인했다 (2026-11-13)
- [USER] 메인 세션은 기존 AgentDeck 작업을 이어 가고, 현황판 다듬기는 보조 세션에 맡긴다 — 「메인 세션은 기존 에이전트 덱 작업 이어서 진행해줘」 (2026-11-15)
- [AI] 버전 비교 쌍(`engineCheckUpdate.ts` `cmpVer` ⇄ `engineVersions.ts` `compareDesc`)은 합치지 않는다. `cmpVer`는 `Number`라 `0.3.201-rc.1` 같은 pre-release에서 NaN을 내 갱신 알림이 꺼지고, `compareDesc`는 `parseInt`라 0으로 읽는다 — 합치면 「도메인 동작은 그대로」를 어긴다. DoD의 「합치지 않은 위치는 근거가 적혀 있다」로 처리하고, pre-release 비교 결함은 Backlog에 남긴다. 완료조건 문구는 바꾸지 않고 PR과 병합 요청에 이 예외를 밝힌다 (2026-11-15)
- [AI] SDK 폴백 값 `0.3.186`→설치본 버전은 폴백 경로에서만 보이는 값 변경이라 구조 커밋과 따로 두고, 값을 고정한 기존 테스트와 드리프트 고정 테스트를 함께 고친다. Backlog 4의 해소다 (2026-11-15)
- [USER] 하드 게이트의 `state-race` RC-02·RC-04 불안정(Backlog 58)을 재실행 규칙으로 덮지 않고 이 goal에서 고친다 — 처음 [AI]로 「재실행 통과면 PASS 줄 안에 공개」를 정했으나, 선택지형 문답에 사용자가 「깨지는 부분도 같이 고치기, 매번 불필요한 FAIL이 생기면 noise다」로 답했다. 2b단계를 더하는 범위 변경이고 판정 장치 편집은 그 단계에 명시된 세 파일로 한정한다 (2026-11-15T21:31:07+09:00)
- [AI] `ConversationStore`는 `index.ts:55`가 한 번 만들고 `setStore`로 `00_App/context.ts`에 같은 참조를 넘긴다 — 이중 인스턴스가 아니라 소유자가 둘인 것이라 조립 커밋에서 소유자를 하나로 줄인다 (2026-11-15)
- [USER] 버전 비교 쌍 비통합([AI] 줄)을 그대로 둔다 — 「결정 두 개는 1 그대로 2 그대로」. Backlog 65는 엔진 갱신 쪽 goal이 생길 때 다룬다 (2026-11-16)
- [USER] SDK 폴백 값 변경을 G11 안 별도 커밋(`1a90653c`)으로 둔 것([AI] 줄)을 그대로 둔다 — 같은 답 「2 그대로」 (2026-11-16)
