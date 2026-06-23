# Phase 27 — M2-LSP: LSP 코드 인텔리전스 (C5 호버/정의이동 · C2 시맨틱 토큰)

> ADR-017(사용자 승인). 원본 `C:/Dev/AgentCodeGUI/src/main/lsp/{manager,jsonrpc}.ts` + `CmEditor.tsx` 미러.
> **마지막 마일스톤** — 완료 시 M5 직전 도달. plan-auditor REVISE 4건 반영(아래).

## 결론 먼저
- 번들 서버(설치 완료): **`typescript-language-server`**(`lib/cli.mjs --stdio`) · **`pyright`**(`langserver.index.js --stdio`). 자식프로세스 LSP = **main 단독**.
- bin 실행: **`shippedModule` 헬퍼** — `process.execPath`(Electron Node) + `ELECTRON_RUN_AS_NODE:1` 환경 + `app.getAppPath()/node_modules/<pkg>/<entry>` 경로(require.resolve 아님). dev/vite-node에서 동작. (패키징 asarUnpack=M5 비범위.)
- JSON-RPC: `StdioRpc`(원본 jsonrpc.ts 130줄 직접 이식).
- `LspManager`: 서버 def 레지스트리·spawn·initialize/initialized·didOpen·hover/definition/semanticTokens·status. **시맨틱 캐시=인메모리**(디스크 semcache는 후속).
- 신규 IPC: `lsp.status`/`lsp.hover`/`lsp.definition`/`lsp.semanticTokens`/`lsp.cachedTokens`.
- renderer: CodeMirror 6 뷰어 hoverTooltip(300ms)·F12/Ctrl+클릭 정의이동(워크스페이스 내만)·시맨틱 토큰 Decoration(StateField dispatch).

## 🔴 신뢰경계 핵심 (plan-auditor 🔴-A/B 반영 — 이 마일스톤 최대 리스크)
- **원본 `manager.resolve()`는 경계 검증이 0**(절대경로 그대로·`..` 미차단) → **그대로 이식 금지**(우리 fs.read의 rootId 게이트보다 후퇴 = 같은 앱 우회 경로).
- **LSP IPC req는 `cwd`(임의 절대경로)가 아니라 `rootId`(등록 루트 ID)를 받는다.** main이 **기존 신뢰경계 자산 재사용**: `roots.ts`(루트 ID 게이트)로 `rootId→rootEntry.path` 조회 → `workspace.ts` `resolveSafe(rootEntry.path, relPath)`(2단 방어: 문자열 containment + realpath 심링크 차단)로 절대경로 해석. **미등록 rootId·resolveSafe null(탈출/밖)→ `status:'unsupported'`/빈 응답**. fs.read(ipc/index.ts:371~387)와 **동일 게이트**(우회 0).
- LSP 서버 `rootUri`도 검증된 `rootEntry.path`에서만 파생(임의 폴더 인덱싱 차단). 서버 cmd/args=고정 def(renderer 주입 0).
- **음성 검증 필수**(완료조건): `../../etc` 탈출·임의 절대경로·미등록 rootId → unsupported/null 단언.

