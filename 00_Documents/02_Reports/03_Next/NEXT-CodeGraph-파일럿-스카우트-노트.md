# NEXT 스카우트 노트 — CodeGraph 파일럿 (ADR-042 실측 부속)

> 실측일: 2026-07-28
> 발견 계기: 영호 — "다음 마일스톤은 CodeGraph라는 Management tool을 추가하고 싶어. 현재 우리 프로젝트 코드가 어떻게 구성되어있는지를 파악하는 용도(물론 클로드 너도 빠르게 구조 파악 할 수 있게)"
> 성격: **채택 근거 박제** — 결정 정본은 [ADR-042](../../01_Adr/ADR-042-codegraph-adoption.md), 본 노트는 그 실측·해부 기록 + §5 AGENTS.md 인계 문안(Codex 세션 이월분)

## 1. 후보 조사 → colbymchenry/codegraph 선정

- X(트위터) 최신 트렌드 조사(2026-07 시점)로 후보군 확인 → GitHub 실사(최근 커밋·이슈 상태)로 압축.
- 실사 판정: 스타 규모 대비 워처 수가 어긋나는 신호(스타 인플레이션 의혹)는 **이슈 트래커 질감**(재현 절차 붙은 실사용 버그 리포트 패턴)과 분리해 평가 — 실사용 증거 쪽이 유효.
- 치명 후보 이슈 2건 하향: **#1454**는 취약점이 아니라 MCP 지침 경유 컨텍스트 오염 버그 — 우리 조건(CLI-only, MCP 미등록)에선 미성립. **#1451**(Windows)은 파일럿에서 미발현.
- 파일럿 시점 버전 = **v1.5.0** (MIT).

## 2. 파일럿 실측 (2026-07-28, AgentDeck 저장소)

| 항목 | 실측값 |
|---|---|
| 인덱싱 대상 | 733파일 |
| 인덱싱 시간 | **~2.9초** (인덱서 자체 — npx 부트스트랩 포함 전체 명령은 ~7.3초) |
| DB 크기 | `.codegraph/codegraph.db` **52.76MB** |
| 그래프 규모 | 노드 7,877 · 엣지 32,302 |
| 상주 프로세스 | **0** (init은 워처·데몬을 시작하지 않음) |

도구별 채점:

| 도구 | 판정 |
|---|---|
| `callers` | ✅ **정밀도·재현율 100/100** — 주석·유사 심볼 허수 전부 제거. 주석 밀도 높은 우리 코드베이스에서 grep 대비 이점이 가장 큰 지점 |
| `impact` | ⚠️ **상한 추정** — 전이 폐쇄 꼬리에서 무관 config까지 과대 포함. "이 밖은 안전" 경계로만 사용 |
| `explore` | ⚠️ 질의는 자연어 문장이 아니라 **심볼명 모음(bag)** 이 정밀 — 자연어는 키워드 오염("prompt"에 PromptModal이 딸려옴). 출력 ~28KB로 큼 |
| `node` | 심화 1순위 — verbatim 소스 + 호출자/피호출자 트레일. 동명 오버로드 전부 반환 |

설계 문서에서 확인한 핵심 근거 둘:
- **MCP 서버 지침은 메인 에이전트에만 닿는다** — 서브에이전트는 CLI+지침 파일이 유일 경로. 우리 Worker 5종은 Bash만 보유 → CLI가 메인·서브 공통 경로라 MCP 등록 없이도 가치가 전부 나온다.
- 에이전트는 도구가 isError 1~2회면 그 도구를 버린다 — 업스트림이 마찰 최소화에 공들인 이유. 우리 대응 = codegraph-search 스킬의 실패 사다리(unlock→재구축→Grep/Read 폴백, 1~2회에 안 버림).

## 3. 인스톨러 해부 — 왜 우회하는가 (`codegraph install` 자동 배선 4종)

