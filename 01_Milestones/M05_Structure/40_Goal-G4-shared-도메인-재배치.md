# M05 G4 — shared 도메인 재배치

- 마일스톤: M05 구조 감사와 도메인별 재편 (로드맵 2번) · 작성: 2026-11-14 · 상태: 종결 (PR 41 병합) · 검증 강도: 강
- 작업 브랜치: `chore/m05-g4-shared-domain` (Night Shift — G3 브랜치 위에 쌓는다)
- 출발점: `12_G1-재편-계획.md`의 G4 절과 `13_G1-이동-맵.md`의 shared 표, Backlog 14번.

## 목표

`shared/`를 세 트리 공통 도메인 폴더로 나눠, 이후 main·renderer 재배치(G5~G8)가 같은 도메인 이름을 쓰게 한다. 루트에는 묶음 export 둘(`ipcContract.ts`, `agentEvents.ts`)만 남고, 나머지 22파일이 이동 맵의 도메인 폴더에 있다.

## 범위

- **만들 것**
  - 아래 이동 목록 22건을 내용 무변경 `git mv`로 옮긴다(경로는 `02_Project/00_Source/shared/` 기준). 파일 이름은 바꾸지 않는다(재편 원칙 6).
  - 옮긴 파일을 가리키는 import·`vi.mock`·`import()` 경로를 고친다. 묶음 export 두 파일의 재수출 경로도 고친다.
  - Backlog 14번: e2e 하네스 다섯 개의 esbuild 호출에 `tsconfig: 'tsconfig.web.json'`을 준다. 별칭 import가 e2e 번들에서도 풀리게 하기 위해서다.
- **건드릴 곳**: `shared/`, 옮긴 파일을 import하는 소스·테스트의 경로 줄, e2e 하네스 다섯 개의 esbuild 옵션, `.eslintrc.cjs`·tsconfig의 shared 경로 글롭(바뀌어야 할 때만).
- **하지 않을 것**: 채널 재분류와 타입·값 변경, 이동 맵 「예외」 열의 값 이동(G10), 파일 이름 변경, main·renderer 파일 이동, 판정 장치 변경.
- **완료조건**
  - `shared/` 루트에는 `ipcContract.ts`와 `agentEvents.ts`만 파일로 남고, 22파일의 위치가 아래 이동 목록과 같다. `git ls-files`로 확인한다.
  - 이동 커밋은 rename만 담는다(`git show --stat -M`에서 내용 변경 0). import 수정은 별도 커밋이다.
  - e2e 하네스 다섯 개의 번들이 별칭을 푼다. 실행해서 확인한다.
  - 하드 게이트 다섯 종 exit 0, `npm test` 실패 0, `collection-baseline` 개수 불변(414).

## 이동 목록 (이동 맵 shared 표에서 뽑음)

| 현재 | 새 위치 |
|---|---|
| `ipc/common.ts`, `diffTypes.ts` | `02_Common/common.ts`, `02_Common/diffTypes.ts` |
| `ipc/agent.ts` | `03_Agent/agent.ts` |
| `agentEvents/{core, interaction, orchestration, repl, sdkLifecycle, subagent}.ts` | `03_Agent/events/` 같은 이름 |
| `knownModels.ts`, `modelEffort.ts` | `03_Agent/models/` 같은 이름 |
| `ipc/conversation.ts`, `ipc/multi.ts` | `06_Sessions/` 같은 이름 |
| `ipc/workspace.ts`, `ipc/fs.ts`, `ipc/reference.ts` | `07_Workspace/` 같은 이름 |
| `ipc/git.ts` | `08_Git/git.ts` |
| `ipc/lsp.ts` | `09_Lsp/lsp.ts` |
| `ipc/engine.ts` | `10_Engine/engine.ts` |
| `ipc/settings.ts`, `ipc/personalization.ts` | `11_Settings/` 같은 이름 |
| `ipc/window.ts` | `12_Window/window.ts` |

`shared/ipc/`와 `shared/agentEvents/` 폴더는 비어서 사라진다. 합계 22파일이다.

## Phase 1 — shared 재배치 · 태그: `move`·`build` · 의존: G2(별칭), G3

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. G3 종결 기록, 이 goal 문서, 포인터 전환, pin 갱신
- [x] 2. 재실측 — 옮길 22파일을 가리키는 경로 줄 전수(정적 import, `vi.mock`, 동적 `import()`, 문자열 경로)를 세고, e2e 하네스 다섯 개를 특정한다
- [x] 3. 이동 커밋(`git mv` 22건만) → import 수정 커밋 → e2e 하네스 커밋
- [x] 4. 강 등급 검증 — 구현 문맥 없는 검수자, 하드 게이트 다섯 종, `npm test`, e2e 하네스 실행
- [x] 5. 커밋, 작업 브랜치 push, PR 생성 (Night Shift — 병합은 사용자가 깬 뒤)

실행 단계 일괄 승인 대상 (로드맵 합의로 승인됐다)

- 하드 게이트 다섯 종, `npm test`, 개별 vitest 실행, e2e 하네스 다섯 개의 실행
- 위 이동 목록 22건의 `git mv`(이동 맵 승인, 헌법 8조 예외)
- `worker`(구현)·`reviewer`(검수) 하위 에이전트 기동
- 커밋, 작업 브랜치 push, `gh pr create`

DoD

- 이동 커밋에 내용 변경이 없고, import 수정 커밋에 경로 밖 변경이 없다. 검수자가 diff로 대조한다.
- shared 밖에서 고친 경로 줄은 `@shared/…` 별칭으로 쓴다. 그 파일을 검사하는 tsconfig에 별칭이 없어 타입 검사가 깨지는 곳(Backlog 17번의 교차 테스트 류)만 상대 경로로 둔다. shared 내부 줄은 상대 경로를 유지한다.
- `vi.mock` 경로를 고친 테스트는 실행해서 mock이 걸렸는지 확인한다(타입 검사가 못 본다).
- 프로덕션 동작 변경 0, 마크다운 문서 250줄 이하.

