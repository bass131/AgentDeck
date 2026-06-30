# BF1-interrupt-loop — 채팅 Interrupt 수정 + Loop 동작 기준 확정 마일스톤

> **트랙**: BF (BugFix — 기능 로드맵 M번호·정리 RF 트랙과 분리된 독립 버그 트랙)
> **출처**: work-pin 버그 백로그 + memory [[rf1-post-refactor-bug-backlog]] (RF1 트랙C 육안검증 중 발견, 2026-06-30)
> **등급**: 복잡 — 집계상 대규모 양식 적용 (2 버그 · 3 도메인 agent-backend/qa/docs-ADR · 비가역 ADR 박제 → plan-auditor 사전검증 발동). 두 트랙 독립·순차라 단일 3도메인 블라스트 아님.
> **생성**: 2026-07-01 (`/work-plan`)
> **브랜치**: `fix/bf1-interrupt-loop` (착수 시 생성 — 아직 미생성)

---

## 🎯 마일스톤 목표

RF1 리팩토링(거동 불변) 중엔 손대지 않고 기록만 해둔 **기능/UX 버그 2개**를 닫는다.

1. **채팅 Interrupt(네모 버튼) 미적용** — 진행 중인 메시지를 stop 버튼으로 중단해도 실제로 안 멈춘다. → **완전 수정**(재현 → 진단 → 수정).
2. **Loop 동작 기준 모호(기능+GUI)** — `/loop`이 어느 시스템(SDK 크론 / 앱 타이머 / REPL 펌프)으로 도는지, GUI에 어떻게 표면화되는지 불명확. → 이 마일스톤에서는 **동작 기준을 영호와 확정 + 문서 정합**까지. 실제 기능·GUI 구현은 결정 후 별도 마일스톤으로 재분해(아래 §범위 경계).

   > **영호 의도 확정 (2026-07-01)**: 영호가 원하는 건 *주기적(시간 기반) 반복*이 아니라 **"목표를 달성할 때까지 반복하는 자율형 Goal 기능"**(SDK 내장 `/goal`에 가까움). → P04의 결정 축이 "몇 분마다 도나"(주기)가 아니라 **"무엇이 다음 반복을 트리거하고 언제 멈추나(=목표 달성 판정)"**(목표 완료)로 이동. idle 6분 fragile도 *주기형* 전제라 목표형엔 의미가 다름. P04 현황 정리·옵션을 이 프레이밍으로 재구성.

---

## 🧭 두 버그의 성격 차이 (분해의 근거)

| | Interrupt 버그 | Loop 버그 |
|---|---|---|
| 성격 | 구체적 코드 결함 (진단가능) | 설계 모호성 (결정 필요) |
| 코드 경로 | 버튼→IPC→SDK 완전 매핑됨 | 3 개념 공존 + 문서/코드 괴리 |
| 처리 | 재현→실패테스트→수정 (TDD) | 현황 정리→**영호 결정**→문서 정합 |
| 루프 버킷 | (a) 기계 판정 (재현만 육안) | **(c) 설계분기 = human-gate** |
| 이 마일스톤 산출 | **수정 완료** | **결정+문서 (구현은 후속)** |

> **왜 Loop 구현을 분리하나**: 메모리 [[rf1-post-refactor-bug-backlog]]가 "loop는 동작 기준 재정의(기능+GUI 스코프)**부터**"라고 명시. 동작 기준이 안 정해진 상태에서 구현 Phase를 쪼개면 **완료 조건이 측정 불가**(plan-auditor 결함). 결정(P04)이 곧 구현 분해의 입력이다.

---

## 🔬 사전 코드 경로 매핑 (Explore 2종 완료 — 2026-07-01)

### Interrupt 경로 (버튼 → SDK)
```
ComposerBar.tsx:158-166  [네모 버튼: isRunning && !hasContent일 때만]
  → Conversation.tsx:654-657  [replMode 분기: true→interruptRun / false→abortRun]
  → runtime.ts:166/155  →  AGENT_INTERRUPT / AGENT_ABORT IPC
  → agent.ts handler:122/112  →  agent-runs.ts:234/220 (interrupt/abort)
  → claudeAgentRun.ts:204-217 interrupt()  /  166-202 abort()
  → _queryHandle.interrupt()  (SDK)   /   _abortController.abort()
```
**SDK 계약 확정 (P01, sdk.d.ts:2182-2192)**: `Query.interrupt()`는 *"only supported when streaming input/output is used"* — 즉 **prompt가 AsyncIterable인 스트리밍-입력 모드(= replMode=true 지속세션 `_runPersistentPump`)에서만 지원**. 단발(`prompt: string`)에선 미지원. → 당초 "가설 B(SDK가 held-open에서 interrupt 무효)"는 **SDK 문서가 반박**(held-open이 곧 interrupt 지원 모드). replMode=true는 SDK 계약상 interrupt가 *작동해야 함*.

