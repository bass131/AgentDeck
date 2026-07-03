---
owner: 영호
milestone: RMW1
phase: 02
title: shared 명령 계약 — 의도 명령 IPC 5종 타입·채널 정의 + preload 노출
status: done
grade: 복잡
risk: trust-boundary
loop_track: human-gate
estimated: 2h
domain: shared-ipc
---

# Phase 02: shared 명령 계약 — 의도 명령 IPC 5종 타입·채널 정의 + preload 노출

> **상태**: pending
> **마일스톤**: RMW1-single-writer
> **등급**: 복잡 (기본 보통 + trust-boundary[preload]·shared-contract 깃발 상향)
> **담당**: shared-ipc

---

## 🎯 목표

ADR-031의 의도 명령 5종(upsert/create/delete/rename/select)이 `02.Source/shared/ipc/multi.ts`에 채널·요청/응답 타입으로 단일 정의되고 preload에 화이트리스트 노출된다. **모든 명령 응답은 병합 후 권위 상태**(renderer 미러 동기화용)를 담는다.

---

## ⏪ 사전 조건

- [ ] ADR-031 확정 (완료 — a68e753)
- [ ] 없음 (P01과 병렬 가능 — P01은 현 구조 대상)

---

## 📝 작업 내용

- [ ] `02.Source/shared/ipc/multi.ts`에 명령 채널 5종 추가 (기존 `multi.save`·`multi.load` 네이밍 결 유지 — 예: `multi.cmd.upsert` 등)
- [ ] 요청 타입: `upsert`(세션 스냅샷 1개) / `create`(초기 메타) / `delete`(id) / `rename`(id, name) / `select`(id)
- [ ] 응답 타입 공통화: `{ ok, state }` — state = 병합 후 권위 `MultiSessionState` (renderer가 이걸로 미러 갱신)
- [ ] 기존 `MULTI_SESSION_SAVE`는 **deprecated 주석만** (제거는 P05 — P04 이관 완료 전까지 앱이 동작해야 함)
- [ ] `02.Source/preload/index.ts` 화이트리스트에 명령 5종 invoke 노출 (기존 :814-825 결 유지)
- [ ] main 핸들러는 이 Phase에서 구현하지 않음 (P03) — 계약 *정의*만. typecheck는 미사용 타입으로도 green이어야 함

---

## ✅ 완료 조건

- [ ] `npm run typecheck` (main+renderer 양쪽) 0 errors — shared 변경 후 양쪽 확인은 헌법 CRITICAL
- [ ] `npm run test` green / `npm run lint` 0 problems
- [ ] 채널 문자열이 shared 단일 정의 외에 산재 0 (grep 확인)
- [ ] reviewer(shared-contract 깃발 무조건) CRITICAL 0
- [ ] **사람 게이트**: 계약 표면(채널·타입 시그니처) 영호 확인 후 다음 Phase 진행

---

## 📚 학습 포인트

- **계약 우선 설계(contract-first)** — 구현(main)과 소비(renderer)가 갈라지기 전에 타입으로 경계를 못박으면, 이후 두 Phase가 병렬성 없이도 서로를 컴파일 타임에 검증한다.
- **응답에 권위 상태를 싣는 이유** — renderer가 "내가 보낸 대로 됐겠지"라고 가정(낙관적 갱신만)하면 main의 병합 결과와 어긋날 수 있다. 응답 미러링은 그 어긋남을 구조적으로 차단한다.

---

## ⚠️ 함정

- preload는 신뢰 경계의 문 — 명령별 최소 시그니처만 노출, 범용 invoke 노출 금지 (trust-boundary).
- 채널명을 renderer/main에 문자열 리터럴로 복붙하는 순간 단일 정의 위반 — 반드시 `IPC_CHANNELS` import.
- 이 Phase에서 SAVE를 성급히 지우면 앱이 P04까지 깨진 상태로 남는다 — 제거는 P05.

---

## 담당 SubAgent

shared-ipc (계약 정의 + preload — 구현은 P03 main-process)
