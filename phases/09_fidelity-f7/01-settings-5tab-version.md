# Phase 01: settings-5tab-version

## 목표
설정 모달 nav를 2탭→**5탭**(Claude Code·MCP·Skill·Code·Theme)으로 재구성 + **Claude Code(엔진 버전) 탭** 시각 + Theme 탭(기존 F6 셀렉터)을 5탭 안으로 이동. 정적 데이터.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F6(완료).

## 위험 깃발
없음 (renderer. 새 IPC 0. window.api.engine 호출 금지 — 정적 샘플).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/icons.tsx` — IconServer·IconBook·IconCode·IconRefresh·IconTrash 추가(벡터, currentColor).
- `src/renderer/src/lib/settingsSampleData.ts` (신규) — 정적 샘플: 엔진 버전 목록(현재 1 + 최신 + 설치됨 몇 + 미설치 몇, {version,latest?,installed?}), 추후 MCP/Skill/LSP도 여기에(02에서 확장). **새 IPC/window.api 호출 0.**
- `src/renderer/src/components/SettingsModal.tsx` — nav 5탭(version/mcp/skill/lsp/appearance, 아이콘+라벨). view state 5종. version·appearance 뷰 구현, mcp/skill/lsp는 02에서(임시 빈 pane 또는 "곧" placeholder OK). 기존 info탭 내용(버전 0.1.0/엔진)은 version 탭 하단 or 제거.
- `src/renderer/src/components/SettingsModal.css` — set-h1/set-h1-sub·sec·card·ver-row(ver-ic/ver-main/ver-name/ver-meta)·vpick(vpick-btn/menu/head/list/opt + vtag latest/cur/inst + vpo-act/del)·set-note 스타일. 색 토큰.

## 작업 단계
1. 아이콘 5개 추가.
2. settingsSampleData.ts: ENGINE_VERSIONS 정적 배열(예: 현재 '1.0.120', 최신 '1.0.124', 설치됨 2개, 목록 6~8개).
3. SettingsModal nav 5탭 + view 분기. VersionView: set-h1 "Claude Code" + 현재 엔진 카드 + vpick 드롭다운(click-outside 닫기, 버전 행 vtag/액션/삭제) + set-note(~/.agentdeck/engines). **드롭다운은 시각 — 선택 시 로컬 current state만 바뀜(실설치 X).**
4. AppearanceView: 기존 set-theme-opt 셀렉터를 이 뷰로 이동(setTheme 동작 유지). nav 'appearance' 탭=Theme.
5. 인라인 색 0, 벡터 아이콘. window.api.engine 미사용(grep 0).

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] SettingsModal 테스트: nav 5탭 렌더(Claude Code/MCP/Skill/Code/Theme). version 탭=현재 엔진 카드+vpick(클릭 시 메뉴 열림). Theme 탭=다크/라이트 토글 여전히 동작(data-theme 전환). PASS.
- [ ] scope grep: `window.api.engine`/`window.api.mcp` 등 설정 IPC 호출 0(정적).
- [ ] **회귀 가드(필수)**: Theme 탭 nav 라벨은 **한글 '테마' 유지**(기존 `getByRole name:'테마'` 단위 5 + e2e 2건 계약 보존). 기존 `.set-nav`/`.set-nav-item` 클래스 보존(원본 `nav-item` 표기는 참조용). 라벨/클래스 변경 시 해당 테스트 동반 갱신.
- [ ] `npm run test`·`test:e2e` 회귀 0.

## 참조
원본 Settings.tsx VersionView(L195~372)·AppearanceView(L815~848)·SettingsModal(L850~) · REPLICA_GAP F7 · docs/UI_FIDELITY §F5.
