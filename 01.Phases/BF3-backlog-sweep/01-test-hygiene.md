---
owner: 영호
milestone: BF3
phase: 01
title: 테스트 위생 — LT6 드레인 패턴 + bf1 단언 진단력
status: done
grade: 보통
loop_track: auto-gate
estimated: 1~2h
domain: qa
summary: 이벤트를 못 잡는 LT6 드레인 패턴을 실효 검증으로 재작성 + bf1 단언의 진단 해상도 강화 (테스트 파일만, 앱 코드 0줄)
---

# Phase 01: 테스트 위생 — LT6 드레인 패턴 + bf1 단언 진단력

> **상태**: pending / **마일스톤**: BF3 / **등급**: 보통 / **담당**: qa

## 🎯 목표

잠복 결함이 기록된 테스트 2건을 실효 검증으로 복구한다. LT6은 "지금 무해하지만 미래에 함정"인 무단언 드레인, bf1은 "실패해도 원인을 못 좁히는" 저해상도 단언 — 이번 마일스톤이 건드릴 정지·interrupt 경로의 안전망을 먼저 조인다.

## ⏪ 사전 조건

- [x] 없음 (마일스톤 첫 Phase — 환경 검증 겸. 테스트만 건드려 가장 작게 시작)

## 📝 작업 내용

- [ ] `99.Others/tests/agents/loop-tracking.test.ts` LT6(:525~): "break 후 재순회" 드레인 패턴 수리 — 단일 상태형 제너레이터는 `break`가 `.return()`을 유발해 이후 이벤트를 못 잡는다(LR3-P04 Worker 발견). 이벤트를 실제 수집하는 형태(break 없이 조건 수집, 또는 수집 배열에 tee)로 재작성.
- [ ] LT6에 post-abort loops clear **실단언 추가** — BF2-mini가 abort 이벤트 드롭을 근본수리했으므로(agent-runs.ts done-후 loops 화이트리스트) 이제 abort 후 `loops:[]` 정리 이벤트가 실제로 흐른다. 무단언이던 구간을 진짜 검증으로 승격.
- [ ] `99.Others/tests/agents/bf1-interrupt-error-mislabel.test.ts`: 단언 진단력 강화 (LR3-P02 reviewer 🟡-3) — 실패 시 "무엇이 어긋났나"가 메시지로 드러나게 (이벤트 시퀀스 스냅샷 비교, 커스텀 실패 메시지 등).

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 errors
- [ ] `npm run test` green (LT6·bf1 파일 전체 PASS + 전체 스위트 회귀 0)
- [ ] `npm run lint` 0 problems
- [ ] LT6 드레인이 이벤트를 최소 1건 이상 실수집함을 단언으로 증명 (무단언 구간 0)
- [ ] 앱 코드(`02.Source/**`) diff 0줄

## 📚 학습 포인트

- **제너레이터 `break` 시맨틱**: `for await...of`를 `break`로 빠져나가면 JS가 제너레이터의 `.return()`을 호출해 스트림이 닫힌다 — "나중에 다시 순회"가 불가능해지는 이유.
- **무단언 테스트의 함정**: 통과하는 테스트 ≠ 검증하는 테스트. 단언 없는 코드는 "실행됐다"만 보장한다.

## ⚠️ 함정

- qa Worker는 앱 코드 R only — 드레인 수리 중 앱 코드를 고치고 싶어지면 보고 후 중단(범위 밖).
- LT6 재작성이 기존 LT1~LT5 픽스처를 건드려 연쇄 실패시키지 않게 — 파일 내 공용 헬퍼 변경 시 전 케이스 재확인.

## 담당 SubAgent

qa Worker 1개. 테스트 파일만 = reviewer 스킵 대상(review-tiering).
