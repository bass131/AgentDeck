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

### ADR-011: Phase 실행 — `scripts/execute.py` 헤드리스 순차
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

### ADR-014: 충실도 1:1 복제 방식 — 원본 클론 레퍼런스 + OKLCH 디자인시스템 ⭐
**결정**: 원본 repo를 **`C:/Dev/AgentCodeGUI`에 클론**(git 미포함, 레퍼런스 전용). 컴포넌트 소스/`styles.css`/`docs/*.png` 스크린샷을 **페이즈별 대조**. 디자인시스템 = **OKLCH 듀얼테마(라이트/다크)** 이식(이전 hex 토큰·다크 전용 대체). 타깃 스펙 = `docs/UI_FIDELITY.md`. **충실도 트랙 F1~F6**(디자인시스템+셸 → 사이드바/탐색기 → 대화/컴포저/툴카드 → 우측패널 → 뷰어/모달 → 라이트테마/폴리시).
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
- **store/renderer**: 대화 로드 시 그 대화의 cwd로 워크스페이스 복원(없으면 현재 유지). 대화 생성 시 현재 workspaceRoot를 cwd로 기록. 폴더를 바꾸면(대화 진행 중) folder-switch 확인 흐름(원본 pendingFolder 미러).
- **범위**: 단일 모드 대상. 멀티 모드는 이미 패널별 cwd(P15)라 그대로.

**이유**: ① 원본은 chat record에 `cwd`("Required")를 저장해 대화 전환 시 그 프로젝트로 워크스페이스가 따라 바뀜 — 1:1 충실도 갭. ② 멀티프로젝트 사용 시 **컨텍스트 정합**: 대화 A(/ProjectX)를 /ProjectY에서 열어도 탐색기·@멘션·에이전트 cwd가 A의 폴더를 따라가 어긋남 방지. ③ 에이전트 resume이 올바른 디렉토리에서 재개.

**트레이드오프**: DB 마이그레이션 + IPC 계약 변경(신뢰경계 깃발) + store 전역→대화별 + folder-switch UX = 중대형. 기존 단일 전역 워크스페이스(MVP 단순화)를 대체. cwd는 경로 문자열(시크릿 아님)이나 main이 검증(renderer 임의 경로 주입 차단 — 기존 rootId 게이트 정합). 마이그레이션 실패 시 cwd=null로 graceful(기존 전역 동작 유지).

**현황(2026-06-24)**: 구현 예정. 단일 모드 우선, folder-switch UX는 원본 App.tsx pendingFolder/requestFolder 미러.