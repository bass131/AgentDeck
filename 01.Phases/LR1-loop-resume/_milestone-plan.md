---
owner: 영호
milestone: LR1
title: 대화 기억 신뢰성 마일스톤 계획 (resume + transcript 폴백)
status: pending
grade: 대규모
summary: 영호 실불편("옛 대화 이어가면 기억 못 함")을 resume 신뢰성 + transcript 폴백(ADR-025)으로 해결. loop·replMode 전환은 LR2로 분리(영호 버그와 무관 확정). 5 Phase.
---

# LR1 — 대화 기억 신뢰성 마일스톤 계획 (재프레이밍 2026-07-01)

> **성격**: 영호 실사용 버그("옛 대화 불러와 이어가면 Claude가 기억 못 함")를 실제로 닫는 마일스톤.
> **⚠️ 재프레이밍 이력**: 최초 LR1은 "held-open→resume 전환 + loop GUI"(BF1 ADR-024 재고)로 잡았으나, **3소스 검증(적대 코드-트레이스·계획 정독·Codex)**으로 진짜 원인이 밝혀지며 재초점화됨. loop·replMode 전환은 **LR2로 분리**.

---

## 왜 재프레이밍했나 (근거)

**당초 전제(오진)**: 영호 불편 = idle→held-open 프로세스 증발 → ADR-024 재고(resume 기본 전환).

**실제 확정 원인(3소스 수렴)**:
1. **직접 원인**: 단일채팅 `CONVERSATION_SAVE` 핸들러가 `sessionId`를 `store.save`로 forward 안 해 영속 실패 → `fa9df22`로 **수정 완료**(Phase 01).
2. **구조적 원인**: `claudeAgentRun.ts:379`가 매 턴 마지막 user 메시지만 SDK에 보냄 → 모델 맥락 = **resume 단독 의존, transcript 폴백 전무**. sessionId 없는 옛 대화·resume 실패 시 조용한 기억상실(Codex 지적).

→ **held-open이냐 resume이냐(replMode)는 이 증상과 무관**했다. resume 배선은 이미 정상(적대 검증 verdict A). 따라서 replMode 전환·held-open 배선·loop GUI는 **LR2로 분리**하고, LR1은 "기억 신뢰성"에 집중한다.

**영호 결정(2026-07-01)**: 하이브리드 — resume 주수단 + resumeSessionId 없을 때 **최근 N토큰 transcript 폴백**(ADR-025 초안).

### scope 명시 (plan-auditor 점검용)
- **범위 안**: ① sessionId 저장 수정(완료) ② transcript 폴백(ADR-025) ③ resume 견고성(session이벤트 즉시저장·sessionKey·cwd) ④ UI 맥락배지 ⑤ 통합 e2e + 문서 정정.
- **범위 밖 (→ LR2)**: replMode 기본값 전환 · held-open 옵트인 배선 · loop 빌트인 GUI. (영호 버그와 독립 — `01.Phases/LR2-loop-replmode/`.)
- **범위 밖 (기존)**: Codex 백엔드(Track2/M6) · 새 루프 엔진 자체구현.
- **ADR**: ADR-025(transcript 폴백)가 ADR-013(Claude Code resume 순수 충실)에서 의도적 이탈 → 영호 사인오프·커밋 필요.

---

## Phase 목록 (의존성 순서)

| # | 제목 | 등급 | 도메인 | loop_track | risk | 사전조건 |
|---|---|---|---|---|---|---|
| 01 | resume 버그 재현 + 원인 확정 (**done**, fa9df22) | 보통 | qa | auto-gate | — | — |
| 02 | transcript 폴백 (ADR-025 핵심) | 복잡 | agent-backend | auto-gate | backend-contract | 01 + ADR-025 사인오프 |
| 03 | resume 견고성 (session이벤트 저장·cwd 안정화) | 복잡 | cross | auto-gate | trust-boundary | 01 |
| 04 | UI "맥락 복원됨" 배지 | 보통 | renderer | human-visual | ui-visual | 02 |
| 05 | 통합 e2e + 문서 정합 + 회귀 게이트 | 보통 | qa (+docs 영호) | auto-gate | — | 02·03·04 |

> **Phase 03 범위 조정(plan-auditor)**: 원래 3갈래(session저장·sessionKey·cwd)였으나, sessionKey/held-open 고아 갈래는 자원 누수(correctness 아님)·held-open 라이프사이클(LR2 도메인)·가치가 replMode에 의존 → **LR2 Phase 04로 이관**. LR1 Phase 03은 영호 시나리오 직결인 session저장·cwd만.
> **known-gap(plan-auditor)**: resume "성공했으나 빈 세션"(만료·손상)은 폴백 트리거(sessionId 유무)로 안 잡혀 조용한 기억상실 잔존 → ADR-025 §미해결로 이연, Phase 05 문서에 "sessionId 있음 ≠ 맥락 복원" 1줄 명시.

### 의존성 그래프
```
01(진단·수정 = done, fa9df22)
  ├→ 02(transcript 폴백)  ─┐
  │                         ├→ 04(UI 배지, 02 후)
  └→ 03(견고성, 01 후)    ─┘
        └──────────────────────→ 05(통합 e2e + docs, 02·03·04 후)
```
- **병렬 안전**: Phase 02 ↔ 03 — plan-auditor 실측: 02는 `claudeAgentRun.ts`(prompt 빌더), 03은 `sdkOptions.ts`(cwd)·`runtime.ts subscribeAgentEvents`(저장 트리거)를 건드려 **파일 겹침 없음**. 둘 다 01만 의존 → 병렬 가능.

---

## 이 마일스톤에서 배울 핵심 개념
- **resume(서버측 세션) vs transcript 주입(클라이언트측 맥락)** — 두 복원 메커니즘의 차이와 하이브리드.
- **조용한 실패(silent failure)와 폴백 설계** — 주경로가 실패할 때 안전망 + 사용자 투명성(배지).
- **오진 인과의 문서 정정** — 틀린 원인 서술을 기록에서 걷어내 미래 작업자 혼란 방지.
- **backend-contract·trust-boundary 경계** — 어댑터/영속/경로 변경의 reviewer 무조건 이유.

---

## 게이트 약속
- push·PR·merge = **영호 게이트**(irreversible). 마일스톤 전체 1 PR.
- 문서(ADR-025·REPL_TRANSITION·ADR-024·FEATURE_MAP) = 영호 단독(AI 초안 → 영호 커밋).
- Phase별 commit + 회귀 게이트(typecheck/test/lint) 통과분만.
- Phase 02·03 = reviewer 무조건(깃발). Phase 04 = 영호 육안(ui-visual).
