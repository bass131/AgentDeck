---
owner: 영호
milestone: LR3
phase: 02
title: AUTO 세션 수명 — 활동 기반 held-open (idle 자동 정리) + ADR-024 재재고 초안
status: done
grade: 복잡
risk: backend-contract
loop_track: human-gate
estimated: 3~5h
domain: agent-backend
summary: 영호 재결정(2026-07-03 — "평소엔 가볍게, 루프 쓸 때만 ON"): 기본값 ON/OFF 양자택일 대신 **세션 수명 = 활동 스코프**. 모든 턴을 held-open으로 시작하되, 턴 경계(done)에서 예약 활동(크론·웨이크업·pending)이 없으면 세션을 즉시 닫는다(다음 턴은 resume). 승격 타이밍 문제 원천 소멸 — 자연어 루프도 응답 도중 세션이 살아있어 예약 생존. ADR-024 재재고 초안 = "제3의 답"(확정=영호). renderer 기본값 flip·prefs는 P03로 이동.
---

# Phase 02: AUTO 세션 수명 (활동 기반 held-open)

> **상태**: pending
> **마일스톤**: LR3
> **등급**: 복잡 (기본 보통 + backend-contract 상향 — `01_agents/**` 세션 수명 변경)
> **담당**: agent-backend Worker — **ADR-024 최대위험 구역 인접: agent-runs.ts 무변경 전략**

---

## 🎯 목표

persistent 세션이 **턴 경계에서 "살아있을 이유"가 없으면 스스로 닫힌다** — 평소 대화의
자원 프로필은 단발+resume과 동등하고, 루프가 예약된 대화만 세션이 상주한다. "필요할 때
켜는"(승격 — 타이밍 문제) 구조가 아니라 "필요 없을 때 끄는"(강등 — 턴 경계, 정보가 모인
뒤) 구조라 판정이 항상 안전한 쪽에 있다.

## ⏪ 사전 조건

- [ ] Phase 01 완료 — 특히 **(d) idle-close 후 resume 무결성**·턴당 오버헤드 실측,
      (b) 잔존 세션 거동(엣지 처리 입력).
- [ ] **Phase 04 완료 — idle 판정의 신호원**: wakeup 트래킹 없이 idle-close를 켜면
      self-paced 루프(ScheduleWakeup 대기)를 활동 없음으로 오판해 세션을 닫아버린다.
      hasActivity가 크론+웨이크업 양쪽을 포괄한 뒤에만 본 Phase 활성화.

## 📝 작업 내용

- [ ] **펌프 idle-close**: 지속 펌프(claudeAgentRun `_runPersistentPump`)의 턴 경계
      처리에서 — done push 후 `pendingSends === 0 && !cronTracker.hasActivity()`이면
      입력 스트림(`_inputGen`)을 정상 종료 → **기존 스트림 자연종료 정리 경로가 그대로
      처리**(agent-runs.ts finally→cleanup — 🔴 최대위험 파일 0줄 변경 전략, LR2-04 미러).
- [ ] **살아있을 이유 신호의 단일화**: `hasActivity()`(CronTracker — P04에서 wakeup도
      합류) + pending-send 카운터를 idle 판정의 단일 소스로. 이유가 사라지는 이벤트
      (CronDelete·루프 소멸) 후 *다음 턴 경계*에서 닫힘을 계약으로.
      **[재검증 🟡] 접근 경로 명시**: `_cronTracker`는 RunEventNormalizer private —
      `eventNormalizer.ts`에 공개 passthrough(예: `hasLoopActivity()`) 1개 추가해 펌프가
      소비(01_agents 도메인 내 — "agent-runs.ts 0줄" 계약 유지, private 우회 접근 금지).
- [ ] **닫힌 세션의 후속 턴**: renderer는 기존대로 `persistent:true + sessionKey +
      resumeSessionId` 전송 → main `persistentRuns` miss → 새 held-open이 resume으로
      맥락 복원(기존 경로 그대로 — 신규 IPC 0). 계약 테스트로 고정.
- [ ] **엣지 계약**: interrupt(세션 유지가 원칙이나 활동 없으면 다음 경계에서 닫힘 OK) /
      bg 대화(P3b bgRuns — 동일 규칙 적용, resume 복귀 보장) / 권한·질문 대기 중(턴
      내부이므로 idle 판정 비대상) / **[재검증 🟡] LR2-04 선저장 경로와의 상호작용 회귀
      1건**(선저장으로 키 확정된 대화가 idle-close 후에도 후속 턴 동일 sessionKey +
      resume 정상) / **[재검증 🟡] 멀티패널·비가시 패널의 idle-close → 복귀 resume 연속**
      (bg 엣지의 패널 판본 — P07이 이 위에서 지어짐, P07 회귀 목록에도 명시) — 각각 단위 테스트.
