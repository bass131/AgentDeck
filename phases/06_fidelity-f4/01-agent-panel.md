# Phase 01: agent-panel

## 목표
우측 패널이 원본 구조로: `.ag-head`(에이전트 + 상태 pill) + 섹션 3(할 일[M4 placeholder] / 서브에이전트[M4 placeholder] / 변경된 파일[데이터]).

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F3(완료).

## 위험 깃발
없음 (renderer. 기존 store isRunning/changedFiles/toolCards/errorMessage 사용, 새 IPC 0).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/AgentPanel.tsx` — `.ag-head`(타이틀 + 상태 pill) + `.ag-sec` 섹션 3(할일/서브에이전트/변경된파일).
- `src/renderer/src/components/AgentPanel.css` — ag-head/ag-pill/ag-sec/ag-sec-head/ag-count/ag-empty/변경파일 행.
- `src/renderer/src/layout/Shell.tsx` — agent 컬럼의 `.pane-head`("에이전트 상태") 제거(헤더는 AgentPanel이 소유).

## 작업 단계
1. `.ag-head`: 타이틀 "에이전트" + 우측 상태 pill(`.ag-pill`) — `isRunning`→작업 중(dot pulse), `errorMessage`→오류, 아니면 대기 중.
2. 섹션 구조(`.ag-sec` × 3): 헤더(라벨 + `.ag-count` 0/0 또는 카운트) + 내용/빈 placeholder.
   - **할 일**: 카운트 `0/0`, "아직 할 일이 없어요"(M4 — 진행률/체크 없음).
   - **서브에이전트**: 카운트 `0/0`, "아직 서브에이전트가 없어요"(M4).
   - **변경된 파일**: 카운트 = `changedFiles.size`, 목록(파일 행, 점 + 경로) 또는 "아직 변경된 파일이 없어요".
3. 인라인 색상 0, 벡터 아이콘. (최근 도구 호출 섹션은 제거 또는 변경파일에 흡수 — 원본엔 없음.)

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] AgentPanel 컴포넌트 테스트(DOM): `.ag-head`+`.ag-pill`(대기/작업 상태) + `.ag-sec`×3(할일/서브에이전트/변경파일) + 변경파일 데이터 반영. PASS.
- [ ] **scope grep**: 할일/서브에이전트 실데이터·진행률·서브에이전트 카드 로직 0(M4 — placeholder만).
- [ ] `npm run test:e2e` 회귀 0(에이전트 상태 e2e — `.pane.agent` 단언, 셀렉터 변경 시 동반 갱신).
- [ ] 시각검증: 헤더+pill + 3섹션 렌더(스크린샷 육안).

## 참조
docs/UI_FIDELITY.md §3·§6 · 원본 AgentPanel.tsx · phases/06_fidelity-f4/_INDEX.md.
