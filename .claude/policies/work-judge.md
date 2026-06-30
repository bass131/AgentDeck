# Work Judge — 3버킷 판정자 (무엇을 루프에 맡기나)

> **근거**: loop-driven 운영([`loop-driver.md`](loop-driver.md), [`review-throughput.md`](review-throughput.md)). 헌법 충돌 시 **헌법이 이깁니다.**
>
> **이 문서의 역할**: 각 작업을 *"루프 자율 / 사람 트랙 / 사람 게이트"* 중 어디로 보낼지 판정하는 축. 엔진은 [`loop-driver.md`](loop-driver.md), 리뷰 처리량은 [`review-throughput.md`](review-throughput.md)가 분담.

본 문서는 *4종 Stop + 자동 진행*을 **판정자(judge) 축으로 재서술**한 것입니다. [`grade-and-risk.md`](grade-and-risk.md)의 **위험 깃발이 1차 분류기**입니다.

---

## 1. 3버킷

| 버킷 | 판정자 | 처리 | risk 깃발 |
|---|---|---|---|
| **(a) 기계 판정** | 빌드·테스트(vitest)·typecheck·lint·e2e(playwright)·dangling·hook smoke | **루프 자율** (멈추지 않음) | 무깃발 |
| **(b) 취향·육안** | 사람 (renderer 시각·UI 미감·레이아웃) | **사람 트랙** (병행, 루프 안 막음) | `ui-visual` |
| **(c) 판단·비가역** | 사람 (설계 분기·push/PR/merge·배포·IPC 계약 버전·JSON 영속 스키마 변경·trust-boundary) | **사람 게이트 (Stop)** | `irreversible` / `trust-boundary` |

- **(a)**: 기계가 통과/실패를 판정하면 사람 개입 없이 루프가 진행. done 판사 상세 = [`loop-driver.md`](loop-driver.md).
- **(b)**: 시각·미감 등 *취향*은 자동화가 힘듦 → 기능 구현은 진행하고 사람이 *육안 검토*([`../../00.Documents/UI.md`](../../00.Documents/UI.md) 안티슬롭). 무인 commit X, 제안/스테이징까지.
- **(c)**: 되돌리는 비용이 크거나 사람 판단이 필요한 것 → 루프가 멈추고 영호 GO 대기. `ask(gh pr merge/create)` 게이트는 절대 보존 ([`pr-and-merge-gate.md`](pr-and-merge-gate.md)).

---

## 2. 깃발 → 버킷 매핑

**깃발 정의 자체는 여기서 재정의하지 않습니다** — 단일 진실은 [`grade-and-risk.md`](grade-and-risk.md). 본 절은 그 깃발을 버킷에 *매핑*만 합니다 (중복 0):

| 깃발 | 버킷 |
|---|---|
| 무깃발 | (a) 루프 자율 |
| `ui-visual` | (b) 사람 트랙 |
| `irreversible` | (c) 사람 게이트 |
| `trust-boundary` | (c) 사람 게이트 |
| `backend-contract` | 기본 (a) + reviewer 무조건 — 설계 분기 동반 시 (c) |
| `shared-contract` | 기본 (a) + reviewer 무조건 (IPC 계약 — 양쪽 typecheck 기계 검증) |
| `harness` | 기본 (a) — 문서·config는 기계 검사(dangling·hook smoke). **단 권한·게이트 변경**(settings `ask(pr)` 매처 등) 동반 시 **(c)로 상향** |

---

## 3. v1 / v2 강제 차이 (중요)

- **버킷 (c)의 *물리적* 강제는 v1(attended)에서 사람 게이트로 성립**합니다 — 사람이 그 자리에 있어 GO를 누르므로.
- [`../../.claude/hooks/risk-detector.sh`](../../.claude/hooks/risk-detector.sh)는 **advisory**(알림만, 차단 X)입니다. 따라서 **v2(무인)는 "깃발 → 사람 게이트 자동 적재" hook이 선결**되어야 (c)가 물리적으로 강제됨. 그 hook 전까지 v2에서 (c) 버킷은 *서류상 분류*에 불과 → **v2 미adopt**.

---

## 4. 불필요한 사람 게이트 최소화

> ⚠️ 사람 게이트가 남발되면 throughput 이득이 깎입니다.

- 사람 게이트는 **진짜 (c)에만**. 가역적 보통/단순 작업이 습관적으로 (c)로 새지 않게.
- 판정이 애매하면 *기계 판정 우선* — [`grade-and-risk.md`](grade-and-risk.md) 등급 + 깃발로 먼저 거름. 깃발 0 + 가역이면 (a).
- 사람 게이트 **빈도를 모니터링** → 자주 멈추는 유형은 [`review-throughput.md`](review-throughput.md)의 *신뢰 졸업* 후보 (안전 증명되면 배치 GO로 강등).

---

## 5. 변경 시 동기화 책임

본 정책 수정 시 *반드시* 함께 점검:

- [`loop-driver.md`](loop-driver.md) (엔진 — 본 문서를 가리킴)
- [`grade-and-risk.md`](grade-and-risk.md) (깃발 정의 *원천* — 본 문서는 매핑만)
- [`review-throughput.md`](review-throughput.md) (시선 배분·신뢰 졸업 연동)
- [`../../.claude/hooks/risk-detector.sh`](../../.claude/hooks/risk-detector.sh) (깃발 검출 — advisory 한계)
- [`pr-and-merge-gate.md`](pr-and-merge-gate.md) (버킷 (c) 게이트)
- [`INDEX.md`](INDEX.md) (본 폴더 카탈로그)

---

## 갱신 이력

- 2026-06-26 — AgentDeck 이식 (ClaudeDev → manifest 기반). 깃발 AgentDeck 정합(unity-asset→ui-visual, WSL2 회귀→CI typecheck/test/lint/e2e, Protocol.Version·DB마이그→IPC 계약 버전·JSON 영속 스키마), ClaudeDev ADR 번호 정리. 3버킷·판정자 축·사람 게이트 최소화는 프로세스 골격이라 그대로.
