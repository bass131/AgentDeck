# Milestone 09 — 충실도 F7: 설정 모달 5탭 완성 (Fidelity)

> REPLICA_GAP 웨이브 F7. 원본 Settings는 좌 nav **5탭**(Claude Code·MCP·Skill·Code·Theme). 우리는 info/theme 2탭만. **디자인-우선**: 동일 시각 구조 + **정적 샘플 데이터**(새 IPC 0). 실데이터/실동작(엔진 설치·MCP/Skill 토글·LSP)은 M5/M2-LSP에서 연결. renderer-only.

## 원본 구조 (C:/Dev/AgentCodeGUI/src/renderer/src/components/Settings.tsx)
- nav 5탭: version(Claude Code, IconClaude) · mcp(IconServer) · skill(IconBook) · lsp(Code, IconCode) · appearance(Theme, IconContrast).
- **VersionView**: set-h1 + 「현재 엔진」card(ver-row: ver-ic·ver-main·vpick 드롭다운[vpick-btn→vpick-menu: vpick-head 새로고침 + vpick-list: vpick-opt 버전+vtag(최신/현재/설치됨)+vpo-act(사용/설치)+vpo-del]) + set-note. install-card(진행) + set-dialog(확인).
- **McpView/SkillView**: skill-tabs(scope 전체/전역/로컬+skill-tab-n 카운트 + skill-refresh) + ext-list(ext-item: ext-main[ext-top: ext-name+scope-badge+ver-chip transport]·ext-desc + skill-toggle[role=switch, skill-knob]) + set-empty + set-note.
- **LspView**: ext-list(ext-item: FileBadge(a.ts/a.py/a.cs/a.cpp)·ext-main[ext-name 언어+ver-chip(앱내장/설치됨/요구사항)·ext-desc 확장자]·inst-btn[설치/삭제]) + set-note. confirm/card 다이얼로그.
- **AppearanceView**: 이미 우리 F6에 구현(theme-grid 유사). 원본=theme-card(theme-prev+name+desc+chk). → 우리 set-theme-opt 유지하되 5탭 nav 안으로.
- **Shell**: set-overlay>set-modal>set-modal-head(smh-title 설정+smh-close)+set-body(set-nav[nh+nav-item]·set-main.scroll>set-inner). 우리는 기존 Modal.tsx 래퍼 유지 가능.

## 적응 (우리 토큰/구조)
- 기존 `Modal.tsx`(backdrop blur) 래퍼 유지. 내부를 set-layout(set-nav 5 + set-body 뷰) 구조로.
- **데이터=정적 샘플**(`lib/settingsSampleData.ts`): 버전 목록(현재+최신+설치됨 몇 개), MCP 서버 2~3(전역/로컬·STDIO/HTTP), 스킬 2~3, LSP 4(ts/py 내장, cs/cpp 다운로드). 토글=로컬 state(시각). **새 IPC 0, window.api.engine/mcp/skill/lsp 호출 금지.**
- 색은 토큰만. 벡터 아이콘(IconServer/IconBook/IconCode/IconRefresh/IconTrash 필요 시 추가).

## Phase 분해 (3)
| NN | Phase | 도메인 | 깃발 | 의존 |
|---|---|---|---|---|
| 01 | settings-5tab-version | renderer | 없음 | F6 |
| 02 | settings-mcp-skill-lsp | renderer | 없음 | 01 |
| 03 | f7-visual | qa | 없음 | 02 |

## 실행/검증
renderer + TDD + reviewer + 시각검증(5탭 전환 + 각 탭 스크린샷 양 테마). 완료 시 REPLICA_GAP F7 ✅ + Iteration 로그.
