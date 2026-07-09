---
name: work-run
description: 이미 정의된 AgentDeck Phase 중 미착수 또는 진행 중인 작업을 loop-driven 방식으로 실행할 때 사용한다. Phase 정의가 없으면 먼저 work-plan을 사용한다.
---

# AgentDeck work-run bridge

1. `AGENTS.md`와 `CLAUDE.md`를 읽습니다.
2. 정본 `.claude/skills/work-run/SKILL.md`를 처음부터 끝까지 읽습니다.
3. 정본의 `$ARGUMENTS`는 현재 사용자가 지정한 Phase 또는 목표로 해석합니다.
4. Claude Task 호출은 `.codex/agents/*.toml` custom agent 위임으로 바꿉니다. Worker의 책임 범위와 5항목 위임 계약은 유지합니다.
5. Codex work-pin은 `.codex/state/current-pin.txt`에서 읽고 갱신합니다. 없을 때만 Claude pin을 읽기 폴백으로 사용합니다.
6. 기계 gate는 자율 진행하고, UI 육안과 비가역·설계 판단은 `AGENTS.md`의 사람 gate에서 멈춥니다.
7. `.claude/skills/**` 정본 자체는 편집하지 않습니다.
