# LR3 P01 — 루프·세션 거동 실측 결과 (probe findings)

> 실측일: 2026-07-03 · 하네스: `99.Others/tests/agents/lr3-p01-probe.live.test.ts`(c·d) ·
> `99.Others/tests/e2e/lr3-p01b-stale-session.e2e.ts`(b) · `lr1-singlechat-sessionid.e2e.ts` 재실행(a).
> 앱 코드 변경 0 (probe 하네스·본 문서만).

## (a) REPL OFF "지속처럼 보임" 경로 — ✅ GO (가설 확정)

- **재현**: `lr1-singlechat-sessionid.e2e.ts` (LIVE_SDK=1) 재실행 — OFF 단발 턴 →
  sessionId 영속(`1e232ce5…`) → 앱 재시작 → 코드워드 질문.
- **관측**: 2차(재시작 후) 응답 `BANANA77SC` — 코드워드 회상 성공, PASS 56.7s.
- **판정**: OFF에서 "지속 세션처럼 동작"의 정체 = **매 턴 `resumeSessionId`로 디스크(JSONL)
  대화 복원**. held-open 없이도 *맥락*은 온전. OFF가 못 하는 것은 자율성(크론·웨이크업의
  프로세스 생존)뿐 — P02 ADR 초안의 사실 기반.

## (d) idle-close 후 resume 무결성 + 턴 기동 오버헤드 — ✅ GO (AUTO 전제 확정)

- **재현**: persistent 턴1(코드워드 심기) → 세션 종료(닫힘 시뮬) → 새 persistent 세션
  `resumeSessionId`로 회상 질의 → 단발 비교군.
- **관측**:
  | 경로 | 첫 이벤트까지 |
  |---|---|
  | persistent 신규 기동 | 1223ms |
  | persistent 재수립 + resume (닫힌 뒤 후속 턴) | **1239ms** — 코드워드 `MANGO42LR3` 회상 ✅ |
  | 단발 + resume (비교군) | 1251ms |
- **판정**: **차이 ±30ms — persistent 기동과 단발 기동은 사실상 동등 비용.** P02 AUTO
  ("모든 턴을 held-open으로 시작, idle 시 닫기 → 평소 자원 프로필 = 단발과 동등")의
  핵심 전제가 실측으로 성립. 닫힌 세션의 후속 턴 resume 무결성도 확인.
- **P02 수용신호 확립**: 라이브 probe는 "턴 사이 세션 제거 + 후속 턴 이전 session_id
  resume 재사용"을 본 하네스 방식(sessionId 캡처→재수립)으로 판정.

## (b) 잔존 held-open·크론 백그라운드 소모 — ⚠ 실재 확정 (누수 클래스)

- **하네스**: REPL ON `/loop 1m` 크론 생성 → OFF 토글+새 메시지 → "새 대화" 전환 →
  preload raw 이벤트 카운터(`window.api.onAgentEvent` — renderer 드롭 경로와 독립)로
  150s간 옛 runId 이벤트 증가 관측. PASS 3.3m.
- **관측**: 옛 루프 세션(runId `41c90c49…`) 이벤트 **13 → 23 증가** — OFF 토글·새 대화
  이후에도 `session +3 · text +4 · done +3` = **크론 틱 ~3회가 계속 발화**(1m interval ×
  150s와 정합). 새 단발 run(`6f0ac764…`)은 4에서 정지(정상).
- **판정**: **잔존 크론의 백그라운드 토큰 소모 실재.** 사용자 화면에는 아무것도 안 보이는
  상태(OFF + 다른 대화)에서 옛 held-open 세션이 계속 LLM 호출을 만든다.
- **P02 반영**: 문제의 본질은 *크론이 도는 것*이 아니라 **비가시성**(루프는 원래 백그라운드
  자율이 가치) — ① AUTO에서 "OFF 사각지대" 자체가 소멸(모드 개념 제거) ② 크론 존재는
  hasActivity로 세션 유지 = 의도된 상주, 단 **배너/표시등(P04·P06)으로 반드시 가시화**
  ③ 명시 정지(abort·CronDelete) 후 다음 턴 경계 자동 정리(idle-close)가 유일한 소멸 경로.

## (c) 자연어 루프 요청 시 도구 선택 빈도 — ✅ 3/3 발동 (P05 전제 뒤집힘)

