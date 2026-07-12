---
owner: 영호
milestone: BL1
phase: 01
title: ultracodeToggle offKeys — 대화/패널 삭제 시 prune
status: pending
grade: 보통
loop_track: auto-gate
estimated: 1~2h
domain: renderer
summary: 대화(단일챗)·패널(멀티세션) 삭제 시 해당 스코프의 ultracode OFF 키를 offKeys Set에서 함께 제거 — 잔존 누수 0 (LR4-DONE 잔여 5번).
---

# Phase 01: ultracodeToggle offKeys — 대화/패널 삭제 시 prune

> **상태**: pending
> **마일스톤**: BL1
> **등급**: 보통
> **담당**: renderer

---

## 🎯 목표

대화 또는 패널 세션을 삭제하면 그 스코프의 ultracode OFF 키가 `offKeys: Set<string>`에서 함께 제거된다. 삭제된 대화의 키가 Set에 잔존하는 누수(현재 저심각 — in-memory·앱 재시작 시 소멸)가 0이 된다.

---

## ⏪ 사전 조건

- [ ] 브랜치 `feature/bl1-backlog-closeout` 생성됨
- [ ] 근거 확인: `02.Source/renderer/src/store/ultracodeToggle.ts:36·:40`(offKeys 인터페이스·초기화), `:98-102`(migrateSingleChatDefaultScope — 동형 패턴 참고), LR4-DONE.md:77

---

## 📝 작업 내용

- [ ] **(TDD) 실패 테스트 먼저** — 스코프 OFF → 해당 대화/패널 삭제 → offKeys에 키 잔존을 재현하는 spec 작성 (RED 확인)
- [ ] `pruneScopeKeys(...)` (또는 동등 명칭) 함수 신설 — `migrateSingleChatDefaultScope`와 동형 패턴. **멀티세션은 단일 키가 아니라 prefix 전수 prune** — 키 형태가 세션별 여러 `multi:{id}:slot:{slot}`(ultracodeToggle.ts:9)이므로 `multi:{id}:` prefix의 모든 슬롯 키를 제거. 단일챗은 해당 스코프 키 1개 (Codex P2 반영)
- [ ] 삭제 액션 호출처 **전수 grep** 후 결선 — 멀티세션 delete(`02.Source/renderer/src/store/slices/multiSession.ts`) + 단일챗 삭제 플로우 + 그 외 삭제 경로가 더 있으면 열거 후 전부 (메모리 교훈: UI 롤아웃 노출 지점 전수 열거)
- [ ] **성공한 삭제에만 prune** — 현 호출처는 `ok:false` 응답에도 로컬 정리를 수행함(multiSession.ts:111·main multiStore.ts:206) — prune은 삭제 성공 경로에만 결선해 실패 시 offKeys 무변경 보장 (Codex P2 반영)
- [ ] 테스트 GREEN 확인

---

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 errors
- [ ] `npm run test` green — 신규 prune spec PASS + 기존 ultracodeToggle spec 회귀 PASS
- [ ] `npm run lint` 0 problems
- [ ] 삭제 시나리오(멀티·단일 각 1)에서 offKeys 잔존 0 단정 테스트 존재
- [ ] 멀티세션 **복수 슬롯** 키 전수 prune 테스트 + **삭제 실패(`ok:false`) 시 offKeys 무변경** 테스트 (Codex P2)

---

## 📚 학습 포인트

- **리소스 수명 관리** — in-memory 자료구조도 소유자(대화)가 삭제되면 함께 정리해야 한다. "재시작하면 사라지니까 괜찮다"는 실행 시간이 길어질수록 무너지는 가정.

---

## ⚠️ 함정

- ADR-032 v2 불변(**비영속**) 유지 — prune을 구현하다가 offKeys를 영속화하는 방향으로 확장하지 말 것.
- 삭제 경로가 여러 곳(멀티 delete / 단일챗 삭제 / 혹시 모를 일괄 정리) — 한 곳만 결선하면 나머지 경로에서 누수 재발. grep 전수가 완료 조건의 실질.

---

## 담당 SubAgent

renderer (테스트 포함 — 스토어 단위 테스트라 qa 분리 불요)
