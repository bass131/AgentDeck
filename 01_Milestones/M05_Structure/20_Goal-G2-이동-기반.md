# M05 G2 — 이동 기반 · 경로 별칭, 타입 검사 사각지대, 프로세스 경계 규칙

- 마일스톤: M05 구조 감사와 도메인별 재편 (로드맵 2번) · 작성: 2026-11-13 · 상태: 종결 — PR 39 병합(`52123f0`) · 검증 강도: 강
- 작업 브랜치: `chore/m05-g2-impl` — 문서 커밋(`9910a31`)은 H1 PR 38로 이미 `master`에 들어갔다. 옛 브랜치 `chore/m05-g2-move-base`는 쓰지 않는다(삭제는 사용자 몫).
- 출발점: `12_G1-재편-계획.md`의 G2 절. 로드맵은 `01_Milestones/00_Roadmap.md`다.

## 목표

G4 이후의 파일 이동이 상대 경로 지옥 없이 별칭으로 import를 고칠 수 있고, 옮긴 테스트가 타입 검사에서 빠지지 않고, 프로세스 경계를 넘는 import가 lint에서 걸리는 상태를 만든다.

## 범위

- **만들 것**
  - 경로 별칭 넷: `@main` → `main/`, `@preload` → `preload/`, `@renderer` → `renderer/src/`, `@shared` → `shared/`(모두 `02_Project/00_Source/` 아래).
  - 별칭은 그 프로세스가 쓸 수 있는 것만 선언하고, 선언한 곳끼리 값이 같다. tsconfig.node는 `@main`·`@preload`·`@shared`, tsconfig.web은 `@renderer`·`@shared`다. electron-vite는 main에 `@main`·`@shared`, preload에 `@preload`·`@shared`, renderer에 `@renderer`·`@shared`다. vitest는 테스트가 세 트리를 다 다루므로 넷 다 둔다.
  - 타입 검사 사각지대 해소: `e2e`·`integration` 테스트는 tsconfig.web에(DOM과 renderer 전역 선언이 필요하다), `hooks`·`_lib` 테스트는 tsconfig.node에 넣는다. 사각지대의 기존 타입 오류를 고친다.
  - 프로세스 경계 lint: renderer → main·preload, shared → main·preload·renderer, main → renderer·preload, preload → renderer import를 막는다. 상대 경로와 별칭 꼴을 둘 다 잡는다.
  - 별칭 실사용 한 건: main의 `shared` import 하나를 `@shared/…`로 바꿔 main 번들의 별칭 해석을 증명한다.
- **건드릴 곳**: `tsconfig.node.json`, `tsconfig.web.json`, `electron.vite.config.ts`, `vitest.config.ts`, `.eslintrc.cjs`, 사각지대 테스트 파일의 타입 오류, main 소스의 import 한 줄. 판정 장치(헌법 3조 목록)는 건드리지 않는다.
- **하지 않을 것**: 파일 이동, import 경로의 일괄 교체, vitest include 글롭 문자열 변경(collection-baseline이 고정한다), `package.json` 스크립트 변경, 새 tsconfig 파일, 새 의존성 설치, 테스트의 검사 내용 변경(타입 표기만 고친다).
- **완료조건**
  - `@shared` 별칭 import가 `npm run build`(main 번들), `npm run dev`(main·preload 빌드와 Electron 기동 로그), vitest에서 모두 풀린다.
  - 금지 방향 import 네 꼴을 `eslint --stdin --stdin-filename <경로>`로 넣으면 lint가 실패하고, 허용 방향은 통과한다. 파일을 만들지 않고 확인한다.
  - `e2e`·`integration`·`hooks`·`_lib` 테스트 57개 파일이 `typecheck:node` 또는 `typecheck:web`의 대상 목록에 있다(`tsc --listFilesOnly`).
  - 하드 게이트 다섯 종 exit 0, `npm test` 실패 0, 수집 파일 수가 기준선과 같다.

착수 실측(2026-11-13T22:34, 임시 설정으로 측정): 사각지대 테스트를 node 설정으로 검사하면 오류 192건이고 그중 146건이 DOM 타입 부재다. DOM을 넣으면 renderer 전역 선언(`env.d.ts`) 부재로 renderer 소스 쪽 약 60건, 테스트 고유 오류 약 12건이 남는다. 그래서 e2e·integration은 web 설정에 넣는다.

