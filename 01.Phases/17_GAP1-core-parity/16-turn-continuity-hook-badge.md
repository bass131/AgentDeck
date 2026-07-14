---
owner: 영호
milestone: GAP1
phase: 16
title: 턴 연속성 + 훅 빨간 배지 — 사고↔답변 시각 연결·훅 차단 메시지 배지 (표면 3종)
status: done
grade: 복잡 (renderer 주도 + ui-visual — coordinator 경유, reviewer 무조건)
risk: ui-visual
loop_track: human-visual
estimated: 3~6h
domain: renderer
summary: 영호 육안 피드백 2건(2026-07-15, GAP1 마감 육안 중) — ① "사고 중, 토큰 실시간으로 올라가는 아이콘이랑 이후 클로드가 답변하는 게 분리되어서 가시성이 별로" ② "Hook 알림이 채팅 입력 UI 위에 나오는 것도 좋은데, 클로드 답변 메시지에 빨간색 Badge 형식으로도 있으면 더 좋겠다" + ③ 단일챗만 말고 멀티 채팅·서브에이전트 흐름에도 적용. 스카우트 실측 2회(2026-07-15): 분리 원인 5개 = 사고 전문 ThinkingItem(Conversation.tsx:232-293)·라이브 스피너 WorkingIndicator(:173-211, thread.map 밖 하단 :993-1004)·assistant 버블(:838-867 인라인 JSX)이 각자 아바타를 가진 독립 .msg 블록 3개로 나열(턴 래퍼 없음) + .thread gap 24px(Conversation.css:27) + 아바타 불일치(사고=IconClaude·답변=IconSpark) + 스피너 하단 소멸→답변 위쪽 별개 등장(handleText가 thinkingText=null, text.ts:115) + 사이 요소(toolgroup 등) 삽입 가능. 실시간 토큰 = thinking 아이템 estimatedTokens(threadTypes.ts:68, handleThinkingDelta text.ts:192-223) — 컴포저 ctx-strip은 done 시점만이라 무관. 훅 데이터 두 갈래 = hookRuns 생명주기(별도 상태, 턴 연결 필드 무 — reducer.ts:234가 time만 전달, runId는 엔벨로프에 있으나 미배선)·차단 계열(informational level warning/preventContinuation + permission-denied decisionReasonType==='hook')은 thread 인라인이라 턴-인접 즉시 활용 가능. 표면 지도 = 멀티 패널 PanelView.tsx는 자기 thread.map(:490-577)이나 리프(ThinkingItem·WorkingIndicator·MessageBubble·HookTimeline)는 Conversation에서 import 재사용(자동 전파) — 단 assistant 버블은 단일챗 인라인 vs 패널 MessageBubble(:568)로 경로 상이. 서브에이전트 SubAgentChatStream.tsx는 별도 .saf-msg--thinking(:156-164) + MessageBubble(:171) — 훅 데이터·estimatedTokens는 SubAgent 계약(agent-events.ts:287-300)에 부재라 훅 배지 불가(명시 보류). 방침 = DOM 재구조(턴 래퍼) 대신 저위험 인접 연출 + 공용 배지 조각, shared/main 무접촉(renderer+renderer store만).
---

# Phase 16: 턴 연속성 + 훅 빨간 배지 — 표면 3종

> **상태**: ✅ done (2026-07-15 — GAP1 마감 후 편입 P16)
> **마일스톤**: GAP1 (마감 육안 게이트 중 영호 피드백 편입 — P13~P15 편입 관례)
> **등급**: 복잡 (renderer 주도 + ui-visual → coordinator 경유, reviewer 무조건)
> **담당**: coordinator 경유 — renderer 주도 + qa(TDD RED 선행). reviewer 무조건
> **실행 순서**: GAP1 마감 플립 뒤 후속 마디 — push/PR 전 같은 브랜치에 쌓음(영호 육안 재검 1회로 P13~P16 일괄)

---

## 🎯 목표

