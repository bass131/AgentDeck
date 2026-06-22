# Phase 02: prompt-folderswitch

## 목표
**PromptModal**(프롬프트 설정, 4000자 카운터) + **FolderSwitchDialog**(폴더 변경 확인) 시각 1:1. 자기완결 트리거.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F11-01.

## 위험 깃발
없음 (renderer. 새 IPC 0. 프롬프트 저장·실 폴더전환=M4. 시각/로컬).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/PromptModal.tsx`+CSS(신규) — IconSpark + "프롬프트 설정" + 대상/범위 + textarea(maxLength 4000 + 문자 카운터 "N/4000") + 비우기/취소/저장. Enter·Ctrl+Enter 저장, Shift+Enter 줄바꿈, Esc 닫기. Modal/set-dialog 패턴 재사용. 저장=로컬 콜백(시각, 실 저장=M4).
- `src/renderer/src/components/FolderSwitchDialog.tsx`+CSS(신규 또는 set-dialog 재사용) — 폴더 아이콘 + "작업 폴더를 변경할까요?" + 단일/멀티 메시지 + 취소/변경(danger). 백드롭·Esc 취소. **라이브 트리거 없음 — 단위 전용**(실 reopen 흐름 `FileExplorer.openWorkspace` 무변경, 실 확인=M4).
- `src/renderer/src/components/Sidebar.tsx` — 세션 ctx-menu "프롬프트 설정"(F8 no-op) → **Sidebar 내부 로컬 PromptModal open state**(rename/삭제 다이얼로그 선례처럼). **Sidebar props 시그니처·Shell 무변경**(F8 동결 계약 보존).

## 작업 단계
1. PromptModal(카운터 4000) + FolderSwitchDialog.
2. Sidebar ctx-menu "프롬프트 설정" → 내부 로컬 PromptModal open(props 무변경).
3. CSS. 인라인 색 0.
4. 단위 테스트.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 테스트: 사이드바 세션 more → 프롬프트 설정 → PromptModal 열림 · textarea 입력 → 카운터 "N/4000" · 비우기/Esc/취소 닫기 · 저장 콜백. FolderSwitchDialog 렌더(open) → 취소/변경 버튼. PASS.
- [ ] **Sidebar props 무변경**(git diff 시그니처) · sidebar-sessions/shell-chrome 회귀 0.
- [ ] scope grep: window.api prompt/folder 실 호출 0.
- [ ] `npm run test`·`test:e2e` 회귀 0.

## 참조
원본 PromptModal.tsx·FolderSwitchDialog.tsx · 기존 Sidebar 다이얼로그(F8) · REPLICA_GAP F11.
