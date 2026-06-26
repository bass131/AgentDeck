# Reporting Format — 5단계 보고 (복잡 이상, 비동기 문서)

> **헌법 참조**: 본 정책은 헌법(`../../CLAUDE.md`) "응대 원칙 / 작업 보고" 섹션에서 링크됩니다.
> 충돌 시 헌법이 이깁니다.

본 문서는 **5단계 보고** 양식을 정의합니다. 보고는 *흐름을 끊는 인라인 출력*이 아니라 **비동기 문서(`-DONE.md` + HTML)로 박제**합니다 — 작업 자동 진행을 멈추지 않기 위해서.

---

## 1. 발동 조건

5단계 보고 구조는 **복잡 이상 등급의 `-DONE.md` + HTML 시각화 문서 *안*에** 박힙니다 (인라인 출력 아님). [`grade-and-risk.md`](grade-and-risk.md) 등급 정의 참조.

| 등급 | 5단계 보고(문서 내장) | -DONE.md | HTML 시각화 | work-pin |
|---|---|---|---|---|
| 단순 | ❌ | ❌ | ❌ | ✅ |
| 보통 | ❌ | ❌ | ❌ | ✅ |
| **복잡** | ✅ | ✅ | ✅ | ✅ |
| **대규모** | ✅ | ✅ | ✅ (+ 마일스톤 종합) | ✅ |

**왜 비동기 문서인가**: 인라인 5단계 보고 출력은 작업 흐름을 끊습니다. 새 모델 = 보고를 흐름에서 분리해 **문서로 추후 박제**, 사용자가 원할 때 체크. 인라인 멈춤은 *영호 직접 확인 지점*(비가역·승인 게이트·육안)에서만.

### 루프 보고 분기 (loop-driven)

루프 자율분과 사람 게이트는 *보고 시점*이 다릅니다 ([`work-judge.md`](work-judge.md) 버킷):

- **(a) 루프 자율** (기계 게이트 통과분): 원장/배치로 적재 → 추후 *pull 세션*(`/session:review`)에서 사람이 통합 검토. 즉시 멈추지 않음.
- **(c) 사람 게이트** (비가역·설계 분기): *즉시 surface* — 영호 GO 없이 진행 X.
- **통합 고도**: 변경 100개가 아니라 *통합 이야기 하나*(`-DONE.md`)로 요약 ([`review-throughput.md`](review-throughput.md)).

---

## 2. 양식

```
─────────────────────────────────────────
📋 작업 완료 보고: [작업 제목]
─────────────────────────────────────────

🎯 무엇을 만들었나 — 결과물을 사람 말로 한두 문장 (코드 줄 단위 X)
🤔 왜 필요한가 — 이게 없으면 뭐가 문제인지, 큰 그림에서 어디 끼는 조각인지
🛠️ 어떻게 만들었나 — 핵심 선택 1~3개와 이유 / 안 고른 대안과 이유 / 새 개념 한 줄
🧪 테스트 결과 — 무엇 돌렸는지 / 결과(통과/실패/측정값) / 수동 확인 절차
➡️ 다음 스텝 — 이어지는 작업 / 추천 1~2개 / 후속 고려사항
```

### 5개 라벨 (변경 금지)

1. **무엇을 만들었나**
2. **왜 필요한가**
3. **어떻게 만들었나**
4. **테스트 결과**
5. **다음 스텝**

이 5개 라벨은 `-DONE.md` 박제 게이트 훅([`../../.claude/hooks/phase-gate-validator.sh`](../../.claude/hooks/phase-gate-validator.sh))이 grep으로 강제합니다. 라벨 변경 시 훅도 동시 갱신 필요.

---

## 3. MD + HTML 이중 박음 (평가/발표 자산)

**복잡 이상** 등급 Phase 완료 시 5단계 보고 구조를 두 형식으로 박습니다 (인라인 출력 아님 — 문서로만):

| 형식 | 위치 | 용도 |
|---|---|---|
| **MD** | `phases/<owner>/M{N}-{slug}/NN-{phase}-DONE.md` 안 "5단계 보고" 섹션 | git에 박힘, AI 활용 가능 |
| **HTML** | `docs/reports/M{N}-{phase}.html` | 발표 자산, 사람 가독성 |

### HTML 변환 약속

- MD 본문을 그대로 HTML로 렌더링 (별도 본문 X — *동기화 책임*)
- 헤더는 5단계 보고 5 라벨 유지 (스타일은 자유)

### 자동화 후보

- *MD → HTML 변환 스크립트*(`scripts/`) 신설 검토. 본 정책 시점엔 수동.

---

## 4. WORK-ID

work-pin·`-DONE.md`·commit 박제에 *동일 WORK-ID* 박아 산출물을 그래프화 → `grep "<WORK-ID>"` 한 방으로 한 작업의 모든 흔적 회수.

- **Phase 작업 중**: 현재 Phase의 slug (예: `m1-mvp-phase01`)
- **Phase 외 일반 작업**: `ad-hoc-YYYYMMDD-주제` (예: `ad-hoc-20260626-harness-port`)

WORK-ID 시스템은 [`pin-and-done.md`](pin-and-done.md)에서 통합 관리.

---

## 5. 양식 노이즈 원칙 (교훈)

**핵심 기준**: *양식이 가치를 만드는지 노이즈를 만드는지*가 헌법 운영 결정의 핵심. 가치 < 노이즈 = 죽임.

- 매 응답 첨부형 봉투 양식은 두지 않음 — *변경 / 검증 / 남은 것*은 work-pin + commit message로 이미 박힘(중복).
- 5단계 보고는 **복잡 이상에만** 발동 — 단순/보통은 work-pin + commit으로 충분.

---

## 6. 변경 시 동기화 책임

본 정책 수정 시 *반드시* 함께 갱신:

- [`../../.claude/hooks/phase-gate-validator.sh`](../../.claude/hooks/phase-gate-validator.sh) (5단계 보고 5 라벨 grep)
- [`../templates/done-md-template.md`](../templates/done-md-template.md) (-DONE.md 양식 정합)
- [`pin-and-done.md`](pin-and-done.md) (WORK-ID 일관성)
- [`grade-and-risk.md`](grade-and-risk.md) (등급별 보고 양식 격차)
- [`loop-driver.md`](loop-driver.md) · [`work-judge.md`](work-judge.md) · [`review-throughput.md`](review-throughput.md) (루프 보고 분기 — a 배치 / c 즉시)

---

## 갱신 이력

- 2026-06-26 — AgentDeck 이식 (ClaudeDev → manifest 기반). 경로 적응(훅 `.claude/hooks/`, 보고서 `docs/reports/`, Phase `phases/`), ClaudeDev ADR 번호·knowledge 트랙·work-envelope 역사 서술 정리. 5단계 보고·비동기 문서 박제·HTML 이중 박음은 프로세스 골격이라 그대로.
