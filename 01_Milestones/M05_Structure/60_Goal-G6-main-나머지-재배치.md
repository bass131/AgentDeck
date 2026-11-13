# M05 G6 — main 재배치 2 (나머지 도메인)

- 마일스톤: M05 구조 감사와 도메인별 재편 (로드맵 2번) · 작성: 2026-11-14 · 상태: 실행 중 · 검증 강도: 강
- 작업 브랜치: `chore/m05-g6-main-rest` (G5 브랜치 위에 쌓는다)
- 출발점: `12_G1-재편-계획.md`의 G6 절과 `13_G1-이동-맵.md`의 main 표(G5 개정본).

## 목표

main에 남은 옛 폴더(`00_ipc`, `02_fs`, `03_lsp`, `04_persistence`, `05_settings`, `06_window`, `08_personalization`)를 도메인 폴더로 옮겨, main 아래 옛 폴더 이름이 하나도 남지 않게 한다. G5 개정에 따라 남은 핸들러 9개는 `01_Ipc/handlers/`로 간다.

## 범위

- **만들 것**
  - 아래 이동 목록 30건을 내용 무변경 `git mv`로 옮긴다(경로는 `02_Project/00_Source/main/` 기준). 파일 이름은 바꾸지 않는다.
  - 옮긴 파일을 가리키는 import·`export … from`·`vi.mock` 류·동적 `import()`·문자열 경로를 고친다.
- **건드릴 곳**: 위 옛 폴더 일곱, 이를 가리키는 소스·테스트·e2e·`.claude/agents/` 문서의 경로 줄.
- **하지 않을 것**: 로직 변경, 파일 쪼개기(아래 결정 대장), 중복 통합(G11), 함수·심볼 이름 변경, renderer·preload 이동, 판정 장치 변경.
- **완료조건**
  - `git ls-files 02_Project/00_Source/main`에 옛 폴더 이름(`00_ipc`, `02_fs`, `03_lsp`, `04_persistence`, `05_settings`, `06_window`, `08_personalization`)이 0건이고, 30파일의 위치가 이동 목록과 같다.
  - 이동 커밋은 rename만 담는다(전부 `R100`). import 수정은 별도 커밋이다.
  - 이동 뒤 main 도메인 그래프를 도구로 뽑아 기록한다. G5가 끊은 다섯 도메인 사이의 순환 0은 유지돼야 한다. 그 밖의 도메인에 새 순환이 생기면 이유와 함께 기록하고 Backlog로 넘긴다.
  - 하드 게이트 다섯 종 exit 0, `npm test` 실패 0, `collection-baseline` 개수 불변(414).

## 이동 목록 (개정 이동 맵 main 표에서 뽑음)

| 현재 | 새 위치 |
|---|---|
| `00_ipc/handlers/{conversation, fs, git, lsp, multi, personalization, reference, settings, workspace}.ts` | `01_Ipc/handlers/` 같은 이름 (9) |
| `02_fs/{attachments, listFiles, read, roots, skipDirs, workspace}.ts` | `07_Workspace/` 같은 이름 (6) |
| `02_fs/{diff, git}.ts` | `08_Git/` 같은 이름 (2) |
| `03_lsp/{jsonrpc, manager}.ts` | `09_Lsp/` 같은 이름 (2) |
| `04_persistence/{multiStore, store}.ts` | `06_Sessions/` 같은 이름 (2) |
| `05_settings/{commands, mcp, mergeSlashCommands, skills}.ts` | `11_Settings/` 같은 이름 (4) |
| `08_personalization/{prefs, profile}.ts` | `11_Settings/` 같은 이름 (2) |
| `06_window/{controls, geometry, zoom}.ts` | `12_Window/` 같은 이름 (3) |

합계 30건이다. `02_Common`은 G11의 중복 통합이 채우므로 이번엔 만들지 않는다.

## Phase 1 — main 나머지 재배치 · 태그: `move` · 의존: G5

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. G5 종결 기록, 이 goal 문서, 포인터 전환, pin 갱신
- [>] 2. 재실측 — 30파일을 가리키는 경로 줄 전수(종류별), 이동 전 도메인 그래프
- [ ] 3. 이동 커밋(`git mv` 30건만) → import 수정 커밋 → 이동 후 도메인 그래프
- [ ] 4. 강 등급 검증 — 구현 문맥 없는 검수자, 하드 게이트 다섯 종, `npm test`
- [ ] 5. 커밋, 작업 브랜치 push, PR 생성

실행 단계 일괄 승인 대상 (로드맵 합의로 승인됐다)

- 하드 게이트 다섯 종, `npm test`, 개별 vitest 실행, 경로를 고친 e2e 하네스의 실행
- 위 이동 목록 30건의 `git mv`(개정 이동 맵 승인, 헌법 8조 예외)
- `worker`(구현)·`reviewer`(검수) 하위 에이전트 기동
- 커밋, 작업 브랜치 push, `gh pr create`

DoD

- 이동 커밋에 내용 변경이 없고, import 수정 커밋에 경로 밖 변경이 없다. 검수자가 diff로 대조한다.
- 다른 도메인 폴더를 가리키는 줄과 테스트의 줄은 `@main/…`, shared를 가리키는 고친 줄은 `@shared/…` 별칭으로 쓴다. 같은 도메인 폴더 안의 줄은 상대 경로로 둔다(G5와 같은 규칙).
- `vi.mock` 류 경로를 고친 테스트는 실행해서 mock이 걸렸는지 확인한다.
- 프로덕션 동작 변경 0, 마크다운 문서 250줄 이하.

검증 기록

## 결정 대장

- [USER] 이 로드맵의 goal들은 헌법 11조의 예외로 합의 문답 없이 이어서 진행한다. 사용자가 「이번 순서만 예외로 이어서 처리」로 답했다 (로드맵 문답, 2026-11-13)
- [USER] 이 goal의 범위 초안은 G1 재편 계획의 G6 절이고, 이동 목록은 G1 이동 맵의 main 표다. 사용자가 PR 37 병합으로 둘을 승인했다 (2026-11-13)
- [USER] 핸들러는 `01_Ipc/handlers/`, 백엔드 조립은 `00_App`이 맡고 G6도 이를 따른다. 사용자가 G5 순환 처리 문답에 「2」로 답했다 (2026-11-14T07:51)
- [USER] Night Shift 방식(PR까지만, 앞 goal 브랜치 위에 쌓기, 판단은 Second Brain 성향)을 이어 간다 (2026-11-14, 로드맵 「goal 사이의 진행 방식」 절)
- [AI] 이동 맵 「예외」 열의 파일 쪼개기 둘 — `06_window/controls.ts`의 채널 등록을 `01_Ipc/handlers/window.ts`로, `handlers/multi.ts`의 병합 로직을 `06_Sessions`로 — 은 이번에 하지 않는다. 쪼개기는 파일 내용을 바꾸는 일이라, 이동 goal은 `git mv`와 import 수정 커밋만 담는다는 재편 원칙 4와 어긋난다. 두 파일은 통째로 각각 `12_Window/`·`01_Ipc/handlers/`로 옮기고, 쪼개기는 Backlog로 넘긴다 (성향 37, 2026-11-14)
- [AI] `02_fs/diff.ts ⇄ git.ts` 파일 순환은 둘을 `08_Git`에 함께 두어 도메인 순환이 아니게만 한다. 파일 순환을 끊는 것은 로직 변경이라 Backlog 29번에 둔다 (성향 37, 2026-11-14)