## Phase 1 — 이동 기반 · 태그: `build`·`lint`·`typecheck` · 의존: 없음

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. M04·G1 종결 기록, 이 goal 문서, 포인터 전환, M05 pin 갱신
- [x] 2. 경계 위반 실측 — 지금 소스에 금지 방향 import가 몇 건인지 센다. 0건이 아니면 범위 질문으로 멈춘다
- [x] 3. 별칭 넷을 다섯 설정에 넣고 main import 한 줄을 별칭으로 바꾼다
- [x] 4. 사각지대 테스트를 두 tsconfig에 넣고 타입 오류를 고친다
- [x] 5. eslint 경계 규칙을 넣고 stdin 꼴로 금지·허용 방향을 확인한다
- [x] 6. 강 등급 검증 — 구현 문맥 없는 검수자, `npm run dev` 실제 기동, 하드 게이트 다섯 종, `npm test` 차분
- [x] 7. 커밋, 작업 브랜치 push, PR 생성, 결과 보고, 병합 승인

실행 단계 일괄 승인 대상 (로드맵 합의로 승인됐다)

- `npm run typecheck:node`·`typecheck:web`·`lint`·`test:hooks`·`build`, `npm test`, `npx tsc --listFilesOnly`, `npx eslint --stdin`
- `npm run dev`의 짧은 기동과 종료(확인 뒤 프로세스를 끈다)
- `worker`(구현)·`reviewer`(검수) 하위 에이전트 기동
- 커밋, 작업 브랜치 push(H1부터 창 없음), `gh pr create`, 병합 승인 다이얼로그(`gh pr merge`)

DoD

- 별칭 넷의 값이 선언된 모든 설정에서 글자 그대로 같고, 각 프로세스는 쓸 수 없는 별칭을 선언하지 않는다.
- 완료조건 네 항목이 검증 기록 줄에 명령과 결과로 남아 있다.
- 테스트 파일의 diff는 타입 표기·주석·import 형태뿐이고 단언과 실행 흐름이 바뀌지 않았다. 검수자가 이를 대조한다.
- vitest include 문자열, `package.json`, 판정 장치의 diff가 0이다.
- 마크다운 문서는 250줄 이하다.

검증 기록

- PASS 2026-11-13T22:36:00+09:00 — 2단계 경계 위반 실측: `02_Project/00_Source`에서 renderer→main·preload, shared→main·preload·renderer, main→renderer·preload, preload→renderer 방향의 상대 경로 정적 import와 `import()` 타입 import를 grep으로 셌고 전부 0건이다. 별칭 import는 소스 전체에 0건이다. 세션 df394581, 기준 `origin/master` `fdb6c63`.
- FAIL 2026-11-14T02:25:46+09:00 — 위 2단계 PASS의 실측이 틀렸다. 경계 규칙을 넣자 `renderer/src/env.d.ts:3`의 `import type { Api } from '../../preload'`(renderer→preload)가 lint에 걸렸다. grep 꼴이 경로 뒤 슬래시를 요구해 슬래시 없이 끝나는 상대 경로를 놓쳤다. 시도한 것: 상대 경로 정적 import와 `import()` 타입 import의 grep. 처리: 이 import는 `window.api` 전역 타입의 다리라 지울 수 없어서, `env.d.ts` 한 파일만 preload 방향을 허용하고 main 방향은 계속 막는다(결정 대장 [AI]). 슬래시 없는 꼴과 `.d.ts`를 넣어 다시 센다. 세션 df394581.
- PASS 2026-11-14T02:32:02+09:00 — 3~5단계 구현(워커 보고 대조).
  - 별칭: 다섯 설정에 넣었다. `main/06_window/zoom.ts:1`을 `@shared/ipcContract`로 바꿨다. `out/`의 별칭 문자열은 0건이다.
  - 사각지대: 57개가 대상에 들어갔다(node 3, web 54, 겹침 0). 테스트 타입 오류 2건은 표기만 고쳤다.
  - eslint: stdin으로 금지 방향 17꼴은 exit 1, 허용 방향과 오탐 점검 꼴은 exit 0을 확인했다. 슬래시 없는 꼴·`.d.ts`를 넣은 재측정에서 위반은 예외로 둔 `env.d.ts` 1건뿐이다.
  - 게이트: 하드 게이트 다섯 종 exit 0, `npm test` 411파일 통과·수집 417·실패 0.
  - dev 기동: `npm run dev`가 main(80 모듈)과 preload를 별칭 오류 없이 빌드했고 「starting electron app...」까지 갔다. 기동 뒤 dev 앱 프로세스를 PID로 종료했다.
  - 세션 df394581.
