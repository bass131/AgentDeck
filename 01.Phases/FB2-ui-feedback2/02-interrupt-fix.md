---
owner: 영호
milestone: FB2
phase: 02
title: 인터럽트 수정 — 진단된 끊긴 링크 복구
status: done
grade: 보통
risk: backend-contract
loop_track: auto-gate
estimated: 1.5h
domain: agent-backend
summary: P01이 특정한 끊긴 지점을 수정 — 중단 버튼 2종이 실제 SDK 중단까지 이어지게
---

# Phase 02: 인터럽트 수정 — 진단된 끊긴 링크 복구

## 🎯 목표

P01 진단 결과의 끊긴 링크를 복구해 goal GUI 중단 버튼·채팅 인터럽트 버튼 모두 실제 중단(스트리밍 중단 + loop/goal 예약 취소)으로 이어진다.

## ⏪ 사전 조건
- [ ] Phase 01 완료(원인 보고 + 실패 테스트/재현 절차).

## 📝 작업 내용
- [ ] P01 실패 테스트를 green으로 만드는 최소 수정.
- [ ] BF1 시절 인터럽트 테스트 전체 green 유지(회귀 방지).
- [ ] 수정이 main-process 영역(IPC 핸들러)에 걸치면 해당 부분은 main-process Worker 별도 위임을 보고(도메인 경계).
- [ ] loop(ScheduleWakeup 대기)·스트리밍 두 상태 모두 중단 확인 테스트.

## ✅ 완료 조건
- [x] P01 실패 테스트 green
- [x] 기존 인터럽트 테스트 무삭제 green
- [x] typecheck·test·lint 0
- [x] reviewer(backend-contract) CRITICAL 0

## 📚 학습 포인트
- 인터럽트 시그널 전파(AbortController/SDK interrupt)와 세션 키 정합.

## ⚠️ 함정
- raw 엔진 출력·시크릿 노출 방향 수정 금지.
- 증상만 가리는 UI-side 수정(버튼 비활성화 등) 금지 — 근본 링크 복구.

## 담당 SubAgent
agent-backend