- 프롬프트 3종(가이드 없음, persistent, default 권한 — 하네스가 승인 응답):
  | # | 프롬프트 | 도구 경로 | 루프 도구 | loops 이벤트 |
  |---|---|---|---|---|
  | 1 | "Every minute, check the current time…" (주기 명시·영어) | Skill(/loop)→ToolSearch→Bash→**CronCreate** | ✅ | **1** (배너 성립) |
  | 2 | "Keep watching… at your own pace" (self-paced·영어) | Skill→Bash→ToolSearch→Monitor→**ScheduleWakeup** | ✅ | **0** (비가시) |
  | 3 | "주기적으로 반복해줘: 'PING'…" (한국어) | Skill→**ScheduleWakeup** | ✅ | **0** (비가시) |
- **판정 1 — 자연어 트리거는 이미 잘 작동**: 모델이 자연어에서 `/loop` **Skill을 자기
  선택**("recurring task, so I'll set it up with the loop skill")해 3/3 루프 도구 발동.
  기존 "크론 생성 3회 중 1회" 실측은 *raw 슬래시 커맨드* 조건이었음 — 자연어 조건이 오히려
  더 안정적. **→ P05(가이드) 전제 "대조군 ≤1/3" 불성립. P05 축소/드롭 재검토 필요**
  (단 n=3·명확한 반복 요청 — 모호한 요청("가끔 봐줘")의 빈도는 미측정).
- **판정 2 — wakeup이 자연어 루프의 주 경로(2/3)인데 loops 이벤트 0** = GUI 완전 비가시.
  P04(wakeup 트래킹) 중요도 상승 + **P04→P02 순서 제약 실측 재확인**(트래킹 없이
  idle-close 켜면 이 2/3가 idle 오판으로 사살됨).
- **판정 3 — default 권한 모드에선 Skill·Bash·Monitor가 permission_request 발생** —
  실앱에서 자연어 루프는 사용자 승인 1~3회를 거침(기존 UX 그대로, 자동화 아님에 유의).
- **하네스 교훈(3회 반복)**: ① for-await 데드라인은 이벤트 도착 시에만 평가 → Promise.race
  하드 타임아웃 필수 ② default 모드는 응답자 없으면 permission 행 → 하네스가 respond(allow)
  (bypass 사용 금지 — 권한 분류기 거부 + 측정 충실도) ③ Windows 파일락 → abort 후 2s 대기
  + rmSync try/catch.

## (+) ScheduleWakeup 실 페이로드 형상 (P04 사전조건 — 일회성 캡처, 2026-07-03)

```jsonc
// tool_call (pending 등록 키 = id)
{ "type": "tool_call", "id": "toolu_01NsGa…", "name": "ScheduleWakeup",
  "input": { "delaySeconds": 270, "reason": "사용자가 멈추라고 할 때까지 주기적으로 PING 응답 — …",
             "prompt": "/loop 'PING'이라고만 답하기 (…)" } }
// tool_result (id로 매칭, output은 사람용 문자열)
{ "type": "tool_result", "id": "toolu_01NsGa…", "ok": true,
  "output": "Next wakeup scheduled for 09:02:00 (in 284s). Nothing more to do this turn — …" }
```

- 파싱 재료: `input.delaySeconds`(간격 표기), `input.reason`/`input.prompt`(summary), `ok`(확정).
- 자연어 요청도 모델이 **Skill(loop) 경유 후 ScheduleWakeup** — `/loop` 스킬이 중간에 낌.

## 종합 판정 → 후속 Phase 입력

| 항목 | 판정 | 반영처 |
|---|---|---|
| (a) OFF = 단발+resume 맥락 유지 | ✅ 확정 | P02 ADR 초안 사실 기반 |
| (d) persistent≈단발 기동 비용(±30ms) + 닫힘 후 resume 무결 | ✅ 확정 | P02 AUTO 전제 성립 |
| (b) 잔존 크론 토큰 소모 | ⚠ 실재 확정 | P02 엣지·가시화 정책(본질=비가시성) |
| (c) 자연어 도구 선택 대조군 | ✅ 3/3 (전제 뒤집힘) | **P05 드롭 확정(영호, 2026-07-03)** · P04 중요도↑ |
