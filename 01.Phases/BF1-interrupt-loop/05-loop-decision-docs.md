---
owner: 영호
milestone: BF1-interrupt-loop
phase: 05
title: Loop 결정 문서화(ADR/REPL_TRANSITION) + 구현 재분해 트리거
status: pending
grade: 복잡
risk: irreversible
loop_track: human-gate
estimated: 1~3h
domain: cross
summary: P04 결정을 ADR(022/024 개정 또는 신규) + REPL_TRANSITION.md 정합 초안으로 박제(영호 승인), loop 기능+GUI 구현은 별 마일스톤 /work-plan 트리거
---

# Phase 05: Loop 결정 문서화 + 구현 재분해 트리거

> **상태**: pending
> **마일스톤**: BF1-interrupt-loop
> **등급**: 복잡 (ADR 박제 = 비가역 + docs = 영호 단독)
> **담당**: AI 초안 제시 + **영호 승인·박제**(human-gate)

---

## 🎯 목표

이 Phase가 끝나면: P04에서 확정한 loop 동작 기준이 **ADR + 설계 문서에 정합되게 박제**되어 문서/코드 괴리가 닫히고, 그 결정에 따른 **실제 기능+GUI 구현은 별도 마일스톤으로 분해 착수**(이 마일스톤 범위 밖)된다. 이로써 BF1 트랙은 "Interrupt 수정 완료 + Loop 동작 기준 확정·문서화"로 닫힌다.

---

## ⏪ 사전 조건

- [ ] Phase 04 완료 — loop 동작 기준 영호 결정 확정 + 영향 파일 목록

---

## 📝 작업 내용

- [ ] **ADR 정합 초안 작성** (AI 초안 → 영호 승인):
  - P04 결정에 따라 ADR-022(앱 레벨 /loop)·ADR-024(REPL self-re-arm) 중 무엇을 개정/유지/superseded 처리할지
  - 결정이 기존 ADR을 뒤집으면(예: 옵션 B로 앱 타이머 제거) → 신규 ADR 또는 기존 개정 + superseded 표기
  - **헌법 CRITICAL: ADR 변경은 영호 단독 통제** — AI는 초안만, 박제는 영호
- [ ] **REPL_TRANSITION.md 정합 초안** — §9/§10의 "보류" vs 코드 빌드 상태 괴리를 결정에 맞춰 정정 (현황을 진실원으로):
  - 어느 결론이 최종인지 명확화 (충돌하는 두 결론 중 택)
  - 구현 현황(1~4a 빌드)과 문서 서술 일치
- [ ] **CHANGELOG 항목** — 결정의 위험도([M] 또는 [H]) + 한 줄 (영호 박제).
- [ ] **후속 구현 마일스톤 트리거** — 결정된 기준의 기능+GUI 구현을 `/work-plan`으로 재분해 (예: `BF2-loop-impl` 또는 결정 내용에 맞는 slug). 영향 파일 목록(P04)이 입력.
- [ ] **work-pin·BF1 종결 정합** — BF1 5 Phase status 갱신, work-pin을 후속 마일스톤(또는 미정) 좌표로.

---

## ✅ 완료 조건

- [ ] **ADR/REPL_TRANSITION 정합 초안 영호 승인·박제** — 문서/코드 괴리 닫힘.
- [ ] **CHANGELOG 항목 추가** (결정 박제).
- [ ] **후속 구현 마일스톤 분해 착수 결정** — `/work-plan`으로 다음 단계 시드(또는 영호가 "나중에"로 보류 결정).
- [ ] `npm run typecheck`/`test` 회귀 0 (코드 무변경 — 문서만).

> **-DONE.md 면제 근거** (grade-and-risk §2상 복잡=`-DONE.md`+HTML 의무): 산출물 자체가 *ADR 초안 + REPL_TRANSITION 정합 + CHANGELOG 항목*이라 영구 박제 문서가 곧 보고를 갈음 — -DONE.md 중복. 결정의 5단계 보고(🎯/🤔/🛠️/🧪/➡️)는 ADR 본문 구조가 흡수.

---

## 📚 학습 포인트

- **결정을 박제하는 이유** — 정한 걸 ADR/문서에 안 남기면 다음 세션·다음 사람이 또 모호해진다. 결정의 *기록*이 모호성 재발을 막는다.
- **왜 docs·ADR은 사람 게이트** — 결정 박제는 프로젝트의 헌법적 기억. AI가 임의로 바꾸면 방향이 조용히 표류. 그래서 영호 단독.
- **마일스톤 경계 긋기** — "결정까지"와 "구현"을 한 마일스톤에 안 욱여넣고 가른 이유: 결정 전엔 구현이 측정 불가. 경계가 곧 정직함.

---

## ⚠️ 함정

- **AI가 ADR 박제 금지** — 초안 제시까지. 박제·확정은 영호 (헌법 CRITICAL: ADR·docs 영호 단독).
- **결정과 다른 문서 작성** — P04 결정을 충실히 반영. AI 선호로 비틀지 말 것.
- **구현을 여기서 시작하는 함정** — 이 Phase는 문서·트리거까지. 기능·GUI 코드는 후속 마일스톤.
- **superseded 처리 누락** — 기존 ADR을 뒤집으면 옛 ADR에 superseded 표기 필수(역사기록은 불변·정정은 표기로).

---

## 담당 SubAgent

AI 초안(cross — `00.Documents/ADR.md`·`REPL_TRANSITION.md`·`.claude/CHANGELOG.md`) + 영호 승인·박제. 후속 분해는 `/work-plan` Skill.
