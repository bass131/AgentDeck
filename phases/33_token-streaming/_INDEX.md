# Phase 33 — M5: 진짜 토큰 스트리밍 (W1) 〔최고 리스크·격리〕

> 드라이버: `docs/WEAKNESS_BOOST.md` M5. Phase A 전제(includePartialMessages:false) 역전 → **인터리브 회귀가 최우선 위험**. 롤백=1줄.
> 등급: **보통(격리)**. agent-backend(펌프+매퍼) 단독. **reducer 무변경**(append-only 검증됨).

## 1. 목표 (왜)
현재 어시스턴트 답변이 **블록 통째로** 한 번에 떨어짐(includePartialMessages:false). 원본은 **토큰 단위 스트리밍**(includePartialMessages:true, stream_event 델타). UX 격차 W1. retract 토대(M4)는 이미 선배치.

## 2. 설계 (검증된 사실 기반)
**핵심 사실(검증)**: reducer `text` 케이스(reducer.ts L228-235)는 `item.text + event.delta`로 **append-only** — 같은 messageId면 누적, 새 id면 새 버블. Phase A(블록당 1 text 이벤트)와 M5(델타 N개 같은 messageId)를 **동일 코드로** 처리. ⇒ **reducer·renderer 무변경**.
**접근(드라이버)**: 델타로 버블을 쌓고, full 텍스트 블록은 `_streamedThisMsg`면 **suppress**(원본 finalize 대신 — reducer 무변경 + 롤백 1줄 우선). 델타==full 텍스트 가정(SDK 델타는 정확히 full로 concat — 정상).

### A. `src/main/agents/ClaudeCodeBackend.ts`
1. L660 `includePartialMessages: false` → **`true`**. (**롤백 안전선**: 이 1줄 복귀 → 즉시 Phase A.)
2. 인스턴스 필드 `_streamedThisMsg = false`. **초기화(B2·CRITICAL)**: 필드 기본값 `false` + **run 루프 진입 전 명시 `this._streamedThisMsg=false`** + **finally 리셋**(`_pendingFallbackNotices` 위치 L947). 셋 다 — 인스턴스 재사용/abort 재run 시 stale true가 첫 full 텍스트 오suppress 방지.
3. **content_block_start 경계 처리(B1·CRITICAL)** — 펌프 `_runPump` 루프 raw-msg 전처리(system/model_refusal_fallback 전처리 옆): stream_event이고 `obj.event.type==='content_block_start'`이면 **`this._curTextId=null`**(새 콘텐츠 블록 = 새 버블). 한 assistant 턴 내 text→tool→text 멀티블록에서 둘째 text가 첫 버블에 병합되는 회귀 차단. (mapClaudeStreamLine 호출과 무관한 펌프 stateful 후처리.)
4. 펌프 이벤트 루프(L916~) — msg 출처로 델타/full 구분(`isStreamEvent = isObject(msg) && (msg as any).type==='stream_event'`):
   - `event.type==='text'`:
     - **isStreamEvent(델타)**: `_curTextId ??= _nextBlockId()`, `event.messageId=_curTextId`, **`_streamedThisMsg=true`**, push.
     - **else(full 텍스트 블록)**: `if(_streamedThisMsg) continue`(**suppress** — 델타가 이미 버블 빌드). else `_curTextId ??= _nextBlockId()`, `event.messageId=_curTextId`, push(**Phase A 폴백** — 델타 미도착 시).
   - `event.type==='thinking'`이고 `!isStreamEvent && _streamedThisMsg` → `continue`(full thinking suppress, 원본 L459 미러 — 늦은 thinking 표시 0). (reducer text 케이스 L258이 thinkingText:null로 추가 안전망 — 첫 델타가 thinking 해소.)
   - `event.type==='tool_call'`: `_curTextId=null`(인터리브 경계, **무변경**).