- [ ] **ADR-024 재재고 초안**(`_adr-024-rerethink-draft.md`): held-open vs resume
      양자택일이 아닌 **"세션 수명 = 활동 스코프"라는 제3의 답**으로 서술.
      **[plan-auditor 🟡-2] 직전 flip(2026-07-01)의 핵심 근거("PC 종료/절전 시 held-open
      증발", ADR.md:218~221)를 인용해 정면 반박** — ① 맥락은 resume 백스톱이 해결(LR2-02
      실증) ② 상주 비용은 활동 스코프가 해결 ③ 남는 순가치 = 자율 루프. 트레이드오프
      (수명 로직 복잡도·위험구역 인접) 명기. **ADR.md 본문 반영은 영호가 직접**.
- [ ] **[팽창 상한 — plan-auditor 🟡-1 승계]** 엣지 처리가 펌프 밖(agent-runs.ts 본문
      등) 변경을 요구하면 본 Phase에 우겨넣지 않고 **정지·영호 보고**(🔴 구역 게이트).

## ✅ 완료 조건

- [ ] 펌프 계약 테스트: ① 활동 없는 done → 스트림 종료·정리 ② activeLoops 있는 done →
      세션 유지 ③ 루프 소멸 후 다음 done → 종료 ④ 닫힌 뒤 후속 턴 → 새 세션 + resume
      맥락 복원(4경로 GREEN).
- [ ] **라이브 probe 2종** (수용신호 고정 — 재검증 🟡): (i) 일반 대화 2턴 — **턴 사이
      `persistentRuns` 제거 발생 + 후속 턴이 이전 session_id를 resume으로 재사용**(P01-(d)
      확립 관측법 인용) (ii) 자연어/슬래시 루프 — 예약 생존 + 턴 경계 넘어 세션 유지 +
      정지 후 자동 정리.
- [ ] `agent-runs.ts` diff 0줄 실측(git) — 위험구역 무변경 전략 준수.
- [ ] `npm run typecheck` 0 · `npm run test` green · `npm run lint` 0.
- [ ] **reviewer 무조건**(backend-contract) + **영호 GO 2개**(human-gate): ADR 초안 확정 ·
      커밋 승인.

## 📚 학습 포인트

- **승격 vs 강등의 비대칭** — 정보가 부족한 시점(요청 전)에 켜기로 결정하는 것보다,
  정보가 모인 시점(턴 경계)에 끄기로 결정하는 게 구조적으로 안전한 이유.
- **수명(lifecycle)을 상태가 아니라 파생으로** — "모드 플래그"를 저장하는 대신 "살아있을
  이유의 존재"에서 수명을 파생시키면, 플래그-현실 불일치 버그 클래스가 사라진다.

## ⚠️ 함정

- **ADR-024 🔴 최대위험 구역 인접** — 구현 지점을 펌프 내부로 한정(스트림 자연종료 유도),
  agent-runs.ts 직접 수정 금지. 넘게 되면 정지·보고(작업 내용 마지막 항목).
- 크론 틱이 *막 발화하려는 순간*의 idle-close 경합 — 크론 예약 존재는 hasActivity에
  잡히므로 안전하나, 트래커 파싱 실패로 활동을 놓치면 루프가 죽는다(P04 graceful-[]와
  상충 주의: 파싱 실패 시 보수적으로 "활동 있음" 처리 검토).
- bg 대화의 idle-close가 P3b seamless 복원과 얽히는 지점 — bg에서 닫혀도 복귀 시 resume
  경로가 동작함을 테스트로 고정.

## 담당 SubAgent

agent-backend Worker. reviewer 무조건. **영호 GO 게이트 2개**(ADR 확정·커밋 승인).
renderer 쪽 부속(기본값 flip·prefs)은 P03로 분리(도메인 순수성 유지).

## ✔ 구현·검증 기록 (2026-07-03 — 영호 GO 2건 승인: ADR 초안 확정·커밋)

- 구현: `_idleClosing` 플래그(abort와 분리된 순수 강등 경로 — AbortController·권한취소·
  abortCleanup 미개입) + 펌프 done 블록 idle 판정(`pendingSends===0 && !hasLoopActivity()`)
  + `eventNormalizer.hasLoopActivity()` 공개 passthrough. **agent-runs.ts diff 0 실측**.
- 테스트: 신규 8건(IC1~4 + interrupt·권한대기·멀티패널 엣지) + 기존 2파일 정합화
  (reviewer 라인 대조 — "계약 약화 아님" 판정) + 🟡-2 봉합 3건(보수 폴백).
- **라이브 probe 2종 PASS**: (i) 무활동 done → **688ms 자연종료**(abort 없이) + 후속 턴
  이전 session_id resume 회상(ORBIT77P02) (ii) wakeup armed → done 후 12s 창 세션 유지.
- 게이트: typecheck 0 · lint 0 · test **3938 green** · reviewer **통과**(🔴 0 · 🟡 3).
- reviewer 🟡 처리: **🟡-2(파싱 실패 시 루프 사망 증폭) = 즉시 봉합** — resolvePending에
  ok 전달, ok:true+형식 이탈이면 tool id 보수 폴백 활성 등록(hasActivity 유지+배너 표시,
  LT3 계약 갱신). **🟡-1(μs 창 push 유실 — 인간 속도 도달 불가) · 🟡-3(bf1 단언 진단력)**
  = 백로그 기록.