영호 육안 피드백 2건을 표면 3종(단일챗·멀티 패널·서브에이전트)에 반영한다. 끝나면: ① 사고 중 표시(스피너·실시간 토큰 카운트)와 그 턴의 답변 버블이 하나의 흐름으로 읽히고(분리감 해소), ② 훅이 도구를 차단하거나 진행을 막은 턴의 assistant 메시지에 빨간 배지가 붙어 컴포저 위 HookTimeline을 열지 않아도 "이 턴에 훅 개입이 있었다"가 대화 스트림 안에서 보인다.

---

## 📐 확정 스펙 (영호 2026-07-15)

- **사고↔답변 연속성**: 사고 중 인디케이터(토큰 실시간 카운트 포함)와 이후 답변이 분리돼 보이지 않게. 구현 방향은 renderer 재량이되 **DOM 대재구조(턴 래퍼 도입) 대신 저위험 인접 연출 우선** — 근거: thread.map 렌더 루프와 기존 테스트·e2e 셀렉터 계약 보존. (검토안: (A) 턴 카드 래퍼 신설 — 구조 깨끗 / 렌더 루프·테스트 대격변 vs (B) 인접 아이템 연출 — thinking 다음 assistant 인접 시 gap 축소·연결 시각 언어·아바타 정합, 저비용 / 사이 삽입 요소 케이스 처리 필요 → **(B) 우선**, 부족 판정 시 (A) 상신)
- **훅 빨간 배지**: 기존 컴포저 위 HookTimeline은 **유지**(전역 요약), 추가로 해당 턴 assistant 메시지에 빨간 배지 **병행**. 배지 클릭/호버로 사유 확인 가능하면 가산점(기존 `.msg-interrupted` muted pill 관례 옆이 자연 삽입점 — Conversation.tsx:853-855).
- **표면 3종 적용**: 단일챗 + 멀티 패널 + 서브에이전트. 단 서브에이전트 훅 배지는 데이터 부재(아래 보류)로 이번 범위 밖.
- **추적성 명시 (plan-auditor 🟡1)**: 본 Phase는 Track 1 CLI 패리티가 아니라 영호의 GAP1 게이트 확장("성능·안정성·UX" — 2026-07-14)에 근거한 UX 개선이다. GAP1 마감 플립(8d540ce) 후 편입이므로, push/PR 전에 추적 3문서(_milestone-plan.md·GAP1-DONE.md·FEATURE_MAP.md)의 "15/15 done·사람게이트만 잔여" 명제를 16 Phase 체제로 정정해야 한다(plan-auditor 🔴 조건 — P16 완료 후 마감 증분 마디에서 해소).
- **판정 기록**: plan-auditor 조건부 GO(2026-07-15) — 🔴1 추적문서 화해(push/PR 전)·🟡 결합 규칙 결정론 핀(RED에 명시 단정)·🟡 Track 2 성격 명시(본 항목)·🟡 크기 상단 경계(coordinator 재량 분리 가능).

---

## ⏪ 사전 조건 (스카우트 실측 2026-07-15 — 전부 확보)

- [x] **분리 원인 5개 확정** — summary 참조(독립 블록 3개·gap 24px·아바타 불일치·스피너 소멸 단절·사이 삽입).
- [x] **훅 차단 데이터 즉시 가능분 확정** — `permission-denied`(decisionReasonType==='hook', threadTypes.ts:204-211)·`informational`(level warning/preventContinuation, :184-194)은 thread 인라인 = 턴-인접. 렌더 레이어 파생 계산만으로 배지 성립(무배선).
- [x] **생명주기 hookRuns 턴 연결은 renderer 내부 배선으로 가능** — runId가 AgentEventPayload 엔벨로프에 이미 존재(reducer.ts:214-216에서 다른 핸들러가 사용 중), handleHookLifecycle(cockpit.ts:35-96)에만 미전달(reducer.ts:234). **shared 계약 무접촉**.
- [x] **멀티 패널 자동 전파 경계 확정** — 공유 리프(ThinkingItem·WorkingIndicator·MessageBubble·HookTimeline)는 자동 전파, 컨테이너 루프(PanelView.tsx:490-577)·assistant 버블 경로(단일 인라인 vs 패널 MessageBubble)는 별도 적용 필요.
- [x] GAP1 마감 플립 완료(8d540ce) — 본 Phase는 후속 마디로 같은 브랜치에 쌓음.

---

## 📝 작업 내용

