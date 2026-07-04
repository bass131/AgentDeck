---
owner: 영호
milestone: FB2
phase: 05
title: 줌 확대 UI — Ctrl+= 단축키 + 우하단 ± 버튼
status: done
grade: 보통
risk: ui-visual
loop_track: human-visual
estimated: 1.5h
domain: renderer
summary: Ctrl+=(unshifted) keydown + 우하단 고정 ± 컨트롤이 P03 setter를 호출 — native role(Ctrl+Shift+=/−/0)과 공존
---

# Phase 05: 줌 확대 UI — Ctrl+= 단축키 + 우하단 ± 버튼

## 🎯 목표

Ctrl+= 확대가 동작하고(영호 버그 리포트 해소), VSCode처럼 우측 하단에 +/−(및 현재 % 표시·클릭 리셋) 소형 컨트롤이 뜬다. 적용은 전부 P03 클램프 setter 경유.

## ⏪ 사전 조건
- [ ] Phase 03 완료(setter 존재). FB1 P04 영속 훅(useGlobalZoom — DPR 변화 감지→ui.setPref 저장)이 커밋돼 있음(f242810). FB1 useGlobalZoomPersist가 setter 변화도 저장한다는 것은 **미검증 가정**(훅은 matchMedia DPR change에만 의존 — `webFrame.setZoomFactor`가 이를 발화하는지 미실측, plan-auditor 🟡). 본 Phase에서 **라이브 probe로 실증** — 미발화면 setter 호출부에서 명시 저장 경로 추가(기존 setPref 재사용).

## 📝 작업 내용
- [ ] 전역 keydown: Ctrl/Cmd+`=`(shift 없음만 — Ctrl+Shift+=는 native role 몫, 이중 발화 금지) → getZoomFactor+STEP→setter. Ctrl+`-`·`0`은 native가 이미 처리하므로 등록하지 않음.
- [ ] IME 조합 중(event.isComposing) 무시.
- [ ] 우하단 컨트롤: 기존 토큰·기존 pill/badge 문법 재사용(신규 색 금지), per-region ZoomBadge와 시각·위치 구분.
- [ ] 단위 테스트: 키 매핑(shift 구분·isComposing)·버튼 클릭→setter 호출·클램프 경계에서 버튼 disabled.
- [ ] STEP 0.1(10%)과 native role(level ±0.5 ≈ 배율 ×1.095, 약 9.5%) 증분 비대칭은 영호 인지 완료 — P03 계약 주석 참조.

## ✅ 완료 조건
- [x] typecheck 0
- [x] test green
- [x] lint 0
- [x] reviewer CRITICAL 0
- [x] 줌 영속 라이브 probe — 버튼/Ctrl+= 변경 후 ui-prefs에 zoomFactor 저장 실측(e2e 또는 프로브, LR1 실측검증 교훈)
- [x] **영호 육안(버킷 b): Ctrl+= 확대 체감 + 버튼 동작 + 재시작 영속** — 육안 승인 전 무인 commit 금지.

## 📚 학습 포인트
- 왜 Ctrl+=가 기본으로 안 되는가(accelerator 'Plus' = shifted 문자) — 키 이벤트와 액셀러레이터의 차이.

## ⚠️ 함정
- 기본 메뉴는 건드리지 않음(FB1 중간안 정합 — main 영역 침범 금지).
- FB1 P06 커밋 완료로 renderer 도메인 충돌 없음.

## 담당 SubAgent
renderer
