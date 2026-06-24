# Phase 37 — 에이전트 오케스트레이션 시각화 (SubAgent 보강 + Workflow 블랙박스)

> **compact 생존 정의서.** 사용자 결정(2026-06-25): 서브에이전트 오케스트레이션을 *진짜로* 시각화(트리+풀스크린 transcript) + Workflow는 블랙박스 카드. 압축돼도 이 문서에서 이어간다. push 0(인간 게이트). 막힘=[[loop-stuck-policy]].

## 0. 검증된 SDK 사실 (claude-code-guide 4회 확인 — 재조사 불요)
- **서브에이전트(Agent/Task 도구) = 기본 관측가능** ⚠️**정정(스파이크 2026-06-25)**: `forward_subagent_text`는 **실재하지 않는 옵션**(이전 가정 폐기). 서브에이전트 내부 text/thinking/tool_use 메시지는 **기본 동작으로** `parent_tool_use_id`를 달고 query() 스트림에 들어옴(블랙박스 아님). **`includePartialMessages:true`(우리 보유)만으로 충분 — 새 SDK 옵션 0**. 재구성: 그룹핑=`parent_tool_use_id`, 서브에이전트 시작=`Agent`/`Task` tool_use(그 id가 parent), 종료=매칭 tool_result. 진행=`SDKTaskProgressMessage`(status/task_progress, 옵션·필수 아님). 공식: "Messages from within a subagent's context include a `parent_tool_use_id` field."
- **Workflow 도구 = 실행 가능하나 내부 완전 블랙박스**: SDK 0.3.149+에서 `allowedTools:["Workflow"]`로 에이전트가 **호출 가능**(우리 0.3.186). 단 격리 런타임 out-of-band 실행 → query() 스트림엔 **`tool_use`(호출, 입력 포함) + `tool_result`(최종)만**. 내부 phase/병렬에이전트/log/진행 **0**. progress API·polling·SSE **없음**(공개). CLI `/workflows` 트리는 **CLI가 런타임 주인이라 자기 UI에 렌더하는 것** — SDK 호스트엔 그 통로 없음. **설계 의도**(메인 컨텍스트 토큰 절약 위해 일부러 가림).
- **`/workflows` 슬래시**: SDK `slash_commands` 목록에 없음 → SDK 세션에서 미작동.
- **호스트가 Workflow에서 얻는 것**: 호출 시점·**입력(스크립트의 `meta`={name,description,phases})**·실행중 여부(호출~결과 사이)·최종 결과. = "계획된 phase 목록 + 진행상태 + 결과"까지 표시 가능, *어느 phase가 라이브인지*만 불가.
- **트리거 키워드 = CLI 전용**(claude-code-guide 재확인): opt-in 리터럴은 **`ultracode`**(소문자·정확매칭, v2.1.160+; 구버전 `workflow` 단수는 폐기) + 자연어("use a workflow"). 단 이 **키워드 감지·리마인더 주입은 CLI 런타임 기능 → SDK엔 없음**. **→ 우리(호스트)가 트리거를 직접 정의**해야 함. **사용자 결정(2026-06-25): 채팅 입력창 바로 위 UI 토글**(현재 스타일 일치)로 opt-in 제어.

