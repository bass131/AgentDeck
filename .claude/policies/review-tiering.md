# Review Tiering — 3-Tier 리뷰 + Tier 2 자동 SubAgent 2종

> **헌법 참조**: 본 정책은 헌법(`../../CLAUDE.md`) "🤖 SubAgent 풀 / 자동 호출 트리거" 섹션에서 링크됩니다.
> 충돌 시 헌법이 이깁니다.

본 문서는 코드 변경 후 리뷰 단계를 3개 Tier로 나누고, 그 중 **Tier 2 자동 호출**의 트리거·약속·결과 처리를 정의합니다. Tier 2 = `reviewer` + `plan-auditor` 두 자동 SubAgent.

---

## 1. 3-Tier 리뷰 구조

| Tier | 누가 | 언제 | 무엇을 |
|---|---|---|---|
| **Tier 0** 기계 게이트 | 빌드·vitest·typecheck·lint·playwright e2e·dangling | 모든 산출물 | 통과/실패 자동 판정 (사람 0) — **루프 자율** (work-judge 버킷 a) |
| **Tier 1** 도메인 셀프리뷰 | 도메인 SubAgent 자기 자신 | 코드 변경 직후, 결과 반환 전 | 자기 영역 헌법 위반 점검 |
| **Tier 2-A** 자동 통합 리뷰 | `reviewer` SubAgent | 메인 세션이 트리거 조건 충족 시 자동 호출 | reviewer 점검 기준 다축 |
| **Tier 2-B** Phase 정의 사전 검증 | `plan-auditor` SubAgent | Phase 정의 `.md` Write 후 자동 | 분해 적정성·의존성·완료 조건 명확성·등급 산정 |
| **Tier 3** 수동 깊은 리뷰 | `/harness-review` 슬래시 | 사용자 명시 호출 | 하네스 자체 점검 (헌법/정책/SubAgent 정합) |

> **throughput 모델 (loop-driven)**: 사람이 *모든* 산출물을 Tier 2로 보내지 않습니다 — 예외기반 + 신뢰졸업 + 시선 = `max(위험, 학습가치)`. §2의 정적 트리거 매트릭스는 [`review-throughput.md`](review-throughput.md)가 governs. Tier 0(기계 게이트)는 항상 무조건 자율.

---

## 2. Tier 2-A `reviewer` — 트리거 조건

도메인 SubAgent 코드 변경 후 메인 세션(또는 coordinator)이 다음을 *순서대로* 평가:

### 2-1. 무조건 호출 (조건 무시)
- `02.Source/shared/` (IPC 계약) 변경 포함 → 호출
- 새 IPC 핸들러/채널 추가 → 호출
- 사용자가 *"리뷰 돌려줘"* 명시 → 호출
- **위험 깃발 발동**(`trust-boundary`/`irreversible`/`ui-visual`) → 호출

### 2-2. 조건부 호출
- 실질 코드 변경 ≥ 10줄 + 등급 ≥ 보통 → 호출
- 단순 등급은 호출 X (위임 비용 > 가치)

### 2-3. 무조건 스킵
- 테스트 파일만 변경 → 스킵 (회귀 안전망 강화는 리뷰 우선순위 낮음)
- 주석/오타/rename만 → 스킵
- 사용자가 *"리뷰 스킵해줘 — <사유>"* 명시 + 사유 첨부 → 스킵, work-pin에 사유 기록

---

## 3. Tier 2-B `plan-auditor` — 트리거 조건

### 3-1. 무조건 호출
- `01.Phases/**/NN-{slug}.md` (Phase 정의) Write/Edit → 호출
- `_milestone-plan.md` Write/Edit → 호출
- 사용자가 *"plan 점검해줘"* 명시 → 호출

### 3-2. 점검 대상
- Phase 분해 적정성 (5~7개 / 마일스톤)
- 의존성 그래프 사이클 없음
- 완료 조건 명확성·정량성
- 등급 산정 적정성 ([`grade-and-risk.md`](grade-and-risk.md))
- 헌법 절대 원칙 위반 위험 사전 식별

### 3-3. 외부 cross-review

외부 cross-check(Codex β)는 *대규모 등급 + 비가역 변경* 시 별도로 사용자 호출. 본 시점엔 **defer**(듀얼 백엔드 Track2 후).

---

## 4. 입력 약속 (메인 세션 → SubAgent)

### Tier 2-A `reviewer` 호출 시

