# ADR-042: CodeGraph 채택 — CLI-only · 수동 갱신 · 인스톨러 격리

**결정(CodeGraph 마일스톤, 2026-07-28 — 영호 GO 동일)**: 코드 구조 지도 도구로 [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph)(MIT, 파일럿 시점 v1.5.0)를 채택하되, **업스트림 표준 설치 경로를 쓰지 않는다**. ① 인스톨러(`install`/`uninstall`) 전면 금지 — CLI 직접 호출만(env `CODEGRAPH_TELEMETRY=0 DO_NOT_TRACK=1` 프리픽스 고정) ② 갱신은 워처·데몬 없이 **명시 시점만**(세션 시작·마일스톤 경계에 `sync` — 영호 결정 2026-07-28) ③ `.codegraph/` 인덱스는 git 제외(머신 로컬 캐시, 재생성 ~3초) ④ MCP 서버 등록은 채택 범위 밖 — 필요해지면 영호가 유지보수 창에서 수동으로만. 에이전트 접점 = 스킬 3종(`codegraph-init`·`codegraph-update`·`codegraph-search`) + 헌법 「코드 구조 지도」 절 + permissions(allow 1줄·deny 2줄, 3벌 동기).

**이유**: 에이전트는 코드 구조를 Grep/Read 루프로 한 파일씩 재발견한다 — 주석 밀도가 높은 우리 코드베이스에선 grep 허수(주석·유사 심볼)가 특히 크다. CodeGraph는 tree-sitter 파싱으로 심볼·호출·import 그래프를 로컬 SQLite(`.codegraph/codegraph.db`)에 박아 그 루프를 그래프 질의 1~5콜로 대체한다. 파일럿 실측(2026-07-28): 733파일 인덱싱 ~3초 · `callers` 정밀도·재현율 100/100 · 상주 프로세스 0. 서브에이전트 관점의 결정 근거 하나 더 — **MCP 서버 지침은 메인 에이전트에만 닿는다**. Worker 5종은 Bash만 갖고 있으므로 CLI가 메인·서브 공통 경로이고, MCP 등록 없이도 도구 가치가 전부 나온다. 마일스톤 동기 = 영호 "현재 프로젝트 코드 구성 파악 + Claude도 빠르게 구조 파악"(2026-07-28).

**대안과 트레이드오프**:
- (a) *현행 유지(Grep/Read 루프)* — 비용 0이나 구조 질의마다 허수 필터링 토큰을 계속 낸다.
- (b) *자체 구축(tree-sitter 직접)* — 통제 100%이나 도구 가치가 검증되기 전에 구축 비용 선불. 기존 LSP 스택(ADR-017)은 제품(renderer 코드 인텔리전스)용이라 용도가 다르다 — 하네스 운영 도구로 전용하면 경계가 흐려진다.
- (c) *업스트림 표준 설치(installer + MCP + 상시 워처)* — 편의 최대이나 **인스톨러가 `.claude/settings.json`·CLAUDE.md·`~/.claude.json`을 백업 없이 자동 수정**한다(봉인 관할 밖 쓰기 — 훅은 Claude 도구 호출만 검문하므로 외부 프로세스를 못 막는다). 상시 워처도 "상주 프로세스 0" 원칙과 충돌.
- (d) **채택: CLI-only + 수동 갱신** — 업스트림 편의(자동 최신성·MCP 자동 노출·마커 블록 지침 주입)를 포기하고 하네스 통제를 지킨다. 수동 `sync`는 README가 "샌드박스·스크립팅 환경용"으로 명시한 공식 지원 경로라 이탈이 아니다.

---

## 1. 통합 지점 (전수)

| 지점 | 내용 |
|---|---|
| 스킬 3종 | `.claude/skills/codegraph-{init,update,search}/SKILL.md` — 구축·갱신·질의 절차 + 실측 기준치 + 금지 명령. init↔update↔search 상호 참조로 짝 선언 |
| 헌법 | CLAUDE.md 「코드 구조 지도 (CodeGraph, ADR-042)」 절 — 언제 쓰는가(Grep/Read 루프 전)·갱신 시점·인스톨러 금지 |
| permissions | allow 1줄(env 프리픽스 광역 `* `) + deny 2줄(`install*`/`uninstall*`) — **deny > allow 우선순위로 광역 allow의 구멍을 봉쇄**. env 프리픽스 없는 호출은 어느 규칙에도 안 걸려 ask(2차층). `.claude/settings.json` + `settings.OPEN.json` + `settings.SEALED.json` 3벌 동기(ADR-038) |
| .gitignore | `.codegraph/` 제외 (재생성 ~3초라 캐시 취급 — 커밋 금지) |
| Codex 어댑터 | AGENTS.md 대응 절 — CORE-12로 Claude가 수정 불가. 스카우트 노트 §5 인계 문안으로 Codex 세션 이월 |

## 2. 알려진 한계·위험 (실측)

- **인덱스는 스냅샷** — 워처를 버렸으므로 마지막 sync 이후의 편집은 안 보인다. 방어 = codegraph-search 해석 규율("결과를 정본으로 단정하지 말 것 · 방금 편집한 파일 관련이면 update 먼저").
- **`impact`는 상한 추정** — 전이 폐쇄(transitive closure, 간접 영향을 끝까지 따라간 집합)가 꼬리에서 과대 포함(실측: 무관 config까지 등장). "정밀 목록"이 아니라 **"이 밖은 안전" 경계**로만 쓴다.
- **`npx @latest` = 버전 핀 없음** — 업스트림 파괴적 변경에 노출. 마찰 발생 시 그 시점 버전으로 핀 — 정책이 아니라 좌표 수정이라 ADR 개정 없이 스킬·permissions 문자열 갱신으로 처리(단, permissions는 3벌 동기 + 유지보수 창).
- **외부 의존 신뢰성** — 스타 규모 대비 워처 수가 낮은 신호는 실사에서 확인했고, 이슈 트래커 질감은 실사용자 패턴이었다. 치명 후보 2건은 하향: #1454(컨텍스트 오염)는 MCP 지침 경유라 우리 조건(CLI-only) 미성립, #1451(Windows)은 파일럿에서 미발현.

**파급**: 스킬 3종 신설 · 헌법 1절 · settings 3벌(allow 1·deny 2) · `.gitignore` 1줄 · AGENTS.md 이월(Codex 세션) · 운영상 마일스톤 경계 절차에 "codegraph-update" 1스텝 추가.

**위험도**: [M] — 봉인 영역(`.claude/skills/**`·settings·CLAUDE.md) 변경이라 유지보수 창 작업 + CHANGELOG 기록 동반. 제품 코드 변경 0.

**관련**: 스카우트 노트 [`NEXT-CodeGraph-파일럿-스카우트-노트.md`](../02_Reports/03_Next/NEXT-CodeGraph-파일럿-스카우트-노트.md)(후보 실사·인스톨러 해부·파일럿 채점 — 본 ADR의 실측 부속) · ADR-038(settings 3벌 동기) · ADR-017(용도 구분 — LSP는 제품용) · CORE-11(인스톨러 금지 근거) · CORE-12(AGENTS.md 이월 근거).

**현황(2026-07-28)**: 채택 — X 트렌드 조사 → GitHub 실사 → 파일럿 실측 채점 → 영호 GO → 유지보수 창에서 통합 완료.
