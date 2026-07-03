---
owner: 영호
milestone: FB2
phase: 06
title: Composer /xxx 슬래시 토큰 하이라이트
status: done
grade: 보통
risk: ui-visual
loop_track: auto-gate
estimated: 1h
domain: renderer
summary: 입력창의 /xxx 토큰을 울트라코드 키워드 하이라이트와 같은 메커니즘으로 색상 강조 — 오탐(경로·URL) 방지 규칙 포함
---

# Phase 06: Composer /xxx 슬래시 토큰 하이라이트

## 🎯 목표

입력창의 슬래시 커맨드 토큰(`/work-run` 등)이 울트라코드 키워드처럼 색상 하이라이트된다.

## ⏪ 사전 조건
- [ ] 없음 (독립). ⚠️ P08(배너 카드)과 같은 Composer 인근 편집 — **병렬 금지, 순차 또는 동일 Worker**(plan-auditor 🟡).

## 📝 작업 내용
- [ ] UC1 composer keyword highlight 구현 조사 → 같은 메커니즘 확장.
- [ ] 토큰 규칙: 행 시작 또는 공백 뒤 `/`로 시작하는 토큰만(파일 경로 `/c/Dev/...`·URL 오탐 금지 — 규칙을 테스트로 고정).
- [ ] 색은 기존 토큰만(울트라코드 색과 구분 필요 시 기존 팔레트 내에서).
- [ ] 단위 테스트: 토큰화 경계(행 시작·공백 뒤·문장 중 경로·URL·연속 슬래시).

## ✅ 완료 조건
- [x] typecheck 0
- [x] test green
- [x] lint 0
- [x] reviewer CRITICAL 0
- [ ] 육안(경미) 영호 병행

## 📚 학습 포인트
- 오탐 없는 토큰 하이라이트 규칙 설계.

## ⚠️ 함정
- 하이라이트가 팔레트 자동열림 로직과 간섭하지 않게(기존 동작 불변).

## 담당 SubAgent
renderer
