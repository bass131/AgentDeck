---
description: 커밋 전 검증 게이트를 순서대로 돌린다 (타입체크 → 린트 → 훅 → 빌드 → 테스트)
---

이 커맨드가 남은 이유: **어느 게이트가 하드 게이트이고 어느 게이트가 판단용인지**가 이
프로젝트에서 자명하지 않다. 특히 `npm test`는 통과가 목표가 아니다(아래 참고). 그 사실을
매번 다시 알아내는 대신 여기 적어 둔다.

## 하드 게이트 — 하나라도 실패하면 커밋하지 않는다

```
npm run typecheck:node
npm run typecheck:web
npm run lint
npm run test:hooks
npm run build
```

`typecheck`가 둘로 갈린 이유는 electron-vite가 main(node)과 renderer(web)에 별 tsconfig를
쓰기 때문이다. 한쪽만 돌리면 반대쪽 회귀를 놓친다.

## 테스트 — 통과가 아니라 **차분**으로 읽는다

```
npm test
```

이 스위트는 깨끗한 트리에서도 실패한다. 기준선 커밋 `1807398`을 별 워크트리에 떼어 재보니
**14파일 / 112테스트**가 실패하고, 전부 `99_Others/tests/renderer/*.tsx`다 — App 트리가
jsdom에서 아예 안 올라와서 `.win`·`.login-body`가 null인 부류다(전체 실행이든 단독 실행이든
같은 수로 깨진다 → 자원 경합이 아니라 실제 결함).

기준선 14파일:
`boot-gate` `engine-gate-p3` `lr3-p07-multipanel-continuity` `lr4-p06-ultracode-toggle-persist`
`m3-persist-multiworkspace` `multiagent-f13` `multi-concurrent` `multi-isolation-guard`
`multi-session-persist-2` `p15-panel-cwd` `panel-image-attach` `panel-input-palettes`
`shell-test-open` `subagent-singlechat-wiring`

판정 기준:

- **실패 파일이 위 14개 안에 있으면** → 원래 깨져 있던 것. 회귀 아님.
- **`agents/`·`main/`·`shared/`에서 하나라도 실패하면** → 회귀다. 그 파일부터 본다.
- 새 renderer 실패가 나오면 그 파일만 단독 실행해 본다. 단독에서 통과하면 자원 경합
  (`reference-folder`가 이 부류 — 8초쯤 걸려 전체 실행에서만 타임아웃), 단독에서도 깨지면
  실 회귀다.
- 반대 방향 잡음도 있다: `phase18-audit-fix`는 **단독에서만** 깨진다(첫 `MultiWorkspace`
  마운트가 5초 기본 타임아웃을 넘긴다). 전체 스위트에선 통과하므로 위 14개에 없다.

숫자를 갱신할 때는 **워크트리를 따로 떼서**(`git worktree add --detach <dir> <커밋>` +
node_modules 정션) 기준선에서 재라. 작업 트리를 stash하면 되돌리기가 위험하고, 스위트가
도는 중에 대상 파일을 편집하면 그 측정은 무효다 — 모듈 로드 시점이 갈려서 실패 수가 부풀어
오른다(실측: 16파일이 68파일로 보였다).

## 안 하는 것

`git push`·`gh pr create`·`gh pr merge`는 이 커맨드가 하지 않는다.
`.claude/hooks/dangerous-cmd-guard.mjs`가 사람 승인 다이얼로그로 잡는다.
