# M06 G7 — vitest 훅 타임아웃 · beforeAll 같은 준비 단계도 테스트 본문처럼 30초 한도를 쓴다

- 마일스톤: M06 자가 개발 (G6 실주행에서 앱 안으로 돌리는 goal, Backlog 14) · 작성: 2026-11-17 · 상태: 병합 대기 (PR 64 — 앱 안 카드는 거부, 병합 승인은 앱 밖 결정 보드) · 검증 강도: 약(테스트 설정 한 줄과 그 고정 테스트 — 앱 소스 변경 0, 판정 장치는 `planPath`만)
- 작업 브랜치: `fix/m06-g7-hook-timeout` — 이 작업 트리의 머리 `6eb6d0dc`에서 가른다. PR은 `master` 기준이라 G5 종결 기록 `bca217bf`와 G6 goal 문서 `6eb6d0dc`를 함께 싣고, 병합하면 master의 `planPath`가 G7을 가리킨다. G6 브랜치는 메인 쪽 `e077d409`에서 계속 열려 있다.

## 목표

이 기계에서 vitest 훅(`beforeAll` 등)이 콜드 import로 10초를 넘겨도 시간 초과로 깨지지 않는다.
훅 기본 타임아웃 `hookTimeout`이 테스트 기본 타임아웃 `testTimeout`과 같은 30초가 되고, 테스트가 그 값을 고정한다.

## 범위

- **만들 것**: 루트 `vitest.config.ts`의 `hookTimeout: 30000` 한 줄과 사유 주석 한 줄. `smoke.test.ts`에 그 값을 고정하는 테스트 한 건(G3의 `testTimeout` 고정 테스트와 같은 꼴). 테스트를 먼저 쓴다. 사용자 결정으로 더한 것: `sdkOptions.session-state-env.test.ts`가 각 테스트 앞에서 상속된 `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS`를 비우고 끝나면 되돌리게 하는 격리.
- **건드릴 곳**: `vitest.config.ts`, `02_Project/01_TestCode/smoke.test.ts`, `02_Project/01_TestCode/main/04_Claude/sdkOptions.session-state-env.test.ts`(사용자 결정으로 추가), 이 goal 문서, `99_Backlog.md`, `01_Work_Pin.md`(마감 요약과 현재 goal 줄만). 판정 장치는 `98_Management/01_GateState/gate-config.json`의 `planPath` 한 줄뿐이다(1단계).
- **하지 않을 것**: 앱 소스 변경. `testTimeout` 등 다른 vitest 설정 변경. 콜드 import 자체를 줄이는 작업(M05 Backlog 45). `pickerOptions.audit-fix.test.tsx` 수정. `.claude/commands/gate.md` 판정 세칙 수정. `planPath` 밖의 판정 장치 변경. `00_Roadmap.md`(G6 몫). PR 병합(승인 항목).
- **완료조건**
  - `vitest.config.ts`의 `test` 블록에 `hookTimeout: 30000`이 있고, `smoke.test.ts`의 새 테스트가 설정 변경 전 Red, 변경 뒤 Green이다.
  - `pickerOptions.audit-fix.test.tsx` 단독 실행이 통과한다.
  - `sdkOptions.session-state-env.test.ts`가 그 변수가 물려 내려온 앱 세션에서 고치기 전 Red, 고친 뒤 단독 통과다.
  - 하드 게이트 다섯 종 exit 0, `npm run test` 실패 0.
  - 작업 브랜치가 push되고 PR이 열려 있으며, 병합 승인 요청이 앱 대화에 올라와 있다.

