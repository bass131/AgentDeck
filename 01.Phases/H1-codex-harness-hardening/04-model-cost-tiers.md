---
owner: youngho
milestone: H1
phase: 04
title: Sol Terra Luna 모델 비용 계층
status: done
grade: 복잡
risk: harness
loop_track: human-gate
estimated: 2~5h
domain: cross
depends_on: [01]
human_gate: live-model-label
---

# Phase 04: Sol Terra Luna 모델 비용 계층

## 🎯 목표

복잡한 판단에는 Sol, 일반 구현에는 Terra, 명확한 운영에는 Luna를 기본 배치해 모든 SubAgent를 Sol로 실행하는 비용을 줄인다.

## ⏪ 사전 조건

- [x] 공식 Codex 문서에서 정확한 model slug와 reasoning effort를 확인했다.
- [x] Phase 01 doctor가 custom agent profile을 검사한다.

## 📝 작업 내용

- [x] coordinator/reviewer/plan-auditor를 `gpt-5.6-sol`, high로 둔다.
- [x] main-process/agent-backend/renderer/shared-ipc/qa를 `gpt-5.6-terra`로 둔다.
- [x] secretary를 `gpt-5.6-luna`, low로 둔다.
- [x] 고위험 구현은 parent가 Sol로 상향할 수 있음을 엔진 중립 에스컬레이션 문서에 남긴다.
- [x] 새 세션 live checklist에 실제 model label 확인을 넣는다.

## ✅ 완료 조건

- [x] 9개 TOML의 model/reasoning mapping 정적 검사가 green이다.
- [x] 역할별 비용 선택 이유와 상향 조건이 문서에 있다.
- [x] 현재 호스트에서 미검증이면 doctor가 PASS로 위장하지 않는다.
- [x] 실제 model label은 현 host에서 관측할 수 없음을 확인하고 degraded mode로 수용한다.

## 📚 학습 포인트

- 모델 선택은 역할 이름이 아니라 모호성·판단 비용·반복성에 맞춘다.

## ⚠️ 함정

- TOML에 model이 있어도 호스트 spawn 경로가 custom profile을 거치지 않으면 실제 적용되지 않을 수 있다.

## 담당 SubAgent

사용자 승인 Harness 변경 예외로 루트 직접.
