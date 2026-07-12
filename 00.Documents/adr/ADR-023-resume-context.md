### ADR-023: 턴 간 맥락 복구 — `resume` (ADR-016 개정, REPL 전환 Phase 1) ⭐
**결정**: ADR-016(query()-per-message)을 개정해, 매 턴 새 단발 `query()`를 띄우되 **직전 엔진 세션을 `resume`으로 이어** 턴 간 대화 맥락을 유지한다. 장수 세션(REPL)이 아니라 **단발 호출 + 세션 resume**이다(REPL은 Phase 2, `docs/REPL_TRANSITION.md`).

- **근본 문제(실측)**: 현재 `_runPump`가 마지막 user 메시지만 prompt로 쓰고 `resume`/`sessionId` 미사용(init session_id "무시") → **턴2가 턴1을 기억 못 함**(`artifacts/context-probe.mjs`: 코드워드 BANANA42 망각). 렌더러가 full history를 보내도 백엔드가 마지막 1개만 쓰고 버림.
- **배선(엔진중립)**: ① claude-stream이 `system/init`의 `session_id`를 **중립 `session` AgentEvent**로 표면화 ② 렌더러(reducer `case 'session'`)가 `AppState.sessionId`에 저장(단일=appStore·멀티=panelSession 모두 `applyAgentEvent` 공유 → 자동 양립) ③ 다음 `agentRun`에 `resumeSessionId`(불투명 토큰) 전달 ④ ClaudeCodeBackend가 `req.resumeSessionId` → sdkOptions `resume`로 매핑.
- **방식 선택(실측 택1)**: `resume`(SDK가 세션 맥락 보유 — 토큰 재전송 0) 채택. full-history 재주입은 SDK 입력이 user 메시지만 스트림이라 assistant 턴 재생 불가 → 기각. `forkSession` 미지정(기본 false) → 같은 세션 계속(session_id 턴 간 안정, 프로브 확인).
- **범위(Phase 1)**: 인메모리 연속성(앱 실행 중). 대화 영속에 session_id 저장(재시작 후 resume)은 쉬운 후속. 미전달/빈 → 새 세션(기존 동작 회귀 0).

**이유**: ① 사용자 실측 지적 — "단발 입력이라 맥락 파악 못 하는 것 아니냐"가 사실로 확인됨(대화 메모리 부재가 가장 근본 갭). ② 원본 AgentCodeGUI는 CLI 인터랙티브 세션이라 맥락이 누적 → query()-per-message 무맥락은 호스트 적응의 *부산물*이지 충실도 아님. resume 복구 = **원본으로의 회귀**(ADR-013). ③ 단계적 접근(plan-auditor 강력 권고): 맥락 복구는 펌프 국소 변경이라 run-manager·waiter·세션수명·cron-turn 동시성 **무관** — 위험 작고 즉시 가치. 풀 REPL(장수 세션) 위험은 Phase 2로 격리.

**트레이드오프 / 신뢰경계**: ① ADR-003: `resume`/`forkSession`/SDK 옵션 형상은 ClaudeCodeBackend 어댑터 내부에만 — shared/reducer/renderer는 중립 표현(`sessionId`·`resumeSessionId`·`session` 이벤트)만. session_id는 **불투명 토큰**(엔진 고유 형상 아님)이라 중립 표면화 정합. ② 신뢰경계: `resumeSessionId`는 untrusted renderer 입력 → ipc/index.ts가 `typeof string && length>0` 정규화(임의 값 주입 차단). 시크릿 아님(세션 식별자) — 평문 로그/DB 노출 0. ③ 휘발: `sessionId`는 `snapshotForPersist`/`buildPersistState` 미포함(makeInitialState/clearConversation 리셋). ④ ADR-016 본문(SDK 채택·CLI 제거) 유효 — *호출 패턴*에 resume만 추가(supersede 아님).

**완료조건(측정가능)**: ① 단위 — claude-stream init(session_id)→session 이벤트(`claude-stream.golden`+2). ② 단위 — resumeSessionId→sdkOptions.resume·미전달 시 키 없음·session emit(`tests/agents/resume-session` 4). ③ 단위 — reducer session→sessionId·휘발 리셋·panelSession/appStore resumeSessionId 운반(`tests/renderer/resume-session` 7). ④ 단위 — AgentEvent exhaustive(session 케이스). ⑤ 라이브(LIVE_SDK=1, `context-live.e2e.ts`) — 실 앱 2턴 "BANANA42" 회상. ⑥ typecheck node/web green + reviewer CRITICAL 0 + 기존 회귀 0.

