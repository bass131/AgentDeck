# M01 Phase 2 — 표준 레이아웃 물리 완성

## Phase 2 — 표준 레이아웃 물리 완성 · 태그: `layout` · 의존: Phase 1

**목표**: 저장소의 폴더 배치가 표준 레이아웃과 1:1로 일치한다. `02_Source`는 `02_Project/00_Source`가 되고, `99_Others/tests`는 `02_Project/01_TestCode`가 되며, 그 이동에 딸린 설정과 코드의 경로가 모두 새 자리를 가리킨다.

Steps

1. 이동 전에 기준선을 채취한다. `npm test`와 `npm run test:e2e`를 돌려 실패 수와 스킵 수를 기록해 둔다. 이 숫자가 이동 후 비교의 기준이다.
2. `git mv`로 두 건을 옮긴다. 파일 시스템 복사가 아니라 `git mv`를 쓰는 이유는 이력 추적을 끊지 않기 위해서다.
3. 아래 결합점 목록을 전수 수정한다. 하나라도 놓치면 빌드나 테스트 수집이 조용히 비어 버린다.
4. 옛 경로 토큰이 저장소 전역에 남아 있지 않은지 grep으로 확인한다.
5. 이동 후 전량 검증을 돌려 기준선과 대조한다.

결합점 완전 목록 (Codex 2턴 실측 반영)

- `vitest.config.ts` — include 경로와 globalSetup 경로.
- `package.json` — 스크립트 안의 경로.
- `tsconfig.node.json`과 `tsconfig.web.json` — include 목록과 `paths` 별칭(`@shared`, `@renderer`).
- `electron.vite.config.ts` — entry 경로, `renderer.root`, vite alias.
- `playwright.config.ts` — `testDir: './99_Others/tests/e2e'`. 실제 경로 소유자는 러너 스크립트가 아니라 이 파일이다.
- 테스트 코드 내부의 옛 경로 토큰 424파일 2,008줄 — 상대 import, 수집 glob(collection-baseline), mock과 fs 경로를 스크립트로 일괄 치환한다.
- `.claude/hooks/dangerous-cmd-guard.test.mjs` 35행의 옛 소스 경로.
- `.claude/agents/reviewer.md`의 렌즈 경로, `.agents/skills` 두 종, `99_Others/loop-design-handoff.md`의 경로 언급.
- eslint 설정에 경로가 있으면 그것도 포함한다.

DoD

- 이동 후 `npm run typecheck:node`, `npm run typecheck:web`, `npm run lint`, `npm run build`가 모두 성공한다.
- 이동 후 `npm test`의 실패 수와 스킵 수가 이동 전 기준선과 같다. 하나라도 늘면 회귀이므로 불통과다.
- 이동 후 `npm run test:e2e`가 기준선과 동일하게 green이다.
- 옛 경로 토큰(`02_Source`, `99_Others/tests`)의 전역 grep 결과가 0건이다. 다만 이 계획 문서와 ADR 안의 이력 서술은 예외로 센다.

검증 기록

- PASS 2026-08-09T19:20:15+09:00 — 이동 전 기준선을 채취했습니다. `npm run typecheck`와 `npm run lint`와 `npm run build`는 exit 0이고, `npm test`는 1 실패·5462 통과·12 스킵(테스트 파일 416개 중 1 실패·409 통과·6 스킵)이며 그 1건은 `multi-session-persist-2.test.tsx`의 5초 타임아웃입니다. `npm run test:e2e`는 2 실패·62 통과·111 스킵이고, 실패는 `multi-agent-ops.e2e.ts`와 `orig-probe.e2e.ts`입니다.
- PASS 2026-08-09T19:31:02+09:00 — `git mv` 두 건으로 `02_Source`를 `02_Project/00_Source`로, `99_Others/tests`를 `02_Project/01_TestCode`로 옮겼고 git이 818건을 rename으로 인식했습니다. 결합점은 설정 일곱 개(`vitest.config.ts`, `package.json`, `tsconfig.node.json`, `tsconfig.web.json`, `electron.vite.config.ts`, `playwright.config.ts`, `.eslintrc.cjs`)와 문서·훅 네 개(`.claude/hooks/dangerous-cmd-guard.test.mjs`, `.claude/agents/reviewer.md`, `99_Others/loop-design-handoff.md`, `README.md`)를 고쳤고, 테스트 트리 안의 옛 경로 토큰은 424파일 2,008줄을 일괄 치환해 잔존 0건을 확인했습니다.
- PASS 2026-08-09T19:31:02+09:00 — 이동 후 `npm run typecheck`와 `npm run lint`와 `npm run build`가 모두 exit 0이고, `npm test`는 0 실패·5463 통과·12 스킵으로 기준선에 있던 타임아웃 1건까지 사라졌습니다. `npm run test:hooks`도 exit 0입니다.
- FAIL 2026-08-09T19:31:02+09:00 — 같은 시점의 `npm run test:e2e`가 5 실패·59 통과·111 스킵으로 기준선보다 3건 늘었습니다. 늘어난 3건은 전부 `m7-explorer-lazy.e2e.ts`이고, 원인은 탐색기 UI에서 폴더 노드를 제목으로 찾는 TC-3이 새 경로에서 부모 `02_Project`를 펼치지 않아 실패하고 그 뒤 TC-4와 TC-5가 연쇄로 무너진 것입니다. 토큰 치환만으로는 잡히지 않는 결합점이라 판단해 TC-3에 부모 노드 펼침과 원상 복구 단계를 넣었고, 그 스펙만 단독으로 돌려 5건 전부 통과를 확인했습니다.
- PASS 2026-08-09T19:39:54+09:00 — 수리 후 `npm run test:e2e` 전량 재실행이 2 실패·62 통과·111 스킵으로 기준선과 수치도 스펙도 일치했습니다. 남은 실패 2건은 이동 전부터 있던 `multi-agent-ops.e2e.ts`와 `orig-probe.e2e.ts`입니다.
- PASS 2026-08-09T19:40:46+09:00 — 옛 경로 토큰 전역 grep은 이 문서 세 줄과 `_MilestonePreview.md` 한 줄만 남았고, 둘 다 DoD가 예외로 둔 계획 문서의 이력 서술입니다. 결합점 목록 밖에서 찾은 것은 `m7-explorer-lazy.e2e.ts` 한 건이며, `.agents/skills` 두 종은 Phase 1에서 이미 새 좌표를 쓰고 있어 고칠 것이 없었습니다.
- PASS 2026-08-10T21:22:00+09:00 — 정정 줄 (M02 Phase 4 Step 5, 검수 발견 14번 · 워커 세션 56fabb25-7bfc-4606-b2ac-7698adbbaf20): 위 DoD 셋째 줄의 「`npm run test:e2e`가 기준선과 동일하게 green이다」는 문면과 실제 판정식이 다릅니다. 기준선 자체가 green이 아니라 실패 2건(`multi-agent-ops.e2e.ts`·`orig-probe.e2e.ts`)이었고, 19:39:54 줄이 실제로 적용한 판정은 green 여부가 아니라 「기준선과의 차분 0」이었습니다. 문면을 읽는 정본 해석은 「이동 후 `npm run test:e2e`의 실패·통과·스킵 수가 이동 전 기준선과 같다」이며, 이 Phase의 통과 판정은 그 해석 아래 성립합니다. 원 DoD 줄은 append-only 규율에 따라 지우지 않고 이 줄로 정정합니다.
