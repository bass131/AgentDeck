---
owner: 영호
milestone: BL1
phase: 02-grace-timer-cleanup
title: idle-close 유예 타이머 정리 — setTimeout 단순화 + 테스트 재구성 (LR4-P03 꼬리)
status: done
grade: 복잡 (자동 상향: 보통 + backend-contract)
risk: backend-contract
loop_track: auto-gate
estimated: 2~4h
domain: cross
work-id: bl1-backlog-closeout
completed_at: 2026-07-13
commit: 25b49af
gate_version: 1
report_html: 00.Documents/reports/BL1-P02-유예타이머-정리.html
summary: LR4-P03이 남긴 정리 부채 — idle-close 유예 타이머의 step-splitting 구현을 단일 setTimeout으로 정리하고, 그 존재 사유가 테스트 mock의 중첩 fake-time 진행 아티팩트였음을 실측 확정. mock은 checkpoint 신호만 보내는 GraceProbe 비중첩 barrier 구조로 분리. 외부 동작 완전 불변(유예 3000ms·자율 상한 100·autonomy_status 계약·shared 무변경).
---

# Phase 02 — idle-close 유예 타이머 정리 (LR4-P03 꼬리) 완료 박제

**소요 시간**: 루프 자율 (복잡 · backend-contract 깃발 = reviewer 무조건·모델 상향)

> **전용 보고서**: HTML 발표 자산 = frontmatter `report_html` 참조(`00.Documents/reports/BL1-P02-유예타이머-정리.html`). BL1 마일스톤 종합 보고 시점에 본 Phase 보고를 종합에 편입한다.

## TL;DR

LR4-P03이 남긴 정리 부채를 청소했다. idle-close 유예 타이머의 `step-splitting`(다단계 setTimeout 쪼개기) 구현을 **단일 `setTimeout` + `clearTimeout`** 구조로 정리하고, 그 step-splitting이 존재했던 유일한 이유가 *제품 로직 요구가 아니라 테스트 mock의 중첩 fake-time advance(타이머 콜백 안에서 다시 시간을 진행시키는) 아티팩트*였음을 실측으로 확정했다. mock은 checkpoint 신호만 방출하는 **GraceProbe** 비중첩 barrier 구조로 분리했다. 외부 동작은 완전 불변 — 유예 `IDLE_CLOSE_GRACE_MS=3000` / 자율 턴 상한 `MAX_CONSECUTIVE_AUTONOMOUS_TURNS=100` / `autonomy_status` 신호 타이밍·페이로드 동일, `02.Source/shared` 무변경. 신규/재구성 spec 6/6이 ×10 연속 실행 플레이크 0으로 통과했고, backend-contract 깃발로 reviewer 무조건 호출 → 🟢(🟡 2건 = 비차단, 본 문서로 해소). 커밋 = `25b49af`.

## 5단계 보고

- 🎯 **무엇을 만들었나** — idle-close 유예 타이머를 다단계 step-splitting에서 단일 `setTimeout` 기반으로 정리했다. `IDLE_CLOSE_GRACE_STEP_MS` 상수와 `_armGraceStep`(스텝 쪼개기 재무장 함수)를 제거하고, 유예 진입 = 단일 `setTimeout(3000ms)` / 취소 = `clearTimeout`으로 단순화했다. 테스트 쪽은 얽혀 있던 deferred-promise/중첩 fake-time을 걷어내고, 제품 코드에 신호 지점만 심어 mock이 checkpoint를 관측하는 **GraceProbe** 비중첩 barrier 구조로 재구성했다. `02.Source/main/01_agents/claudeAgentRun.ts` + `99.Others/tests/agents/lr4-p03-idle-grace.test.ts` 2파일 변경.

- 🤔 **왜 필요한가** — LR4-P03에서 유예 타이머를 처음 넣을 때 fake timer 환경의 함정(타이머 콜백 안에서 다시 시간을 advance하면 교착·순서 붕괴)을 피하려고 step-splitting을 도입했다. 그 회피책이 *제품 로직에 눌러앉아* "왜 여러 스텝으로 쪼개져 있지?"라는 구조적 잡음이 됐다. 정리하지 않으면 다음 사람이 그 복잡도를 제품 요구로 오해하고 더 얹는다 — 리팩토링 부채의 전형. 이번에 그 복잡도의 사유가 순수 테스트 아티팩트였음을 실측으로 못 박고, 회피책을 제품이 아니라 테스트 쪽(GraceProbe)에 되돌려 놓았다.