**재조준된 유력 가설**: SDK 계약이 interrupt를 지원하므로 버그는 **AgentDeck 쪽 처리**일 공산이 큼 — (A) interrupt()로 turn은 실제 멈추나 **persistent 모드에선 run이 "최종 done"으로 종료되지 않아**(held-open) renderer의 `isRunning`/stop버튼 상태가 안 풀림 → "안 멈춘다"는 *UI 거짓말* / (B) interrupt request 미전달(타이밍·`_queryHandle` 미설정·`void` fire-and-forget 후 Promise reject가 try/catch(213-215) 밖에서 유실) / (C) turn 경계(interrupt 후 result/done) 처리 미흡. **라이브 재현으로 'LLM이 실제로 계속 도는가 vs UI만 안 풀리는가'를 가려야 확정**(영호 육안).

### Loop 3개념 + 인디케이터 2개
| 개념 | 파일 | 메커니즘 |
|---|---|---|
| (a) SDK `/loop` 크론 | SDK + progressTrackers.ts:110-220 | CronCreate/Delete → `loops` 이벤트 |
| (b) 앱 레벨 타이머 loop | loopCommand.ts · store/slices/loop.ts (ADR-022) | renderer setTimeout 주입 |
| (c) REPL 펌프 | claudeAgentRun.ts:_runPersistentPump | held-open input gen 재사용 |

| 인디케이터 | 파일 | 데이터원 |
|---|---|---|
| LoopRunningIndicator | components/07_notice/LoopRunningIndicator.tsx | `activeLoops` (SDK 크론) |
| LoopIndicator | components/07_notice/LoopIndicator.tsx | `activeLoop` (앱 타이머) |

**문서/코드 괴리**: `REPL_TRANSITION.md` §9/§10이 "라이브세션 REPL 보류(idle 6분 한계)"인데 코드는 (1)~(4a) 이미 빌드·기본활성(`replMode=true`). 둘이 안 맞는 게 모호성의 뿌리.

---

## 📂 Phase 목록 (의존 순서)

| # | Phase | 등급 | 도메인 | risk | loop_track |
|---|---|---|---|---|---|
| 01 | Interrupt 재현 + SDK interrupt 의미 확인 | 보통 | cross(qa+agent-backend 조사) | — | **human-visual**(live 재현) |
| 02 | Interrupt 진단 실패 테스트 (TDD) | 보통 | qa | — | auto-gate |
| 03 | Interrupt 수정 + green | **복잡** | agent-backend | backend-contract | auto-gate +reviewer |
| 04 | Loop 현황 정리 + 동작 기준 결정 | **복잡** | cross | 설계분기 | **human-gate** |
| 05 | Loop 결정 문서화(ADR/REPL_TRANSITION) + 구현 재분해 트리거 | **복잡** | cross(docs) | irreversible(ADR)·docs | **human-gate** |

> **등급 근거 (grade-and-risk §3)**: P03은 `01_agents/**` 변경 = backend-contract 깃발 → 보통+1=**복잡**, reviewer 무조건. P04는 설계 분기(loop 아키텍처 택1) = 판단 작업이라 **복잡·human-gate**. P05는 ADR 박제(비가역) + docs(영호 단독) = **복잡·human-gate**.

---

## 🔗 의존성 그래프

```
[Interrupt 트랙 — 순차]
  01(재현+SDK의미) ──→ 02(실패테스트) ──→ 03(수정, reviewer GO)

[Loop 트랙 — 순차]
  04(현황+결정, 영호 GO) ──→ 05(문서/ADR, 영호 승인) ──→ (후속 마일스톤 /work-plan)

[트랙 간] Interrupt(01~03) ∥ Loop(04~05) — 완전 독립 (다른 관심사·다른 파일 쓰기). 병렬 가능.
```

- **Interrupt 순차**: 재현(01)으로 SDK 의미가 확정돼야 실패테스트(02)를 정확히 쓰고, 그래야 수정(03)이 그 테스트를 GREEN으로 만든다.
- **Loop 순차**: 결정(04) 없이는 문서(05)에 쓸 내용이 없다.
- **병렬**: 두 트랙은 파일·관심사가 겹치지 않음. Interrupt는 `interrupt()` 메서드, Loop는 펌프 루프 구조/인디케이터/문서. 동시 진행 OK. (단 둘 다 `claudeAgentRun.ts`를 **읽지만**, 이 마일스톤에서 loop 트랙은 코드를 **안 쓴다**(결정·문서뿐) → 쓰기 충돌 0.)

