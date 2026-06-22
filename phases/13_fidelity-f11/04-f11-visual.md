# Phase 04: f11-visual

## 목표
GitModal·PromptModal·AskModal e2e + 스크린샷으로 F11 시각 1:1 검증.

## 담당 도메인 / 에이전트
qa (tests/). 등급: 보통.

## 의존 Phase
F11-03.

## 위험 깃발
없음 (테스트만).

## 변경 대상 (이 경계 밖 금지)
- `tests/e2e/shell.e2e.ts`(또는 visual-viewer) — GitModal: 탐색기 git 버튼 → `.gitm-overlay` 표시 + 모든 커밋 탭 → 커밋 rows + 스샷 + 변경 사항 탭 컴포저 스샷 + Esc. PromptModal: 사이드바 세션 ctx-menu 프롬프트 설정 → PromptModal + 카운터 + 스샷 + Esc. AskModal: 컴포저 /ask → AskModal orb 헤더 + 스샷 + Esc. (FolderSwitch=단위 전담, e2e 비대상.) 상태 정리(모달 닫힘·후속 비오염).

## 작업 단계
1. git 버튼 → `.gitm-overlay` + diff-head(repo) + 모든 커밋 → 커밋 rows + 스샷(gitmodal-history.png) + 변경 사항 → 컴포저 스샷(gitmodal-changes.png) + Esc.
2. 사이드바 세션 more → 프롬프트 설정 → PromptModal + 카운터 + 스샷(prompt-modal.png) + Esc.
3. 컴포저 textarea '/ask' 선택 → AskModal orb 헤더 + 스샷(ask-modal.png) + Esc.
4. 상태 정리(모든 모달 닫힘).

## 완료조건 (AC — 측정 가능)
- [ ] `npm run test:e2e` 전체 PASS(회귀 0 + F11 모달 e2e).
- [ ] GitModal·PromptModal·AskModal 스크린샷 생성 — 원본 대조.
- [ ] **FolderSwitchDialog = 단위(F11-02) 전담**(라이브 트리거 없음, e2e 비대상). 약속-구현 간극 없음.
- [ ] 전체 게이트 green: typecheck·test·test:e2e·lint.

## 참조
원본 GitModal/PromptModal/AskModal · REPLICA_GAP F11 · 기존 shell.e2e 모달 패턴.
