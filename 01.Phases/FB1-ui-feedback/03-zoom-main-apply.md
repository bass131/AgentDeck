---
owner: 영호
milestone: FB1
phase: 03
title: 전역 줌 main 적용·영속 — webContents.zoomFactor + settings JSON
status: pending
grade: 보통
risk: trust-boundary
loop_track: auto-gate
estimated: 1h
domain: main-process
summary: zoom IPC 핸들러 — 범위 클램프 후 webContents.setZoomFactor + JSON 영속 + 부팅 시 복원
---

# Phase 03: 전역 줌 main 적용·영속

## 🎯 목표

P02 계약의 핸들러가 main에 구현된다: 요청 factor를 **범위 클램프(untrusted 입력 정규화)** 후 `webContents.setZoomFactor` 적용, settings JSON에 영속, 앱 부팅 시 저장값 복원.

## ⏪ 사전 조건
- [ ] Phase 02 완료 (계약 존재)

## 📝 작업 내용
- [ ] `00_ipc/handlers/`에 zoom 핸들러 — 계약 범위 상수로 클램프(NaN/음수/범위 밖 방어), 적용 + `05_settings` JSON 영속(기존 설정 영속 관례 재사용, 스키마 additive).
- [ ] BrowserWindow 생성/ready 시 저장 zoomFactor 복원.
- [ ] 단위 테스트: 클램프 경계(0.49→0.5, 2.1→2.0, NaN→기존값 유지)·영속 라운드트립·복원.

## ✅ 완료 조건
- [ ] typecheck 0 / test green / lint 0 / reviewer(trust-boundary) CRITICAL 0 — 정규화 우회 0

## ⚠️ 함정
- 멀티 윈도우면 전 윈도우 일괄 적용 여부 확인(현 단일 윈도우면 해당 없음 — 보고만).
- JSON 영속 스키마 확장은 additive(마이그 0) — 기존 필드 불변.

## 담당 SubAgent
main-process
