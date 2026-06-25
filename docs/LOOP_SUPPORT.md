# 앱 레벨 /loop 지원 (드라이버 — compact 생존)

> 사용자 결정(2026-06-26): **AgentDeck에서 `/loop`이 실제로 반복 동작하게 앱 레벨로 구현**.
> 사용자가 `/loop`을 자주 씀. 이 문서가 compact 후 이어가는 단일 진실원.

## 배경 — raw SDK 프로브로 규명한 근본 원인 (확정)

프로브 `artifacts/loop-probe.mjs`(gitignore, `node artifacts/loop-probe.mjs`) + 인터벌 변형으로 확정:

1. **`/loop`은 supportedCommands에 있음**(우리 팔레트에 뜸):
   `{name:"loop", description:"Run a prompt or slash command on a recurring interval (e.g. /loop 5m /foo). Omit the interval to let the model self-pace.", argumentHint:"[interval] [prompt]", aliases:["proactive"]}`
2. **`/loop <작업>`(인터벌 없음)** → SDK가 작업을 **1회** 실행하고 종료(반복 안 함).
3. **`/loop 2m <작업>`** → 모델이 `CronCreate({cron:"*/2 * * * *", recurring:true})` 호출 →
   **세션 전용 크론 잡 예약** + 작업 1회 즉시 실행 → result success → 종료.
4. **결정적 한계**: 예약 크론은 SDK 안내대로 **"세션 전용 + 세션이 살아있고 idle일 때만 발동"**.
   AgentDeck은 **메시지마다 새 단발 `query()`를 띄우고 응답 후 세션 close**(F-B 펌프) → 예약 크론은
   세션과 함께 소멸 → **2번째 틱부터 영영 발동 안 함**. (CLI는 인터랙티브 세션이 턴 사이 생존해 발동.)

→ SDK 네이티브 `/loop`(세션 크론)은 우리 query()-per-message 구조에서 불가. **우리가 직접 반복**한다.
   (같은 이유로 `/schedule`·`/goal`도 세션지속 의존 — 후속 검토.)

## 승인된 방향 — 앱 레벨 루프 (renderer 주도 재호출, 옵션 B)

핵심: `/loop`을 **클라이언트에서 인터셉트**(/clear·/ask 패턴 미러)하고, SDK로 안 보낸다(쓸모없는
세션 크론 방지). 대신 **renderer가 직접 반복**: 매 틱마다 내부 프롬프트를 기존 `sendMessage`로
재전송. 우리 구조(메시지=새 query())에 자연 정합 + 각 틱이 일반 run이라 **관측·중단 가능**.

### 설계 스케치 (compact 후 plan-auditor로 확정)
- **인터셉트 위치**: `Conversation.dispatchSend`(단일) + `MultiWorkspace.handleSend`(멀티)에서
  `/loop` 분기. `/clear`·`/ask`처럼 sendMessage 전에 가로챔.
- **파싱**: `/loop [interval] <prompt>` — interval = `30s`·`5m`·`2m`·`1h` 등(정규식). interval 없으면
  "완료 직후 재실행"(연속) 또는 기본 간격(결정 필요). `/loop stop`(또는 `/loop off`) = 중단 인터셉트.
- **상태(store)**: `activeLoop?: { prompt, intervalMs, tickCount, status }`(대화별/패널별 1개). 휘발(영속 X).
- **틱 메커니즘**: 루프 시작 시 1틱 즉시 dispatch. 이후 **run 완료(done/error 전이) 감지 → intervalMs
  대기 → 다음 틱 dispatch**(setTimeout, reducer 밖=순수성). 대화 맥락은 이어감(내부 프롬프트를 새
  user 턴으로). 무한 가드(최대 틱 수 옵션? 사용자 중단 기본).
- **중단**: ① 루프 인디케이터의 정지 버튼 ② `/loop stop` ③ abort(실행 중단)가 루프도 해제.
- **UI**: 활성 루프 인디케이터(프롬프트·간격·틱 카운트·정지). 컴포저 근처 or 채팅 배너.
- **신뢰경계/구조**: renderer 단독(신규 IPC 0 — 기존 sendMessage 재사용). 타이머=컴포넌트/스토어
  effect(reducer 순수성 보존). main/SDK 무변경. 시크릿 0.

### 열린 질문 (plan-auditor)
- interval 없음(self-pace) 기본 동작: 완료직후 연속 vs 기본간격 vs interval 필수.
- 멀티 패널: 패널별 독립 루프(usePanelSession 격리 정합).
- 루프 중 사용자가 다른 메시지 보내면? (큐? 루프 일시정지?)
- 안전 가드: 최대 틱/시간 상한(무한 토큰 소모 방지) — 기본값?
- abort와 루프 해제의 정확한 관계.

### 불변 제약
- 신뢰경계(renderer untrusted·타이머 reducer 밖) · TDD(인터셉트 파싱·틱 스케줄·중단) · reviewer ·
  push 0(인간 게이트) · 한국어 · Worker 보고 직접 검증.
- **ADR 필요**: `/loop` 클라이언트 인터셉트 → 앱 레벨 재호출 결정(SDK 네이티브 /loop이 세션 크론
  의존이라 우리 구조 불가 → 자체 구현). ADR-019(슬래시) 계열, 초안 사용자 게이트.

