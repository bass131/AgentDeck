---
owner: 영호
milestone: FB1
phase: 01
title: 스트리밍/완료 렌더 정합 — 폰트·줄바꿈 파이프라인 단일화
status: done
grade: 보통
risk: ui-visual
loop_track: auto-gate
estimated: 1.5h
domain: renderer
summary: 출력 도중과 완료 후의 assistant 말풍선 폰트·비율·줄바꿈 의미론이 달라지는 문제 — 같은 렌더 파이프라인으로 통일
---

# Phase 01: 스트리밍/완료 렌더 정합

> 근거 스크린샷: `UC1-ultracode-redesign/Screenshot/클로드_출력_도중_폰트.png` · `클로드_출력_완료_이후_바뀌는_폰트_및_비율.png`

## 🎯 목표

출력 도중(스트리밍)과 완료 후의 assistant 말풍선이 **같은 폰트·같은 줄바꿈 의미론**으로 보인다. 실측 증상: 도중엔 세리프풍+개행 보존(한 줄에 숫자 10개), 완료 후엔 산세리프+마크다운 문단 병합 — 텍스트가 "완료 순간 점프"한다.

## ⏪ 사전 조건
- [ ] 없음 (독립)

## 📝 작업 내용
- [ ] 원인 실증: `MessageBubble`(streaming=true → SmoothMarkdown 전환)과 완료 렌더(react-markdown) 경로의 폰트/white-space 차이를 파일:라인으로 특정.
- [ ] 두 경로의 렌더 결과가 동일해지도록 통일 — 방향은 "스트리밍도 마크다운 파이프라인과 동일 스타일"(폰트 토큰·문단 규칙). 스트리밍 성능 특성(SmoothMarkdown의 목적)은 보존.
- [ ] 단위 테스트: 같은 텍스트가 streaming=true/false에서 같은 폰트 클래스·같은 블록 구조로 렌더됨을 단언.

## ✅ 완료 조건
- [x] 정합 테스트 green / typecheck 0 / test 전체 green / lint 0
- [ ] reviewer CRITICAL 0 / 영호 육안(완료 순간 점프 소멸) — 버킷 b

## ⚠️ 함정
- 마크다운 파싱을 스트리밍 매 청크마다 돌리면 성능 저하 — SmoothMarkdown의 기존 최적화 의도 파악 먼저.

## 담당 SubAgent
renderer