### 0-A. Workflow 배선 — 공식 문서 원문 확정 (claude-code-guide, 2026-06-25, 모순 종결)
> **재조사 절대 불요.** SDK Permissions/Workflows 문서 원문 인용으로 모순 3건 종결.
- **실행 주체(Q1)**: ✅ **"Workflows are available in...the Agent SDK."** 워크플로우 런타임이 **SDK query()에 포함** → tool_use→실제 실행→tool_result 반환. (CLI의 `/workflows`는 *뷰어 UI*만 CLI 전용. 실행은 SDK도 됨.) → #4 카드가 빈 껍데기 아님, 진짜 끝남.
- **기본 상태(Q2)**: **Workflow = default ON.** 끄는 법만 문서에 존재(="기본 켜짐" 증거): `~/.claude/settings.json`의 `"disableWorkflows":true` / 환경변수 `CLAUDE_CODE_DISABLE_WORKFLOWS=1` / query option **`disallowedTools:["Workflow"]`**(도구 정의를 요청에서 제거 → 모델이 아예 못 봄).
- **allowedTools 의미론(Q3)**: **사전승인(auto-approve) 리스트, 제한 화이트리스트 아님.** 원문: *"a tool not listed in allowed_tools is still available to Claude and falls through to the permission mode."* → **`allowedTools`에 "Workflow" 넣으면 자동승인돼 canUseTool을 건너뜀 = 게이트 불가. 절대 넣지 말 것.**
- **권한 평가 순서**: Hooks → Deny규칙(disallowedTools) → Ask규칙 → permission mode → Allow규칙(allowedTools) → **canUseTool(최후)**. allowedTools 미포함 + 자동승인 안 되는 도구는 **반드시 canUseTool 발화** → 우리 `_makeCanUseTool`가 게이트.
- **✅ 확정 배선** (우리 요구 "평소 차단 / 토글 ON시만 + 매번 승인"과 정확 일치):
  - **토글 OFF(기본)** → sdkOptions에 **`disallowedTools:["Workflow"]`** (모델이 도구 자체를 못 봄 + 컨텍스트 토큰 절약). canUseTool엔 도달조차 안 함.
  - **토글 ON** → `disallowedTools`에서 Workflow 제거(=default ON 복귀) + **systemPrompt append로 오케스트레이션 가이드 주입**(사용자 커스텀 sysPrompt와 *분리 합성*). Workflow는 allowedTools 미포함이라 **canUseTool로 떨어짐** → `_makeCanUseTool`에 **Workflow 케이스를 auto/bypass 조기허용 *앞*에 배치**해 **항상 permission_request**(대규모=비용, 모드 무관 승인 강제). 승인 후 기존 tool_call 이벤트가 흐름 → 카드(#4b).
  - **엔진중립(ADR-003)**: `disallowedTools`·"Workflow"·append 가이드 문구는 **전부 ClaudeCodeBackend 내부**. 토글은 `AgentRunRequest.orchestration?:boolean`(엔진중립)으로만 전파.

## 1. 목표 (왜)
에이전트가 멀티에이전트로 일할 때 **우측 패널에 진행 트리 + 클릭 시 전용 풀스크린 상세**. 서브에이전트는 데이터가 다 열려 있어 진짜 됨. Workflow는 SDK 한계로 블랙박스 카드까지.
**현 상태**: SubAgent 카드/상태(running→done)는 실배선(M4-4)이나 **SubAgentModal 상세는 샘플 데이터**(`agentSampleData`) — 실 transcript 미캡처. AgentPanel/SubAgentModal 존재.

## 2. 빌드 순서 (확정)
### 토대 — 서브에이전트 transcript 캡처 (#3·#4 공통 선행)
- **agent-backend `ClaudeCodeBackend.ts`**: sdkOptions에 `forward_subagent_text:true` 추가(서브에이전트 전체 transcript 포워딩). 펌프에서 **`parent_tool_use_id`로 메시지 그룹핑** → per-서브에이전트 스레드 구성(text/tool/thinking). 기존 `parentToolId` 태깅(M4-4) 확장.
- **shared/이벤트**: 서브에이전트 transcript를 운반할 이벤트/구조(`subagent` 이벤트 확장 또는 신규). per-agent thread(ThreadItem[] 류) 캡처. 신뢰경계: 모델 출력만, raw 누수 0.
- **renderer/store**: 서브에이전트별 상태+transcript를 보관(AgentPanel/풀스크린 구독).

### #3 — 서브에이전트 트리 + 풀스크린 transcript
- **AgentPanel(우측)**: 서브에이전트 **라이브 트리**(상태 점·running/done, 부모-자식 들여쓰기). 샘플→실데이터.
- **클릭 → 전용 풀스크린 뷰**(신규): 그 서브에이전트의 **실 transcript 상세**(msg/tool/thinking). **블러 배경**. Esc/바깥클릭 닫기. (현 SubAgentModal 대체/확장 — 모달이 아니라 풀스크린.)

### #4 — Workflow 블랙박스 카드
- **opt-in 토글(확정)**: **채팅 입력창 바로 위 UI 토글**(현재 GUI 스타일 일치). OFF=기본(Workflow 미노출), ON=opt-in. 토글 상태를 send 경로로 전파 → ON이면 ① `allowedTools`에 `Workflow` 포함 ② systemPrompt append(M2 재사용)로 "Workflow 오케스트레이션 사용 가능" 가이드 주입. SDK엔 `ultracode` 자동감지 없음 → 이 토글이 우리의 트리거.
- **agent-backend**: **Workflow 도구 활성화** `allowedTools:["Workflow"]`(토글 ON시만) — 단 **자동승인 금지, 권한 게이트**(canUseTool로 "Workflow 실행 허용?" 권한모달). 사용자 결정: **게이트**(자동승인 X — 대규모=비용).
- **renderer**: Workflow `tool_use` 감지 → **블랙박스 카드**(`⟳ Workflow: <name> 실행 중` Progress Circle → `✓ 완료`). 입력 `meta`에서 name/description/phases 파싱.
- **클릭 → 풀스크린**(#3과 통일 패턴): 선언된 **phase 목록** + 설명 + (옵션)스크립트 + 최종 결과. 라이브 내부 진행 없음(불가 명시).

## 3. 도메인 R/W (예상)
| 도메인 | 파일 | 비고 |
|---|---|---|
| agent-backend | `ClaudeCodeBackend.ts`(forward_subagent_text·parent_tool_use_id 그룹핑·Workflow allowedTools+게이트)·`claude-stream.ts`(순수 매퍼) | 토대 코어 |
| shared-ipc | `agent-events.ts`(서브에이전트 transcript 이벤트)·ipc-contract | 신뢰경계 |
| renderer | `AgentPanel.tsx`(트리 실데이터)·신규 풀스크린 뷰(transcript·블러)·`SubAgentModal` 대체/확장·Workflow 카드·store(서브에이전트 상태/transcript) | UI |
| qa | tests/** + 라이브 e2e(실 서브에이전트 스폰 → 트리/transcript) | 검증 |

## 4. 방법론 (확립)
phase 정의서(이 문서) → **plan-auditor**(교차·신뢰경계·토대가정) → domain Worker TDD → reviewer(CRITICAL 0) → commit. 검증 3층(단위+스모크[실 백엔드 서브에이전트 스폰]+실런타임 e2e). 막힘=[[loop-stuck-policy]]·서브에이전트 foreground.

## 5. 리스크 (예상)
- **교차(토대)**: transcript 캡처가 펌프(ClaudeCodeBackend)·이벤트·store·AgentPanel 횡단. Phase A 인터리브/messageId 펌프카운터 불변 보존.
- **forward_subagent_text 검증**: SDK 옵션 실효를 스모크로(실 서브에이전트 스폰 → 메시지 parent_tool_use_id 수신·그룹핑).
- **Workflow 게이트**: 자동승인 금지(canUseTool 권한모달). 신뢰경계.
- **풀스크린 vs 기존 모달**: SubAgentModal(F10-02)·FileModal 패턴 재사용. 블러 배경.

## 7. plan-auditor 차단 해소 (2026-06-25, 구현 전 확정)
> Tier 2-B 감사가 차단 3 + 권고 3 제기 → 아래로 §2 순서/AC를 **supersede**.

### B1 해소 — 빌드 순서 2트랙 분리 (직렬 가정 폐기)
- #4(Workflow 블랙박스)는 토대(서브에이전트 transcript)에 **의존 없음**: Workflow 카드는 `tool_call`(meta 입력)+`tool_result`만 필요, 이는 `claude-stream.ts`의 일반 tool_use 경로로 **이미 흐름**. `forward_subagent_text`/`parent_tool_use_id`와 무관.
- **재배치**: **트랙A=#4(독립)** ∥ **트랙B=토대→#3(직렬)**. 사용자 집중 + 저위험이므로 **트랙A(#4 토글) 먼저** 착수. 토대 막힘이 #4로 전파되지 않음.
- #4 내부 직렬: `orchestration` 토글(shared/IPC) → allowedTools+append(backend) → canUseTool 게이트(backend) → 카드(renderer) → 풀스크린(renderer).

### B2 해소 — transcript = 별도 상태 슬라이스로 격리 (thread 불변)
- shared `SubAgentInfo`에 **optional `transcript?: SubAgentTranscriptItem[]` 1개만** 추가(union 구조 불변 → backend-contract 깃발만, 파급 최소). 신규 이벤트 아님(기존 `subagent` 확장).
- reducer subagent 병합에서 **transcript만 append**. 메인 `thread`/`openMsgId`/`openGroupId`/`seq`/펌프카운터 **전부 불변**(transcript는 thread에 안 들어감). panelSession은 `applyAgentEvent` 위임이라 **자동 정합**(별도 동반 불필요 — 단 컴파일 green 확인).
- `snapshotForPersist`는 transcript **제외**(휘발). 
- **잠재버그 동반 수정**: reducer text 분기가 `parentToolId` 미확인 → 서브에이전트 text가 메인 thread에 섞일 수 있음. 토대 시 parentToolId 있는 text는 메인 thread 제외 + transcript로만 라우팅(qa 회귀가드).

### B3 해소 — 측정가능 AC + forward_subagent_text 스파이크 선행
- **토대 스파이크(착수 전 의무)**: SDK 0.3.186 실 옵션 키명·실효 확인(claude-code-guide/claude-api). AC="실 Task 스폰 → 수신 메시지에 `parent_tool_use_id` 채워진 assistant N≥1 + 그 text가 메인 thread와 분리 캡처(단위 어서션)". 옵션이 미존재/무효면 토대 설계 재검토(롤백 안전선).
- **#4 AC 분해(단위 우선, 라이브는 best-effort)**: ⓐ 토글 ON→send 요청에 `orchestration:true`(renderer 단위) · ⓑ 백엔드가 플래그 수신 시 sdkOptions에 Workflow 포함+append 합성(ClaudeCodeBackend mock query 주입 단위) · ⓒ `Workflow` 정규화 이벤트 주입→블랙박스 카드 렌더(reducer+컴포넌트 단위) · ⓓ canUseTool이 Workflow에 permission_request emit(단위).

### Y1 해소 — 엔진중립 매핑 (ADR-003 가드)
- 토글 = `AgentRunRequest`/`AgentRunInput`에 **엔진중립 `orchestration?: boolean`**. "Workflow"·"ultracode"·systemPrompt 가이드 문구·allowedTools 매핑은 **전부 `ClaudeCodeBackend.ts`/`run-args.ts` 내부에만**. UI/IPC/reducer가 "Workflow" 리터럴 알면 위반.
- **카드도 엔진중립**: `claude-stream`이 Workflow tool_use를 **정규화된 orchestration 이벤트**(kind 중립 + meta{name,description,phases})로 매핑 → 렌더러는 *중립 kind*로 렌더(문자열 "Workflow" sniffing 금지).
- systemPrompt append는 기존 메커니즘 재사용하되 **사용자 커스텀 `systemPrompt` 필드와 분리** — 백엔드가 `orchestration` 플래그→가이드 append를 별도 합성(사용자 프롬프트 충돌 방지).

### Y2 해소 — 순수성·누수 가드
- `mapClaudeStreamLine` **순수 유지**(무상태). transcript는 모델 출력 text/thinking/tool만 추출, **raw SDK payload(내부경로·세션ID) 미전달**(기존 `_sanitizeDescription`/`permissionSummary` 패턴 재사용). AC에 누수 0 가드 추가.

### Y3 해소 — 풀스크린은 SubAgentModal 패턴 재사용(대체 아님)
- `SubAgentModal.tsx`(F10-02 시각 충실도 자산) **폐기 금지**. 블러 오버레이·Esc·바깥클릭 패턴 재사용 + **크기만 풀스크린 확장** + 내용을 실 transcript로 교체. 충실도 회귀 0.

## 6. 이번 세션 선행 완료 (참고)
약점보강 8마일스톤 ✅(M1~M8, 별도) 후 UX 배치: #1 멀티패널 사전입력 제거·#2 단일모드 자동표시 제거·#7 타이틀바 AgentDeck·#5 우측패널 가변너비·#6 Ctrl+/- 에디터폰트 — 전부 커밋됨. m4-4 실버그 수정으로 전체 2980 green. push: GitHub `bass131/AgentDeck`(Private) 연결됨.
**진행(이 Phase)**:
- ✅ **#4a 오케스트레이션 토글**(커밋 ac04eec): shared `orchestration?:boolean` → IPC `===true` 정규화 → backend(OFF=`disallowedTools:[Workflow]`/ON=해제+`ORCHESTRATION_SYSTEM_GUIDE` append+canUseTool 게이트, `ORCHESTRATION_TOOLS` 단일출처, `_requestPermission` 추출) → Composer 토글 pill. 신규 37테스트 + 전체 3041 GREEN, plan-auditor 차단3 해소, reviewer CRITICAL 0.
- ✅ **#4b UltraCode 블랙박스 카드**(커밋 202fd8a): `orchestration-meta.ts` 파서(8KB cap·비백트래킹) + claude-stream Workflow→orchestration 정규화(tool_call 억제) + `AgentEventOrchestration` + reducer(push+B-1 포인터/tool_result P-2 매칭) + `OrchestrationCard`/`FullscreenOverlay`(P-4 공통셸) + Conversation·MultiWorkspace 양쪽(B-2). 신규 테스트 + 전체 3124 GREEN, plan-auditor 차단4 해소, reviewer CRITICAL 0. → **#4 트랙 완결**.
- ⏳ **#3 서브에이전트 트리+풀스크린**(트랙B): 토대(transcript 캡처, B2 격리 슬라이스, `forward_subagent_text` 스파이크 선행) → AgentPanel 실데이터 트리 → 풀스크린 transcript(`FullscreenOverlay` 재사용).

**잔여**: #4b · #3(토대 포함). **사용자 게이트 문서**(ADR-006 supersede·ADR-021·CLAUDE.md·main-process.md sqlite→JSON) 여전히 미적용.

> **추가 UI(b217e8f)**: #4a 토글을 **"UltraCode"** 표기로 리브랜딩 + 버튼 프레임 + 활성 시 보라 Flow 애니메이션(`@keyframes ultracode-flow`, tokens `--ultracode` hue295 light/dark, reduced-motion 폴백). 내부 데이터 `orchestration` 엔진중립 유지, 표시만 UltraCode.

## 9. #3 서브에이전트 트리+풀스크린 — 설계 확정 (실코드 grounded + 스파이크, 2026-06-25)
> 코드 확인: `claude-stream.ts`(메시지 parent_tool_use_id → text/thinking엔 parentToolId 미부여=버그/tool_call엔 부여 L233-240), `agent-events.ts`(SubAgentInfo{id,name,role,status,activity?,tools[]} — transcript 없음), `reducer.ts`(case 'subagent' upsert·tool_call parentToolId→subagent.tools), `AgentPanel.tsx`(서브에이전트 카드 실배선·클릭→SubAgentModal).

### 현 상태 / 격차
- **보유**: 서브에이전트 카드·상태(running→done)·도구목록(parentToolId tool_call 그룹핑) 전부 **실데이터**. AgentPanel 트리 실배선.
- **격차**: 서브에이전트 **text/thinking transcript 미캡처**. 게다가 claude-stream이 parent_tool_use_id 메시지의 **text/thinking에 parentToolId를 안 달아** 서브에이전트 내부 text가 **메인 thread로 새어 들어가는 버그**(plan-auditor B2 지적). → #3 = transcript 추가 + 이 버그 수정.

### 토대 — transcript 캡처 (새 SDK 옵션 0, §0 정정대로)
- **claude-stream.ts**: parent_tool_use_id 있는 메시지의 **text/thinking 이벤트에도 parentToolId 부여**(현재 tool_call만 받음). 순수 유지.
- **shared `agent-events.ts`**: `AgentEventText`/`AgentEventThinking`에 optional `parentToolId?` 추가(tool_call 미러). `SubAgentInfo`에 **optional `transcript?: SubAgentTranscriptItem[]`** 추가(B2 격리 슬라이스). `SubAgentTranscriptItem = { kind:'text'|'thinking'|'tool', text?, verb?, target?, status?, id? }`(통합 타임라인). union 구조 불변(optional 1필드).
- **reducer.ts**: text/thinking/tool_call 이벤트가 **parentToolId 있으면 → `subagents[id].transcript` append**(+ 기존 tool→tools[] 유지), **메인 thread 미관여**(버그 수정). thread/openMsgId/openGroupId/seq/펌프카운터 **불변**. panelSession 위임 자동정합. snapshotForPersist msg-only(transcript 휘발).
- **회귀가드(qa)**: parentToolId text가 **메인 thread에 안 들어가고** transcript로만 가는지(버그 수정 단정). 최상위(parentToolId 없는) text는 기존대로 thread.

### #3 트리 + 풀스크린
- **AgentPanel**: 트리 이미 실배선 — 유지(running/done 점·도구수). 변경 최소.
- **클릭 → 풀스크린**: `FullscreenOverlay`(#4b 공통셸 **재사용**, P-4) 사용. 서브에이전트 **실 transcript**(text/thinking/tool 시간순 타임라인) + name/role/status. SubAgentModal(F10-02) 대체/확장 — 블러/Esc/바깥클릭은 FullscreenOverlay가 제공. 샘플데이터 → 실데이터.
- **AC**: ⓐ claude-stream parentToolId text/thinking 부여 단위 · ⓑ reducer parentToolId 이벤트→transcript append + 메인 thread 미관여(버그수정) 단위(+panelSession 동일) · ⓒ SubAgentInfo.transcript upsert 병합 단위 · ⓓ 풀스크린 transcript DOM + 블러 e2e.
- **리스크**: 버그수정이 기존 "서브에이전트 text가 thread에 보이던" 동작을 바꿈 — 의도된 수정(원본은 transcript로). 교차 B2(reducer/shared/threadTypes? threadTypes는 불변 — transcript는 SubAgentInfo). panelSession 동반.

### 9-R. plan-auditor 차단 해소 (구현 전 확정)
- **B1(골든 동반수정)**: `tests/agents/claude-stream.golden.test.ts:1078-1093`("parent text → 평범한 text 이벤트(회귀)") 기대값을 **`{type:'text', delta:'Child agent response.', parentToolId:'toolu_task_001'}`로 갱신**(버그수정의 일부, qa). 이름이 "영향없음(회귀)"이라 무심코 보존 금지.
- **B2(펌프 동반수정, 중요)**: `ClaudeCodeBackend._runPump`(L1012~1042) M5 text/thinking 처리 **앞에** early-skip 추가:
  ```ts
  if ((event.type === 'text' || event.type === 'thinking') && event.parentToolId) {
    this._push(event); continue   // 서브에이전트: 메인 stream M5 상태(_curTextId/_streamedThisMsg/messageId) 미관여 → reducer가 transcript 라우팅
  }
  ```
  서브에이전트 text는 full 메시지(parent_tool_use_id, `isStreamEventMsg=false`)로 도착 → 이 경로로 잡힘. **메인 stream 토큰 스트리밍(M5)·블록경계·펌프카운터 불변** 단정(AC ⓐ). (tool_call parentToolId의 `_curTextId=null` 리셋은 M4-4 기존 동작 — #3 범위 밖, 유지.)
- **R1(미러 동반)**: `src/renderer/src/lib/agentSampleData.ts`의 `SubAgentInfo`(동형 미러)에도 `transcript?` + `SubAgentTranscriptItem` 동반 추가 → 컴파일 green. AC 명시.
- **R2(충실도, Y3 고정)**: **SubAgentModal 컴포넌트 삭제 금지**(F10-02 자산). `FullscreenOverlay` body에 **기존 SubAgentModal body 구조(activity/도구 sec) 이식 + transcript 타임라인 추가**. §9 "대체/확장"을 "**body 이식**"으로 확정.
- **R3(누수 단정)**: transcript item은 모델 출력만 — `session_id`/`uuid` 등 raw SDK 필드 **0** 단정을 AC에 추가(claude-stream이 애초에 안 읽음).
- **회귀 안전(감사 확인)**: message-id-pump(picture parent_tool_use_id:null)·m4-4-subagent·task-tools.golden·thread-interleave 전부 **parent text 블록 미사용** → 영향 0. 깨지는 건 골든 1건(B1)뿐.

## 8. #4b 블랙박스 카드 — 설계 확정 (실코드 grounded, 2026-06-25)
> 코드 확인: `claude-stream.ts`(Workflow는 현재 일반 tool_call), `threadTypes.ts`(thread union — cmdresult 진행카드 패턴), `reducer.ts`(subagents 별도 슬라이스 · tool_result "subagent 매칭 우선" L275).

- **표현 위치**: orchestration 카드 = **thread ThreadItem**(대화 흐름 내 인터리브, `cmdresult` 진행카드 미러 — running→done in-place). 서브에이전트(별도 슬라이스)와 다름.
- **shared `agent-events.ts`**: 신규 `AgentEventOrchestration { type:'orchestration', id, name, description?, phases?: string[], script? }`(script는 풀스크린용 capped 모델출력 — raw SDK 아님). union 등록(backend-contract 깃발).
- **claude-stream.ts**(순수): `mapAssistantContent`에 `name==='Workflow'` 분기 추가(Task/TodoWrite 억제 패턴 미러) → meta **베스트에포트 파싱**(정규표현식으로 `export const meta = {…}`에서 name/description + phases[].title 추출, 실패 시 name='Workflow'·phases 생략) → `orchestration` 이벤트 emit, **일반 tool_call 억제**. tool_result는 기존대로 emit(reducer가 id 매칭).
- **threadTypes.ts**: `kind:'orchestration'` 추가 — `{ id, name, description?, phases?, running, failed?, result?, script?, time? }`(cmdresult 형상 미러).
- **reducer.ts**: `case 'orchestration'` → thread에 카드 push(running:true). `tool_result` 핸들러에 **orchestration id 매칭 우선 처리**(subagent 매칭 미러) → running:false + result(output) + failed(!ok). **CRITICAL(B2 교차)**: reducer/threadTypes 변경 → **panelSession 동반**(compile + APPLY_EVENT 정합), thread/openMsgId/seq 불변. snapshotForPersist는 msg만(orchestration 휘발 — OK).
- **renderer 카드**: 블랙박스 카드 컴포넌트 — running=Progress Circle + "UltraCode 실행 중 · <name>", done=✓ + "완료". 보라(--ultracode) 톤 일관. 클릭 → **풀스크린**(SubAgentModal 블러/Esc/바깥클릭 패턴 재사용·Y3): name·description·**phases 목록**·script(접기)·최종 result. "라이브 내부 진행 표시 없음(SDK 한계)" 명시 문구.
- **AC(측정가능)**: ⓐ meta 파서 단위(정상 meta→name/phases 추출, 깨진 meta→graceful fallback) · ⓑ claude-stream Workflow→orchestration 이벤트 + tool_call 억제 단위 · ⓒ reducer orchestration push + tool_result 매칭 done/failed 단위(+panelSession 동일 단정) · ⓓ 카드 running/done DOM + 풀스크린 열림/blur e2e.
- **리스크**: meta 파싱은 JS 객체 리터럴(JSON 아님) — 정규식 베스트에포트, 실패해도 카드는 동작(name fallback + raw script). 교차 동반(B2) 필수.

### 8-R. plan-auditor 차단 해소 (구현 전 확정)
- **B-1(인터리브 포인터)**: reducer `case 'orchestration'`(begin) → 카드 push **+ `openMsgId=null, openGroupId=null`**(cmdresult begin reducer.ts:259-261 미러). **tool_result done 매칭 분기는 포인터 미변경**(thread in-place map만, toolgroup in-place 갱신과 동형). AC: "orchestration push 후 openMsgId/openGroupId null" 단정 + "done 매칭은 포인터 불변" 단정.
- **B-2(패널 노출)**: orchestration 카드를 **패널에도 노출**(cmdresult 일관). `MultiWorkspace.tsx:420-423` 화이트리스트 필터에 `'orchestration'` 추가 + L533 렌더 분기 추가. AC ⓓ: **Conversation + MultiWorkspace 양쪽 DOM** 카드 렌더.
- **C-1(파싱 cap/ReDoS)**: meta 파서는 ① script를 **8KB로 truncate 후** 파싱 ② 정규식은 **비백트래킹**(부정 문자클래스 `[^}]`/`[^\]]` 사용, 그리디 `.*` 금지) ③ 운반 `script`도 **cap**(예: 4KB, `oneLine`/슬라이스). AC ⓐ-2: "거대(>8KB)·적대적 script → 파싱 즉시 반환(행 없음) + graceful fallback".
- **D-1(중립 fallback)**: 파싱 실패 시 emit하는 `name`은 **'Workflow' 리터럴 금지** → 중립어(예: 'UltraCode' 표기 또는 빈문자→렌더러가 'UltraCode' 표시). claude-stream 내부만 'Workflow' 알고, **이벤트 `name`엔 절대 'Workflow' 안 흐름**. AC ⓐ: "fallback name !== 'Workflow'".
- **P-2(매칭 순서)**: reducer tool_result 핸들러에서 **orchestration id 매칭을 toolgroup 분기(reducer.ts:498) *앞*(① subagent 앞 권장)**에 배치 → 미매칭 드롭(영원히 running) 방지. ③ toolgroup 분기는 불변(일반 도구 회귀 0). AC ⓒ: "orchestration tool_result → toolgroup 도달 전 매칭".
- **P-1(렌더 분기)**: `Conversation.tsx:654 return null` fallthrough에 orchestration 렌더 분기 추가(단일채팅). MultiWorkspace와 양쪽.
- **P-3(로그 가드)**: capped script는 사용자 코드일 수 있어 **로그(console/파일) 미출력**. AC 한 줄.
- **P-4(풀스크린 셸 공통화)**: 블러 오버레이 셸(overlay+Esc+바깥클릭+blur)을 **#4b에서 공통 `<FullscreenOverlay>`로 추출** → body만 분기(#4b=phases/script/result). #4b가 트랙A 선착이라 **공통화 주체** → #3 서브에이전트 풀스크린이 재사용. SubAgentModal(F10-02) 패턴 차용하되 폐기 X.
