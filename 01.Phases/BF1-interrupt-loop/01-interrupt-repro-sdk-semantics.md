---
owner: 영호
milestone: BF1-interrupt-loop
phase: 01
title: Interrupt 재현 + SDK interrupt 의미 확인
status: pending
grade: 보통
loop_track: human-visual
estimated: 1~2h
domain: cross
summary: 네모(stop) 버튼이 실제로 안 멈추는 시나리오 재현 + SDK query().interrupt()의 held-open 모드 의미 확정(claude-api 스킬)
---

# Phase 01: Interrupt 재현 + SDK interrupt 의미 확인

> **상태**: pending
> **마일스톤**: BF1-interrupt-loop
> **등급**: 보통
> **담당**: 메인 직접(조사) + 영호 육안 재현 — 코드 변경 0 (R only)

---

## 🎯 목표

이 Phase가 끝나면: ① `replMode=true`(기본) 상태에서 진행 중인 메시지를 네모 버튼으로 멈추려 할 때 **실제로 안 멈추는 시나리오가 재현·문서화**되고, ② `@anthropic-ai/claude-agent-sdk`의 `query().interrupt()`가 **held-open(AsyncIterable 입력) 세션에서 어떤 신호로 진행 중 turn을 끊는지(또는 못 끊는지)**가 확정된다. 이 두 가지가 다음 Phase(실패 테스트)의 전제다.

---

## ⏪ 사전 조건

- [x] 코드 경로 매핑 완료 (`_milestone-plan.md` §사전 코드 경로 매핑)
- [ ] git 안전 게이트 통과 + `fix/bf1-interrupt-loop` 브랜치 생성
- [ ] `npm run dev` 라이브 실행 가능 (SDK 키 설정됨)

---

## 📝 작업 내용

- [ ] **claude-api 스킬 참조** — `query().interrupt()`의 정확한 의미 확정 (헌법 CRITICAL: SDK 동작 기억으로 단정 X):
  - `interrupt()`가 진행 중 query를 중단시키는 메커니즘 — `for await` 루프에 throw? `result` 메시지 조기 emit? AbortSignal 경유?
  - **held-open 모드**(`prompt: AsyncIterable`)에서도 `interrupt()`가 동작하는가, 아니면 단발 `prompt: string`에서만인가?
  - interrupt 후 같은 세션에 **다음 turn을 push하면 정상 동작**하는가(세션 생존)?
- [ ] **재현 시나리오 작성** (`npm run dev` 라이브):
  - `replMode=ON`(기본)으로 긴 작업 프롬프트 전송 → 진행 중(`isRunning`) 네모 버튼 클릭 → **멈추는가?** (예상: 안 멈춤)
  - 콘솔/메인 로그로 `agent.interrupt` IPC 도달 여부 + `claudeAgentRun.interrupt()` 진입 여부 확인
  - `replMode=OFF`(단발=`abortRun` 경로)도 대조 — 이쪽은 멈추는가? (분기 차이 격리)
- [ ] **가설 검증 근거 수집** — 펌프 가드(`_aborted`)가 interrupt에서 안 세워지는 게 원인인지, 아니면 SDK interrupt 자체가 held-open에서 무효인지 좁히기:
  - `claudeAgentRun.ts:204-217 interrupt()` 정독 — `_queryHandle?.interrupt()`만 호출, `_aborted` 미설정, `_close()` 미호출 확인
  - `_runPersistentPump`(521-584)·`_inputGen`(469-497)의 `_aborted`/`signal.aborted` 가드가 interrupt로는 안 트립함을 코드로 확인
- [ ] **재현 + SDK 의미를 1개 메모로 정리** — 스크래치패드 또는 work-pin 루프 상태에 핵심 결론(다음 Phase 입력).

---

## ✅ 완료 조건

