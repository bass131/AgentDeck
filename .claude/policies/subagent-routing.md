# SubAgent Routing — 풀 8 라우팅 + 자동 호출 + 에스컬레이션

> **헌법 참조**: 본 정책은 헌법(`../../CLAUDE.md`) "SubAgent 풀" 섹션에서 링크됩니다.
> 충돌 시 헌법이 이깁니다.

본 문서는 SubAgent 풀 8개의 *라우팅 룰*과 *자동 호출 트리거*, *에스컬레이션*(Sonnet 2회 실패 → Opus → 사용자)을 정의합니다. SubAgent 정의 자체는 [`../agents/<name>.md`](../agents/). 진입 주체 = 메인 세션 또는 루프 드라이버; 작업 → 버킷(a/b/c) 분류는 [`work-judge.md`](work-judge.md), 엔진은 [`loop-driver.md`](loop-driver.md). 빠른 매핑은 [`../agents/_routing.md`](../agents/_routing.md).

---

## 1. SubAgent 풀 8 (요약)

| # | 이름 | 역할 | 기본 모델 | 권한 |
|---|---|---|---|---|
| 1 | `main-process` | `src/main/**` Electron 메인 (라이프사이클·IPC 핸들러·JSON 영속·fs/diff·git·lsp) | Sonnet | `src/main/**` R/W (agents/ 제외) |
| 2 | `agent-backend` | `src/main/01_agents/**` 엔진 추상화 (Claude/Codex 어댑터·registry·AgentEvent 정규화) | Sonnet | `src/main/01_agents/**` R/W |
| 3 | `renderer` | `src/renderer/**` React UI (셸·컴포넌트·Zustand·테마) | Sonnet | `src/renderer/**` R/W |
| 4 | `shared-ipc` | `src/shared/**` + `src/preload/**` IPC 계약·공통 AgentEvent·contextBridge | Sonnet | `src/shared/**`·`src/preload/**` R/W |
| 5 | `qa` | `tests/**` 단위·e2e·픽스처·회귀 안전망 | Sonnet | `tests/**` R/W, 앱 코드 R only |
| 6 | `reviewer` | Tier 2 자동 리뷰 (헌법/ADR/도메인 패턴 점검) | Opus | 전체 R only |
| 7 | `plan-auditor` | Phase 정의 사전 검증 | Opus | 전체 R only |
| 8 | `coordinator` | 복잡/대규모 Phase 분해 + Worker 위임 + 결과 통합 | Opus | 전체 R only, 위임 권한 |

각 SubAgent 디테일(입력/출력/툴 권한) = [`../agents/<name>.md`](../agents/).

---

## 2. 라우팅 — 도메인 → SubAgent

| 도메인 / 작업 | 위임 대상 | 비고 |
|---|---|---|
| Electron 라이프사이클 / BrowserWindow / IPC 핸들러 등록 / 영속화(JSON) / fs watch·diff / git / lsp 호스트 | `main-process` | `src/main/**` (어댑터 제외) |
| 코딩 엔진 어댑터(Claude/Codex) / 백엔드 registry / AgentEvent 정규화 | `agent-backend` | `src/main/01_agents/**` |
| React UI / 3-pane 레이아웃 / 컴포넌트 / Zustand / 테마 | `renderer` | `src/renderer/**` |
| IPC 계약(채널·타입) / 공통 AgentEvent 타입 / preload contextBridge | `shared-ipc` | `src/shared/**` + `src/preload/**` |
| 단위/e2e 테스트 / 픽스처 / 회귀 안전망 | `qa` | `tests/**` (앱 코드 R only) |
| MCP 도구 사용 (claude-in-chrome / Notion 등) | 메인 세션 직접 | MCP = 메인 세션 전용 (위임 불가) |
| 헌법 / ADR / docs / `.claude` 하네스 자체 | (위임 X, 영호 단독) | |

### 여러 도메인 작업

2 도메인 이상 = **복잡 등급** 이상 → `coordinator`에게 위임:

1. `coordinator`가 Phase 분해 (또는 받은 분해본 검증)
2. 도메인별 Worker 위임 (1단계만)
3. Worker 결과 수집 + 통합
4. (조건 충족 시) `reviewer` 자동 호출

**재귀 차단**: Worker가 다른 Worker를 *직접 호출 X*. 분해는 coordinator 책임.

---

## 3. 등급 → 처리 패턴 (재확인)

[`grade-and-risk.md`](grade-and-risk.md) 등급 정의에서 처리 패턴이 결정됩니다:

| 등급 | 처리 패턴 |
|---|---|
| **단순** | 메인 세션이 Edit/Write 직접. SubAgent 위임 X |
| **보통** | 도메인 Worker 1개에 위임 |
| **복잡** | `coordinator` + Worker 1~2개 + `reviewer`(조건부) |
| **대규모** | `coordinator` + Worker 3~4개 + `plan-auditor`(사전) + `reviewer`(통합) + 5단계 보고 MD/HTML |

---

## 4. 자동 호출 트리거

### 4-1. `reviewer` (Tier 2-A 자동 리뷰)

도메인 Worker 코드 변경 후 메인 세션이 평가:

- **무조건 호출**: `src/shared/**`(IPC 계약) 변경 / `AgentBackend`·`AgentEvent` 변경(backend-contract) / preload 노출 변경 / 위험 깃발 발동 / 사용자 "리뷰 돌려줘"
- **조건부 호출**: 실질 변경 ≥10줄 + 등급 ≥ 보통 → 호출
- **무조건 스킵**: 테스트 파일만 / 주석·rename만 / 사용자 "리뷰 스킵 + 사유"

트리거 디테일 = [`review-tiering.md`](review-tiering.md).

