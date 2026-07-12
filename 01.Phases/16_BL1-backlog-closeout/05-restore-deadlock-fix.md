---
owner: 영호
milestone: BL1
phase: 05
title: 복원 페이지 e2e 정직 클릭 회복 — BrowserWindow show/focus 헬퍼 (P04 진단 재정의)
status: pending
grade: 보통
loop_track: auto-gate
estimated: 1~2h
domain: qa
summary: P04 진단으로 전제 반전 — 데드락 원인은 제품 갱신 루프가 아니라 복원 창의 OS 포커스/가시성 미획득(Chromium rAF 전달 정지 → Playwright stable 판정 미구동). 제품 무혐의 확정 — 테스트 하네스 전용 수정(relaunch 후 BrowserWindow show/focus 공통 헬퍼)으로 force 클릭 우회를 정직 클릭으로 복원.
---

# Phase 05: 복원 페이지 e2e 정직 클릭 회복 (재정의)

> **상태**: pending
> **마일스톤**: BL1
> **등급**: 보통 (재정의 — 원 계획 복잡/ui-visual에서 하향: 제품 코드 무접촉·시각 변경 0)
> **담당**: qa
>
> **⚠️ 재정의 기록 (2026-07-13)**: 원 계획("제품의 지속 갱신 루프 제거 + CPU 개선")은 P04 진단으로 전제가 반증됨 — 렌더러에 지속 루프 없음(idle rAF 0회), 원인은 복원 창 OS 포커스 미획득. 인과 증명: 네이티브 `show()+focus()` 주입 → rAF 회복 → 일반 클릭 34ms 성공. 상세 = `04-diagnosis-notes.md`. CPU 개선 완료조건은 성능 문제 부존재 확인으로 삭제.

---

## 🎯 목표

e2e에서 앱 close→relaunch(복원) 후 첫 상호작용 전에 `BrowserWindow.show()+focus()`를 수행하는 **공통 헬퍼**를 도입하고, force 클릭 우회를 전부 일반 클릭으로 복원한다. **제품 코드(`02.Source/**`) diff 0.**

---

## ⏪ 사전 조건

- [x] **P04 완료** — 원인·인과 증명·수정 방향 확정 (`04-diagnosis-notes.md`)
- [ ] 재기동(e2e relaunch) 경로 전수 grep — `m3-multi-restore.e2e.ts`·`lr4-p07-repl-per-session-live.e2e.ts` 외 close→relaunch 하는 spec 전부 열거

---

## 📝 작업 내용

- [ ] **(검증 순서 = RED 먼저)** force 클릭 우회 지점(`m3-multi-restore.e2e.ts:115,226,236` 외 grep 전수)을 일반 클릭으로 먼저 복원 → 타임아웃 재현(RED) 확인 — 헬퍼 효과를 가짜 green 없이 증명하기 위한 순서
- [ ] 공통 헬퍼 1곳 신설 — relaunch 직후(`app.firstWindow()` 뒤) `app.evaluate(({BrowserWindow}) => { const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus() })`. 기존 e2e 헬퍼 모듈 위치 실측 후 그 관례를 따름
- [ ] 재기동 spec 전수를 헬퍼 경유로 결선 → GREEN 전환
- [ ] 우회용 디스크 단정(force 시절 보조 단정)이 있으면 원상 복구

---

## ✅ 완료 조건

- [ ] 복원 페이지 **일반 클릭**(force 없음) e2e PASS — force 제거 diff 포함
- [ ] 재기동 관련 e2e 전수 green + 기존 e2e 회귀 green
- [ ] `git status -- 02.Source/` diff 0 (제품 무변경)
- [ ] `npm run typecheck`·`npm run test`·`npm run lint` green

---

## 📚 학습 포인트

- **백그라운드 창 렌더링 스로틀링** — Chromium은 포커스/가시성을 잃은 창에 rAF 전달을 멈춘다(전력 절약). "느려짐"이 아니라 "정지"라서 타임아웃 연장으로는 절대 해결 안 됨.
- **테스트-구현 결합 trade-off** — 테스트가 Electron 네이티브 API(BrowserWindow)에 결합되는 비용을 치르고, 실제 실패 메커니즘을 정확히 겨냥하는 이득을 산다. 대안(제품에 포커스 스틸링 추가)은 실사용 UX 해악이 더 컸다.

---

## ⚠️ 함정

- `page.bringToFront()`는 무효(P04 실측) — 반드시 Electron 네이티브 핸들 경유.
- force 제거 없이 헬퍼만 추가하면 "이미 통과하던 force"에 가려 효과 검증 불가 — RED 먼저 순서 엄수.
- Windows 전경 잠금은 환경 의존 — 로컬 green 후 다른 세션/환경에서 1회 재확인 권장.
- 제품 코드를 건드리고 싶은 유혹(예: main에 포커스 로직) 금지 — 기각 사유는 `04-diagnosis-notes.md` 참조.

---

## 담당 SubAgent

qa (renderer/main 코드 무접촉 — e2e·헬퍼만)
