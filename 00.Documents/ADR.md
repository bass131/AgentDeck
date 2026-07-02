# Architecture Decision Records — AgentDeck

> *왜 이렇게 만드는지*. 각 결정 = 뭘 골랐고 / 왜 / 뭘 포기했는지 3줄. **트레이드오프가 핵심** — AI가 나중에 "X로 바꿀까요?" 제안을 못 하게 못박는다.

---

### ADR-001: 셸 — Electron (Tauri 아님)
**결정**: Electron + electron-vite.
**이유**: 목표가 AgentCodeGUI의 *배포 과정까지 벤치마킹*. AgentCodeGUI는 Electron이라 NSIS 설치·electron-updater·컨텍스트메뉴 경로를 그대로 재사용 가능. React 생태계(코드뷰어/diff) 재사용.
**트레이드오프**: 번들 크기·메모리는 Tauri보다 크다. 그러나 배포 파이프라인 재현성과 레퍼런스 일치가 우선.

### ADR-002: UI — React + TypeScript
**결정**: renderer는 React + TS.
**이유**: AgentCodeGUI 레퍼런스 일치, 코드뷰어/diff/마크다운 등 성숙한 React 라이브러리 활용.
**트레이드오프**: Svelte/Solid 대비 런타임 약간 무겁다. 생태계 깊이를 택함.

### ADR-003: 엔진 추상화 — Adapter 패턴 (`AgentBackend`) ⭐
**결정**: 모든 코딩 엔진을 `AgentBackend` 인터페이스 뒤에 둔다. 엔진별 출력은 공통 `AgentEvent`로 정규화.
**이유**: "Codex도 활용 + 듀얼 백엔드 전환" 요구. UI/영속화가 엔진을 모르게 하면 엔진 추가 = 어댑터 1개. 단일엔진 종속(AgentCodeGUI의 한계)을 구조적으로 회피.
**트레이드오프**: 공통 이벤트 모델이 *최소공배수*라 엔진 고유 기능(예: Claude의 sub-agent 카드 메타)을 100% 노출 못 할 수 있음 → 어댑터에 `raw` 패스스루 필드를 둬 완화.

### ADR-004: Claude Code 연동 — Agent SDK 우선, `claude -p` 폴백
**결정**: `@anthropic-ai/claude-agent-sdk`(또는 동등 SDK)를 1순위, 헤드리스 `claude -p` JSON 스트림을 폴백 어댑터로.
**이유**: SDK는 구조화된 이벤트/툴 메타를 주어 정규화가 쉽다. CLI 폴백은 SDK 부재 환경 호환.
**트레이드오프**: SDK 버전 변동 추적 비용. 어댑터 경계가 흡수.
**Note**: Anthropic/Claude 관련 작업 전 `claude-api` 스킬 + 최신 모델 ID 확인 의무(CLAUDE.md).
**현황(2026-06-24, 갱신)**: ADR-004의 'SDK 우선' 의도는 **ADR-016으로 SDK 단일 전환 완료**(Phase 21, 커밋 1c47d58/d52b139). 그 위에서 M4-2~M4-4·B8·M2-LSP 전부 SDK 기반 구현·실 SDK 라이브 검증 완료. **'`claude -p` CLI 폴백' 부분은 ADR-016이 superseded** — CLI spawn/taskkill 전면 제거되어 **현재 폴백 어댑터 없음**(SDK 하드 의존, isAvailable=true). ADR-004는 'SDK 우선' 결정의 원천 기록으로 보존하되, 듀얼(SDK+CLI) 가정은 무효.

### ADR-005: 상태관리 — Zustand
**결정**: renderer 전역상태는 Zustand.
**이유**: 대화 스트리밍처럼 고빈도 부분갱신에 보일러플레이트 적고 가벼움.
**트레이드오프**: Redux DevTools 생태계 대비 디버깅 도구 빈약. 규모상 불필요.

### ADR-006: 영속화 — better-sqlite3
**결정**: 대화/diff/draft는 better-sqlite3(동기 API, main 프로세스).
**이유**: 임베디드·트랜잭션·쿼리 가능, 파일 한 개. AgentCodeGUI의 "대화/변경 영속화" 요구 충족.
**트레이드오프**: 네이티브 모듈이라 electron-rebuild/abi 관리 필요. JSON 파일 대비 운영비용 ↑이나 쿼리·복구 능력이 그만한 값.
**현황(2026-06-26, superseded)**: 약점보강 트랙에서 **better-sqlite3 전면 제거 → JSON 파일 fan-out 영속화로 통일**(원본 AgentCodeGUI `maStore.ts`/`chats.ts` 1:1, Claude Code도 per-session JSONL — 둘 다 DB 미사용). 근거: sqlite가 이 규모엔 과하고 네이티브 ABI 마찰(rebuild·잠금)만 유발. 현재 `src/main/persistence/store.ts` + `multiStore.ts`(JSON), package.json·src에서 better-sqlite3 0. ADR-006의 'better-sqlite3' 결정은 superseded(원천 기록으로 보존). ABI 관리 명령(rebuild:native 등)·predev/pretest rebuild 훅도 소멸.

### ADR-007: 보안 — main 단독 권한 + contextIsolation
**결정**: `nodeIntegration:false`, `contextIsolation:true`. fs/proc/db/network은 main만. preload는 화이트리스트 IPC만 노출.
**이유**: renderer는 untrusted(웹 콘텐츠/마크다운 렌더). 하네스 "도구 경계" 기둥의 코드화.
**트레이드오프**: 모든 권한작업이 IPC 왕복 → 코드량 ↑. 보안·하네스 정합이 우선.

### ADR-008: API 키 저장 — OS 자격증명 / `.env`(git-ignored)
**결정**: 키는 OS 자격증명 저장소 또는 `.env`. 코드·DB·로그에 평문 금지.
**이유**: 유출 방지(CLAUDE.md CRITICAL).
**트레이드오프**: keytar류 네이티브 의존. MVP는 `.env`로 시작, 자격증명 저장소는 마일스톤 04.
**현황(2026-06-24, 갱신)**: 실제 인증은 **Claude Code OAuth(`~/.claude/.credentials.json`) 또는 `ANTHROPIC_API_KEY`(env)** — Agent SDK(ADR-016)/Claude Code가 소유하고 우리 앱은 **토큰을 저장하지 않고 읽기 전용으로만** 접근. B8(usage)·P3(engine-state)는 토큰을 main 지역변수에서 **boolean으로만 환원**(반환/로그/IPC 미노출, reviewer 검증). 우리가 키를 보관하지 않으므로 별도 OS 자격증명 저장소(keytar)는 불요 — **'마일스톤 04' 계획 무효**. ADR-008의 '코드·DB·로그 평문 금지' 원칙은 **불변(준수 중)**.

### ADR-009: 패키징 — electron-builder(NSIS) + electron-updater
**결정**: electron-builder NSIS 타깃, electron-updater + GitHub Releases.
**이유**: AgentCodeGUI 배포 경로 동일. 위저드 설치 + 자동 업데이트.
**트레이드오프**: 코드 서명 부재 시 SmartScreen 경고("More info→Run"). MVP/초기엔 서명 보류(비용), 후속 도입.
**현황(2026-06-24)**: 여전히 **미설치(M5)**. M5 패키징 시 **LSP 번들 서버(`typescript-language-server`/`pyright`, ADR-017)를 `electron-builder asarUnpack`** 으로 asar 밖에 둬야 함(asar 내부면 `process.execPath` 자식프로세스가 못 읽음 → spawn ENOENT). 현재 라이브 검증은 dev/vite-node 기준(패키지 미검증).

### ADR-010: 멀티에이전트 개발 분담 — ClaudeDev식 coordinator/worker
**결정**: 본 저장소 개발은 coordinator(분해·위임·통합) → 도메인 Worker(main-process / agent-backend / renderer / shared-ipc / qa) → reviewer/plan-auditor 자동 호출. 권한 경계 + 재귀 차단 + 등급별 동원.
**이유**: `C:\Dev\ClaudeDev` 검증된 패턴 착안. 컨텍스트 보존 + 경계코드 일관성.
**트레이드오프**: 위임 오버헤드(단순 작업엔 과함) → 등급 "단순"은 메인 직접 처리로 완화.

### ADR-011: Phase 실행 — `scripts/execute.py` 헤드리스 순차 **(superseded 2026-06-26: /work:plan + 세션/루프로 대체)**
**결정**: 마일스톤을 Phase로 쪼개 `execute.py`가 `claude -p`로 순차 실행, Phase별 새 세션 + 상태(`status.json`) 추적 + 자동 커밋.
**이유**: 하네스 프레임워크 Layer 3. 각 Phase 범위가 문서로 제한 → 에이전트가 범위 밖 작업 안 함.
**트레이드오프**: 헤드리스 자동실행은 사람 게이트가 약해질 위험 → 비가역(push/PR/배포)은 `ask` 게이트 보존(settings.json).
**Superseded(2026-06-24)**: `scripts/execute.py`는 **미구현**(미채택). 실제 개발 프로세스는 **ADR-010(coordinator/도메인 Worker/reviewer/plan-auditor) + `/loop` 자율 루프**로 진행 — ADR-011의 '마일스톤→Phase 분해·범위 제한·자동 커밋' 의도는 `phases/NN/_INDEX.md` 정의서 + 사람 게이트(push/배포 ask)로 충족됨. `claude -p` 순차 실행 전제는 ADR-016(CLI 제거)으로도 무효. ADR-011은 초기 의도 기록으로 보존하되 **이 방식은 채택하지 않음**.

### ADR-012: 코드 인텔리전스 스택 — CodeMirror 6 + react-markdown (M2)
**결정**: 코드뷰어=**CodeMirror 6**(읽기전용, Darcula 테마), 마크다운=**react-markdown + remark-gfm + rehype-highlight + highlight.js**, 이미지=data URL `<img>`. `fs.read` 단일 채널(text+binary)로 뷰어 라우팅. 원본 AgentCodeGUI와 동일 스택.
**이유**: 원본 충실도 + 성숙한 React 생태계. 마크다운 신뢰경계(rehype-raw 미사용·data URL만·CSP img-src/connect-src/object-src).
**트레이드오프**: highlight.js 문법 번들(~750KB) → 데스크톱 앱 허용. **시맨틱 토큰(LSP 호버/정의이동)은 M2-LSP 마일스톤으로 분리**(typescript-language-server/pyright) → **ADR-017로 구현 완료**(Phase 27, 커밋 4f7a606: LSP hover/definition/semanticTokens, 실 TS LSP 라이브 PASS).

