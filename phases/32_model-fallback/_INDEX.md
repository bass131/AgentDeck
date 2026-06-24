# Phase 32 — M4: model-fallback notice (W4)

> 드라이버: `docs/WEAKNESS_BOOST.md` M4. 죽은 경로 부활(Fable 정책 거부→폴백 알림) + **M5 스트림 토대**(stream_event·retract 경로 선검증).
> 등급: **보통(다도메인)**. shared(event) + agent-backend(emit) + renderer(reducer consume). 한 커밋 동반.

## 1. 목표 (왜)
원본은 Fable 5 안전정책 거부(`stop_reason:'refusal'`) 시 **폴백 모델(Opus) 자동 전환** + 채팅에 경고 배너(NoticeItem). SDK 폴백은 dialog-gated: `supportedDialogKinds:['refusal_fallback_prompt']` 선언+auto-accept해야 turn이 폴백 모델로 재시도되고 세션이 거기 머문다. 우리는 이 경로가 죽어있어 Fable 거부 시 turn이 그냥 죽음. + retractMessageId 경로는 M5(토큰 스트리밍)에서 거부된 부분 버블 제거에 재사용.

## 2. 범위 (무엇) — 원본 `claude/engine.ts` 정밀 미러
### A. shared `src/shared/agent-events.ts`
- `AgentEventModelFallback { type:'model-fallback'; runId?: string; fromModel: string; toModel: string; text: string; retractMessageId?: string | null }` 신설 + `AgentEvent` union 등록. (backend-contract 깃발.)

### B. agent-backend `src/main/agents/ClaudeCodeBackend.ts`
1. `fallbackNotice(from, to, category): string`(원본 미러) + `modelDisplay`/`REFUSAL_CATEGORY_LABEL`(원본 상수 이식) — **모델명/카테고리만** 사용(신뢰경계). 한국어 텍스트: "{from}의 안전 정책이 ... {to} 모델로 자동 전환했어요{ (분류) }. 이후 대화도 {to} 모델로 진행됩니다." **graceful degrade(권고1)**: from/to 빈 문자열이면 modelDisplay 폴백('다른 모델' 등) — 단위 고정.
2. sdkOptions(L656~): `supportedDialogKinds: ['refusal_fallback_prompt']` + `onUserDialog`(원본 engine.ts L330-353 미러) — **반드시 화살표 함수**(권고2: `this._curTextId`/`this._pendingFallbackNotices`/`this._push` 접근, function 키워드면 this 손실):
   - `dialogKind !== 'refusal_fallback_prompt'` → `{behavior:'cancelled' as const}`(SDK 계약: CLI 기본동작).
   - else: `_pendingFallbackNotices++`, thinking 열려있으면 thinking_clear emit, `model-fallback` emit(fromModel/toModel=**payload.originalModel/fallbackModel(camelCase)** typeof string 가드, text=fallbackNotice(...), **retractMessageId=this._curTextId**), `_curTextId=null` 리셋, return `{behavior:'completed' as const, result:'retry_fallback'}`.
3. 펌프 `_runPump` 루프: `system/model_refusal_fallback` 처리(원본 L398-414 미러) — **`mapClaudeStreamLine(msg)` 호출 직전 전처리 분기**(권고: `claude-stream.ts` L421-425 `case 'system'`이 무조건 `[]`로 삼키므로 매퍼 전에 raw-msg 분기 신설, claude-stream.ts는 **순수 유지**, `_handleTaskToolCall` 후처리 패턴과 동형): `if(isObject(msg) && msg.type==='system' && msg.subtype==='model_refusal_fallback'){ if(_pendingFallbackNotices>0) _pendingFallbackNotices--; else emit model-fallback(fromModel/toModel=**msg.original_model/fallback_model(snake_case)**, retractMessageId=**null** — turn 끝 stream id가 재시도 답변 것일 수 있어 retract 금지); continue }`.
4. `_pendingFallbackNotices` 인스턴스 필드(run당, dialog 콜백·펌프 system 핸들러가 `this` 공유). **신뢰경계 CRITICAL**: dialog/system payload 중 모델명/카테고리 string만 추출(typeof 가드), raw payload 미노출·미로그.

### C. renderer `src/renderer/src/store/reducer.ts`
- `case 'model-fallback'`(applyAgentEvent — panelApply가 자동 위임):
  - **retract**: `event.retractMessageId` 있으면 `thread`에서 `kind==='msg' && id===retractMessageId`인 항목 제거(거부된 부분 버블 → 재시도 답변이 새 버블로). `openMsgId===retractMessageId`면 `openMsgId=null`(필요시 openGroupId 정리).
  - **push notice**: `{kind:'notice', id:'fb'+(seq+1), text:event.text}` thread append(원본 session.ts L349 `fb${seq}` 미러), seq++. (prefix `fb`로 msg(`m`)/toolgroup(`tg`)와 충돌 0 — 단위 고정.)
