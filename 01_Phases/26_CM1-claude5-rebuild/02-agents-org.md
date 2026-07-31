---
owner: 유영호
milestone: CM1
phase: 02
title: 조직 — 에이전트 편성 축소 · 실행 차단 폐지 확정
status: pending
grade: 복잡
loop_track: human-gate
estimated: 2h
domain: cross
summary: 10역할 편성을 Opus 5 기준으로 축소하고(시드: 4종), supervisor-guard ②(메인 실행 차단) 폐지를 확정하며, 에스컬레이션 규정집·등급 판정표·모델 티어 표의 처분을 정한다.
---

# Phase 02: 조직

> **상태**: pending · **마일스톤**: CM1 · **등급**: 복잡 · **담당**: 메인 + 영호 (대화 확정) → 격리 서브 (백지 작성)
> ⚠️ **이 Phase부터 새 세션에서 진행** — `_milestone-plan.md` → `_decisions.md` → `_scout-diagnosis.md`를 먼저 읽는다.

## 🎯 목표

새 에이전트 편성(정의 파일들)과 조직 규범(헌법 몇 줄 수준)의 초안이 drafts에 존재하고, supervisor-guard ② 폐지가 결정 로그에 확정된다.

## ⏪ 사전 조건

- [ ] Phase 01 완료 (CORE 재편 — 조직 규범이 참조할 조항 번호 확정)

## 📝 작업 내용

- [ ] **편성 축소 결정** — 시드 제안: ① 범용 Worker(도메인 4종 통합, `claude-opus-5`) ② reviewer(판정 렌즈, `claude-fable-5`) ③ 실측 심부름(Explore/secretary 계열 — 존재 근거는 컨텍스트 격리) ④ chief-tech-operator(영호 승인부 자문). 도메인 경계는 에이전트 정의가 아니라 ARCHITECTURE 문서가 지킨다.
- [ ] **supervisor-guard ② 폐지 확정** — 메인의 코드 편집·테스트 실행·git add/commit 차단 제거(대필세 실측이 근거). 봉인 ①·OpenGate ③은 불변.
- [ ] **처분 결정**: 에스컬레이션 8흐름 규정집(`_escalation.md`) / 등급 판정표·위험 깃발 자동 상향 / 모델 티어 4층 표 / 라우팅 2파일(`_routing.md`·`subagent-routing.md`) — 기본값은 "두고 간다"(실패 처리·위임 판단은 모델 재량), 영호가 살릴 것만 지정.
- [ ] **재귀 차단 서술 처분** — 런타임(중첩 OFF + disallowedTools)이 담보하므로 문서 규정 불요 여부 확정.
- [ ] **앱 테스트 동기 목록 파악**: `agent-model-canon.test.ts`(역할 증감 시 red)·`harness-conformance.test.ts` — 새 편성에 맞는 기대표 초안을 만들고 Phase 06 스위치 체크리스트에 등재.

## ✅ 완료 조건

- [ ] `drafts/.claude/agents/` 초안 존재(새 편성 전원 full ID 표기), 영호 육안 확정
- [ ] supervisor-guard ② 폐지 + 각 구 시스템 처분이 `_decisions.md`에 한 줄씩 박제
- [ ] 새 편성 기준 `agent-model-canon` 기대표 초안이 drafts에 존재

## 📚 학습 포인트

- 조직 설계의 원칙: 역할은 "모델이 못 미더워서"가 아니라 "컨텍스트 격리·관점 분리"라는 구조적 이유가 있을 때만 쪼갠다.
- Conway 법칙의 역방향 — 에이전트 편성이 문서 구조(동기화 책임)를 낳는다.

## ⚠️ 함정

- 에이전트 정의 편집은 같은 세션에서 발화 검증 불가(시작 스냅샷) — 초안 검증은 서류 검토로만, 실발화 검증은 Phase 06 이후 새 세션.
- 별칭 모델 표기 금지 — 별칭은 이동 표적(2026-07-29 프로브에서 `opus`→opus-5로 바뀐 것 자체가 증거). full ID로.

## 담당 SubAgent

대화·검증 = 메인. 정의 파일 백지 작성 = 격리 서브.
