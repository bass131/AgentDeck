---
owner: 유영호
milestone: RS1
phase: 07
title: main 심층방어 보강 2건 (사람 게이트)
status: pending
grade: 복잡
risk: trust-boundary
loop_track: human-gate
estimated: 1~2h
domain: main-process
summary: 스윕 보안 렌즈가 찾은 심층방어 공백 2건 보강 — fs diff 경로의 자체 재검증(거동 불변)과 renderer발 창 bounds IPC payload 새니타이즈(거동 변화·영호 GO 필요). 신뢰경계 인접이라 reviewer 무조건 + 착수 전 사람 게이트.
---

# Phase 07: main 심층방어 보강 2건 (사람 게이트)

> **상태**: pending · **마일스톤**: RS1 · **등급**: 복잡(trust-boundary 깃발 = 1단계 상향, grade-and-risk §3) · **loop_track: human-gate — GO 기부여(영호 2026-07-28)로 충족됨, 정지 불요** · **담당**: main-process + qa + reviewer

## 🎯 목표

trust-boundary 안쪽 두 지점에 심층방어(defense in depth) 층이 하나씩 추가된다 — 상류 게이트가 있어도 함수 스스로 한 번 더 검증하는 구조.

## ⏪ 사전 조건

- [x] **영호 GO — 2026-07-28 사전 부여(야간 런 포함 결정과 함께, AskUserQuestion 답변 박제)**. 특히 C2는 거동이 실제로 바뀐다(비정상 payload가 무시됨) — "거동 불변" 대원칙의 *명시적 예외*라 사람 게이트였고, GO가 이미 주어졌으므로 실행 시 정지 불요. 사람 육안 검토는 아침 사후로.
- [ ] 다른 Phase와 의존성 없음 — GO만 받으면 아무 때나 가능.

## 📝 작업 내용

- [ ] **C1 — fs diff 경로 자체 재검증 (거동 불변)**: `02_Source/main/02_fs/diff.ts:169` `resolveFsDiffLines`가 상류에서 이미 검증된 경로를 받지만, 함수 내부에서 `resolveSafe`를 **자체 호출**해 이중으로 확인. 시그니처 불변·게이트를 통과한 정상 입력의 거동 불변. + qa 위임: 경로 탈출 시도 입력(`..` 조합 등)이 거부되는 테스트 추가.
- [ ] **C2 — 창 bounds IPC payload 새니타이즈 (거동 변화 — GO 대상)**: `02_Source/main/06_window/controls.ts:177-183`은 `WINDOW_SET_BOUNDS`의 `ipcMain.handle` 본문으로, **renderer가 보낸 payload를 그대로 `win.setBounds(b)`에 넘긴다**(plan-auditor 실측 — "저장 JSON 복원값"이 아니라 renderer발 untrusted 입력이 위협원). `sanitizeBounds` 도입 — 4필드 `Number.isFinite` 검사 + 최소 크기(MIN_W/MIN_H) 클램프, 불통과 시 no-op. 손상·조작된 payload가 창을 화면 밖·0×0으로 날리는 경로 차단. 이 지점은 `06_window/`라 지뢰 3의 `00_ipc/**` 미접촉과는 별개 경로지만 *IPC 핸들러 본문*이다 — human-gate + reviewer 무조건이 그 보상 통제.

## ✅ 완료 조건

- [ ] `npm run typecheck`(node+web) 0 / `npm run test` 비감소·신규 fail 0(신규 방어 테스트 포함) / `npm run lint` 0
- [ ] C1: 경로 탈출 테스트 red→green (TDD — 방어가 없으면 실패하는 테스트 먼저)
- [ ] C2: 비정상 bounds 픽스처(NaN·Infinity·음수 크기)가 no-op 처리되는 테스트를 **먼저 red로 확인한 뒤 구현으로 green**(CORE-05 — 이 마일스톤 유일의 거동 변화라 신기능 규율 적용)
- [ ] reviewer 🔴 0 (신뢰경계 인접 — 무조건 호출)

## 📚 학습 포인트

- **심층방어(defense in depth)** — "상류에서 이미 검증했다"는 전제는 리팩토링 한 번이면 무너진다. 신뢰경계 안쪽 함수는 자기 입력을 스스로 의심하는 게 원칙.
- **renderer는 untrusted다(CORE-01)** — 같은 앱 화면에서 온 IPC payload라도 main은 신뢰하지 않는다. 심층방어 관점에서는 디스크에서 복원한 JSON도 같은 지위다(역직렬화 입력 = 외부 입력).

## ⚠️ 함정

- ⛔ `02_Source/main/00_ipc/**`·`02_Source/preload/**`·canUseTool/권한 경로는 이 Phase에서도 **미접촉** — 여기서 보강하는 건 그 게이트의 *다음 층*이지 게이트 자체가 아니다.
- C1에서 자체 재검증이 기존 정상 흐름을 거부하면 안 된다 — 게이트 통과 입력 전수에 대해 no-op임을 테스트로 증명.
- C2의 클램프 상수(MIN_W/MIN_H)는 기존 창 생성 코드의 최소값과 일치시킨다 — 새 값을 발명하지 않는다.

## 담당 SubAgent

main-process (Worker) + qa (방어 테스트) + reviewer(무조건 — trust-boundary 인접)
