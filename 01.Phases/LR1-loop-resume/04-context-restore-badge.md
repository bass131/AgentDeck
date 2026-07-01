---
owner: 영호
milestone: LR1
phase: 04
title: UI "맥락 복원됨/요약 복원됨" 배지 — 투명성
status: pending
grade: 보통
risk: ui-visual
loop_track: human-visual
domain: renderer
summary: 복원된 대화가 완전 resume인지(sessionId 있음) transcript 폴백인지(sessionId 없음) 사용자가 인지하도록 대화에 상태 배지 표시. Codex #1 — "맥락 제한됨" 투명성.
---

# Phase 04 — 맥락 복원 상태 배지 (투명성)

> **성격**: 폴백이 조용히 동작하면 사용자는 "완전 기억"과 "부분 요약"을 구분 못 함. 상태를 눈에 보이게. ui-visual = 영호 육안 검증.

## 🎯 목표
복원/진행 중 대화가 어떤 맥락 상태인지 배지로 표시:
- **완전 복원**(sessionId 있음, resume): 표시 없음 또는 은은한 "이어짐".
- **요약 복원**(sessionId 없음 → transcript 폴백): "이전 맥락 요약 복원됨" 배지 — 완전 resume이 아님을 투명하게.

## ⏪ 사전 조건
- Phase 02(폴백) 구현 — 배지가 반영할 상태(폴백 발동 여부)가 있어야.
- 폴백 발동 여부를 renderer가 알 수 있는 신호 필요(AgentEvent 또는 대화 메타의 sessionId 유무로 파생 — 새 IPC 최소화).

## 📝 작업 내용
1. 대화 상태 파생: `conversationId`의 sessionId 유무(또는 폴백 발동 이벤트)로 "resume/fallback/new" 상태 계산(renderer store 셀렉터).
2. 배지 컴포넌트: 대화 헤더 또는 첫 메시지 위에 은은한 배지(UI.md 안티슬롭 준수 — 과한 경고색 금지, 정보 톤).
3. 다크/라이트 테마 정합.

## ✅ 완료 조건 (정량)
- sessionId 없는 대화 로드 시 배지 노출 / 있는 대화엔 미노출(또는 은은).
- typecheck·test green·lint 0.
- **영호 육안 검증**(human-visual): 실앱에서 배지 위치·톤·다크라이트 확인. 무인 commit X — 영호 GO 후.

## 📚 학습 포인트
- 조용한 폴백의 UX 위험(사용자가 신뢰를 오해) → 투명성 설계.
- 파생 상태(셀렉터)로 새 IPC 없이 UI 상태 만들기.

## ⚠️ 함정
- 배지가 과하면(빨간 경고) 정상 사용을 불안하게 만듦 → 정보 톤(UI.md).
- 완전 resume 대화에까지 배지 뜨면 노이즈 → 조건 엄밀히.
- ui-visual — 기능 배선은 자율, **육안·commit은 영호 게이트**.

## 담당 SubAgent
renderer (`02.Source/renderer/**`). 육안 = 영호.
