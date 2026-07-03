---
owner: 영호
milestone: FB1
phase: 04
title: 전역 줌 renderer — 줌 변화 영속 + 표시
status: done
grade: 보통
loop_track: auto-gate
estimated: 1h
domain: renderer
summary: page zoom 변화 감지 → ui.setPref 저장(P03 부팅 복원과 라운드트립) + (선택) 현재 줌 % 표시 — 단축키 신규 등록 없음(native role 처리)
---

# Phase 04: 전역 줌 renderer — 줌 변화 영속 + 표시

## 🎯 목표

page zoom 변화(native role Ctrl+=/−/0)가 ui-prefs에 영속되고, 현재 줌이 표시된다 — 단축키 신규 등록 없음(native role이 이미 처리). P02 조회 → `ui.setPref` 저장 → P03 부팅 복원으로 라운드트립.

## ⏪ 사전 조건
- [ ] Phase 02 완료 (preload 조회 노출 — 하드 의존: 감지 후 현재 factor를 읽어야 저장 성립)
- [ ] Phase 03 완료 (부팅 복원 — 라운드트립 관측 가능)

## 📝 작업 내용
- [ ] 줌 변화 감지: page zoom 변경 시 devicePixelRatio가 변하므로 `matchMedia('(resolution: ...)')` change 리스너(표준 관례)로 감지 → preload의 read-only 줌 조회(P02)로 현재 factor 읽기.
- [ ] 감지된 factor를 `ui.setPref('zoomFactor')`로 저장(P03 부팅 복원과 라운드트립 성립).
- [ ] (선택·여유 시) 설정 탭 또는 기존 배지 문법으로 현재 줌 % 표시 — 새 시각 문법 필요하면 스킵하고 보고.
- [ ] 단위 테스트: 감지→저장 매핑, factor 동일 시 중복 저장 방지.

## ✅ 완료 조건
- [x] typecheck 0 / test green / lint 0 / reviewer CRITICAL 0
- [ ] 라이브 육안(영호): QHD에서 Ctrl+= 확대 체감 — 버킷 b

## ⚠️ 함정
- 감지 리스너 중복 등록 주의.
- per-region CSS zoom과의 혼동(전역 배지 vs ZoomBadge 구분 — P02 공존 정의 참조).

## 담당 SubAgent
renderer
