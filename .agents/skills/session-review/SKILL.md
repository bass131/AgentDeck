---
name: session-review
description: AgentDeck 세션 도중 현재 변경, Phase 좌표, 위험 깃발, 검증 상태를 중간 점검할 때 사용한다.
---

# AgentDeck session-review bridge

`AGENTS.md`, `CLAUDE.md`, `.claude/commands/session/review.md`를 전부 읽고 정본의 중간 점검 절차를 실행합니다.

`.codex/state/current-pin.txt`, 현재 Worktree의 Git diff와 status만 기준으로 하며, Claude runtime state는 읽거나 변경하지 않습니다. 점검은 상태 보고이며 사용자가 요청하지 않은 코드 수정이나 비가역 작업으로 확장하지 않습니다.
