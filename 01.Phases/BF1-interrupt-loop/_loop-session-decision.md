---
owner: 영호
milestone: BF1-interrupt-loop
phase: 04
title: Loop 동작 + 세션 아키텍처 결정문
status: draft (영호 검토 대기 — 특히 §B 결정1 ADR-024 재고)
grade: 복잡 (설계분기 · human-gate)
date: 2026-07-01
summary: loop는 빌트인 /goal·/loop 활용 + GUI 시각화. 세션은 held-open REPL → resume 기반 전환(ADR-024 재고). 영호 의문(긴주기·맥락끊김)의 뿌리=세션 아키텍처 선택으로 판명.
---

# BF1 P04 — Loop 동작 + 세션 아키텍처 결정문

> **상태**: 초안 (AI 작성, 영호 검토 대기). §B 결정1(세션 resume 전환)은 ADR-024 재고 → P05 ADR 초안 + 영호 단독 확정.
> **근거**: Explore 코드매핑 + claude-code-guide(공식문서) + 실 SDK probe(/goal·interrupt) + idle probe(진행 중).

---

## §A. 현황 1장 (코드·문서·probe 근거 — 추측 0)

### 블록 1 — loop 3개념
| | SDK 크론 | 앱 타이머 | REPL 펌프 |
|---|---|---|---|
| 파일 | progressTrackers.ts (CronTracker) | loopCommand.ts + store/slices/loop.ts + usePanelLoop.ts | claudeAgentRun.ts `_inputGen`/`_runPersistentPump` |
| 트리거 | N분 주기 (interval) | N분 주기 (setTimeout) | (loop 아님 — held-open 입력 토대) |
| 정지 | CronDelete / 세션종료 | /loop stop · 최대50회·30분 · abort | abort |
| 견고성 | 세션 죽으면 멈춤(idle ~6분) | 앱 닫으면 멈춤 | — |
| 인디케이터 | LoopRunningIndicator (activeLoops) | LoopIndicator (activeLoop) | — |
| **공통 한계** | **둘 다 "주기형"(N분마다) — 영호 의도(목표형)와 불일치** | | |

### 블록 2 — 인디케이터 2개
- `LoopRunningIndicator` ← `activeLoops`(SDK 크론) / `LoopIndicator` ← `activeLoop`(앱 타이머).
- replMode 분기로 상호배타(ON=크론, OFF=타이머). 동시 표시는 구조상 가능하나 현재 분기로 회피.

### 블록 3 — 문서 괴리 (이미 해소)
- REPL_TRANSITION §9 "REPL 보류, 앱타이머가 정답" = **옛 결론(폐기, 2026-06-26 토론 전)**.
- §10.2 "REPL 기본, 앱타이머 단발 폴백" = **현 결론(구현 완료)**. 코드는 replMode 분기로 일관.

### 블록 4 — 추가 발견 (영호 의문에서 파생)
- **/goal 빌트인 작동 확인** (probe): query()에 `/goal` 보내면 SDK가 **자동 user 주입 + num_turns=3 자율 반복** → 목표 달성 시 정지. supportedCommands에 goal 인식=true. → **목표형 = SDK 빌트인 `/goal`이 이미 함.**
- **세션 아키텍처 (핵심)**: 
  - **Claude Code = 파일 기반 resume** (공식문서 how-claude-code-works: JSONL 저장 → `--resume`/`--continue`로 매번 되살림). held-open 아님.
  - **AgentDeck = held-open REPL 기본**(ADR-024) BUT **resume 모드(`persistent:false` + `resumeSessionId`) 이미 보유**(AgentBackend.ts:85·89, sdkOptions.ts:189).
  - 영호 불편(긴주기·장시간 후 맥락끊김) = held-open이 idle에 끊김(추정 ~6분). resume 모드는 폴백으로 묻혀 있었음.
- **idle 한계 실재 = 문서 충돌**: 호스팅 문서 "No top-level session timeout" vs GitHub #32050 "idle disconnect" → **idle probe로 실측 중**(7분 idle 후 turn2 처리되나).

---

## §B. 결정 (영호, 2026-07-01)

### 결정 1 — 세션 아키텍처: resume 기반 전환 (⚠️ ADR-024 재고 — 영호 검토 대기)
- **무엇**: 기본 세션 방식을 held-open REPL → **resume(매 입력마다 session_id로 되살림)** 으로 전환.
- **왜**: Claude Code 방식이고, 세션이 디스크 파일에 영속 → 장시간 idle 후에도 맥락 유지 + 긴 주기 견고(idle 무관). 영호 불편의 직접 해소.
- **근거**: claude-code-guide(Claude Code=resume 공식확정) + grep(AgentDeck resume모드 이미 보유) + **idle probe 결과 [대기 — bz3mxt9z8]**.
- **ADR 영향**: ADR-024("REPL held-open 기본")를 뒤집는 결정 → **P05에서 ADR 재고 초안 + 영호 단독 확정**(헌법: ADR=영호). held-open(REPL)은 빌트인 자율(/loop·/goal)이 필요한 경우 *옵트인*으로 유지 가능(완전 제거 아님).

### 결정 2 — loop: 빌트인 활용 + GUI 시각화
- **목표형 `/goal` + 주기형 `/loop` 둘 다 SDK 빌트인 엔진 + AgentDeck GUI 시각화.** 앱이 루프 엔진을 새로 설계하지 않음(A/B/C 자체구현 폐기).
- 기능 **노출**(쓸 수 있게) + 진행 **시각화**(보이게) 둘 다. 시각화(진행 카드·턴 카운트·목표 평가 결과)가 AgentDeck 부가가치 — TUI 텍스트 로그를 압도.

---

## §C. 영향 파일 (후속 구현 마일스톤 입력)
- **세션 전환**: `claudeAgentRun.ts`(held-open vs 단발+resume 분기 기본값) · `AgentBackend.ts`(persistent/resumeSessionId 의미) · `renderer runtime.ts`(replMode 기본값) · `sdkOptions.ts`(resume 매핑) · `store`(session_id 영속).
- **loop GUI**: `LoopRunningIndicator`·`LoopIndicator` 통합/정리 · `/goal` 진행 카드 신규(renderer) · 슬래시 팔레트 연결.
- **문서**: ADR-024 재고 · REPL_TRANSITION 정합(P05).

---

## §D. 미확정·검증
- **idle probe (bz3mxt9z8)**: 7분 idle 후 turn2 처리 여부 → 결정1 근거 확정/보정. **[결과 대기]**
- **빌트인 /goal·/loop와 resume 양립**: /goal 자율반복은 한 query 내에서 완결되므로(probe 확인), 그 query 종료 후 session_id로 resume하면 양립 가능할 것으로 추정 — 구현 시 실측.

---

## §E. 후속
- **P05**: ADR-024 재고 + REPL_TRANSITION 정합 ADR 초안 (AI 초안 → 영호 단독 확정).
- **구현**: P04 결정 확정 후 별도 마일스톤 (이 마일스톤 BF1은 결정·문서까지).
- 미push 마일스톤 전체 1 PR (push/PR=영호 게이트).
