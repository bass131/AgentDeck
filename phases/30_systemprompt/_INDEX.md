# Phase 30 — M2: systemPrompt 동적 주입 (W2α)

> 드라이버: `docs/WEAKNESS_BOOST.md` M2. 멀티 세션 영속(M3)의 선행 토대 — 패널별 커스텀 시스템 프롬프트 배관.
> 등급: **보통(다도메인)**. shared 계약 + agent-backend + renderer를 **한 커밋에 동반**(IPC 단일정의 규칙).

## 1. 목표 (왜)
원본 AgentCodeGUI는 **채팅/패널별 커스텀 프롬프트**(`sysPrompt`)를 매 실행마다 시스템 프롬프트에 append한다(원본 App.tsx L49/632, `claude/engine.ts` L308-312). 우리 `AgentRunRequest`엔 이 필드가 없어 패널별 페르소나/지침 주입 경로가 죽어있다 → M3(멀티 세션, 패널 메타에 sysPrompt 포함)의 선행 배관.

## 2. 범위 (무엇)
**한 줄 요약: `systemPrompt?: string`를 renderer→IPC→backend→SDK까지 end-to-end로 관통.** 원본 미러: 있으면 `append`, 없으면 기존 preset 그대로.

### IN
1. **shared `src/shared/ipc-contract.ts`** — `AgentRunRequest += systemPrompt?: string`. 신뢰경계 doc 주석: untrusted renderer 입력, **모델 컨텍스트에만** 주입·**길이 cap**·**로그 미노출**.
2. **agent-backend `src/main/agents/AgentBackend.ts`** — `AgentRunInput += systemPrompt?: string`(백엔드 계약).
3. **main IPC `src/main/ipc/index.ts` L341 핸들러** — 정규화(untrusted), 순서 **trim → 빈 체크 → cap**(S1): `typeof req.systemPrompt === 'string'` → `.trim()` → 빈문자면 `undefined` → 아니면 길이 > `MAX_SYSTEM_PROMPT_LEN`(신규 상수 16000자, codeunit `.slice(0,N)` — append는 모델 컨텍스트라 lone surrogate 무해, B2)이면 절단. **그리고 L369-371 `_runManager.start(backend, { messages, workspaceRoot, model, effort, mode }, …)` 객체 리터럴에 `systemPrompt` 키를 명시 추가**(B1 — 핸들러는 통째가 아니라 필드 명시선택이므로 추가 없으면 backend 미도달). **로그에 내용 출력 금지**(model/effort처럼 string-only 게이트 + 길이 cap).
4. **agent-backend `src/main/agents/ClaudeCodeBackend.ts` L661** — 원본 정밀 미러:
   ```ts
   systemPrompt: {
     type: 'preset',
     preset: 'claude_code',
     ...(this._req.systemPrompt?.trim() ? { append: this._req.systemPrompt.trim() } : {})
   }
   ```
   (없으면 기존 `{type:'preset',preset:'claude_code'}`와 동일 — 회귀 0.)
5. **renderer `src/renderer/src/store/panelSession.ts`** — `SendOptions += sysPrompt?: string`. `send()`의 `window.api.agentRun({...})`에 `systemPrompt: opts?.sysPrompt` 추가.

### OUT (이 Phase 아님)
- 패널별 sysPrompt **편집 UI**(프롬프트 모달) — M3(패널 메타 실데이터화)에서. M2는 *배관*만, UI 호출처(MultiWorkspace)는 아직 sysPrompt 미전달이어도 됨.
- 단일 대화(appStore) sysPrompt — M2는 panelSession 스코프(멀티 선행). 백엔드 지원은 양 경로 공유되므로 자동 수혜.
- systemPrompt 영속(M3 PersistedMultiState에 포함).

## 3. 도메인 R/W
| 도메인 | 파일 | R/W |
|---|---|---|
| shared-ipc | `src/shared/ipc-contract.ts`(AgentRunRequest) | W |
| agent-backend | `src/main/agents/AgentBackend.ts`(AgentRunInput)·`ClaudeCodeBackend.ts`(L661 append)·`src/main/ipc/index.ts`(정규화·cap) | W |
| renderer | `src/renderer/src/store/panelSession.ts`(SendOptions·send) | W |
| qa | `tests/**`(SDK options 단위·IPC payload 단위·스모크) | W |
| 불변(확인) | `src/preload/index.ts`(agentRun이 AgentRunRequest 통째 전달 → 타입만 확장, 코드 무변경)·reducer/threadTypes(send-path 필드라 이벤트/reducer 무관) | 무변경 |

