# M13 G2 — GitHub 기기 인증과 자격 · 앱이 직접 잇는 계정과 그 토큰의 쓰임

- 마일스톤: M13 (마일스톤 스펙 `01_Milestones/M13_Installer/00_마일스톤-스펙.md`) · 작성: 2026-11-22 · 상태: 실행 중 · 검증 강도: 강(자격 경로 교체, 앱 소스 50줄 이상)
- 작업 브랜치: `feat/m13-g2-device-auth` · 기준 브랜치: `milestone/m13-installer`(`12c15838`, goal 1 병합 머리)

## 목표

앱이 GitHub 기기 인증(device flow)을 직접 해서 받은 토큰을 Windows 자격 보호(`safeStorage`)로 저장하고, 그 토큰으로 앱의 GitHub 읽기(PR 카드)와 실행기의 원격 동작을 한다. 토큰은 화면과 렌더러로 다시 나가지 않는다. 실제 GitHub 쪽 승인은 OAuth App 등록(사람 몫) 뒤 goal 6에서 잰다.

## 범위

- **만들 것**
  - 기기 인증 — 기기 코드 요청, 사용자 코드·확인 주소 표시와 브라우저 열기, 간격을 지킨 토큰 폴링(`authorization_pending`·`slow_down`·`expired_token`·`access_denied` 처리), 취소. 핵심 흐름은 주입한 HTTP 함수로 도는 순수 모듈로 둔다.
  - OAuth App 클라이언트 ID — 앱 설정에 둔다(비밀 값 아님). 비어 있으면 「GitHub 연결 준비가 안 됐어요」로 안내하고 흐름을 시작하지 않는다. 요청 권한(scope)은 결정 대장 줄을 따른다.
  - 저장 — 토큰은 `safeStorage.encryptString`으로 앱 데이터의 파일 하나에 쓴다. `safeStorage`를 쓸 수 없으면 저장하지 않고 이유를 보인다. 연결 해제는 그 파일을 지운다.
  - 상태 — 연결된 계정 이름(`GET /user`)과 연결 여부만 렌더러로 보낸다.
  - 쓰임 — 앱이 연결돼 있으면 PR 카드의 gh 호출(`08_Git/prMerge.ts`)과 실행기의 gh·git 원격 동작이 그 토큰을 `GH_TOKEN`으로 받는다. 연결이 없으면 지금처럼 사용자 환경의 gh 로그인을 쓴다. 노드 세션과 검사 명령의 자격 없는 환경(`childEnv.ts`)은 그대로다.
  - 화면 — 설정에 「GitHub 계정」 칸: 연결 버튼, 사용자 코드와 「GitHub에서 열기」, 기다림·성공·실패 표시, 연결된 계정 이름, 연결 해제.
  - 시험 — 흐름 모듈 단위 시험, 로컬 시험 서버(기기 코드·토큰·`/user` 흉내)로 끝까지 도는 통합 시험, 저장 모듈(암호화 가짜), 토큰이 렌더러로 가지 않음, 자격 경로 교체(연결 있음·없음).
- **건드릴 곳**: `02_Project/00_Source/`, `02_Project/01_TestCode/`, `01_Milestones/M13_Installer/`, 판정 장치 `98_Management/01_GateState/gate-config.json`(`planPath` 전환, 1단계).
- **하지 않을 것**
  - OAuth App 등록, 실제 GitHub 승인 실측(goal 6, 사람 몫).
  - 첫 실행 안내 흐름(goal 3), 자동 업데이트의 Release 읽기(goal 4 — 이 goal의 토큰 읽기 함수를 그때 쓴다).
  - gh CLI를 REST 호출로 바꾸기, 노드 세션에 자격 넘기기, `.claude/`·두 헌법·`package.json` `scripts` 변경.
- **완료조건**
  - 시험이 기기 인증의 성공·기다림·늦추기·만료·거부·취소를 묶고, 로컬 시험 서버로 코드 요청부터 토큰 저장과 계정 이름 읽기까지 끝까지 돈다.
  - 시험이 토큰이 `safeStorage`로만 저장되고 렌더러로 가는 IPC 응답에 없음을 묶는다.
  - 시험이 연결이 있으면 PR 카드와 실행기 gh·git 호출의 환경에 그 토큰이 `GH_TOKEN`으로 들어가고, 없으면 지금과 같으며, 자격 없는 환경은 바뀌지 않음을 묶는다.
  - 앱 화면의 「GitHub 계정」 칸이 시험 서버를 향한 빌드본에서 연결·표시·해제까지 돈다(e2e, 2번 모니터, 캡처).
  - 하드 게이트 다섯 종 통과, `npm test` 실패 0.

## Phase 1 — GitHub 기기 인증과 자격 · 태그: `feature` · 의존: 없음

진척 단계

- [x] 1. goal 준비 — 이 문서, goal 1 종결 기록, `gate-config.json` `planPath` 전환(판정 장치)
- [x] 2. 구현 — 흐름 모듈, 저장, IPC, 자격 경로 교체, 설정 화면, 시험
- [x] 3. 실앱 확인 — 시험 서버를 향한 빌드본 e2e, 캡처
- [x] 4. 하드 게이트 다섯 종, `npm test`
- [>] 5. 독립 검수와 반영
- [ ] 6. goal PR, `hard-gates`, 로컬 goal 병합

