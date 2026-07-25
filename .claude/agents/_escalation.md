# Agents Escalation — 실패 시 모델 상향 + 사용자 escalate

> 본 문서는 SubAgent 작업 실패 시 *에스컬레이션 절차*. WHY는 [`../policies/subagent-routing.md`](../policies/subagent-routing.md) "에스컬레이션 룰" 절.

---

## 1. Worker 작업 실패 (기본 티어 2회 → 상향 티어 → 사용자)

> `복잡+trust-boundary`(또는 `backend-contract`) / `대규모` Phase는 처음부터 상향 티어(`claude-opus-5`)를 우선합니다. 아래 흐름은 그 미만에 적용합니다.

```
[1차 — 기본 티어 claude-sonnet-5, Worker A] → 실패(빌드 깨짐/테스트 미달/명세 미달)
   → work-pin "에스컬레이션: <worker> 1차 실패 — <사유>"
[2차 — 기본 티어, 같은 Worker A·입력 보강]
   → 성공 → work-pin "에스컬레이션: 기본 티어 2회" + 반환
   → 실패
[3차 — 상향 티어 claude-opus-5 재호출 또는 메인이 분해 재검토]
   → 성공 → work-pin "에스컬레이션: 상향 티어" + 반환
   → 실패
[4차 — chief-tech-operator 진단 ⚠️ 메인이 제안 → 영호 승인 후 호출]
   → 인과 규명 → 권고대로 메인/Worker가 반영 → 재시도
   → 여전히 막힘 → 사용자 escalate
```

⚠️ **4차는 자동으로 뜨지 않는다** — Fable 5 단가라 영호 승인이 게이트다. 승인이 없으면 3차 실패에서 바로 사용자 escalate.

### 사용자 escalate 양식
```
⚠️ Worker 에스컬레이션 — 3차(또는 CTO 진단까지) 후에도 실패
SubAgent: <name> / 작업: <한 줄> / 실패 사유: <마지막 에러>
옵션: 1) 본인이 직접  2) 다른 SubAgent 재위임  3) Phase 분해 재검토  4) CTO 진단(미실시라면)
```

### 박힘 정신 (work-pin 가시화)
에스컬레이션 매번 work-pin에 박힘 — *상향 모델 비용 인식* + *무한 호출 사고 차단*.

---

## 2. Reviewer 위반 발견 (Tier 2-A)

```
[Worker 완료 → reviewer 자동 호출]
   → 🟢 위반 0개 → 통과
   → 🟡 개선 제안만 → 통과 + 노출 (수정 강제 X)
   → 🔴 위반 있음
       → 사용자 "고칠까요?"
       → "고치자" → 같은 도메인 Worker 재위임 (1회만) → 실패 시 §1 escalate
       → "패스" → work-pin "리뷰 패스 사유: <한 줄>" → 통과(사유 영구 잔존)
```

**재위임은 1회**. 같은 위반 2회 째 = *분해 잘못 추정 신호* → 메인이 분해 재검토(필요하면 CTO 자문 제안).

---

## 3. Plan-auditor 결함 발견 (Tier 2-B)

```
[Phase 정의 Write → plan-auditor 자동 호출]
   → 🟢 결함 0개 → Phase GO
   → 🟡 개선 제안만 → 사용자 결정
   → 🔴 결함 있음
       → 옵션 A (즉시 봉합 — 특히 irreversible 위험 시 강력 권유): 갱신 → 재호출 → GO
       → 옵션 B (현 상태 진행): work-pin "plan 결함 잔존: <한 줄> — 별 Phase 봉합 예정" → GO
```

*비가역*(IPC 계약 버전 bump / JSON 영속 스키마 마이그 / master 푸시) 위험 시 옵션 A *강력 권유*.

---

## 4. 권한 위반 (Worker 자기 영역 외 작업 요청)

```
[Worker가 권한 범위 외 파일 수정 시도]
   → 즉시 거부 (Edit/Write 실패)
   → 메인 세션 보고: "권한 외 작업 필요 — <도메인>: <파일> — <Worker명> 위임 요청"
   → 메인이 적절 Worker 재위임 또는 분해 재검토
```
권한 경계 = [`_routing.md`](_routing.md) "권한 경계" 절.

---

## 5. 경계 코드 정합 충돌 (Worker A 결과 vs Worker B 결과)

```
[메인이 Worker 결과를 통합 → coordinator에 경계 정합 검증 위임]
   → 정합 OK → 통과
   → 충돌 (예: renderer가 IPC 채널 "agent.run" 호출, shared-ipc 정의는 "agentRun")
       → coordinator는 file:line과 함께 **보고만** 한다 (재위임 권한 없음 — Agent 반납)
       → 메인이 충돌 Worker에 재위임 1회 — 정정
       → 성공 → coordinator 재검증 → 통과
       → 실패 → 사용자 escalate + 분해 재검토
```

