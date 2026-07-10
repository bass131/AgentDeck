---
owner: youngho
milestone: H1
phase: 03
title: 입력 명확성 semantic gate
status: done
grade: 보통
risk: harness
loop_track: auto-gate
estimated: 1~3h
domain: cross
depends_on: [01]
human_gate: false
---

# Phase 03: 입력 명확성 semantic gate

## 🎯 목표

요청이 빈약하거나 모호할 때 길이 기준으로 막지 않고, 저장소 실측으로 해소할지 사용자 결정이 필요한지 구분하도록 매 prompt에 짧은 판단 규칙을 주입한다.

## ⏪ 사전 조건

- [x] Phase 01 Hook 계약 테스트가 있다.

## 📝 작업 내용

- [x] AGENTS.md에 충분/실측 가능/사용자 결정 3분기 규칙을 추가한다.
- [x] `UserPromptSubmit`이 prompt 존재를 확인하고 semantic reminder를 주입한다.
- [x] prompt 원문은 stdout, stderr, runtime state에 기록하지 않는다.
- [x] 모호함만으로 hard block하지 않는다.

## ✅ 완료 조건

- [x] prompt launcher test가 `<input-clarity>` context를 확인한다.
- [x] reminder에 원문 prompt가 포함되지 않는다.
- [x] 기존 work-pin 주입 테스트가 유지된다.

## 📚 학습 포인트

- 의미 판단은 모델이 하고 Hook은 판단 기준만 상기시키는 편이 오탐이 적다.

## ⚠️ 함정

- 글자 수·필드 수로 질문 여부를 결정하면 짧지만 충분한 요청을 잘못 막는다.

## 담당 SubAgent

사용자 승인 Harness 변경 예외로 루트 직접.
