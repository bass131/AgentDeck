---
owner: 영호
milestone: FB2
phase: 03
title: 줌 클램프 setter 계약 — preload 노출
status: pending
grade: 보통
risk: shared-contract, trust-boundary
loop_track: auto-gate
estimated: 0.5h
domain: shared-ipc
summary: preload에 클램프된 setZoomFactor 노출(P05 버튼·Ctrl+= 용) — FB1 read-only getter 옆, additive
---

# Phase 03: 줌 클램프 setter 계약 — preload 노출

## 🎯 목표

preload에 `setZoomFactor(factor)`를 노출한다 — `ZOOM_FACTOR_RANGE`(0.5~2.0)로 클램프한 뒤 `webFrame.setZoomFactor`를 호출하고, 비유한(NaN/Infinity)·타입 불일치 입력은 no-op. `ZOOM_FACTOR_STEP = 0.1` 상수를 shared에 추가한다. FB1의 read-only getter 옆에 additive로만 얹는다.

## ⏪ 사전 조건
- [ ] 없음 (독립). FB1 P02 계약(1b660e4) 전제.

## 📝 작업 내용
- [ ] 클램프를 **노출 지점에서 강제**(원시 `webFrame.setZoomFactor` 위임 금지) — 범위 밖·비유한·타입 불일치는 노출 함수 내부에서 걸러 no-op.
- [ ] `ZOOM_FACTOR_STEP = 0.1` 상수를 shared에 추가.
- [ ] 주석에 native role(zoom level ±0.5 ≈ 배율 ×1.095)과 STEP 0.1의 증분 의미론 차이를 명문화 — Ctrl+=(10%)와 Ctrl+Shift+=(≈20%)의 폭이 달라지는 비대칭은 영호 인지 완료(2026-07-04 감사 🟡). Worker가 level 기반 정합이 낫다고 판단하면 **구현하지 말고 보고**.
- [ ] 계약 골든 테스트: 클램프 경계·no-op(비유한/타입 불일치)·비노출 회귀 가드 유지.

## ✅ 완료 조건
- [ ] typecheck 양쪽 0
- [ ] 기존 계약 변경 0 (additive)
- [ ] test green
- [ ] reviewer(shared-contract·trust-boundary) CRITICAL 0

## 📚 학습 포인트
- setter를 신뢰경계에 노출할 때 검증(클램프·타입 가드)을 어디에 두는가 — 호출부가 아닌 노출 지점에서 강제하는 이유.

## ⚠️ 함정
- 계약만 — renderer UI(P05) 침범 금지.

## 담당 SubAgent
shared-ipc
