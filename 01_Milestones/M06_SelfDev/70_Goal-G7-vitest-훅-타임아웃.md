# M06 G7 — vitest 훅 타임아웃 · beforeAll 같은 준비 단계도 테스트 본문처럼 30초 한도를 쓴다

- 마일스톤: M06 자가 개발 (G6 실주행에서 앱 안으로 돌리는 goal, Backlog 14) · 작성: 2026-11-17 · 상태: 실행 중 · 검증 강도: 약(테스트 설정 한 줄과 그 고정 테스트 — 앱 소스 변경 0, 판정 장치는 `planPath`만)
- 작업 브랜치: `fix/m06-g7-hook-timeout` — 이 작업 트리의 머리 `6eb6d0dc`에서 가른다. PR은 `master` 기준이라 G5 종결 기록 `bca217bf`와 G6 goal 문서 `6eb6d0dc`를 함께 싣고, 병합하면 master의 `planPath`가 G7을 가리킨다. G6 브랜치는 메인 쪽 `e077d409`에서 계속 열려 있다.

## 목표

이 기계에서 vitest 훅(`beforeAll` 등)이 콜드 import로 10초를 넘겨도 시간 초과로 깨지지 않는다.
훅 기본 타임아웃 `hookTimeout`이 테스트 기본 타임아웃 `testTimeout`과 같은 30초가 되고, 테스트가 그 값을 고정한다.

## 범위

- **만들 것**: 루트 `vitest.config.ts`의 `hookTimeout: 30000` 한 줄과 사유 주석 한 줄. `smoke.test.ts`에 그 값을 고정하는 테스트 한 건(G3의 `testTimeout` 고정 테스트와 같은 꼴). 테스트를 먼저 쓴다.
- **건드릴 곳**: `vitest.config.ts`, `02_Project/01_TestCode/smoke.test.ts`, 이 goal 문서, `99_Backlog.md`, `01_Work_Pin.md`(마감 요약과 현재 goal 줄만). 판정 장치는 `98_Management/01_GateState/gate-config.json`의 `planPath` 한 줄뿐이다(1단계).
- **하지 않을 것**: 앱 소스 변경. `testTimeout` 등 다른 vitest 설정 변경. 콜드 import 자체를 줄이는 작업(M05 Backlog 45). `pickerOptions.audit-fix.test.tsx` 수정. `.claude/commands/gate.md` 판정 세칙 수정. `planPath` 밖의 판정 장치 변경. `00_Roadmap.md`(G6 몫). PR 병합(승인 항목).
- **완료조건**
  - `vitest.config.ts`의 `test` 블록에 `hookTimeout: 30000`이 있고, `smoke.test.ts`의 새 테스트가 설정 변경 전 Red, 변경 뒤 Green이다.
  - `pickerOptions.audit-fix.test.tsx` 단독 실행이 통과한다.
  - 하드 게이트 다섯 종 exit 0, `npm run test` 실패 0.
  - 작업 브랜치가 push되고 PR이 열려 있으며, 병합 승인 요청이 앱 대화에 올라와 있다.

## Phase 1 — vitest 훅 타임아웃 · 태그: `source` · 의존: 없음

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [>] 1. goal 문서 준비 — 합의 기록, 작업 브랜치 생성, `planPath` 전환, pin 갱신
- [ ] 2. 실패하는 테스트 먼저 쓰기 — `smoke.test.ts`에 `hookTimeout: 30000` 고정 테스트를 더하고 단독 실행 Red 확인. 변경 전 `pickerOptions.audit-fix.test.tsx` 단독 실행 결과도 남긴다
- [ ] 3. 훅 타임아웃 30초로 올리기 — `vitest.config.ts`에 `hookTimeout: 30000`과 사유 주석, 두 파일 단독 실행 Green
- [ ] 4. 전체 검증 — diff 실사, 하드 게이트 다섯 종, `npm run test`
- [ ] 5. PR 올리고 병합 승인 요청 — 커밋, `-u origin` push, `gh pr create`, 앱 대화에 결과 보고

실행 단계 일괄 승인 대상

- `git switch -c fix/m06-g7-hook-timeout`, `npx vitest run <파일>` 단독 실행, 하드 게이트 다섯 종, `npm run test`, 커밋, `git push -u origin fix/m06-g7-hook-timeout`, `master` 기준 `gh pr create`. 병합(`gh pr merge`)은 들어 있지 않다.

DoD

- 앱 소스 변경 0. 코드 변경은 `vitest.config.ts`의 두 줄(설정과 주석)과 `smoke.test.ts`의 테스트 한 건뿐이다.
- 검증 기록의 PASS 줄은 `npm run test` 전체 Green 뒤에만 적는다 — 태그가 `source`라 TDD 가드가 Green 증거를 요구한다.
- 마크다운 문서 250줄 이하.

검증 기록

- (기록 없음)

## 결정 대장

- [USER] G6 실주행에서 앱 안으로 돌릴 goal을 Backlog 14로 정하고 G7로 쓴다 — 「goal은 01_Milestones/M06_SelfDev/99_Backlog.md 14번(pickerOptions.audit-fix.test.tsx beforeAll이 10초 hook 타임아웃을 넘는 문제 — vitest hookTimeout을 testTimeout처럼 올리기)으로 하고, G7로 goal 한 장을 써서 나와 합의해 줘」 (2026-11-17)
- [AI] 검증 강도를 약으로, 방식을 전역 기본값으로 둔다 — 바뀌는 것은 테스트 설정 한 줄과 그 고정 테스트뿐이고 판정 장치는 `planPath`만 건드린다. 전역 값은 같은 콜드 import를 겪는 다른 파일의 훅도 덮는 대신, 정말 멈춘 훅이 10초가 아니라 30초 뒤에 실패한다 (2026-11-17)
- [AI] 작업 브랜치는 이 작업 트리의 머리에서 가르고, 승인 요청은 앱 대화로만 한다 — G6 무대가 세션 작업 트리를 G6 브랜치 머리에 두었다. 현황판 결정 보드의 답은 메인 터미널로 들어가서 앱 밖 개입이 된다 (2026-11-17)
- [USER] G7 goal 한 장을 합의한다 — 검증 강도 약, 전역 `hookTimeout` 30초, 작업 브랜치 기점, 앱 대화 승인 경로, 실행 단계 일괄 승인 목록을 적은 문서 그대로. 앱 대화 답 「합의」 (2026-11-17)

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