### ADR-013: 스택 버전 — 원본 AgentCodeGUI와 동일 업그레이드 ⭐
**결정**: **React 19 · Electron 42 · Vite 7 · electron-vite 5 · TypeScript 6** + @vitejs/plugin-react 5 · vitest 3 · @testing-library/react 16 · @types/react 19 · @types/node 24. (이전 암묵 React18/Electron31/Vite5/TS5 → 상향.)
**이유**: Track 1 = **완전 복제**. 런타임/빌드가 원본과 동일해야 동작·배포·미래기능(LSP·Agent SDK) 정합. 원본의 *동작하는* electron.vite/tsconfig를 미러링해 마이그레이션 위험을 줄임.
**트레이드오프**: Electron 11개 메이저 등 대규모 업그레이드 → React19 JSX 네임스페이스(`JSX.Element`→`React.JSX`)·testing-library 16·better-sqlite3 ABI 재빌드 등 breaking 대응 필요. **사용자 승인(2026-06-22)**. ADR-001/002의 "Electron+React+TS" 결정은 불변, 버전만 고정.
**Note(분류 — 혼동 방지)**: 본 ADR의 *'원본 일치'* 대상 = React·Electron·Vite·electron-vite·TS·CodeMirror·react-markdown·remark-gfm·highlight.js. **vitest·@testing-library·@vitejs/plugin-react·typescript-eslint·Zustand(ADR-005)·better-sqlite3(ADR-006)·rehype-highlight는 원본 미존재 = AgentDeck 확장**(원본은 테스트 프레임워크 없음·영속화 JSON 파일·상태 라이브러리 미사용·마크다운 하이라이팅은 highlight.js 직접 호출). 배포 스택(electron-builder/electron-updater)은 원본과 동일하나 **현재 미설치(M5 예정)**.

### ADR-014: 충실도 1:1 복제 방식 — 원본 클론 레퍼런스 + OKLCH 디자인시스템 ⭐ **(superseded: UI.md Clay HEX로 진화)**
**결정**: 원본 repo를 **`C:/Dev/AgentCodeGUI`에 클론**(git 미포함, 레퍼런스 전용). 컴포넌트 소스/`styles.css`/`docs/*.png` 스크린샷을 **페이즈별 대조**. 디자인시스템 = **OKLCH 듀얼테마(라이트/다크)** 이식(이전 hex 토큰·다크 전용 대체). 타깃 스펙 = `docs/UI.md`(현행 Clay 에디토리얼 HEX 듀얼테마로 진화 — 옛 OKLCH 타깃). **충실도 트랙 F1~F6**(디자인시스템+셸 → 사이드바/탐색기 → 대화/컴포저/툴카드 → 우측패널 → 뷰어/모달 → 라이트테마/폴리시).
**이유**: 기능맵 기반 구현이 원본 완성도(셸·디자인·컴포넌트 밀도)에 못 미침 → *정답지(소스)* 대조가 충실도의 정공법. 격차 상당수(서브에이전트·Git·설정·LSP)는 M3/M4/M5 기능과 병합.
**트레이드오프**: 외부 코드 참조·실행은 **신뢰경계 주의** — live 빌드/실행은 **사용자 권한 하에서만**(외부 lifecycle 스크립트 실행 위험). 소스+스크린샷 정적 대조가 기본.

### ADR-015: M3 Git 백엔드 — git CLI `execFile` 직접 (라이브러리 0) ⭐
**결정**: git 연동은 `src/main/git.ts` 단일 파일에서 시스템 git을 `child_process.execFile`로 직접 호출. simple-git/isomorphic-git/nodegit 등 **라이브러리 미사용 = 새 의존성 0**. read 6 + write 3 = 9함수(status/log/commitDetail/fileAt/workingFile/root + commit/push/pull), 출력은 porcelain v2·--numstat 직접 파싱. AI 커밋 메시지는 **별도 AI 모듈 없이 활성 에이전트에 위임**(onAskClaude → 컴포저 주입, ADR-003 재사용).
**이유**: 원본 AgentCodeGUI가 정확히 `src/main/git.ts` + execFile 방식 → **완전 복제 충실도**. execFile은 Node 내장(stdlib)이라 번들·ABI·버전 부담 0이고 git 출력 포맷을 자유롭게 제어. 신뢰경계: git/child_process는 main 단독(`git.ts` electron import 0), renderer는 `window.api.git.*` IPC만.
**트레이드오프**: 시스템 git 설치에 의존(없으면 실패 → `GitOpResult`/null로 흡수). 라이브러리 추상화 대신 출력 파싱을 직접 작성. 그러나 의존성 0 + 원본 일치 + 포맷 제어가 그만한 값. ADR-013(스택 원본 일치)·ADR-007(신뢰경계)와 정합.

### ADR-016: Agent SDK 채택 — `claude -p` CLI에서 `@anthropic-ai/claude-agent-sdk`로 전환 ⭐
**결정**: `ClaudeCodeBackend`를 헤드리스 `claude -p` CLI spawn에서 **`@anthropic-ai/claude-agent-sdk`의 `query()`** 기반으로 재작성한다(원본 AgentCodeGUI `src/main/claude/engine.ts` 미러). `AgentBackend` 추상화·`AgentEvent` 정규화 경계는 유지. 의존성 `@anthropic-ai/claude-agent-sdk` 추가(ADR 근거 충족).
**이유**: ① 원본이 SDK 기반 → 완전 복제(Track 1) 충실도. ② 헤드리스 `-p` CLI는 **빌트인 슬래시 실행·이미지 입력·인바운드 권한/질문 왕복(control protocol)·세션 resume·todo/context 이벤트가 부재** → M4(멀티/대화 고도화)를 구조적으로 막음(claude-code-guide 권위 확인 2026-06-23). SDK는 `canUseTool` 콜백·`permissionMode`·`effort`(모델별 자동 다운그레이드)·`modelUsage.contextWindow` 실측·`stream_event` 부분 스트리밍·세션을 네이티브 제공. ③ ADR-004의 'SDK 1순위' 본래 의도 이행.
**트레이드오프**: SDK 의존성 추가(번들·버전 추적) + 인증(Claude Code OAuth/`ANTHROPIC_API_KEY`). M4-1의 `run-args`(CLI 플래그 매핑)는 SDK options 매핑으로 대체(picker→options 개념 이전), `MODEL_CONTEXT_WINDOW` 상수는 SDK 실측(`modelUsage`)으로 보강 가능. AgentEvent에 permission/question/todo/context 이벤트 추가 동반(backend-contract 깃발). ADR-003(어댑터 경계)·ADR-007(신뢰경계)와 정합 — SDK 호출도 main 단독.
**현황(2026-06-24)**: **구현 완료**(Phase 21, 커밋 1c47d58/d52b139). CLI spawn 전면 제거, SDK `query()` 단일 경로. `MODEL_CONTEXT_WINDOW`는 SDK 실측(`modelUsage.contextWindow`) 우선·상수 fallback으로 보강 완료. permission/question(canUseTool 양방향 push-queue)·thinking/subagent/todo 이벤트는 **M4-4(Phase 24)** 추가 완료. settings 핀(`permissions.defaultMode`)·`settingSources`로 canUseTool 발화 보장(스파이크 검증). SDK 버전 `0.3.186`.

