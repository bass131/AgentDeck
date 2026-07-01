---
owner: 영호
milestone: LR3
phase: 04
title: ScheduleWakeup 트래킹 — self-paced 루프 GUI 가시화
status: pending
grade: 복잡
risk: backend-contract
loop_track: auto-gate
estimated: 2~4h
domain: agent-backend
summary: interval 없는 /loop·자율 wakeup은 ScheduleWakeup으로 돌아 CronTracker에 안 잡힘(LR2-03 라이브 실측 — GUI 비가시). progressTrackers에 ScheduleWakeup 감지를 추가해 기존 loops 이벤트(LoopInfo)로 정규화 → "Claude가 루프를 도는 순간 배너가 뜬다" 완성. shared 타입 무변경.
---

# Phase 04: ScheduleWakeup 트래킹

> **상태**: pending
> **마일스톤**: LR3
> **등급**: 복잡 (기본 보통 + backend-contract 깃발 상향 — `01_agents/**`)
> **담당**: agent-backend Worker

---

## 🎯 목표

Claude가 어떤 방식으로 루프를 돌든(크론 CronCreate / self-paced ScheduleWakeup) 통합
배너에 보인다. 스킬로 시작했든 자연어로 시작했든 **도구 사용 자체가 GUI 트리거** —
영호의 "클로드가 loop 진행 시 GUI를 띄우는" 그림의 기술적 완성.

## ⏪ 사전 조건

- [ ] Phase 01-(c) 완료 — 자연어/무interval 요청 시 SDK 도구 선택 실측(감지 대상 확정).
- [ ] ScheduleWakeup tool_call/tool_result의 실 페이로드 형상 실측(P01에서 캡처 or 본
      Phase 서두 mock 대조).

## 📝 작업 내용

- [ ] `progressTrackers.ts` CronTracker(또는 병렬 트래커)에 ScheduleWakeup 감지 추가:
      tool_call 시 pending 등록 → tool_result에서 wakeup 예약 확정 파싱 → `LoopInfo`
      {id, summary, interval}로 정규화해 `loops` 이벤트 emit. **shared 타입 무변경**
      (기존 LoopInfo 재사용 — interval에 "self-paced ~N분" 류 사람표기).
- [ ] 수명 처리: wakeup은 크론과 달리 **1회성 예약의 연쇄** — 다음 wakeup 예약이 없으면
      루프 종료로 판정(done 시 pending 없으면 loops에서 제거). 상태 머신을 실측 형상에 맞춤.
- [ ] 정리 경로 정합: 기존 `abortCleanup`/`persistentPumpCleanup`의 loops:[] 로직이
      wakeup 루프도 포함하는지 확인(hasActivity 판정 확장).
- [ ] 단위 테스트: mock tool_call/result 시퀀스 → loops 이벤트 계약(생성·갱신·종료·abort).
- [ ] ADR-003 격리 확인: 'ScheduleWakeup' 리터럴은 트래커 내부에만 — renderer·shared 누수 0.

## ✅ 완료 조건

- [ ] mock 계약 테스트 green(생성/연쇄 갱신/종료/abort 4경로).
- [ ] 라이브 1회: interval 없는 자연어(또는 `/loop`) 루프 → 배너 표시 → 정지 동작.
- [ ] `npm run typecheck` 0 · `npm run test` green · `npm run lint` 0.
- [ ] **reviewer 무조건**(backend-contract) — 엔진 리터럴 격리·이벤트 계약 무변경 확인.

## 📚 학습 포인트

- **정규화 계층의 힘** — renderer는 LoopInfo만 알면 되므로, 루프의 구현 방식이 늘어나도
  GUI는 무수정. 어댑터 패턴이 갚아주는 순간.
- **1회성 예약의 연쇄를 "루프"로 투영하기** — 상태 머신 설계(pending→active→소멸).

## ⚠️ 함정

- ScheduleWakeup 결과 형상은 SDK 버전 의존 — 파싱 실패 시 graceful [](crash 0, 루프
  미표시)로 방어(CronTracker resolvePending 관례 미러).
- wakeup 연쇄 판정을 못 하면 배너가 안 꺼짐 — 종료 판정(다음 예약 부재) 테스트 필수.
- `02.Source/main/01_agents/**` = backend-contract 깃발 — 인터페이스(AgentBackend.ts)·
  shared는 건드리지 않는다(트래커 내부 확장만).

## 담당 SubAgent

agent-backend Worker. reviewer 무조건. Phase 05와 병렬 가능(파일 겹침 0 — 05는
sdkOptions, 04는 progressTrackers). **P02(AUTO 세션 수명)의 선행** — 본 Phase의
hasActivity 확장이 P02 idle-close의 판정 신호원.
