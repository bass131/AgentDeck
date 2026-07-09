---
name: work-plan
description: 큰 목표나 새 마일스톤을 AgentDeck의 학습 가능한 Phase로 분해하고 work-pin을 시드할 때 사용한다. 작은 단일 파일 작업에는 사용하지 않는다.
---

# AgentDeck work-plan bridge

1. `AGENTS.md`와 `CLAUDE.md`를 읽습니다.
2. 정본 `.claude/skills/work-plan/SKILL.md`를 처음부터 끝까지 읽습니다.
3. 정본의 `$ARGUMENTS`는 현재 사용자의 목표와 대화 컨텍스트로 해석합니다.
4. Claude 전용 도구 이름은 현재 Codex 도구와 custom agent로 바꾸되 Phase 분해, 위험 등급, plan-auditor, 완료 조건은 그대로 지킵니다.
5. Codex work-pin은 `.codex/state/current-pin.txt`에 기록합니다. `.claude/state/current-pin.txt`를 덮어쓰지 않습니다.
6. `.claude/skills/**` 정본 자체는 편집하지 않습니다.

계획 생성은 `secretary`, 계획 검증은 `plan-auditor`에 위임하고, 루트 세션은 범위와 사용자 판단을 담당합니다.