### ADR-017: LSP 클라이언트 통합 — typescript-language-server + pyright (번들) + JSON-RPC StdioRpc (M2-LSP) ⭐
**결정**: 코드 인텔리전스(C5 호버·정의이동, C2 시맨틱 토큰)를 위해 **LSP 클라이언트**를 통합한다. **번들 서버**(npm 의존성, 설치 불필요): `typescript-language-server`(TS/JS), `pyright`(Python). 자식프로세스 LSP 서버를 **main 단독**으로 spawn하고 `src/main/lsp/`에 `StdioRpc`(JSON-RPC 2.0 over stdio, Content-Length 프레이밍 — 원본 `jsonrpc.ts` 130줄 미러) + `LspManager`(서버 생명주기·initialize/didOpen/didChange·hover/definition/semanticTokens·시맨틱 토큰 디스크 캐시)를 둔다. 신규 IPC: `lsp.status`/`lsp.hover`/`lsp.definition`/`lsp.semanticTokens`/`lsp.cachedTokens`. renderer는 CodeMirror 6 뷰어에 `hoverTooltip`(300ms)·F12/Ctrl+클릭 정의이동·시맨틱 토큰 Decoration을 `window.api.lsp.*` IPC로만 연결. **다운로드형 서버(C#=Roslyn, C++=clangd)·UE(compile_commands)는 범위 외(후속)**. 원본 AgentCodeGUI `src/main/lsp/{manager,jsonrpc}.ts` + `CmEditor.tsx` 미러.
**이유**: ① 원본이 LSP를 완전 구현(`src/main/lsp/` ~1500줄) → Track 1 **완전 복제**. ② C5(호버/정의이동)·C2(시맨틱 토큰)는 ADR-012가 "M2-LSP 마일스톤으로 분리"로 명시 예약한 코드 인텔리전스 핵심 — LSP 없이는 *타입 기반* 시맨틱 색칠·정의이동 불가(CodeMirror 내장 grammar는 구문 토큰만). ③ `typescript-language-server`+`pyright`는 원본과 동일 버전·Node 기반 번들 의존성(별도 설치 불필요). **사용자 승인(2026-06-24 AskUserQuestion: "진행 승인 — ADR-017 초안 후 구현")**.
**트레이드오프**: 번들 크기 ↑(~65MB: typescript-language-server ~15MB + pyright ~50MB) → 데스크톱 앱 허용. 자식프로세스 관리 복잡도(spawn/kill tree/timeout/JSON-RPC 상관관계) → `StdioRpc`가 캡슐화. LSP 초기화 지연(특히 대형 프로젝트) → `status`('starting'/'ready'/'error') 배지로 시각화 완화. 신뢰경계(ADR-007): LSP 서버 자식프로세스·stdio는 **main 단독**(`src/main/lsp` electron import 0), renderer는 `window.api.lsp.*` IPC만 — 임의 경로/명령 주입 차단(등록 워크스페이스/파일만). ADR-012(코드 인텔 스택)의 LSP 분리 이행·ADR-013(원본 일치)·ADR-001(Electron)와 정합. 다운로드형(C#/C++)·실시간 didChange 스트리밍은 후속 분리.

### ADR-018: 런타임 멀티버전 SDK 설치 + 동적 로드 (엔진 인-앱 업데이트) ⭐
**결정**: 코딩 엔진(`@anthropic-ai/claude-agent-sdk`)을 앱 내에서 **새 버전으로 업데이트**하는 흐름을 추가한다. 원본 AgentCodeGUI `src/main/engine/versions.ts`를 미러하되 신규 폴더 없이 `src/main/engine-versions.ts`(engine-state.ts 옆 sibling 파일)로 둔다.
- **설치**: `npm install @anthropic-ai/claude-agent-sdk@<ver> --prefix <userData>/engines/<ver>` 를 main 단독 child_process spawn, stdout/stderr 라인을 `engine.installProgress` 이벤트로 스트리밍.
- **활성화**: `<userData>/engine-config.json` 의 activeVersion 기록(setActive).
- **동적 로드**: `loadActiveQuery()` 가 활성 설치본 entry를 동적 import해 `query` 를 반환(`{version, query}` 캐시, setActive 시 캐시 무효화). 실패 시 null → 번들 SDK 폴백. `ClaudeCodeBackend.getDefaultQueryFn()` 가 loadActiveQuery 우선 → 번들 폴백.
- **UI**: `EngineUpdateNotice` 를 prompt("나중에"/"업데이트") → installing(스트리밍 로그 카드) → done(setActive)/error(다시 시도) phase 흐름으로 확장(원본 EngineGate 미러).
- **신규 IPC**: `engine.install` / `engine.installProgress`(event) / `engine.setActive` / `engine.versionState`. 타입 `EngineVersionState{package,bundled,active,installed[]}` 는 기존 `EngineState`(authed 전용)와 **별개**.

**이유**: ① 원본이 정확히 이 멀티버전 설치/동적로드를 구현 → Track 1 완전 복제(PRD A-1 "버전 관리"). ② 패키지 앱(asar)은 자기 node_modules를 수정할 수 없어, side-folder 설치 + 동적 로드가 **인-앱 엔진 업데이트의 유일한 경로**. ③ 사용자 직접 지시("업데이트까지 할지 묻고 과정 로그 표시").

**트레이드오프 / 신뢰 표면(CRITICAL)**: "다운로드한 코드를 런타임 실행"하는 새 신뢰 표면이 생긴다. 완화책:
- **다운로드 코드 실행**: 동일 패키지(`@anthropic-ai/claude-agent-sdk`)의 *다른 버전*만 — query 인터페이스 동일(ADR-016 정합). loadActiveQuery 실패 시 번들 폴백(안전망). 설치 버전과 번들의 **major 불일치 시 동적 로드 거부**(API shape 드리프트 가드).
- **npm spawn(child_process)**: main 단독. version(untrusted, renderer 유래)을 **strict semver 검증**(`^\d+\.\d+\.\d+(-[\w.]+)?$`)으로 arg/경로 주입 차단 + `<userData>/engines/<ver>` 경로 **containment 2단 방어**(resolve 후 enginesDir 내부 확인). 자식 env는 **화이트리스트**(PATH·시스템 변수만, ANTHROPIC_API_KEY 등 미주입). progress 라인은 renderer 전달 전 **시크릿 마스킹**(`_authToken`/`:_password`/`Bearer` 패턴). Windows `.cmd` shell 인용(CVE-2024-27980 미러).
- **경로 선택**: `<userData>/engines` — 앱 재설치 시 소실되나 재설치로 복구 가능한 캐시 성격(수용).
- **범위**: EngineGate 흐름(=latest 1개 설치)만. uninstall·Settings 버전 목록·임의 버전 선택은 **이번 범위 제외**(후속).
- ADR-003(versions=Claude 고유 main 인프라, 어댑터가 versions를 단방향 import — 역방향 금지)·ADR-008(신뢰경계)·ADR-016(SDK 단일 경로, 동일 패키지 버전 차이만)와 정합. 신규 npm 의존성 0(child_process·fs·node:url=stdlib).

**현황(2026-06-24)**: (a)체크+팝업·(b)설치·(c)동적로드 구현 완료(커밋 e7fa5ae·7d50e34·c70c924·c85662f). 실 Electron e2e PASS.

### ADR-019: 슬래시 커맨드 동적 캡처 — SDK supportedCommands() 하이브리드 ⭐
**결정**: 슬래시 팔레트의 빌트인 목록을 정적 하드코딩에서 **SDK `query.supportedCommands()` 동적 캡처 + 큐레이션 폴백 하이브리드**로 전환한다.
- **큐레이션 폴백**(즉시): 작동 보증 빌트인(clear·ask 인터셉트 + compact·init·review·security-review)을 첫 run 전·캡처 실패 시 표시.
- **동적 캡처**(첫 run에서): ClaudeCodeBackend가 활성 query 핸들의 `supportedCommands()`를 run 시작 시 1회 호출해 결과(name·description·argHint·aliases)를 **워크스페이스별 캐시**. AgentBackend에 generic 메서드(예: `listSupportedCommands(): Promise<SlashCommandInfo[]>`)로 노출(ADR-003: command.list 핸들러는 구체 엔진 미인지).
- **머지/dedup**: command.list = 큐레이션 빌트인 ∪ 캡처 빌트인 ∪ `.claude/commands` 스캔. name 키로 dedup, 우선순위 = 캡처 > 큐레이션 > fs 스캔. 클라이언트 인터셉트 전용(ask·clear)은 캡처에 없어도 항상 보존.

**이유**: ① 사용자 요구 "ClaudeCode 지원 모든 슬래시, 왠만하면 다 쓸 수 있게" — 정적 12개는 협소하고 6개는 거짓 광고였음(실측). ② supportedCommands는 **환경별 실제 지원 목록**(빌트인+스킬+커스텀, 측정 32개)이라 포괄적·정확하며 **SDK 버전업 시 자동 동기(드리프트 방지)** — 손유지 불필요. ③ 큐레이션 폴백으로 부트 프로브 없이(추가 비용 0) 첫 대화 후 포괄.

**트레이드오프**: 원본 AgentCodeGUI 미존재 확장(원본은 supportedCommands를 알고도 6개 하드코딩, "genuinely runs only" 철학) → **ADR-013(스택 원본 일치) 예외**를 드리프트 방지 가치로 정당화. 캡처는 query 핸들 가용 후(첫 run)만 → 첫 메시지 전엔 큐레이션 폴백만. supportedCommands가 커스텀 .md를 포함하므로 fs 스캔은 폴백 격하(중복 dedup). 신뢰경계(ADR-008): 노출은 name·description·argHint·aliases만 — 본문·시크릿·경로 0. 캡처는 main(어댑터) 단독, renderer는 IPC만.

**현황(2026-06-24)**: B7 Step1(거짓광고 6개 제거·정직화) 완료(커밋 2711e89). Step2(이 ADR) 구현 예정.

### ADR-020: 대화별 작업폴더(cwd) 앵커링 — 대화가 자기 워크스페이스를 기억 ⭐
**결정**: 워크스페이스를 전역 단일에서 **대화별 cwd 앵커링**으로 확장한다(원본 AgentCodeGUI 패리티).
- **DB 스키마(better-sqlite3, ADR-006)**: conversations 테이블에 `cwd TEXT` 컬럼 추가 — 마이그레이션 v3(기존 행은 cwd=null graceful).
- **IPC 계약(src/shared)**: `ConversationRecord`에 `cwd?: string` 추가. save/load가 cwd 운반.
- **store/renderer**: 대화 로드 시 그 대화의 cwd로 워크스페이스 복원(cwd 있고 검증 통과 시에만). 대화 생성/save 시 현재 workspaceRoot를 cwd로 기록.
- **범위(MVP 축소, plan-auditor)**: 단일 모드 대상. 멀티 모드는 이미 패널별 cwd(P15)라 제외. **folder-switch 확인 UX(원본 pendingFolder)는 후속 분리** — MVP는 "검증 통과 시 무확인 전환 + 생성 시 cwd 기록"으로 축소.

**이유**: ① 원본은 chat record에 `cwd`("Required")를 저장해 대화 전환 시 그 프로젝트로 워크스페이스가 따라 바뀜 — 1:1 충실도 갭. ② 멀티프로젝트 사용 시 **컨텍스트 정합**: 대화 A(/ProjectX)를 /ProjectY에서 열어도 탐색기·@멘션·에이전트 cwd가 A의 폴더를 따라가 어긋남 방지. ③ 에이전트 resume이 올바른 디렉토리에서 재개.

**트레이드오프 / 신뢰경계(plan-auditor #2 정정)**: DB 마이그레이션 + IPC 계약 변경(신뢰경계 깃발) + store 전역→대화별 = 중형. **`workspace.open`은 원래 rootId 게이트 비대상**(절대 folderPath를 `isAbsolute+existsSync+isDirectory`로 자기검증해 직수신 — renderer가 이미 임의 폴더를 열 수 있음). cwd 자동복원이 만드는 새 표면은 **"DB 영속 경로의 무확인 자동-open"** → 완화: ⓐ 자동 open 전 **재검증**(isAbsolute+existsSync+isDirectory, 기존 workspace.open과 동일 수준)·ⓑ 검증 실패 시 **전역 workspaceRoot 유지(graceful, 워크스페이스 미닫음)**·ⓒ **동일 workspace.open 핸들러 경로 재사용**(무검증 신규 경로 금지). cwd는 경로 문자열(시크릿 아님). 마이그레이션 실패/cwd=null → 기존 전역 동작 폴백.

**완료조건(측정가능, plan-auditor)**: ① store `save({cwd})`→`load()` 라운드트립 보존 + v3 미적용 DB 기존행 cwd=null graceful(단위). ② cwd 검증 헬퍼: 비존재 경로 → 전역 유지(open 미호출)(단위). ③ e2e: 대화 A(/X)·B(/Y) 전환 시 workspaceRoot·fileTree·@멘션 base가 cwd 따라 변경. ④ typecheck 양쪽 green.

**현황(2026-06-24)**: 구현 예정(MVP 축소 범위). folder-switch 확인 UX는 후속.

### ADR-021: 오케스트레이션 결과 복귀 + 진행 표면화 + 채팅 인라인 서브에이전트 ⭐
**결정**: UltraCode(오케스트레이션)를 **Workflow + Task 서브에이전트 "둘 다"** 지원으로 정상화하고, 진행을 라이브 표시 + 서브에이전트를 채팅 인라인으로 동적 표시한다(원본 AgentCodeGUI 미존재 확장 — query() 호스트 적응).

- **run 생명주기(F-B, 코어 펌프 변경)**: `ClaudeCodeBackend._runPump`가 `result`마다 `done`을 즉시 push하던 것을 **중간 done 보류 + iterator 자연 종료 시 단 한 번 최종 done** push로 바꾼다. Workflow는 fire-and-watch(프로브 확인: 턴1 "launched" result → `task_notification` → 턴2 진짜 결과 result)라 한 query에 result가 여러 번 오는데, run-manager(`agent-runs.ts`)가 *첫* done에 run을 break/폐기해 워크플로 결과(턴2)를 못 받던 버그를 수정. (run-manager·claude-stream·`src/shared` 무변경 — 어댑터 내부 완결.)
- **진행 이벤트(F-C, ADR-003 엔진중립)**: `system/task_started·task_progress·task_notification`(`tool_use_id`로 카드 상관)을 claude-stream이 **엔진중립 `orchestration_progress`**(`{id,status,phases,agents,summary}`)로 정규화(`src/shared/agent-events.ts` 단일정의). `task_*`/`workflow_*` 리터럴은 어댑터 내부에만. Workflow "launched" tool_result는 펌프가 suppress(`_orchestrationToolIds`)해 카드 오완료를 막고, 카드는 진행 이벤트로만 라이브 갱신·완료(+ done/error 백스톱).
- **채팅 인라인 서브에이전트(F-G)**: thread에 `{kind:'subagent', id}` 위치 마커를 두고, 데이터는 `state.subagents` 단일출처(렌더가 id로 조회). 단일(Conversation)·멀티(MultiWorkspace, 우측 패널 부재) 공통으로 Claude Code CLI식 인라인 표시. 상세(`SubAgentFullscreen`)는 id 라이브 조회(스냅샷 아님). 우측 패널은 완료 2초 뒤 hide(타이머는 컴포넌트 effect=reducer 순수성 보존), 할일은 다음 TodoWrite까지 유지.

**이유**: ① 사용자 실측 2증상(진행 실시간 미표시·워크플로 결과 맥락 미수신)의 근본원인이 Workflow의 한계가 아니라 **run-manager가 첫 done에 끊는 버그**임을 raw SDK 프로브(`artifacts/workflow-probe.mjs`, gitignore)로 규명 — 결과는 실제로 2번째 턴에 복귀함. ② "둘 다"로 Workflow(대규모 결정적 팬아웃)와 Task 서브에이전트(관측가능·결과복귀) 각각의 강점 활용. ③ 멀티 패널엔 우측 패널이 없어 서브에이전트가 안 보이던 갭을 채팅 인라인으로 해소(단일·멀티 일관).

**트레이드오프 / 신뢰경계**: ① 펌프 done 병합은 코어 변경이라 **비워크플로 회귀가 최대 위험** → plan-auditor 사전 승인 + 단일턴 회귀0 단정 + abort/throw/is_error 가드(루프밖 push는 try 내·catch 전 위치, `!_aborted && !signal.aborted` 가드, `_push`에 `_closed` 가드). ② ADR-003: 'task_*'/'workflow_*'/'Workflow'/'Task' 엔진 고유 리터럴은 claude-stream/ClaudeCodeBackend 어댑터 내부에만 — shared/reducer/컴포넌트는 중립 표현(status/phases/agents/'subagent')만. ③ 신뢰경계: 진행 메타(라벨/상태/토큰/resultPreview)만 표면화 — `task_notification.output_file` 등 파일경로/시크릿 미포함. fs/SDK는 main 단독. ④ thread `{kind:'subagent'}` 마커·orchestration 라이브 필드는 **snapshotForPersist 제외(휘발, kind==='msg'만 영속)**. ⑤ 원본 AgentCodeGUI 미존재(원본은 CLI stream-json·push 모델이라 done 보류 불요) → query()/pull 모델 적응의 ADR-013 예외.

**완료조건(측정가능)**: ① 단위 — 워크플로 2턴(result 2개)→done 1개·최종 usage 운반·맥락 텍스트 도달, 단일턴 회귀0, throw/is_error/abort 가드(`workflow-result-lifecycle.test.ts`). ② 단위 — task_* → orchestration_progress 정규화(dedup·phases·status), 펌프 launched tool_result suppress. ③ 단위 — reducer orchestration_progress 라이브 갱신·done/error 백스톱, subagent thread 마커 push·휘발. ④ 단위 — SubAgentInline 렌더·2초 hide·todos 유지. ⑤ 라이브(LIVE_SDK=1, `orchestration-live.e2e.ts`) — 실 Workflow 실행→결과가 메인 대화 마지막 메시지 도달 + 진행 라이브 + Task 서브에이전트 채팅 인라인. ⑥ typecheck node/web green + reviewer CRITICAL 0.

**현황(2026-06-26)**: 구현 완료 — F-A(O1 revert·`fcb5f90`)·F-B(`32e8f01`)·F-C(`8363c1a`+백스톱 `2dd526e`)·F-G/E/D/F(`b982c8b`)+e2e/가드. 전체 3417 단위 green·typecheck·build green. SDK Workflow 이벤트 ground truth 레퍼런스=`docs/ORCHESTRATION_FIX.md`. LIVE_SDK e2e + 사용자 `npm run dev` 사인오프 대기. (미push — 인간 게이트.)

### ADR-022: 앱 레벨 `/loop` — 클라이언트 인터셉트 + renderer 주도 재호출 ⭐
**결정**: `/loop` 슬래시 커맨드를 **SDK로 보내지 않고 renderer가 직접 반복**한다(앱 레벨). `/clear`·`/ask`(ADR-019 계열) 인터셉트 패턴을 확장 — `/loop [interval] <prompt>`를 클라이언트에서 가로채 활성 루프를 등록하고, 매 run 완료(busy→idle 전이)마다 내부 프롬프트를 기존 `sendMessage`/`session.send`로 재전송한다.

- **인터셉트(🔴#1)**: `Conversation.dispatchSend`·`MultiWorkspace.PanelView.handleSend` **최상단**(`commandOf`/`sendMessage` 진입 전)에서 `/loop`을 가로챔 → 평문 슬래시가 SDK로 새지 않음. `/loop stop`·`/loop off`도 동일 인터셉트.
- **순수 분리**: `parseLoopCommand`(interval/stop/invalid 분류)·`decideLoopTick`(안전 가드 판정)·`formatLoopInterval`을 `src/renderer/src/lib/loopCommand.ts`에 순수 함수로 추출(window.api/타이머 무관 → 단위 단언). 컴포넌트 effect는 얇은 와이어링만.
- **상태**: 단일 채팅 = `appStore.activeLoop`(StoreState 휘발 필드, reducer 밖) + `startLoop/tickLoop/stopLoop/dismissLoop`. 멀티 패널 = `PanelView` 컴포넌트 로컬 `useState`(panelReducer 미주입 — 순수성·패널 격리). 둘 다 영속 제외(snapshotForPersist/buildPersistState 미수집).
- **틱 스케줄**: busy→idle 전이에서 `decideLoopTick` 가드 통과 시 `setTimeout(intervalMs)` 후 다음 틱 재dispatch(타이머는 reducer 밖 컴포넌트 effect). 단일 채팅은 기존 큐 드레인과 **단일 effect로 통합 + 사용자 큐 우선순위**(🔴#2 경합 차단).
- **정지(🔴#3)**: abort·`/loop stop`·인디케이터 정지 버튼이 `activeLoop`를 null/stopped로 → 타이머 정리 effect가 `clearTimeout`(좀비 틱 차단). 단일 채팅은 `stopLoop()` 단일 액션 수렴, abort는 `set({queue:[], activeLoop:null})`.
- **안전 가드(Q4)**: `LOOP_MAX_TICKS=50` + `LOOP_MAX_DURATION_MS=30분` 이중 상한, 먼저 도달 쪽 자동 정지 + 인디케이터 알림. self-pace(interval 미지정) 기본 `LOOP_DEFAULT_INTERVAL_MS=5000`(런어웨이/정지 개입창 확보). 거대 interval은 `LOOP_MAX_INTERVAL_MS=6h` 클램프.

**이유**: ① 사용자 요구("나도 직접 쓰는 일이 많아서") — `/loop`이 팔레트엔 뜨지만 실제로 반복되지 않았음. ② raw SDK 프로브(`artifacts/loop-probe.mjs`, gitignore)로 근본원인 규명: SDK 네이티브 `/loop`은 `CronCreate`로 **세션 전용 크론**을 예약하는데, AgentDeck은 메시지마다 새 단발 `query()`를 띄우고 응답 후 세션 close(ADR-021 F-B 펌프) → 예약 크론이 세션과 함께 소멸 → **2번째 틱부터 영영 발동 안 함**(CLI는 인터랙티브 세션이 턴 사이 생존해 발동). ③ query()-per-message 구조에 자연 정합 — 각 틱이 일반 run이라 관측·중단 가능, 신규 IPC 0(기존 send 재사용), main/SDK 무변경.

**트레이드오프 / 신뢰경계**: ① 원본 AgentCodeGUI 미존재 확장(원본은 CLI 인터랙티브 세션이라 세션 크론이 동작) → query() 호스트 적응의 **ADR-013(스택 원본 일치) 예외** — 사용자 직접 결정(2026-06-26)으로 정당화. ② 신뢰경계: renderer 단독 — 신규 IPC 0, fs/Node/SDK 직접 호출 0, 시크릿 0, 타이머는 reducer 밖(컴포넌트 effect/스토어 액션)이라 reducer 순수성 보존. ③ ADR-003: `/loop`은 우리 앱 개념 — 엔진 고유 리터럴('Workflow'/'task_'/'Task'/CronCreate/SDK 옵션 형상) 미관여, 틱은 엔진중립 `sendMessage`/`session.send`로만. ④ 가동 중 `/loop stop` 타이핑은 비신뢰 경로(단일=큐 적재 후 다음 idle에 처리, 멀티=Enter가 abort로 분기) → **정지의 주 경로는 인디케이터 정지 버튼**(activeLoop 존재 시 상시 표시). ⑤ 단일 채팅 재마운트 시 `prevRunningRef` 재초기화로 직전 done 전이를 놓칠 위험 → Conversation 상시 마운트 전제로 수용(멀티는 패널 로컬이라 무관).

**완료조건(측정가능)**: ① 단위 — `parseLoopCommand`(interval 30s/5m/1h·self-pace 기본·stop/off·invalid·5x 흡수·9999h 클램프)·`decideLoopTick`(가드 경계·우선순위)·`formatLoopInterval`(`loop-command.test.ts` 29). ② 단위 — `activeLoop` 액션·정지 3경로 수렴·abort/clear 연동(`loop-store.test.ts` 14). ③ 단위 — 인디케이터 running/stopped·정지/닫기(`loop-indicator.test.tsx` 6). ④ 통합 — `/loop` 인터셉트로 SDK엔 내부 프롬프트만(`'/loop'` 누수 0)·`/loop stop` agentRun 0·첫 틱 카운트 1(`loop-intercept.test.tsx` 4). ⑤ 통합 — 멀티 패널 누수 0·인디케이터·패널 격리(`multi-loop.test.tsx` 4). ⑥ 라이브(LIVE_SDK=1, `loop-live.e2e.ts`) — `/loop 5s`로 **실제 2틱 이상 반복**(매 run 완료마다 재발사) + 정지 버튼으로 중단. ⑦ typecheck node/web green + reviewer CRITICAL 0.

**현황(2026-06-26)**: 구현 완료 — 단일(`99c06c7`)·멀티(`7ed45be`)·라이브 e2e+드라이버(`6081d02`). plan-auditor 설계 승인 + 5개 질문 확정 + 3개 🔴 반영, reviewer CRITICAL 위반 0. 전체 3477 단위 green·typecheck 양쪽. 라이브 e2e PASS(/loop 5s 2틱 반복 + 정지 실증, 33.7s). 드라이버=`docs/LOOP_SUPPORT.md`, 프로브=`artifacts/loop-probe.mjs`(gitignore). (미push — 인간 게이트.)

### ADR-023: 턴 간 맥락 복구 — `resume` (ADR-016 개정, REPL 전환 Phase 1) ⭐
**결정**: ADR-016(query()-per-message)을 개정해, 매 턴 새 단발 `query()`를 띄우되 **직전 엔진 세션을 `resume`으로 이어** 턴 간 대화 맥락을 유지한다. 장수 세션(REPL)이 아니라 **단발 호출 + 세션 resume**이다(REPL은 Phase 2, `docs/REPL_TRANSITION.md`).

- **근본 문제(실측)**: 현재 `_runPump`가 마지막 user 메시지만 prompt로 쓰고 `resume`/`sessionId` 미사용(init session_id "무시") → **턴2가 턴1을 기억 못 함**(`artifacts/context-probe.mjs`: 코드워드 BANANA42 망각). 렌더러가 full history를 보내도 백엔드가 마지막 1개만 쓰고 버림.
- **배선(엔진중립)**: ① claude-stream이 `system/init`의 `session_id`를 **중립 `session` AgentEvent**로 표면화 ② 렌더러(reducer `case 'session'`)가 `AppState.sessionId`에 저장(단일=appStore·멀티=panelSession 모두 `applyAgentEvent` 공유 → 자동 양립) ③ 다음 `agentRun`에 `resumeSessionId`(불투명 토큰) 전달 ④ ClaudeCodeBackend가 `req.resumeSessionId` → sdkOptions `resume`로 매핑.
- **방식 선택(실측 택1)**: `resume`(SDK가 세션 맥락 보유 — 토큰 재전송 0) 채택. full-history 재주입은 SDK 입력이 user 메시지만 스트림이라 assistant 턴 재생 불가 → 기각. `forkSession` 미지정(기본 false) → 같은 세션 계속(session_id 턴 간 안정, 프로브 확인).
- **범위(Phase 1)**: 인메모리 연속성(앱 실행 중). 대화 영속에 session_id 저장(재시작 후 resume)은 쉬운 후속. 미전달/빈 → 새 세션(기존 동작 회귀 0).

**이유**: ① 사용자 실측 지적 — "단발 입력이라 맥락 파악 못 하는 것 아니냐"가 사실로 확인됨(대화 메모리 부재가 가장 근본 갭). ② 원본 AgentCodeGUI는 CLI 인터랙티브 세션이라 맥락이 누적 → query()-per-message 무맥락은 호스트 적응의 *부산물*이지 충실도 아님. resume 복구 = **원본으로의 회귀**(ADR-013). ③ 단계적 접근(plan-auditor 강력 권고): 맥락 복구는 펌프 국소 변경이라 run-manager·waiter·세션수명·cron-turn 동시성 **무관** — 위험 작고 즉시 가치. 풀 REPL(장수 세션) 위험은 Phase 2로 격리.

**트레이드오프 / 신뢰경계**: ① ADR-003: `resume`/`forkSession`/SDK 옵션 형상은 ClaudeCodeBackend 어댑터 내부에만 — shared/reducer/renderer는 중립 표현(`sessionId`·`resumeSessionId`·`session` 이벤트)만. session_id는 **불투명 토큰**(엔진 고유 형상 아님)이라 중립 표면화 정합. ② 신뢰경계: `resumeSessionId`는 untrusted renderer 입력 → ipc/index.ts가 `typeof string && length>0` 정규화(임의 값 주입 차단). 시크릿 아님(세션 식별자) — 평문 로그/DB 노출 0. ③ 휘발: `sessionId`는 `snapshotForPersist`/`buildPersistState` 미포함(makeInitialState/clearConversation 리셋). ④ ADR-016 본문(SDK 채택·CLI 제거) 유효 — *호출 패턴*에 resume만 추가(supersede 아님).

**완료조건(측정가능)**: ① 단위 — claude-stream init(session_id)→session 이벤트(`claude-stream.golden`+2). ② 단위 — resumeSessionId→sdkOptions.resume·미전달 시 키 없음·session emit(`tests/agents/resume-session` 4). ③ 단위 — reducer session→sessionId·휘발 리셋·panelSession/appStore resumeSessionId 운반(`tests/renderer/resume-session` 7). ④ 단위 — AgentEvent exhaustive(session 케이스). ⑤ 라이브(LIVE_SDK=1, `context-live.e2e.ts`) — 실 앱 2턴 "BANANA42" 회상. ⑥ typecheck node/web green + reviewer CRITICAL 0 + 기존 회귀 0.

### ADR-024: 지속 세션(REPL) — self-re-arm 라이브 세션 + watchdog (내장 `/loop`·크론 자기제어) ✅채택·구현 (기본값 재고 2026-07-01 → 재재고 2026-07-03: replMode 기본 ON·AUTO 세션 수명)
> **상태: ✅ 채택·구현(사용자 GO 2026-06-26).** 백엔드 코어(0~2)·interrupt(3)·app-close(4a)·렌더러 UI(5) 빌드 + **기본 활성**(`replMode=true`), watchdog auto-revive(4b)는 드롭. 진행·근거=아래 본문 현황 + `docs/REPL_TRANSITION.md`. 라이브 e2e 최종 사인오프는 잔여. [원 제안 게이트(역사): "설계 합의 ≠ 구현 승인 — ADR 승인+TDD+go/no-go+`rearm-probe` 통과 후에만 빌드" → **모두 충족됨**(3턴 적대토론 `6f2a71d` 수렴 → 같은 날 GO).]

> ⚠️ **정정(2026-07-02, LR1)**: 본 재고의 동기였던 "held-open idle 증발로 대화 맥락 상실" 전제는 **메커니즘 오진**이었다. LR1 실측 결과 resume은 정상 작동하며, 영호 실불편의 실제 원인은 (1) 단일채팅 `CONVERSATION_SAVE` sessionId drop(→fa9df22), (2) 모델의 거짓 disclaimer(→ADR-029 (a) systemPrompt 안내)였다. replMode/held-open 전환은 영호 버그와 독립 → **LR2로 분리**. 상세=LR1 진단서 §7·§8.

**결정(제안)**: ADR-016/022/023을 확장해, **옵트인 플래그(`persistent` 모드, 대화별)**로 `query({prompt: AsyncIterable<SDKUserMessage>})` **1개를 열어두는 지속 세션**을 도입한다. 사용자 메시지는 새 `query()`가 아니라 **입력 스트림에 push**. 이 세션 안에서 Claude가 **내장 Cron 도구**(CronCreate/Update/Delete·ScheduleWakeup·Monitor)로 `/loop`·`/schedule`을 **자기제어**(루프 내용 갱신/스스로 종료) — 앱 레벨 `/loop`(ADR-022, 고정 프롬프트 재주입)의 핵심 한계를 메운다.

- **1차(self-re-arm)**: 세션-스코프 크론이 짧은 안전간격(~4분) **자기재무장**으로 idle 타임아웃을 이기고 세션을 스스로 살림. `ScheduleWakeup` 자기재무장 + `Monitor` 이벤트 즉시 깨우기. 루프 상태가 **세션 내 보존**.
- **2차(watchdog)**: main이 **실제 세션 사망**(크래시/연결단절)만 감지 → `resume`(ADR-023 디스크 세션) 재개 + 크론 재예약. **"진짜 죽음에만 1회 발동"으로 엄격 격하**(정상 idle 만료 vs 이상 사망 구별 필수 — 안 하면 좀비 오토리바이브 버그).
- **폴백**: 비-`persistent` 대화 = 기존 query()-per-message + `resume`(ADR-023) + 앱 레벨 `/loop`(ADR-022) 안전망. **GUI 토글**로 모드 노출, `LoopIndicator`(ADR-022) 재활용해 내장 크론 상태(`session_crons`) 표시.

**이유**: ① 사용자 실측 + 3턴 적대 검토(Opus) — 내장 `/loop`은 "주기마다 cron이 루프 프롬프트를 입력란에 자동 삽입 → 정상 응답"(타이머 주입 **정상 턴**, read-only 아님). 앱 레벨은 Claude가 루프를 못 바꿔 자율 반복의 핵심 결핍. ② **코드 확정(추측 아님)**: `Monitor`/`ScheduleWakeup`/`Cron`이 헤드리스 SDK 1급 도구 실재(`sdk-tools.d.ts:39-45`), 크론=세션스코프(`sdk.d.ts:6212` "wake this session"), streaming-input=설계된 held-open(`sdk.d.ts:2186-2243`). ③ 외부 타이머 재생성(앱 레벨) 안은 **매 재생성마다 Claude가 세운 크론 상태가 증발** → 자기제어 끊김. self-re-arm 라이브 세션은 보존. ④ 원본 AgentCodeGUI는 CLI 인터랙티브(REPL) → 지속 세션 = **원본으로의 회귀**(ADR-013).

**트레이드오프 / 신뢰경계**: ① ADR-003: `streamInput`/`SDKUserMessage`/query 형상·Cron 도구명·`session_crons` 리터럴은 ClaudeCodeBackend/claude-stream **어댑터 내부에만** — shared/reducer/renderer는 중립(`persistent`·`sessionKey`·`cron-turn`). ② 신뢰경계: 세션·SDK·타이머·watchdog 전부 **main 단독**, renderer는 IPC push만, 시크릿 0. ③ 🔴 **회귀(최대 위험)**: `agent-runs.ts:126` done→delete는 단발 가정 — **옵트인 플래그로 두 번째 라이프사이클 분기(done≠delete, sessionKey 장수 채널) 격리**(178줄 단일파일, 단발 경로 3494 테스트 무영향). ④ 🔴 cron-turn = **세션 모드 상속 정상 턴**(권한 정상) — `pending-send` 카운터 + SDK origin 신호로 유저턴/cron턴 구별 + 턴 직렬화 큐. ⑤ 🔴 abort 분리: `interrupt()`(현재 턴) vs `closeSession()`(세션 종료) — 전 어댑터(Echo/Codex 포함) + IPC 분기. ⑥ 🔴 app-close: `before-quit` `preventDefault()`+`await closeAll()`+타임아웃(좀비=프로세스 핸들 0 측정). ⑦ 🟡 멀티: **lazy**(활성 패널만 REPL). ⑧ ADR 관계: ADR-016 본문(SDK 채택) 유효 — 호출 패턴에 지속 세션 모드 *추가*. ADR-022=비-persistent 폴백으로 잔존(엔진 유지·GUI 재활용). ADR-023=watchdog 복구 + 비-persistent 맥락의 토대.

**완료조건(측정가능)**: ① **게이트 프로브(구현 선행)** — `rearm-probe`: 3분 cron이 헤드리스 세션을 **20분/≥5회 끊김없이 self-re-arm**(✅ **PASSED: fire 8회/21분 균일(~180s)·무사망**, 동일 session_id). `Monitor` 헤드리스 즉시 fire + turn-origin(user vs cron) 구별 + watchdog 음성검증(정상 close→미발동·kill→1회)은 `origin-probe`/`watchdog-probe` **추가 선행**(plan-auditor 교정 — 단계 (3)/(4) 게이트). ② 단위(옵트인 격리) — PersistentSession push→turn 시퀀스·cron-turn 시뮬·pending-send 라우팅·abort 2분기·done≠delete 세션모델, **단발 경로 회귀 0**(3494 유지). ③ 라이브(LIVE_SDK=1) — persistent 대화 내장 `/loop` 크론 **자율 발동** + Claude가 `CronUpdate/Delete`로 루프 **자기제어** + watchdog kill 복구. ④ typecheck node/web green + reviewer CRITICAL 0.

**현황(2026-06-26)**: ✅ **승인(사용자 GO) — 백엔드 코어 (0)~(2) 구현 완료**(커밋 `303eab4`·`4caa820`·`5b6c038`, TDD+reviewer, 단발 회귀 0·전체 3512 green). 게이트 프로브 3종 양성(origin: SDK 신호 부재→호스트 pending-send / watchdog: throw vs clean-return 구별 확정). (3)cron-turn 라우팅·interrupt IPC / (4)watchdog auto-revive(좀비 리스크)·app-close / (5)렌더러 UI(**사인오프 필요**)는 잔여 — 진행 현황 `docs/REPL_TRANSITION.md` §게이트 프로브. self-re-arm 게이트 ① PASSED(8회/21분, `6f2a71d` 수렴). plan-auditor 최종 감사 반영: **순서 교정**(펌프 turn-done emit이 run-manager 분기에 선행 — done은 현 펌프상 루프밖 1회만, held-open은 turn 경계 emit 필요)·**누락 보강**(app-close closeAll·currentRunId 세션스코프 재정의·AgentEvent turn-경계/origin 필드)·기준선 ~3551. (3)origin/(4)watchdog는 추가 프로브 선행. 빌드 순서·진행 단일 진실원=`docs/REPL_TRANSITION.md`. (미push — 인간 게이트.)

**갱신(2026-06-26) — (4) 분리·확정**: 사용자 결정으로 (4)를 둘로 갈라 마감.
- **(4a) app-close closeAll ✅ 구현**: `before-quit` → `disposeAllRuns()` → `RunManager.closeAll()`(활성 run 전부 abort → 세션스코프 크론 동반 사망, 좀비 0). 위 트레이드오프 ⑥의 `preventDefault()`+`await`+타임아웃은 **불요로 단순화** — ADR-016 in-process SDK라 `abortController.abort()` 동기 신호로 충분(앱 프로세스 종료가 잔여 핸들 회수). TDD closeAll(3) + reviewer CRITICAL 0.
- **(4b) watchdog auto-revive ❌ 드롭(사용자 결정)**: "끄면 죽어야 한다 — 끈 뒤에도 도는 건 버그." 맥락 복원은 **자동 부활이 아니라 다음 프롬프트의 resume**(session_id 영속 `773285c`/`bab1e2f`, 이미 빌드)이 담당. 좀비 오토리바이브 리스크 회피 + 사용자 통제 모델 채택 → 2차 watchdog(199행·트레이드오프 ⑥의 자동 재개 부분)은 **빌드하지 않음**. ADR-023 resume은 다음-프롬프트 복원 토대로 잔존(자동 재개 트리거만 제거).

**현황(2026-06-26)**: 구현 완료(`81255d8`). 실측 프로브(`artifacts/resume-probe.mjs`: 턴2 회상·session_id 동일) → TDD 13 신규 + exhaustive → 전체 3489 단위 green·typecheck 양쪽 → 라이브 PASS(턴2 "I'll remember the codeword BANANA42", 9.1s). Phase 2(풀 REPL+내장 /loop·`/schedule`)는 `docs/REPL_TRANSITION.md` §9 — idle 프로브 + ADR-022 충돌 결정 후 별도 go/no-go. (미push — 인간 게이트.)

**재고(2026-07-01) — 세션 기본값 전환: held-open REPL → resume (BF1 P05)**: 영호 실사용 불편(30분~24시간 자리비움 후 "새 대화처럼 맥락 끊김")의 원인을 **PC 종료/절전 → held-open 프로세스 증발**로 확정(idle 아님 — `bf1_idle_probe.mjs`: 순수 SDK held-open이 7분 idle 견딤, threw 0·turn2 정상). 1차 self-re-arm(198행)은 idle 만료를 이기려는 장치라 **프로세스째 사라지는 PC 종료엔 원리적으로 무력**. → **기본 세션 방식을 resume(ADR-023 디스크 세션 영속)으로 전환**하고, **held-open은 빌트인 자율 루프(/loop·/goal 자기제어)가 필요한 대화만 옵트인**으로 격하한다.
- **(4b)의 논리적 완결**: (4b)에서 이미 "맥락 복원 = 다음 프롬프트의 resume"로 복원 책임을 resume에 넘겼다. PC 종료 앞에서 held-open의 "세션 유지" 전제가 깨지면 남는 처방은 resume뿐 — 방향 전환이 아니라 (4b)의 귀결.
- **바뀌는 것 = 기본값뿐**: interrupt(3)·app-close(4a)·self-re-arm 메커니즘·GUI 토글·held-open 코드는 유효·잔존. `replMode` 활성 default만 held-open→resume으로 뒤집는다(코드 삭제 아님). loop은 빌트인 `/goal`·`/loop` + GUI 시각화(P04 결정문 §B 결정2).
- **코드 영향(별도 구현 마일스톤)**: `replMode` 기본값 true→false(renderer/ipc 활성화 층) · resume 경로 기본화 · held-open 옵트인 토글 유지 · **정확한 resume 버그 검증 1순위**(session_id snapshot 영속이 `panelSession.ts:256·217`에 설계돼 있으나 PC 종료 후 실작동 X — 후보 ①snapshot flush 타이밍 ②held-open 경로 resumeSessionId 미사용).
- **근거**: `01.Phases/BF1-interrupt-loop/_loop-session-decision.md`(P04 확정) + `01.Phases/BF1-interrupt-loop/_adr-024-rethink-draft.md`(P05).

**재재고(2026-07-03) — AUTO: 세션 수명 = 활동의 파생 (LR3 P01~P02, 영호 GO)**: 직전 flip(218~221행)이 세운 **"기본=resume(단발) / held-open=옵트인" 모드 플래그 양자택일**을, **"세션 수명 = 활동의 파생(AUTO)"** 이라는 제3의 답으로 대체한다. `replMode`를 **기본 ON으로 복귀**(flip의 false 기본 취소)하되, 세션 방식을 *저장된 플래그*로 정하지 않는다 — 모든 턴을 held-open으로 시작하고, 턴 경계(done 직후)에서 **"살아있을 이유"**(미소비 pending user turn `pendingSends>0` **또는** 활성 루프=크론 등록·armed wakeup, `CronTracker.hasActivity()`)가 없으면 입력 스트림을 스스로 정상 종료한다. 닫힌 세션의 다음 턴은 기존 `persistent+sessionKey+resumeSessionId` 경로로 miss → 새 held-open이 resume으로 맥락 복원(신규 IPC 0, §3-① 백스톱 재사용).
- **정면 반박 3단(P01 실측)**: **① resume 백스톱은 옵트인·AUTO에 중립** — flip의 "맥락은 resume이 지킨다"는 P01-(a)로 재확인(OFF 단발 턴→앱 재시작→코드워드 `BANANA77SC` 회상 56.7s)됐으나, 이는 "평소 held-open을 꺼두라"의 논거가 못 된다. AUTO도 idle-close된 세션을 resumeSessionId로 복원(IC4 계약)해 동일 백스톱을 쓴다. **② 상주 비용은 실측상 무시 수준** — P01-(d) 첫 이벤트 지연: persistent 신규 기동 **1223ms** / persistent 재수립+resume **1239ms** / 단발+resume **1251ms** — 차이 **±30ms**. "일단 열어두는" 비용이 순수 resume과 구별 불가 → 상주 비용은 활동 있을 때만 발생하는 스코프형이지 상시 부담이 아니다. PC 종료 무력함은 AUTO에서도 동일(그 순간 resume 복원)이라 옵트인이 줄여주는 위험이 아니다. **③ 옵트인=승격(promotion) 타이밍 문제, AUTO=강등(demotion)** — P01-(c): 자연어 루프 요청 **3/3** 모두 모델이 `/loop` Skill을 자기 선택(가이드 없이)했는데 발동이 첫 메시지 *이후*라 옵트인 스위치엔 레이스가 생긴다. P01-(b): OFF 토글+새 대화 전환 후에도 옛 held-open 크론이 **150초간 3회 잔존 발화**(runId 이벤트 13→23) = "켠 채 잊음" 위험 실측. AUTO는 "언제 끌지"를 정보가 다 모인 턴 경계(크론 등록·wakeup armed·pending turn 확정)에 판정해 이 딜레마를 소멸시킨다.
- **남는 순가치 = 자율 루프 그 자체**(Claude가 세션 안에서 CronCreate/ScheduleWakeup으로 루프를 자기제어하는 자율성, 원 논거 ③). **트레이드오프**: idle-close 판정이 🔴 `claudeAgentRun.ts`(ADR-024 최대위험 구역 인접)에 들어가 회귀 표면이 옵트인 모델보다 넓다 — `agent-runs.ts` **0줄 변경**(스트림 자연종료 위임, LR2-04 미러) 전략으로 억제. "상주가 의도된 정상"이라는 정신모델 전환은 **가시화(배너·표시등 P04·P06) 필수**(비가시 상주는 P01-(b) 불신 재발). flip이 옳았던 부분(resume이 주경로·interrupt/app-close/self-re-arm 유효·loop=빌트인 `/goal`·`/loop`+GUI)은 AUTO에서도 유지 — 바뀌는 것은 오직 "세션 수명을 무엇으로 결정하는가"(저장된 플래그 → 턴 경계 활동 파생).
- **구현**: `02.Source/main/01_agents/claudeAgentRun.ts` `_runPersistentPump` 턴 경계 idle-close + `eventNormalizer.ts` `hasLoopActivity()` 공개 접근자. 펌프 계약 테스트 8건 + `agent-runs.ts` diff 0(git 실측)으로 고정, 전체 게이트 green.
- **근거**: `01.Phases/LR3-loop-ux/_probe-findings.md`(P01 실측) + `01.Phases/LR3-loop-ux/_adr-024-rerethink-draft.md`(P02).

### ADR-025: 하네스 보강 (ClaudeDev 참고) — CHANGELOG · advisory 훅 · /refactor-sweep · phase-gate · work-judge 3버킷 ⭐

**결정**: AgentDeck Agent Harness를 `C:\Dev\ClaudeDev` 하네스 참고로 보강(2026-06-26, 사용자 인가 — `.claude/**` deny 일시 해제 후 직접 적용). 심층감사·드라이버=`docs/HARNESS_GAP.md`(UltraCode 워크플로 4 병렬감사 + 합성).

- **가져옴**: ① `.claude/CHANGELOG.md` — 헌법/ADR/하네스/공유계약 변경 박제(compact·세션 경계에서 옛 결정 기반 사고 방지, 솔로+AI 적응). ② advisory 훅 3종(`scripts/hooks/`) — `risk-detector`(Edit/Write 시 4깃발 자동검출) · `reviewer-auto-trigger`(경계/계약 파일 변경 시 reviewer 권장) · `phase-gate-validator`(완료보고 5단계 점검). **전부 exit0 advisory**(차단 아님). ③ `/refactor-sweep` 커맨드 — 무인 자동 리팩토링(TS 적응, G1~G9 안전가드, 신뢰경계/ADR-003 영구제외, push 금지, 전용브랜치 atomic). ④ work-judge 3버킷(기계 자동게이트 / 육안 사용자트랙 / 비가역 사람게이트) → `_routing.md`에 명문화.
- **스킵(솔로+AI 부적합)**: 별도 `.claude/policies/` 파일군 — `_routing.md`가 이미 등급/깃발/라우팅/review-tiering/권한경계를 **단일정의** → 별도 파일은 중복·분산. knowledge-gc(MEMORY.md auto-memory가 대체 + self-reinforcement 위험) · 팀 namespace(솔로) · `/engine:goal` 루프드라이버(내장 /loop 활용이 1순위) · `/cross-review`(Codex 듀얼백엔드는 Track 2 미착수).

**이유**: ClaudeDev=다인 팀, AgentDeck=솔로+AI → 팀 운영 기능은 적응/스킵. 하네스가 강해지면 후속 정리·리팩토링이 안전·빠름(refactor-sweep·게이트·자동 깃발). CHANGELOG는 compact 빈발 환경에서 결정 기억의 단일원.

**트레이드오프 / 불변**: ① 훅은 **advisory(exit0) 선행** — 잘못된 차단(exit2)은 전 도구 호출 마비 위험 → 안정 후 승격 검토. ② 하네스(`.claude/**`) 변경=사용자 단독 통제 — 보강은 deny 일시 해제(인가) 후 적용, 작업 후 **deny 복원**. ③ refactor-sweep = 신뢰경계·ADR-003 영구제외(G7) + push/배포 인간 게이트(G4). ④ **정책 단일정의**: 등급/깃발/라우팅은 `_routing.md` 단일원 유지(별도 파일 분산 금지 — H5 별도파일 스킵 근거).

**위험도**: [L] — 전부 추가만(기존 결정·헌법/ADR 본문 수정 0).

**현황(2026-06-26)**: H1(CHANGELOG·risk-detector·reviewer-auto-trigger ✅) + H2(`/refactor-sweep` ✅) + H4(phase-gate-validator ✅) + H6(work-judge 3버킷 ✅) 적용. `.claude/settings.json` 훅 6종 등록. H11(본 ADR) 박제. (미push — 인간 게이트.)

> **개정(2026-06-27, ADR-026)**: 본 ADR의 *"policies 별도 파일 스킵(H5)"* 결정은 **ADR-026(정식 이식)이 개정** — `.claude/policies/` 10개 신설(헌법 슬림 350임계 + INDEX 카탈로그, `_routing`은 빠른 매핑으로 역할 분담). 나머지(CHANGELOG·advisory 훅·refactor-sweep·work-judge 3버킷·knowledge/engine:goal/cross-review 스킵)는 ADR-026이 **계승·확장**.

---

### ADR-026: 하네스 정식 이식 (ClaudeDev → AgentDeck) — ADR-025 부분 보강을 정식 포트로 확장 ⭐

**결정**: ClaudeDev 하네스를 *정식 이식*. 단일 진실원 = `docs/HARNESS_PORT_MANIFEST.md`(2026-06-26, ClaudeDev 세션이 외부 무편향 시점에서 작성). 자기편향 진단 `HARNESS_GAP.md`(AgentDeck 세션이 자기진단해 스킵 합리화)를 supersede. **2층 분리**: 프로세스 골격(A)=ClaudeDev 통째 이식·폴더명만 적응 / 도메인 살(B)=AgentDeck 문서에서 재유도(복붙 금지=누더기 제거).

- **`.claude/policies/` 10개 신설** (ADR-025 H5 "스킵" **개정**): reporting-format·pin-and-done·doc-thresholds·grade-and-risk·subagent-routing·review-tiering·pr-and-merge-gate·loop-driver·work-judge·review-throughput + INDEX. 헌법(`CLAUDE.md`)은 절대규칙+진입점만(350임계), 운영 정책은 외부화. `_routing.md`=*빠른 매핑*, policies=*상세 정책* 역할 분담.
- **훅 8종**(`scripts/hooks/`): 기존 6 + `pin-injector`(work-pin 주입)·`convention-size-guard`(God class 800줄). `shared-discipline-guard`는 별도 파일 X — `risk-detector`의 `shared-contract` 깃발이 흡수(중복 제거).
- **위험 깃발**: trust-boundary·**backend-contract**(AgentBackend/AgentEvent=전 어댑터)·**shared-contract**(IPC 계약 단일정의)·irreversible·**ui-visual**(renderer 시각)·harness.
- **Phase 정의 시스템**: `/work:plan`(목표→Phase 분해→`phases/M{N}-{slug}/`→work-pin 시드→plan-auditor) + 템플릿(done-md·pin·phase). `scripts/execute.py` **폐기**(ADR-011 미채택 정합) → work:plan + 세션/루프.
- **커맨드**: session/{start,end,review}(세션 2종)·harness-review·_escalation 신규. `/harness`는 work:plan 코어로 정합.
- **솔로 정합**(manifest §5.5): 팀 언어 제거(본인+미래 합류자), CODEOWNERS admin-bypass 휴면 배너(GO 게이트 유효), unity-bridge N/A.
- **곁다리 정리**(영호 직접 지시, C-동결 해제): `phases/` 37개 이력 삭제(이제 work:plan이 생성) · `UI_GUIDE`+`UI_FIDELITY`→`docs/UI.md`(현 src/renderer 실측 Clay HEX) · docs 드리프트 정정(sqlite→JSON·UI/execute 경로) · baseline 경로버그(CustomGUI_Agent→AgentDeck) 수정.

**스킵(D 확정)**: knowledge 캐시·GC(MEMORY.md auto-memory 대체 + self-reinforcement 위험) · `/engine:goal`(내장 `/loop`+Workflow) · `/cross-review`(Codex 듀얼백엔드 Track2 후 defer) · setup 커맨드/setup-steps(AgentDeck 이미 하네스 — 부트스트랩 불필요).

**이유**: ADR-025는 HARNESS_GAP(자기진단=자기편향)을 근거로 policies를 스킵했으나, 외부 재결정(manifest)이 "헌법 슬림 + 정책 카탈로그가 더 체계적"으로 바로잡음. 누더기 패치 → 정식 골격 + 도메인 재유도로 다음 세션 맥락충돌 방지.

**트레이드오프 / 불변**: ① policies 신설 vs _routing 단일정의(ADR-025): 파일 분산 위험 ↔ 헌법 슬림+카탈로그 체계 → 후자. ② 훅 advisory 유지(차단=dangerous-cmd·tdd만). ③ 하네스(`.claude/**`) 변경=사용자 단독 통제, PR/push=ask 게이트 불변. ④ ADR-011·014·025 본문 보존(역사) + superseded/개정 표기.

**위험도**: [H] — ADR-025 "policies 스킵" 결정 개정 포함.

**현황(2026-06-27)**: P0~P4 완료(브랜치 `chore/harness-port`). 회귀 게이트 green(typecheck + test 3619 PASS) · 깨진 링크 0 · baseline 7→0. (미push — 인간 게이트.)

---

### ADR-027: 디렉토리 번호접두 컨벤션 (`NN_name`) — 큰 분류 시각적 순서화

**결정**: 일부 디렉토리의 *하위 폴더*에 `NN_<name>` 언더바 번호접두를 도입한다 (구분자=`_`, 번호=촘촘 `00,01,02…`, 정렬=**논리/데이터흐름 순**). 적용 범위:

| 범위 | 예시 (논리 순) |
|---|---|
| `src/renderer/src/components/` | `00_shell`·`01_conversation`·`02_file`·`03_viewer`·`04_git`·`05_agent`·`06_feedback` (+ `common` 무번호) |
| `src/main/` 내부 모듈 | `00_ipc`·`01_agents`·`02_fs`·`03_lsp`·`04_persistence`·`05_window` |
| `docs/` | `00_PRD`·`01_ARCHITECTURE`·`02_ADR`·`03_UI`·`04_FEATURE_MAP`·… (읽기 순) |

- **❌ 제외**: 최상위 `src/{main,preload,renderer,shared}` — electron-vite 진입점(`electron.vite.config.ts`)·`@shared`/`@renderer` alias 고정 + 헌법 "최상위 폴더 추가=ADR". 번호접두 대상 아님.
- **구분자 `_` 선택**: 점(`.`)은 일부 도구가 확장자로 오인할 여지, 하이픈(`-`)도 가능하나 언더바가 식별자 친화적 + import 경로 무탈.

**이유**: 파일시스템 알파벳 정렬은 *논리적 순서*(데이터 흐름·중요도)와 어긋남 → 번호접두로 "어디부터 보나"를 파일시스템이 답하게 함(온보딩·탐색 비용↓). 관련 파일을 도메인 카테고리로 묶어 응집도↑. 영호 요청(큰 분류 `00_`·`01_` 순서화).

**트레이드오프 / 불변**:
- (단점) rename 시 import 경로 churn 1회 + 카테고리 *삽입* 시 뒤 번호 재정렬(촘촘 선택의 비용). → `git mv`(히스토리 보존) + 일괄 갱신으로 흡수.
- (불변) agent R/W 글롭 `src/main/**`·`src/renderer/**`는 `/**`라 하위 rename에 **안 깨짐**. electron-vite alias·신뢰 경계(ADR 신뢰경계)·IPC 계약 단일정의 불변.
- (⚠️ 주의 — 글롭 ≠ 리터럴) `scripts/hooks/risk-detector.sh`의 `*src/main/ipc/*` 같은 **리터럴**은 rename 시 깨져 trust-boundary 검출이 침묵 → 해당 Phase(RF1 P07)에서 hook 패턴 동반 갱신(`scripts/hooks/**`=영호 단독 확정). 같은 함정: shared-contract `*src/shared/ipc-contract*`(P09).

**위험도**: [M] — 구조 컨벤션(행동 변경 동반, 기존 결정 불변).

**현황(2026-06-27)**: ✅ **결정 확정(영호 GO)** — 구분자 `_`·촘촘·논리순. 구현은 RF1-cleanup 트랙 B(P05 매핑 → P06 components → P07 src/main → P08 docs). 미구현(컨벤션만 박제).

---

### ADR-028: 루트 디렉토리 재구성 — 번호접두 *최상위* 카테고리 (`00.Documents`·`01.Phases`·`02.Source`·`99.Others`)

**결정**: 레포 루트의 콘텐츠 폴더를 번호접두 카테고리 4개로 묶는다 (ADR-027의 "번호접두 시각순서" 철학을 *최상위*로 확장). 구분자=`.`(점), 정렬=논리/중요도 순.

| 옛 경로 | 새 경로 | 비고 |
|---|---|---|
| `docs/` | `00.Documents/` | 하네스 brain (PRD·ARCHITECTURE·ADR·UI…) |
| `phases/` | `01.Phases/` | `/work:plan` Phase 정의 |
| `src/` | `02.Source/` | 앱 소스 (`main`·`preload`·`renderer`·`shared` 내부 이름 불변) |
| `tests/` · `scripts/` · `out/` | `99.Others/{tests,scripts,out}/` | 테스트·빌드보조·산출물 |

- **ADR-027 제외규칙의 *상위 적용***: ADR-027은 "최상위 `src/{main,preload,renderer,shared}`는 번호접두 *제외*"라 했다. 본 ADR은 그 상위인 `src/` 컨테이너 자체를 `02.Source/`로 옮길 뿐, 내부 4폴더 이름은 불변. electron-vite 진입점·`@shared`/`@renderer` alias는 *타깃 경로*만 갱신(`src/`→`02.Source/`).
- **구분자 `.`(점) 선택**: ADR-027 하위폴더는 `_`(언더바)였으나 최상위는 `.`으로 시각 구분 강화(영호 선택). 경로 세그먼트 *중간*의 점은 확장자가 아니므로 모듈 해석 무탈.

**이유**: 루트를 열었을 때 "문서 → Phase → 소스 → 기타" 순으로 파일시스템이 답하게 함(탐색·온보딩 비용↓). 영호 직접 폴더 정리.

**트레이드오프 / 불변**:
- (⚠️ 큰 단점 — 생태계 마찰) `src/`는 JS/Electron 사실상 표준 관례. `02.Source/`는 모든 도구·예제·신규 기여자의 기본 가정과 *영구적으로* 어긋난다(신규 도구 도입·온보딩 시 반복 마찰). 정리정돈의 시각적 명료성 ↔ 도구 생태계 영구 마찰의 교환 — 영호 단독 결정으로 수용.
- (이동 비용) 테스트→소스 상대 import **1192곳** 깊이보정(`../../src`→`../../../02.Source`) + cwd기준 소스-읽기 10곳 + config 8개(electron.vite·tsconfig[node/web]·vitest·playwright·package.json·eslint·gitignore) 배선.
- (⚠️ hook 리터럴 함정 — ADR-027 재확인) `risk-detector`·`tdd-guard`·`convention-size-guard`·`reviewer-auto-trigger`의 `*src/*` glob·`$PROJ/tests` lookup은 rename에 안 안전 → 동반 갱신(`.claude/hooks/**`=영호 단독, 수동 승인 하 적용). `tdd-guard` 테스트 lookup·`reviewer-auto-trigger` 경계glob 2건은 에이전트 자동매핑이 놓쳐 직접 정독으로 포착.
- (불변) `@shared`/`@renderer` alias = *타깃 경로*만 갱신, 별칭명 불변 → 소스 내부 import 무변경. 신뢰 경계·IPC 단일정의·엔진 추상화(ADR-003) 불변. 빌드 산출물 `out/`은 루트 유지(electron-vite 기본값 — gitignore 재생성물이라 카테고리화 실익 < 도구 마찰).

**위험도**: [M] — 구조 재배치(빌드·하네스 경로 동반, 기존 결정/거동 불변).

**현황(2026-06-30)**: ✅ **영호 직접 폴더 이동 + AI 배선**. 브랜치 `feature/rf1-trackC`. 검증: typecheck green / vitest **3619 통과(거동 불변, 기준선 일치)** / electron-vite build 3타깃 green. 분할 커밋(빌드배선 → hook기능 → 하네스docs → 본 ADR). 역사적 기록(기존 ADR 항목·`.claude/CHANGELOG.md`)은 옛 `src/`/`docs/` 경로를 *그대로 보존* — 본 ADR이 옛→새 매핑을 제공.

---

### ADR-029: 대화 기억 신뢰성 — resume 우선 + transcript 폴백 (모델 컨텍스트 ↔ 채팅 기록 분리) ⭐

**결정**: ADR-023(resume)을 보강 — `resumeSessionId`가 없을 때 최근 대화 transcript를 **모델 컨텍스트 창 예산 안에서** Claude prompt에 폴백 주입한다. resume(sessionId)을 **주수단**(서버측 세션·재전송0·ADR-013 충실)으로 유지하되, sessionId 없는 옛 대화·resume 실패 시 앱이 저장된 채팅 기록으로 맥락을 재구성한다. **모델 컨텍스트(모델에 실제 전달, 창으로 유계) ↔ 채팅 기록(전체 저장·표시, 무한 증가)을 분리**한다.

- **근본 문제(3소스 검증: 적대 코드-트레이스·계획 정독·Codex)**: `claudeAgentRun.ts:379`가 매 턴 마지막 user 메시지만 SDK에 보냄 → 모델 맥락 = **resume 단독 의존, transcript 폴백 전무**. sessionId 없는 옛 대화(fa9df22 이전)·cwd 불일치·세션 만료 시 조용한 기억상실("화면엔 보이는데 Claude가 기억 못 함"). 영호 실측 불편의 구조적 원인. (직접 원인인 단일채팅 sessionId 저장 누락은 `fa9df22`로 선수정.)
- **접근 = A(resume 주수단, 영호 확정)**: sessionId 있으면 resume(서버가 창 자동관리·압축). resume 자체는 서버가 관리하므로 클라이언트가 %로 제어 불가 — 우리가 양을 제어하는 건 폴백뿐. B안(앱이 항상 컨텍스트 소유)은 gap 소멸되나 매턴 재전송·충실도 이탈로 기각.
- **주입 범위 = 컨텍스트 창 기준(영호 정제)**: 고정 상수(8k) 아니라 모델별 창 크기 − 응답·시스템 여유분. 오래된 것부터 잘림(오버플로 불가). 기존 게이지(`lastContextWindow`) 인프라 재활용 + 사용자에게 모델 컨텍스트 % 가시화(배지).
- **위치**: main `claudeAgentRun` 어댑터 국소(history 이미 `_req.messages`에 옴 → **새 IPC 0**). 순수 함수 `buildModelContextPrompt`로 추출(단발·held-open 양 펌프 공용). 엔진별 prompt 포맷 상이 → 폴백도 어댑터 소유(Track2 Codex 각자).

**이유**: ① GUI 채팅 앱은 "화면에 보이면 기억한다"가 기본 기대 — resume-only는 말없이 깸. ② `fa9df22`(sessionId 저장)는 신규 대화만 구제, 옛 대화·resume 실패엔 안전망 없음(Codex 핵심 지적). ③ history가 이미 main에 있어 구현·비용 작음(새 IPC 0, 추가 LLM 0).

**트레이드오프 / 신뢰경계**: ① **ADR-013 순수 충실서 의도적 이탈** — 본가 CLI엔 없는 폴백. AgentDeck 확장(Zustand·JSON 영속 계열). ADR-023 resume은 주경로로 유지, 본 ADR이 폴백 보강(supersede 아님). ② ADR-003: prompt 포맷은 어댑터 자유(정규화는 AgentEvent *출력*, 입력 prompt는 어댑터 내부) — 폴백 국소 정합. ③ 신뢰경계: history는 renderer가 이미 보낸 messages(untrusted) → 폴백은 **user/assistant content만** 주입(시크릿·경로 주입 0, ADR-008). main 단독, 새 IPC 0. ④ **known-gap**: resume "성공했으나 빈 세션"(만료·cwd불일치)은 트리거(sessionId 유무)로 못 잡음 → cwd 안정화(LR1 Phase03)로 우선 방어, 완전해결 이연("sessionId 있음 ≠ 맥락 복원"). ⑤ 기각 대안: 고정8k(창 못 씀)·전체주입(오버플로)·B안(앱 소유)·요약(추가 LLM·후속 이월).

**완료조건(측정가능)**: ① 단위 — `buildModelContextPrompt` 골든(resumeSessionId 있음→마지막 메시지만·없음→프리앰블·창예산 초과 시 오래된 것 잘림·user/assistant만·degrade 경계). ② 양 펌프(`_runPump`·`_runPersistentPump`) 공용 헬퍼 경유 = 단발/held-open 대칭. ③ 라이브(LIVE_SDK) — sessionId 없는 대화 폴백 회상 + **멀티패널 resume 회귀 0**(공용 헬퍼 변경 방어). ④ typecheck·test green·lint 0 + reviewer(backend-contract) CRITICAL 0.

**위험도**: [M] — 어댑터 prompt 빌드 변경(전 Claude 경로 영향) — 단발/held-open 대칭 + 회귀 e2e로 방어.

**후속 (2026-07-02, 라이브 실측):** resumeSessionId 저장(fa9df22)·resume 배선까지 정상임을 디스크 포렌식(`60c6aef2.jsonl` — 재시작 전 메시지가 압축 없이 컨텍스트에 존재)과 격리 e2e probe(재시작 후 코드네임 직접회상, memory 파일 배제)로 확정. ⇒ **핵심 영속/resume 버그는 이미 닫혔고**, 영호 실측 "기억 못 함"의 잔여는 **모델의 거짓 disclaimer**(맥락이 있는데도 메타질문 "이전 대화 기억해?"에 "과거 대화 기억 못 한다"고 답하는 학습된 반사)였다. 두 대응:
- **(a) `MEMORY_CONTINUITY_GUIDE`** (본 ADR-029의 연장) — resumeSessionId 있을 때만 systemPrompt.append에 "보이는 이전 메시지는 이 사용자와의 실제 대화·앱이 복원한 것, 기억으로 취급하고 기억 못 한다 말하지 마(단 컨텍스트에 없는 건 지어내지 마)" 주입. claude_code preset 순수 충실(ADR-013)에서 resume 세션 한정 의도적 이탈. 라이브 메타질문 probe로 disclaimer 억제 실측 확인("응, 기억나…" + 정확 회상 + confabulation 방어).
- **(b) "맥락 복원됨" 배지** — 모델 말과 무관하게 앱이 맥락을 복원했음을 UI로 사용자에게 알림(renderer `restoredSession` 파생).
- **Phase 03(resume 견고성: session이벤트 즉시저장·폴더없는 cwd)** = 관측 버그 아닌 엣지 하드닝 → 백로그 이연.

**현황(2026-07-02)**: LR1 마일스톤 마감 단계. Phase 01(fa9df22)·02(폴백 d47664c·0dd99e5) 완료 + (a)disclaimer 억제(e056fdb)·(b)배지(981bcf9)·라이브 probe(9795821). resume 라이브 확정, Phase 03 백로그 이연. 근거·상세 = `01.Phases/LR1-loop-resume/_resume-bug-diagnosis.md` §7·§8. (push=인간 게이트.)

---

### ADR-030: 권한 요청 UX — 중앙 모달 → 컴포저 위 인라인 카드 (Track-1 충실도 의도적 이탈) ⭐

**결정**: 권한 요청(`permission_request`) UI를 원본 미러인 중앙 모달(`PermissionModal`, `.q-overlay` 풀오버레이)에서 **컴포저 바로 위 인라인 카드**로 전환하고 모달은 완전 제거한다(영호 확답 2026-07-03). 동일 카드를 멀티패널 `PanelView`에도 마운트해 패널별 권한 응답 격차(미배선)를 함께 해소한다. 데이터 계약(`pendingPermission` 슬롯·`respondPermission` IPC·shared 타입)은 무변경 — 프레젠테이션만 교체.

**이유**:
1. **■(중단) 봉쇄 해소** — 원본 구조(오버레이 z-index:80)는 권한 대기 중 컴포저 전체를 덮어 실행 중단이 불가능하다. 권한 대기는 "실행 중" 상태이므로 중단 수단이 항상 노출돼야 한다(BF2 probe S2'가 검증한 요구).
2. **대화 맥락 보존** — 권한 판단에는 "에이전트가 지금 뭘 하려는가"의 문맥이 필요한데 풀오버레이는 그 문맥을 가린다. 인라인 카드는 대화를 읽으면서 판단하게 한다(Claude Desktop 검증 패턴).
3. **멀티패널 격차 일소** — 원본식 모달은 단일챗 전용 배선이라 멀티패널에선 권한 요청에 응답할 수단이 없어 run이 대기에 갇힌다. 인라인 카드는 패널 컴포저 위에 자연 마운트된다.

**트레이드오프**:
- **ADR-013/014 충실도 이탈** — 원본 AgentCodeGUI는 중앙 모달(`Chat.tsx:1268` 실측). 본 결정은 Track 1(1:1 복제) 도중 Track 2 성격(우리 UX)의 선반영이다. PRD "Track 1 먼저" 순서의 **명시적 waiver** — 사유: 위 1·3은 사용성 결함(원본에도 존재하는 버그의 비복제 결정)이고, 영호가 소유자로서 확답. ADR-029(a)(disclaimer 억제)가 세운 "국소·명문화된 의도적 이탈" 전례를 따른다.
- **모달의 강제 집중력 상실** — 인라인은 놓칠 수 있다. 완화: 카드를 경고성 표면(warn/accent 틴트)으로 강조 + WorkingIndicator 억제로 시선 단일화.
- **e2e 셀렉터 계약 이관 비용** — `.perm-modal` 의존 e2e 7파일 + renderer 1파일. 신규 계약은 상수 단일화로 재발 방지.
- **기각 대안**: ⓐ 모달 유지 + z-index 조정(■만 해소 — 맥락 차단·멀티패널 격차 잔존) ⓑ 인라인+모달 병존(UI 경로 2개 유지비, 영호 기각).

**완료조건(측정가능)**: BF3 Phase 06(`01.Phases/BF3-backlog-sweep/06-permission-inline-card.md`) 완료조건 참조 — `.perm-modal` grep 잔존 0 / 이관 테스트 전부 PASS / 권한 대기 중 ■ 클릭 가능 단언 / 멀티패널 응답·키보드 가드 단위 테스트 / 양 테마 스크린샷 영호 육안 승인.

**위험도**: [M] — ui-visual(육안 게이트) + 상호작용 패턴 변경(e2e 계약 이관으로 방어). 신뢰경계·IPC 계약 변경 0.

**현황(2026-07-03)**: 영호 확정("OK 확정" — plan-auditor 결함-1 게이트 해소). 구현 = BF3 Phase 06(01~05·07 후행, human-visual 커밋 게이트 별도 유지).
