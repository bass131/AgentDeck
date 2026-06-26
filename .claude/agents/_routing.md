# Agents Routing — AgentDeck SubAgent 풀

> *작업 → SubAgent* 빠른 매핑. WHY는 [ADR-010](../../docs/ADR.md), 본 문서는 HOW. ClaudeDev 패턴을 AgentDeck 도메인에 적용.
> 상세 정책(에스컬레이션·선택적 Opus·위임 입력 약속·자동 호출 트리거) = [`../policies/subagent-routing.md`](../policies/subagent-routing.md) · 실패 흐름 = [`_escalation.md`](_escalation.md) · 위험 깃발 단일 정의 = [`../policies/grade-and-risk.md`](../policies/grade-and-risk.md).

## 도메인 → SubAgent 매핑

| 작업 도메인 | 위임 대상 | 비고 |
|---|---|---|
| Electron 라이프사이클 / BrowserWindow / IPC 핸들러 등록 / 영속화(JSON 파일) / fs watch·diff / git / lsp 호스트 | `main-process` | `src/main/**` (단, 어댑터 제외) |
| 코딩 엔진 어댑터(Claude Code · Codex) / 백엔드 registry / AgentEvent 정규화 | `agent-backend` | `src/main/agents/**` |
| React UI / 3-pane 레이아웃 / 컴포넌트 / Zustand store / 테마 | `renderer` | `src/renderer/**` |
| IPC 계약(채널명·요청/응답 타입) / 공통 AgentEvent 타입 / preload contextBridge | `shared-ipc` | `src/shared/**` + `src/preload/**` |
| 단위/e2e 테스트 / 픽스처 / 회귀 안전망 | `qa` | `tests/**` (앱 코드 R only) |
| 복잡/대규모 Phase 분해·위임·통합 | `coordinator` | 위임만 (R only) |
| 코드 점검 / Phase 설계 검증 | `reviewer` / `plan-auditor` | R only |
| 헌법 / ADR / docs / `.claude` 하네스 자체 | (위임 X, 사용자 단독) | |

## 등급 → 처리 패턴

| 등급 | 처리 | SubAgent 동원 | 모델 |
|---|---|---|---|
| **단순** (1 도메인 × 1 파일 × ≤10줄) | 메인 세션 직접 | 없음 | — |
| **보통** | Worker 1개 | main-process / agent-backend / renderer / shared-ipc / qa 중 1 | Sonnet |
| **복잡** | Coordinator + Worker 1~2 | + reviewer (조건부) | Worker Sonnet, trust-boundary면 Opus |
| **대규모** | Coordinator + Team | Worker 3~4 + plan-auditor 사전 + reviewer 통합 | Worker Opus |

**위험 깃발** (단일 정의 = [`../policies/grade-and-risk.md`](../policies/grade-and-risk.md)): `trust-boundary`(신뢰경계/preload/IPC 핸들러/API키) · `backend-contract`(AgentBackend·AgentEvent = 전 어댑터 영향) · `shared-contract`(IPC 계약 단일정의 — 양쪽 typecheck) · `irreversible`(push/PR/merge/배포/`package`) · `ui-visual`(renderer 시각/CSS = 버킷 b 육안) · `harness`(.claude/·scripts/hooks/ 변경). 깃발 발동 시 모델 티어 상향 + reviewer 무조건 + 비가역은 사람 게이트. (risk-detector.sh가 trust-boundary/backend-contract/shared-contract/harness 자동 검출 — advisory)

## 작업 판정 3버킷 (work-judge — ClaudeDev 적응, ADR-025)
*무엇을 자율로 처리하고 무엇을 사람이 판단하나*의 단일 기준. 무인 루프(`/refactor-sweep` 등)·게이트 결정에 사용.

