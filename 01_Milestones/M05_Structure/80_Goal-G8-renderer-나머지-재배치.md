# M05 G8 — renderer 재배치 2 (나머지 도메인)

- 마일스톤: M05 구조 감사와 도메인별 재편 (로드맵 2번) · 작성: 2026-11-14 · 상태: 종결 (PR 46 병합) · 검증 강도: 강
- 작업 브랜치: `chore/m05-g8-renderer-rest` (PR 45 병합 뒤 master `906b27e`에서 시작)
- 출발점: `12_G1-재편-계획.md`의 G8 절, `13_G1-이동-맵.md`의 renderer 표, G7 문서의 「G8로 넘기는 파일」 5개.

## 목표

renderer에 남은 파일을 `renderer/src/00_App`, `06_Sessions`, `07_Workspace`, `08_Git`, `10_Engine`, `11_Settings`, `12_Window`로 옮겨 `lib/`, `hooks/`, `layout/`, `features/`, `store/`, `theme/`를 비운다. 화면은 한 픽셀도 바뀌지 않아야 한다.

## 범위

- **만들 것**
  - 이동 맵 renderer 표의 위 일곱 도메인 행이 가리키는 파일을 내용 무변경 `git mv`로 옮긴다. 파일 목록은 2단계 재실측이 규칙으로 뽑아 아래 「이동 목록」 절에 붙인 것만이다.
  - 맵 마지막 행(`store/slices/*` 나머지)은 소비 도메인 규칙으로 정한다 — 소비 도메인이 하나면 그 도메인, 둘 이상이면 `00_App/state/`. G7이 넘긴 5파일도 같은 규칙으로 정한다.
  - `*SampleData.ts`는 G7과 같은 기준으로 「실제 타입·상수의 거처」인지 「진짜 견본」인지 판정해 목록에 적는다. 이름 변경은 거처로 판정된 것만 한다.
  - 옮긴 파일을 가리키는 import·`vi.mock` 류·동적 `import()`·CSS import·문자열 경로·e2e 하네스의 CSS 목록을 고친다. 배럴 주석의 심볼 개수와 capsule smoke 단언을 새 위치에 맞춘다.
- **건드릴 곳**: 위 행의 renderer 소스, 이를 가리키는 소스·테스트·e2e의 경로 줄, 배럴 `index.ts` 주석, capsule smoke 테스트의 경로.
- **하지 않을 것**: 단일·멀티 통합과 Sidebar 세션 목록 분리(G9), `prefs.ts`의 IPC 클라이언트화(G10), CSS 규칙 변경, 로직 변경, 파일 쪼개기, 진짜 견본의 테스트 fixture 이동(Backlog), 진입 파일(`main.tsx`, `App.tsx`, `env.d.ts`) 이동, 판정 장치 변경.
- **완료조건**
  - 이동 목록의 위치가 `git ls-files`와 같다. `renderer/src/` 아래에 도메인 폴더와 진입 파일만 남는다.
  - 이동 커밋은 rename만 담는다(전부 `R100`). import 수정은 별도 커밋이다.
  - 화면 무변경: ① `npm run build`가 만든 renderer CSS의 sha256이 이동 전과 같다(기준선은 2단계 실측). ② e2e 스크린샷 하네스 다섯 개가 39건 모두 통과하고, PNG 92장 digest가 이동 전 실측(2단계, 결정적 하네스)과 같다.
  - 이동이 피할 수 있는 도메인 순환을 새로 만들지 않는다 — 이동 뒤 값 import 상호 쌍이 2단계 예측 목록(검증 기록)을 넘지 않는다. (2단계 개정: 처음 적은 「순환 0」은 G1 계획의 G8 절에 없던 조건이고 로직 변경 없이는 이룰 수 없다 — 결정 대장)
  - 배럴 주석 심볼 개수와 capsule smoke 단언이 새 위치와 맞는다.
  - 하드 게이트 다섯 종 exit 0, `npm test` 실패 0, `collection-baseline` 개수 불변(414).

## 이동 목록 (2단계 재실측, `renderer/src/` 기준, 89건, 전부 내용 무변경)

