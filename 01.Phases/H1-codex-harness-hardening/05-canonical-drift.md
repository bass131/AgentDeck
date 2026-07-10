---
owner: youngho
milestone: H1
phase: 05
title: Claude 정본과 Codex bridge 드리프트 수리
status: done
grade: 복잡
risk: harness
loop_track: auto-gate
estimated: 2~5h
domain: cross
depends_on: [01]
human_gate: false
---

# Phase 05: Claude 정본과 Codex bridge 드리프트 수리

## 🎯 목표

역할 수, 실제 경로, 명령 이름과 세션 의미가 서로 다른 오래된 문구를 현재 9역할 Supervisor 계약에 맞춘다.

## ⏪ 사전 조건

- [x] Phase 01 static drift 검사가 결함을 재현한다.

## 📝 작업 내용

- [x] `02.Source/main/agents/**`를 실제 `01_agents/**`로 고친다.
- [x] 풀 8과 중복 `99.Others` 경로를 9역할 기준으로 고친다.
- [x] `/harness`의 사라진 `work/plan.md` 링크를 `$work-plan` 정본으로 연결한다.
- [x] `$session-review`를 Claude의 학습용 pull session 의미로 복원한다.
- [x] attended 운영과 충돌하는 refactor-sweep 표현을 정리한다.
- [x] Sonnet/Opus 고정 표현을 엔진별 비용 계층과 의미 기반 상향으로 일반화한다.

## ✅ 완료 조건

- [x] stale 문자열 계약 테스트가 0건이다.
- [x] Claude 정본을 Codex 파일로 덮어쓰지 않고 양쪽 의미가 정합하다.

## 📚 학습 포인트

- 호환 레이어는 정본을 복사하는 파일이 아니라 실행 방식만 번역하는 계층이다.

## ⚠️ 함정

- 역사 ADR의 과거 표현은 사실 기록이므로 현재 규칙처럼 오인되는 부분만 개정 표기로 보완한다.

## 담당 SubAgent

사용자 승인 Harness 변경 예외로 루트 직접.