⚠️ 이 흐름의 주 표적은 **타입이 안 잡고 런타임에 터지는** 채널명 불일치다. typecheck green이 통과 근거가 되지 않는다.

---

## 6. 재귀 호출 시도 (절대 차단)

```
[SubAgent가 다른 SubAgent 직접 호출 시도]
   → 런타임이 차단: 중첩 OFF(v2.1.220 + SPAWN_DEPTH 미설정)로 서브에이전트에 Agent 도구가 없다.
     추가로 전 역할 frontmatter에 disallowedTools: Agent — 이중 잠금.
     circuit-breaker.sh는 *반복 도구 사용 알림* advisory일 뿐 — 재귀 판정 로직 미실재.
   → 메인 세션에 분해 요청으로 escalate
[메인이 같은 Phase를 계속 더 잘게 쪼개게 되는 상황]
   → 분해가 너무 깊으면 Phase 자체 잘못 추정 신호 → 사용자 escalate + 분해 재검토(CTO 자문 제안 가능)
```

⚠️ **2026-07-25 이전 서술과 다르다** — 옛 문서는 *"coordinator만 단독 위임자"* 를 차단 근거로 삼았다. coordinator가 `Agent`를 반납했으므로 그 근거는 사라졌고, 지금 실제로 막는 것은 **런타임 중첩 OFF**다. 중첩이 켜지는 버전이 오면 frontmatter만 남는다 — 재검토 대상.

---

## 7. 사용자 우회 (사유 명시 후 허용)

사용자가 *"리뷰 스킵"* / *"plan 점검 스킵"* / *"본인이 직접 분해"* 명시 시:
1. 자동 호출 강제 *해제*
2. work-pin에 `<자동화> 스킵 사유: <한 줄>` 박힘

`grep "스킵 사유"`로 회수 — *우회 습관화* 감지. 주간 3회 초과 시 트리거 조건 재설계 신호.

---

## 8. 무인 루프 분기 (loop-driven)

- **v1 (attended)**: 모든 escalate(Worker 3차 실패 / reviewer 🔴 / 권한 위반)는 *즉시 사람에게 도달*. v1은 본질적으로 attended라 §1~§7 흐름 그대로.
- **비가역(버킷 c) 동반 실패 = 루프 정지**: push/PR/merge/IPC 계약 버전/trust-boundary 작업이 실패하면 자율 재시도 X → 즉시 사람 게이트 정지 ([`../policies/work-judge.md`](../policies/work-judge.md) 버킷 c 졸업 불가).
- **circuit halt (v2 선결)**: 무인 토큰/시간 폭주는 `circuit-breaker.sh`가 halt 신호 기록 → 드라이버가 폴링해 멈춤. hook은 루프를 직접 못 죽임. v2(무인)는 이 폴링 선결이라 defer.

엔진·정지 게이트 → [`../policies/loop-driver.md`](../policies/loop-driver.md).

---

## 변경 시 동기화 책임

본 문서 수정 시 *반드시* 함께 갱신:
- [`../policies/subagent-routing.md`](../policies/subagent-routing.md) (에스컬레이션 룰 원칙)
- [`../policies/loop-driver.md`](../policies/loop-driver.md) · [`../policies/work-judge.md`](../policies/work-judge.md) (무인 루프 분기 + 비가역 버킷 c 정지)
- [`coordinator.md`](coordinator.md) (경계 정합 검증 — §5) · [`chief-tech-operator.md`](chief-tech-operator.md) (진단 최종단 — §1 4차)
- [`../../.claude/hooks/circuit-breaker.sh`](../../.claude/hooks/circuit-breaker.sh) (반복 도구 알림 advisory — 재귀 차단은 런타임 중첩 OFF가 강제)

---

## 갱신 이력

- 2026-06-26 — AgentDeck 이식 (ClaudeDev → manifest 기반). 게임 경계 충돌 예시(PacketID→IPC 채널), Protocol.Version→IPC 계약 버전, server→main-process, 경로(policies/·.claude/hooks/) 적응, backend-contract 깃발 반영. 에스컬레이션 8흐름·재귀 차단·무인 루프 분기 골격은 그대로.
- 2026-07-25 (HR2 P03) — "coordinator가 단독 위임자" 전제를 §1·§2·§4·§5·§6에서 걷어냈다(ADR-010 개정 1). 재위임 주체 = **메인 세션**, coordinator = **경계 정합 보고만**, 재귀 차단 담보 = **런타임 중첩 OFF**. §1에 4차 `chief-tech-operator` 진단 단계 신설(⚠️ 영호 승인 게이트). 모델은 full ID로 표기.
