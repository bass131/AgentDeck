# Phase 05: component-placement

## 목표
기존 기능 컴포넌트(FileExplorer · Conversation + 코드/diff 뷰어 탭 · AgentPanel)가 4컬럼 골격의 해당 컬럼에 배치되고, **기존 동작이 모두 보존**된다. (placeholder를 실제 컴포넌트로 교체.)

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 복잡(기존 동작 보존 + 회귀 위험).

## 의존 Phase
04 (4컬럼 골격).

## 위험 깃발
없음 (renderer 내부 배치. IPC/신뢰경계 변화 없음).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/layout/Shell.tsx` — 컬럼 placeholder → 실제 컴포넌트 주입
- 기존 FileExplorer/Conversation/CodeViewerPane/DiffViewerPane/AgentPanel는 *배치만* 변경(로직 보존). 필요한 최소 컨테이너 CSS만.

## 작업 단계
1. ②탐색기 컬럼 = 기존 FileExplorer(워크스페이스/레퍼런스 섹션 유지).
2. ③대화 컬럼 = 기존 Conversation + 코드/diff 뷰어 탭(중앙 탭 체계 유지). 파일 선택 시 코드탭 자동 전환·diff 표시 동작 보존.
3. ④에이전트 컬럼 = 기존 AgentPanel(상태·변경파일). 서브에이전트 섹션은 placeholder(M4).
4. **diff 탭 위치는 보존만, 재배치 금지** — 기존 좌측 diff/중앙 코드 탭 동작을 그대로 유지(흡수·이동은 본 Phase 범위 밖, 회귀 방지). 셀렉터 변경 시 해당 테스트 동반 갱신.
5. 인라인 색상 0.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 기존 renderer 컴포넌트 테스트(components/codeviewer/reference-folder 등) 회귀 0 — 셀렉터 변경 시 테스트 동반 갱신.
- [ ] `npm run test:e2e` 8개 PASS(폴더열기→트리, 대화 스트리밍, 파일변경→diff, 뷰어, 레퍼런스 — 4컬럼에서 동작 보존).
- [ ] 시각검증: 탐색기/대화/뷰어/에이전트가 각 컬럼에 정상 배치(스크린샷 육안 확인).

## 참조
docs/UI_FIDELITY.md(컬럼 컴포넌트 매핑) · docs/UI_GUIDE.md · 레퍼런스 Explorer.tsx·Chat.tsx·AgentPanel.tsx · phases/03_fidelity/04-four-column-skeleton.md.
