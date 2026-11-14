# M05 G7 — renderer 재배치 1 (`02_Common`, `03_Agent`, `05_Conversation`)

- 마일스톤: M05 구조 감사와 도메인별 재편 (로드맵 2번) · 작성: 2026-11-14 · 상태: 실행 중 · 검증 강도: 강
- 작업 브랜치: `chore/m05-g7-renderer-core` (PR 40~43 병합 뒤 master `36ce790`에서 시작)
- 출발점: `12_G1-재편-계획.md`의 G7 절과 `13_G1-이동-맵.md`의 renderer 표.

## 목표

renderer의 공용 부품·에이전트·대화 몫을 `renderer/src/02_Common`, `03_Agent`, `05_Conversation`으로 옮긴다. 화면은 한 픽셀도 바뀌지 않아야 한다.

## 범위

- **만들 것**
  - 이동 맵 renderer 표의 `02_Common`·`03_Agent`·`05_Conversation` 행이 가리키는 파일을 내용 무변경 `git mv`로 옮긴다. 파일 목록은 2단계 재실측이 규칙으로 뽑아 아래 「이동 목록」 절에 붙인 것만이다.
  - `agentSampleData.ts`처럼 이름이 정해진 `*SampleData.ts`는 이동 맵대로 이름을 바꾼다(`agentSampleData` → `03_Agent/types.ts`). 이 범위의 다른 `*SampleData.ts`는 재실측이 「실제 타입·상수의 거처」인지 「진짜 견본」인지 판정해 목록에 적는다.
  - 옮긴 파일을 가리키는 import·`vi.mock` 류·동적 `import()`·CSS import·문자열 경로를 고친다. 배럴 주석의 심볼 개수와 capsule smoke 단언을 새 위치에 맞춘다.
- **건드릴 곳**: 위 행의 renderer 소스, 이를 가리키는 소스·테스트·e2e의 경로 줄, 배럴 `index.ts` 주석, capsule smoke 테스트의 경로.
- **하지 않을 것**: 단일·멀티 통합(G9), CSS 규칙 변경, 로직 변경, 파일 쪼개기, 이동 맵 규칙으로 정해지지 않는 파일(소비 도메인 판정이 필요한 `store/slices/*` 나머지 등 — G8), 다른 도메인 행(G8), 진짜 견본의 테스트 fixture 이동(내용과 소비처가 바뀌는 일이라 Backlog), 판정 장치 변경.
- **완료조건**
  - 이동 목록의 위치가 `git ls-files`와 같다.
  - 이동 커밋은 rename만 담는다(전부 `R100`, 이름을 바꾸는 파일도 내용 무변경). import 수정은 별도 커밋이다.
  - 화면 무변경: ① `npm run build`가 만든 renderer CSS가 이동 전과 같다 — 이름 `index-hrqabsIr.css`, sha256 `941086b8…120258`(기준선, 2단계). ② e2e 스크린샷 하네스 다섯 개가 39건 모두 통과하고, 이동 전 세 번 실행에서 해시가 같았던 안정 45장의 해시가 기준선과 같다. ③ 해시가 매번 바뀌는 47장 가운데 4장 이상을 이동 전 회차와 눈으로 비교한다.
  - 배럴 주석 심볼 개수와 capsule smoke 단언이 새 위치와 맞는다.
  - 하드 게이트 다섯 종 exit 0, `npm test` 실패 0, `collection-baseline` 개수 불변(414).

## 이동 목록 (2단계 재실측이 이동 맵 규칙으로 뽑음, `renderer/src/` 기준, 142건)