## ✅ 확정 설계 (plan-auditor 감사 완료 — 2026-06-26)

plan-auditor가 실제 코드 대조로 설계 승인 + 5개 질문 확정 + 3개 🔴 회귀 리스크 적시. 상수·구조 확정:

**상수**(`src/renderer/src/lib/loopCommand.ts`): `LOOP_DEFAULT_INTERVAL_MS=5000`(Q1 self-pace 기본
5초) · `LOOP_MAX_INTERVAL_MS=6h`(거대 interval 클램프) · `LOOP_MAX_TICKS=50` · `LOOP_MAX_DURATION_MS=30분`.

**5개 질문 확정**:
- **Q1 self-pace 기본** = (b) **5초 간격 후 재실행**(런어웨이 방지 + 정지 개입창 확보). 측정가능 상수.
- **Q2 멀티 격리** = 패널별 독립 루프. **단일=`appStore.activeLoop`** · **패널=`PanelView` 컴포넌트
  로컬**(`useState`/`useRef`). ⚠️ `panelReducer`에 루프 상태 주입 금지(순수성 — RESTORE/APPLY_EVENT 계약).
- **Q3 루프 중 사용자 입력** = 기존 `queue`에 적재(루프 유지). 드레인 effect에서 **사용자 큐 우선 →
  비면 루프 틱** 단일 우선순위(같은 idle 전이 경합 제거).
- **Q4 안전가드** = `MAX_TICKS=50` + `MAX_DURATION=30분` 이중 상한, 먼저 도달 쪽 자동정지 + 1회 알림.
- **Q5 abort↔루프** = abort = 루프도 즉시 해제(`clearTimeout`+`activeLoop` 클리어). 정지 3경로
  (인디케이터 버튼 · `/loop stop`·`/loop off` · abort)를 **단일 `stopLoop()` 액션으로 수렴**.

**3개 🔴 (구현 필수 반영)**:
1. **SDK 누수 차단** — `/loop`·`/loop stop` 인터셉트를 `dispatchSend`/`handleSend` **최상단**(`commandOf`·
   `sendMessage` 진입 전)에 둠. `commandOf`(cmdCards)는 미등록 슬래시를 평문 SDK로 보냄(실증) → 누수 위험.
2. **드레인↔틱 경합** — 기존 드레인 effect(`Conversation.tsx` L514-521)와 루프 틱이 동일 `isRunning`
   true→false 전이를 노림 → **단일 effect로 통합 + 큐 우선순위**.
3. **abort 잔류** — `abortRun`은 `queue:[]`만 비움 → setTimeout·`activeLoop` 살아남아 부활 →
   abort에 `stopLoop()` 동반 + 타이머 정리 effect(`activeLoop` 변화 감시 → `clearTimeout`).

**순수 분리(TDD 핵심)**: 파싱·상태판정을 순수 함수로 추출 → `parseLoopCommand`·`decideLoopTick`
(`loopCommand.ts`)는 window.api/타이머 무관, Vitest node 단언. 컴포넌트 effect는 얇은 와이어링만.

**상태 타입**(`ActiveLoop`, loopCommand.ts 정의 → appStore import): `{prompt, intervalMs, picker?,
tickCount, status:'running'|'stopped', stopReason?, startedAt}`. 휘발(영속 X·snapshot 제외).

**🟡 주의**: 재마운트 시 `prevRunningRef` 재초기화로 done 전이 놓침(상시 마운트 전제 — 멀티는 패널
로컬로 완화) · PRD/FEATURE_MAP에 "Track 2 확장" 1줄 추적.

## 구현 순서 (확정)
1. ~~plan-auditor 감사~~ ✅ 완료.
2. 파싱·판정 순수함수(TDD): `parseLoopCommand`(interval/stop/invalid) + `decideLoopTick`(가드) + 상수.
3. appStore 상태·액션(TDD): `activeLoop` + `startLoop`/`tickLoop`/`stopLoop`/`dismissLoop` + abort/clear 연동.
4. Conversation 와이어링: `/loop` 인터셉트(최상단) + 드레인·틱 통합 effect + 타이머 정리 + 인디케이터 UI.
5. 멀티 패널: `PanelView` 로컬 루프(handleSend 인터셉트 + 패널 effect + 인디케이터).
6. 라이브 검증: 짧은 interval로 2~3틱 실제 반복 + 정지 3경로 + 가드 상한(LIVE_SDK e2e).
7. ADR 초안(사용자 게이트).

## 핵심 파일
- `src/renderer/.../components/Conversation.tsx`(dispatchSend 인터셉트)·`MultiWorkspace.tsx`(handleSend)
- `src/renderer/.../store/appStore.ts`·`panelSession.ts`·`reducer.ts`(activeLoop 상태·틱)
- 신규 루프 인디케이터 컴포넌트 + 파서 유틸(`src/renderer/.../lib/`)
- 참조: 이 문서 + 프로브 `artifacts/loop-probe.mjs`(gitignore). SDK 사실=claude-code-guide 권위 확인됨.
