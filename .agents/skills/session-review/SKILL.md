---
name: session-review
description: AgentDeck 구현과 분리해 최근 변경을 깊은 학습·점검하는 pull session을 시작할 때 사용한다.
---

# AgentDeck session-review — 깊은 학습 pull session bridge

`AGENTS.md`, `CLAUDE.md`, `.claude/commands/session/review.md`를 전부 읽고 정본의 학습용 pull session 절차를 실행합니다.

현재 Worktree의 `git status -sb`만 가볍게 확인하고, 최근 CHANGELOG·commit·DONE·Codex work-pin에서 깊게 볼 후보를 제안합니다. 사용자가 항목을 고르면 실제 `file:line`을 먼저 확인한 뒤 어떻게·왜·대안·트레이드오프를 멘토링합니다. Claude runtime state는 읽거나 변경하지 않으며, 코드 수정이 필요해지면 `$session-start` 작업 흐름으로 전환합니다.
