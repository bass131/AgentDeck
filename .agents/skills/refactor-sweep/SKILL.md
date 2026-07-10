---
name: refactor-sweep
description: 사용자가 AgentDeck의 범위가 정해진 attended 자동 리팩터링 스윕을 명시적으로 요청할 때 사용한다. 일반 기능 구현이나 UI 취향 변경에는 자동 사용하지 않는다.
---

# AgentDeck refactor-sweep bridge

`AGENTS.md`, `CLAUDE.md`, `.claude/commands/refactor-sweep.md`를 전부 읽고 정본 절차를 따릅니다.

- Claude subagent 호출은 대응 Codex custom agent로 바꿉니다.
- 동작 불변과 기계 gate가 있는 항목만 자율 처리합니다.
- 사용자가 세션을 감독하는 attended 실행만 허용하며 예약·백그라운드 무인 배치로 확장하지 않습니다.
- UI 취향, 신뢰 경계, 계약 변경, push/PR/merge/배포는 sweep에서 제외하고 사람 gate로 보냅니다.
- work-pin은 `.codex/state/current-pin.txt`에 기록합니다.
- `.claude/commands/refactor-sweep.md`는 편집하지 않습니다.