---

## 🚧 범위 경계 (이 마일스톤이 **하지 않는** 것)

- **Loop 기능 구현 X** — 어느 loop 시스템을 남기고/제거할지의 코드 변경은 P04 결정 후 **별도 마일스톤**(`/work-plan`)으로. 결정 전엔 측정가능 분해 불가.
- **Loop GUI 통합 X** — 인디케이터 2개 통합/REPL 활성 표면화도 동일하게 결정 후 후속.
- **REPL 라이브 e2e 최종 사인오프 X** — REPL_TRANSITION 잔여(라이브 e2e)는 별건. 여기선 interrupt 경로만 다룸.

> 이 경계를 명시하는 이유: "버그 백로그 체크"가 무한정 커지지 않게. Interrupt는 닫고, Loop는 **결정까지** 닫는다.

---

## 🚦 회귀 게이트 (코드 변경 Phase 공통)

```bash
npm run typecheck   # main+renderer 0 errors
npm run test        # Vitest — 시작 시점 실측 베이스라인 대비 비감소 + 신규 fail 0
                    #   ⚠️ 베이스라인은 코드 변경 Phase(P03) 착수 시 `npm run test`로 재고정.
                    #   work-pin "3847"·CHANGELOG "3841"이 6 어긋남(stale 가능) — 절대값 신뢰 X, 비감소만 게이트.
npm run lint        # 0 problems
```

- P03(agent-backend 계약 인접)은 추가로 `npm run build` green + 단발 경로 회귀 0 단정.
- P01 재현은 `npm run dev` 라이브 실측(영호 육안) — 기계 게이트로 대체 불가한 부분.
- P04·P05는 코드 무변경(결정·문서) → typecheck/test는 회귀 0 확인용.

---

## 🔒 게이트·약속

- **비가역(push/PR/merge)** = 사람 게이트 보존. **마일스톤 전체 1 PR** (영호 결정 2026-07-01 — Interrupt 트랙 분리 PR 대신 BF1 5 Phase 응집). 단 Loop 결정(P04)이 늦어지면 Interrupt 수정 머지도 함께 지연됨을 인지.
- **P03 backend-contract** = reviewer 무조건 (전 어댑터 영향 가능성 점검).
- **P04 설계 결정** = 영호 GO 없이 P05 진행 X. AI는 현황 정리 + 선택지 제시까지.
- **P05 ADR·docs** = 영호 단독 통제 영역. AI는 *초안 제시만*, 박제는 영호.

---

## 📚 이 마일스톤에서 배울 핵심 개념

- **디버깅의 과학적 방법** — 가설(`_aborted` 미설정) → 재현 → 실패테스트로 고정 → 수정 → 테스트로 증명. "고쳤다"가 아니라 "테스트가 증명한다".
- **비동기 중단 의미론** — `abort`(전체 종료) vs `interrupt`(현재 턴만) vs SDK `query().interrupt()`. AsyncGenerator/`for await`가 외부 신호로 어떻게 깨지나(또는 안 깨지나).
- **설계 모호성 ≠ 코드 버그** — 어떤 "버그"는 코드가 아니라 *결정 부재*다. 이건 고치는 게 아니라 정하는 것이고, 정하는 건 사람(영호) 몫.
- **문서/코드 드리프트** — 설계 문서가 "보류"인데 코드는 빌드된 상태가 어떻게 모호성을 낳나.

---

## ⚠️ 마일스톤 차원 함정

- **Interrupt를 "SDK가 알아서 하겠지"로 넘기지 말 것** — `_queryHandle.interrupt()` 호출 후 펌프가 실제로 turn을 끝내는지는 **블랙박스**. 반드시 P01에서 SDK 의미 확정(claude-api 스킬) 후 진행.
- **Loop를 코드부터 손대는 함정** — 모호한 채로 인디케이터부터 합치면 잘못된 방향으로 굳음. **결정(P04)이 먼저**.
- **claude-api 스킬 우회 금지** — SDK interrupt 동작은 기억으로 단정 X. P01·P03에서 스킬 참조 (헌법 CRITICAL).
- **replMode 분기 누락** — Interrupt는 `replMode=true`(기본)에서만 `interruptRun` 경로를 탄다. `replMode=false`는 `abortRun`(전체 종료) — 재현 시 어느 모드인지 반드시 명시.
