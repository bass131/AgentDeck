---
owner: 영호
milestone: LR3
phase: 03
title: 앱 타이머 /loop 폐기 — /loop을 SDK 빌트인으로 통과
status: pending
grade: 복잡
loop_track: auto-gate
estimated: 2~4h
domain: renderer
summary: "동일 문장 재전송" 앱 타이머 /loop(loopCommand.ts 인터셉트) 폐기 — 영호 확정(2026-07-03, "토큰 맥싱"). /loop은 항상 SDK로 통과(P02 AUTO 세션 수명으로 크론이 기본 경로에서 생존). + renderer 부속: replMode 기본 true·uiPrefs 영속(P02에서 도메인 분리 이관). 인터셉트·타이머·가드·관련 테스트 정리, loop-live e2e를 SDK 경로 검증으로 교체.
---

# Phase 03: 앱 타이머 /loop 폐기

> **상태**: pending
> **마일스톤**: LR3
> **등급**: 복잡 (삭제 범위 넓음 — 인터셉트·훅·테스트·e2e 연쇄)
> **담당**: renderer Worker

---

## 🎯 목표

`/loop`이 앱 타이머(같은 프롬프트 재전송)가 아니라 **SDK 빌트인 루프**(Claude 자기제어 —
매 틱 판단·갱신·종료)로 동작한다. 루프 엔진 재발명 코드가 사라지고, 앱에는 시각화만 남는다
(BF1 P04 결정2의 원형 복원).

## ⏪ 사전 조건

- [ ] Phase 02 완료 — AUTO 세션 수명(턴이 held-open으로 시작해 크론 예약이 생존, idle 시
      자동 정리 — /loop을 SDK로 넘겨도 안전한 토대).

## 📝 작업 내용

- [ ] `Conversation.tsx`·패널 send 경로의 `isLoopCommand(text) && !replMode` 인터셉트 제거
      → `/loop` 원문이 항상 SDK로 통과.
- [ ] 앱 타이머 구동부 정리: `decideLoopTick` 스케줄 effect·`usePanelLoop`·
      `startLoop/tickLoop/stopLoop/dismissLoop` 액션·`activeLoop` 상태 제거(또는
      dead-code 없는 최소 잔존 판단 — 통합 배너의 app 변형 소비자가 사라짐).
- [ ] `LoopStatusBanner` 정리: app 변형 제거 여부 결정 — sdk 변형 + (P06의) goal 변형만
      남기고 단순화. `resolveLoopStatus` 계약 테스트 갱신.
- [ ] `loopCommand.ts` 삭제(파서·가드 상수 포함) + `loop-store.test.ts` 등 관련 테스트 정리.
- [ ] `loop-live.e2e.ts`를 SDK 경로 검증으로 교체(REPL ON `/loop 1m` → 크론 배너 —
      LR2-03 스크린샷 하네스의 LIVE 블록 승격·통합).
- [ ] 팔레트 `/loop` description 정합(commands.ts — "(REPL 지속세션)" 문구가 기본 경로가
      됐으므로 자연스러운 문구로. main 1줄 — 도메인 경계 명시하고 reviewer에 표기).
- [ ] **renderer 부속(P02에서 이관)**: `replMode` 초기값 true(모든 send가 persistent —
      AUTO가 비용을 상쇄) + uiPrefs 저장/복원(기존 `setUiPref`/`getUiPrefs` 재사용, 신규
      IPC 0). **가법성 확인**: 기존 prefs에 replMode 키 부재 시 기본 true 폴백(하위호환,
      변환 마이그 0 — (c) 게이트 비해당). LR2-01 테스트 계약은 의도 보존·기본값 기대만 갱신.

## ✅ 완료 조건

- [ ] `/loop <interval> <프롬프트>` → SDK 크론 생성 → 통합 배너 표시(라이브 1회, AUTO 기본).
- [ ] 앱 타이머 재전송 경로 코드·테스트 잔존 0 (grep `LOOP_MAX_TICKS|isLoopCommand` 0).
- [ ] replMode 기본 true + prefs 왕복(저장→재시작 복원) 단위 계약 GREEN.
- [ ] `npm run typecheck` 0 · `npm run test` green(삭제 반영 후 전체) · `npm run lint` 0.
- [ ] reviewer 통과(복잡 등급).

## 📚 학습 포인트

- **기능 삭제도 설계다** — 삭제 순서(소비자→구동부→파서)를 지키면 중간 상태에서도 빌드가
  깨지지 않는다. 테스트가 "무엇이 사라져야 하는가"의 명세가 된다.

## ⚠️ 함정

- 앱 타이머의 안전가드(50틱·30분 상한)는 함께 사라짐 — SDK 루프의 안전장치는 세션
  스코프(abort로 소멸)와 사용자 정지 버튼임을 완료조건에서 확인.
- `stopLoop('abort')` 연동(🔴#3 잔류 방지) 등 abort 경로에 얽힌 정리 로직을 지울 때
  `activeLoops`(SDK 표시) 정리는 **남겨야** 함 — LR2-03 커밋의 잔존 봉합 회귀 금지.
- 멀티패널 `PanelView`·`usePanelLoop`도 동형 제거 — 단일채팅만 지우면 비대칭.

## 담당 SubAgent

renderer Worker. reviewer 무조건(복잡). Phase 05와 병렬 가능(도메인 독립).
순서: 01→04→02→**03**→07 (02의 AUTO가 선행 — /loop을 SDK로 넘겨도 크론이 생존하는 토대).
