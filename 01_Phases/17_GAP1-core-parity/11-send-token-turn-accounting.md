---
owner: 영호
milestone: GAP1
phase: 11
title: send-token 턴 귀속 회계 — 자율 턴 done의 pending 탈취 봉합
status: done
grade: 복잡 (보통 + backend-contract 깃발 자동 상향)
risk: backend-contract
loop_track: auto-gate
estimated: 2~4h
domain: cross
summary: Codex 교차 검증 반증 + qa 실측 5/5 일치(2026-07-14) — turnOrigin이 done 도착 시점 _pendingSends로 재계산되어(claudeAgentRun.ts:1030) 자율 턴 A의 done이 user 오분류·사용자 턴 B의 pending 탈취(1→0)·stale idle grace 예약·실행 중 B 세션 조기 close. 봉합 = Codex B안: 어댑터 내부 send-token 턴 귀속 회계(queued→delivered→owned→completed), done은 자기 turn epoch 귀속 token만 완료. IPC 계약 불변. origin/CronTracker/자율 상한 오염(리스크1)도 동일 뿌리라 본 Phase에 흡수.
---

# Phase 11: send-token 턴 귀속 회계

> **상태**: done — send-token 수명 회계로 turnOrigin 도착 시점 재계산(:1030) 제거, done은 자기 epoch 귀속 token만 완료. 어댑터 내부 100%(shared/IPC 무접촉). repro 1/1·불변식 12/12·mutation 2종 RED flip·RunManager companion 3/3 GREEN, reviewer 🟢(CORE 위반 0, LR4 보존). 게이트 4905pass/0fail/8skip
> **마일스톤**: GAP1
> **등급**: 복잡 (backend-contract → reviewer 무조건)
> **담당**: coordinator 경유 — agent-backend 중심 + qa. reviewer 무조건
> **실행 순서**: P07 직후 · P12·P08·P09 전 (claudeAgentRun 직렬 레인)

---

## 🎯 목표

"done이 누구의 send를 완료할 권리가 있는가"를 바로잡는다. 끝나면: 자율 턴 A의 늦은 done이 사용자 턴 B의 pending을 훔치지 못하고, done.origin이 항상 실제 턴 소속을 반영하며, repro 테스트(gap1-p11-autonomous-done-theft — 현행 RED 실측 완료)가 GREEN 회귀 잠금으로 뒤집힌다.

---

## ⏪ 사전 조건

- [x] 반증 실증 — Codex 정적 트레이스 + qa 실측 repro 5/5 예측 일치(2026-07-14). repro 파일 = `99.Others/tests/agents/gap1-p11-autonomous-done-theft.repro.test.ts`(untracked, 본 Phase에서 편입·커밋)
- [x] 결함 앵커 — turnOrigin 재계산 `claudeAgentRun.ts:1030` · decrement `:1076-1082` · idle 재트리거 `:1054-1062` · 만료 재확인 `:635-640`
- [ ] P07 커밋 완료(2c77073) · working tree clean 상태에서 착수

---

## 📝 작업 내용

- [ ] **(a) repro 편입** — 기존 repro 테스트를 그대로 유지(안전 기대값 단정). 봉합 후 자동 GREEN = 회귀 잠금 전환. 트리비얼 우회 금지
- [ ] **(b) send-token 회계 구현** — push/초기 입력마다 로컬 sendSeq 발급, token 수명 `queued → delivered(_inputGen yield) → owned(turn epoch) → completed`. done은 **자기 epoch에 귀속된 token만** 완료(무토큰 epoch의 done은 어떤 token도 소비 불가). idle-close 게이트는 outstanding 전체(queued+delivered+owned)를 사용해 기존 S1 보호 유지. **어댑터 내부 회계 — shared/IPC 계약 확장 금지**
- [ ] **(c) origin 산출 교체** — turnOrigin을 도착 시점 카운터 재계산(:1030)이 아니라 token 귀속으로 산출: 귀속 token 있으면 user, 없으면 cron. CronTracker 턴 종료 판정·자율 상한 리셋 정합 동반 확인
- [ ] **(d) RunManager companion** — 조기 close로 인한 라우팅 소실의 제품 파급 단정: 동일 sessionKey로 후속 전송 시 `backend.start` 1회(기존 run 재사용) 유지
- [ ] **(e) 회귀 전수** — 아래 완료 조건의 회계 불변식 7항 + P04b 9종 + gap1-p10 잠금 GREEN

