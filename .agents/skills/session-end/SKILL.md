---
name: session-end
description: AgentDeck 세션을 안전하게 마감하며 검증, work-pin, DONE 보고와 commit 필요 여부를 점검할 때 사용한다.
---

# AgentDeck session-end bridge

`AGENTS.md`, `CLAUDE.md`, `.claude/commands/session/end.md`를 전부 읽고 정본 절차를 실행합니다.

- Codex work-pin은 `.codex/state/current-pin.txt`에 저장합니다.
- gate 실행, 명시 파일 staging/commit, Phase 보고 잡무는 `secretary`에 위임합니다.
- push, PR, merge, 배포는 사용자의 명시적 GO 없이는 실행하지 않습니다.
- Claude 전용 memory/command 표현은 현재 Codex thread의 재개 가능한 요약으로 바꿉니다.
- 기존 `.claude/**` 정본은 편집하지 않습니다.
