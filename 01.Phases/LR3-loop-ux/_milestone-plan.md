---
owner: 영호
milestone: LR3
title: loop UX 재설계 — 루프 엔진=SDK 빌트인, 앱=시각화 전담
status: active
grade: 대규모 (마일스톤 — Phase 7개)
summary: 영호 실측 피드백(2026-07-03 아침) 확정 결정 3건의 구현 트랙 — ① 앱 타이머 /loop 폐기(빌트인 전환) ② AUTO 세션 수명(활동 기반 held-open — "평소엔 가볍게, 루프 쓸 때만 ON", 영호 재결정으로 기본 ON안 대체)+금색 상태 표시등(ADR-024 재재고) ③ 실측 선행. + 자연어 트리거·self-paced 가시화·GUI 마감·멀티패널 연속성 편입.
---

# LR3 — loop UX 재설계

> **근거 결정(영호, 2026-07-03 아침)**: ① 루프 방향 전환 GO(엔진=Claude 자기제어, 앱=시각화,
> 앱 타이머 재전송 폐기 — "토큰 맥싱") ② **AUTO 세션 수명**("평소엔 가볍게, 루프 쓸 때만 ON"
> — 같은 날 재논의로 "기본 ON 복귀"안을 대체. 모든 턴을 held-open으로 시작, 턴 경계에서 예약
> 활동 없으면 자동 정리. REPL 버튼은 상태 표시등+금색으로 재정의) ③ "OFF인데 지속처럼 동작"은
> 실측 선행(= resume 맥락 복원으로 추정 — P01-(a)) ④ LR2-03 커밋(61362d6 완료).
> 안전 전제 = LR2 성과: resume+persistent 양립(3717162 라이브), sessionKey 안정(27a60b5).

## Phase 목록

| # | 제목 | 등급 | 도메인 | risk | loop_track |
|---|---|---|---|---|---|
| 01 | 루프·세션 거동 실측 probe | 보통 | qa | — | auto-gate |
| 02 | AUTO 세션 수명 (활동 기반 held-open) + ADR-024 재재고 초안 | 복잡 | agent-backend | backend-contract | **human-gate**(ADR=영호) |
| 03 | 앱 타이머 /loop 폐기 (SDK 통과) + replMode 기본 true·prefs | 복잡 | renderer | — | auto-gate |
| 04 | ScheduleWakeup 트래킹 (self-paced 가시화) | 복잡 | agent-backend | backend-contract | auto-gate |
| 05 | 자연어 루프/goal 가이드 (systemPrompt) | 복잡 | agent-backend | backend-contract | auto-gate |
| 06 | loop GUI 마감 (금색·gloss·goal 배너·모션) | 복잡 | renderer | ui-visual | **human-visual** |
| 07 | 멀티패널 전환-연속성 수리 | 복잡 | renderer | — | auto-gate |

## 의존 그래프

```
01(probe) ─→ 04(wakeup 트래킹) ─→ 02(AUTO 세션 수명) ─→ 03(앱 타이머 폐기) ─┬─→ 06(GUI 마감)
     │                                                                      └─→ 07(멀티패널)
     └────────→ 05(자연어 가이드) ──────────────────────────────────────────→ 06
```
- **04는 02의 선행**: 02의 idle-close는 "활동 신호(hasActivity)"로 세션 정리를 판정하는데,
  wakeup 트래킹(04) 없이 02가 먼저 켜지면 **self-paced 루프를 idle로 오판해 죽인다** —
  신호원(04) 완성 후 소비자(02) 활성화.
- 병렬 가능: **05 ↔ 04·02·03**(sdkOptions vs progressTrackers/펌프 — disjoint) ·
  **07 ↔ 05**.
- **07은 03 이후**(plan-auditor 🔴-1 봉합 — `PanelView.tsx`·`usePanelLoop`·배너 소비부를
  03이 먼저 단순화한 뒤 07이 세션 소유 승격: 같은 파일 병렬 편집 충돌 차단 + 07 작업 축소).
- 06은 시각 마감이라 마지막(02·03 확정 후, 05는 병행 무방).

## 범위 경계 (scope creep 차단)

- **범위 밖(Phase화 금지)**: main abort 이벤트 드롭 근본수리(agent-runs.ts:193 — 🔴
  ADR-024 최대위험 구역, 별도 영호 GO) / LR2-04 슬래시-first 엣지 / goal 턴카운트 다중 msg
  검증(P06 육안에서 관찰만) / Codex 백엔드(Track2/M6).
- push·PR·merge = **LR3 완료 후 영호 결정**(2026-07-03 확정 — "LR3 후로 진행").

## 마일스톤 완료 판정

- 7 Phase 전부 done + 전체 게이트 green + 영호 육안(P06) GO.
- 데모: 자연어 "이거 주기적으로 확인해줘" → Claude가 루프 예약 → 금색 REPL·전체 gloss·
  배너가 살아있는 화면 → 정지 버튼으로 종료. 멀티패널 전환-복귀에도 스트림 연속.