- 🛠️ **어떻게 만들었나** — (1) **실측 선행**: step-splitting을 단순 setTimeout으로 바꾸면 중첩 fake-time 문제가 재발하는지를 먼저 재현. 재발 지점이 제품이 아니라 테스트 mock의 중첩 advance임을 확인. (2) **회피책의 이동**: 제품은 단일 setTimeout으로 두고, 중첩 advance를 피하는 책임을 테스트로 이관 — mock을 "시간을 스스로 진행시키는" 능동형에서 "유예 진입/취소/만료 checkpoint를 신호로만 받는" 수동형 GraceProbe barrier로 재설계. 대안이었던 "step-splitting 유지 + 테스트만 정리"는 제품 복잡도를 남겨 목표(부채 청소)를 못 이루므로 기각. (3) **동작 불변 증명**: 유예 만료 close / 유예 중 result·turn 도착 시 close 취소 / 자율 상한 통지 / autonomy_status 방출 4축을 각각 지키는 기존 spec을 재구성 후에도 green으로 보존. 숫자 상수(3000/100) diff 무변경, `AgentEvent`/`autonomy_status` 계약·`shared` 무변경 = 순수 내부 리팩토링.

- 🧪 **테스트 결과** — 합본 회귀 게이트 3종 green: `npm run typecheck` 0 errors(node+web), `npm run test` 4650 passed / 8 skipped(live probe) · 320 test files, `npm run lint` 0 problems. 재구성 spec 6/6 PASS(RED 재현 → GREEN), 중첩 fake-time 재발 없음을 ×10 연속 실행 플레이크 0으로 확인. reviewer = backend-contract 깃발로 무조건 호출 → 🟢. 🟡 2건 = 둘 다 "주석의 역사 참조 잔여"(제거된 step-splitting을 가리키는 주석 흔적) 성격의 **재량 비차단** — 계약·동작에 영향 없어 본 DONE 문서 기록으로 해소.

- ➡️ **다음 스텝** — P01·P02 완료(커밋 A `0363aec` / B `25b49af`). 진행 좌표는 P04(복원 페이지 데드락 진단, renderer)로 이동 — 1순위 후보 `SmoothMarkdown` rAF 루프(`SmoothMarkdown.tsx:69`). P06·P07은 영호 유지보수 창 필요분(같은 창 1회 묶음 권장). BL1 마일스톤 종합 보고 시점에 본 문서의 HTML 짝을 일괄 생성한다.

## AC 검증 결과

Phase 완료조건을 실제로 실행한 명령과 결과:

```text
$ npm run typecheck
tsc --noEmit (node) → 0 errors · tsc --noEmit (web) → 0 errors

$ npm run test
Test Files  320 passed | 5 skipped (325)
     Tests  4650 passed | 8 skipped (4658)

$ npm run lint
eslint . --ext .ts,.tsx → 0 problems
```

- 동작 불변 3축(유예 3000ms · 상한 100 · autonomy_status) 각각 단정 spec 존재 — 숫자 상수 diff 무변경.
- 단일 타이머 전환 후 중첩 fake-time 재발 미확인 — 관련 spec ×10 연속 실행 플레이크 0.
- reviewer 통과(backend-contract 깃발 무조건 호출) — 🟢, 🟡 2건 비차단.

## 학습 일지 후보 키워드

- 테스트 아티팩트가 제품에 눌러앉는 부채 (회피책은 테스트 쪽에)
- fake timer 중첩 advance 함정과 barrier(비중첩 clock) 설계
- 리팩토링의 정의 = 외부 동작 불변 + 기존 테스트 green으로 *증명*
- backend-contract 깃발 = reviewer 무조건·모델 상향
- 🟡 비차단 리뷰의 DONE 문서 해소(재량 판정 박제)
