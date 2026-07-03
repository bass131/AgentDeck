---
owner: 영호
milestone: FB1
phase: 04
title: 전역 줌 renderer 단축키 — Ctrl+= / Ctrl+- / Ctrl+0
status: pending
grade: 보통
loop_track: auto-gate
estimated: 1h
domain: renderer
summary: VSCode 관례 단축키로 zoom IPC 호출 + (선택) 설정 탭 표시 — 시각 문법 신설 없음
---

# Phase 04: 전역 줌 renderer 단축키

## 🎯 목표

Ctrl+`=`(확대)/Ctrl+`-`(축소)/Ctrl+`0`(리셋)이 VSCode처럼 동작한다(P02 계약 경유 → P03이 적용·영속).

## ⏪ 사전 조건
- [ ] Phase 03 완료 (적용 경로 실효)

## 📝 작업 내용
- [ ] 전역 keydown 핸들러(기존 단축키 관례 위치 조사 — 탐색기 ↑↓·Ctrl+F 등 기존 바인딩과 같은 곳에) — Ctrl/Cmd+`=`·`+`·`-`·`0`. 입력 필드 포커스 중에도 동작(VSCode 동일). 기존 단축키와 충돌 전수 확인.
- [ ] step/리셋은 P02 계약 상수 사용(중복 정의 금지).
- [ ] (선택·여유 시) 설정 탭에 현재 줌 % 표시 — 새 시각 문법 필요하면 스킵하고 보고.
- [ ] 단위 테스트: 키 조합 → api 호출 매핑·충돌 케이스.

## ✅ 완료 조건
- [ ] typecheck 0 / test green / lint 0 / reviewer CRITICAL 0
- [ ] 라이브 육안(영호): QHD에서 Ctrl+= 확대 체감 — 버킷 b

## ⚠️ 함정
- 한국어 IME 조합 중 keydown 간섭 주의. Electron 기본 줌 단축키(role 기반)와 이중 발화 여부 확인.

## 담당 SubAgent
renderer