| 현재 | 새 위치 |
|---|---|
| `AppGate.{tsx, css}`, `store/appStore.ts` (3) | `00_App/` 같은 이름 |
| `store/slices/{ids, selector, system, types}.ts` (4, 소비 도메인 규칙) | `00_App/state/` 같은 이름 |
| `lib/time.ts` (1) | `03_Agent/time.ts` |
| `lib/f14SampleData.ts` (1) | `03_Agent/prompt/types.ts` (이름 변경) |
| `lib/multiAgentSampleData.ts` (1) | `03_Agent/multiAgentDefaults.ts` (이름 변경, 맵 G8 개정) |
| `lib/resetText.ts` (1) | `05_Conversation/resetText.ts` |
| `store/slices/{sessions, conversation, conversationPayload, multiSession}.ts` (4) | `06_Sessions/state/` 같은 이름 |
| `hooks/useMultiPersist.ts` (1) | `06_Sessions/hooks/useMultiPersist.ts` |
| `features/viewer/*` 11개 | `07_Workspace/` 같은 이름 |
| `features/file/*` 10개 | `07_Workspace/file/` 같은 이름 |
| `layout/DiffViewerPane.tsx`, `lib/{fileType, editorFont, viewer}.ts`, `theme/darcula.ts` (5) | `07_Workspace/` 같은 이름 |
| `store/slices/{viewer, workspace}.ts` (2) | `07_Workspace/state/` 같은 이름 |
| `features/git/{GitModal.css, GitModal.tsx, index.ts}` (3) | `08_Git/` 같은 이름 |
| `features/notice/{AppUpdateGate, EngineGate, UpdateNotes}`의 tsx·css, `EngineUpdateNotice.tsx`, `index.ts` (8) | `10_Engine/` 같은 이름 |
| `features/whats-new/*` 5개 | `10_Engine/whats-new/` 같은 이름 |
| `lib/{engineUpdateTrigger, updateNotesSampleData}.ts` (2) | `10_Engine/` 같은 이름 |
| `features/shell/{SettingsModal, Profile}`의 tsx·css (4), `lib/{settingsSampleData, avatarColor, prefs}.ts` (3) | `11_Settings/` 같은 이름 |
| `features/shell/{TitleBar, ResizeHandles, PaneSplitter, ZoomControl, MultiWorkspace, Sidebar}`의 tsx·css (12), `features/shell/index.ts` (1) | `12_Window/` 같은 이름 |
| `layout/{Shell.tsx, shell.css}`, `lib/{useWindowState, useGlobalZoom, useGlobalShortcuts, paneResize, sidebarSampleData}.ts` (7) | `12_Window/` 같은 이름 |

합계 89건이다 — `00_App` 7, `03_Agent` 3, `05_Conversation` 1, `06_Sessions` 5, `07_Workspace` 28, `08_Git` 3, `10_Engine` 15, `11_Settings` 7, `12_Window` 20. 하위 폴더 `07_Workspace/file/`·`10_Engine/whats-new/`는 배럴 `index.ts`와 `viewer.ts`의 이름 충돌을 피한다. 이 배치로 파일 이름 충돌과 파일-폴더 겹침은 0건이다. 이동 뒤 `renderer/src/`에는 도메인 폴더 10개와 진입 파일 셋만 남는다.

## Phase 1 — renderer 재배치 2 · 태그: `move`·`ui` · 의존: G7

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. G7 종결 기록, 이 goal 문서, 포인터 전환, pin 갱신
- [x] 2. 재실측 — 이동 맵 규칙으로 파일 목록 뽑기, 소비 도메인 판정, `*SampleData` 판정, 경로 줄 전수, 이동 전 CSS sha256과 PNG 92장 digest 기준선
- [x] 3. 이동 목록을 이 문서에 붙인다
- [x] 4. 이동 커밋(`git mv` 목록만) → import 수정 커밋 → CSS·스크린샷·순환 대조
- [x] 5. 강 등급 검증 — 구현 문맥 없는 검수자, 하드 게이트 다섯 종, `npm test`
- [x] 6. 커밋, 작업 브랜치 push, PR 생성, 병합 승인 요청

실행 단계 일괄 승인 대상 (로드맵 합의로 승인됐다)

- 하드 게이트 다섯 종, `npm test`, 개별 vitest 실행, e2e 스크린샷 하네스 실행(2번 모니터)
- 이동 목록의 `git mv`(이동 맵 승인, 헌법 8조 예외)
- `worker`(구현)·`reviewer`(검수) 하위 에이전트 기동
- 커밋, 작업 브랜치 push, `gh pr create`, 병합 승인 다이얼로그(`gh pr merge`)

DoD

- 이동 커밋에 내용 변경이 없고, import 수정 커밋에 경로·배럴 주석·smoke 경로 밖 변경이 없다. 검수자가 diff로 대조한다.
- 다른 도메인 폴더와 테스트에서 가리키는 줄은 `@renderer/…`, shared는 `@shared/…` 별칭으로 쓴다. 같은 도메인 폴더 안의 줄은 상대 경로로 둔다. 깨지지 않은 기존 상대 경로 줄은 고치지 않는다(G4·G6·G7 선례). 별칭이 없는 tsconfig에 걸린 줄만 상대 경로 예외로 둔다.
- `vi.mock` 류 경로를 고친 테스트는 실행해서 mock이 걸렸는지 확인한다.
- 프로덕션 동작 변경 0, 마크다운 문서 250줄 이하.

