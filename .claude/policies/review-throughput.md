# Review Throughput — 리뷰 처리량 모델 (병목 해소)

> **근거**: loop-driven 운영. [`review-tiering.md`](review-tiering.md)의 정적 트리거 매트릭스를 *예외 기반·신뢰 졸업*으로 보강. 헌법 충돌 시 **헌법이 이깁니다.**
>
> **이 문서의 역할**: 사람이 *모든* 산출물을 리뷰하지 않고 어디에 시선을 쓸지 정하는 정책. 판정자는 [`work-judge.md`](work-judge.md), 엔진은 [`loop-driver.md`](loop-driver.md). 리뷰 *트리거*의 기본형은 [`review-tiering.md`](review-tiering.md).

본 문서는 **throughput(처리량) 병목**을 해소합니다. AI 산출 속도를 사람의 *전수 리뷰*가 못 따라가면 직렬 병목이 됩니다. 사람을 *모든 산출물*에서 빼고 *고위험·고학습가치*에만 시선을 집중시킵니다.

---

## 1. 네 가지 기제

1. **예외 기반**: 고위험·신규·flagged + *샘플*만 사람이 봄. 나머지는 기계 게이트 + AI 리뷰가 통과. 일부 산출물은 **의식적으로** 완전 리뷰를 포기 = *잔여 위험 수용*.
2. **통합 고도**: 변경 100개를 보는 게 아니라 **통합 이야기 하나**를 봄. 루프는 coherent 단위로 묶고, 사람 이해를 돕는 *작업 정리 문서*(`-DONE.md` + HTML)로 요약.
3. **신뢰 졸업**: 안전이 증명된 카테고리는 개별 정독 없이 배치 GO (§3).
4. **시선 배분 = `max(위험, 학습가치)`**: 보일러플레이트는 빠르게, 새 IPC·까다로운 비동기는 깊게.

---

## 2. 항상 사람 시선 (졸업 불가)

다음은 신뢰 졸업 대상이 **아닙니다** (영구 사람 게이트 — [`work-judge.md`](work-judge.md) 버킷 (c)):

- `trust-boundary` / `irreversible` (push·PR·머지·배포·IPC 계약 버전·JSON 영속 스키마 마이그)
- 신규 아키텍처 / IPC 채널 / 공통 이벤트 타입
- 헌법 절대 원칙 인접 변경

---

## 3. 신뢰 졸업 N — 초안 (영호 확정 대기)

어떤 산출물 유형이 N회 무위반이면 샘플링으로 강등되는가:

| 산출물 유형 | 예시 | 졸업 처리 |
|---|---|---|
| **보일러플레이트·기계 생성** | 타입 정의 생성, 설정 1행 추가 | 즉시 샘플링 (정독 면제) |
| **패턴 반복** | 기존 핸들러 패턴 복제, 데이터 항목 추가 | 연속 **N회** 무위반 후 샘플링 강등 |
| **신규 구조·trust-boundary** | 새 IPC 채널·신뢰 경계·보안 | **졸업 불가** (항상 사람) |

**초안값**:

- **N = 3** (Rule of Three)
- 강등 = "매번 정독" → **1/3 무작위 샘플링**
- **위반 1회 = 졸업 취소** (원위치 + N 카운트 재시작)
- `trust-boundary`/`irreversible`는 영구 제외 (§2)

> ⚠️ 이건 **초안**입니다. 실제 N·샘플링 비율·유형 경계는 루프 운영 *실측 후* 영호가 확정. 너무 빨리 졸업시키면 잔여 위험 ↑, 너무 늦으면 throughput 이득 ↓ — 균형점은 실측이 알려줌.

---

## 4. AI가 통과시키는 것의 안전망

- `reviewer` 🔴 0 + 회귀 게이트(typecheck/test/lint) = 기계 + AI 통과. 그 위의 잔여 위험은 *의식적 수용*.
- **자기평가 편향 주의**: 무인 진단은 자기 코드를 후하게 봄 → 외부 cross-check 게이트가 가치(`refactor-sweep` 첫 dry-run에서 외부 시각이 self-assessment bias 적발한 전례). 외부 cross-review는 듀얼 백엔드 Track2 후 defer.

---

## 5. 변경 시 동기화 책임

본 정책 수정 시 *반드시* 함께 점검:

- [`loop-driver.md`](loop-driver.md) (엔진 — 본 문서를 가리킴)
- [`work-judge.md`](work-judge.md) (버킷 (c) 졸업 불가 정합)
- [`review-tiering.md`](review-tiering.md) (정적 트리거 매트릭스 → 본 모델 포인터)
- [`../agents/reviewer.md`](../agents/reviewer.md) (시선 = max(위험,학습가치) 분기)
- [`INDEX.md`](INDEX.md) (본 폴더 카탈로그)

---

## 갱신 이력

- 2026-06-26 — AgentDeck 이식 (ClaudeDev → manifest 기반). 게임 매핑(PDL 생성→타입 생성, 몬스터 데이터→패턴 반복, Protocol.Version·DB마이그→IPC 계약 버전·JSON 영속 스키마, 회귀 게이트→typecheck/test/lint), Codex β cross-review→defer(D3), ClaudeDev ADR 번호 정리. 네 기제·신뢰 졸업·시선 배분은 프로세스 골격이라 그대로.
