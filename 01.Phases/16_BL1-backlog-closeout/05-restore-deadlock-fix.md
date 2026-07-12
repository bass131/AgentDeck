---
owner: 영호
milestone: BL1
phase: 05
title: 복원 페이지 e2e 정직 클릭 회복 — BrowserWindow show/focus 헬퍼 (P04 진단 재정의)
status: done
grade: 보통
loop_track: auto-gate
estimated: 1~2h
domain: qa
summary: P04 진단으로 전제 반전 — 데드락 원인은 제품 갱신 루프가 아니라 복원 창의 OS 포커스/가시성 미획득(Chromium rAF 전달 정지 → Playwright stable 판정 미구동). 제품 무혐의 확정 — 테스트 하네스 전용 수정(relaunch 후 BrowserWindow show/focus 공통 헬퍼)으로 force 클릭 우회를 정직 클릭으로 복원.
---

# Phase 05: 복원 페이지 e2e 정직 클릭 회복 (재정의)

> **상태**: done
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

- [ ] **(검증 순서 = RED 먼저)** force 클릭 우회 지점(`m3-multi-restore.e2e.ts:115,226,236`·`lr4-p07-repl-per-session-live.e2e.ts:176,224` 외 grep 전수)을 일반 클릭으로 먼저 복원 → **site별 개별** 타임아웃 재현(RED) + 트랜스크립트 확보(완료조건 증거 — plan-auditor 🟡). 포커스 상실이 조건부일 수 있어 site마다 재현 여부가 다를 수 있음 — 재현 안 되는 site는 그 사실 자체를 기록
- [ ] 공통 헬퍼 1곳 신설 — relaunch 직후 BrowserWindow `show()+focus()`. 창 해석은 `getAllWindows()[0]` 인덱스 대신 **Playwright `page`에 바인딩된 webContents 경유** 권장(다중 창 오조준 방지 — plan-auditor 🟡). 기존 e2e 헬퍼 관례(`helpers/isolatedBoot.ts`는 fresh-boot용 — relaunch 헬퍼는 별도 신설) 준수
- [ ] 재기동 spec 전수를 헬퍼 경유로 결선 → GREEN 전환
- [ ] 우회용 디스크 단정(force 시절 보조 단정)이 있으면 원상 복구
- [ ] **반증된 근거 주석 4곳 교정** — `m3:107-111`·`m3:217-223`("JS 지속 갱신 루프 추정 실측")·`lr4:170-172`·`lr4:214-218`("페이지 레벨 CSS 애니메이션")을 P04 실원인(복원 창 OS 포커스 미획득 → rAF 전달 정지)으로 교체 (plan-auditor 🟡 — force 제거 후 오정보 주석 잔존 방지)

---

## ✅ 완료 조건

- [ ] 복원 페이지 **일반 클릭**(force 없음) e2e PASS — force 제거 diff 포함
- [ ] **헬퍼 미적용 RED 트랜스크립트(사이트별)** 보고 첨부 — RED 선행의 감사 증거 (plan-auditor 🟡 승격)
- [ ] 재기동 관련 e2e 전수 **실제 실행** green — 일반 클릭으로 이미 통과 중이던 spec(lr1-resume-restart·lr2-02-heldopen·switch-continuity-seamless·lr3-p07-multipanel) 포함 회귀 확인
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
- Windows 전경 잠금은 환경 의존 — 로컬 green 후 다른 세션/환경에서 1회 재확인 권장. RED 재현도 site·타이밍 조건부일 수 있음(일부 복원 spec은 현재 일반 클릭으로 통과 중) — flaky RED는 실패가 아니라 기록 대상.
- headless/CI(전경 창 자체가 없는 환경)에서 show/focus의 rAF 회복은 별개 리스크 — 현 e2e는 attended 로컬(Windows) 위주라 우선도 낮음, 명시만 (plan-auditor 🟡).
- 제품 코드를 건드리고 싶은 유혹(예: main에 포커스 로직) 금지 — 기각 사유는 `04-diagnosis-notes.md` 참조.

---

## 📎 실행 기록 (2026-07-13, qa Worker 완료)

- **RED 재현**: m3 SC-1-B(`promptBtn.click` 30s 타임아웃)·lr4 S2(`selectSidebar.click` 30s 타임아웃) — P04 제4유형 시그니처 재확인. 신규 부트 대조군(SC-1-A·S1)은 통과. m3:115·lr4:176(multiBtn)은 독립 RED 미재현(force가 실효 없는 보조 안전이었음 — 기록).
- **헬퍼**: `helpers/relaunchFocus.ts` `focusRestoredWindow(app, page)` — `app.browserWindow(page)`로 창 특정(인덱스 미사용), 멱등·try/catch. GREEN: m3 4 pass / lr4 4 pass.
- **주석 교정 4곳** 완료(m3:107-111·217-223, lr4:170-172·214-218 → P04 실원인).
- **lr1/lr2(LIVE_SDK 게이트 relaunch spec) 헬퍼 결선 보류 — Supervisor 승인**: 라이브 검증 불가 환경에서 작동 중 spec에 무증거 네이티브 결합 삽입은 실측 원칙 위반. 향후 attended 라이브에서 복원-포커스 flake 확인 시 동일 멱등 헬퍼를 해당 launch 함수에 결선(1줄). `switch-continuity-seamless`·`lr3-p07-multipanel`은 실측상 in-session 전환(relaunch 아님) — 헬퍼 대상 아님 판정.

## 담당 SubAgent

qa (renderer/main 코드 무접촉 — e2e·헬퍼만)
