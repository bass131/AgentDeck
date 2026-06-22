# Milestone 12 — 충실도 F10: RecentFiles 탭바 + 패널 todo/서브에이전트 (Fidelity)

> REPLICA_GAP 웨이브 F10. 원본 RecentFiles.tsx(파일 탭바) + AgentPanel.tsx(Todos 진행바·SubAgent 카드·SubAgentModal·FileRow +/−·NEW/EDIT)를 시각 1:1. **디자인-우선**: RecentFiles는 **실 opened-files(renderer state)** 연결(라이브 데모 가능, 새 IPC 0); 패널 todo/서브에이전트는 **정적 샘플/optional prop**(실 run 데이터=M4, 라이브 빈상태 유지+단위 검증). renderer-only.

## 원본 구조
- **RecentFiles**(`.chat-files`): cf-tab(FileBadge + cf-name + exp-chg N/M + cf-x) · 드래그 재정렬(FLIP useLayoutEffect) · 중간점 스왑 · 휠클릭 제거 · ctx-menu(닫기/다른 탭 닫기/오른쪽 탭 닫기/모두 닫기, 좌표 클램프 MENU_W178/H164, 바깥/Esc/resize/blur 닫기) · activePath .on. files 빈 배열이면 미렌더.
- **AgentPanel.Todos**: `.progress > i{width:pct%}` + `.todos`(todo: .box[done IconCheck]·.lab·running spin, .done/.running/.planned).
- **AgentPanel.SubAgent**(`.subagent` .status): sa-ic(saIcon 역할 키워드) + sa-main(sa-name/sa-sub role) + sa-status(running spin/done sa-check/queued sa-dot) + sa-chev → onOpen.
- **SubAgentModal**(`.sa-overlay`>`.sa-card`): head(sa-card-ic+titles[name/role]+sa-card-status 대기/실행/완료+close) + body(activity sec[결과/설명 Markdown] + 도구 sec[sa-tool verb/target/status, 빈 "사용한 도구가 없어요"]). Esc/바깥 닫기.
- **FileRow**(`.file`): FileBadge + path(dir+name) + stat(+add/−del + tag NEW/EDIT) + fchev.

## 적응 (우리)
- **RecentFiles**: store에 `recentFiles: string[]`(openFile 시 최신순 누적·dedup·cap 20) + removeRecent/reorderRecent 액션(renderer state, 새 IPC 0). 코드 패널(코드 탭) 위에 `.chat-files` 탭바 렌더. 탭 클릭→openFile, x/휠→제거, 드래그→재정렬, ctx-menu. 변경 마커=store changedFiles.
- **AgentPanel**: optional props todos/subagents(기본 [], 라이브 빈상태 유지). populated 시각=정적 샘플 단위테스트. SubAgentModal=Modal 패턴 재사용 또는 sa-overlay. 변경파일 FileRow는 store changedFiles 경로 + 태그(현 데이터 한도; add/del=M4면 생략 가능, NEW/EDIT 태그는 changedFiles tag 있으면 표시).
- 아이콘: IconChevsRight·IconCloseOthers·IconBot·IconX2(있으면 재사용). FileBadge/IconCheck/IconChevRight/IconClose 기존.
- **새 IPC 0.** todo/서브에이전트 실데이터·add/del diff=M4.

## Phase 분해 (3)
| NN | Phase | 도메인 | 깃발 | 의존 |
|---|---|---|---|---|
| 01 | recentfiles-tabbar | renderer | 없음 | F9 |
| 02 | agentpanel-todo-subagent | renderer | 없음 | 01 |
| 03 | f10-visual | qa | 없음 | 02 |

## 실행/검증
renderer + TDD + reviewer + 시각검증(파일 탭바·패널 todo/서브에이전트·SubAgentModal 스샷). 완료 시 REPLICA_GAP F10 ✅ + Iteration 로그.
