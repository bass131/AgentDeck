---
owner: 영호
milestone: FB1
phase: 03
title: 전역 줌 main 적용·영속 — webContents.zoomFactor + settings JSON
status: done
grade: 보통
risk: trust-boundary
loop_track: auto-gate
estimated: 0.5h
domain: main-process
summary: 부팅 시 ui-prefs 저장 zoomFactor 복원(클램프 방어) — dev/prod 일관 영속. zoom set IPC 핸들러 신설 없음(적용=native role, 저장=기존 UI_PREFS_SET)
---

# Phase 03: 전역 줌 main 적용·영속

## 🎯 목표

부팅 시 ui-prefs(ui-prefs.json)의 저장 zoomFactor를 읽어 **범위 클램프(untrusted 입력 정규화)** 후 복원한다 — dev/prod 일관 영속의 핵심. zoom set IPC 핸들러는 만들지 않는다(적용은 native role, 저장은 기존 `UI_PREFS_SET` 핸들러가 이미 처리).

## ⏪ 사전 조건
- [ ] Phase 02 완료 (계약 존재)

## 📝 작업 내용
- [ ] BrowserWindow 생성/ready 시 ui-prefs(`prefs.ts`, ui-prefs.json)의 zoomFactor를 읽어 범위 클램프(0.5~2.0, NaN/음수/범위 밖 방어) 후 `webContents.setZoomFactor` 복원.
- [ ] 단위 테스트: 클램프 경계(0.49→0.5, 2.1→2.0, NaN→복원 스킵)·저장값 없음 시 no-op.

## ✅ 완료 조건
- [x] typecheck 0 / test green / lint 0 / reviewer(trust-boundary) CRITICAL 0 — 정규화 우회 0

## ⚠️ 함정
- Chromium HostZoomMap 우발 영속과 앱 영속이 이중으로 복원될 수 있음 — 부팅 복원이 항상 마지막에 이겨야 함(적용 시점 주의) (검증은 P04 육안(버킷 b)에서 수용 — restore-wins e2e는 선택).
- 멀티 윈도우면 전 윈도우 일괄 적용 여부 확인(현 단일 윈도우면 해당 없음 — 보고만).
- JSON 영속 스키마 확장은 additive(마이그 0) — 기존 필드 불변.

## 담당 SubAgent
main-process
