---
name: session-start
description: AgentDeck 작업 세션을 시작하며 현재 Phase, work-pin, Git 상태와 필요한 문서를 복원할 때 사용한다.
---

# AgentDeck session-start bridge

`AGENTS.md`, `CLAUDE.md`, `.claude/commands/session/start.md`를 전부 읽고 정본 절차를 실행합니다.

- work-pin 쓰기 경로만 `.codex/state/current-pin.txt`로 바꿉니다.
- Claude memory나 Claude 전용 slash command는 Codex의 현재 thread, skill, custom agent 기능으로 의미를 보존합니다.
- 기존 `.claude/state/**`와 `.claude/commands/**`는 편집하지 않습니다.
- 복원 결과에는 현재 브랜치/Worktree, dirty 파일, 활성 Phase, 다음 기계 판정 작업을 포함합니다.