---

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 · `npm run lint` 0 · `npm run test` 전체 green(repro GREEN 전환 포함, 회귀 0)
- [ ] 회계 불변식: ① B가 A done 전후 어느 쪽에서 pull돼도 A가 B token 완료 불가 ② 연속 push 2건 = 각 사용자 done과 1:1 완료 ③ autonomous done = 항상 무토큰·origin:'cron' ④ interrupt-result는 귀속 token만 1회 완료, throw 경로 잔여 token 0 ⑤ resume·신호 미수신 fallback에서 token 보존 ⑥ isReplay 메시지 제거가 token/epoch 비진행 ⑦ done.origin·CronTracker loop 제거·autonomous cap 증감 단정(리스크1 흡수)
- [ ] reviewer 실측 확인: repro가 봉합 코드로 GREEN이 되고, mutation 프로브(token 귀속 무력화 시 RED)로 잠금 판별력 재실증
- [ ] reviewer 통과 (backend-contract 무조건)

---

## 📚 학습 포인트

- **하나의 카운터에 겹친 4역할** — `_pendingSends`는 큐 생존·origin 판별·idle-close·자율 상한을 겸했다(claudeAgentRun.ts:253-308). 역할이 겹친 상태는 한 소비자의 감소가 다른 소비자의 전제를 깨는 결합 버그의 온상.
- **내부 합의의 공동 맹점** — P10의 3자(Worker 2+reviewer) 일치 판정이 같은 픽스처 전제(사용자 턴 조합)를 공유해 자율 턴 조합을 놓쳤고, 외부 엔진(Codex) 교차 검증이 이를 적발했다. 합의의 수가 아니라 전제의 다양성이 검증력을 만든다.

---

## ⚠️ 함정

- **LR4 정당 거동 보존** — push의 grace 즉시 취소·재시작과 자율 상한 리셋(:518-549)은 사용자 개입 의미라 그대로 유지. 봉합은 done의 완료 권리 쪽이다
- **idle 게이트 조건 치환 주의** — `_pendingSends===0` 검사들을 outstanding 전체로 치환할 때 P04b 9종의 각 시나리오 의미 보존 확인
- **mutation 판별력 재실증 의무** — P10 잠금 테스트의 교훈(좁은 fixture의 mutation 통과 ≠ 결론 전체 증명)
- **shared 계약 확장 금지** — turnId류 필드 추가는 이미 기각된 설계(P10 철회). 회계는 어댑터 내부에서만

---

## ✅ 완료 기록 (2026-07-14)

**봉합 기제**: send-token 수명(queued → delivered → owned → completed)으로 "done이 누구의 send를 완료하는가"를 토큰 귀속으로 판정. owned 앵커(`_anchorTurnEpochStart`, turn epoch당 1회)로 token을 자기 epoch에 고정하고, done은 자기 epoch에 귀속된 token만 완료(무토큰 epoch의 done은 어떤 token도 소비 불가). idle-close는 outstanding 전체(queued+delivered+owned) 게이트로 기존 S1 보호 유지. 어댑터 내부 100% — shared/IPC 계약 무접촉.

**검증**:
- repro(`gap1-p11-autonomous-done-theft.repro.test.ts`) 1/1 GREEN — 안전 기대값으로 회귀 잠금 전환
- 회계 불변식 12/12 GREEN
- mutation 프로브 2종 RED flip 실증 — token 귀속 무력화 시 RED, byte-identical 복원으로 판별력 재실증
- RunManager companion 3/3 GREEN(`gap1-p11-runmanager-session-routing.test.ts`) — 동일 sessionKey 후속 전송 시 `backend.start` 1회 유지
- reviewer 🟢 — CORE 위반 0, LR4 정당 거동(push의 grace 취소·자율 상한 리셋) 보존
- 게이트 수치: typecheck 0 err · lint 0 err · test 4905 pass / 0 fail / 8 skip

**①a 픽스처 정정 결정**: 기존 mock이 스펙 모순(plan-auditor 판정)으로 판명 → 실 SDK fixture(gap1-p03 probe-2b: running → result → idle 순서)를 준거로 mock에 running_A 이벤트를 편입 정정. 영호 GO(2026-07-14, 옵션1). 이 정정으로 직전 4904p/1f가 4905p/0f로 수렴.

**후속(비차단) reviewer 🟡 2건**:
- line1113 grace-active 게이트를 origin 기반으로 정밀화 + 테스트 핀
- line992 `?? null` desync를 dev-assert로 하드닝
