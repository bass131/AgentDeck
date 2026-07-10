---
description: 하네스 자체 점검 — 헌법/SubAgent/Hook/슬래시 정합 + 옛 약속 가짜화 여부 + 양식 비용 평가
argument-hint: [scope] - 선택. 기본 all. 옵션: constitution | subagent | hook | command | all
---

하네스(영호 단독 통제 영역)의 *자체 점검* 슬래시 (Tier 3 수동).

점검 범위: **$ARGUMENTS** (없으면 `all`)

---

### 이 커맨드의 역할

헌법/하네스 검토를 *ad-hoc 메인 세션 안에서* 하면 일관성 X + 빠진 점 ↑. 슬래시화 = *재현 가능한 점검* + reviewer + plan-auditor 자동 동원.

**언제 호출**:
- 마일스톤 끝 (게이트 마감 직전)
- "하네스 어딘가 옛 약속이 가짜화됐나?" 의심 시
- 새 SubAgent / Hook / 슬래시 박은 직후 정합 점검

**언제 호출 X**:
- 코드 변경 점검 — reviewer (Tier 2-A 자동)
- Phase 정의 점검 — plan-auditor (Tier 2-B 자동)

---

### Scope 옵션

| Scope | 점검 대상 | 동원 |
|---|---|---|
| `constitution` | `CLAUDE.md` + `00.Documents/ADR.md` + `.claude/policies/` | reviewer |
| `subagent` | `.claude/agents/*.md` (9역할 + _routing + _escalation) | reviewer + plan-auditor |
| `hook` | `.claude/hooks/*.sh` + `.claude/settings.json` | 본인 + reviewer (실행 우회 가능성) |
| `command` | `.claude/commands/**/*.md` | reviewer + plan-auditor (정합) |
| `all` | 위 4개 통합 | reviewer + plan-auditor |

> `knowledge` scope는 AgentDeck 미설치(D1 — knowledge 캐시 없음, memory가 세션 캐시 담당).

---

### 작업 흐름

#### Step 1. 컨텍스트 수집
scope에 따른 점검 대상 파일 목록 박음.

#### Step 2. reviewer SubAgent 호출
[`../agents/reviewer.md`](../agents/reviewer.md) 호출 — *하네스 자체*가 헌법/ADR/구조를 잘 따르는지 다축 점검. 특화 점검:
- **"주석 약속 가짜화" 잔존**: 헌법/CLAUDE.md에 "박혀있어야 함" 약속이 *코드에 실재*하는지 (신뢰경계·엔진추상화·IPC계약 단일 같은 CRITICAL 규칙)
- **policies/ ↔ 헌법 충돌**: 정책이 헌법 우선순위 위반하나
- **ADR 모순**: 새 ADR이 옛 ADR 뒤집었으면 옛 ADR에 *deprecated* 표기 있나
- **policies/ 신선도**: 마지막 갱신 6개월 넘은 정책

#### Step 3. plan-auditor SubAgent 호출
[`../agents/plan-auditor.md`](../agents/plan-auditor.md) 호출 — *설계 시각* 점검:
- SubAgent 풀 분해 적정성 (8개 적정한가)
- 의존성 그래프 (Coordinator → Worker 재귀 차단 정합)
- SubAgent 입력 약속 명확성 / 등급 매핑 일관 / 권한 경계 위반 없나

#### Step 4. 양식 비용 평가
*양식 다이어트* 정신 정합:
- work-pin 평균 줄 수 (목표 30~40)
- -DONE.md 평균 줄 수 (복잡/대규모만)
- 5단계 보고 발동 빈도 (복잡 이상만 의도)
- 양식 비용 vs 가치 = 발견 비용 / 학습 가치

*양식이 가치보다 비용 ↑* 의심되면 짚기.

#### Step 5. 산출물 생성
`00.Documents/reviews/YYYY-MM-DD-harness-review-{scope}.md` Write:

```markdown
# 하네스 자체 점검 — {YYYY-MM-DD} — scope={scope}

## TL;DR
- 🔴 결함 N개 / 🟡 제안 N개 / 🟢 정합 N개

## reviewer 결과
[그대로]

## plan-auditor 결과
[그대로]

## 양식 비용 평가
- work-pin 평균: <N>줄 / -DONE.md 발동: <N>건 / 5단계 보고: <N>건

## 결정 권유
- 🔴 즉시 봉합 / 🟡 별 마일스톤 / 🟢 그대로
```

#### Step 6. 사용자 보고
```
🔬 하네스 자체 점검 완료 — scope: {scope}
산출물: 00.Documents/reviews/YYYY-MM-DD-harness-review-{scope}.md
🔴 결함: N개 / 🟡 제안: N개 / 🟢 정합: N개
➡️ 🔴 0개 = GO / 🔴 N개 = 본인 결정
```

---

### Hard rules

1. **영호 단독 호출** — 헌법/SubAgent/Hook 모두 영호 단독 통제.
2. **읽기 전용** — Step 5 산출물 외 코드/헌법 *수정 X*. 결함 발견해도 *제안*만.
3. **scope 디폴트 = all**.
4. **양식 비용 평가 정량** — "양식 많아 보임" 모호 표현 X. 줄 수 / 빈도 명시.

---

### 함정

- **scope=all 비용 큼** — 4영역 + 고성능 점검 역할 2개. 잦은 호출 X. 마일스톤 끝/큰 의심 시만.
- **reviewer false positive** — 모호하면 🟡. 🔴는 *명확한 헌법/ADR 위반*만.
- **plan-auditor는 설계 영역** — 코드 위반은 reviewer.

---

### 옛 슬래시와 차이

옛 코드 리뷰 책임은 reviewer SubAgent로 흡수 (Tier 2-A 자동). 본 슬래시는 *하네스 메타 점검* 책임만 (코드 변경 점검 X).