- [ ] **재현 시나리오 문서화** — "이 단계로 누르면 안 멈춘다"가 재현 가능(영호 육안 확인 1회).
- [ ] **SDK interrupt 의미 확정** — claude-api 스킬 근거로 "held-open에서 interrupt()가 X 신호로 turn을 끊는다 / 못 끊는다" 한 문장.
- [ ] **원인 가설 1개로 좁힘** (SDK 계약 확정으로 재조준됨 — 아래 발견 참조):
  - **(가설 A·유력) UI 거짓말** — interrupt()로 turn은 실제 멈추나, persistent 모드 run이 held-open이라 "최종 done"이 안 와 renderer `isRunning`/stop버튼이 안 풀림 → 사용자엔 "안 멈춤"으로 보임.
  - **(가설 B) interrupt request 미전달** — `_queryHandle` 미설정/타이밍, 또는 `void _queryHandle.interrupt()`(212)의 Promise reject가 동기 try/catch(213-215) 밖에서 유실.
  - **(가설 C) turn 경계 처리 미흡** — interrupt 후 SDK가 보내는 result/done을 펌프·renderer가 "정지"로 못 잇는다.
  - 라이브 재현으로 **"LLM이 실제로 계속 도는가(B/C) vs UI만 안 풀리는가(A)"**를 가른다.
- [ ] **SDK 계약 발견 박제 (P01 완료, sdk.d.ts:2182-2192)**: `Query.interrupt()`는 *"only supported when streaming input/output is used"* → 스트리밍-입력(=replMode=true `_inputGen()` AsyncIterable)에서만 지원, 단발(string prompt) 미지원. **당초 "가설 B=SDK held-open 무효"는 반박됨**(held-open이 곧 interrupt 지원 모드). 단발 경로의 정지는 `interrupt()`가 아니라 `abortRun→abort()`(abortController)가 담당(Conversation.tsx:654-657 분기와 정합).
- [ ] **분기 트리거 판정** — 라이브 재현에서 **LLM이 버튼 후에도 실제로 토큰을 계속 생성**하면(가설 B/C, SDK까지 안 닿거나 turn 경계 깨짐) → P03가 SDK 전달/경계 재설계로 커질 수 있어 **설계분기 → 영호 GO**. **UI만 안 풀리는 것이면**(가설 A) → renderer 상태정리 수정(소규모, agent-backend 아닌 renderer 도메인일 수 있음 → 도메인 재산정).
- [ ] `npm run typecheck` 0 errors (코드 무변경 — 회귀 0 확인용).

---

## 📚 학습 포인트

- **재현이 디버깅의 1단계** — 못 멈추는 걸 "눈으로 한 번 본" 다음에야 고친다. 재현 없이 코드만 읽으면 헛다리.
- **블랙박스 경계 식별** — 우리 코드(`interrupt()` 호출)와 SDK 내부(`query().interrupt()` 처리) 사이가 경계. 어느 쪽이 범인인지 가르는 게 핵심.
- **abort vs interrupt 의미 분리** — ADR-024가 "현재 turn 중단(interrupt) ≠ 세션 종료(abort)"로 나눴다. 왜 나눴고 무엇이 다른가.

---

## ⚠️ 함정

- **SDK 동작 추측 금지** — `interrupt()`가 "당연히 멈추겠지"는 가정. claude-api 스킬로 확인(헌법 CRITICAL).
- **replMode 분기 혼동** — `replMode=true`만 `interruptRun`. `false`는 `abortRun`(전체 종료, 다른 경로). 재현 시 모드 명시 안 하면 엉뚱한 경로를 진단.
- **코드 변경 0** — 이 Phase는 재현·조사만. 수정 욕구가 들어도 P02(테스트)·P03(수정)으로 미룬다.
- **라이브 SDK 비용** — 재현용 query는 실제 모델 호출. 짧은 프롬프트로 최소화, 그러나 "진행 중 중단"을 보려면 어느 정도 길이 필요.

---

## 담당 SubAgent

메인 직접(조사·정독) + 영호 육안 재현. SDK 의미는 claude-api 스킬. 코드 변경이 없어 Worker 위임 비용 > 작업 비용.