- [x] **(a) TDD RED 선행 (qa)** — 실패 테스트 먼저: ① 훅 배지 파생 로직 — thread에 permission-denied(hook)/informational(warning) 아이템이 있는 턴의 assistant 메시지에 배지 플래그가 계산되는지(파생 함수는 순수 함수로 분리해 결정론 판정) ② 연속성 인접 판정 — thinking 다음 assistant(사이 toolgroup 허용/불허 케이스 포함) 인접 감지 로직 ③ hookRuns runId 배선 — hook_lifecycle 이벤트의 runId가 HookRun에 저장되는지. → `15b0794` 21 FAIL.
- [x] **(b) renderer: 연속성 연출 (단일챗)** — thinking→assistant 인접 시각 연결(gap 축소·연결 언어), WorkingIndicator→답변 전환 연속화, 아바타 정합. **아바타 통일은 원본(AgentCodeGUI) 충실도 실측 먼저** — 원본이 사고/답변 아이콘을 구분하면 통일은 이탈이므로 다른 연출(연결 레일 등)로 해소하고 사유 기록, 원본 무구분이면 통일. → 원본 무구분 실측 → IconSpark→IconClaude 통일(`c03fada`).
- [x] **(c) renderer: 훅 빨간 배지 공용 조각** — HookBadge(가칭) 신규: 즉시 가능분(턴-인접 파생) 우선 + hookRuns 생명주기는 runId 배선(reducer.ts:234 → cockpit.ts:35 → HookRun 타입 확장, renderer 내부만) 후 status==='error' 연결. 삽입점: 단일챗 인라인 assistant 마크업(Conversation.tsx:838-867 .meta 영역) + MessageBubble prop(멀티 패널·서브 응답 자동 전파). 빨강 톤은 기존 NoticeItem tone='error' 토큰 계열 재사용(새 HEX 발명 금지 — UI.md 안티슬롭). → `HookBadge.tsx` + `--red/--red-soft` 재사용, 신규 HEX 0.
- [x] **(d) renderer: 멀티 패널 적용** — 공유 리프 자동 전파 확인 + PanelView 자체 루프의 인접 연출·MessageBubble 배지 경로 적용. PanelView는 toolgroup 미표시(:244-253) 전제라 인접 판정이 단일챗과 다름 — 케이스 분리. → `ignoreToolgroups:true` 케이스 분리 적용.
- [x] **(e) renderer: 서브에이전트 적용 (연속성만)** — SubAgentChatStream `.saf-msg--thinking`(:156-164)→응답 버블에 동일 연속성 언어 적용. **훅 배지·토큰 카운트는 명시 보류**: SubAgent 계약(agent-events.ts:287-300)에 훅/estimatedTokens 데이터 부재 — 계약 확장(어댑터·main 배선)이 필요해 renderer 단독 불가. 백로그 박제(shared 계약 additive 확장 후보). → 연속성만 적용, 훅 배지 보류 박제(완료 기록·-DONE·pin).
- [x] **(f) 채증** — 표면 3종 × 양테마: 사고 중(토큰 상승)→답변 전환, 훅 차단 턴 배지(단일·패널), 서브 셀 연속성. ScreenShot/p16-*.png. → 8컷(`87f176d`).

---

## ✅ 완료 조건

- [x] `npm run typecheck` 0 · `npm run test` 전체 green(신규 RED→GREEN, 회귀 0) · `npm run lint` 0 — 378 files / 5174 passed / 0 failed
- [x] 훅 배지 파생 순수 함수 결정론 테스트 통과(hook deny·warning·무해당 3계열)
- [x] hookRuns runId 배선 테스트 통과 — shared/preload diff 0 실측(renderer 내부만) — main 포함 diff 0 실측
- [x] 연속성 인접 판정 테스트 통과(사이 삽입 요소 케이스 포함)
- [x] 서브에이전트 훅 배지 보류 사유 기록(본 문서 + -DONE) — 조용한 드롭 금지
- [ ] **ui-visual 육안 — 영호 필수**(P13~P15 채증과 함께 일괄 재검, 무인 commit X) — 잔여 사람 게이트(P16 8컷 포함 일괄 49컷)
- [x] reviewer 통과 (복잡 — 무조건) — 위반 0(🟡 2 비차단)

