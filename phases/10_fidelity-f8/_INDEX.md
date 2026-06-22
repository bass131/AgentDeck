# Milestone 10 — 충실도 F8: 사이드바 세션 + 멀티 토글 (Fidelity)

> REPLICA_GAP 웨이브 F8. 원본 Sidebar(C:/Dev/AgentCodeGUI/src/renderer/src/components/Sidebar.tsx)의 단일/멀티 토글·세션 목록·컨텍스트 메뉴·rename/삭제 다이얼로그를 시각 1:1 복제. **디자인-우선**: 정적 샘플 세션 + 로컬 state CRUD(시각). 세션 전환/rename/삭제 실동작·모드 전환·새 대화 생성 = **M4**(IPC/store 연결). renderer-only, 새 IPC 0.

## 원본 구조 (Sidebar.tsx)
- **sb-mode**(role=tablist, onModeChange 있을 때): sb-mode-btn 2개 — 단일 에이전트(IconSquare)/멀티 에이전트(IconGrid), `.on` 활성.
- **sb-new**: 활성(onNewChat, busy만 disabled) + IconPlus + 라벨 + kbd(⌘N/Ctrl N).
- **sb-search**: controlled input(chatQuery), 제목 부분일치 필터.
- **RecentChats**(sb-list): sb-item(role=button, .active/.locked) = dot(상태색 idle/done/run) + txt[t1(t1-text 제목 + hasPrompt면 pr-mark IconSpark) + t2(idle 외 상태 부텍스트)] + more 버튼(IconMore). 우클릭/more → ctx-menu. 빈: "아직 채팅이 없어요"/"검색 결과가 없어요".
- **ctx-menu**(좌표 클램프, 바깥클릭/Esc 닫기): ctx-item 이름 변경(IconPencil)·프롬프트 설정(IconSpark, onPrompt 단일모드)·ctx-sep·삭제(IconTrash, danger).
- **다이얼로그**(set-dialog-overlay>set-dialog): rename(sd-ic warn + IconPencil + sd-title 이름 변경 + sd-input autoFocus+select, Enter 저장/Esc 취소 + sd-btns 취소/저장) · delete(sd-ic + IconTrash + sd-title 채팅 삭제 + sd-msg "<b>제목</b> 채팅을 삭제할까요? 되돌릴 수 없습니다." + sd-btns 취소/삭제 danger).
- **sb-foot**: 프로필 버튼 전체가 설정 열기(ava avatarColor+avatarText, who/n name). → 우리 onOpenSettings 트리거를 sb-foot로 통합.

## 적응 (우리)
- 정적 샘플: `lib/sidebarSampleData.ts`(SAMPLE_SESSIONS 4~6 {id,title,status,hasPrompt?} + SAMPLE_USER {name,avatarText,avatarColor}). 로컬 state로 rename/삭제(시각). **새 IPC/store 변경 0.**
- 아이콘 추가: IconSquare·IconGrid·IconMore(있으면 IconDots 재사용 검토). IconPencil·IconTrash·IconSpark·IconPlus·IconSearch 기존.
- **회귀 가드**: 기존 `shell-chrome.test.tsx` Sidebar 블록이 새대화 disabled·sb-empty·sb-settings 계약에 결합 → **F8에서 동반 갱신**(새대화 활성·세션 행 존재·sb-foot=설정). avatarColor는 인라인 style 불가피(동적 색) → 토큰 아님 허용(샘플 데이터 고정값, 주석).

## Phase 분해 (3)
| NN | Phase | 도메인 | 깃발 | 의존 |
|---|---|---|---|---|
| 01 | sidebar-mode-list | renderer | 없음 | F7 |
| 02 | session-menu-dialogs | renderer | 없음 | 01 |
| 03 | f8-visual | qa | 없음 | 02 |

## 실행/검증
renderer + TDD + reviewer + 시각검증(모드 토글·세션 행·컨텍스트 메뉴·rename 다이얼로그 스샷, 원본 대조). 완료 시 REPLICA_GAP F8 ✅ + Iteration 로그.