### 4-2. `plan-auditor` (Tier 2-B Phase 정의 사전 검증)

- `phases/**/NN-{slug}.md` (Phase 정의) Write/Edit → 자동 호출
- `_milestone-plan.md` Write/Edit → 자동 호출
- 출력: 결함 발견 시 사용자에게 리스트 + 옵션 A(즉시 봉합) / 옵션 B(진행)

### 4-3. `coordinator` (등급 결정 직후)

- 복잡/대규모 → 무조건. 보통 + 도메인 2개 → 권장. 단순 → X.

---

## 5. 에스컬레이션 룰

Worker가 2번 실패하면 *모델 상향*:

```
[Worker 1차 — Sonnet] → 실패(빌드 깨짐/테스트 0건/명세 미달)
  → [2차 — Sonnet, 같은 SubAgent] → 실패
    → [3차 — Opus, 같은 SubAgent 또는 coordinator 승격] → 실패
      → 사용자에게 escalate
```

각 상향은 work-pin에 "에스컬레이션: Sonnet 2회 / Opus" 박힘 → Opus 비용 가시화.

### 사용자 escalate 양식

```
⚠️ Worker 에스컬레이션 — 3차 시도 후에도 실패
  SubAgent: <name> / 작업: <한 줄> / 실패 사유: <마지막 에러>
  옵션: 1) 본인이 직접 / 2) 다른 SubAgent 재위임 / 3) Phase 분해 재검토
```

---

## 5.5 선택적 Opus — 복잡도/위험 기반 구현 Worker 모델 상향

**원칙**: 구현 Worker는 §1 기본 모델(Sonnet)을 따르되, **작업 위험도가 높으면 모델 티어 상향**.

- **트리거**: `복잡 + trust-boundary`(또는 `backend-contract`) 또는 `대규모` Phase → 구현 Worker도 **Opus** (`Agent` 도구 `model` override; agent frontmatter 기본은 Sonnet).
- **그 외**(단순 / 보통 / 복잡-non-flag) → 기본 **Sonnet**.
- **불변 (핵심)**: 메인 `file:line` 실측 게이트는 **모델 무관 유지**. Opus Worker도 실수 0 보장 X — 선택적 Opus = "Worker 품질↑"이지 "메인 검증 생략"이 아님.
- **에스컬레이션 상호작용**: 복잡+flag/대규모는 *처음부터 Opus*라, §5 'Sonnet 2회 실패 → Opus' 흐름은 그 미만에만 적용.

---

## 6. 위임 입력 약속 (필수 5항목)

```
@<worker-name>
작업: <한 줄>
입력 자산: <Phase 정의 / 의존 -DONE.md / 관련 파일 경로 / 관련 docs>
변경 대상: <폴더 또는 파일 목록>
완료 조건: <측정 가능 — 예: typecheck green + 테스트 N PASS>
출력: 진행 보고 + (필요 시) -DONE.md
```

5항목 중 하나라도 누락 시 Worker는 *추측 없이 즉시 종료* + coordinator에 입력 부족 알림.

---

## 7. 위임 경계 — 약속

### Coordinator → Worker 1단계만
- Worker는 *다른 Worker 호출 X*. 분해 필요하면 결과에 "분해 요청" 표기 → coordinator 재분해.
- 재귀 차단으로 무한 호출 사고 예방. (advisory 알림 = [`../../.claude/hooks/circuit-breaker.sh`])

### Worker 권한 범위 외 작업
- Worker가 권한 범위 외 파일 수정 시도 → 즉시 거부 + coordinator 보고.
- 예: `renderer` Worker가 `src/main/` 수정 시도 → 권한 부재 → "main-process Worker 필요" 보고.

### Reviewer/plan-auditor R only
- 두 Opus SubAgent는 *읽기만*. 수정 권고는 메인 세션 또는 도메인 Worker 책임.

---

## 8. 함정 / 주의사항

- **단순 등급에 위임하지 마라** — 위임 비용 > 작업 비용. 메인 직접이 빠름.
- **여러 도메인 = 무조건 coordinator** — 메인 직접 분해 시 문맥 손실 사고.
- **Sonnet/Opus 비용 인식** — Opus는 비싸다. 에스컬레이션 발동 시 work-pin에 박힘.
- **MCP = 메인 세션 직접** — claude-in-chrome/Notion 등 MCP 도구는 메인 세션 전용(위임 불가).

---

## 9. 변경 시 동기화 책임

본 정책 수정 시 *반드시* 함께 갱신:

- [`../../CLAUDE.md`](../../CLAUDE.md) "SubAgent 풀" 섹션 (헌법 본문 표와 정합)
- [`../agents/_routing.md`](../agents/_routing.md) (빠른 매핑) + [`../agents/`](../agents/) (SubAgent 정의 8개)
- [`grade-and-risk.md`](grade-and-risk.md) (등급 → 처리 패턴) · [`work-judge.md`](work-judge.md) (등급/깃발 → 버킷) · [`loop-driver.md`](loop-driver.md) (진입 주체)
- [`review-tiering.md`](review-tiering.md) (reviewer 자동 호출 트리거)
- [`../../.claude/hooks/circuit-breaker.sh`](../../.claude/hooks/circuit-breaker.sh) (반복 도구 사용 알림 advisory)

---

## 갱신 이력

- 2026-06-26 — AgentDeck 이식 (ClaudeDev → manifest 기반). 도메인 정합(server/shared/client→main-process/agent-backend/renderer/shared-ipc, +agent-backend 신규=듀얼 백엔드), knowledge-gc 제거(D1), unity-bridge N/A, MCP=메인 직접, 위험깃발 정합(backend-contract 추가). 풀 8 라우팅·에스컬레이션·선택적 Opus·위임 경계는 프로세스 골격이라 그대로.
