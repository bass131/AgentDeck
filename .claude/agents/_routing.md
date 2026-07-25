# Agents Routing — AgentDeck SubAgent 풀

> *작업 → SubAgent* 빠른 매핑. WHY는 [ADR-010](../../00.Documents/ADR.md), 본 문서는 HOW. ClaudeDev 패턴을 AgentDeck 도메인에 적용.
> 상세 정책(엔진별 모델 티어·에스컬레이션·위임 입력 약속·자동 호출 트리거) = [`../policies/subagent-routing.md`](../policies/subagent-routing.md) · 실패 흐름 = [`_escalation.md`](_escalation.md) · 위험 깃발 단일 정의 = [`../policies/grade-and-risk.md`](../policies/grade-and-risk.md).

## 도메인 → SubAgent 매핑

| 작업 도메인 | 위임 대상 | 비고 |
|---|---|---|
| Electron 라이프사이클 / BrowserWindow / IPC 핸들러 등록 / 영속화(JSON 파일) / fs watch·diff / git / lsp 호스트 | `main-process` | `02.Source/main/**` (단, 어댑터 제외) |
| 코딩 엔진 어댑터(Claude Code · Codex) / 백엔드 registry / AgentEvent 정규화 | `agent-backend` | `02.Source/main/01_agents/**` |
| React UI / 3-pane 레이아웃 / 컴포넌트 / Zustand store / 테마 | `renderer` | `02.Source/renderer/**` |
| IPC 계약(채널명·요청/응답 타입) / 공통 AgentEvent 타입 / preload contextBridge | `shared-ipc` | `02.Source/shared/**` + `02.Source/preload/**` |
| 단위/e2e 테스트 / 픽스처 / 회귀 안전망 | `qa` | `99.Others/tests/**` (앱 코드 R only) |
| 운영 잡무 — 게이트 실행·요약 / git add·commit(명시 파일) / work-pin·CHANGELOG / Phase 상태 플립·DONE·보고서 초안 / 실측 심부름 | `secretary` | 판정표([`../policies/execution-owner.md`](../policies/execution-owner.md), 잡무 기준 v1) — **기계 실행·큰 입출력만**. 문구·회고는 메인 직접. 코드·테스트 수정 절대 X, push/PR 금지 |
| 루트 공통 설정 — `package.json`·`electron.vite.config.ts`·`tsconfig*`(빌드 계열) / vitest·playwright config(테스트 러너) | 빌드 계열 = `main-process` · 테스트 러너 = `qa` | 루트 config 소유 명시(2026-07-17 창) — 변경 시 reviewer 권장 |
| 복잡/대규모 Phase 분해·위임·통합 | **메인 세션 직접** | 2026-07-25 이관 — coordinator는 위임 권한 반납(ADR-010 개정 1) |
| 통합 후 경계 정합 대조 — IPC 채널↔shared↔preload · AgentEvent↔타입 · 테스트↔코드 | `coordinator` | R only, 위임 권한 **없음** |
| 설계 분기 자문(선택지 비교·ADR 초안) / 막힌 문제 진단(에스컬레이션 최종단) | `chief-tech-operator` | R only. ⚠️ **자동 호출 X** — 메인이 제안, 영호 승인 후에만 |
| 코드 점검 / Phase 설계 검증 | `reviewer` / `plan-auditor` | R only |
| 헌법 / ADR / docs / `.claude` 하네스 자체 | (위임 X, 사용자 단독) | |

## 등급 → 처리 패턴

| 등급 | 처리 | SubAgent 동원 | 모델 원칙 |
|---|---|---|---|
| **단순** (1 도메인 × 1 파일 × ≤10줄) | 판정표([`../policies/execution-owner.md`](../policies/execution-owner.md)) — 판단이 살아 있는 산출물은 **메인 직접**, 기계 실행·큰 입출력은 `secretary`, 코드는 도메인 Worker | 메인 또는 secretary 또는 Worker 1 | 역할 frontmatter 기본값 |
| **보통** | Worker 1개 | main-process / agent-backend / renderer / shared-ipc / qa 중 1 | `claude-sonnet-5` |
| **복잡** | 메인 분해 + Worker 1~2 | + coordinator 경계 검증(경계 걸릴 때) + reviewer (조건부) | 위험 깃발 시 `claude-opus-5` 상향 |
| **대규모** | 메인 분해 + Team | Worker 3~4 + plan-auditor 사전 + coordinator 경계 검증 + reviewer 통합 | `claude-opus-5` 우선 |

**위험 깃발** (단일 정의 = [`../policies/grade-and-risk.md`](../policies/grade-and-risk.md)): `trust-boundary`(신뢰경계/preload/IPC 핸들러/API키) · `backend-contract`(AgentBackend·AgentEvent = 전 어댑터 영향) · `shared-contract`(IPC 계약 단일정의 — 양쪽 typecheck) · `irreversible`(push/PR/merge/배포/`package`) · `ui-visual`(renderer 시각/CSS = 버킷 b 육안) · `harness`(.claude/·.claude/hooks/ 변경). 깃발 처리(정본 = grade-and-risk.md "깃발→루프 버킷"): 계약 깃발(backend-contract·shared-contract) = reviewer 무조건 + 모델 티어 상향 / trust-boundary·irreversible = 버킷 (c) 사람 게이트 / ui-visual = 버킷 (b) 육안. (risk-detector.sh가 trust-boundary/backend-contract/shared-contract/harness 자동 검출 — advisory)

## 작업 판정 3버킷 (work-judge — ClaudeDev 적응, ADR-025)
*무엇을 자율로 처리하고 무엇을 사람이 판단하나*의 단일 기준. attended 자동 루프(`/refactor-sweep` 등)·게이트 결정에 사용.

