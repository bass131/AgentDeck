---
owner: 영호
milestone: FB2
phase: 07
title: SubAgent 상세 모델 표기
status: done
grade: 보통
loop_track: auto-gate
estimated: 1h
domain: renderer
summary: SubAgent 상세 헤더에 어떤 모델로 작업했는지 표기 — P06 육안 피드백(영호 2026-07-04)
---

# Phase 07: SubAgent 상세 모델 표기

## 🎯 목표

SubAgent 상세(풀스크린) 헤더에 해당 서브에이전트가 사용한 모델명이 표기된다.

## ⏪ 사전 조건
- [ ] FB1 P06 커밋 완료(373f365 — SubAgentFullscreen 재구성 후 기준).

## 📝 작업 내용
- [ ] **조사 먼저**: SubAgent 이벤트 스트림(`SubAgentInfo`·subagent 이벤트·어댑터)에 모델 정보가 이미 있는지 파일:라인으로 확정.
- [ ] 있으면: 헤더(saf-head)에 기존 배지/메타 문법으로 표기(신규 색 금지).
- [ ] **없으면: 구현 중단하고 보고** — 어댑터 additive 필드 추가는 backend-contract 승급이라 메인 세션이 agent-backend 위임 여부 판단.
- [ ] 단위 테스트: 모델 있음→표기, 없음→미표기(graceful).

## ✅ 완료 조건
- [x] typecheck 0
- [x] test green
- [x] lint 0
- [ ] (데이터 부재 시) 조사 보고로 완료 인정.

## 📚 학습 포인트
- "데이터가 스트림에 있는 것만 쓴다" 제약이 도메인 경계를 지키는 방식.

## ⚠️ 함정
- 없는 데이터를 renderer에서 추정(하드코딩 'Opus' 등) 금지.

## 담당 SubAgent
renderer