---

## 📚 학습 포인트

- **분리감은 버그가 아니라 구조의 부재다** — 개별 컴포넌트는 전부 정상인데 "턴"이라는 묶음 개념이 DOM에 없어서 화자가 셋으로 보였다. UI 가시성 문제는 종종 요소의 결함이 아니라 요소 사이 관계의 미표현이다.
- **배지 데이터는 이미 옆에 있었다** — 훅 차단 신호(permission-denied·informational)는 처음부터 thread에 턴-인접으로 쌓이고 있었다. 새 파이프라인 없이 렌더 레이어 파생 계산으로 성립 — plan-before-scout의 재확인.
- **공용 리프에 넣으면 표면이 공짜로 늘어난다** — MessageBubble에 배지 prop을 넣으면 멀티 패널·서브에이전트 응답까지 자동 전파된다. 표면별 중복 구현 전에 공유 지점부터 찾기(ui-rollout-surface-enumeration).

---

## ✅ 완료 기록 (2026-07-15 — coordinator 통합 + 메인 실측 대조)

**커밋 3개** (RED→GREEN→채증):
- `15b0794` — `test(gap1-p16)`: 턴 연속성 + 훅 빨간 배지 3계열 RED 선행 (21 FAIL). 계열① 훅 배지 파생(`deriveHookTurnBadges`) 9 · 계열② 사고↔답변 연속성(`isThinkingContinuous`) 9 · 계열③ `hookRuns` runId 배선 3. 회귀 0(5153 pass, 신규 21만 FAIL).
- `c03fada` — `feat(renderer)`: 구현 13파일, 21 GREEN 전이. 순수 파생 함수 2종(`hookBadge.ts`·`continuity.ts`) + `HookBadge` 공용 조각 + 단일챗/멀티패널/서브 배선. 아바타 통일(IconSpark→IconClaude, 원본 충실도 회복). `HookRun.runId` renderer 내부 additive. **shared/preload/main diff 0 실측**(계약 무접촉 — runId는 기존 엔벨로프 소스).
- `87f176d` — `test(gap1-p16)`: 시각검증 하네스(P16SHOTS opt-in, p14 관례 계승) + 표면 3종×양테마 8컷 채증.

**게이트 (P16 반영 후 최종 실측)**: `npm run typecheck` 0 · `npm run test` **378 files / 5174 passed / 0 failed**(5153→5174) · `npm run lint` 0.

**결합 규칙 (결정론 핀 — plan-auditor 🟡 해소)**: 차단 술어(`permission-denied` hook / informational `warning`·`preventContinuation`) → 턴 경계 배타 구간 내 **최근접 후속 assistant** → 부재 시 **최근접 선행 assistant** → 전무 시 무귀속. 순수 함수 `deriveHookTurnBadges(thread)`로 분리해 결정론 판정.

**채증 8컷**: `p16-continuity-single-{dark,light}` · `p16-hookbadge-single-{dark,light}` · `p16-hookbadge-panel-{dark,light}` · `p16-subagent-continuity-{dark,light}` (`ScreenShot/`).

**reviewer 판정**: 위반 0 (🟡 2 비차단 — p05 golden 소유권은 qa 복원 완료 / HookBadge hover 사유는 선택 가산점 미충족으로 후속 여지).

**명시 보류 1건**: 서브에이전트 훅 배지·토큰 카운트 — SubAgent 계약(`agent-events.ts:287-300`)에 훅/`estimatedTokens` 데이터 부재. renderer 단독 불가(어댑터·main 배선 필요) → shared 계약 additive 확장 후보 백로그 박제. 서브에이전트는 연속성 연출만 적용.

**잔여 사람 게이트**: 영호 육안 일괄(P13 2 + P14 10 + P15 29 + P16 8 = 49컷) → 마무리 push(영호 승인) → PR GO.

**추적 문서 화해**: 본 Phase는 GAP1 마감 플립 후 편입이라 추적 3문서(`_milestone-plan.md`·`GAP1-DONE.md`·`FEATURE_MAP.md`)의 "15/15" 명제를 16 Phase 체제로 정정(plan-auditor 🔴 조건 해소 — 본 마감 증분 마디에서 처리).
