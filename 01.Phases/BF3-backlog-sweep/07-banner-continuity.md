---
owner: 영호
milestone: BF3
phase: 07
title: loops/goal 배너 연속성 — 축출·복원 경계에서 표시 상태 생존
status: done
grade: 보통
loop_track: auto-gate
estimated: 1~3h
domain: renderer
summary: 세션 독립성 실측(2026-07-03)에서 발견된 연속성 갭 — loops/goal 배너 상태가 bgRuns 축출(cap 8)·패널 슬롯 축출(cap 32)·디스크 재로드 경계에서 소실되는 문제를 앱수명 스코프로 봉합 (오염 아닌 소실 방향)
---

# Phase 07: loops/goal 배너 연속성

> **상태**: pending / **마일스톤**: BF3 / **등급**: 보통 (측정 중 복잡 상향 가능) / **담당**: renderer

## 🎯 목표

루프가 실제로 살아있는 한, 대화·패널을 아무리 오가거나 백그라운드 세션이 많아져도 loops/goal 배너가 소실되지 않는다. 세션 독립성 실측(`_milestone-plan.md` §세션 독립성)에서 확정한 잔여 갭 — **교차 오염은 이미 0**, 남은 건 축출·복원 경계에서 표시 상태가 사라지는 연속성 문제다.

## ⏪ 사전 조건

- [ ] Phase 04 완료 (배너 판정 로직 안정 후 — 인터리빙 수리와 겹치면 원인 분리 곤란)
- [ ] Phase 05 완료 (useMultiPersist 복원 경계 수리 — 본 Phase와 같은 복원 경계를 다루므로 선행 필수)
- [ ] 배경: `_milestone-plan.md` §세션 독립성 실측 표(성립/갭 지점 file:line 전수)

## 📝 작업 내용

- [ ] **갭 재현 테스트(RED) 선행** — 3경계 각각: ⓐ 단일챗 `bgRuns` 축출(`sessions.ts` BG_RUNS_CAP=8 초과) 후 복귀 시 `activeLoops` 소실 ⓑ 멀티패널 슬롯 축출(`panelSession.ts` PANEL_MANAGER_CAP=32) 후 재마운트 시 소실 ⓒ 디스크 복원 스냅샷(`PanelThreadSnapshot`·`buildConversationSavePayload`)에 loops 미포함으로 재로드 시 소실.
- [ ] 봉합 설계(Worker 재량, 제약 아래): 표시 상태(`activeLoops`/`loopsStoppedNotice`/`pendingCommand`)를 축출에 휩쓸리지 않는 **앱수명 in-memory 스코프**로 승격 — LR3-P07의 panelSession 앱수명 매니저 승격 패턴 미러. 후보 ⓐ conversationId/패널키 키잉 앱수명 레지스트리 ⓑ 축출 시 해당 필드만 별도 보존. **회피**: main에 조회 IPC 신설(ⓒ) — 새 IPC 계약(shared-ipc 침범 = **work-judge (c)버킷 정지 확정**, plan-auditor 🟡-E), 필요해지면 보고 후 중단하고 영호 GO 대기.
- [ ] **불변조건 — 디스크 영속 금지**: loops/goal 진행 상태를 채팅 JSON에 저장하지 말 것. 앱 재시작 후 main 프로세스가 죽으면 루프도 죽으므로, 영속하면 죽은 루프의 배너가 되살아나는 stale 잔존(LR2-03 "크론 배너 영구 잔존"의 재림)이 된다. 재시작 후 미표시가 **정답**.
- [ ] 정리(cleanup) 대칭: 루프 종료·abort 시 앱수명 레지스트리도 함께 비워지는지 — loops:[] 정리 이벤트(BF2-mini 화이트리스트) 경로가 레지스트리에도 닿는지 단언.

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 / `npm run test` green / `npm run lint` 0
- [ ] 3경계 재현 테스트 RED→GREEN **git stash 실측**
- [ ] 앱 재시작 시뮬레이션(스토어 재생성)에서 배너 미복원 단언 (stale 방지 — 불변조건)
- [ ] 루프 종료 후 레지스트리 잔존 0 단언 (누수 방지)
- [ ] 기존 세션 독립성 성립 지점(멀티패널 격리·대화 전환 교체) 회귀 0

## 📚 학습 포인트

- **상태의 수명 스코프 설계**: 컴포넌트 수명 < 세션 스냅샷 < 앱 수명 < 디스크 영속 — 각 층은 "언제 사라져야 정답인가"가 다르다. 루프 표시는 "루프 프로세스와 같은 수명"이 정답이라 앱수명이 맞고 디스크는 틀리다.
- **캐시 축출과 상태 소실**: cap 있는 캐시(bgRuns 8개)에 살아있는 상태를 얹으면 축출이 곧 데이터 손실이 된다 — 축출 가능 캐시에는 재구성 가능한 것만.

## ⚠️ 함정

- 디스크 영속으로 "간단히" 풀고 싶은 유혹 — 불변조건 위반(stale 배너). 반드시 in-memory.
- 앱수명 레지스트리 도입 시 메모리 누수 — 루프 종료·대화 삭제 시 엔트리 정리 대칭 필수.
- Phase 04의 판정 수리(`hasLoopActivity`)와 얽힘 — 본 Phase는 renderer 표시 상태만, main 판정은 불가침.
- `pendingCommand`는 goal 턴카운트 외에 카드 in-place 갱신(`reducer/text.ts:79-90`)과 얽혀 있음 — 표시 상태만 승격하고 thread 갱신 로직은 건드리지 말 것.

## 담당 SubAgent

renderer Worker 1개. 실질 변경 ≥10줄 예상 → reviewer 조건부 호출.
