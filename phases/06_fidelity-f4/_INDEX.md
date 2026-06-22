# Milestone 06 — 충실도 F4: 우측 에이전트 패널 (Fidelity)

> 충실도 트랙 F4(`docs/UI_FIDELITY.md` §3·§6 라이브관찰, 격차 TOP#6). 우측 컬럼(w392)을 원본 구조로. renderer-only, 새 IPC 0. F3 완료.
>
> 권위 = `docs/UI_FIDELITY.md` + 라이브 `artifacts/acg/{03-shell,c-agent}.png` + 원본 AgentPanel.tsx.

## 라이브 관찰 (원본 에이전트 패널)
헤더 "에이전트" + **상태 pill `● 대기 중`**(우상단). 섹션 3: **할 일 `0/0`** · **서브에이전트 `0/0`** · **변경된 파일 `0`**. 각 섹션 = 헤더+카운트+(빈)내용.

## Phase 분해 (2개)

| NN | Phase | 도메인 | 깃발 | 의존 |
|---|---|---|---|---|
| 01 | agent-panel | renderer | 없음 | F3 |
| 02 | f4-visual-regression | qa | 없음 | 01 |

## 범위 경계 (scope creep 차단)
- **할 일(todos)·서브에이전트 실데이터 = M4**(B3/B4) → F4는 *섹션 구조 + 빈 placeholder(0/0)*만. 진행률 바·체크·서브에이전트 카드 실동작 = M4.
- **상태 pill**: 우리 store `isRunning`/`errorMessage`로 대기/작업/오류 표시(보유 데이터). 완료 상태 세분화·토큰사용 = M4.
- **변경된 파일**: 기존 `changedFiles`(보유) — +N/−M diff 수치·new/edit 태그는 store 변경타입 추적 후속.

## 실행/검증
renderer + TDD + reviewer(렌더) + 시각검증(shell 스크린샷 에이전트 패널). 자동: `python scripts/execute.py 06_fidelity-f4`.
