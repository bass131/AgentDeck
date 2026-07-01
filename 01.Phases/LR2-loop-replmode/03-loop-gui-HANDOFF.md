---
owner: 영호
milestone: LR2
phase: 03
title: loop GUI — 구현 완료·육안 검토 대기 (HANDOFF, 무인 커밋 금지 준수)
status: in-review (human-visual 게이트 대기)
grade: 복잡 (ui-visual)
date: 2026-07-03 (야간 무인)
summary: 인디케이터 통합(LoopStatusBanner) + /goal 진행 카드 + 팔레트 검증 구현 완료. 기계 게이트 전부 green·스크린샷 5장. ui-visual 규칙대로 커밋하지 않고 워킹트리로 남김 — 아침 영호 육안 후 커밋.
---

# LR2 Phase 03 — loop GUI 핸드오프 (커밋 금지 준수 · 아침 육안 대기)

> **이 Phase의 변경은 전부 uncommitted** (완료조건 [human-visual]: "ui-visual = 무인 commit X").
> 검토 자료: `ScreenShot/01~05*.png` + 이 문서. 재현: 아래 §검증 명령.

## ① 무엇을
1. **인디케이터 통합** — 두 컴포넌트(앱 타이머 `LoopIndicator` 배너 / SDK 크론 `LoopRunningIndicator` 우상단 pill)를 `LoopStatusBanner` 하나로 통합, 컴포저 위 단일 위치.
   - 표시 결정은 순수 함수 `lib/loopStatus.ts::resolveLoopStatus(activeLoop, activeLoops)` —
     discriminated union(none/app/sdk), 우선순위 app>sdk. **동시 표시가 구조적으로 불가능**
     (컴포넌트가 하나뿐 — 종전엔 replMode 분기에 우연히 의존). 둘 다 활성이면 앱 배너에
     "· 크론 N" 힌트 병기(정보 은닉 0).
   - 구 컴포넌트 4파일 삭제. e2e 셀렉터 계약(`.loop-indicator`·`.loop-stop`) 유지 —
     loop-live.e2e.ts 무수정 통과 대상.
2. **/goal 진행 카드** — cmdresult 카드 확장(renderer-only, shared/IPC 확장 0):
   - begin: user 버블 대신 카드, sub=목표 텍스트(`/goal` 인자).
   - 진행: 새 assistant msg마다 title "목표를 향해 자율 반복 중… · N턴" in-place 갱신.
   - done: "목표 반복을 마쳤어요 · N턴" + 목표 텍스트 유지. 멀티패널 동형(공용 reducer).
3. **팔레트** — 실측 결과 `goal`·`loop`·`schedule`은 main `BUILTIN_SLASH_COMMANDS`에 이미
   큐레이션돼 있어 코드 변경 0 (Phase 전제 일부 stale — 스크린샷 01·02로 검증만).
4. **부수 수리** — abort(세션 종료) 후 SDK 크론 배너 잔존 버그(5c 기존) renderer-local 봉합.

## ② 실측 발견 (이 Phase가 캔 것 — probe 5~8/12)
- **/goal은 크론이 아니다**: SDK **stop-hook 자기지속**으로 반복(loops 이벤트 0 — Phase의
  "CronTracker를 소스로" 전제 stale). 단발 모드에서도 goal 턴마다 assistant messageId 증가
  (`ar1-1→ar1-2→ar1-3`) + 최종 done 1회 → 카드는 이 신호만 소비(새 IPC 불필요).
- **interval 없는 `/loop`은 ScheduleWakeup(self-paced)** → CronCreate 미발화 → CronTracker
  비가시. 명시 interval(`/loop 1m …`)이어야 크론 모드 → 배너 가시. (백로그 ⑦ 참조)
- **SDK /loop의 CronCreate는 모델 재량** — 라이브 3회 중 1회만 크론 생성(2회는 inline "OK"
  1회 응답). 배너 자체는 크론 생성 시 정상 출현 실증(스크린샷 05).
- **abort 시 loops:[] 정리 이벤트 유실(기존 버그)**: main `agent-runs.ts:193`이 abort의
  done 마킹 후 `break` → 백엔드 abortCleanup이 push한 loops:[]가 renderer에 영원히 미도달
  → 배너 영구 잔존. **renderer-local 봉합**(abortRun에 `activeLoops: []`, 패널 `CLEAR_LOOPS`)
  — main 내부 크론 상태는 실제로 정리되므로 표시만 동기화. interrupt(세션 유지)는 미정리.
- **e2e 격리 함정**: 이전 런의 대화가 lastActiveId로 복원되며 다른 cwd에서 stale sessionId
  resume → "No conversation found with session ID" 오류로 run 사망(오류 표면화 UI는 정상).
  하네스에 "새 대화" 클릭 격리 추가.

