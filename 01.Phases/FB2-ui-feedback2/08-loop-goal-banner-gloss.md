---
owner: 영호
milestone: FB2
phase: 08
title: loop/goal 배너 카드 + 프레임 gloss 조명
status: in-review (human-visual 게이트 대기)
grade: 복잡
risk: ui-visual
loop_track: human-visual
estimated: 2.5h
domain: renderer
summary: loop/goal 배너를 입력창 바로 위 카드형 상시 표시(상태→주제→현재 작업)로 재배치 + 진행 중 채팅 프레임 gloss를 안쪽으로 스며드는 조명 느낌으로
---

# Phase 08: loop/goal 배너 카드 + 프레임 gloss 조명

## 🎯 목표

① loop/goal 진행 배너가 채팅 입력창 바로 위에 카드 형태로 상시 표시 — 표기 순서: "목표를 향해 자율 반복 중" 류 상태 → 작업 주제 → 현재 작업내용. ② loop/goal 수행 중 채팅 구역 프레임의 gloss가 바깥 테두리 선이 아니라 안쪽으로 스며드는 하이라이트성 조명(inset glow) 느낌.

> 근거 스크린샷 2장: `01.Phases/FB1-ui-feedback/ScreenShot/Goal과 loop GUI배너를....png`·`loop랑 goal 수행시 생기는 채팅구역쪽 프레임 gloss....png` (Worker 필독).

## ⏪ 사전 조건
- [ ] 없음(독립 — FB1 P06 커밋 후라 renderer 충돌 없음).

## 📝 작업 내용
- [ ] 현행 loop/goal 배너 컴포넌트·gloss 스타일 위치 조사(LR3 loop-gui 이력 참조).
- [ ] 배너 → Composer 상단 고정 카드로 재배치(기존 카드·토큰 문법 재사용, 3단 정보 위계).
- [ ] gloss → 기존 강조 토큰 기반 inset box-shadow/gradient(신규 색 금지, 다크·라이트 양 테마).
- [ ] 스트리밍·대기(ScheduleWakeup)·정지 상태별 표시 정합.
- [ ] 단위 테스트: 상태→카드 내용 매핑(주제·현재 작업 소스 필드).

## ✅ 완료 조건
- [x] typecheck 0
- [x] test green
- [x] lint 0
- [x] reviewer(ui-visual) CRITICAL 0
- [ ] **영호 육안 승인(버킷 b) — 무인 commit 금지**.

## 📚 학습 포인트
- 정보 위계(상태/주제/작업) 카드 설계와 inset 조명의 CSS 구현(box-shadow inset vs gradient overlay 트레이드오프).

## ⚠️ 함정
- 배너 상시 표시가 입력창 공간을 과점하면 역효과 — 접힘/최소화 상태 고려(과설계면 보고).
- gloss가 텍스트 가독성 해치면 안 됨.

## 담당 SubAgent
renderer