실행 단계 일괄 승인 대상 (스펙에서 옮김)

- vitest, 하드 게이트 다섯 종, `npm test`, 앱 빌드본 기동과 e2e(창은 2번 모니터), 작업·독립 검수 하위 에이전트, 커밋, 작업 브랜치와 마일스톤 브랜치 push, `gh pr create`, 로컬 `git merge --no-ff`.

DoD

- 완료조건 다섯 줄이 검증 기록 `PASS` 줄로 있다.
- 범위 밖 발견은 `99_Backlog.md`에 한 줄로 있다.

검증 기록

- FAIL 2026-11-22T01:27:24+09:00 — 시험 서버를 향한 빌드본 e2e(`m13-g2-github-account.e2e.ts`) 첫 실행이 사용자 코드 단언에서 멈췄다. 준비 안 됨 안내와 코드 요청까지는 지났다. 선택자 `getByLabel('사용자 코드')`가 「사용자 코드 복사」 버튼까지 잡은 시험 결함이다(앱 결함 아님). 시도 — 정확 일치(`exact: true`)로 고쳐 다시 돈다.
- PASS 2026-11-22T01:27:47+09:00 — 완료조건 4: 빌드본(`out/`, 격리 앱 데이터, 2번 모니터)이 로컬 시험 서버(`AGENTDECK_E2E_GITHUB_BASE`)를 향해 설정 「GitHub 계정」 칸에서 준비 안 됨 안내 → 클라이언트 ID 설정 → 연결(사용자 코드 `E2EA-1234`·승인 기다림·폴링) → 서버 승인 → 「연결됐어요」·계정 `e2e-octocat` → 연결 해제까지 돌았다(3.8s). 코드 요청 본문에 `client_id`와 `scope=repo workflow`, `/user`에 `Bearer` 토큰. 실제 `safeStorage`(DPAPI)로 쓴 `github-auth.bin`에 평문 토큰(UTF-8·UTF-16)이 없고 화면 HTML에도 없으며, 해제 뒤 파일이 지워졌다. 캡처 `github-pending.png`·`github-connected.png`·`github-disconnected.png`는 세션 임시 폴더 `C:\Users\bass1\AppData\Local\Temp\claude\09203b92aa1d0186\95eb3854-a6b8-4778-8fa2-76bc3687de2f\scratchpad\m13-g2-out\`에 있고 마일스톤 결과 보고 때 저장소로 옮긴다.
- PASS 2026-11-22T01:35:02+09:00 — 완료조건 1·2·3·5: 커밋 `05d08ab9`에 e2e 파일을 더한 트리에서 하드 게이트 다섯 종이 모두 0이고, `npm test`가 499 passed·6 skipped(505 파일), 9454 passed·10 skipped·실패 0이다. 묶는 시험 — 조건 1: `deviceFlow.test.ts`(성공·pending·`slow_down` 응답 간격과 +5초·만료·거부·취소), `githubAuth.local-server.test.ts`(로컬 서버로 코드 요청→폴링→`/user`→저장→해제). 조건 2: `tokenStore.test.ts`, `github.handler.test.ts`. 조건 3: `appToken.credential-paths.test.ts`(PR 카드 gh), `gitPort.app-token.test.ts`, `openLoop.app-token.test.ts`(실행기 git push 자격과 gh `GH_TOKEN`, 해제 뒤 사용자 도우미), `context.assembly.test.ts`·`loopDriver.test.ts`(조립 지점에서 실행기까지의 배선), `openLoop.test.ts`(자식 환경에 토큰 없음). 배선 시험은 해당 줄을 지우면 빨개지는 것을 작업 에이전트가 셋 실측했다.

## 결정 대장

- [USER] 스펙 3회차 「앱이 직접 기기 인증」, 4회차 「앱이 직접 기기 인증 유지」 — M13 스펙 결정 대장.
- [USER·위임] 요청 권한은 `repo`와 `workflow` 둘이다 — 실행기가 PR을 만들고 병합 상태를 읽고 push해야 하고(`repo`), M12 G5 실주행에서 구현 노드가 `.github/workflows/`를 고친 push가 `workflow` 권한 없이 거부됐다(M12 G5 검증 기록). Release 읽기(goal 4)도 `repo`로 된다. 근거: 성향 25(드러난 문제만 막는다), 성향 37. (2026-11-22)
- [USER·위임] 앱 토큰이 있으면 그것이 우선이고, 없으면 지금처럼 사용자 환경의 gh 로그인을 쓴다 — 설치본만 쓰는 사람(goal 6)은 앱 토큰으로 돌고, 개발 중인 이 PC는 그대로 돈다. 근거: 성향 37(범위 고정), 스펙 「gh CLI는 실행기의 도구로 계속 쓴다」. (2026-11-22)
- [AI] 시험 서버 주소를 바꾸는 길은 패키징본에서 켜지지 않는다(M13 Backlog 7의 주입 길 문제를 늘리지 않는다). (2026-11-22)

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
