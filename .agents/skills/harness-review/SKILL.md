---
name: harness-review
description: 사용자가 AgentDeck의 Claude+Codex Harness 자체를 명시적으로 감사하거나 정합성을 점검해 달라고 할 때만 사용한다.
---

# AgentDeck harness-review bridge

1. `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, `.claude/hooks/`의 훅 전부, `.claude/commands/gate.md`, `98_Management/00_ADR/ADR-001-부트스트랩-이식-결정.md`를 읽습니다.
2. Claude 정본과 Codex 어댑터를 나란히 비교하되 자동으로 한쪽을 다른 쪽으로 덮어쓰지 않습니다. Codex 어댑터는 M01 Phase 4 이후에 실물화되므로, 그 전에는 정본만 감사하고 어댑터 부재를 finding으로 보고합니다.
3. hooks payload, 역할 수, 권한 경계, skill bridge, runtime state 분리, 공식 Codex config 규약을 점검합니다.
4. 기본 동작은 읽기 전용 감사입니다. 사용자가 수정까지 명시한 경우에만 루트 세션이 하네스를 직접 편집합니다.
5. finding은 심각도, 증거 파일, Claude 영향, Codex 영향, 권고 순서로 보고합니다.
