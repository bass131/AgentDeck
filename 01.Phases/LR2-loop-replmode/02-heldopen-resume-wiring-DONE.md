---
owner: 영호
milestone: LR2
phase: 02
title: held-open 경로 resumeSessionId 배선 — 완료 보고 (-DONE)
status: done
grade: 복잡 → 실측 후 단순 강등 (본체 배선 기존재 확정 — 테스트 고정 + 라이브 probe만)
date: 2026-07-03 (야간 무인)
summary: go/no-go probe 결과 GO — 단, "배선 추가"가 아니라 "배선이 이미 존재함"을 실측으로 확정. 실 SDK가 resume+persistent(AsyncIterable prompt) 동시 지정을 수용하고 재시작 후 맥락을 복원함을 라이브로 검증. 앱 소스 0줄 변경, 계약 고정 테스트 2건 추가.
---

# LR2 Phase 02 — held-open 경로 resumeSessionId 배선 완료 보고

> 브랜치 `feature/lr2-loop-replmode` · 야간 무인(overnight-0703) [야간5] · 앱 소스 변경 **0줄**.

## ① 무엇을 / 왜
옵트인 held-open(자율 루프 /goal·/loop용)이 **앱 재시작 후 이전 세션으로 되살아나는지** 확보.
Phase 정의의 전제: "sdkOptions.ts resume 매핑이 단발 경로에만 적용" → held-open 경로로 확장 필요.
Phase가 명시한 공식 게이트: **probe 선행** — `resume + persistent` 동시 지정 시 SDK 거동 실측 후 GO/NO-GO.

## ② 어떻게 (실측 결과 — Phase 전제가 stale이었음)
**probe 결론: GO. 단, 본체 배선은 이미 존재** — 3층 모두에서 확인:

| 층 | 실측 근거 |
|---|---|
| SDK 타이핑 | `sdk.d.ts`: `resume`의 배타 제약은 `continue`·`sessionId`(forkSession 없이)뿐 — **AsyncIterable prompt(스트리밍 input)와의 배타 없음** |
| 어댑터 | `_runPersistentPump`(claudeAgentRun.ts:576) → `_prepareQuery`(:378) → **공용** `buildClaudeSdkOptions`(sdkOptions.ts:237 resume 매핑) — RF1 분해 때 두 펌프가 빌더를 공용화하면서 held-open도 자연히 resume을 받음. 빌더 단위 회귀고정은 LR1 Phase 01의 `lr1-resume-bug-held-open-resume.test.ts`가 이미 보유("후보② 반증") |
| renderer | `runtime.ts:147` — `resumeSessionId`는 replMode와 무관하게 항상 전송, persistent와 병행 |

Phase 정의 자체도 "(현재 단발 경로만인지 실측 후 수정)"으로 hedge — 실측이 전제를 뒤집었고, 남은 갭은 **검증 공백**뿐이었다:

1. **펌프 수준 계약 미고정** → `persistent-pump.test.ts`에 **PP6** 추가(2 tests): `backend.start({persistent:true, resumeSessionId})` → mock queryFn이 받는 `options.resume` 도달 + AsyncIterable prompt 유지 / resumeSessionId 미전달 시 resume 키 없음(회귀 0). 기존 빌더 단위 테스트와 달리 **펌프→queryFn 경계 전체**를 고정.
2. **실 SDK 거동 미검증** → 신규 라이브 probe `lr2-02-heldopen-resume-restart.e2e.ts`(LIVE_SDK 옵트인).

## ③ 검증 (기계 게이트)
- PP6 **즉시 GREEN**(배선 기존재의 기계 확인) · 전체 **3893 test green**(253 files) · typecheck 0 · lint 0.
- **라이브 probe GO**(probe 3/12): 1차 REPL ON → 코드워드 `PERSIMMON91HR` 심기 → held-open 세션에서 sessionId 디스크 영속 확인(`5f36f1f5-…`) → **앱 완전 종료** → 2차 재시작 → 대화 복원 → REPL ON 재수립 → 회상 질문 → **응답 = `PERSIMMON91HR` 정확 회상**(51s). 실 SDK가 resume+persistent를 수용·복원함을 end-to-end 확정.
- reviewer: 1차 시도가 세션 한도(6:20am 리셋)에 걸려 재실행 — 결과는 커밋 메시지·아침 보고에 반영.

## ④ 트레이드오프 / 미해결
- **held-open "복원"의 의미**: 되살아나는 것은 **대화 맥락**(SDK 세션 히스토리)이지, 죽은 프로세스의 in-flight 턴이 아니다. 재시작 시점에 돌던 턴의 미완 출력은 유실(설계상 당연 — 세션 resume은 히스토리 복원).
- **백로그 ⑥과 연결**: replMode 토글이 인메모리라 재시작 후 사용자가 REPL을 다시 켜야 held-open이 재수립됨(자동 아님). 토글 영속(setPref 확장)은 영호 결정 대기 — 이 Phase 범위 밖.
- Phase 정의의 "resume 매핑 확장" 작업 항목은 **불필요로 판명** — 코드 변경 없이 완료 조건("held-open + resumeSessionId 동시 지정 시 SDK에 resume 전달 — 테스트 green") 충족.

## ⑤ 다음
- [야간6] LR2-04 — held-open sessionKey 안정화(고아 누수 제거).

## 🎓 배운 것
1. **Phase 정의도 실측 대상.** "단발 경로에만"이라는 전제는 RF1 분해 이전 코드 기준의 stale 서술 — 착수 전 정찰이 "구현 Phase"를 "검증 Phase"로 바꿨다(불필요한 backend-contract 변경 회피).
2. **같은 계약도 층마다 고정할 가치가 다르다.** 빌더 단위(LR1) 테스트가 있어도 펌프→queryFn 경계는 별도 고정해야 "펌프가 req를 가공해 떨어뜨리는" 회귀를 잡는다.
3. **go/no-go probe의 진짜 산출물은 방향 전환.** GO/NO-GO 이분법 밖의 제3 결과("이미 됨")도 있다.

## 산출물
- 테스트: `99.Others/tests/agents/persistent-pump.test.ts`(PP6 +2) · `99.Others/tests/e2e/lr2-02-heldopen-resume-restart.e2e.ts`(신규, LIVE_SDK).
- 앱 소스: 변경 없음.
