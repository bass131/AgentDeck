---
owner: 영호
milestone: FB1
phase: 02
title: 전역 줌 조회 노출 + 범위상수 (read-only)
status: pending
grade: 보통
risk: shared-contract, trust-boundary
loop_track: auto-gate
estimated: 0.5h
domain: shared-ipc
summary: 신규 IPC 채널 0 — 적용=native role · 저장=기존 UI_PREFS_SET 재사용 · preload에 webFrame 기반 read-only 줌 조회 노출 + factor 범위상수
---

# Phase 02: 전역 줌 조회 노출 + 범위상수 (read-only)

> 근거 스크린샷: `UC1-ultracode-redesign/Screenshot/QHD_기준으로_다른 GUI가 상대적으로 작아보여서....png` — QHD에서 UI가 작아 보임, VSCode처럼 Ctrl+=/− 줌 필요.

## 🎯 목표

renderer가 줌 변경을 요청하고 현재 줌을 구독/조회할 수 있는 IPC 계약이 `02.Source/shared`에 additive로 정의되고 preload에 화이트리스트 노출된다.

## ⏪ 사전 조건
- [x] **baseline 스파이크(plan-auditor 🔴)**: 커스텀 메뉴 미설정 상태에서 Electron 기본 View 메뉴 zoom role(Ctrl+=/−/0)이 이미 동작하는지 실증 → "기본 role 제거+커스텀 단일화" vs "기본 role 유지+영속만" 결정. 결과에 따라 P02~P04 크기 재조정.
  - 결과 = 기본 role 동작 + 프로덕션 우발 영속 확인 → 영호 결정 "중간안(기본 role 유지 + 조회/영속만 추가)" (2026-07-04).

## 📝 작업 내용
- [ ] **지속 저장은 신규 채널 아님** — `shared/ipc/personalization.ts`의 기존 `UI_PREFS_SET`(`ui.setPref`)의 `zoomFactor` 키 재사용.
- [ ] 신규 계약은 **read-only 조회만**: preload에 `webFrame.getZoomFactor()` 기반 현재 줌 조회를 화이트리스트 노출(zoom apply/set 채널은 만들지 않음 — 적용은 native role 몫). factor 유효 범위 상수(0.5~2.0)는 클램프 방어용으로 계약에 정의.
- [ ] **per-region 줌 공존 정의(plan-auditor 🟡)**: 전역 page zoom(webContents 전체 배율)과 `renderer/lib/zoom.tsx`의 per-region CSS zoom(채팅·뷰어)은 **곱연산 공존**(전역이 바탕 배율, per-region이 국소 가중) — 저장소는 전역=ui-prefs(zoomFactor)/국소=localStorage로 분리 유지, 배지도 각자 유지. 이 관계를 계약 주석에 명문.
- [ ] 계약 골든 테스트.

## ✅ 완료 조건
- [ ] typecheck 0(양쪽) / 기존 계약 변경 0(additive) / reviewer(shared-contract) CRITICAL 0
- [ ] test green(계약 골든 테스트)

## ⚠️ 함정
- 계약 정의만 — main 적용(P03)·renderer(P04) 침범 금지.
- 줌 영속 스키마(settings JSON 확장)는 P03 몫이나, 계약의 factor 타입·범위는 여기서 고정.

## 담당 SubAgent
shared-ipc