5. **메시지 경계 리셋(L934 구조 변경·CRITICAL·S3 정밀화)**: 현재 매 msg `_curTextId=null`. M5 — **assistant(full) msg에서만** 리셋(델타 사이 비-stream_event 끼임에 의한 분절 방지):
   - `if(isObject(msg) && (msg as any).type==='assistant'){ this._curTextId=null; this._streamedThisMsg=false }`(원본 L486-488 미러).
   - stream_event/user/result/system msg 경계: `_curTextId` **무리셋**(델타 누적 유지 + 분절 0). 블록 경계는 content_block_start(3)·tool_call(4)이 담당.
   - **Phase A 호환 검증(false 모드)**: stream_event 미발화 → 각 assistant msg가 자족 블록 → assistant 경계 리셋이 현행 매-msg 리셋과 동일 효과(연속 assistant 2개도 각자 리셋 → 별 버블). 회귀 0.

### B. `src/main/agents/claude-stream.ts` (순수 유지)
- `case 'stream_event'`(L427-431, 현재 `[]`): `obj.event.type==='content_block_delta' && obj.event.delta.type==='text_delta' && delta.text` → `[{type:'text', delta: delta.text}]`(원본 engine.ts L418-425 미러). 그 외 stream_event 서브타입(content_block_start/stop·thinking_delta·input_json_delta) → `[]`(M5 텍스트만). **무상태 순수** 유지.

### C. renderer — **무변경**(검증). reducer append-only가 델타 누적·full suppress를 그대로 처리.

### OUT
- thinking 토큰 스트리밍(thinking_delta) — 후속. M5는 텍스트만.
- 도구 생성 인디케이터(content_block_start tool_use "파일 작성 중", 원본 L433-442) — 후속.
- finalize(권위 텍스트 교체) — suppress로 충분(델타==full 가정). 후속 견고화 후보.

## 3. 도메인 R/W
| 도메인 | 파일 | R/W |
|---|---|---|
| agent-backend | `src/main/agents/ClaudeCodeBackend.ts`(includePartial·_streamedThisMsg·펌프 리셋)·`claude-stream.ts`(stream_event→text 매퍼·순수) | W |
| qa | `tests/**`(펌프 단위·인터리브 회귀가드·라이브 e2e) | W |
| 불변(확인·CRITICAL) | `reducer.ts`(append-only 무변경)·panelSession·threadTypes·Conversation | **무변경** |

## 4. 의존성 순서
1. 실패 테스트 먼저(매퍼 stream_event→text·펌프 델타 누적+full suppress·**인터리브 회귀가드**) → 2. claude-stream stream_event 매퍼 → 3. 펌프 _streamedThisMsg+리셋 구조 → 4. includePartialMessages:true → 5. typecheck 양쪽 green → 단위 green → 6. **라이브 e2e**(토큰 단조+인터리브) → reviewer → commit → 트래커.