| 버킷 | 정의 | 처리 | 깃발/예 |
|---|---|---|---|
| **(a) 기계 판정** | 객관적 합격 기준 존재 | **자율 게이트** — typecheck 양쪽 green + 테스트 baseline 비감소 + lint 0이면 통과 | 빌드·테스트·회귀·거동불변 리팩토링(✅) |
| **(b) 육안/취향** | 시각·UX·미감 — 자동 검증 불가 | **사용자 트랙**(병행) — 무인 commit X, 제안/스테이징까지 | renderer 시각·CSS·레이아웃(UI_GUIDE 안티슬롭, refactor-sweep G3) |
| **(c) 비가역/판단** | 되돌리기 어렵거나 결정 성격 | **사람 게이트(ask)** — 무인 절대 X | push/PR/merge/배포·`package`·신뢰경계 구멍·ADR/헌법(`irreversible`/`trust-boundary`, G4/G7) |

→ 깃발 매핑: `irreversible`·`trust-boundary` → (c) / renderer 시각 → (b) / 그 외 거동불변 → (a).

## 자동 호출 트리거

### Coordinator (등급 결정 직후)
- 복잡/대규모 → 무조건. 보통+도메인 2개 → 권장. 단순 → X.

### Reviewer (Tier 2-A, Worker 코드 변경 후)
**무조건**: `src/shared/**`(IPC 계약) 변경 · `AgentBackend`/`AgentEvent` 변경 · preload 노출 변경 · 위험 깃발 발동 · 사용자 "리뷰".
**조건부**: 실질 변경 ≥10줄 + 등급 ≥ 보통.
**스킵**: 테스트만 / 주석·rename / 사용자 "리뷰 스킵 + 사유".

### Plan-auditor (Tier 2-B)
**무조건**: `phases/**/NN-*.md` Write/Edit(Phase 정의) · 마일스톤 계획 신설/갱신.
**스킵**: 오타·주석만.

## 위임 입력 약속 (필수 5항목)
```
@<worker-name>
작업: <한 줄>
입력 자산: <Phase 정의 / 의존 -DONE.md / 관련 파일 경로 / 관련 docs>
변경 대상: <폴더 또는 파일 목록>
완료 조건: <측정 가능 — 예: typecheck green + 테스트 N PASS>
출력: 진행 보고 + (필요 시) -DONE.md
```
5항목 중 하나라도 누락 시 Worker는 *추측 없이 즉시 종료* + coordinator에 입력 부족 알림.

## 권한 경계 (위반 시 거부)

| SubAgent | R/W | R only | 절대 X |
|---|---|---|---|
| `main-process` | `src/main/**`(agents/ 제외) | `src/shared/**` `src/renderer/**` | `src/main/agents/**` 본문 · 헌법/ADR/docs |
| `agent-backend` | `src/main/agents/**` | `src/shared/**`(타입 사용) `src/main/**` | `src/renderer/**` · 헌법/ADR · API키 하드코딩 |
| `renderer` | `src/renderer/**` | `src/shared/**` | `src/main/**` · preload 본문 |
| `shared-ipc` | `src/shared/**` `src/preload/**` | `src/main/**` `src/renderer/**` | 핸들러 *구현* 본문(계약만 정의) · 헌법/ADR |
| `qa` | `tests/**` · 픽스처 | 앱 코드 전체 | 앱 소스 본문 |
| `reviewer` | (없음) | 전체 | 코드 편집 X |
| `plan-auditor` | (없음) | 전체 | 코드 편집 X |
| `coordinator` | (없음, 위임 권한) | 전체 | 코드 편집 X · 다른 coordinator 호출 X |

## 재귀 차단 (절대)
- Coordinator → Worker **1단계만**. Worker가 다른 Worker 직접 호출 X.
- Worker가 타 도메인 작업 필요 발견 → 결과에 *분해 요청* 표기 → coordinator 재분해.
- Coordinator → 다른 Coordinator 호출 X (분해가 너무 깊으면 Phase 자체 오추정 신호).

## 변경 시 동기화 책임
본 문서 수정 시 함께 갱신: `CLAUDE.md`(분담 표) · [`../policies/subagent-routing.md`](../policies/subagent-routing.md)(상세 라우팅) · [`_escalation.md`](_escalation.md)(실패 흐름) · `coordinator.md`(분해 패턴) · 각 SubAgent의 *권한 경계* 절 · `docs/ADR.md`(ADR-010).
