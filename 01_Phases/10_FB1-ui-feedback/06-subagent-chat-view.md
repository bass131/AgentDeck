---
owner: 영호
milestone: FB1
phase: 06
title: SubAgent 상세 채팅화 — Claude Code식 하위 세션 뷰
status: done
grade: 복잡
risk: ui-visual
loop_track: human-visual
estimated: 2.5h
domain: renderer
summary: SubAgent 상세를 라벨 블록 나열 대신 하위 채팅 세션처럼(user 작업 → 도구 행 → assistant 응답 순 대화 흐름) 재구성
---

# Phase 06: SubAgent 상세 채팅화

> 근거 스크린샷: 동일(SubAgent_상세페이지...png) — "Claude Code처럼 하위 채팅 세션처럼 볼 수 있게" (영호).

## 🎯 목표

SubAgent 상세(모달/풀스크린)가 **대화 흐름**으로 읽힌다: 위임 프롬프트(user 역할) → 도구 사용 행(컴팩트) → 중간/최종 응답(assistant 말풍선) 순. 본 채팅의 시각 문법(말풍선·도구 행)을 재사용해 "하위 세션" 느낌.

## ⏪ 사전 조건
- [ ] Phase 05 완료 (내부 메타 정규화 — 채팅화할 데이터가 깨끗해야 함)

## 📝 작업 내용
- [ ] 현행 조사: `SubAgentFullscreen`(saf-msg--task/agent/thinking 구조)·SubAgent 모달 — 이미 채팅형 요소가 있는지, 스크린샷의 라벨 블록 뷰가 어느 컴포넌트인지 특정.
- [ ] 본 채팅 컴포넌트(MessageBubble·도구 행) 재사용 우선 — 새 시각 문법 발명 최소화. 재사용 불가 지점은 보고.
- [ ] 시간순 스트림 구성: 작업(위임 프롬프트) → 도구 호출/결과(접힘 행) → 응답 텍스트. 긴 도구 결과는 접기.
- [ ] 단위 테스트: 이벤트 시퀀스 → 채팅 아이템 순서/역할 매핑.

## ✅ 완료 조건
- [x] typecheck 0 / test green / lint 0 / reviewer(ui-visual) CRITICAL 0
- [x] **영호 육안 승인(버킷 b)** — 무인 commit 금지

## ⚠️ 함정
- 본 채팅과 시각적으로 완전 동일하면 "지금 어느 세션을 보고 있는지" 혼동 — 헤더/배경 톤으로 하위 세션임을 구분(기존 토큰만).
- 데이터가 이벤트 스트림에 이미 있는 것만 사용 — 새 IPC/영속 추가 금지(필요 시 보고 후 중단).

## 담당 SubAgent
renderer