| 현재 | 새 위치 |
|---|---|
| `components/common/{FullscreenOverlay.css, FullscreenOverlay.tsx, Modal.css, Modal.tsx, ProviderBrandIcon.tsx, icons.tsx}` (6) | `02_Common/` 같은 이름 |
| `theme/tokens.css` (1) | `02_Common/tokens.css` |
| `assets/brand/*` 7개(`SOURCE.md`, svg 3, png 3) | `02_Common/brand/` 같은 이름 |
| `lib/{theme, providerBrand, scrollHelpers}.ts`, `lib/resizableModal.tsx` (4) | `02_Common/` 같은 이름 |
| `features/agent/*` 18개(css·tsx·`index.ts`) | `03_Agent/` 같은 이름 |
| `features/prompt/*` 7개(`AskModal`·`PromptModal`·`QuestionModal`의 css·tsx, `index.ts`) | `03_Agent/prompt/` 같은 이름 |
| `features/notice/{PermissionCard, LoopStatusBanner, HookTimeline}`의 `.tsx`·`.css` (6) | `03_Agent/` 같은 이름 |
| `store/{staleWatchdog, loopDisplayRegistry, ultracodeToggle, panelSession}.ts`, `store/slices/{runtime, loopDisplay}.ts` (6) | `03_Agent/state/` 같은 이름 |
| `lib/{subagentChat, splitView, modelLabel, toolKind, loopStatus, stopAction, orchestrationDeniedCopy, orchestrationKeyword, cmdCards, pickerOptions, gaugeCalc}.ts` (11) | `03_Agent/` 같은 이름 |
| `lib/agentSampleData.ts` (1) | `03_Agent/types.ts` (이름 변경, 내용 무변경) |
| `features/conversation/` 루트 32개 + `index.ts` | `05_Conversation/` 같은 이름 |
| `features/conversation/hooks/*` 6개 | `05_Conversation/hooks/` 같은 이름 |
| `hooks/useInputPalettes.ts` (1) | `05_Conversation/hooks/useInputPalettes.ts` |
| `store/reducer.ts`, `store/{threadTypes, hookBadge, thinkingElapsed}.ts`, `store/slices/composer.ts` (5) | `05_Conversation/state/` 같은 이름 |
| `store/reducer/*` 10개 | `05_Conversation/state/reducer/` 같은 이름 |
| `features/shell/panel/{PanelComposer, PanelPicker, PanelView}.tsx` (3) | `05_Conversation/` 같은 이름 |
| `lib/{turnBlocks, mentions, composerHeight, composerHighlight, composerNotes, contextChips, softLinebreak, smoothReveal, statusLineFormat, workingPhrases, readLanguage, slashTokenHighlight, imageAttach, images, replIndicator, replModeDefault}.ts`, `lib/zoom.tsx` (17) | `05_Conversation/` 같은 이름 |

합계 142건이다 — `02_Common` 18, `03_Agent` 49, `05_Conversation` 75. 파일 이름 충돌은 0건이다(대소문자 무시, `.ts`/`.tsx` 짝 포함). 맵에 있으나 없는 `SubAgentModal.tsx`·`composerSampleData.ts`는 G3에서 지웠다.

맵 어느 행에도 없어 G8로 넘기는 파일: `features/notice/index.ts`(배럴은 제자리, 03_Agent를 가리키는 6줄만 경로 수정), `lib/f14SampleData.ts`(→ `03_Agent/prompt/types.ts` 후보), `lib/multiAgentSampleData.ts`(→ `02_Common/multiAgentDefaults.ts` 후보), `lib/time.ts`(소비 03_Agent), `lib/resetText.ts`(소비 05_Conversation).

## Phase 1 — renderer 재배치 1 · 태그: `move`·`ui` · 의존: G2(별칭), G6

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. G6 종결 기록, 이 goal 문서, 포인터 전환, pin 갱신
- [x] 2. 재실측 — 이동 맵 규칙으로 파일 목록 뽑기, `*SampleData` 판정, 경로 줄 전수, 이동 전 CSS 파일 이름과 스크린샷 해시 기준선
- [x] 3. 이동 목록을 이 문서에 붙인다
- [>] 4. 이동 커밋(`git mv` 목록만) → import 수정 커밋 → CSS 이름·스크린샷 대조
- [ ] 5. 강 등급 검증 — 구현 문맥 없는 검수자, 하드 게이트 다섯 종, `npm test`
- [ ] 6. 커밋, 작업 브랜치 push, PR 생성, 병합 승인 요청

실행 단계 일괄 승인 대상 (로드맵 합의로 승인됐다)

- 하드 게이트 다섯 종, `npm test`, 개별 vitest 실행, e2e 스크린샷 하네스 실행
- 이동 목록의 `git mv`(이동 맵 승인, 헌법 8조 예외)
- `worker`(구현)·`reviewer`(검수) 하위 에이전트 기동
- 커밋, 작업 브랜치 push, `gh pr create`, 병합 승인 다이얼로그(`gh pr merge`)

DoD

