# Phase 02: settings-mcp-skill-lsp

## 목표
설정 모달 **MCP·Skill·Code(LSP)** 3개 탭 시각 구현. scope 탭 + 토글 스위치 + ext-list + FileBadge. 정적 샘플.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F7-01.

## 위험 깃발
없음 (renderer. 새 IPC 0. window.api.mcp/skill/lsp 호출 금지 — 정적).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/lib/settingsSampleData.ts` — MCP_SERVERS(2~3: {name,scope global|local,transport STDIO|HTTP|SSE,detail,enabled}), SKILLS(2~3: {name,scope,description,enabled}), LSP_SERVERS(4: ts/py state 'bundled', cs state 'download'+requires '.NET SDK 필요', cpp 'download') 정적 배열.
- `src/renderer/src/components/SettingsModal.tsx` — McpView·SkillView·LspView 구현(01의 placeholder 교체). 공통 `ScopeTabs`(전체/전역/로컬+카운트+새로고침) + `ToggleSwitch`(role=switch, aria-checked, knob; 클릭=로컬 state 토글, 시각). ext-item 행(ext-main: ext-top[ext-name+scope-badge+ver-chip]·ext-desc) + skill-toggle. LSP=FileBadge(a.ts/a.py/a.cs/a.cpp)+ver-chip(앱내장/설치됨/요구사항)+inst-btn(설치/삭제, 시각). 각 탭 set-empty(빈 scope) + set-note.
- `src/renderer/src/components/SettingsModal.css` — skill-tabs/skill-tab/skill-tab-n/skill-refresh · ext-list/ext-item(.off)/ext-main/ext-top/ext-name/ext-desc/ext-cmd · scope-badge(global/local) · ver-chip(latest) · skill-toggle(.on)/skill-knob · inst-btn(.ghost) · set-empty. 색 토큰.

## 작업 단계
1. 샘플 데이터 확장(MCP/Skill/LSP).
2. ScopeTabs + ToggleSwitch 공통 컴포넌트(SettingsModal 내부 or 같은 파일). 토글=로컬 state(optimistic 시각, 실 setEnabled X).
3. McpView/SkillView: scope 탭 + ext-list + 토글 + set-note. 빈 scope set-empty.
4. LspView: ext-list + FileBadge + ver-chip + inst-btn(설치/삭제 시각, 진행 카드는 생략 가능 또는 간단) + set-note.
5. window.api.mcp/skill/lsp 미사용(grep 0). 인라인 색 0, 벡터 아이콘.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 테스트: MCP 탭=scope 탭 3 + 서버 행 + 토글(클릭 시 aria-checked 반전). Skill 탭=스킬 행+토글. Code 탭=LSP 행+FileBadge+ver-chip+설치/삭제 버튼. PASS.
- [ ] scope grep: `window.api.mcp`/`skill`/`lsp` 호출 0(정적).
- [ ] `npm run test`·`test:e2e` 회귀 0.

## 참조
원본 Settings.tsx McpView(L484~586)·SkillView(L380~482)·LspView(L603~803) · LSP_BADGE map · REPLICA_GAP F7.
