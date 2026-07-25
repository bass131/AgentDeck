---
owner: 영호
milestone: HR2
phase: 02
title: 모델 정본 갱신 + 티어 4층 재정의
status: pending
grade: 복잡
risk: harness
loop_track: human-gate
estimated: 3~5h
domain: cross
summary: 별칭 대신 full ID로 전환하고(별칭 opus는 4.8로 스폰) 모델 티어를 Opus 5 기준 4층으로 재정의 — 21파일 40지점.
---

# Phase 02: 모델 정본 갱신 + 티어 4층 재정의

> **상태**: pending
> **마일스톤**: HR2
> **등급**: 복잡 (risk: harness)
> **담당**: 메인 직접

---

## 🎯 목표

`CLAUDE.md`에 Opus 5를 등재하고, **모델 지정을 별칭에서 full ID로 전환**하며, `execution-owner.md` §3 모델 티어 표를 4층으로 교체한다. 끝나면 "문서가 말하는 모델"과 "실제로 스폰되는 모델"이 일치한다.

---

## ⏪ 사전 조건

- [ ] P01 완료 (ADR-033 개정 — 모델명 유지 결정 뒤집기)
- [ ] OpenGate 개방 (`.claude/**`·`CLAUDE.md` 봉인)
- [ ] 모델 ID는 **`claude-api` 스킬 정본**에서 확인 (헌법 CRITICAL — 기억으로 답하지 않음)

---

## 📝 작업 내용

- [ ] `CLAUDE.md:56` 최신 모델 목록에 **Opus 5(`claude-opus-5`)** 추가 (현재 Opus 4.8까지만)
- [ ] **별칭 → full ID 전환** — `.claude/agents/*.md`의 `model:` 값. 실측 #1: `model: opus`는 `claude-opus-4-8`로 스폰되므로, Opus 5를 원하면 `claude-opus-5`를 명시해야 한다.
- [ ] `execution-owner.md` §3 표 **전체 교체** (49행 "기계 잡무=하위 티어(secretary 기본)"도 이미 `secretary.md:5`(opus)와 모순인 거짓 서술 — 50행만 고치면 안 됨):

| 층 | 대상 | 모델 |
|---|---|---|
| 메인 세션 | 판단·조율·위임 | Opus 5 |
| 최상위 판단 | `chief-tech-operator` ⚠️*(P03에서 신설 — P02 시점엔 파일 없음)* | Fable 5 (영호 승인 발동) |
| 도메인 Worker | 구현 | Sonnet 5 / 위험 깃발·대규모 시 Opus 5 |
| 판정 렌즈·격리 | reviewer·plan-auditor·coordinator·qa·secretary | Opus 5 |

- [ ] ⚠️ **"문서≠실재"를 새로 만들지 않는다** — 위 표의 `chief-tech-operator` 행은 P02 done 시점에 **아직 존재하지 않는 역할**을 가리킨다. 이 마일스톤이 고치려는 병 그 자체이므로, 표에 *(P03 신설 예정)* 주석을 남기거나 그 행만 P03으로 이관한다. 둘 중 하나를 **선택하고 기록**할 것
- [ ] **Worker frontmatter 실편집** — `execution-owner.md:50`은 "Worker=opus 명시"라는데 실제는 `main-process.md:5`·`renderer.md:5`·`shared-ipc.md:5`·`agent-backend.md:5` 모두 `sonnet`. **구현이 맞으므로 정책을 고친다**(영호 결정과 일치).
- [ ] **Claude↔Codex 짝 표 동반 갱신** — `subagent-routing.md:12-22,98,118-119` · `_routing.md:25-28` · `_escalation.md:9,17` · `coordinator.md:17,102-103`. 한쪽만 고치면 Sol/Terra/Luna 대응이 깨진다.
- [ ] **커밋 서명 주체 규범 1줄** — `secretary.md:14`의 `Co-Authored-By: Claude Fable 5`를 고치되, 새 체제는 실행자(secretary)·문구 작성자(메인)·지휘(CTO)가 갈리므로 트레일러 기준을 못박는다.
- [ ] **저장소 밖 자산 동반** — "Fable=메인" 전제가 글로벌에 더 깊다: 메모리 3건(`fable-delegates-opus-executes`·`verify-lens-agents-use-opus`·`fable-safeguard-defensive-security`) + 글로벌 스킬 `Report-YYH-Style/SKILL.md:239-240`(⚠️ `execution-owner.md:50`과 2026-07-24에 **짝으로 박제**돼 한쪽만 고치면 즉시 재드리프트)

---

## ✅ 완료 조건

- [ ] `.claude/agents/*.md` 전 파일의 `model:` 값이 의도한 모델과 **문자열로 일치**(별칭 잔존 0)
- [ ] `execution-owner.md` §3 표에 `secretary.md:5`와 모순되는 행 0
- [ ] `grep -rn "Fable"` 결과 중 "메인 세션 = Fable" 전제 서술 0 (비용 경고·CTO 배정은 존치)
- [ ] Claude/Codex 짝 표 8지점 전부 갱신 — 한쪽만 바뀐 표 0
- [ ] `npm run typecheck` 0 · `npm run test` green · `npm run lint` 0
- [ ] 글로벌 메모리 3건 + `Report-YYH-Style/SKILL.md` 갱신 완료

---

## 📚 학습 포인트

- **별칭(alias)과 버전 고정** — `opus`는 "현재 Opus 계열"을 가리키는 이동 표적이라, 특정 버전을 원하면 full ID를 써야 한다. C#의 `PackageReference Version="*"` vs 정확한 버전 고정과 같은 트레이드오프 — 별칭은 자동 최신화를 얻고 재현성을 잃는다.
- **짝으로 박제된 문서** — 같은 결정이 두 곳에 적혀 있으면 한쪽만 고쳤을 때 조용히 어긋난다. 이번엔 저장소와 **글로벌 스킬**에 짝이 있어 더 잘 안 보인다.

---

## ⚠️ 함정

- **모델 ID를 기억으로 쓰기** — 헌법 CRITICAL. `claude-api` 스킬 정본을 반드시 참조.
- **정책만 고치고 frontmatter를 안 고치기** — 실측상 정책과 구현이 이미 어긋나 있었다. 문서는 실행되지 않는다.
- **글로벌 자산을 빼먹기** — 메모리는 **매 세션 주입**되므로 stale이면 계속 잘못된 방향으로 유도한다. 저장소만 고치면 다음 세션이 옛 전제로 되돌린다.

---

## 담당 SubAgent

**메인 직접** (하네스 = 영호 단독 통제 대행). 전수 확인이 필요한 grep 심부름은 `secretary` 위임 가능.
