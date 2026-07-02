---
owner: 영호
milestone: RMW1
phase: 04
title: renderer 이관 — 분산 RMW 6개 호출처 → 의도 명령 + 응답 미러
status: pending
grade: 복잡
loop_track: auto-gate
estimated: 3h
domain: renderer
---

# Phase 04: renderer 이관 — 분산 RMW 6개 호출처 → 의도 명령 + 응답 미러

> **상태**: pending
> **마일스톤**: RMW1-single-writer
> **등급**: 복잡 (1 도메인이나 호출처 6곳 · ~150줄 예상)
> **담당**: renderer

---

## 🎯 목표

renderer의 `multi-agent.json` 대상 read-modify-write가 0이 된다: 6개 호출처 전부가 의도 명령을 보내고 응답의 권위 상태로 Zustand 미러를 동기화한다. **P01의 경합 재현 3계열이 `.fails` 제거 후 GREEN** — lost-update 소멸의 기계 증거.

---

## ⏪ 사전 조건

- [ ] Phase 02 (계약) + Phase 03 (main 핸들러) 완료
- [ ] Phase 01 (재현 테스트) 완료 — 본 Phase의 done 판사

---

## 📝 작업 내용

- [ ] `02.Source/renderer/src/hooks/useMultiPersist.ts` — `performRmwSave`(LOAD→upsert→SAVE 2단 RMW)를 **upsert 명령 1발**로 교체. debounce 500ms·`restoredRef` 게이트·언마운트 flush 구조는 유지(발사체만 교체)
- [ ] `02.Source/renderer/src/store/slices/multiSession.ts` 5개 액션 이관:
  - `newMultiSession` → create / `selectMultiSession` → select / `deleteMultiSession` → delete / `renameMultiSession` → rename / `loadMultiSessions` → LOAD(읽기 유지) + 최초 세션 생성은 create
- [ ] 각 호출처에서 명령 응답 `state`로 Zustand 미러 동기화 — 낙관적 갱신(`selectMultiSession`의 기존 optimistic set)은 유지하되 응답 도착 시 권위 상태로 수렴
- [ ] `MULTI_SESSION_SAVE` invoke 호출 잔존 0 (preload 경유 포함 — 채널 자체 제거는 P05)
- [ ] **P01 IPC mock을 명령+병합 시뮬레이션으로 재배선** — 기존 mock은 통짜 SAVE의 last-write-wins를 시뮬레이션. 호출처가 명령 IPC로 바뀌면 mock도 "명령 수신 → main 원자 병합" 시뮬레이션이어야 GREEN이 성립 (테스트 본문·인터리브 시나리오는 생존, mock 하네스만 교체 — plan-auditor 🟡1)
- [ ] P01 3계열 `.fails` 제거 → GREEN 확인

---

## ✅ 완료 조건

- [ ] **P01 경합 3계열 `.fails` 없이 전부 PASS** (마일스톤의 핵심 완료 증거)
- [ ] renderer에서 `multiSessionSave`(통짜 SAVE) 호출 grep 잔존 0
- [ ] 기존 멀티세션 테스트(bf3-p05 포함) 회귀 green
- [ ] `npm run typecheck` (양쪽) 0 / `npm run test` green / `npm run lint` 0
- [ ] reviewer CRITICAL 0 (≥10줄+복잡 = 무조건 트리거)

---

## 📚 학습 포인트

- **미러 패턴** — 진실원(main의 디스크 상태)과 뷰(Zustand)를 분리하면, 뷰는 "명령 보내고 응답으로 수렴"만 하면 된다. 뷰가 진실원을 직접 조립(RMW)하는 순간 이번 버그가 태어났다.
- **낙관적 갱신 + 권위 수렴** — UI 반응성(즉시 반영)과 일관성(응답으로 교정)을 둘 다 잡는 표준 조합.

---

## ⚠️ 함정

- upsert 스냅샷을 debounce 클로저에 가두면 stale 스냅샷 전송 — 발사 시점에 최신 상태를 빌드(`buildActiveSession`)할 것.
- 언마운트 flush는 fire-and-forget — 응답 미러 동기화를 걸면 언마운트된 컴포넌트 setState 경고. flush는 전송만.
- UI 시각 변경 0이어야 함(로직만) — CSS/JSX 레이아웃 건드리면 ui-visual 깃발로 트랙이 바뀐다.

---

## 담당 SubAgent

renderer (untrusted — 모든 저장은 preload 노출 명령 IPC 경유)
