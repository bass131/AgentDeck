---
name: codegraph-init
description: CodeGraph 인덱스 최초 구축·전체 재구축·잠금(lock) 복구. 사용자가 "codegraph 초기화/인덱스 만들어/인덱스 깨진 것 같아"라고 하거나, .codegraph/ 가 없는 상태에서 구조 질의가 필요할 때, 또는 sync 실패가 반복될 때 사용. 갱신은 codegraph-update, 질의는 codegraph-search가 짝.
---

> **CodeGraph** = tree-sitter로 코드를 파싱해 심볼·호출·import 그래프를 로컬 SQLite(`.codegraph/codegraph.db`)에 박아두는 코드 인텔리전스 도구 (colbymchenry/codegraph, MIT). 채택 근거·실측 = `00_Documents/02_Reports/03_Next/NEXT-CodeGraph-파일럿-스카우트-노트.md`.
>
> ⚠️ **인스톨러 서브커맨드(`install`/`uninstall`) 절대 사용 금지** — 에이전트 설정(.claude/settings.json·CLAUDE.md)을 외부에서 자동 수정한다(하네스 봉인의 관할 밖 쓰기). MCP 등록·권한은 영호가 유지보수 창에서 수동으로만. permissions deny로도 차단되어 있다.
> ⚠️ 텔레메트리는 항상 오프 — 아래 모든 명령의 env 프리픽스가 그 스위치다(끄면 연결 자체를 안 연다, TELEMETRY.md 확인 2026-07-28).

### 1. 현재 상태 확인

```bash
ls .codegraph/codegraph.db
```

- **없음** → 2로 (최초 구축).
- **있음 + 재구축 요청** → 2로 (`init`은 전체 재빌드와 동일).
- **있음 + "잠겨서 안 된다"류 에러** → 잠금 복구만:
  ```bash
  CODEGRAPH_TELEMETRY=0 DO_NOT_TRACK=1 npx -y @colbymchenry/codegraph@latest unlock
  ```
  후 codegraph-update(sync)로 복귀.

### 2. 인덱스 구축

```bash
CODEGRAPH_TELEMETRY=0 DO_NOT_TRACK=1 npx -y @colbymchenry/codegraph@latest init
```

- 경로 인자 생략 = 현재 저장소 루트. 워처·데몬은 시작되지 않는다(우리 정책 = 명시 갱신만, 상주 프로세스 0).
- 실측 기준치(2026-07-28, 733파일): **인덱싱 ~3초, DB ~53MB, 노드 ~7.9k·엣지 ~32k**. 분 단위로 걸리거나 DB가 수백 MB면 이상 신호 — 중단하고 보고.

### 3. 검증

```bash
CODEGRAPH_TELEMETRY=0 DO_NOT_TRACK=1 npx -y @colbymchenry/codegraph@latest status
```

`✓ Index is up to date` + 파일/노드/엣지 수를 확인해 사용자에게 요약 보고하세요.

### 4. 위생 확인 (최초 구축 시)

- `.gitignore`에 `.codegraph/` 등재돼 있는지 확인 (없으면 추가 — 인덱스는 머신 로컬 캐시, 커밋 금지).
- `git status`에 `.codegraph/`가 안 떠야 정상.
