### ADR-022: 앱 레벨 `/loop` — 클라이언트 인터셉트 + renderer 주도 재호출 ⭐
**결정**: `/loop` 슬래시 커맨드를 **SDK로 보내지 않고 renderer가 직접 반복**한다(앱 레벨). `/clear`·`/ask`(ADR-019 계열) 인터셉트 패턴을 확장 — `/loop [interval] <prompt>`를 클라이언트에서 가로채 활성 루프를 등록하고, 매 run 완료(busy→idle 전이)마다 내부 프롬프트를 기존 `sendMessage`/`session.send`로 재전송한다.

- **인터셉트(🔴#1)**: `Conversation.dispatchSend`·`MultiWorkspace.PanelView.handleSend` **최상단**(`commandOf`/`sendMessage` 진입 전)에서 `/loop`을 가로챔 → 평문 슬래시가 SDK로 새지 않음. `/loop stop`·`/loop off`도 동일 인터셉트.
- **순수 분리**: `parseLoopCommand`(interval/stop/invalid 분류)·`decideLoopTick`(안전 가드 판정)·`formatLoopInterval`을 `src/renderer/src/lib/loopCommand.ts`에 순수 함수로 추출(window.api/타이머 무관 → 단위 단언). 컴포넌트 effect는 얇은 와이어링만.
- **상태**: 단일 채팅 = `appStore.activeLoop`(StoreState 휘발 필드, reducer 밖) + `startLoop/tickLoop/stopLoop/dismissLoop`. 멀티 패널 = `PanelView` 컴포넌트 로컬 `useState`(panelReducer 미주입 — 순수성·패널 격리). 둘 다 영속 제외(snapshotForPersist/buildPersistState 미수집).
- **틱 스케줄**: busy→idle 전이에서 `decideLoopTick` 가드 통과 시 `setTimeout(intervalMs)` 후 다음 틱 재dispatch(타이머는 reducer 밖 컴포넌트 effect). 단일 채팅은 기존 큐 드레인과 **단일 effect로 통합 + 사용자 큐 우선순위**(🔴#2 경합 차단).
- **정지(🔴#3)**: abort·`/loop stop`·인디케이터 정지 버튼이 `activeLoop`를 null/stopped로 → 타이머 정리 effect가 `clearTimeout`(좀비 틱 차단). 단일 채팅은 `stopLoop()` 단일 액션 수렴, abort는 `set({queue:[], activeLoop:null})`.
- **안전 가드(Q4)**: `LOOP_MAX_TICKS=50` + `LOOP_MAX_DURATION_MS=30분` 이중 상한, 먼저 도달 쪽 자동 정지 + 인디케이터 알림. self-pace(interval 미지정) 기본 `LOOP_DEFAULT_INTERVAL_MS=5000`(런어웨이/정지 개입창 확보). 거대 interval은 `LOOP_MAX_INTERVAL_MS=6h` 클램프.

**이유**: ① 사용자 요구("나도 직접 쓰는 일이 많아서") — `/loop`이 팔레트엔 뜨지만 실제로 반복되지 않았음. ② raw SDK 프로브(`artifacts/loop-probe.mjs`, gitignore)로 근본원인 규명: SDK 네이티브 `/loop`은 `CronCreate`로 **세션 전용 크론**을 예약하는데, AgentDeck은 메시지마다 새 단발 `query()`를 띄우고 응답 후 세션 close(ADR-021 F-B 펌프) → 예약 크론이 세션과 함께 소멸 → **2번째 틱부터 영영 발동 안 함**(CLI는 인터랙티브 세션이 턴 사이 생존해 발동). ③ query()-per-message 구조에 자연 정합 — 각 틱이 일반 run이라 관측·중단 가능, 신규 IPC 0(기존 send 재사용), main/SDK 무변경.

**트레이드오프 / 신뢰경계**: ① 원본 AgentCodeGUI 미존재 확장(원본은 CLI 인터랙티브 세션이라 세션 크론이 동작) → query() 호스트 적응의 **ADR-013(스택 원본 일치) 예외** — 사용자 직접 결정(2026-06-26)으로 정당화. ② 신뢰경계: renderer 단독 — 신규 IPC 0, fs/Node/SDK 직접 호출 0, 시크릿 0, 타이머는 reducer 밖(컴포넌트 effect/스토어 액션)이라 reducer 순수성 보존. ③ ADR-003: `/loop`은 우리 앱 개념 — 엔진 고유 리터럴('Workflow'/'task_'/'Task'/CronCreate/SDK 옵션 형상) 미관여, 틱은 엔진중립 `sendMessage`/`session.send`로만. ④ 가동 중 `/loop stop` 타이핑은 비신뢰 경로(단일=큐 적재 후 다음 idle에 처리, 멀티=Enter가 abort로 분기) → **정지의 주 경로는 인디케이터 정지 버튼**(activeLoop 존재 시 상시 표시). ⑤ 단일 채팅 재마운트 시 `prevRunningRef` 재초기화로 직전 done 전이를 놓칠 위험 → Conversation 상시 마운트 전제로 수용(멀티는 패널 로컬이라 무관).

**완료조건(측정가능)**: ① 단위 — `parseLoopCommand`(interval 30s/5m/1h·self-pace 기본·stop/off·invalid·5x 흡수·9999h 클램프)·`decideLoopTick`(가드 경계·우선순위)·`formatLoopInterval`(`loop-command.test.ts` 29). ② 단위 — `activeLoop` 액션·정지 3경로 수렴·abort/clear 연동(`loop-store.test.ts` 14). ③ 단위 — 인디케이터 running/stopped·정지/닫기(`loop-indicator.test.tsx` 6). ④ 통합 — `/loop` 인터셉트로 SDK엔 내부 프롬프트만(`'/loop'` 누수 0)·`/loop stop` agentRun 0·첫 틱 카운트 1(`loop-intercept.test.tsx` 4). ⑤ 통합 — 멀티 패널 누수 0·인디케이터·패널 격리(`multi-loop.test.tsx` 4). ⑥ 라이브(LIVE_SDK=1, `loop-live.e2e.ts`) — `/loop 5s`로 **실제 2틱 이상 반복**(매 run 완료마다 재발사) + 정지 버튼으로 중단. ⑦ typecheck node/web green + reviewer CRITICAL 0.

**현황(2026-06-26)**: 구현 완료 — 단일(`99c06c7`)·멀티(`7ed45be`)·라이브 e2e+드라이버(`6081d02`). plan-auditor 설계 승인 + 5개 질문 확정 + 3개 🔴 반영, reviewer CRITICAL 위반 0. 전체 3477 단위 green·typecheck 양쪽. 라이브 e2e PASS(/loop 5s 2틱 반복 + 정지 실증, 33.7s). 드라이버=`docs/LOOP_SUPPORT.md`, 프로브=`artifacts/loop-probe.mjs`(gitignore). (미push — 인간 게이트.)

