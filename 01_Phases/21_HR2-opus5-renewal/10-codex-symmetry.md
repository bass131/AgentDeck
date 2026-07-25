---
owner: 영호
milestone: HR2
phase: 10
title: Codex 대칭 갱신 (⚠️ Claude 수행 불가 — CORE-12)
status: pending
grade: 복잡
risk: harness
loop_track: human-gate
estimated: 2~4h
domain: cross
summary: .codex 런타임의 경로·계약을 새 이름으로 맞춘다 — 엔진 격리(CORE-12)로 Claude는 손댈 수 없으니 영호 또는 Codex 세션이 수행한다.
---

# Phase 10: Codex 대칭 갱신 (⚠️ Claude 수행 불가)

> **상태**: pending
> **마일스톤**: HR2
> **등급**: 복잡 (risk: harness)
> **담당**: **영호 또는 Codex 세션** — Claude 수행 시 CORE-12 위반

---

## 🎯 목표

Claude 쪽 하네스가 새 이름으로 옮겨간 만큼 **Codex 쪽 하네스도 같이 옮긴다.** 이 Phase가 빠지면 Claude 쪽만 고쳐지고 **Codex 가드는 조용히 죽은 채** 남는다.

**왜 Claude가 못 하나**: CORE-12(엔진별 Hook 격리) — *"Claude는 `.claude/hooks/**`·`.claude/state/**`만, Codex는 `.codex/hooks/**`·`.codex/state/**`만. 상호 읽기·쓰기·실행 금지, 공유는 정책 의미(코어)뿐."*

---

## ⏪ 사전 조건

- [ ] P08 완료 (새 폴더 이름이 확정돼 있어야 대상이 정해진다)
- [ ] P03 완료 (coordinator `Agent` 반납 — 계약 테스트가 red인 상태)

---

## 📝 작업 내용

### 경로 갱신
- [ ] `.codex/config.toml:43-44` — 샌드박스 write 권한 루트 (`"02.Source" = "write"` · `"99.Others/tests" = "write"`). ⚠️ 안 고치면 Codex가 소스에 쓰지 못하거나, 반대로 잘못된 경로에 권한이 남는다
- [ ] `.codex/hooks/agentdeck-hook.mjs:82,343,384-397,449,631` — 특히 `riskFlagsFor`·`isImplementationPath`는 **fail-open**(매칭 실패 시 깃발 없음 = 통과)
- [ ] `.codex/harness-doctor.mjs:18,246,251,260,262` — canary 경로
- [ ] `.codex/hooks/agentdeck-hook.test.mjs:93-330` — 옛 경로 단언
- [ ] `.codex/README.md:3,20,29`
- [ ] ⚠️ `.codex/agents/reviewer.toml:7` — **Codex reviewer에게 "여기를 읽어라"고 지시하는 살아 있는 경로**. 산문이 아니다

### 계약 테스트 갱신 (P03 인계분)
- [ ] `.codex/harness-contract.test.mjs:131-136` — **"coordinator.md의 tools에 Agent가 있을 것"** 단언. P03이 Agent를 반납하면 red가 된다. 새 체제(메인만 위임자, 런타임 중첩 OFF)를 반영해 단언을 교체하거나 제거
- [ ] `.codex/harness-contract.test.mjs:183` — `/(?:SubAgent )?풀 8/` 옛 숫자 감시 가드. 9→10 전환 후에도 8만 보고 있으면 **다음 드리프트를 못 잡는다**
- [ ] `.codex/harness-contract.test.mjs:230-231` — 옛 경로 단언
- [ ] corpus 목록(`:167-179`)에 신설 역할 문서(`chief-tech-operator.md`)를 넣을지 결정

### 동형 구현 (P05 인계분)
- [ ] `.codex/hooks/agentdeck-hook.mjs:343`의 `harnessShellWriteReason` — Claude 쪽 `shell-policy.mjs`와 동형. P05의 sed `-i`/`w` 조건부와 따옴표 fail-open 봉합을 **대칭 적용**할지 판단

---

## ✅ 완료 조건

- [ ] `.codex` 계약 테스트 green (`node --test` 또는 Codex 하네스 doctor)
- [ ] `.codex/harness-doctor.mjs` exit 0
- [ ] 새 경로에서 Codex 가드가 **실제로 발화**하는지 프로브(정적 grep 아님 — `riskFlagsFor`가 fail-open이라 grep으로는 못 잡는다)
- [ ] `npm run test` green (`harness-conformance.test.ts`가 Codex 어댑터 conformance를 검사)
- [ ] 수행 주체·일시를 Phase 문서에 기록(Claude가 아님을 명시)

---

## 📚 학습 포인트

- **엔진 격리의 대가** — 두 엔진이 같은 저장소를 쓰면서 서로의 런타임을 못 건드리게 하면 안전하지만, **대칭 갱신이 사람 손을 타는 마디**가 된다. 자동화의 경계가 곧 규율의 경계다.
- **fail-open 가드의 침묵** — `riskFlagsFor`가 경로를 못 알아보면 "위험 없음"으로 판정한다. 에러가 아니라 **무사통과**라 로그에도 안 남는다.

---

## ⚠️ 함정

- **Claude가 대신 고치기** — CORE-12 위반. 편해 보여도 하면 안 된다. Claude는 이 Phase에서 **읽기·보고만**.
- **P10을 생략하고 마일스톤을 닫기** — 개명이 반쪽이 되고, Codex 세션에서 가드 없이 작업하게 된다.
- **계약 테스트를 그냥 지우기** — `:183`의 숫자 가드는 드리프트 감지 장치다. 숫자를 **갱신**해야지 제거하면 다음 드리프트를 놓친다.

---

## 담당 SubAgent

**없음 — 사람(영호) 또는 Codex 세션 직접.** Claude는 대상 목록 제공과 완료 확인만 담당.