| 키 | 내용 |
|---|---|
| `range` | 변경 범위 식별자 (Phase slug 또는 ad-hoc id, WORK-ID와 동일) |
| `files` | 변경된 파일 절대 경로 목록 |
| `diff_summary` | 메인 세션이 작성한 자연어 diff 요약 |
| `grade` | 작업 등급 (위험 깃발 박힌 상태) |

**핵심 키 누락 시** reviewer가 *추측 없이 즉시 종료*. 메인 세션은 호출 전 다 준비.

### Tier 2-B `plan-auditor` 호출 시

| 키 | 내용 |
|---|---|
| `plan_files` | 변경된 plan/Phase 정의 `.md` 경로 |
| `milestone_context` | 어느 마일스톤의 일부인지 |
| `prior_phases` | 같은 마일스톤에서 이미 마감된 Phase의 -DONE.md 경로 (의존성 검증용) |

---

## 5. 결과 처리 (메인 세션 책임)

### Tier 2-A `reviewer` 반환

| 결과 | 다음 액션 |
|---|---|
| 🔴 **위반 있음** | 사용자에게 "고칠까요?" 확인 → 도메인 SubAgent 재위임. 사용자 *"패스"*면 work-pin에 `리뷰 패스 사유: <한 줄>` |
| 🟡 **개선 제안만** | 그대로 보여주고 통과. work-pin엔 별도 기록 X |
| 🟢 **위반 0개** | 통과. 메인 세션이 work-pin 마무리 후 사용자에게 최종 제시 |

### Tier 2-B `plan-auditor` 반환

| 결과 | 다음 액션 |
|---|---|
| 🔴 **결함 발견** | 사용자에게 결함 리스트 + 옵션 A(즉시 봉합) / 옵션 B(현 상태 진행) |
| 🟡 **개선 제안** | 그대로 보여주고 사용자 결정 |
| 🟢 **이상 없음** | Phase 진행 GO |

---

## 6. 우회 메커니즘 (사유 명시 후 허용)

사용자가 *"리뷰 스킵해줘"* 또는 *"plan 점검 스킵해줘"* 명시 시 메인 세션은 *사유*를 요청. 사유 받으면:

1. SubAgent 호출 스킵
2. work-pin에 `리뷰 스킵 사유: <한 줄>` 추가

이 흔적은 `grep "리뷰 스킵 사유"`로 한 방에 회수 — 우회 *습관화* 감지 가능.

---

## 7. 범위 (Scope)

| | 대상 | 비고 |
|---|---|---|
| ✅ **점검** | 헌법 / ADR / ARCHITECTURE / 테스트 커버리지 / 도메인 패턴 / 등급 산정 / God class | reviewer 에이전트 점검 기준 |
| ❌ **점검 X** | 코드 스타일 (네이밍/들여쓰기/포매팅) | ESLint + tsconfig 위임 |

**왜 코드 스타일 제외인가**: 솔로~소수 단계에서 *스타일 일관성*은 도구(ESLint + tsconfig)에 위임이 옳음.

---

## 8. 변경 시 동기화 책임

본 정책 수정 시 *반드시* 함께 갱신:

- [`../agents/reviewer.md`](../agents/reviewer.md) (reviewer SubAgent 명세 — 점검 축)
- [`../agents/plan-auditor.md`](../agents/plan-auditor.md) (plan-auditor SubAgent 명세)
- [`subagent-routing.md`](subagent-routing.md) (SubAgent 자동 호출 트리거 정합)
- [`pin-and-done.md`](pin-and-done.md) (work-pin에 *리뷰 스킵 사유* / *리뷰 패스 사유* 라인 박는 정합)
- [`review-throughput.md`](review-throughput.md) (예외기반·신뢰졸업 throughput 모델 — §2 정적 매트릭스 supersede 층)

---

## 갱신 이력

- 2026-06-26 — AgentDeck 이식 (ClaudeDev → manifest 기반). 게임 매핑(98_Shared→02.Source/shared, 패킷/핸들러→IPC 채널/핸들러, Roslyn+.editorconfig→ESLint+tsconfig, WSL2→CI), 위험깃발 정합(ui-visual), Codex β→defer(D3), ClaudeDev ADR 번호·REVIEW_CHECKLIST 별도 파일 참조 정리(reviewer.md로 통합). 3-Tier 구조·트리거·결과 처리는 프로세스 골격이라 그대로.