## ③ 검증 (기계 게이트 — 전부 green)
- TDD: `loop-status-banner.test.tsx`(16 — resolver·배너 3변형·셀렉터 계약·단일 렌더 보장) ·
  `goal-progress-card.test.ts`(14 — 등록·begin·턴카운트·done·compact/일반대화 회귀) ·
  `loop-store.test.ts` +3(abortRun 정리 RED→GREEN·interrupt 유지·panel CLEAR_LOOPS).
  구 컴포넌트 테스트 2파일은 의도 이관 후 삭제.
- 전체 **3910 green** · typecheck 0 · lint 0.
- 라이브: SDK 크론 배너 실 SDK 출현 실증(REPL ON `/loop 1m` → CronCreate → 배너).
- reviewer 사전 점검 **🟢**(위반 0 · 8/8축, 코드 수정 권고 0). 🟡 육안 참고 3:
  ① SDK 크론 표시 위치가 우상단 pill → 컴포저 위 배너로 이동(의도된 설계지만 육안 확인 대상)
  ② goal 턴 카운트는 messageId 휴리스틱 — 한 goal 턴이 text→tool→text로 다중 msg를 내면
  과대 카운트 가능(probe에선 미발생·라이브 1회 교차확인 권장) ③ abort 이벤트 드롭 원수리
  이연 판단 타당(아래 ⑧).

## ④ 육안 검토 포인트 (영호)
- `ScreenShot/01-palette-slash.png` — 팔레트에 goal·loop(+설명) 노출.
- `02-palette-goal.png` — `/goal` 필터.
- `03-goal-card-done.png` — goal 카드 완료 상태("목표 반복을 마쳤어요 · 1턴" + 목표 sub).
- `04-loop-banner-app.png` — 앱 타이머 배너("반복 중 · 1틱 · 30초 간격 · 정지").
- `05-loop-banner-sdk.png` — SDK 크론 배너("loop 진행중 · summary · 정지") + CronCreate 카드.
- 확인 요청: 배너 위치(우상단 pill → 컴포저 위 배너로 이동 — 취향 판단), "· 크론 N" 병기
  문구, goal 카드 title의 "· N턴" 표기, 안티슬롭(토큰만·글로우 0).

## §검증 명령 (재현)
```bash
npx vitest run 99.Others/tests/renderer/loop-status-banner.test.tsx 99.Others/tests/renderer/goal-progress-card.test.ts 99.Others/tests/renderer/loop-store.test.ts
LR2_03_SCREENS=1 npx playwright test 99.Others/tests/e2e/lr2-03-loop-gui-screens.e2e.ts   # mock 스크린샷 재생성
npm run dev   # 실앱 육안: '/' 팔레트 → /goal·/loop, /loop 30s 배너
```

## ⑤ 미해결·백로그 (차단 아님)
- **⑦ ScheduleWakeup(self-paced) 루프 비가시**: interval 없는 `/loop`·자율 wakeup은
  CronTracker에 안 잡혀 GUI 미표시. 시각화하려면 ScheduleWakeup tool_call 트래킹 추가
  (main progressTrackers — 별도 Phase 감).
- **⑧ main abort 이벤트 드롭**: agent-runs.ts:193의 done-후-break가 backend 정리 이벤트
  (loops:[] 등)를 삼킴 — 근본 수리는 🔴 최대위험 구역(ADR-024) → 영호 GO 필요.
  renderer-local 봉합으로 사용자 체감은 해소된 상태.
- **goal 카드 심화**: 목표 "평가 결과"(달성/미달)는 SDK가 구조화 신호를 안 줘 미표시 —
  최종 턴 텍스트가 사실상의 평가(채팅에 렌더됨). num_turns 상한도 이벤트 미노출.
- 스크린샷 하네스(`lr2-03-loop-gui-screens.e2e.ts`)는 opt-in 유지 — 커밋 여부 영호 판단.

## 파일 목록 (전부 uncommitted)
- 신규: `lib/loopStatus.ts` · `07_notice/LoopStatusBanner.tsx/.css` ·
  `tests/renderer/loop-status-banner.test.tsx` · `tests/renderer/goal-progress-card.test.ts` ·
  `tests/e2e/lr2-03-loop-gui-screens.e2e.ts` · `ScreenShot/01~05*.png` · 이 문서.
- 수정: `Conversation.tsx` · `PanelView.tsx` · `cmdCards.ts` · `reducer.ts` ·
  `reducer/types.ts` · `reducer/text.ts` · `reducer/lifecycle.ts` · `slices/runtime.ts` ·
  `panelSession.ts` · `slices/selector.ts`(주석) · `Conversation.css`(주석) ·
  `tests/renderer/loop-store.test.ts` · `tests/renderer/ux-fixes-bcd-e.test.tsx`.
- 삭제: `LoopIndicator.tsx/.css` · `LoopRunningIndicator.tsx/.css` ·
  `tests/renderer/loop-indicator.test.tsx` · `tests/renderer/loop-running-indicator.test.tsx`.
