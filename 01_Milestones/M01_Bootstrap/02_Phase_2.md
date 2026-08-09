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

- (기록 없음)
