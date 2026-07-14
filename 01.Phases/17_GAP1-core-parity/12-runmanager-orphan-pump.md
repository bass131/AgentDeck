---
owner: 영호
milestone: GAP1
phase: 12
title: RunManager 에러 후 고아 pump 종결 (+grace-expired 오방출)
status: done
grade: 복잡 (보통 + backend-contract 깃발 자동 상향)
risk: backend-contract
loop_track: auto-gate
estimated: 1~3h
domain: cross
summary: Codex triage High(2026-07-14) — persistent 세션 error 시 RunManager가 registry 정리 후 run.abort() 미호출(agent-runs.ts:223-255), backend pump는 _aborted=false로 입력·자율 이벤트를 계속 기다리는 orphan 세션 도달 가능. + Low 동봉: stream throw 시 finally가 grace timer 존재만으로 grace-expired를 오방출(claudeAgentRun.ts:1171-1186 — 계약상 자연종료 의미와 불일치). P11 뒤·P09 전(수명 정합 이중 churn 방지).
---

# Phase 12: RunManager 에러 후 고아 pump 종결

> **상태**: pending
> **마일스톤**: GAP1
> **등급**: 복잡 (backend-contract → reviewer 무조건)
> **담당**: coordinator 경유 — main-process(agent-runs) + agent-backend(claudeAgentRun) + qa. reviewer 무조건
> **실행 순서**: P11 직후 · P09 전

---

## 🎯 목표

에러로 끝난 persistent 세션의 pump가 유령으로 남지 않게 한다. 끝나면: error 종결 시 RunManager가 run을 명시적으로 abort하고, pump·SDK query가 종료되며, 동일 sessionKey 재시작이 단일 활성 run만 남긴다. 부수: stream throw 시 grace-expired 오방출 제거(error/done만).

---

## ⏪ 사전 조건

- [x] Codex triage(High) + 독립 reviewer 동의(2026-07-14) — 앵커: `agent-runs.ts:223-255`(terminal cleanup, abort 미호출) · `claudeAgentRun.ts:665-695`(detached producer) · `claude-stream.ts:527-545`(error result → error+done 정규화) · `claudeAgentRun.ts:1171-1186`(finally grace-expired)
- [ ] P11 완료·커밋(claudeAgentRun 직렬)

---

## 📝 작업 내용

- [ ] **(a) TDD RED (공개 관찰면 명세)** — persistent is_error result → RunManager terminal cleanup 후 4단정, 각각 공개 관찰면 고정(P11 repro의 관찰점 열거 방식): ① run abort 신호 = mock QueryFn의 abort signal 발화 관찰(또는 park된 inputIter의 done resolve) ② pump/query 종료 = events async-iterator의 return 관찰 ③ 후행 방출 0 = events 스트림 필터로 tool/permission 이벤트 0 단정 ④ 활성 run 1개 = 동일 sessionKey 후속 전송 시 backend.start 호출 수(P11(d) 방식). 현행 RED 확인이 출발점 — private 상태 단정 금지
- [ ] **(b) RunManager 종결 배선** — error terminal 경로에서 run.abort() 호출(또는 등가 종료 계약). consumer 조기 return과 producer 수명 연동
- [ ] **(c) grace-expired 오방출 봉합** — stream throw 경로에서 grace timer 잔존만으로 grace-expired 방출 금지: throw 시 error/done만. 수용조건 = "grace pending 중 stream throw → grace-expired 0" **companion 회귀 단정 필수**: "grace pending 중 스트림 *자연종료*(throw 아님) → grace-expired 1 보존" — 자연종료 시 grace-expired는 LR4 P03 정당 거동이므로, 순진한 finally 방출 제거(과억제)가 이 단정에서 RED가 나야 한다
- [ ] **(d) 회귀** — P04b 9종·gap1-p10 잠금·P11 회계 불변식 GREEN 유지

---

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 · `npm run lint` 0 · `npm run test` 전체 green(신규 RED→GREEN, 회귀 0)
- [ ] orphan 종결 4단정(위 (a)) + grace-expired 오방출 0 단정
- [ ] reviewer 통과 (backend-contract 무조건)
- [ ] reviewer 실측: orphan 봉합 무력화(abort 배선 제거) 시 (a) 단정이 RED가 됨을 mutation 프로브로 판별력 실증

---

## ⚠️ 함정

- **정상 종료 경로 오폭 금지** — abort 배선이 정상 done·idle-close 경로의 수명을 건드리면 P04b 회귀. error terminal에 한정
- **P09 조율** — 백그라운드 셸 tail(P09)이 run 수명·이벤트 스트림에 얹히므로 본 Phase가 먼저 수명 계약을 안정화
- **abort 배선 상호작용 reviewer 체크리스트** — error-terminal의 cleanup(done=true·레지스트리 삭제) 후 abortFn() 추가가 consumer 조기 break(agent-runs.ts:243)·onSessionClosing 라우팅(:216-220)·abort()의 onSessionClosing 미발화(claudeAgentRun.ts:457) 계약과 이중발화 없이 맞물리는지 reviewer가 실측 확인
