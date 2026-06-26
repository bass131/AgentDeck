---
owner: 영호
milestone: RF1
phase: 10
title: ipc/index.ts 핸들러 도메인별 분해
status: pending
grade: 대규모
risk: trust-boundary
loop_track: human-gate
estimated: 4h
domain: main-process
summary: 1501줄 ipc/index.ts의 ipcMain 핸들러를 도메인별 모듈로 분해 + 등록 집계 (신뢰 경계 점검)
---

# Phase 10: ipc/index.ts 핸들러 도메인별 분해

> **상태**: pending
> **마일스톤**: RF1-cleanup (트랙 C · 리팩토링)
> **등급**: 대규모 (1501줄 · trust-boundary)
> **담당**: main-process — **reviewer 무조건** (trust-boundary)

---

## 🎯 목표

`src/main/ipc/index.ts`(1501줄)의 `ipcMain.handle` 핸들러들을 **도메인별 등록 모듈**(workspace·agent·fs·git·lsp·conversation …)로 분해하고, `index.ts`는 *등록 집계자*(각 도메인 `registerXxxHandlers(ctx)` 호출)로 슬림화한다. 신뢰 경계(권한 검증·resolveSafe) 불변.

---

## ⏪ 사전 조건

- [ ] Phase 09 — ipc-contract 분해 (채널 도메인 경계가 핸들러 분해 가이드)
- [ ] **Phase 07 — src/main 번호접두 이동** (결함2): 07이 `src/main/ipc/`를 rename하므로, 07 *이후*에 그 폴더 내부를 분해해야 import 1회 갱신. 07 전에 10 착수 시 double churn.

---

## 📝 작업 내용

- [ ] 핸들러를 채널 도메인 기준 그룹핑 (09 분해와 1:1 정렬)
- [ ] `src/main/ipc/handlers/<domain>.ts`로 분리 — 각 `register<Domain>Handlers(deps)` export
- [ ] `index.ts`는 의존성 주입 + register 호출 집계
- [ ] 권한 검증·`resolveSafe`·rootId 게이트 로직 *이동만, 약화 X* (신뢰 경계)
- [ ] 핸들러 간 공유 헬퍼는 별 모듈로 (중복 제거)

---

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 errors · `npm run test` green · `npm run build` green
- [ ] 앱 실행 — 전 IPC 경로(fs·git·agent run·lsp) 동작 불변 (e2e smoke)
- [ ] `index.ts` ≤ ~150줄 (집계자만)
- [ ] 각 핸들러 모듈 ≤ ~300줄
- [ ] **reviewer GO** (trust-boundary — 권한 누수·resolveSafe 우회 점검)

---

## 📚 학습 포인트

- **핸들러 등록 패턴** — 거대 `index.ts` 대신 도메인별 `register*(deps)` → 진입점은 조립만. 테스트·탐색 쉬움.
- **의존성 주입(DI)** — 핸들러가 전역 import 대신 `ctx`/`deps`를 받으면 결합도↓·테스트 용이.

---

## ⚠️ 함정

- 권한 검증을 "리팩토링하다" 우회/약화 → renderer 권한 누수 (헌법 CRITICAL 위반). 로직 **이동만**.
- 핸들러 등록 누락 → 해당 IPC 무응답 (런타임에서만 발견). e2e smoke 필수.
- ctx 순환 의존 — DI 설계 시 방향 주의.

---

## 담당 SubAgent

> main-process (src/main/** R/W) → reviewer 무조건 (trust-boundary).