| # | 배선 | 우리 판정 |
|---|---|---|
| 1 | `.mcp.json` / `~/.claude.json`에 MCP 서버 엔트리 upsert | 영호 수동 등록으로 대체 가능(필요 시 유지보수 창) |
| 2 | `.claude/settings.json`에 auto-allow(`mcp__codegraph__*`) 주입 | **봉인 관할 밖 쓰기** — 훅은 Claude 도구 호출만 검문, 외부 프로세스는 못 막음 |
| 3 | CLAUDE.md에 마커 블록(`<!-- CODEGRAPH_START/END -->`) upsert | 헌법을 외부 도구가 수정 — CORE-11 위반 벡터 |
| 4 | UserPromptSubmit prompt-hook 등록 | 훅 체계에 무단 편입 |

전부 **백업 없이** 수행됨 → 4종 모두 수동 대체 가능 확인 → "인스톨러 우회 + CLI만 + 영호 수동 MCP 등록(보류)" 설계로 확정. permissions deny 2줄(`install*`/`uninstall*`)이 이중 차단.

## 4. 텔레메트리

- 기본 opt-out 방식, PostHog(US) 전송.
- `CODEGRAPH_TELEMETRY=0` 또는 `DO_NOT_TRACK=1`로 **완전 오프 — 연결 자체를 안 연다**(TELEMETRY.md 확인 2026-07-28).
- 우리 표준 = 모든 호출에 env 프리픽스 2종 고정(`CODEGRAPH_TELEMETRY=0 DO_NOT_TRACK=1`). permissions allow가 이 프리픽스 포함 문자열로 매칭되므로 프리픽스 생략 호출은 ask로 떨어진다(2차층).

## 5. AGENTS.md 인계 문안 (Codex 세션용 — CORE-12로 Claude가 직접 반영 불가)

> 아래 블록을 AGENTS.md에 Codex가 편입한다. `.claude/skills/**` 참조 없이 자기완결로 작성했다(엔진 격리 — 공유는 정책 의미뿐).

```markdown
## 코드 구조 지도 (CodeGraph, ADR-042)

- `.codegraph/`(로컬 인덱스)가 있으면 구조·호출·영향 질의는 Grep/Read 루프 전에 CodeGraph CLI로 한다. 공통 프리픽스:
  `CODEGRAPH_TELEMETRY=0 DO_NOT_TRACK=1 npx -y @colbymchenry/codegraph@latest`
  주 커맨드: `query <심볼>`(퍼지 후보) · `node <심볼>`(정의+관계 — 심화 1순위) · `callers`/`callees`(정밀 — 실측 100/100) · `impact`(⚠️ 상한 추정 — "이 밖은 안전" 경계로만) · `affected <파일...>`(회귀 테스트 선별) · `explore "<심볼명 나열>"`(⚠️ 자연어 문장 X — 심볼명 모음으로. 출력 ~28KB). 인덱스가 없으면 통째로 건너뛴다(인덱싱 여부는 영호 결정).
- 갱신은 **명시 시점만** — 세션 시작·마일스톤 경계에 `sync`(실측 ~3초). 워처·데몬 상주 금지. 결과가 낡았다 의심되면 sync 먼저, 그래도 실패면 `unlock`→`init` 재구축(~3초)→Grep/Read 폴백.
- ⚠️ **`install`/`uninstall` 서브커맨드 절대 금지** — 외부 프로세스가 하네스(settings·지침 파일)를 봉인 관할 밖에서 자동 수정한다. MCP 등록·권한 조정은 영호의 유지보수 창 작업으로만. → ADR-042
```

## 6. 처리 방침 (영호 결정 2026-07-28)

- 갱신은 자동 워처가 아니라 **마일스톤 단위 수동**("자동 갱신 구조보다는 마일스톤단위로 작업 끝나면 갱신하는 식으로").
- 통합은 유지보수 창(OpenGate)에서 완료: 스킬 3종 + 헌법 1절 + settings 3벌 + `.gitignore` + ADR-042 + 본 노트.
- 잔여: AGENTS.md 반영(Codex 세션 — §5 문안) · MCP 등록은 보류(필요해지면 영호 수동).
