---
owner: 영호
milestone: LR3
phase: 01
title: 루프·세션 거동 실측 probe (설계 입력 확보)
status: done
grade: 보통
loop_track: auto-gate
estimated: 1~2h
domain: qa
summary: 코드 변경 전 3종 실측 — (a) REPL OFF 단발+resume의 "지속처럼 보임" 경로 확정 (b) REPL ON 루프 생성 후 OFF 토글/새 대화 시 잔존 held-open·크론의 백그라운드 토큰 소모 여부 (c) 자연어 루프 요청 시 SDK 도구 선택(CronCreate vs ScheduleWakeup) 실측.
---

# Phase 01: 루프·세션 거동 실측 probe

> **상태**: pending
> **마일스톤**: LR3
> **등급**: 보통 (읽기·측정 전용 — 앱 코드 변경 0)
> **담당**: qa (메인 세션 직접 가능 — probe 하네스는 opt-in e2e/스크립트)

---

## 🎯 목표

LR3의 세 갈래(AUTO 세션 수명·앱 타이머 폐기·트래킹 확장)가 **추측이 아닌 실측** 위에 서도록,
영호 실측 보고(2026-07-03)의 미확정 지점 3개를 라이브로 확정한다. 특히 (b)가 실재하면
Phase 02에 "잔존 세션 정리"가 필수 편입된다(토큰 누수 — 과금 문제).

## ⏪ 사전 조건

- [x] LR2 마감(971bd20·3717162·27a60b5·61362d6) — resume·sessionKey·통합 배너 기반.
- [ ] 라이브 probe 예산 확인(영호 attended — 3~5회 예상).

## 📝 작업 내용

- [ ] **(a) OFF "지속처럼 보임" 경로 확정**: REPL OFF에서 2턴 대화 → main 로그/agentRun
      페이로드로 단발+`resume` 경로임을 실측(영호 체감 = resume 맥락 복원인지 확인).
      기존 lr1 e2e 재활용 가능하면 재실행으로 갈음.
- [ ] **(b) 잔존 held-open·크론 거동**: REPL ON → `/loop 1m …`으로 크론 생성 → ① OFF 토글
      후 새 메시지 ② "새 대화" 전환, 각각에서 **옛 세션의 크론이 계속 LLM 호출을 만드는지**
      (main 이벤트 로그·usage로 판정). 잔존 시 정리 트리거 후보(토글/전환/앱종료) 기록.
- [ ] **(c) 자연어 루프 도구 선택**: held-open 세션에 "이 작업을 주기적으로 반복해줘" 류
      자연어 3회 → SDK가 CronCreate/ScheduleWakeup/거절 중 무엇을 쓰는지 빈도 기록
      (Phase 04 트래킹 범위·Phase 05 가이드 문구의 실측 근거).
- [ ] **(d) idle-close 무결성·오버헤드 (P02 AUTO 설계 입력)**: held-open 세션을 턴 경계에서
      정상 종료시킨 뒤 후속 턴이 `resume`으로 맥락 온전 복원되는지 + persistent 기동 턴과
      단발 턴의 체감 오버헤드(기동 시간) 비교 — "턴마다 held-open 시작·idle 시 닫기"가
      단발과 동등 비용이라는 전제의 실측.
- [ ] 결과를 `01.Phases/LR3-loop-ux/_probe-findings.md`로 박제(각 항목 GO/NO-GO 판정 포함).

## ✅ 완료 조건

- [ ] (a)(b)(c)(d) 각각 재현 절차 + 관측 로그 + 판정이 `_probe-findings.md`에 기록됨.
- [ ] (b)(d) 판정이 Phase 02(AUTO 세션 수명) 작업 내용·엣지 계약에 반영됨.
- [ ] 앱 코드 diff 0 (probe 하네스·문서만).

## 📚 학습 포인트

- **측정 먼저, 설계 나중** — LR2에서 Phase 전제 3개가 stale로 판명된 교훈의 제도화.
- **세션 스코프 자원(크론)의 수명** — 누가 만들었고 누가 정리 책임을 지는가.

## ⚠️ 함정

- probe 중 만든 크론을 정리하지 않으면 그 자체가 토큰 누수 — 각 probe 끝에 세션 abort.
- 모델 재량 거동(크론 생성 여부)은 1회 관측으로 단정 금지 — 3회 반복 후 빈도로 기록.

## 담당 SubAgent

qa (probe 하네스) — 메인 세션 직접 수행 가능. 앱 코드 변경 없으므로 reviewer 불요.
