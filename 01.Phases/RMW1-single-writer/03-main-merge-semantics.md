---
owner: 영호
milestone: RMW1
phase: 03
title: main 병합 의미론 — multiStore 명령 처리 + 동기 원자 핸들러 5종
status: pending
grade: 복잡
risk: trust-boundary
loop_track: auto-gate
estimated: 3h
domain: main-process
---

# Phase 03: main 병합 의미론 — multiStore 명령 처리 + 동기 원자 핸들러 5종

> **상태**: pending
> **마일스톤**: RMW1-single-writer
> **등급**: 복잡 (기본 보통 + trust-boundary[00_ipc] 상향)
> **담당**: main-process
> **loop_track 근거**: trust-boundary 깃발이나, 설계 분기는 ADR-031 + P02 사람 게이트에서 이미 해소 — 본 Phase는 확정 계약의 구현이라 기계 판정 트랙. 구현 중 *새* 설계 분기 발생 시 (c) 승격 후 정지.

---

## 🎯 목표

main이 `multi-agent.json`의 유일한 병합·기록자가 된다: 명령 5종 각각을 `read → merge → write` **동기 블록**(run-to-completion 원자)으로 처리하는 핸들러가 동작하고, 병합 의미론이 단위 테스트로 고정된다.

---

## ⏪ 사전 조건

- [ ] Phase 02 완료 (shared 계약 + 사람 게이트 통과)

---

## 📝 작업 내용

- [ ] `02.Source/main/multiStore.ts`에 순수 병합 함수 5종 (TDD — 실패 테스트 먼저):
  - `upsertSession(state, snapshot)` — id 일치 세션 교체, 없으면 추가. **activeSessionId 불변**(소유는 create/select만 — BF3 P05 오염[저장마다 active 덮어쓰기] 재발 방지, plan-auditor 🟡2)
  - `createSession(state, meta)` — 추가 + activeSessionId 갱신
  - `deleteSession(state, id)` — 제거 + 삭제 대상이 active면 **남은 첫 세션(remaining[0]) 승계**(현 `deleteMultiSession` L147과 일치 — "인접" 승계 아님) + **마지막 세션 삭제 시 새 세션 자동 생성**(현 L140-144 미러, plan-auditor 🔴 봉합)
  - `renameSession(state, id, name)` / `selectSession(state, id)` — 대상 부재 시 no-op + ok:false
- [ ] `02.Source/main/00_ipc/handlers/multi.ts`에 명령 핸들러 5종 — 각각 `readMulti → 병합 함수 → writeMulti` 를 **await 없이 동기로** 수행, 응답에 병합 후 권위 상태
- [ ] 입력 검증: renderer는 untrusted — id/name/snapshot 형태 검증 후 불량은 ok:false (기존 SAVE의 "best-effort, 검증 최소"에서 강화)
- [ ] 기존 `MULTI_SESSION_SAVE`·`MULTI_SESSION_LOAD` 핸들러는 현행 유지 (제거·전환은 P04~P05)

---

## ✅ 완료 조건

- [ ] 병합 함수 5종 단위 테스트 green (경계: 빈 상태 / 대상 부재 / active 삭제[remaining[0] 승계] / **마지막 세션 삭제→새 세션 자동 생성** / 중복 id upsert / upsert의 activeSessionId 불변)
- [ ] **핸들러 경로에 await 0** — 동기 원자성 보장을 grep/리뷰로 확인 (이게 ADR-031의 심장)
- [ ] `npm run typecheck` (양쪽) 0 / `npm run test` green / `npm run lint` 0
- [ ] reviewer(trust-boundary 깃발 무조건) CRITICAL 0

---

## 📚 학습 포인트

- **run-to-completion** — JS 이벤트루프는 시작한 동기 블록을 끝까지 실행한다. 핸들러 안에 await가 없으면 그 블록은 "락 없이 원자적" — 락을 코드로 짜는 게 아니라 실행 모델에서 공짜로 얻는다.
- **순수 함수로 의미론 분리** — 병합 규칙을 IPC/fs에서 떼어 순수 함수로 두면 단위 테스트가 fs mock 없이 돌고, 의미론 변경이 국소화된다.

---

## ⚠️ 함정

- 핸들러에 `async`/`await` 하나만 들어가도(예: fs.promises 사용) 원자성이 깨진다 — `readFileSync`/`writeFileSync` 유지가 설계의 일부.
- active 삭제 시 승계 규칙을 renderer 기존 동작(`deleteMultiSession`의 현 로직)과 일치시킬 것 — 여기서 조용히 바꾸면 P04에서 UI 거동 회귀.
- 검증 강화가 기존 정상 흐름을 거부하면 안 됨 — 거부는 형태 불량만, 의미 판단(예: "빈 이름 rename")은 기존 renderer 거동 따름.

---

## 담당 SubAgent

main-process (multiStore + 00_ipc 핸들러 — 계약 정의는 P02 산출물 사용)