검증 기록

- PASS 2026-11-14T11:09:23+09:00 — 1단계 출발점. G7(PR 45)이 사용자 병합 승인으로 master `906b27e`에 들어가 종결됐다. G7 마지막 검증 줄은 11:05:35 PASS(재판정 독립 검수, 차단 0)다. 세션 df394581.
- PASS 2026-11-14T11:26:55+09:00 — 2·3단계 재실측(워커, 읽기 전용, 저장소 쓰기 0). 이동 목록 89건을 위 절에 붙였다.
  - 기준선(이동 전 `97a4471`): `npm run build` exit 0, `index-hrqabsIr.css` sha256 `941086b8…120258`. 다섯 하네스 세 번 모두 39 passed, 92장 digest `b1591384…3bd64cb8`(세 번 동일, 92장 새로 쓰임, 2번 모니터).
  - 경로 줄: 이동 뒤 깨지는 줄 약 781줄(소스 136·단위 테스트 626·e2e 19). `vi.mock` 12줄(11파일)은 고친 뒤 개별 실행한다. 고치면 안 되는 표시 문자열은 `03_Agent/types.ts:29` 견본 본문 하나이고, Backlog 34의 e2e 6줄은 G8 파일을 가리키지 않는다. `tsconfig.node.json` 범위의 테스트 중 G8 파일을 가리키는 것은 0이다.
  - 순환 예측(값 import 상호 쌍, 이동 뒤): `03⇄05` 11/23(G7에서 굳음), 스토어 허브 `00_App⇄03·05·06·07`, `00⇄12` 2/3, `03⇄06` 1/8, `03⇄12` 5/7, `05⇄07` 4/2, `07⇄11` 1/1, `11⇄12` 1/4. 지금 코드도 도메인 SCC가 하나다. 이동으로 피할 수 있는 새 쌍(`02_Common⇄03_Agent`)은 `multiAgentSampleData`를 `03_Agent`에 두어 막았다.
  - CSS 순서는 import 문과 배럴 export 순서가 정하고 경로 글자와는 무관하다. 그래서 배럴을 우회하거나 쪼개지 않고 경로 토큰만 고친다. 하네스 CSS 목록도 순서를 유지한다.
  - 세션 df394581.
- PASS 2026-11-14T11:56:37+09:00 — 4단계 이동·경로 수정·화면 판정(워커 보고를 메인 세션이 diff로 대조, 커밋 `0a12781`·`d2782dd`).
  - 이동: 89파일 모두 `similarity index 100%`, insert·delete 0. 이름 변경은 `f14SampleData`·`multiAgentSampleData` 둘이다. `renderer/src/` 최상위는 도메인 폴더 10개와 진입 파일 셋이다.
  - 경로 수정: 210파일, 782/782줄. 02_Project 밖 변경 0. 경로 토큰이 없는 변경 줄은 `12_Window/index.ts` 배럴 주석 한 줄뿐이다(Shell.tsx가 같은 폴더가 됨). 같은 도메인 줄은 상대 경로이고, `FileModal`의 `'../viewer'` 3줄은 새 `viewer.ts`로 잘못 풀리지 않게 `'..'`(배럴)로 고쳤다. import·export 순서 변경 0.
  - 화면: 빌드 CSS `index-hrqabsIr.css` sha256 `941086b8…120258` 동일. 다섯 하네스 세 번 모두 39 passed, 92장 digest `b1591384…3bd64cb8` 세 번 동일(92장 새로 쓰임, 2번 모니터).
  - 순환: 이동 뒤 값 import 상호 쌍 11개가 2단계 예측과 쌍·개수 모두 같고 새 쌍 0이다. 진입점부터 CSS 52개(G7과 같음).
  - 게이트: 하드 게이트 다섯 종 단독 exit 0, `npm test` 408 통과·6 skip·수집 414·실패 0. `vi.mock`을 고친 11파일 단독 통과, 별칭 mock 탐침 3/3.
  - 헌법 8조: 워커 보고상 저장소 쓰기는 `git mv`(89)와 Edit 도구뿐이고, 셸 쓰기는 빈 옛 폴더 `rmdir`뿐이다. 세션 df394581.
