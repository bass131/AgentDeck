# Policies — 헌법 외부화 가이드 카탈로그

> 헌법(`../../CLAUDE.md`)은 **AI가 매 응답마다 떠올려야 할 절대 규칙**만 둡니다.
> *해당 작업 시점에만 참조하면 되는 정책·양식·운영 가이드*는 본 폴더로 분리합니다.
>
> **분리 원칙**: 헌법 = "*무엇을 절대 어기지 않는가*" / policies/ = "*그것을 어떻게 운영하는가*".
> 헌법과 본 폴더가 충돌하면 **헌법이 이깁니다** (단일 진실 공급원 룰).
>
> **코어 참조(ADR-034)**: 안전 규칙의 *의미* 정본은 [`../../00_Documents/00_Harness/CORE.md`](../../00_Documents/00_Harness/CORE.md). 본 폴더 정책 중 코어로 승격된 의미 — 등급·보고(CORE-10) · 비가역 게이트(CORE-06) · 파괴 명령(CORE-07) · 커밋 규율(CORE-09) — 는 코어가 의미 정본이고, 각 정책 문서는 그 *운영 상세*(임계값·양식·절차)를 소유한다.

> **강제 출처 범례** (HR2 P06, 2026-07-25) — 규칙 옆 라벨은 **무엇이 그 규칙을 지키게 하는가**를 뜻합니다.
> `[기계: X]` = X가 **차단**한다(훅 `exit 2` 또는 `permissions`의 deny/ask) ·
> `[알림: X]` = X가 **환기만** 한다(advisory `exit 0` — 무시해도 그대로 진행된다) ·
> `[문서 규범]` = 훅에도 `permissions`에도 **없다**.
> ⚠️ `[문서 규범]`은 "기계가 안 받쳐주니 지워도 되는 문구"가 아니라 **그것이 유일한 방어선**이라는 뜻입니다.
> 전수 지도·판정 근거 = [`06-enforcement-labeling.md`](../../01_Phases/21_HR2-opus5-renewal/06-enforcement-labeling.md).

---

## 정책 목록 (정책 11개 + 본 INDEX = `*.md` 12파일)

**강제 출처 열이 이 카탈로그의 핵심**입니다 — 어떤 정책이 기계로 받쳐지고 어떤 정책이 문구 하나로 서 있는지를 한 눈에 봅니다. 정책을 "정리"하려는 사람은 이 열을 먼저 읽어야 합니다.

