---
name: agentdeck-review
description: AgentDeck 코드 변경을 프로젝트 헌법, 신뢰 경계, 엔진 추상화, IPC 계약, ADR와 TDD 기준으로 리뷰할 때 사용한다.
---

# AgentDeck project review bridge

1. `AGENTS.md`, `CLAUDE.md`, `.claude/commands/review.md`, `.claude/agents/reviewer.md`를 전부 읽습니다.
2. `reviewer` custom agent에 현재 diff 범위, 등급, 위험 깃발, 관련 문서를 명시해 읽기 전용 점검을 위임합니다.
3. finding을 심각도순으로 제시하고 파일·줄·실제 영향·담당 Worker를 포함합니다.
4. 리뷰 요청은 수정 권한을 포함하지 않습니다. 사용자가 고치라고 요청한 finding만 해당 Worker에 별도로 위임합니다.
5. 문제가 없으면 검토 범위와 남은 테스트 또는 육안 검증 공백을 명시합니다.
