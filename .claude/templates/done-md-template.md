# -DONE.md 템플릿

> Phase 완료 시 AI가 작성하는 **사실 박제**. 정책 = [`../policies/pin-and-done.md`](../policies/pin-and-done.md) §2.
> 5단계 보고를 *문서 안에* 박아 작성·commit (인라인 출력 폐지 — 비동기 문서, 흐름 안 끊고 자동 진행).
> 작성 위치: `01.Phases/<owner>/M{N}-{slug}/{NN}-{phase-name}-DONE.md`

---

## 템플릿 본문 (아래를 그대로 가져다 채움)

> **복잡 이상 = 5단계 보고 + HTML 시각화 의무** / 대규모 = + 마일스톤 종합 / 단순·보통 = work-pin + commit message만, -DONE.md 박지 않음.
> 아래 5단계 보고 이모지 라벨(🎯🤔🛠🧪➡)은 `phase-gate-validator.sh`가 grep으로 점검 → 유지.

```markdown
---
summary: <1줄. 다음 Phase가 인용할 표준 입력. "무엇을 했고 무엇이 가능해졌는지" 압축>
phase: {NN}-{phase-name}
work-id: phase{NN}-{slug}   # work-pin·commit과 동일 ID. grep으로 산출물 회수.
status: done
grade: 복잡 | 대규모
owner: <본인>
completed_at: {YYYY-MM-DD}
commit: {short hash}
---

# Phase {NN} — {제목} 완료 박제

**소요 시간**: {대략}

## TL;DR
(2~4문장. 무엇을 / 왜 / 결과를 압축. 사실만.)

## 5단계 보고
(아래 5개 이모지 라벨을 그대로 유지하며 채움. 훅이 라벨 존재를 검사함.)

- 🎯 **무엇을 만들었나** —
- 🤔 **왜 필요한가** —
- 🛠️ **어떻게 만들었나** —
- 🧪 **테스트 결과** —
- ➡️ **다음 스텝** —

## AC 검증 결과
(Phase 파일의 완료조건(Acceptance Criteria)을 **실제로 실행한** 명령어와 결과를 박는다. 추측·요약 X. 실패하면 이 Phase는 아직 done이 아님.)

예시:
\`\`\`bash
$ npm run typecheck
  0 errors
$ npm run test
  Test Files  N passed | Tests  M passed
$ npm run lint
  0 problems
\`\`\`

## 결정 흐름 (회고 참고용)
- 갈래/대안 → 채택안 → 이유 (한두 줄씩)

## 막혔던 지점 (있다면)
- 증상 → 원인 → 해결 (각 한두 줄)

## 학습 일지 후보 키워드 (검색용)
- 나중에 펼칠 키워드들 (자율)
```

---

## 작성 원칙

- **사실 박제**, 회고 X. 결정·트레이드오프·테스트·막힘을 정확히.
- **잊히기 전에**. Phase 완료 시 문서로 작성 (인라인 출력 X — 비동기 박제).
- **간결하게**. 회고의 *베이스*이지 회고 자체가 아님.
- **검색 가능하게**. work-id로 grep 한 방에 산출물 회수.
- **AC 검증은 실제 실행**. typecheck/test/lint 출력을 그대로 박음 (done 판사 = CI).
