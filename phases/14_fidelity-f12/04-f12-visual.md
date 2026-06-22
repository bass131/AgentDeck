# Phase 04: f12-visual

## 목표
ImageViewer 라이트박스 e2e + 스크린샷. 라이프사이클 5개는 단위 시각(F12-02/03) 확인.

## 담당 도메인 / 에이전트
qa (tests/). 등급: 보통.

## 의존 Phase
F12-03.

## 위험 깃발
없음 (테스트만).

## 변경 대상 (이 경계 밖 금지)
- `tests/e2e/visual-viewer.e2e.ts`(기존 — 확장) — ImageViewer 케이스 추가: 컴포저 attach → 썸네일 클릭 → `.iv-overlay` 표시 + iv-img + 스샷 + Esc 닫기. 정리. + 라이프사이클 미표시 단정.

## 작업 단계
1. 대화 탭 → 컴포저 attach 버튼 클릭(샘플 썸네일 추가) → img-thumb 클릭 → `.iv-overlay` 표시 + `.iv-img` 단언 + 스샷(imageviewer.png) + Esc 닫기.
2. **런치 시 라이프사이클 5개 오버레이 미표시 단정**(`.wn-scrim`/`.un-hero`/EngineGate/AppUpdateGate/Profile login-body count 0 — default off 검증).
3. 정리(오버레이 닫힘, textarea 비움).

## 완료조건 (AC — 측정 가능)
- [ ] `npm run test:e2e` 전체 PASS(회귀 0 + ImageViewer e2e).
- [ ] ImageViewer 스크린샷 생성 — 원본 대조.
- [ ] **WhatsNew·UpdateNotes·EngineGate·AppUpdateGate·Profile = 단위(F12-02/03) 시각 검증**(라이프사이클 라이브 트리거=M5, e2e 비대상). 약속-구현 간극 없음.
- [ ] 전체 게이트 green: typecheck·test·test:e2e·lint.

## 참조
원본 ImageViewer.tsx · REPLICA_GAP F12 · F9 첨부 트레이 e2e.
