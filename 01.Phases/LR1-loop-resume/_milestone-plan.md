---
owner: 영호
milestone: LR1
title: loop+resume 구현 마일스톤 계획
status: pending
grade: 대규모
summary: BF1에서 결정·문서화한 세션 아키텍처 전환(held-open→resume)과 loop 빌트인 GUI를 실제 코드로 구현. 6 Phase.
---

# LR1 — loop+resume 구현 마일스톤 계획

> **성격**: BF1-interrupt-loop 마일스톤이 *결정·문서까지* 확정한 것을 **코드로 구현**하는 후속 마일스톤. BF1은 "무엇을/왜", LR1은 "어떻게(구현)".
> **근거 사슬**: `01.Phases/BF1-interrupt-loop/_loop-session-decision.md`(P04 확정) + `_adr-024-rethink-draft.md`(P05, ADR-024 재고 반영완료) + `00.Documents/ADR.md` ADR-024 "재고(2026-07-01)".
> **브랜치**: `feature/loop-resume` (master `88e7908` = BF1 머지 기준).

---

## 왜 이 마일스톤인가 (scope 근거)

영호 실사용 불편(30분~24시간 자리비움 후 "새 대화처럼 맥락 끊김")의 원인이 **PC 종료/절전 → held-open 프로세스 증발**로 확정됐다(idle 아님 — probe: 7분 견딤). ADR-024 재고(영호 확정)가 처방을 정했다:

1. **기본 세션 = resume**(ADR-023 디스크 영속, PC 종료 생존) — held-open은 옵트인 격하.
2. **loop = 빌트인 `/goal`·`/loop` + GUI 시각화** — 앱이 루프 엔진을 새로 설계하지 않음.

LR1은 이 두 결정의 *구현*이다. **결정 자체는 영호가 이미 확정** — LR1의 Phase들은 판단 분기가 아니라 확정된 방향의 구현(따라서 대부분 auto-gate).

### scope 명시 (plan-auditor 점검용)
- **범위 안**: ① resume 정확화(디스크 flush) ② replMode 기본값 전환 ③ held-open 옵트인 resume 배선 ④ loop 빌트인 GUI(인디케이터 통합·/goal 진행 카드·팔레트).
- **범위 밖**: Codex 백엔드(Track2/M6) · 새 루프 엔진 자체구현(빌트인 활용만) · REPL 코드 삭제(기본값만 전환, held-open 코드 잔존).
- **PRD 정합 주의**: loop 시각화 GUI는 PRD상 "우리 스타일(Track 2)" 성격이 일부 있으나, ①②는 ADR-024 재고(영호 확정)의 직접 구현이고 ④도 P04 §B 결정2에서 영호가 이 마일스톤 범위로 **명시 확정**. loop 코드(CronTracker·앱 타이머)는 이미 앱에 존재 → 신규 기능 발명이 아니라 기존 메커니즘의 정합·가시화.

---

## Phase 목록 (의존성 순서)

| # | 제목 | 등급 | 도메인 | loop_track | 사전조건 |
|---|---|---|---|---|---|
| 01 | resume 버그 재현 + 원인 확정 (RED 테스트) | 보통 | qa (+진단 R) | auto-gate | — |
| 02 | session_id 디스크 영속 flush 수정 | 복잡 | cross(main+renderer) | auto-gate¹ | 01 |
| 03 | replMode 기본값 전환 + held-open 옵트인 | 복잡 | renderer(+main) | auto-gate² | 02 |
| 04 | held-open 경로 resumeSessionId 배선 | 복잡 | agent-backend | auto-gate³ | 02·03 |
| 05 | loop GUI — 인디케이터 통합 + /goal 진행 카드 | 복잡 | renderer | human-visual | 03 |
| 06 | 통합 e2e + 문서 정합 + 회귀 게이트 | 보통 | qa (+docs 영호) | auto-gate | 02~05 |

¹ JSON 영속 *스키마 변경* 동반 시 (c) human-gate로 상향 (sessionId 필드는 이미 스키마에 존재 → 대개 flush 타이밍만 = auto).
² 기본값 전환의 *설계 결정*은 영호 확정(ADR-024 재고) → 구현은 auto-gate. 단 세션 UX 체감은 **human-visual 검증 체크포인트**(재시작 후 맥락 유지 육안).
³ backend-contract 깃발 → **reviewer 무조건 + 모델 상향**(Opus). 기계 검증은 auto.

### 의존성 그래프
```
01(진단·RED)
  └→ 02(resume flush 수정 = RED green)
        ├→ 03(replMode 기본값 전환)
        │     ├→ 04(held-open resume 배선)   ┐
        │     └→ 05(loop GUI)                ┘ 04 ↔ 05 병렬 가능(agent-backend vs renderer)
        └────────────────────────────────────→ 06(통합 e2e + docs)
```
- **병렬 가능**: Phase 04 ↔ Phase 05 (도메인 독립 — agent-backend vs renderer, 둘 다 03 이후).

---

## 이 마일스톤에서 배울 핵심 개념
- **in-memory held-open vs file-based resume** — 프로세스 생명주기 vs 디스크 영속의 근본 차이. Claude Code 본가 방식(resume)과 왜 그게 PC 종료에 강한지.
- **feature flag 기본값 전환의 영향 범위** — 한 boolean(replMode) 뒤집기가 세션 전체 경로를 바꿈. 기존 테스트 가정 붕괴 관리.
- **SDK 빌트인 활용 vs 자체 구현** — /goal·/loop을 앱이 재발명하지 않고 시각화만 얹는 설계.
- **backend-contract 경계** — 어댑터 한 곳 변경이 전 엔진(Claude/Codex) 영향, reviewer 무조건의 이유.

---

## 게이트 약속
- push·PR·merge = **영호 게이트**(irreversible). 마일스톤 전체 1 PR.
- 문서(REPL_TRANSITION·FEATURE_MAP) 반영 = 영호 단독(AI 초안 → 영호 커밋).
- Phase별 commit + 회귀 게이트(typecheck/test/lint) 통과분만.