## 5. 측정가능 완료조건 (AC)
- [ ] **매퍼 단위(순수)**: stream_event content_block_delta text_delta "Hi" → `[{type:'text',delta:'Hi'}]`. 그 외 서브타입 → `[]`. 무상태(같은 입력 같은 출력).
- [ ] **펌프 델타 누적+suppress 단위(중복0·핵심)**: 델타 N개(같은 stream_event 흐름) + 이어서 assistant full 텍스트 → **버블 1개**(델타 누적, full suppress). 같은 messageId. 중복 텍스트 0.
- [ ] **인터리브 회귀가드(CRITICAL·Phase A AC① 재실행)**: `델타"A"(stream_event) → assistant(full: text"A"+tool_use) → user(tool_result) → 델타"B"(stream_event) → assistant(full: text"B")` → thread `[msg"A", toolgroup, msg"B"]`(중복0·순서정확). _curTextId가 델타 across 누적·tool_call/assistant 경계 리셋 정확.
- [ ] **멀티블록 분리(B1·CRITICAL)**: 한 턴 내 `content_block_start(text0) → 델타"A" → content_block_start(tool) → content_block_start(text2) → 델타"B"` → "B"가 "A"에 병합 안 됨(별 버블 a1/a2). content_block_start 리셋 검증.
- [ ] **연속 run stale(B2·CRITICAL)**: 첫 run 스트리밍 발생(_streamedThisMsg=true 종료) → 둘째 run 시작 시 첫 full 텍스트 suppress 0(시작 초기화로 stale 차단).
- [ ] **Phase A 폴백**: 델타 없이 assistant full만(스트리밍 미발생 가상) → full 텍스트 emit(suppress 안 함) → 버블 1개(회귀 0). 공백-only full → 빈 버블 0(S2).
- [ ] **델타 사이 비-stream_event 끼임(S3)**: 델타"A" → (가상 result/context msg) → 델타"A2" → 같은 버블 누적(_curTextId 분절 0, assistant 외 경계 무리셋).
- [ ] **thinking 글리치 0**: 스트리밍된 메시지의 full thinking suppress(_streamedThisMsg) — 늦은 thinking 표시 0. 비스트리밍(_streamedThisMsg=false) 메시지는 thinking 정상.
- [ ] **기존 Phase A 인터리브 테스트 양립(S4)**: includePartialMessages:true 전환 후 기존 인터리브/펌프 테스트가 green 유지되거나, 깨지면 새 SDK 모드에 맞게 수정(의도적). 회귀 0 보장.
- [ ] **라이브 e2e(실 SDK·핵심)**: `LIVE_SDK=1` — 실제 답변이 **토큰 단조증가**(중간 스냅샷 텍스트 길이 증가) + 도구 사용 답변에서 **인터리브 동시 단정**([msg,toolgroup,msg]).
- [ ] **회귀 0**: reducer/panel/기존 backend 테스트 green. typecheck 양쪽 green. 기존 실패 2건(m4-4-*) 증가 0.
- [ ] **롤백 검증**: includePartialMessages:false 복귀 시 Phase A 동작(개념 — 1줄 revert 안전선 문서).

## 6. 검증 3층
- **① 단위 TDD**: 매퍼 stream_event→text · 펌프 델타누적+full suppress + thinking suppress · **인터리브 회귀가드**(Phase A AC① 재실행).
- **② 스모크**: vite-node 실 ClaudeCodeBackend — 실 SDK 응답에서 text 이벤트가 **여러 델타로 분할 수신**(블록 통째 아님) 관찰.
- **③ 라이브 e2e**: Playwright `_electron` `LIVE_SDK=1` — 토큰 단조증가 스냅샷 + 인터리브 DOM 동시 단정.

## 7. 리스크·롤백 (최우선)
- **인터리브 회귀(최우선)**: partial streaming이 Phase A 전제 역전 → ⓐ full 중복(suppress 누락) ⓑ 델타가 toolgroup 경계 병합(_curTextId 리셋 오류) ⓒ 델타 across msg 분절(_curTextId 매 msg 리셋 시 토큰마다 새 버블). 완화 = `_streamedThisMsg` suppress 펌프 단위 선검증 / `_curTextId` 리셋을 stream_event 제외로 / messageId=펌프 카운터 불변 / **인터리브 회귀가드 + 토큰단조 동시 단정**.
- **델타≠full 가정 깨짐**: SDK 델타가 full과 불일치(드묾) → suppress가 권위 텍스트 손실. 완화 = 정상 경로(델타 concat=full) 가정 + 라이브 e2e 단조 검증. 견고화(finalize)는 후속.
- **thinking 글리치**: full thinking이 스트리밍 후 늦게 표시. 완화 = _streamedThisMsg thinking suppress(원본 L459).
- **롤백 안전선**: `includePartialMessages: true→false` **1줄** 복귀 → 즉시 Phase A(reducer·매퍼 무관, stream_event 매퍼는 미발화로 무해). 매퍼 stream_event 추가도 false면 미수신이라 dead-safe.

## 8. ADR
- 불요. backend-contract 깃발(충실도 복원). 문서 흔적(_INDEX) + reviewer.
