# Milestone 15 — 충실도 F13: 멀티에이전트 워크스페이스 그리드 (Fidelity)

> REPLICA_GAP 웨이브 F13. 원본 MultiAgent.tsx(MultiWorkspace 그리드 2~6패널)를 시각 1:1. **디자인-우선**: 정적 샘플 패널. 동시 실행·패널별 엔진=M4. renderer-only, 새 IPC 0(window.api.multi 미사용).

## 원본 구조 (MultiAgent.tsx)
- COLS {2:2,3:3,4:2,5:3,6:3} · COUNT_OPTIONS [2,3,4,5,6] · SLOTS[0-5] · STATUS_META(idle 대기/analyzing 분석 중/working 작업 중/done 완료/error 오류) · DEFAULT_PICKER opus/xhigh/bypass.
- **MultiWorkspace**(L1324~): `.multi` > `.ma-head`(ma-head-ic IconGrid + ma-head-title "멀티 에이전트" + spacer + ma-batch 「일괄 폴더」 IconFolder + UsagePill 5시간/주간 + ma-count role=tablist[2~6 ma-count-btn .on]) + `.ma-grid`(gridTemplateColumns repeat(cols), SLOTS.slice(0,count) → 패널) + 확장 오버레이(ma-expand-overlay > ma-expand-card > 패널) + FolderSwitchDialog/PromptModal(일괄폴더/패널 프롬프트, F11 재사용).
- **PanelView**(L654~): `.ma-panel`(data-slot) > ma-p-head(ma-p-row1: 슬롯번호 + 상태 dot + ma-p-title "새 작업" + spacer + [확장 시 닫기] + busy spin/time; ma-p-row2: ma-p-folder + 프롬프트 버튼) + ma-p-ctx(ma-ctx-ring conic --p + ma-ctx-label 컨텍스트 + ma-ctx-detail + ma-ctx-pct) + ma-p-body(ma-p-zoom 「크게 보기」 + ma-p-thread[빈 "메시지를 입력해 작업을 시작하세요" / 메시지]) + footer(RunPickers 모델/effort/모드 + PanelComposer).
- **PanelComposer**(L172~): ma-attach + textarea + ma-send(send/schedule/stop).

## 적응 (우리)
- **모드 트리거=store**(자기완결): store `workspaceMode:'single'|'multi'` + setWorkspaceMode. Sidebar F8 토글(현 로컬 state)을 **store로 이전**(Sidebar props 무변경 — store 직접 소비). Shell이 store mode 구독 → multi면 MultiWorkspace를 메인 영역(탐색기|대화|에이전트 대체, 사이드바 유지)에 렌더.
- 정적 샘플: `lib/multiAgentSampleData.ts`(SAMPLE_PANELS 슬롯별 {title,status,cwd,ctxPct,sysPrompt?} 6 + DEFAULT_PICKER). 패널수 count=로컬 state(기본 4). RunPickers=컴포저 Pick 재사용 또는 간단. PanelComposer=간단 textarea. 일괄폴더=FolderSwitchDialog(F11)·패널 프롬프트=PromptModal(F11) 재사용.
- **새 IPC 0**: window.api.multi 미사용. 전송/폴더/프롬프트=시각(로컬).

## Phase 분해 (3)
| NN | Phase | 도메인 | 깃발 | 의존 |
|---|---|---|---|---|
| 01 | multiworkspace-grid | renderer | 없음 | F12 |
| 02 | panel-footer-expand | renderer | 없음 | 01 |
| 03 | f13-visual | qa | 없음 | 02 |

## 실행/검증
renderer + TDD + reviewer + 시각검증(멀티 토글→그리드·패널·확장 모달 스샷). 완료 시 REPLICA_GAP F13 ✅ + Iteration 로그.