## Phase 1 — vitest 훅 타임아웃 · 태그: `source` · 의존: 없음

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. goal 문서 준비 — 합의 기록, 작업 브랜치 생성, `planPath` 전환, pin 갱신
- [x] 2. 실패하는 테스트 먼저 쓰기 — `smoke.test.ts`에 `hookTimeout: 30000` 고정 테스트를 더하고 단독 실행 Red 확인. 변경 전 `pickerOptions.audit-fix.test.tsx` 단독 실행 결과도 남긴다
- [x] 3. 훅 타임아웃 30초로 올리기 — `vitest.config.ts`에 `hookTimeout: 30000`과 사유 주석, 두 파일 단독 실행 Green
- [x] 4. 전체 검증 — 상속 환경 변수에 흔들리는 테스트 하나 격리(사용자 결정), diff 실사, 하드 게이트 다섯 종, `npm run test`
- [x] 5. PR 올리고 병합 승인 요청 — 커밋, `-u origin` push, `gh pr create`, 앱 대화에 결과 보고

실행 단계 일괄 승인 대상

- `git switch -c fix/m06-g7-hook-timeout`, `npx vitest run <파일>` 단독 실행, 하드 게이트 다섯 종, `npm run test`, 커밋, `git push -u origin fix/m06-g7-hook-timeout`, `master` 기준 `gh pr create`. 병합(`gh pr merge`)은 들어 있지 않다.

DoD

- 앱 소스 변경 0. 코드 변경은 `vitest.config.ts`의 두 줄(설정과 주석), `smoke.test.ts`의 테스트 한 건, `sdkOptions.session-state-env.test.ts`의 변수 격리뿐이다.
- 검증 기록의 PASS 줄은 `npm run test` 전체 Green 뒤에만 적는다 — 태그가 `source`라 TDD 가드가 Green 증거를 요구한다.
- 마크다운 문서 250줄 이하.

검증 기록

