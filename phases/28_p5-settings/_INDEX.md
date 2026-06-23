# Phase 28 — P5: Settings 5탭 정적 샘플 → 실 IPC·실 영속·런타임 적용

> 폴리싱 루프 P5. 원본 `C:/Dev/AgentCodeGUI` Settings.tsx + `src/main/{mcp,skills}.ts` + `claude/engine.ts` 미러.
> SDK 모델(ADR-016) 적응. **사용자 `~/.claude` 설정 절대 미수정** — 앱(userData)에 disabled 오버레이만.
> audit 원천: 2026-06-24 Explore(원본 Settings 5탭 실데이터·토글 영속 + denied/override SDK 배선 매핑).

## 결론 먼저 (탭별 처리)
| 탭 | 현재 | P5 처리 | 근거 |
|---|---|---|---|
| 테마 | **실동작** (getTheme/setTheme via prefs) | 무변경 | 이미 충실 — 과잉수정 금지 |
| Skill | 정적 샘플 | **실 IPC**(P5a) — `~/.claude/skills` 스캔 + userData disabled 오버레이 + 런타임 적용 | 시크릿 0, 1:1 가능 |
| MCP | 정적 샘플 | **실 IPC + 시크릿 마스킹**(P5b) — `~/.claude.json`·`.mcp.json` 읽기 + 마스킹 + disabled 오버레이 + 런타임 적용 | 신뢰경계 핵심 |
| Claude Code(엔진) | 정적 멀티버전 picker | **적응**(P5c) — `getEngineState()` 실데이터(SDK 버전/인증)로 대체, 가짜 설치/멀티버전 제거 | SDK 단일 의존(ADR-016) |
| Code(LSP) | 정적 + 가짜 설치 토글 | **정직화**(P5c) — TS/Py=번들(실), C#/C++="M5 예정"(가짜 설치 제거) | 다운로드형=M5 비범위 |

## enforcement(런타임 적용) — SDK 옵션 (plan-auditor 🔴-C/🔴-D 반영)
- 우리 `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` 확인(claude-code-guide+plan-auditor) + 원본 `claude/engine.ts:251~294`:
  - **Skill disabled → `options.settings.skillOverrides: Record<string, 'off'>`** — 우리 SDK `.d.ts:4636`에 **존재 확정**(값 유니온 `'on'|'name-only'|'user-invocable-only'|'off'`, `'off'` 유효). **재검증/폴백 불요 — enforcement 확정.**
  - **MCP disabled → `options.settings.deniedMcpServers: { serverName?: string }[]`** — `.d.ts:4665`에 존재하나 주석이 **"Enterprise denylist (managed-mcp.json)"** → **inline 발효는 managed 컨텍스트 의존일 수 있음(미보장)**. 원본도 inline 가정에 의존. **우리는 best-effort로 전달(원본 패턴 일치)하되 "검증된 차단"으로 단정하지 않음** — 실제 발효 불확실성은 REPLICA_GAP에 기록. 토글의 1차 가치는 **실데이터 표시 + 영속**(disabled 상태가 다음 run options에 반영되는 것까지가 측정 대상).
- 둘 다 우리 `ClaudeCodeBackend.ts:447`의 `settings: { permissions: { defaultMode } }` 객체에 spread로 추가(null이면 미포함). cwd 무관 전역 denylist, run 시작 시 1회 계산.

## 🔴 신뢰경계 핵심 (P5 최대 리스크 = MCP 시크릿)
- **MCP `~/.claude.json`·`.mcp.json`는 시크릿 포함 가능**(stdio args의 API 키, http/sse URL의 토큰, `env` 객체). main이 renderer로 보내는 `McpServerInfo.detail`은 **화이트리스트 마스킹 필수**(🔴-A — 블랙리스트/정규식 치환 아님, 안전 조각만 조립):
  - stdio: command **basename만** (args 전체 생략). `env` 객체 **절대 미노출**(키 이름·값 둘 다).
  - http/sse: **`new URL(u).host`만 조립** (userinfo·path·query·hash 전부 버림). **URL 파싱 실패 → 빈 문자열**(raw fallback 금지).
  - 그 외/unknown: 빈 문자열.
  - 원본은 `${cmd} ${args}`·`c.url` 그대로 노출(시크릿 누수 버그, `mcp.ts:69`) → **우리는 이식하지 않고 화이트리스트 마스킹으로 개선**.