- PASS 2026-11-14T12:09:03+09:00 — 5단계 강 등급 검증. 구현 문맥 없는 검수자(fable)가 `906b27e..HEAD`를 보고 차단 0·중요 1·경미 2로 통과를 냈다.
  - 검수자 독립 확인: 이동 R100 89건이 목록과 정확히 일치한다. 이동 전 트리를 따로 풀어 지정자 4,169개를 rename 맵 아래 대조했고, 불일치·재정렬·배럴 표면 변경은 0이다. 같은 도메인 상대 32, 다른 도메인 별칭 93, shared 별칭 11, DoD 위반 0이다. 빌드 CSS sha256 동일, 하네스 1회 39 passed, 92장 digest 동일(새로 쓰임), PNG 4장 육안 정상이다. typecheck 둘·lint exit 0, `npm test` 실패 0·수집 414, `vi.mock` 4파일 단독 통과(mock이 걸려야 통과하는 단언 포함). 값 상호 쌍 11개가 예측과 같다. 맵 개정 커밋이 이동 커밋의 조상이다. 판정 장치 변경은 계획된 포인터 한 줄뿐이다.
  - 완료조건 정정 판정: 검수자는 이를 정당한 정정으로 봤다. G1 계획 G8 절(`12_G1-재편-계획.md:72-74`)에 순환 조건이 없고, 「순환 0」은 사용자가 본 적 없는 1단계 커밋에서 AI가 덧붙였기 때문이다. 이동 전에 별도 커밋으로 정정했고, 이동 전 master에도 같은 SCC가 있었다.
  - 중요 1을 받아 공개한다. 완료조건 표제 「이동이 피할 수 있는 순환을 새로 만들지 않는다」는 결정 ④와 어긋난다 — `useGlobalZoom`을 맵대로 `12_Window`에 두어, 피할 수 있었던 `11_Settings⇄12_Window` 쌍 1/4를 알고 남겼다. 조건은 조작적 정의(예측 목록을 넘지 않음)로 통과한다. 이 사실과 정정 경위, `multiAgentSampleData`의 규칙 이탈을 PR 본문에 적어 병합 승인이 겸하게 한다. Backlog 42에 두 줄을 더했다.
  - 경미 1(`10_Engine` 배럴이 `03_Agent` 컴포넌트 셋을 재수출, `05→10` 간선 4개 전부)은 Backlog 42에 넣었다. 경미 2(upstream이 `origin/master`)는 push를 `-u origin <브랜치>`로 해 피한다. 검수자는 `test:hooks`를 돌리지 않았고, 하드 게이트 다섯 종은 4단계 줄의 실행이 근거다. 세션 df394581.

## 결정 대장

- [USER] 이 로드맵의 goal들은 헌법 11조의 예외로 합의 문답 없이 이어서 진행한다. 사용자가 「이번 순서만 예외로 이어서 처리」로 답했다 (로드맵 문답, 2026-11-13)
- [USER] 이 goal의 범위 초안은 G1 재편 계획의 G8 절이고, 이동 목록은 G1 이동 맵의 renderer 표다. 사용자가 PR 37 병합으로 둘을 승인했다 (2026-11-13)
- [USER] G7을 병합했다. G7 판정 ②의 기준선 교체(옛 하네스 실측 → 결정적 하네스의 이동 전 실측)는 PR 45 본문에 공개됐고, 사용자가 병합 다이얼로그를 승인했다 (2026-11-14, 11:08 직전)
- [AI] 화면 판정은 G7 재판정의 방식을 처음부터 쓴다 — 빌드 CSS sha256 동일과 결정적 하네스 92장 digest 동일. 기준선은 이 브랜치의 이동 전 코드(`906b27e`)에서 다시 잰다. G7의 「안정 45장」·「표본 육안」 조건은 H2 뒤로 뜻이 없어 두지 않는다 (성향 4·18, 2026-11-14)
- [AI] 2단계 판단 넷. ① 1단계에 적은 완료조건 「순환 0」을 「이동이 피할 수 있는 순환을 새로 만들지 않는다」로 고친다. 승인된 G1 계획의 G8 절에는 순환 조건이 없고, 내가 G5에서 옮겨 적은 것이다. 남은 순환(03⇄05, 스토어 허브)은 로직 변경이 필요해 범위 밖이므로 Backlog로 넘기고 PR 본문에 공개한다. ② 맵에 없던 파일 다섯과 배럴 둘은 맵을 먼저 개정해 정한다 — `multiAgentSampleData`만 소비 도메인 규칙(`02_Common`)을 벗어나 `03_Agent`로 가고, 이유는 새 순환을 막는 것이다. ③ `*SampleData` 이름 변경은 G7이 후보로 적은 둘(`f14`, `multiAgent`)만 한다. `settings`·`updateNotes`·`whatsNew`는 실제 콘텐츠의 거처지만 맵이 이름째로 적었고, 이름을 바꾸면 배럴 줄이 늘어서 Backlog로 넘긴다. `sidebarSampleData`는 견본이 섞여 있어 G9로 넘긴다. ④ `useGlobalZoom`을 `11_Settings`로 보내면 `11⇄12` 쌍이 없어지지만, 맵이 `12_Window`를 이름으로 적었고 SCC는 그대로라 맵대로 둔다 (성향 37, 2026-11-14)