| 파일 | 한 줄 요약 | 강제 출처 | 헌법 참조 위치 |
|---|---|---|---|
| [`execution-owner.md`](execution-owner.md) | 실행 주체 판정표(잡무 기준 v1) — 판단 생존/새 재료 2축 + 모델 티어 4층 + 과속방지턱 강제 | `[기계: supervisor-guard ②]` (실행 경계만) | "멀티에이전트 분담" |
| [`reporting-format.md`](reporting-format.md) | 5단계 보고 양식 (복잡 이상, 비동기 MD 박제) + HTML 시각화는 **영호 요청 시** | `[문서 규범]` (그릇만 기계) | "응대 원칙 / 작업 보고" |
| [`pin-and-done.md`](pin-and-done.md) | work-pin 압축본(5+1 필드) + -DONE.md 박제(복잡/대규모) + 세션 마감 권유 | ⭐ `[기계: phase-gate-validator]` | "작업 좌표 + Phase 완료 박제" |
| [`doc-thresholds.md`](doc-thresholds.md) | 220줄·350줄 문서 세분화 + 단위 작업 비대 시 등급 재산정 | `[문서 규범]` (훅 0건) | "문서 운영 / 문서 세분화" |
| [`grade-and-risk.md`](grade-and-risk.md) | 정량 4등급(단순/보통/복잡/대규모) + 위험 깃발(trust-boundary·backend-contract·shared-contract·irreversible·ui-visual·harness) 자동 상향 | `[알림: risk-detector]` + `[문서 규범]` — **하류 게이트의 상류 스위치** | "작업 등급" |
| [`subagent-routing.md`](subagent-routing.md) | SubAgent 10역할 라우팅 + 자동 호출 + 모델 티어 에스컬레이션 | `[문서 규범]` (모델 티어만 `agent-model-canon.test.ts`로 기계 고정) | "SubAgent 풀" |
| [`review-tiering.md`](review-tiering.md) | 3-Tier 리뷰 + Tier 2 = reviewer + plan-auditor 두 SubAgent | ⚠️ `[문서 규범]` + `[알림: reviewer-auto-trigger]` — **plan-auditor는 훅 참조 0건** | "SubAgent 풀 / 자동 호출 트리거" |
| [`pr-and-merge-gate.md`](pr-and-merge-gate.md) | PR 생성/머지 = irreversible 깃발 + 사용자 명시 GO + admin bypass 예외 경로(솔로 휴면) | ⭐ `[기계: settings ask 6줄]` | "확신이 없을 때 / PR 게이트" |
| [`loop-driver.md`](loop-driver.md) | 루프 엔진(내장 /loop+Workflow) + v1 attended + done 판사=CI + 세션 2종 | `[문서 규범]` — **게이트 *실행*을 강제하는 훅 없음(Stop 훅 부재)** | "운영 모드" |
| [`work-judge.md`](work-judge.md) | 3버킷 판정자(a 기계 / b 취향·육안 / c 판단·비가역) + 깃발→버킷 매핑 | 비가역 일부만 `[기계: settings ask]`, **판단형 (c)는 `[문서 규범]`**(attended 전제) | "작업 등급 / 운영 모드" |
| [`review-throughput.md`](review-throughput.md) | 리뷰 처리량(예외기반·신뢰졸업·시선=max(위험,학습가치)) | `[문서 규범]` — 졸업 **상한**이라 처리량 최적화의 첫 삭제 후보이자 마지막 방어선 | "SubAgent 풀 / 운영 모드" |

> **읽는 법 (HR2 P06 실측 2026-07-25)**: 하네스의 기계 강제는 생각보다 **좁다** — 차단력이 있는 훅은 `supervisor-guard`·`dangerous-cmd-guard`·`tdd-guard`·`phase-gate-validator` **4종**뿐이고, `pin-injector`·`risk-detector`·`circuit-breaker`·`reviewer-auto-trigger`·`convention-size-guard` **5종은 전부 알림**(`exit 2` 0건)입니다. 나머지는 `permissions`의 deny 20·ask 6줄입니다(P06 실측 시점은 16줄이었고, P07 폴더 개명이 신·구 경로 병행으로 4줄을 더했습니다 — 2026-07-26 재실측).
> ⇒ **정책 문서의 문장 대부분이 유일한 강제**입니다. "기계가 받쳐주니 문구는 군더더기"라는 전제로 정리에 들어가면, 실제로는 방어선만 남기고 지우는 게 아니라 **방어선을 지우게 됩니다**.

> **스킵**: `knowledge-system.md` (AI 캐시 + GC) — 솔로 + self-reinforcement 위험 회피. 세션 경계 캐시는 memory(auto-memory `MEMORY.md`)가 담당.

---

## 추가 정책 발생 시

- 본 폴더에 `{topic}.md` 추가 → 본 `INDEX.md` 표에 한 줄 추가 → 헌법 참조 위치 명시.

## 폐기 시

- 파일 자체는 `git history`로 보존, INDEX에서 제거 → 헌법에서 해당 링크 제거.

---

## 갱신 이력

- 2026-06-26 — AgentDeck 이식 (ClaudeDev → manifest 기반). 정책 11개 중 `knowledge-system` 스킵(D1) → 10개 카탈로그. 경로·도메인·게임 흔적 정합. 헌법 참조 위치는 P2(CLAUDE.md 재작성) 시점 확정.
