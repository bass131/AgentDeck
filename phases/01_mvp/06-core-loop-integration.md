# Phase 06: core-loop-integration

## 목표
모든 조각을 연결해 **핵심 루프**가 실제로 돈다: 폴더 열기 → 대화 입력 → ClaudeCodeBackend 실행(스트리밍 표시) → 파일변경 감지(탐색기 인디케이터) → diff 표시 → 대화 영속화 → 재시작 복구.

## 담당 도메인 / 에이전트
통합(coordinator 조율) + qa(e2e). 등급: 대규모 → plan-auditor 사전 + reviewer 통합.

## 의존 Phase
03, 04, 05.

## 위험 깃발
**backend-contract** (전 경로 통합) → reviewer 무조건. e2e 회귀 안전망 필수.

## 변경 대상
- 연결/배선만 — 각 도메인 경계 안. (구현 변경 필요 시 해당 Worker로 위임)
- `tests/e2e/core-loop.spec.ts` (Playwright, 목 백엔드 또는 echo 어댑터)
- `tests/agents/`·`tests/main/` 정합 보강

## 작업 단계
1. 폴더 열기(`workspace.open`) → 탐색기 트리 표시 확인.
2. 대화 입력 → `agent.run`(ClaudeCodeBackend) → `agent.event` 스트리밍이 Conversation에 렌더.
3. 에이전트 `file_changed` → 탐색기 인디케이터 + `fs.diff` → DiffViewer 표시.
4. 대화 `conversation.save` → 앱 재시작 → `conversation.load`로 복구.
5. **경계 코드 정합 점검**(coordinator): renderer 호출 채널 == shared 계약 == main 구현 == preload 노출 == agent-backend 이벤트.
6. e2e: 목/echo 백엔드로 핵심 루프 1회 통과(결정론).

## 완료조건 (AC) — PRD "성공 기준" 정합
- [ ] `npm run dev`에서 폴더 열기 → 대화 → 스트리밍 응답이 보인다.
- [ ] 에이전트 파일 수정 시 탐색기 인디케이터 + DiffViewer에 변경 표시.
- [ ] 앱 재시작 후 직전 대화 복구.
- [ ] e2e 핵심 루프 PASS · `npm run typecheck`/`test` green.
- [ ] reviewer 통합 점검 위반 0 (IPC 4면 정합 포함).

## 이월 개선 (reviewer 🟡 — Phase 02·03에서 비차단으로 넘어온 것)
- [Phase03/축7·qa] `ClaudeCodeBackend`의 stdout **줄 분할/버퍼링** + NDJSON 파싱실패 무시 + exit code≠0 → error+done 경로 단위 테스트 추가. (줄 분할 로직을 순수 함수로 추출해 mock 없이 검증 권고)
- [Phase03/축1·main-process] `agent.run` prompt **빈 문자열 조기 차단** + Windows `taskkill` fire-and-forget 강건화(실패 무시 방지). Phase04 shell=true 탐지 개선과 동반.
- [Phase03/축2·Track2] `AgentEvent`에 optional `raw?` 패스스루 — ADR-003/004 명시. Track 1 미필요, **Track 2(서브에이전트 카드 메타)에서 추가** 시 shared-ipc+agent-backend 정합(backend-contract).

## 참조
docs/PRD.md(성공 기준) · docs/ARCHITECTURE.md(데이터흐름) · CLAUDE.md(전 CRITICAL) · `.claude/agents/coordinator.md`(통합 검증).