## 비범위 (후속)
- 다운로드형 서버(C#=Roslyn·C++=clangd) + `install.ts` + UE `compile_commands`.
- **디스크 시맨틱 캐시(semcache)** — 이번엔 인메모리만(워크스페이스 버킷·내용해시·GC는 후속).
- **패키징 asarUnpack**(번들 서버를 asar 밖으로) = **M5 범위** — 이번 라이브 검증은 dev/vite-node 기준. (패키지에서 깨질 것=REPLICA_GAP 기록.)
- 실시간 didChange watch 스트리밍·diagnostics 표시.
- **워크스페이스 밖 정의 점프**(node_modules `.d.ts` 등) — graceful no-op(신뢰경계상 못 엶). C# `$metadata$`류 비범위.

## 서브웨이브
### 27a — 의존성(완료) + 공유 계약 (foundation)
- **의존성 설치 완료**: typescript-language-server@^5.3.0·pyright@^1.1.410(package.json).
- **shared**(`src/shared/ipc-contract.ts`): `LspStatus`('unsupported'|'starting'|'ready'|'error') · `LspPos {line,character}` · `LspHoverResult {contents:string}` · `LspLocation {relPath,line,character}`(**상대경로 — 워크스페이스 내**) · `LspSemanticTokens {data:number[],types:string[],mods:string[]}`. IPC 채널 `LSP_STATUS/HOVER/DEFINITION/SEMANTIC_TOKENS/CACHED_TOKENS`('lsp.status' 등). **req 타입=`{rootId:string, relPath:string, pos?:LspPos}`**(cwd 아님).
- **preload**: `lsp.{status,hover,definition,semanticTokens,cachedTokens}` 노출.
- **음성 테스트**: 미등록 rootId·`..` 탈출 relPath → unsupported(계약/핸들러 레벨).

### 27b — main LSP 호스트 (jsonrpc + manager, 단일 파일 — 27b+27c 병합)
- **`src/main/lsp/jsonrpc.ts`**: 원본 StdioRpc 직접 이식(electron import 0).
- **`src/main/lsp/manager.ts`**: 서버 def 레지스트리(TS/JS=cli.mjs·Python=langserver.index.js, 확장자 매핑·languageId·shippedModule 경로) + spawn(`process.execPath`+`ELECTRON_RUN_AS_NODE`, stdio pipe) + `initialize`(rootUri=검증된 rootEntry.path·capabilities hover/definition/semanticTokens)·`initialized` + 서버 핸들(rpc·child·status·docs Map·semLegend) + `prep(rootId,relPath)`(**resolveSafe 게이트** → 서버 준비+didOpen) + `status/hover/definition/semanticTokens/cachedTokens`(인메모리 캐시). definition 반환은 **워크스페이스 상대경로로 역변환**(밖이면 결과 제외). **서버 생명주기**: spawn 실패/timeout→status error+killTree, 좀비 방지.
- **IPC 핸들러**(`src/main/ipc/index.ts`): lsp.* 등록(rootId 검증).
- **신뢰경계**: 자식프로세스·stdio·파일읽기 main 단독. `roots.ts`/`workspace.ts` 재사용.

### 27c — renderer CodeMirror 통합 (최대 렌더 복잡도)
- CodeViewer(CodeMirror6)에 LSP 확장: `hoverTooltip`(300ms→lsp.hover→마크다운 카드) · F12/Ctrl+클릭(→lsp.definition→**워크스페이스 내 relPath면 openFile 점프, 밖이면 no-op**) · 시맨틱 토큰(lsp.semanticTokens→**StateField/Decoration**, types→CSS class). status 'ready'일 때만 활성.
- **CodeViewer 토큰 갱신은 전체 EditorView 재생성 대신 `view.dispatch`(StateEffect)로 Decoration만 갱신**(현재 [content,language] deps 재생성 구조 → StateField 분리). 캐시 즉시 색칠(cachedTokens)→ready 후 라이브 갱신.

### 27d — 라이브 검증
- vite-node로 LspManager에 실 TS 파일(등록 루트 내) 열고: TS LSP spawn→initialize→hover(심볼 타입)·definition(점프 relPath)·semanticTokens(토큰>0) 실 응답 확인. **+ 음성**: 미등록 rootId·`..` 탈출→unsupported/null.

## 완료조건
- [ ] typecheck green + 단위 test green(음성 경계 테스트 포함).
- [ ] 라이브: TS LSP spawn + hover/definition/semanticTokens 실 응답 + 경계 음성 케이스 차단.
- [ ] reviewer: 신뢰경계(자식프로세스 main 단독·rootId 게이트·resolveSafe·임의 경로 차단·renderer IPC만) 🔴 0.
- [ ] FEATURE_MAP C5 ✅·C2 시맨틱 ✅ · ADR-017·REPLICA_GAP(asarUnpack=M5 메모)·replica-loop 갱신. **M5 직전 도달 마킹.**

## plan-auditor REVISE 반영 요약
- **🔴-A**(경계 검증): LSP req=rootId, main이 roots.ts 게이트+resolveSafe로 해석(원본 무검증 resolve 폐기). fs.read와 동일 게이트.
- **🔴-B**(음성 검증): `..`탈출·임의절대·미등록 rootId→unsupported 테스트를 27a/27d 완료조건에.
- **🟡-C**(bin/캐시): shippedModule(process.execPath+ELECTRON_RUN_AS_NODE+app.getAppPath) 명시·pyright=langserver.index.js·인메모리 캐시(디스크 후속)·asarUnpack=M5 비범위.
- **🟡-D**(점프/Decoration): 정의 점프 워크스페이스 내만(밖 no-op)·CodeViewer StateField dispatch(재생성 금지).
- **27b+27c 병합**(manager 단일 파일).
