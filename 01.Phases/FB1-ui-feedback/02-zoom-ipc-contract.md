---
owner: 영호
milestone: FB1
phase: 02
title: 전역 줌 IPC 계약 — zoom get/set (shared + preload)
status: pending
grade: 보통
risk: shared-contract
loop_track: auto-gate
estimated: 1h
domain: shared-ipc
summary: VSCode식 전역 UI 크기조절의 IPC 계약 — renderer 요청 → main이 zoomFactor 적용·영속. additive 채널
---

# Phase 02: 전역 줌 IPC 계약

> 근거 스크린샷: `UC1-ultracode-redesign/Screenshot/QHD_기준으로_다른 GUI가 상대적으로 작아보여서....png` — QHD에서 UI가 작아 보임, VSCode처럼 Ctrl+=/− 줌 필요.

## 🎯 목표

renderer가 줌 변경을 요청하고 현재 줌을 구독/조회할 수 있는 IPC 계약이 `02.Source/shared`에 additive로 정의되고 preload에 화이트리스트 노출된다.

## ⏪ 사전 조건
- [ ] **baseline 스파이크(plan-auditor 🔴)**: 커스텀 메뉴 미설정 상태에서 Electron 기본 View 메뉴 zoom role(Ctrl+=/−/0)이 이미 동작하는지 실증 → "기본 role 제거+커스텀 단일화" vs "기본 role 유지+영속만" 결정. 결과에 따라 P02~P04 크기 재조정(후자면 신규 계약이 거의 불요할 수 있음 — 착수 전 보고).

## 📝 작업 내용
- [ ] **지속 저장은 신규 채널 아님** — `shared/ipc/personalization.ts`의 기존 `UI_PREFS_SET`(`ui.setPref`)이 이미 `zoomFactor`를 예시 키로 명문. 재사용하라.
- [ ] 신규 계약은 **apply 트리거만**(예: `zoom.apply(factor)` — main이 webContents에 반영): 스파이크 결정이 "커스텀 단일화"일 때만. factor 범위 상수(0.5~2.0, step 0.1)를 계약에.
- [ ] preload contextBridge 노출(화이트리스트 관례) + 계약 골든 테스트.
- [ ] **per-region 줌 공존 정의(plan-auditor 🟡)**: `renderer/lib/zoom.tsx`(채팅·뷰어 CSS zoom + localStorage + ZoomBadge)와 전역 page zoom의 관계(공존 시 이중 배율·배지 2종·저장소 2곳)를 계약 주석에 명문 — 결정은 메인 세션 보고 후.

## ✅ 완료 조건
- [ ] typecheck 0(양쪽) / 기존 계약 변경 0(additive) / reviewer(shared-contract) CRITICAL 0

## ⚠️ 함정
- 계약 정의만 — main 적용(P03)·renderer 단축키(P04) 침범 금지.
- 줌 영속 스키마(settings JSON 확장)는 P03 몫이나, 계약의 factor 타입·범위는 여기서 고정.

## 담당 SubAgent
shared-ipc