- 읽기/스캔/파일 I/O = **main 단독**. renderer는 IPC만. disabled 오버레이는 **userData**(앱 전용, prefs와 동일 관례), `~/.claude` 미수정.
- skill frontmatter는 name/description만 추출(시크릿 무관).
- **음성 검증 필수**(완료조건·🟡-E): 시크릿 포함 fixture(`env: {API_KEY: 'SECRET_TOKEN_ABC'}`·`https://user:tok@h.com/p?key=SECRET`) → `JSON.stringify(listMcpServers(...))`에 **알려진 시크릿 토큰 문자열(`SECRET_TOKEN_ABC`·`tok`·`SECRET`) + env 키 이름(`API_KEY`) 모두 `includes` 0** 단언.

## 비범위 (후속/M5)
- 엔진 멀티버전 설치/삭제(npm registry·`~/.agentdeck/engines`) — SDK 단일 의존이라 **영구 비범위**(M5도 아님).
- LSP 다운로드형(C#=Roslyn·C++=clangd) `install.ts` — **M5**.
- MCP/Skill **추가/편집/삭제** UI — 비범위(읽기 + enable/disable 토글만). 사용자 `~/.claude` 쓰기 금지.
- `allowedMcpServers` 화이트리스트·`disableBundledSkills` — 비범위(denylist만).

## 서브웨이브

### P5a — Skill 탭 실동작 (시크릿 0, 패턴 확립)
- **shared**(`src/shared/ipc-contract.ts`): `SKILL_LIST: 'skill.list'`·`SKILL_SET_ENABLED: 'skill.setEnabled'` + `SkillInfo {name:string, description:string, scope:'global'|'local', enabled:boolean}` + `SkillSetEnabledReq {name:string, enabled:boolean}`. preload 노출(`listSkills()`·`setSkillEnabled(req)`).
- **main**(`src/main/settings/skills.ts`): `listSkills(workspaceRoot:string|null): SkillInfo[]` — `~/.claude/skills/*/SKILL.md`(global) + `<ws>/.claude/skills/*/SKILL.md`(local) 스캔, frontmatter `name`/`description` 파싱(없으면 폴더명). disabled = `userData/skills-disabled.json` `{disabled:string[]}`. `setSkillEnabled(name,enabled)` 갱신. `disabledSkillOverrides(): Record<string,'off'>|null`. IPC 핸들러(`ipc/index.ts`) — cwd=`_currentWorkspaceRoot`.
- **backend**(`agent-backend`, `ClaudeCodeBackend.ts`): sdkOptions.settings에 `...(skillOverrides ? {skillOverrides} : {})` 추가(🔴-D: `.d.ts:4636` 존재 확정, 폴백 불요). `disabledSkillOverrides()`는 main settings 모듈에서 import(backend는 결과만 spread, 파일 I/O 안 함).
- **renderer**(`SettingsModal.tsx` SkillView): 정적 `SKILLS` 제거 → 마운트 시 `window.api.listSkills()` 로드, 토글 `window.api.setSkillEnabled`. 빈 상태/scope 탭 유지.
- **qa**: skills.ts 스캔/frontmatter 파싱/disabled 영속 단위(주입 fs) + IPC 계약 골든.

### P5b — MCP 탭 실동작 + 시크릿 마스킹 (신뢰경계 핵심)
- **shared**: `MCP_LIST: 'mcp.list'`·`MCP_SET_ENABLED: 'mcp.setEnabled'` + `McpServerInfo {name, scope:'global'|'local', origin:'user'|'project'|'local', transport:'stdio'|'http'|'sse'|'unknown', detail:string, enabled:boolean}`(**🔴-F: origin 복원 — 원본 protocol.ts:379 1:1. detail=마스킹된 안전 문자열**) + `McpSetEnabledReq`. preload.
- **main**(`src/main/settings/mcp.ts`): `listMcpServers(workspaceRoot)` — `~/.claude.json`(`mcpServers`=user origin/global scope + `projects[ws].mcpServers`=local origin/local scope) + `<ws>/.mcp.json`(project origin/local scope) 읽기. **origin별 rank 정렬**(user→project→local) — 동명 서버 출처 구분. **화이트리스트 마스킹**(위 신뢰경계 규칙). disabled=`userData/mcp-disabled.json` `{disabled:string[]}`(name 기반). `setMcpEnabled`·`deniedMcpServers(): {serverName}[]|null`. IPC 핸들러.
- **backend**: sdkOptions.settings에 `...(mcpDenied ? {deniedMcpServers: mcpDenied} : {})` (best-effort — 🔴-C: inline 발효 managed 의존 가능, REPLICA_GAP 기록).
- **renderer**(McpView): 실데이터 + 토글.
- **qa**: **마스킹 음성 테스트**(시크릿 fixture→출력 시크릿 0) + disabled 영속 + 계약 골든.

### P5c — Engine + LSP 탭 적응 (renderer 중심)
- **Engine(VersionView)**: 가짜 멀티버전 picker 제거 → `window.api.getEngineState()` 실데이터. "현재 엔진: Agent SDK · v{version} · {인증됨/미인증}". 설치/삭제/버전목록 제거. `ENGINE_CURRENT`/`ENGINE_VERSIONS` 샘플 제거. **가짜 하드코딩 문구 `~/.agentdeck/engines/<버전>`(SettingsModal.tsx:158) 제거**(🟡 — 영구 비범위 경로).
- **LSP(LspView)**: TS/Py=번들(실·즉시 사용), C#/C++=`state:'download'` 유지하되 버튼=비활성/"M5 예정" 라벨(가짜 toggleInstall 제거). 정적이나 정직.
- **renderer 회귀**: 기존 settings 테스트(테마 라벨·nav·aria) 계약 보존.
- **qa**: VersionView=getEngineState 모킹 테스트, LSP 정직화 확인.

## 완료조건
- [ ] typecheck green(main+renderer) + 단위 test green(마스킹 음성 + 영속 + 계약 포함).
- [ ] reviewer: 신뢰경계(MCP 시크릿 0 노출·main 단독 fs·userData 오버레이·`~/.claude` 미수정·renderer IPC만) 🔴 0. 서브웨이브마다.
- [ ] 라이브(선택): vite-node로 listMcpServers/listSkills 실 파일 스캔 + 마스킹 확인. enforcement는 SDK 옵션 spread 단위로 충분.
- [ ] POLISH_GAP P5 ✅ · FEATURE_MAP(F7 실동작) · replica-loop 갱신.

## plan-auditor REVISE 반영 (4🔴)
- **🔴-A**(URL 마스킹): 화이트리스트 — host만 조립·파싱실패 빈문자열. 음성 fixture `user:tok@host/path?key=SECRET`.
- **🔴-C**(deniedMcpServers 발효): inline managed 의존 가능 → best-effort 전달, "검증된 차단" 단정 제거, REPLICA_GAP 기록.
- **🔴-D**(skillOverrides): `.d.ts:4636` 존재 확정 → 재검증/폴백 삭제, enforcement 확정.
- **🔴-F**(McpServerInfo): `origin` 복원 + user→project→local rank 정렬.
- 🟡: ARCHITECTURE.md 트리에 `settings/` 추가 · 음성 단언에 env 키 이름 포함 · VersionView 가짜 경로 문구 제거.

## 사이클
서브웨이브별: shared-ipc 계약 → main(+backend) Worker TDD → renderer Worker TDD → reviewer(신뢰경계 🔴 0) → conventional commit(master). 서브에이전트·도구 한국어·기본 foreground. 인간게이트 보존. 과잉수정 금지(테마 무변경).