| 버킷 | 정의 | 처리 | 깃발/예 |
|---|---|---|---|
| **(a) 기계 판정** | 객관적 합격 기준 존재 | **자율 게이트** — typecheck 양쪽 green + 테스트 baseline 비감소 + lint 0이면 통과 | 빌드·테스트·회귀·거동불변 리팩토링(✅) |
| **(b) 육안/취향** | 시각·UX·미감 — 자동 검증 불가 | **사용자 트랙**(병행) — 무인 commit X, 제안/스테이징까지 | renderer 시각·CSS·레이아웃(UI.md 안티슬롭, refactor-sweep G3) |
| **(c) 비가역/판단** | 되돌리기 어렵거나 결정 성격 | **사람 게이트(ask)** — 무인 절대 X | push/PR/merge/배포·`package`·신뢰경계 구멍·ADR/헌법(`irreversible`/`trust-boundary`, G4/G7) |

→ 깃발 매핑: `irreversible`·`trust-boundary` → (c) / renderer 시각 → (b) / 그 외 거동불변 → (a).

## 자동 호출 트리거

### Coordinator (통합 **직후** — 등급 결정 직후가 아님)
- **무조건**: `02.Source/shared/**` 계약 + 그 소비처(`main`·`preload`·`renderer`)가 같은 작업에서 함께 바뀜.
- **권장**: 도메인 2개 이상이 한 Phase에서 합쳐짐. **스킵**: 단일 도메인 / 경계 무관.

### Chief-tech-operator (⚠️ 자동 호출 없음)
- 메인이 제안 → **영호 승인 후에만** 호출(Fable 5 단가). 제안 시점 = 설계 분기 / 3차 실패 후 진단.

### Reviewer (Tier 2-A, Worker 코드 변경 후)
**무조건**: `02.Source/shared/**`(IPC 계약) 변경 · `AgentBackend`/`AgentEvent` 변경 · preload 노출 변경 · 계약 깃발(backend-contract·shared-contract) 발동 · 사용자 "리뷰".
**조건부**: 실질 변경 ≥10줄 + 등급 ≥ 보통.
**스킵**: 테스트만 / 주석·rename / 사용자 "리뷰 스킵 + 사유".

### Plan-auditor (Tier 2-B)
**무조건**: `01.Phases/**/NN-*.md` Write/Edit(Phase 정의) · 마일스톤 계획 신설/갱신.
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
5항목 중 하나라도 누락 시 Worker는 *추측 없이 즉시 종료* + **메인 세션에 입력 부족 알림**.

## 권한 경계 (위반 시 거부)

| SubAgent | R/W | R only | 절대 X |
|---|---|---|---|
| `main-process` | `02.Source/main/**`(01_agents/ 제외) | `02.Source/shared/**` `02.Source/renderer/**` | `02.Source/main/01_agents/**` 본문 · 헌법/ADR/docs |
| `agent-backend` | `02.Source/main/01_agents/**` | `02.Source/shared/**`(타입 사용) `02.Source/main/**` | `02.Source/renderer/**` · 헌법/ADR · API키 하드코딩 |
| `renderer` | `02.Source/renderer/**` | `02.Source/shared/**` | `02.Source/main/**` · preload 본문 |
| `shared-ipc` | `02.Source/shared/**` `02.Source/preload/**` | `02.Source/main/**` `02.Source/renderer/**` | 핸들러 *구현* 본문(계약만 정의) · 헌법/ADR |
| `qa` | `99.Others/tests/**` · 픽스처 | 앱 코드 전체 | 앱 소스 본문 |
| `secretary` | `01.Phases/**` 문서 · `00.Documents/reports/**` · `.claude/state/current-pin.txt` · `.claude/CHANGELOG.md`(예외 2파일) · git add(명시)·commit | 전체 | `02.Source/**`·`99.Others/tests/**` 편집 · `.claude/**` 나머지 전부 · push/PR/merge/reset · 헌법/ADR/UI.md 창작 편집 |
| `reviewer` | (없음) | 전체 | 코드 편집 X |
| `plan-auditor` | (없음) | 전체 | 코드 편집 X |
| `coordinator` | (없음) | 전체 | 코드 편집 X · **위임 X**(`Agent` 반납, 2026-07-25) |
| `chief-tech-operator` | (없음) | 전체 | 코드·문서 편집 X · 위임 X · **영호 승인 없이 호출 X** |

## 재귀 차단 (절대)
- **메인 세션 → SubAgent 1단계만.** SubAgent가 다른 SubAgent 직접 호출 X.
- **담보는 런타임**: 중첩 OFF(v2.1.220 + `SPAWN_DEPTH` 미설정)로 서브에이전트에 `Agent` 도구 자체가 없다. 전 역할 frontmatter의 `disallowedTools: Agent`가 이중 잠금.
- Worker가 타 도메인 작업 필요 발견 → 결과에 *분해 요청* 표기 → **메인이 재분해**.
- ⚠️ 중첩이 다시 켜지는 버전이 오면 이 항목 재검토(그때는 frontmatter만 남는다).

## 변경 시 동기화 책임
본 문서 수정 시 함께 갱신: `CLAUDE.md`(분담 표) · [`../policies/subagent-routing.md`](../policies/subagent-routing.md)(상세 라우팅) · [`_escalation.md`](_escalation.md)(실패 흐름) · `chief-tech-operator.md`(분해 패턴 카탈로그 — 2026-07-25 coordinator에서 이관) · 각 SubAgent의 *권한 경계* 절 · `00.Documents/ADR.md`(ADR-010) · `99.Others/tests/agents/agent-model-canon.test.ts`(역할 추가 시 `EXPECTED_MODEL` 등재 필수 — 누락하면 red).