검증 기록

- PASS 2026-11-14T04:05:07+09:00 — 2·3단계(워커 보고 대조, 커밋 `e8b6193`·`51b2929`·`534de46`).
  - 재실측: 22파일을 가리키는 경로 줄은 shared 밖 21줄(정적 import 19, `export … from` 2), shared 안 51줄(깨진 48, 같은 폴더로 함께 옮겨져 유효한 3)이다. `vi.mock`·동적 `import()`·e2e 문자열 경로는 0건이다. 설정 글롭은 `shared/**` 전체를 잡아 바꿀 곳이 없다.
  - 이동 커밋은 22건 전부 `R100`이고 insertions·deletions 0이다. import 커밋은 24파일 69/69줄로 경로 줄만 바꿨다. shared 밖 21줄은 `@shared/…` 별칭이고, shared 안 48줄은 상대 경로다(결정 대장 별칭 줄 참조).
  - e2e 하네스 다섯 개에 `tsconfig: 'tsconfig.web.json'`을 넣었다. 대조 실험에서 tsconfig 없이는 `Could not resolve "@shared/03_Agent/models/knownModels"`, 주면 번들 성공이다. Playwright 직접 실행(하네스 환경변수 다섯 켬)이 39 passed(23.3초)다.
  - 게이트: 하드 게이트 다섯 종 exit 0, `npm test -- --reporter=dot --no-color --silent` 408파일 통과·6 skip·수집 414·실패 0(66초).
  - TDD 가드가 소스 편집 3회째를 막았을 때, 깨진 경로 상태라 Green을 만들 수 없어 4단계 몫인 e2e 하네스 편집을 앞당겨 번갈아 했다. 커밋은 경로 지정으로 나눴다.
  - e2e 실행이 저장소 안 `01_Phases/`에 미추적 PNG 92장을 남겼다. 커밋하지 않았고 Backlog 27번에 적었다.
  - 세션 df394581.
- PASS 2026-11-14T04:10:52+09:00 — 4단계 강 등급 검증. 구현 문맥 없는 검수자(fable)가 `b43ea8a..HEAD`를 보고 차단 0·중요 0·경미 0으로 통과를 냈다.
  - 이동 22건 `R100`과 이동 맵 대조 일치, import 커밋은 지정자 문자열만 다름(기계 대조 잔여 0), 옛 경로는 소스·테스트·설정·훅에 0건이다.
  - 묶음 export 두 파일은 이동 전 내용에 경로 치환만 적용한 것과 완전 일치해 재수출 표면이 같다. 판정 장치 변경은 0이다.
  - 검수자가 직접 돌린 것: typecheck 둘·lint exit 0, `npm test` 실패 0·수집 414, 메모리 번들로 e2e 하네스 tsconfig 대조. build·test:hooks·Playwright는 위 PASS 줄의 워커 실행에 기댄다.
  - 세션 df394581.
- PASS 2026-11-14T04:12:22+09:00 — 5단계. 커밋 `b1a3cc2`까지 `chore/m05-g4-shared-domain`으로 push했고 PR 41(base `master`)을 열었다. PR 40 다음에 병합한다. Night Shift라서 병합하지 않았고, 이 줄은 G5 브랜치의 첫 커밋에 실린다. 세션 df394581.

## 결정 대장

- [USER] 이 로드맵의 goal들은 헌법 11조의 예외로 합의 문답 없이 이어서 진행한다. 사용자가 「이번 순서만 예외로 이어서 처리」로 답했다 (로드맵 문답, 2026-11-13)
- [USER] 이 goal의 범위 초안은 G1 재편 계획의 G4 절이고, 이동 목록은 G1 이동 맵의 shared 표다. 사용자가 PR 37 병합으로 둘을 승인했다 (2026-11-13)
- [USER] Night Shift: 병합하지 않고 PR까지만 만든다. 이 브랜치는 G3 브랜치 위에 쌓는다. 판단은 Second Brain 성향을 따른다 (2026-11-14, 로드맵 「goal 사이의 진행 방식」 절)
- [AI] `ipc/*.ts`는 도메인 폴더 바로 아래에 같은 이름으로 둔다. 이동 맵이 하위 폴더를 정한 것은 `agentEvents/`(`events/`)와 모델 두 파일(`models/`)뿐이고, 파일 이름은 바꾸지 않는다는 재편 원칙 6을 따른다. 맵에 없는 하위 폴더를 만들지 않는 좁은 쪽이다 (성향 37, 2026-11-14)
- [AI] shared 밖에서 고친 경로 줄은 `@shared/…` 별칭으로 쓴다. G2가 이 이동을 위해 별칭을 깔았고, 다음 이동 때 경로 깊이가 바뀌어도 줄이 깨지지 않는다. shared 내부 줄은 상대 경로로 둔다 — shared는 별칭 설정이 없는 도구(e2e esbuild 등)도 읽는 계약이라 내부가 별칭에 기대면 계약이 깨지고, 기존 내부 줄도 전부 상대 경로였다(워커 판단을 3단계 뒤 채택) (성향 13, 2026-11-14)
- [AI] Backlog 14번(e2e 하네스 별칭)을 이 goal에 넣는다. 별칭으로 바꾼 renderer 쪽 줄이 e2e 번들을 깨뜨리므로 완료조건을 막는 범위 안 결함이다(헌법 11조) (2026-11-14)
