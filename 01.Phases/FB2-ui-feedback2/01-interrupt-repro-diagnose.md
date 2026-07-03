---
owner: 영호
milestone: FB2
phase: 01
title: 인터럽트 미동작 repro·진단 — 중단 버튼이 실제로 멈추지 않는 원인 특정
status: pending
grade: 보통
loop_track: auto-gate
estimated: 1.5h
domain: agent-backend
summary: goal GUI 중단 버튼·채팅창 인터럽트 버튼을 눌러도 에이전트가 계속 도는 버그 — 클릭→IPC→backend.interrupt() 전 구간에서 끊긴 지점을 실증으로 특정
---

# Phase 01: 인터럽트 미동작 repro·진단

> 근거: 영호 실사용(2026-07-04) — "goal GUI의 중단 버튼 or 채팅창의 인터럽트 버튼 눌러도 중단이 안 되네."

## 🎯 목표

중단 버튼 클릭이 실제 중단으로 이어지지 않는 **끊긴 지점을 파일:라인으로 특정**하고, 그 지점을 재현하는 실패 테스트(또는 결정적 재현 절차)를 남긴다. 수정은 P02 몫 — 이 Phase는 진단만.

## ⏪ 사전 조건
- [ ] 없음 (독립)

## 📝 작업 내용
- [ ] 경로 전수 추적: ① goal GUI 중단 버튼 / ② 채팅창 인터럽트 버튼 각각의 클릭 핸들러 → IPC 채널 → main 핸들러 → `AgentBackend.interrupt()`(또는 상응 메서드) → SDK `query` 중단까지 어느 링크가 실제로 호출되는지/안 되는지 로그·테스트로 실증.
- [ ] 이력 대조: BF1-interrupt-loop 마일스톤(`01.Phases/BF1-interrupt-loop/` — repro→failing test→fix 이력)에서 고친 인터럽트와 이번 증상의 차이 — 회귀인지(그때 테스트가 지금도 green인지 확인) 신규 경로 미배선인지(예: REPL held-open 세션·loop/goal 모드에서 interrupt 대상 세션 key 불일치) 판별.
- [ ] 두 버튼(①②)이 같은 원인인지 다른 원인인지 명시.
- [ ] 실패 테스트 작성(가능한 경우) 또는 결정적 재현 절차 문서화 — P02 입력.

## ✅ 완료 조건
- [ ] 원인 보고(파일:라인 + ①② 각각) / 기존 테스트 스위트 green 유지(진단 중 코드 변경 0)
- [ ] 실패 테스트 또는 재현 절차가 P02가 바로 착수 가능한 수준

## 📚 학습 포인트
- 이벤트 경로 추적법: UI 클릭 → preload → IPC → main → backend → SDK의 각 링크를 독립 검증하는 분할 정복.
- 회귀 vs 미배선: "고쳤던 버그가 다시"와 "새 코드 경로가 옛 수정을 우회"는 다른 병이고 처방도 다름.

## ⚠️ 함정
- 라이브 앱 조작으로만 재현하려 들지 말 것 — 코드 추적 + 단위/통합 테스트로 재현 가능한 지점을 먼저 찾고, 라이브는 최종 확인용(메인 게이트).
- loop/goal 진행 중 인터럽트는 일반 응답 중 인터럽트와 세션 상태가 다를 수 있음(ScheduleWakeup 대기 중 vs 스트리밍 중) — 두 상태 모두 점검.

## 담당 SubAgent
agent-backend