- 이동 커밋에 내용 변경이 없고, import 수정 커밋에 경로·배럴 주석·smoke 경로 밖 변경이 없다. 검수자가 diff로 대조한다.
- 다른 도메인 폴더와 테스트에서 가리키는 줄은 `@renderer/…`, shared는 `@shared/…` 별칭으로 쓴다. 같은 도메인 폴더 안의 줄은 상대 경로로 둔다. 별칭이 없는 tsconfig에 걸린 줄만 상대 경로 예외로 둔다.
- `vi.mock` 류 경로를 고친 테스트는 실행해서 mock이 걸렸는지 확인한다.
- 프로덕션 동작 변경 0, 마크다운 문서 250줄 이하.

검증 기록

- PASS 2026-11-14T09:03:09+09:00 — 2단계 재실측(워커, 읽기 전용, 커밋 없음).
  - 이동 목록 142건을 맵 규칙으로 뽑았고 출발 중복·이름 충돌 0이다. 구조 안건 다섯과 맵 밖 5파일은 결정 대장대로 정했다.
  - 경로 줄: 합계 1,076줄·299파일(소스 355줄/101파일, 단위 테스트 645줄/193파일, e2e 76줄/5파일). 정적 import 소스 287·테스트 269, `export … from` 36, `vi.mock` 2, 동적 `import()` 350, CSS import 32, e2e 템플릿 70, `readFileSync` 류 21이다. 옮긴 파일 안에서 깨지는 상대 경로는 57줄이다. 배럴 심볼 개수를 글자로 단언하는 테스트는 없고, 개수는 배럴 주석과 capsule smoke 4개의 주석·제목에만 있다.
  - 화면 기준선: `npm run build` 단독 exit 0, `index-hrqabsIr.css` sha256 `941086b8ed49b004384b03f82d5aad0a6a2cb77141b2277899bf63baed120258`. e2e 하네스 다섯을 세 번 돌려 매번 39 passed, PNG 92장 가운데 안정 45장·비결정 47장이다(해시 목록은 scratchpad `run1.json`·`run2diff.json`과 워커 보고).
  - 세션 df394581.

## 결정 대장

- [USER] 이 로드맵의 goal들은 헌법 11조의 예외로 합의 문답 없이 이어서 진행한다. 사용자가 「이번 순서만 예외로 이어서 처리」로 답했다 (로드맵 문답, 2026-11-13)
- [USER] 이 goal의 범위 초안은 G1 재편 계획의 G7 절이고, 이동 목록은 G1 이동 맵의 renderer 표다. 사용자가 PR 37 병합으로 둘을 승인했다 (2026-11-13)
- [USER] 쌓인 PR 40~43을 지금 병합하고 G7은 병합된 master에서 시작한다. 사용자가 「병합」으로 답했고 병합 다이얼로그 넷을 승인했다 (2026-11-14, 08:48 직전)
- [AI] 화면 무변경 판정 — 계획의 「화면 실행으로 확인」을 결정론적 비교로 바꾼다. 재실측에서 스크린샷 92장 가운데 47장은 같은 코드에서도 해시가 매번 바뀌었고(스피너·커서·타이밍), 하네스는 CSS를 고정 목록 순서로 주입해 빌드의 CSS 순서 변화를 못 잡았다. 그래서 CSS 순서는 빌드 CSS sha256 동일로 판정하고, 스크린샷은 안정 45장 해시 동일과 표본 육안 대조의 체크포인트로 둔다. 화면에 글자로 찍히는 e2e 경로 문자열 6줄(`gap1-p14` 57·63, `gap1-visual` 66, `tg1-p07` 460~462)은 표시 데이터라 고치지 않는다 — 고치면 기준선이 깨진다 (성향 4·18, 2026-11-14)
- [AI] 범위를 좁히는 판단 — 진짜 견본 `*SampleData`의 테스트 fixture 이동은 하지 않고(내용·소비처가 바뀌어 원칙 4와 어긋남, Backlog), 재실측이 올린 구조 안건 다섯은 고칠 줄이 적은 쪽으로 정한다. ① `features/notice/index.ts`는 제자리에 두고 03_Agent로 가는 세 파일을 가리키는 6줄만 고친다(배럴 표면·smoke 불변). ② `03_Agent/index.ts`와 `03_Agent/prompt/index.ts` 두 배럴을 그대로 둔다. ③ `hooks/useInputPalettes.ts`는 원래 하위 폴더 이름을 살려 `05_Conversation/hooks/`에 둔다. ④ `store/reducer/*`는 `state/reducer/`로 하위 구조를 유지한다. ⑤ `assets/brand/*`는 맵 글자대로 `02_Common/brand/`다. 맵에 없는 5파일은 G8로 넘긴다 (성향 37, 2026-11-14)