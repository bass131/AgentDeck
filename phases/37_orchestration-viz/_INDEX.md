# Phase 37 — 에이전트 오케스트레이션 시각화 (SubAgent 보강 + Workflow 블랙박스)

> **compact 생존 정의서.** 사용자 결정(2026-06-25): 서브에이전트 오케스트레이션을 *진짜로* 시각화(트리+풀스크린 transcript) + Workflow는 블랙박스 카드. 압축돼도 이 문서에서 이어간다. push 0(인간 게이트). 막힘=[[loop-stuck-policy]].

## 0. 검증된 SDK 사실 (claude-code-guide 4회 확인 — 재조사 불요)
- **서브에이전트(Agent/Task 도구) = 완전 관측가능**: 메시지에 `parent_tool_use_id`가 붙어 부모-자식 구분. `forward_subagent_text:true`(SDK 옵션) + `includePartialMessages:true`(**우리 M5에 이미 있음**) → 각 서브에이전트 **full transcript 재구성 가능**. Task는 `TaskUpdate`(in_progress→completed)도 스트림됨.
- **Workflow 도구 = 실행 가능하나 내부 완전 블랙박스**: SDK 0.3.149+에서 `allowedTools:["Workflow"]`로 에이전트가 **호출 가능**(우리 0.3.186). 단 격리 런타임 out-of-band 실행 → query() 스트림엔 **`tool_use`(호출, 입력 포함) + `tool_result`(최종)만**. 내부 phase/병렬에이전트/log/진행 **0**. progress API·polling·SSE **없음**(공개). CLI `/workflows` 트리는 **CLI가 런타임 주인이라 자기 UI에 렌더하는 것** — SDK 호스트엔 그 통로 없음. **설계 의도**(메인 컨텍스트 토큰 절약 위해 일부러 가림).
- **`/workflows` 슬래시**: SDK `slash_commands` 목록에 없음 → SDK 세션에서 미작동.
- **호스트가 Workflow에서 얻는 것**: 호출 시점·**입력(스크립트의 `meta`={name,description,phases})**·실행중 여부(호출~결과 사이)·최종 결과. = "계획된 phase 목록 + 진행상태 + 결과"까지 표시 가능, *어느 phase가 라이브인지*만 불가.

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
- **agent-backend**: **Workflow 도구 활성화** `allowedTools:["Workflow"]` — 단 **자동승인 금지, 권한 게이트**(canUseTool로 "Workflow 실행 허용?" 권한모달). 사용자 결정: **게이트**(자동승인 X — 대규모=비용).
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

## 6. 이번 세션 선행 완료 (참고)
약점보강 8마일스톤 ✅(M1~M8, 별도) 후 UX 배치: #1 멀티패널 사전입력 제거·#2 단일모드 자동표시 제거·#7 타이틀바 AgentDeck·#5 우측패널 가변너비·#6 Ctrl+/- 에디터폰트 — 전부 커밋됨. m4-4 실버그 수정으로 전체 2980 green. push: GitHub `bass131/AgentDeck`(Private) 연결됨.
**잔여(이 Phase)**: #3 서브에이전트 보강 + #4 Workflow 블랙박스. **사용자 게이트 문서**(ADR-006 supersede·ADR-021·CLAUDE.md·main-process.md sqlite→JSON) 여전히 미적용.