## 4. 의존성 순서
1. 실패 테스트 먼저(systemPrompt → sdkOptions.append 단위 + IPC 정규화/cap 단위) → 2. shared 타입 → 3. AgentRunInput 타입 → 4. IPC 정규화 → 5. ClaudeCodeBackend append → 6. panelSession SendOptions/send → 7. typecheck 양쪽 green → 단위 green → 8. **스모크**(실 SDK 행동변화) → reviewer → commit → 트래커.

## 5. 측정가능 완료조건 (AC)
- [ ] **단위: SDK options 반영** — `_req.systemPrompt='Respond only in French'` → 빌드된 sdkOptions.systemPrompt = `{type:'preset',preset:'claude_code',append:'Respond only in French'}`. 미전달 → `{type:'preset',preset:'claude_code'}`(append 키 없음, 회귀 0). **빈문자열·공백만(`'   '`) → append 키 없음**(S2 — 직접 backend 호출 시도 빈문자 가드 byte-identical 증명).
- [ ] **단위: IPC 정규화/cap + 전달(B1)** — 핸들러가 비-string/빈/공백만 → undefined. 길이 > cap → cap까지 절단(trim 후 기준, S1). 정상 string → 통과. **`_runManager.start` 호출 인자에 `systemPrompt` 포함됨**을 spy로 단정(전달 라인 회귀가드). **로그에 내용 미출력**(console spy 또는 코드 리뷰).
- [ ] **단위: panelSession 전파** — `send(text,{sysPrompt:'X'})` → `window.api.agentRun` mock이 `systemPrompt:'X'`로 호출됨. 미지정 → `systemPrompt:undefined`.
- [ ] **스모크(실 SDK 행동변화·결정적 마커, S3)** — vite-node로 실 ClaudeCodeBackend 직접 구동: systemPrompt="You must begin EVERY response with the exact marker ###FR### and then answer only in French." + messages=[{user:'Hello, who are you?'}] → 응답에 **결정적 마커 `###FR###` 존재**(append 실효의 객관 증명, LLM 비결정성 회피). 대조: systemPrompt 없이 같은 입력 → 마커 부재. (언어=프랑스어는 부차 관찰.)
- [ ] **회귀 0**: systemPrompt 미전달 시 기존 run 동작 동일(typecheck 양쪽 green·기존 backend/ipc 테스트 green).
- [ ] **신뢰경계**: systemPrompt가 CLI 인자/파일경로/로그로 새지 않음(SDK 컨텍스트만). reviewer 확인.

## 6. 검증 3층
- **① 단위 TDD**: sdkOptions append 형상 + IPC 정규화/cap + panelSession 전파(mock). 실패 먼저.
- **② 스모크**: 실 SDK "프랑스어로만" → 프랑스어 응답(관찰가능 행동변화). systemPrompt 유/무 대조.
- **③ 실 런타임**: (선택) LIVE_SDK e2e — 멀티 패널 send에 sysPrompt 실어 응답 언어 변화 DOM. M2는 UI 미포함이라 스모크가 주 증명, e2e는 M3에서 패널 메타와 통합.

## 7. 리스크·롤백
- **신뢰경계(주의)**: untrusted systemPrompt 무검증 주입. 완화 = IPC string-only 게이트 + 길이 cap + 로그 미노출 + reviewer(필수, shared+AgentBackend 변경).
- **append 형상 오류**: SDK가 `append` 키를 무시하면 행동변화 0 → 스모크가 즉시 검출(프랑스어 안 나오면 fail). 원본 정밀 미러로 위험 최소.
- **회귀**: append 분기가 미전달 케이스를 바꾸면 기존 run 깨짐. 완화 = spread 조건부(`?.trim() ?`)로 미전달 시 기존과 byte-identical + 회귀 단위.
- **롤백**: 필드 추가 + 1줄 append 분기 → git revert 1커밋. 미전달 시 동작 불변이라 안전.

## 8. ADR
- 불요. backend-contract/IPC 깃발(충실도 복원 — Phase21/M4-1 선례). 문서 흔적(이 _INDEX) + reviewer로 충분.
