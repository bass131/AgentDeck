---
owner: 영호
milestone: BF3
phase: 04
title: 인터리빙 배너 오판 수리 — 사용자 턴 끼어들기 시 루프 배너 유지
status: done
grade: 보통
risk: backend-contract
loop_track: auto-gate
estimated: 1~3h
domain: agent-backend
summary: LR3-P04 reviewer 🟡-① — self-paced 루프 진행 중 사용자 턴이 끼어들면 배너가 일시 사라졌다 재예약 시 복구되는 표시 오판을 판정 로직에서 제거
---

# Phase 04: 인터리빙 배너 오판 수리

> **상태**: pending / **마일스톤**: BF3 / **등급**: 보통 (backend-contract 깃발 → reviewer 무조건) / **담당**: agent-backend

## 🎯 목표

self-paced 루프(ScheduleWakeup) 진행 중 사용자 턴이 인터리빙되어도 "loop 진행중" 배너가 사라지지 않는다. 루프 기능은 정상인데 트래커의 턴 경계 판정이 인터리빙 턴을 "루프 소멸"로 오판하는 표시 결함을 수리한다.

> **범위 확정(영호 결정 2026-07-03)**: ①(본 Phase)만. ②(`WAKEUP_LOOP_ID` 싱글턴 슬롯 — 동시 다중 self-paced 루프 미지원)는 코드 주석에 문서화된 의도적 트레이드오프로 **유지**. 다중 슬롯화는 범위 밖 — 손대지 말 것.

## ⏪ 사전 조건

- [ ] Phase 01 완료 (LT6 드레인 실효화 — 루프 이벤트 검증 안전망)
- [ ] Phase 02·03과 파일 겹침 없음(진입은 `progressTrackers.ts` 중심)이나 같은 Worker 영역이라 순차 배치

## 📝 작업 내용

- [ ] **원인 실측 선행**: `02.Source/main/01_agents/progressTrackers.ts`(CronTracker `_activeLoops`·`onTurnEnd()` 연쇄 종료 판정)에서 인터리빙 턴이 wakeup 슬롯을 조기 소거하는 경로 확정 — 추측 수리 금지, 재현 테스트(RED)로 고정.
- [ ] 판정 수리: 사용자 턴(origin='user')의 done은 wakeup 루프 소멸 근거가 아님 — armed wakeup이 살아있는 한 `onTurnEnd()`가 슬롯을 보존하게. LR3-P04의 "loops 전체 스냅샷 계약(클로버링 차단)" 유지.
- [ ] `eventNormalizer` 배선 영향 확인 — `hasLoopActivity()`가 인터리빙 턴에서도 true 유지되는지 (Phase 03의 idle-close 판정 신호원이기도 함 — 인터리빙 중 세션 조기 강등 연쇄버그 여부 교차확인).
- [ ] 라이브 probe 1회(옵트인): 루프 가동 → 사용자 메시지 인터리빙 → 배너 연속 표시 확인 (LR3-P06 사인오프 관찰항목이었던 self-heal 의존 제거 증명).

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 / `npm run test` green / `npm run lint` 0
- [ ] 인터리빙 재현 테스트 RED→GREEN 실측
- [ ] 기존 LR3-P04 테스트 26건(mock 계약 21 + 파이프라인 통합 5) 회귀 0
- [ ] `WAKEUP_LOOP_ID` 싱글턴 구조 diff 0 (범위 밖 보존 확인)

## 📚 학습 포인트

- **상태 추적기의 판정 시점 문제**: 이벤트 스트림에서 "이 턴이 누구 턴인가"(origin)를 모르면 정리(cleanup)가 과잉 동작한다 — 인터리빙은 추적기 설계의 고전적 엣지.
- **self-heal에 기대지 않기**: "다음 재예약 때 복구되니까 OK"는 관찰자에겐 깜빡임 버그다. 자가치유는 완화지 수리가 아니다.

## ⚠️ 함정

- 슬롯 보존을 과잉하면 반대 버그(루프 끝났는데 배너 잔존 — LR2-03 크론 배너 영구 잔존의 재림). 소멸 조건(재예약 없는 wakeup 소비)은 그대로 살아있어야 함.
- `hasLoopActivity()` 판정 강화가 idle-close(Phase 03 영역)와 얽힘 — 인터리빙 중 세션이 조기 종료되지 않는지, 반대로 루프 종료 후 세션이 안 닫히는 좀비가 생기지 않는지 양방향 단언.
- 배너 자체(`LoopStatusBanner.tsx`)는 renderer 영역 — 수리는 main 쪽 판정에 한정, renderer 변경이 필요해지면 보고 후 중단(도메인 경계).

## 담당 SubAgent

agent-backend Worker 1개. reviewer 무조건(backend-contract).
