---
owner: 영호
milestone: HR2
phase: 04
title: effort 도입 — 라이브 A/B 프로브 게이트
status: pending
grade: 보통
risk: harness
loop_track: human-gate
estimated: 1~3h
domain: cross
summary: effort frontmatter는 이 저장소에서 여섯 번째 뒤집기다 — 라이브 프로브가 실효를 보이지 못하면 그 자리에서 드롭한다.
---

# Phase 04: effort 도입 — 라이브 A/B 프로브 게이트

> **상태**: pending
> **마일스톤**: HR2
> **등급**: 보통 (risk: harness)
> **담당**: 메인 직접

---

## 🎯 목표

`effort` frontmatter를 **실효가 확인될 때만** 도입한다. 이 Phase는 기능 추가가 아니라 **게이트**다 — 프로브가 no-op을 보이면 도입을 드롭하고 그 사실을 기록하는 것이 정상 종료다.

**왜 게이트인가**: CHANGELOG 이력상 effort는 도입 → no-op 실측 → 제거 → 재도입 → 2026-07-17 최종 제거를 거친 **다섯 번의 뒤집기** 끝에 지금 0파일이다. 문서만 근거로 여섯 번째를 넣으면 다음 점검이 또 "장식"이라며 뺀다.

---

## ⏪ 사전 조건

- [ ] P03 완료 (10역할 확정 — 어느 역할에 넣을지가 정해져 있어야 함)
- [ ] **OpenGate 개방** — 도입 시 `.claude/agents/**` frontmatter를 편집하므로 봉인 대상이다(영호 단독 실행)
- [ ] 공식 문서 근거 확인 완료: `sub-agents#supported-frontmatter-fields`(필드 등재) + `model-config#set-the-effort-level`(우선순위 = 환경변수 > frontmatter > 세션 > 모델 기본)

---

## 📝 작업 내용

### ⚠️ 판정 기준을 **프로브 전에** 고정한다

측정량·표본·판정선을 사후에 정하면 어떤 결과든 정당화된다 — 이 저장소가 effort를 다섯 번 뒤집은 메커니즘이 정확히 그것이다. 게이트가 게이트 노릇을 하려면 기준이 **먼저** 있어야 한다.

- [ ] **① 측정량** — ⓐ 서브에이전트 세션 헤더의 effort 표기 문자열("with low effort" / "with xhigh effort") ⓑ 해당 스폰의 thinking 토큰 수
- [ ] **② 표본** — 동일 프롬프트·동일 에이전트로 `low` 1회 + `xhigh` 1회 (총 2스폰). 과제는 추론 깊이가 출력에 드러나는 것으로 고정
- [ ] **③ 판정선** — **헤더 표기가 low/xhigh로 갈리고** **동시에** thinking 토큰이 **2배 이상** 차이 → 도입. 둘 중 하나라도 불성립 → **드롭**
- [ ] **④ 무효 조건** — `CLAUDE_CODE_EFFORT_LEVEL` 환경변수가 존재하면 우선순위상 frontmatter를 이기므로 **프로브 자체가 무효**. 실행 전 부재를 확인하고 그 사실을 원장에 기록

### 실행

- [ ] **라이브 A/B 프로브 1회** — 위 ②의 표본대로 실행. 세션 헤더 육안 확인 병행
- [ ] **판정** — ③의 판정선에 대입:
  - 성립 → 도입 진행
  - 불성립(no-op) → **도입 드롭** + CHANGELOG에 반전 항목 기록("문서는 지원한다고 하나 실측 no-op — 재시도 금지 근거")
- [ ] (도입 시) `reviewer`·`plan-auditor`·`chief-tech-operator`에 `effort: xhigh` 적용. 나머지는 기본(`high`) 유지 — 영호 결정
- [ ] **낡은 기록 정정** (도입/드롭 무관하게 수행):
  - `00.Documents/reviews/2026-07-17-harness-review-all.md:92`
  - `00.Documents/reports/next/NEXT-하네스-개선-핸드오프.md:64`
  - **글로벌 메모리 `claude-code-effort-precedence.md`(+`MEMORY.md:18`)** — 매 세션 주입되므로 stale이면 계속 잘못된 방향으로 유도한다
- [ ] 프로브 결과를 `01.Phases/21_HR2-opus5-renewal/04-effort-probe-log.md`에 원장으로 남긴다(다음 점검이 재실측하지 않게)

---

## ✅ 완료 조건

- [ ] **판정 기준 4항(측정량·표본·판정선·무효조건)이 프로브 실행 *전에* 원장에 기록됨** — 사후 정당화 차단
- [ ] `CLAUDE_CODE_EFFORT_LEVEL` 부재 확인 기록 (있으면 프로브 무효)
- [ ] 프로브 실행 기록이 **트랜스크립트에 남아 있음**(자기보고 아님 — 메모리 「수정은 실측으로 검증」)
- [ ] 판정 결과가 원장 파일에 **헤더 표기 문자열 + thinking 토큰 수치**와 함께 기록
- [ ] 도입 시: 대상 3역할 frontmatter에 `effort: xhigh` 존재 + `npm run test` green
- [ ] 드롭 시: CHANGELOG 반전 항목 1줄 + 3역할 frontmatter 무변경
- [ ] 어느 쪽이든 낡은 기록 3곳(reviews·NEXT·글로벌 메모리) 정정 완료

---

## 📚 학습 포인트

- **"문서에 있다"와 "동작한다"는 다르다** — 공식 문서가 필드를 명시해도 특정 실행 경로에서 무시될 수 있다. 이 저장소는 그걸 다섯 번 겪었다.
- **반전을 기록하는 이유** — "시도했고 안 됐다"를 남기지 않으면 6개월 뒤 같은 사람이 같은 시도를 한다. 실패 기록은 성공 기록만큼 값이 있다.
- **게이트형 Phase** — 완료 조건이 "기능이 들어갔다"가 아니라 "판정이 났다"인 Phase. 드롭도 정상 종료다.

---

## ⚠️ 함정

- **프로브 없이 문서만 믿고 넣기** — 이 Phase의 존재 이유가 그것을 막는 것이다.
- **`max` 채택 유혹** — 문서가 *"diminishing returns, prone to overthinking, test before adopting broadly"*로 경고한다. 영호 결정도 `xhigh`다.
- **환경변수에 가려지기** — 우선순위상 `CLAUDE_CODE_EFFORT_LEVEL`이 frontmatter를 이긴다. 프로브 전에 환경변수 부재를 확인해야 결과가 유효하다.
- **글로벌 메모리를 안 고치기** — 저장소만 고치면 다음 세션이 옛 메모리를 주입받아 "effort는 no-op"이라며 되돌린다.

---

## 담당 SubAgent

**메인 직접** (프로브 설계·판정). 프로브 실행 자체는 서브 1회 스폰이 필요하므로 `secretary` 또는 임의 Worker로 동일 과제를 2회 돌린다.
