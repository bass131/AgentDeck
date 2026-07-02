---
owner: 영호
milestone: LR3
phase: 05
title: 자연어 루프/goal 가이드 — systemPrompt append (어댑터 내부)
status: dropped
dropped_reason: P01-(c) 실측(2026-07-03)으로 전제 붕괴 — 가이드 없이 자연어 3/3 루프 도구 발동(모델이 /loop Skill 자기선택). 가이드 주입=토큰 비용+과발동 위험만 추가. 모호 요청("가끔 봐줘")의 미발동이 운용 중 실제 관찰되면 그 실측과 함께 재상정(영호 확정 — "P05 드롭").
grade: 복잡
risk: backend-contract
loop_track: auto-gate
estimated: 1~3h
domain: agent-backend
summary: "나랑 같이 간단한 loop/goal 수행해보자" 같은 자연어로도 루프·목표 반복이 발동되게 — 어댑터 systemPrompt append에 짧은 루프 가이드 주입(파싱 방식 대신 가이드 방식, 오탐 회피 — 영호 합의 2026-07-03). 발동 시 도구 사용은 P04 트래킹이 GUI로 표면화.
---

# Phase 05: 자연어 루프/goal 가이드

> **상태**: pending
> **마일스톤**: LR3
> **등급**: 복잡 (기본 보통 + backend-contract 깃발 상향 — `01_agents/**`)
> **담당**: agent-backend Worker

---

## 🎯 목표

슬래시 스킬을 몰라도 자연어 요청("이거 반복적으로 확인해줘", "목표 잡고 끝까지 가보자")에서
Claude가 루프 도구(크론/wakeup/goal 자기지속)를 *일관되게* 선택한다. 모델 재량이던 발동
(P01-(c) 실측: 크론 생성 3회 중 1회)을 가이드로 안정화한다.

## ⏪ 사전 조건

- [ ] Phase 01-(c) 완료 — 가이드 없는 상태의 도구 선택 빈도(개선 대조군).
- [ ] Phase 04와 완전 병렬·독립 완료 가능 — 도구 발동 측정은 **main tool_call 이벤트
      로그 기준**(배너 불요, plan-auditor 재검증 반영). 배너 육안 확인은 P04 완료 시 병행(옵션).

## 📝 작업 내용

- [ ] 루프 가이드 문안 작성: 사용자가 반복·주기·목표 지향 작업을 자연어로 요청하면
      (i) 주기 명시 → 크론 예약 (ii) self-pace → wakeup (iii) 목표 달성형 → goal 방식,
      과금 인지·정지 방법 언급 등 — **간결(수 문장), 토큰 비용 최소**.
- [ ] `sdkOptions.ts`(또는 systemPrompt 조립 지점)의 preset append 경로에 가이드 병합 —
      기존 사용자 sysPrompt append와 공존(순서·중복 처리).
- [ ] 적용 조건 판단: held-open(persistent)에서만 주입 vs 항상 주입 — 단발에서 크론은
      세션 종료로 소멸(P01 실측 재확인)이므로 **persistent 한정 주입**을 기본안으로.
- [ ] 단위 테스트: 옵션 빌더 계약 — persistent 시 가이드 포함, 단발 시 미포함,
      사용자 append와 병합 순서.
- [ ] 라이브 대조: 동일 프롬프트 세트로 가이드 전/후 도구 사용 빈도 비교(P01-(c) = 대조군).

## ✅ 완료 조건

- [ ] 옵션 빌더 계약 테스트 green(주입 조건·병합).
- [ ] **[🟡-3 정량 임계]** 라이브 대조: 동일 프롬프트 세트(n≥3)에서 대조군 ≤1/3 →
      가이드 후 **≥2/3** 도구 발동(판정 = main tool_call 이벤트 로그) + **오발동 hard
      게이트: 일반 대화 프롬프트에서 루프 도구 발동 0**(함정의 오발동 조건을 게이트로 승격).
- [ ] `npm run typecheck` 0 · `npm run test` green · `npm run lint` 0.
- [ ] **reviewer 무조건**(backend-contract) — 가이드 문구의 엔진 리터럴이 어댑터 내부에만
      있는지·IPC 계약 무변경 확인.

## 📚 학습 포인트

- **파싱 vs 프롬프트 가이드** — 앱이 자연어를 해석(오탐·유지비) 대신 모델에게 판단 재료를
  주는 접근. LLM 앱에서 "코드로 풀 것 vs 프롬프트로 풀 것"의 경계 감각.
- **대조군 있는 프롬프트 개선** — 가이드 전/후 빈도 비교로 효과를 측정(느낌이 아니라).

## ⚠️ 함정

- 가이드가 길면 모든 대화에 토큰 비용 — 수 문장 상한, persistent 한정.
- 과발동 위험: "loop"라는 단어만 나와도 크론을 만들면 역효과 — 가이드에 "사용자 의도가
  반복 실행일 때만" 조건 명시 + 라이브 대조에서 일반 대화 오발동 0 확인.
- systemPrompt는 로그·저장에 평문 노출 금지(기존 CRITICAL 준수).

## 담당 SubAgent

agent-backend Worker. reviewer 무조건. Phase 03·04와 병렬 가능.
