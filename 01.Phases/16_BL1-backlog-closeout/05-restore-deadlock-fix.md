---
owner: 영호
milestone: BL1
phase: 05
title: 복원 페이지 갱신 루프 데드락 — 수정 + e2e 정직 클릭 회복
status: pending
grade: 복잡 (2 도메인: renderer+qa / +ui-visual 인접)
risk: ui-visual
loop_track: human-visual
estimated: 2~4h
domain: cross
summary: P04에서 확정한 원인(지속 갱신 루프)을 제거해 복원 페이지 상시 CPU 소모를 해소하고, e2e force 클릭 우회를 정직 클릭으로 되돌린다.
---

# Phase 05: 복원 페이지 갱신 루프 데드락 — 수정

> **상태**: pending
> **마일스톤**: BL1
> **등급**: 복잡
> **담당**: renderer + qa

---

## 🎯 목표

P04가 특정한 지속 갱신 루프를 제거한다. 복원 페이지에서 Playwright **일반 클릭이 통과**하고(force 우회 제거), 복원 화면의 상시 CPU 소모가 사라진다.

---

## ⏪ 사전 조건

- [ ] **P04 완료** — 원인 파일:라인 + 수정 방향 1안 (`04-diagnosis-notes.md`)

---

## 📝 작업 내용

- [ ] **(TDD) 실패 테스트 먼저** — 복원 페이지 일반 클릭(force 없음) e2e spec — 현재 RED임을 확인
- [ ] 원인 루프 제거 — P04 방향안 적용. 인디케이터류가 원인이면 JS 상시 tick 대신 CSS 애니메이션 또는 이벤트 구동 갱신으로 전환(시각 결과 동일 유지)
- [ ] 기존 e2e의 force 클릭 우회 지점을 정직 클릭으로 복원 (우회용 디스크 단정도 원상)
- [ ] CPU 계측 전/후 비교 — P04와 동일 계측 방법·동일 재현 명령으로, **합격 임계 명시**: 복원 페이지 idle 10초 관찰 창 × 3표본에서 원인 루프의 지속 callback 0회(또는 P04가 확정한 계측 지표 기준 상한 — 착수 시 P04 결과로 수치 고정). "기록만"은 악화도 통과시키므로 금지 (Codex P2). 수치는 -DONE에 박제

---

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 errors / `npm run test` green / `npm run lint` 0 problems
- [ ] 복원 페이지 일반 클릭 e2e PASS (force 제거 diff 포함)
- [ ] 기존 e2e 전체 회귀 green
- [ ] CPU/프레임 계측 전/후 비교 — 위 합격 임계 통과 (관찰 창·표본 수·상한 명시된 형태로)
- [ ] **영호 육안 확인 체크리스트** — 복원/신규 페이지 각각: 스트리밍 마크다운 표시·인디케이터 점등·스크롤 거동이 수정 전과 동일 (ui-visual)
- [ ] `-DONE.md` + HTML 시각화 (복잡 등급 양식 — 파일 박제는 secretary, Worker는 내용 전달)

---

## 📚 학습 포인트

- **CSS 애니메이션 vs JS tick** — `transform`·`opacity` 같은 컴포지터 전용 속성의 CSS 애니메이션은 메인 스레드를 안 거쳐 레이아웃 안정 판정에 안 걸리고 CPU도 싸다(단, `width`·`top` 등 레이아웃 속성 애니메이션은 CSS라도 레이아웃을 흔든다 — Codex P3). JS로 매 프레임 스타일을 바꾸면 같은 시각 효과라도 'stable' 판정·성능 둘 다 해침.

---

## ⚠️ 함정

- 원인 제거가 아니라 e2e만 통과시키는 수정(예: 테스트에서 인디케이터 숨김) 금지 — 성능 문제가 남는다.
- 시각 요소 변경은 신규 페이지에도 영향 — 복원 페이지만 보지 말고 양쪽 육안.
- e2e 안정화를 위해 임의 sleep 삽입 금지 — 정직 클릭이 통과해야 완료.

---

## 담당 SubAgent

coordinator 경유 — renderer(수정) + qa(e2e 복원) 2 Worker + reviewer (복잡 등급)
