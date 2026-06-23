# Phase 21 — 엔진 SDK 전환 (ADR-016)

> ClaudeCodeBackend를 **CLI spawn(`claude -p`) → Agent SDK `query()`**로 재작성. 원본 AgentCodeGUI `src/main/claude/engine.ts` 미러.
> 목표: "단일 에이전트 실행이 SDK 경로로 동작 + 기존 AgentEvent 계약 유지 + 실 contextWindow 확보"까지. 슬래시·이미지·세션·권한 UI는 범위 외(M4-2~4의 토대).
> 신뢰경계 CRITICAL — SDK/CLI 자식프로세스·인증은 **main 단독**. renderer는 IPC만. API 키 평문 0.

## 근거 (스모크 검증 2026-06-23 + 원본 engine.ts Explore 매핑)
- **스모크 PASS**(`artifacts/sdk-smoke.mjs`, gitignore): `@anthropic-ai/claude-agent-sdk@0.3.186` `query()`가 **구독 인증으로 구동**(ANTHROPIC_API_KEY 불요), `is_error=false`, session_id 캡처, `modelUsage.contextWindow=200000`(haiku, 우리 상수와 일치), 모델 alias `'haiku'` 해석. **약관 검토**: 구독+SDK 유효(위반 아님), CLI와 동일 한도.
- **SDK = CLI 번들 래퍼**: 패키지가 플랫폼별 prebuilt CLI(`win32-x64`)를 동봉, `query()`가 내부 spawn. install 스크립트 0 → better-sqlite3 ABI 무관(`--ignore-scripts`로 추가 완료).
- **ESM/CJS 번들 스파이크 해소(2026-06-23)**: SDK는 ESM-only(`sdk.mjs`, `"type":"module"`)이고 main은 electron-vite가 CJS 번들 + `externalizeDepsPlugin`로 런타임 `require()`. 검증: **Electron 42.4.1 = Node 24.16.0**, `require('@anthropic-ai/claude-agent-sdk')` 성공(`typeof query==='function'`), SDK 진입점 top-level await 0 → `require(esm)` 무문제. **번들 설정 변경 불요**(externalize 유지). Vitest는 query 주입(결정 #8)으로 실 SDK 비접촉이라 inline 불요 — 단 어떤 테스트가 실 모듈을 로드하면 `server.deps.inline`에 `/claude-agent-sdk/` 추가.
- **정규화 레이어 재사용 가능**: `mapClaudeStreamLine(obj: unknown)`는 이미 **파싱된 객체**를 받음. SDK가 yield하는 `SDKMessage`의 assistant/user/result/system 구조 = CLI stream-json과 동일(원본 engine.ts 확인). transport만 교체.
- **현황**: ClaudeCodeBackend=spawn+NDJSON 줄버퍼링+taskkill abort · run-args.ts=CLI 플래그 빌더(allowlist) · claude-stream.ts=NDJSON→AgentEvent · AgentRunInput에 model/effort/mode 이미 존재(M4-1) · AgentEvent=text/tool_call/tool_result/file_changed/done/error.
- **원본 query() 옵션 매핑**(engine.ts): `effortToOptions(effort,model)`(minimal→thinking disabled, fable은 `{}`, 그 외 `{thinking:{type:'disabled'}}`; 그 외 effort→`{effort}`) · `modeToPermission(mode)`(plan→plan·acceptEdits/auto→acceptEdits·bypass→bypassPermissions·normal→default) · `systemPrompt:{type:'preset',preset:'claude_code'}` · `includePartialMessages` · `abortController` · `canUseTool`. **context**: `windowFromModelUsage(modelUsage)`=max contextWindow · `contextFromUsage(usage)`=input+cache_read+cache_creation+output.

## 설계 결정
1. **전면 SDK, CLI spawn 경로 폐기**(ADR-016). 원본 engine.ts엔 CLI 폴백 없음(SDK가 CLI 번들). AgentBackend 추상화·`AgentRun`(events+abort) 인터페이스 **불변** — 어댑터 본체만 교체. registry/IPC/renderer는 `id='claude-code'` 그대로.
2. **옵션 매핑 = 순수 모듈 재작성**: `run-args.ts`(CLI 플래그) → SDK 옵션 매핑으로 전환. `buildQueryOptions({model,effort,mode})` → `Partial<Options>`(model·permissionMode·effort/thinking). allowlist 개념 유지(KNOWN_MODELS·MODE_MAP·MODEL_EFFORT_SUPPORT 재활용) — **untrusted 피커 id는 알려진 SDK 옵션으로만 변환, 미지 id 무시**. electron import 0, vitest 직접. 기존 26 골든 테스트 → SDK 옵션 단언으로 재작성.
3. **정규화 = `claude-stream.ts` 적응**: `mapClaudeStreamLine` 유지·확장. (a) result: `is_error===false || subtype==='success'`→done, 그 외→error+done(SDK subtype: success/error_max_turns/error_during_execution). (b) result에서 `windowFromModelUsage(modelUsage)` 추출 → done.contextWindow. (c) `stream_event`(부분 메시지)는 **이 phase에선 무시**(includePartialMessages=false) — 실시간 토큰 스트리밍은 M4-2. (d) assistant/user/tool 매핑 = 기존 그대로. raw 누수 0.
4. **AgentEvent additive·optional 확장**: `AgentEventDone += contextWindow?: number`(SDK modelUsage 유래 실 컨텍스트 창). backward-compatible(미전달 시 무영향). backend-contract 깃발 → shared-ipc·renderer·qa 정합. **렌더러 채택은 선택적**: gauge가 `done.contextWindow` 있으면 우선, 없으면 기존 `MODEL_CONTEXT_WINDOW` fallback(gaugeCalc에 optional window 파라미터 추가). 기존 게이지 동작 회귀 0.
5. **canUseTool(권한 콜백)**: 권한 UI(M4-4) 전까지 **자동 허용**. readonly tool 항상 allow; 그 외 mode 매핑상 auto/bypass→allow; normal/plan/acceptEdits도 **현재는 allow**(UI 부재로 prompt 불가 — `// TODO(M4-4): 인터랙티브 권한 prompt`). 근거: M4-1 CLI 경로도 사실상 실행 허용이었음(동작 보존). AskUserQuestion 등 인바운드 질문도 M4-4까지 보류(자동 처리/무시).
6. **abort**: taskkill 제거 → SDK query 핸들 `interrupt()`(있으면) + `abortController.abort()`. 멱등 보존. 좀비 프로세스 0(SDK가 자식 관리).
7. **isAvailable/version**: SDK 기반. isAvailable=SDK 로드 가능(하드 의존성이므로 true에 가까움)+번들 CLI 해석 가능. version=SDK 패키지 버전 문자열. `detectClaudeCli`/`getClaudeVersion`(system claude --version) 제거.
8. **테스트성**: ClaudeCodeBackend가 `query` 함수를 주입 가능하게 → vitest에서 mock query로 fixture 메시지 yield, 실 네트워크 0. **기본 query는 lazy 해석**(생성자/dynamic `import()`, 모듈 top-level `import`로 바인딩 금지) → mock 경로가 실 SDK 모듈을 절대 평가하지 않음(ESM 변환·네트워크 격리 보장). abort fixture는 `AbortController.signal`을 관찰하는 mock query(signal.aborted 시 yield 중단)로 멱등·종료 단언. `interrupt()`는 best-effort(있으면 호출, mock에선 abortController 경로가 핵심).
9. **범위 외(후속)**: 슬래시 실행·@mention·이미지·큐(M4-2) / 세션 resume·멀티 패널(M4-3) / 권한·질문 응답 UI·thinking/subagent/todo 이벤트·실시간 per-turn context(M4-4). systemPrompt append·MCP·skills 미연결.

## 추가/변경 계약
- `src/shared/agent-events.ts`: `AgentEventDone += contextWindow?: number`. (backend-contract 깃발.)
- `src/main/agents/AgentBackend.ts`: **불변**(AgentRunInput 이미 model/effort/mode 보유). AgentRun/AgentBackend 인터페이스 불변.
- `package.json`: `@anthropic-ai/claude-agent-sdk: ^0.3.186` dependency **추가 완료**(ADR-016 근거). → ADR-013 스택 노트에 SDK 반영, ADR-016 "착수→구현" 갱신.
- 채널/IPC 타입 신규 0(기존 AGENT_RUN/AgentEvent 스트림 재사용).

## 서브웨이브 (도메인 Worker, 의존성 순서, 각 TDD)
- **21a (shared 계약)** — shared-ipc: `AgentEventDone += contextWindow?`. typecheck 양쪽 green. (qa가 계약 타입 사용 테스트 가능.)
- **21b (backend 매핑·정규화)** — agent-backend **TDD 핵심**: ① `buildQueryOptions`(model→model, mode→permissionMode, effort→effort/thinking; minimal/haiku/미지 id 처리; untrusted 무해화) 골든. ② `mapClaudeStreamLine` 확장(SDK result `is_error`/subtype 분기, modelUsage→contextWindow, stream_event 무시) 골든 fixture. ③ ClaudeCodeBackend 재작성(query 주입형) — mock query yield → AgentEvent 스트림(text/tool_call/tool_result/done+usage+contextWindow/error) 단언, abort 멱등, isAvailable/version.
- **21c (renderer 선택 채택)** — renderer: gaugeCalc가 `done.contextWindow` 우선·`MODEL_CONTEXT_WINDOW` fallback. store reducer가 contextWindow 보존. **회귀 0**(미전달 legacy 경로 = 기존 게이지). *(소규모 — 21b 통합 시 묶어도 무방.)*
- **21d (qa 통합)** — 매핑·정규화 골든 + backend 스트림 단위 + 게이지 reducer. e2e는 실 SDK 호출 불필요(mock query로 충분; 실행 스모크는 `artifacts/sdk-smoke.mjs` 수동).

## 검증 / 완료조건
- 각 서브웨이브 = Worker TDD(실패 테스트 먼저) → reviewer(**신뢰경계 CRITICAL**: SDK spawn·인증 main 단독·renderer IPC만·API 키 평문 0·엔진 추상화 우회 0·raw SDK 출력 누수 0) → typecheck 양쪽 + 단위 green → conventional commit(`refactor(backend): ...` 또는 `feat(backend): SDK query() 전환`).
- **완료조건(측정가능)**: ① `buildQueryOptions`가 (opus,xhigh,auto)→`{model:'opus',effort:'xhigh',permissionMode:'acceptEdits'}` 정확 매핑 + (fable,minimal,*)→thinking 없음(`{}`) + (sonnet,minimal,*)→`{thinking:{type:'disabled'}}` + haiku effort 처리 + 미지 id 무시 골든 green. ② mock query가 init/assistant(text+tool_use)/user(tool_result)/result(usage+modelUsage) yield → AgentEvent 스트림이 text→tool_call→tool_result→done(usage+contextWindow=실값) 정확 변환, **stream_event yield는 무시**. ③ result `is_error=true`(또는 subtype error_*) → error+done. ④ abort 멱등(두 번 호출 무예외) + abort 시(`AbortController.signal` 관찰 mock) generator 종료. ⑤ 게이지가 done.contextWindow 실값 우선, 미전달 시 MODEL_CONTEXT_WINDOW fallback(렌더러 단위). ⑥ **canUseTool 자동허용 단위**: readonly·auto·bypass·normal·plan·acceptEdits 입력 모두 `{behavior:'allow'}` 반환 단언 + 소스에 `// TODO(M4-4)` 권한 prompt 마커 존재(자동허용 = 신뢰경계 표면이라 측정). ⑦ **기존 단위 전부 green + 신규 green**(절대 카운트 비의존), 신뢰경계 reviewer CRITICAL 0. ⑧ **CLI 잔재 0(grep)**: `spawn`(claude)·`taskkill`·`detectClaudeCli`·`getClaudeVersion`·CLI 플래그 리터럴(`--model`·`--effort`·`--permission-mode`·`--output-format`·`stream-json`·`--verbose`)이 SDK 경로(ClaudeCodeBackend·buildQueryOptions·claude-stream)에서 0. (재활용 상수 `KNOWN_MODELS`·`MODEL_EFFORT_SUPPORT`는 유지.)
- **수동 실행 검증(인간 게이트 아님, 비파괴)**: `node artifacts/sdk-smoke.mjs` 재확인 또는 dev 앱에서 실 1회 실행(선택). 실 origin push/배포/package = 인간 게이트 보존.
- **범위 외(후속 M4 Phase)**: M4-2(슬래시·@mention·이미지·큐) / M4-3(세션·멀티) / M4-4(권한·질문·thinking/subagent/todo 이벤트·실시간 context).