- NoticeItem 렌더 = **완비**(Conversation.tsx L275-282/L629-630, panel 패널뷰 동일). 변경 불요.

### OUT
- 실제 Fable 거부 트리거(비결정) — 스모크는 합성 dialog/system 주입(아래 ②).
- M5 스트림(includePartialMessages) — retract 경로만 선배치, partial은 M5.

## 3. 도메인 R/W
| 도메인 | 파일 | R/W |
|---|---|---|
| shared-ipc | `src/shared/agent-events.ts`(event union) | W |
| agent-backend | `src/main/agents/ClaudeCodeBackend.ts`(fallbackNotice·onUserDialog·system 핸들러·_pendingFallbackNotices) | W |
| renderer | `src/renderer/src/store/reducer.ts`(model-fallback case: retract+notice push) | W |
| qa | `tests/**`(reducer notice+retract 단위·핸들러 emit/dedup·NoticeItem DOM) | W |
| 불변(확인) | `panelSession.ts`(applyAgentEvent 위임 → 자동 수혜, 무변경)·threadTypes(notice kind 기존)·Conversation NoticeItem(완비) | 무변경 |

## 4. 의존성 순서
1. 실패 테스트 먼저(reducer model-fallback retract+notice 단위·fallbackNotice 텍스트·onUserDialog emit+system dedup) → 2. shared event → 3. ClaudeCodeBackend(fallbackNotice+onUserDialog+system+counter) → 4. reducer case → 5. typecheck 양쪽 green → 단위 green → 6. **스모크**(합성 주입) → reviewer → commit → 트래커.

## 5. 측정가능 완료조건 (AC)
- [ ] **reducer 단위(notice+retract)**: model-fallback(retractMessageId='X') → thread에서 msg 'X' 제거 + notice push(text). retractMessageId=null → 제거 없이 notice만. openMsgId 정리 확인.
- [ ] **fallbackNotice 텍스트 단위**: from/to/category → 한국어 문구 정확(category 없으면 분류 괄호 생략). modelDisplay 매핑.
- [ ] **핸들러 emit+dedup 통합(②·권고5)**: `makeCaptureQuery`(tests/agents/claude-question.test.ts L49-67 패턴)로 `opts.onUserDialog` 캡처→호출 + `system` 메시지를 `messages` 배열에 yield해 **실제 펌프 `for await` 통과**(핸들러 직접 호출 금지). 3케이스: ⓐ dialog-only → emit 1회(retractMessageId=_curTextId) + return `{behavior:'completed',result:'retry_fallback'}` ⓑ system-only → emit 1회(retractMessageId=null) ⓒ dialog+system → dedup으로 **총 emit 1회**.
- [ ] **NoticeItem DOM**: notice ThreadItem → `.notice-row/.notice-text` 렌더(text 표시). (기존 렌더 회귀 0.)
- [ ] **신뢰경계**: dialog/system payload의 raw 객체가 이벤트/로그로 안 샘 — fromModel/toModel/category(string)만. reviewer 확인.
- [ ] **회귀 0**: 기존 run/reducer/panelSession 테스트 green. typecheck 양쪽 green.

## 6. 검증 3층
- **① 단위 TDD**: reducer retract+notice · fallbackNotice 텍스트 · 핸들러 emit/dedup(합성).
- **② 스모크**: vite-node 실 ClaudeCodeBackend — 합성 dialog/system 주입(실 Fable 거부는 비결정이라 합성)으로 emit 1회·dedup 관찰. (M2 스모크 하네스 재사용 가능.)
- **③ DOM**: NoticeItem 렌더(jsdom).

## 7. 리스크·롤백
- **신뢰경계**: dialog payload raw 노출. 완화 = 모델명/카테고리 string만 추출 + reviewer.
- **dedup 경계**: dialog/system 둘 다 fire 시 중복 배너. 완화 = _pendingFallbackNotices 카운터(원본 미러) + dedup 단위 테스트.
- **retract 오제거**: retractMessageId가 잘못된 msg를 지우면 대화 손상. 완화 = kind==='msg' && id 정확매칭만, retractMessageId=null이면 무제거. 단위 가드.
- **교차**: reducer 변경이 panelApply 자동 위임 → panel 회귀 가드(기존 multi-concurrent green).
- **롤백**: event 추가 + 1 case + onUserDialog 블록 → revert 1커밋. retractMessageId 경로는 M5 전까지 거의 무발화(안전).

## 8. ADR
- 불요. backend-contract/IPC 깃발(충실도 복원). 문서 흔적(_INDEX) + reviewer.
