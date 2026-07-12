---
owner: 영호
milestone: BL1
phase: 04
title: 복원 페이지 갱신 루프 데드락 — 진단 (원인 기계 증거 확정)
status: pending
grade: 보통
loop_track: auto-gate
estimated: 2~3h
domain: renderer
summary: 복원 페이지에서만 Playwright 'stable' 판정이 전부 타임아웃되는 JS 지속 갱신 루프(LR4-DONE:78)의 원인을 재현 스크립트 + 계측 증거로 특정 — 조사 전용, 수정은 P05.
---

# Phase 04: 복원 페이지 갱신 루프 데드락 — 진단

> **상태**: pending
> **마일스톤**: BL1
> **등급**: 보통 (조사 전용 — 제품 코드 변경 없음)
> **담당**: renderer (+qa 재현 스크립트)

---

## 🎯 목표

복원(restore)된 페이지에서만 모든 일반 클릭이 Playwright 액셔너빌리티 'stable' 판정에 막혀 타임아웃되는 원인을 **기계 증거로 확정**한다. 산출물 = 원인 컴포넌트·코드 경로 특정 + 재현/반증 실험 로그 + P05 수정 방향 1안.

---

## ⏪ 사전 조건

- [ ] 근거 확인: LR4-DONE.md:78 (잔여 6번 — "qa 계측상 애니메이션 0·박스 정지·오버레이 없음인데도 막힘 → JS 구동 지속 갱신 루프 추정")
- [ ] 현행 e2e의 force 클릭 우회 지점 확인 (`99.Others/tests/e2e/m3-multi-restore.e2e.ts:109-115` 외 grep force)
- [ ] **가설 후보 순서 갱신 (Codex 실측 2026-07-13)** — 옛 유력 후보 "REPL 활성 인디케이터"는 반증됨: 판정은 타이머 없는 항등 함수(replIndicator.ts:11)·점등은 CSS 애니메이션(Composer.css:927)·기존 e2e에서 애니메이션 꺼도 잔존 기록(m3-multi-restore.e2e.ts:217). **1순위 후보 = `SmoothMarkdown`의 영구 requestAnimationFrame 루프(SmoothMarkdown.tsx:69)**

---

## 📝 작업 내용

- [ ] **(a) 최소 재현** — 복원 페이지 진입 → 일반 클릭 타임아웃을 재현하는 최소 e2e 스크립트 (신규 페이지 대조군 포함)
- [ ] **(b) 계측** — 임시 계측 코드(커밋 X)로 원인 후보 수집: requestAnimationFrame/setInterval 등록 추적(원본 함수 래핑), React 커밋 빈도(Profiler), DOM 변이(MutationObserver). **인과 증명을 위해 클릭 target의 bounding rect 변화·요소 교체(replace)·long task·rAF callback CPU를 같은 시간축으로 수집** (Codex P2 — 등록 추적만으로는 어느 루프가 stable 실패를 유발하는지 증명 불가)
- [ ] **(c) 가설 검증** — SmoothMarkdown rAF 루프를 일시 비활성화(로컬 실험)한 상태에서 재현 여부 재확인 — 사라지면 확정, 남으면 다음 후보 반복
- [ ] **(d) 진단 보고** — renderer/qa는 원인·증거·수정 방향 1안(+기각한 대안) *텍스트를 전달*하고, Phase 폴더 `04-diagnosis-notes.md` 파일 박제는 **secretary**가 수행 (`01.Phases/**`는 secretary 영역 — CLAUDE.md 분담표, Codex P2)

---

## ✅ 완료 조건

- [ ] 원인 컴포넌트·코드 경로 특정 (파일:라인)
- [ ] 재현 실험 + 반증 실험(원인 제거 시 미재현) 로그 첨부
- [ ] P05 입력이 되는 수정 방향 1안 문서화 (`04-diagnosis-notes.md`)
- [ ] 제품 소스 경로 scoped diff 0 — `git status -- 02.Source/` 기준 (계측 코드 잔존 금지. 전체 클린 판정은 진단 문서·사용자 변경 때문에 오판 가능 — Codex P2)

---

## 📚 학습 포인트

- **Playwright 액셔너빌리티** — 클릭 전 요소가 visible·stable(연속 프레임 경계 동일)·enabled·이벤트 수신 가능해야 함. 'stable' 실패의 원인은 하나가 아님 — ① target 요소의 bounding box가 실제로 변함 ② 요소가 매 렌더마다 교체됨(참조 무효화) ③ 렌더러가 바빠 판정 프레임 자체가 늦어짐 — 계측은 셋을 구분해야 한다 (Codex P3).
- **가설-반증 디버깅** — "유력 후보"는 증거가 아님. 후보 제거 실험으로 재현이 사라져야 확정 (memory 교훈: 모델 자기보고 ≠ 진실, 실측이 진실).

---

## ⚠️ 함정

- force 클릭이 통과한다는 사실을 "문제 없음"의 근거로 쓰지 말 것 — force는 판정을 건너뛰는 우회지 해결이 아님.
- 조사 중 발견한 부수 버그는 수정하지 말고 백로그로 보고 (범위 밖 발견 시 보고 후 중단 — 헌법).
- 상시 갱신 루프가 사실이면 성능·배터리 함의(복원 화면 상시 CPU 소모)까지 진단서에 정량 기록(CPU 프로파일 전/후 비교 근거는 P05 완료 조건에 필요).

---

## 담당 SubAgent

renderer (계측·가설 검증) — 재현 e2e 스크립트는 qa 보조 가능