- FAIL 2026-11-17T09:48:11+09:00 4단계 — 앱 세션 안 `npm run test -- --reporter=dot --no-color`가 1건 실패했다(파일 1 실패·434 통과·6 건너뜀, 테스트 5870 통과·10 건너뜀). 실패는 `sdkOptions.session-state-env.test.ts` (c)의 `build()` 호출 전 전제다. 앱이 SDK에 넣는 `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1`(`sdkOptions.ts:100`)이 세션의 Bash까지 물려 내려와 `printenv`가 `1`을 돌려줬다. 이번 변경과는 무관하다. 시도: 색 코드 없이 재실행해 같은 1건, 그 변수를 뺀 `env -u` 단독 실행은 3건 통과. 같은 트리에서 하드 게이트 다섯 종 exit 0, smoke 단독 4건 통과(변경 전 새 테스트 1건 Red), `pickerOptions.audit-fix.test.tsx` 단독 34건 통과(8.08초)를 확인했다. 변경 전 `--hookTimeout=3000` 진단에서는 9번째 줄 `beforeAll`이 「Hook timed out in 3000ms」로 깨졌다. 태그가 `source`라 TDD 가드가 전체 Green 없이는 PASS 줄을 받지 않는다. 그래서 범위·완료조건 변경 정지점으로 보고 push·PR을 보류한다. 세션 611e2fcf, 기준 HEAD d36d5ebd(작업 트리 변경 포함).
- USER-INPUT 2026-11-17T09:51:11+09:00 — 사용자 결정 「테스트 고치기」: 상속된 환경 변수에 흔들리는 `sdkOptions.session-state-env.test.ts`를 변수와 무관하게 고치는 일을 G7 범위에 더한다(결정 대장 `[USER]`).
- PASS 2026-11-17T09:59:42+09:00 1단계 — 앱 대화 답 「합의」를 결정 대장 `[USER]` 줄로 올리고, `6eb6d0dc`에서 `fix/m06-g7-hook-timeout`을 갈라 `planPath`를 이 문서로 돌렸다(커밋 d36d5ebd).
- PASS 2026-11-17T09:59:42+09:00 2단계 — `smoke.test.ts`의 새 고정 테스트는 설정 변경 전 단독 실행에서 1건 Red였다. 변경 전 `pickerOptions.audit-fix.test.tsx` 단독은 34건 통과(8.33초)로 재현되지 않았지만, `--hookTimeout=3000` 진단에서 9번째 줄 `beforeAll`이 「Hook timed out in 3000ms」로 깨져 이 준비 단계가 `hookTimeout`에 묶임을 확인했다.
- PASS 2026-11-17T09:59:42+09:00 3단계 — `vitest.config.ts`에 `hookTimeout: 30000`과 사유 주석을 넣었다(커밋 79f28388). smoke 단독 4건, audit-fix 단독 34건(8.08초)이 통과했다.
- PASS 2026-11-17T09:59:42+09:00 4단계 — 사용자 결정으로 `sdkOptions.session-state-env.test.ts`가 각 테스트 앞에서 상속 변수를 비우고 끝나면 되돌리게 고쳤다. 변수가 있는 앱 세션에서 단독 실행이 Red 1건에서 3건 통과로 바뀌었다. 최종 트리의 diff 실사는 코드 3파일, 하드 게이트 다섯 종 exit 0이다. 앱 세션 안 `npm run test -- --reporter=dot --no-color`는 파일 435 통과·6 건너뜀, 테스트 5871 통과·10 건너뜀, 실패 0이다. TDD 가드 `green-기록`(09:59:23, 세션 611e2fcf)도 확인했다.
- PASS 2026-11-17T10:01:26+09:00 5단계 — `-u origin fix/m06-g7-hook-timeout`으로 push하고 PR 64(https://github.com/bass131/AgentDeck/pull/64)를 `master` 기준으로 만들었다(커밋 fd7ea5a4까지). G5 종결 기록과 G6 goal 문서 커밋을 함께 싣는다. 병합 승인은 앱 대화로 요청한다.

## 결정 대장

- [USER] G6 실주행에서 앱 안으로 돌릴 goal을 Backlog 14로 정하고 G7로 쓴다 — 「goal은 01_Milestones/M06_SelfDev/99_Backlog.md 14번(pickerOptions.audit-fix.test.tsx beforeAll이 10초 hook 타임아웃을 넘는 문제 — vitest hookTimeout을 testTimeout처럼 올리기)으로 하고, G7로 goal 한 장을 써서 나와 합의해 줘」 (2026-11-17)
- [AI] 검증 강도를 약으로, 방식을 전역 기본값으로 둔다 — 바뀌는 것은 테스트 설정 한 줄과 그 고정 테스트뿐이고 판정 장치는 `planPath`만 건드린다. 전역 값은 같은 콜드 import를 겪는 다른 파일의 훅도 덮는 대신, 정말 멈춘 훅이 10초가 아니라 30초 뒤에 실패한다 (2026-11-17)
- [AI] 작업 브랜치는 이 작업 트리의 머리에서 가르고, 승인 요청은 앱 대화로만 한다 — G6 무대가 세션 작업 트리를 G6 브랜치 머리에 두었다. 현황판 결정 보드의 답은 메인 터미널로 들어가서 앱 밖 개입이 된다 (2026-11-17)
- [USER] G7 goal 한 장을 합의한다 — 검증 강도 약, 전역 `hookTimeout` 30초, 작업 브랜치 기점, 앱 대화 승인 경로, 실행 단계 일괄 승인 목록을 적은 문서 그대로. 앱 대화 답 「합의」 (2026-11-17)
- [USER] 앱 안 `npm run test`를 깨뜨리는 `sdkOptions.session-state-env.test.ts`를 상속 환경 변수와 무관하게 고치는 일을 G7 범위에 더한다 — 각 테스트 앞에서 변수를 비우고 끝나면 되돌린다. G6 보고서에는 사다리 5칸을 범위 추가로 넘었다고 적는다. 앱 대화 답 「테스트 고치기」 (2026-11-17)
- [USER] PR 64를 앱 안에서는 병합하지 않는다 — 앱 대화 답 「병합」 뒤 `gh pr merge 64 --merge`의 가드 카드(hook-log 10:06:08 `ask`, `gh-pr-merge`)를 의도적으로 거부했다. G6 실주행 측정이라 병합 승인은 앱 밖 결정 보드로 따로 받는다. 앱 대화 답 「보류 — 카드 거부는 실수가 아니야. G6 실주행 측정이라 병합 승인은 앱 밖 결정 보드로 따로 받을게. 기록 남기고 멈춰.」 (2026-11-17)

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
