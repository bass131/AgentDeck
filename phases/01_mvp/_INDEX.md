# Milestone 01 — MVP 핵심 루프

> 목표: **폴더 열기 → 대화 입력 → Claude Code 어댑터 실행(스트리밍) → 파일변경 감지 → diff 표시** + 대화 영속화 + 다크 테마. (PRD "성공 기준" 정합)

## Phase 분해 (6개 — 의존성 순서)

| NN | Phase | 도메인 | 깃발 | 의존 |
|---|---|---|---|---|
| 01 | project-init | main-process+renderer(기반) | 없음 | — |
| 02 | ipc-contract | shared-ipc | trust-boundary | 01 |
| 03 | agent-backend | agent-backend | backend-contract | 02 |
| 04 | main-ipc-persistence | main-process | trust-boundary | 02,03 |
| 05 | renderer-shell | renderer | 없음 | 02 |
| 06 | core-loop-integration | 통합(coordinator)+qa | backend-contract | 03,04,05 |

## FEATURE_MAP 커버리지
A2(Claude 엔진) · A4(AgentEvent 정규화) · B1(스트리밍) · B2(도구카드) · B5(영속화) · C1(탐색기+인디케이터) · C4(diff) · D4(변경표시) · E4(다크).

## 실행
- 수동: 각 Phase를 등급에 맞게 coordinator/Worker로 진행(복잡 이상은 coordinator 분해).
- 자동: `python scripts/execute.py 01_mvp`
- ⚠️ Phase 01 완료(Vitest 셋업) 후 `touch .claude/state/tdd-enforce`로 TDD 차단 모드 전환.

## M1에서 안 만든 것 (영구 제외 아님 — PRD 정합)
- **후속 마일스톤에서 *전부* 복제(Track 1)**: LSP·코드인텔리전스(M2) · Git 비주얼 패널(M3) · 멀티에이전트 큐·슬래시커맨드·이미지첨부·토큰게이지(M4) · NSIS·자동업데이트·라이트테마(M5).
- **Track 2로 미룸(복제 *이후*)**: Codex 실동작 + 엔진 전환 UI(M6). ← M1은 얇은 이음 + Codex stub만.