- PASS 2026-11-14T02:49:06+09:00 — 6단계 강 등급 검증. 독립 검수(fable)가 PASS(차단 0, 중요 2, 경미 6)를 냈다.
  - 검수자 실측 항목: 별칭은 `resolveConfig`와 vitest 리졸버, preload 메모리 빌드, tsc로 확인했다. 그 밖에 `--listFilesOnly` 57개, stdin 약 90꼴, 하지 않을 것 diff 0을 확인했다.
  - 고친 것은 중요 1이다. 소스 루트를 경유하는 상대 경로(`../../../../00_Source/main/x`)가 경계를 빠져나가서 `.eslintrc.cjs`에 `**/00_Source/<트리>` 꼴을 더했다.
  - 고친 뒤의 확인은 `printf "import x from '<경로>'…" | npx eslint --stdin --stdin-filename <대상>`로 했다. renderer 대상의 `00_Source/main`·`00_Source/preload` 3꼴과 main 대상의 `00_Source/renderer` 1꼴은 exit 1이었다. shared 방향, `./sub/main/x`, `00_Source/main` 자기 트리, `../04_Claude/pump`는 exit 0이었다.
  - 예외 주석의 태그를 `[USER]`로 고쳤다.
  - 중요 2(e2e esbuild 하네스가 별칭을 못 푼다)와 경미 항목은 Backlog 14~17에 올렸다.
  - 고친 뒤 하드 게이트 다섯 종 exit 0, `npx vitest run --reporter=dot --no-color --silent` 411파일 통과·수집 417·실패 0(02:46, 68초).
  - 세션 df394581.
- PASS 2026-11-14T02:51:34+09:00 — 7단계: 커밋 `ff32e3f`, push는 승인 창 없이 지나갔다. PR 39를 만들었고 병합 승인 다이얼로그를 거쳐 병합됐다(`52123f0`, MERGED). 사용자의 병합 승인이 마감 판정이다. 이 줄과 종결 표시는 G3의 첫 커밋에 담는다. 세션 df394581.

## 결정 대장

- [USER] 이 로드맵의 goal들은 헌법 11조의 예외로 합의 문답 없이 이어서 진행한다. 사용자가 「이번 순서만 예외로 이어서 처리」로 답했다 (로드맵 문답, 2026-11-13)
- [USER] 이 goal의 범위 초안은 G1 재편 계획의 G2 절이고, 사용자가 PR 37 병합으로 승인했다 (2026-11-13)
- [USER] 별칭은 재편 계획의 「네 개를 같은 값으로」를 좁혀, 프로세스마다 쓸 수 있는 것만 선언한다. 경계를 설정에서도 한 번 더 막기 위해서다. 값은 선언된 곳끼리 같다. 처음엔 `[AI]`였고 사용자가 G2 판단 문답에서 「넷 다 승인」으로 답했다 (2026-11-13)
- [USER] e2e·integration 테스트는 tsconfig.web에 넣는다. 둘 다 DOM 코드와 renderer store를 다루고, 새 tsconfig와 스크립트 변경 없이 기존 하드 게이트 둘로 덮을 수 있어서다. 처음엔 `[AI]`였고 같은 문답에서 승인됐다 (2026-11-13)
- [USER] lint 확인은 `eslint --stdin`으로 한다. 확인용 파일을 만들고 지우는 과정이 헌법 8조의 셸 쓰기에 걸리지 않게 하기 위해서다. 처음엔 `[AI]`였고 같은 문답에서 승인됐다 (2026-11-13)
- [USER] eslint 경계 규칙은 내장 `no-restricted-imports`로 쓴다. 설치된 플러그인이 `eslint-plugin-react-hooks`뿐이라 새 의존성 없이 할 수 있는 길이 이것이다. 처음엔 `[AI]`였고 같은 문답에서 승인됐다 (2026-11-13)
- [USER] 경계 규칙의 예외는 `renderer/src/env.d.ts` 한 파일의 preload 방향 하나다. `window.api` 전역 타입을 preload의 `Api` 타입에서 받는 다리라서다. 타입 전용 import 허용(`@typescript-eslint/no-restricted-imports`의 `allowTypeImports`)은 다른 renderer 파일까지 열고 내장 규칙 결정과 어긋나서 버렸다. 처음엔 `[AI]`였고 사용자가 워커 질의의 두 선택지 중 「1」로 답했다 (2026-11-14)
- [USER] push 하네스 goal(`15_Goal-H1-push-서버-보호.md`)을 G2보다 먼저 병합한다. G2는 그동안 구현만 하고 PR은 하네스 goal 병합 뒤에 만든다. 사용자가 「지금 G2보다 먼저」로 답했다 (끼울 시점 문답, 2026-11-13)
